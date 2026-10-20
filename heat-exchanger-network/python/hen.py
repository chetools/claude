"""Heat exchanger network (HEN) synthesis: the readable Python reference.

What is in here, in the order the page uses it:

  1. Costs.     Exchanger capital cost laws (benchmark power law, Seider et al.
                with material factors, Turton/CAPCOST) and bottom-up utility
                prices.
  2. Problem.   Streams, utilities, forbidden matches and materials are
                "compiled" into flat arrays the solvers use (same layout as
                the Rust solver).
  3. Targets.   Problem table (heat cascade) and the LP transshipment model
                for the minimum utility cost, with forbidden matches.
  4. Matches.   MILP: minimum (weighted) number of matches.
  5. Network.   Stage-wise superstructure (Yee & Grossmann 1990, isothermal
                mixing): temperatures, areas and TAC of a given topology and
                heat loads, with the exact gradient (adjoint).
  6. Loads.     NLP: optimal heat loads of a fixed topology (log-barrier +
                L-BFGS).
  7. Topology.  Simulated annealing over the matches (and utility choice),
                with the NLP inside.

The Rust solver (solver/src/lib.rs) implements sections 2, 5, 6 and 7 with
the same function names and the same order of operations.
"""
import math

# =========================================================================
# 1. Costs
# =========================================================================

M2_TO_FT2 = 10.7639104

# Seider et al., Product and Process Design Principles (4th ed.), Eq. 16.44:
# F_M = a + (A/100 ft2)^b, by shell/tube material.  Coefficients as in
# BioSTEAM (units/design_tools/specification_factors.py).
SEIDER_FM = {
    ("CS", "CS"): (0.0, 0.0),
    ("CS", "brass"): (1.08, 0.05),
    ("CS", "SS"): (1.75, 0.13),
    ("CS", "Monel"): (2.1, 0.13),
    ("CS", "Ti"): (5.2, 0.16),
    ("CS", "CrMo"): (1.55, 0.05),
    ("CrMo", "CrMo"): (1.7, 0.07),
    ("SS", "SS"): (2.7, 0.07),
    ("Monel", "Monel"): (3.3, 0.08),
    ("Ti", "Ti"): (9.6, 0.06),
}
# Seider purchase cost of the base exchanger (carbon steel), A in ft2,
# C_B = exp(c0 + c1 ln A + c2 ln^2 A) at CE = 567 (as in BioSTEAM).
SEIDER_CB = {
    "floating head": (12.0310, -0.8709, 0.09005),
    "fixed head": (11.4185, -0.9228, 0.09861),
    "U tube": (11.5510, -0.9186, 0.09790),
}
SEIDER_CE = 567.0
SEIDER_LENGTH_FACTOR = {8: 1.25, 12: 1.12, 16: 1.05, 20: 1.00}   # tube length [ft]

# Turton et al. (CAPCOST), floating-head shell and tube, A in m2 (10-1000),
# log10 Cp0 = K1 + K2 log10 A + K3 log10^2 A at CEPCI = 397; bare module
# C_BM = Cp0 (B1 + B2 F_M F_P).  Same-material F_M only (see theory).
TURTON_K = (4.8306, -0.8509, 0.3187)
TURTON_B = (1.63, 1.66)
TURTON_C = (0.03881, -0.11272, 0.08183)       # pressure factor, 5-140 barg
TURTON_FM = {"CS": 1.00, "SS": 2.73, "Monel": 3.73, "Ti": 11.4}
TURTON_CE = 397.0

MATERIALS = ["CS", "brass", "CrMo", "SS", "Monel", "Ti"]

# Cost-law kinds (same integers in Rust)
LAW_POWER, LAW_SEIDER, LAW_TURTON = 0, 1, 2


def seider_pressure_factor(p_psig):
    """F_P = 0.9803 + 0.018 (P/100) + 0.0017 (P/100)^2, P in psig."""
    x = p_psig / 100.0
    return 0.9803 + 0.018 * x + 0.0017 * x * x


def turton_pressure_factor(p_barg):
    """log10 F_P = C1 + C2 log10 P + C3 log10^2 P (P in barg; 1 below 5 barg)."""
    if p_barg < 5.0:
        return 1.0
    y = math.log10(p_barg)
    c1, c2, c3 = TURTON_C
    return 10.0 ** (c1 + c2 * y + c3 * y * y)


def unit_cost(kind, p, A):
    """Annualised capital cost [$/yr] of one exchanger of area A [m2] and
    its derivative dC/dA.  p is the 8-number parameter vector of the law:

      power : p = [cf, cv, beta, mult]           C = mult (cf + cv A^beta)
      seider: p = [c0, c1, c2, scale, F_BM, F_LP, a, b]
              A' = max(A ft2, 150)  C = scale C_B(A') (F_BM + F_LP F_M(A') - 1)
      turton: p = [K1, K2, K3, scale, B1, B2FMFP, Amin, 0]
              A' = max(A, Amin)     C = scale Cp0(A') (B1 + B2FMFP)
    'scale' holds annualisation factor x CEPCI ratio x penalty factor.
    """
    if kind == LAW_POWER:
        cf, cv, beta, mult = p[0], p[1], p[2], p[3]
        if A <= 0.0:
            return mult * cf, 0.0
        return mult * (cf + cv * A ** beta), mult * cv * beta * A ** (beta - 1.0)
    if kind == LAW_SEIDER:
        c0, c1, c2, scale, fbm, flp, a, b = p
        Af = A * M2_TO_FT2
        clamp = Af < 150.0
        if clamp:
            Af = 150.0
        L = math.log(Af)
        cb = math.exp(c0 + c1 * L + c2 * L * L)
        fm = a + (Af / 100.0) ** b
        C = scale * cb * (fbm + flp * fm - 1.0)
        if clamp:
            return C, 0.0
        dcb = cb * (c1 + 2.0 * c2 * L) / Af
        dfm = b * (Af / 100.0) ** (b - 1.0) / 100.0 if b != 0.0 else 0.0
        dC = scale * (dcb * (fbm + flp * fm - 1.0) + cb * flp * dfm)
        return C, dC * M2_TO_FT2
    if kind == LAW_TURTON:
        k1, k2, k3, scale, b1, bfp, amin = p[0], p[1], p[2], p[3], p[4], p[5], p[6]
        clamp = A < amin
        Am = amin if clamp else A
        x = math.log10(Am)
        cp = 10.0 ** (k1 + k2 * x + k3 * x * x)
        C = scale * cp * (b1 + bfp)
        if clamp:
            return C, 0.0
        return C, scale * (b1 + bfp) * cp * (k2 + 2.0 * k3 * x) / Am
    raise ValueError(f"unknown cost law {kind}")


def capital_recovery_factor(i, n):
    """Annualisation factor i(1+i)^n / ((1+i)^n - 1)  [1/yr]."""
    if i == 0:
        return 1.0 / n
    g = (1.0 + i) ** n
    return i * g / (g - 1.0)


def material_pairs(acc_a, acc_b, law_kind):
    """Shell/tube pairs that both fluids tolerate.  Both fluids touch the
    tubes, so the tube material must suit both; the shell only touches the
    shell-side fluid, so it must suit at least one of them (that one goes on
    the shell side)."""
    pairs = []
    for (shell, tube) in SEIDER_FM:
        if tube in acc_a and tube in acc_b and (shell in acc_a or shell in acc_b):
            if law_kind == LAW_TURTON and (shell not in TURTON_FM or tube not in TURTON_FM):
                continue
            pairs.append((shell, tube))
    return pairs


def law_params(law, pair, mult):
    """(kind, 8 parameters) for one exchanger made of shell/tube pair."""
    kind = law["kind"]
    if kind == "power":
        return LAW_POWER, [law["cf"], law["cv"], law["beta"], mult, 0, 0, 0, 0]
    if kind == "seider":
        c0, c1, c2 = SEIDER_CB[law.get("type", "floating head")]
        a, b = SEIDER_FM[pair]
        flp = SEIDER_LENGTH_FACTOR[law.get("tube_ft", 20)] * seider_pressure_factor(law.get("p_psig", 0.0))
        scale = law["annual"] * law["cepci"] / SEIDER_CE * mult
        return LAW_SEIDER, [c0, c1, c2, scale, law.get("fbm", 3.17), flp, a, b]
    if kind == "turton":
        k1, k2, k3 = TURTON_K
        b1, b2 = TURTON_B
        fm = TURTON_FM[pair[1]]          # all-alloy factor of the tube material
        bfp = b2 * fm * turton_pressure_factor(law.get("p_barg", 0.0))
        scale = law["annual"] * law["cepci"] / TURTON_CE * mult
        return LAW_TURTON, [k1, k2, k3, scale, b1, bfp, 10.0, 0]
    raise ValueError(kind)


def cheapest_pair(law, pairs, mult, A_ref=100.0):
    """The material pair with the lowest cost at a reference area."""
    best = None
    for pr in pairs:
        kind, p = law_params(law, pr, mult)
        c = unit_cost(kind, p, A_ref)[0]
        if best is None or c < best[0]:
            best = (c, pr)
    return best[1] if best else None


# ---------------------------------------------------------------- utilities
# Saturated water/steam, IAPWS-IF97 (iapws package): T [C], h_f, h_g [kJ/kg]
STEAM_TABLE = [
    (100, 419.10, 2675.57), (110, 461.36, 2691.07), (120, 503.78, 2705.93),
    (130, 546.39, 2720.09), (140, 589.20, 2733.44), (150, 632.25, 2745.92),
    (160, 675.57, 2757.43), (170, 719.21, 2767.89), (180, 763.19, 2777.22),
    (190, 807.57, 2785.31), (200, 852.39, 2792.06), (210, 897.73, 2797.35),
    (220, 943.64, 2801.05), (230, 990.21, 2803.01), (240, 1037.52, 2803.06),
    (250, 1085.69, 2801.01), (260, 1134.83, 2796.64), (270, 1185.09, 2789.69),
    (280, 1236.67, 2779.82), (290, 1289.80, 2766.63), (300, 1344.77, 2749.57),
    (310, 1402.00, 2727.92), (320, 1462.05, 2700.67), (330, 1525.74, 2666.25),
    (340, 1594.45, 2622.07), (350, 1670.86, 2563.59), (360, 1761.49, 2480.99),
]
H_FEEDWATER = 440.21          # saturated liquid at 105 C (deaerator), kJ/kg
MMBTU_GJ = 1.055056           # 1 MMBtu = 1.055056 GJ


def steam_props(T):
    """(h_f, h_g) of saturated water at T [C], linear interpolation."""
    tab = STEAM_TABLE
    if not tab[0][0] <= T <= tab[-1][0]:
        raise ValueError(f"steam table covers {tab[0][0]}-{tab[-1][0]} C, got {T}")
    for (t0, f0, g0), (t1, f1, g1) in zip(tab, tab[1:]):
        if T <= t1:
            w = (T - t0) / (t1 - t0)
            return f0 + w * (f1 - f0), g0 + w * (g1 - g0)


def utility_price(kind, T_in, T_out, pr):
    """Bottom-up utility cost [$/(kW yr)] from energy prices.

    pr: dict with hours [h/yr], fuel [$/MMBtu], elec [$/kWh], co2 [$/t],
        ef_gas [kg CO2/MMBtu], ef_elec [kg CO2/kWh], eta_boiler, eta_furnace,
        steam_water [$/t steam], cw_head [m], eta_pump, fan [kW_e per kW],
        cycles, water [$/m3], chem [$/m3 makeup], cop_frac, T_cond [C].
    Returns (price, note)."""
    E_GJ = pr["hours"] * 3600.0 / 1e6           # GJ delivered per kW over a year
    fuel_GJ = (pr["fuel"] + pr["co2"] * pr["ef_gas"] / 1000.0) / MMBTU_GJ   # $/GJ fuel
    elec = pr["elec"] + pr["co2"] * pr["ef_elec"] / 1000.0                 # $/kWh
    if kind == "steam":
        hf, hg = steam_props(T_in)
        fuel_per_heat = (hg - H_FEEDWATER) / (hg - hf) / pr["eta_boiler"]
        kg_per_GJ = 1e6 / (hg - hf)
        c = E_GJ * (fuel_GJ * fuel_per_heat + pr["steam_water"] * kg_per_GJ / 1000.0)
        return c, f"fuel x {fuel_per_heat:.3f} GJ/GJ (boiler + sensible heat) + water"
    if kind == "furnace":
        return E_GJ * fuel_GJ / pr["eta_furnace"], "fuel / furnace efficiency"
    if kind == "cw":
        dT = abs(T_out - T_in)
        m = 1.0 / (4.18 * dT)                                # kg/s water per kW
        pump = m * 9.81 * pr["cw_head"] / pr["eta_pump"] / 1000.0   # kW_e per kW
        evap = 1.0 / 2400.0                                  # kg/s evaporated per kW
        makeup = evap * pr["cycles"] / (pr["cycles"] - 1.0)  # kg/s
        m3 = makeup * pr["hours"] * 3600.0 / 1000.0
        c = (pump + pr["fan"]) * pr["hours"] * elec + m3 * (pr["water"] + pr["chem"])
        return c, "pump + fan power, makeup water and chemicals"
    if kind == "refrig":
        Te = T_in + 273.15 - 5.0                             # evaporator 5 K below
        Tc = pr["T_cond"] + 273.15
        cop = pr["cop_frac"] * Te / (Tc - Te)
        return pr["hours"] * elec / cop, f"electricity / COP (COP = {cop:.2f})"
    if kind == "seawater":
        dT = abs(T_out - T_in)
        m = 1.0 / (4.18 * dT)
        pump = m * 9.81 * pr["cw_head"] / pr["eta_pump"] / 1000.0
        return pump * pr["hours"] * elec, "pump power (once-through)"
    raise ValueError(kind)


DEFAULT_PRICES = dict(
    hours=8000.0,        # assumption
    fuel=3.48,           # $/MMBtu, Henry Hub 2026 forecast, EIA STEO Oct 2026
    elec=0.0903,         # $/kWh, US industrial, Jan-Jul 2026, EIA EPM Table 5.6.B
    co2=0.0,             # $/t CO2 (input)
    ef_gas=52.91,        # kg CO2/MMBtu natural gas, EIA
    ef_elec=0.367,       # kg CO2/kWh, US generation 2023 (0.81 lb/kWh), EIA
    eta_boiler=0.85, eta_furnace=0.85,                 # assumptions
    steam_water=0.5,     # $/t steam for treatment and makeup (assumption)
    cw_head=30.0, eta_pump=0.75, fan=0.0075,           # assumptions
    cycles=5.0, water=0.5, chem=0.1,                   # assumptions
    cop_frac=0.6, T_cond=40.0,                         # assumptions
)

# =========================================================================
# 2. Problem -> compiled model
# =========================================================================


def overall_U(h1, h2):
    """Clean overall coefficient 1/U = 1/h1 + 1/h2  [kW/(m2 K)]."""
    return 1.0 / (1.0 / h1 + 1.0 / h2)


class Model:
    """Flat arrays describing one synthesis problem (same layout as Rust).

    Process match (i, j): allowed[i][j], U_pc[i][j], kind/par_pc[i][j].
    Cooler options of hot stream i: cool[i] = list of dicts (u, U, kind, par,
    Tin, Tout, cost); heater options of cold stream j: heat[j] likewise.
    """

    def __init__(self, prob):
        self.prob = prob
        hot, cold = prob["hot"], prob["cold"]
        self.nH, self.nC = len(hot), len(cold)
        self.K = prob.get("stages") or max(self.nH, self.nC)
        self.emat = prob["emat"]
        self.Th_in = [s["Tin"] for s in hot]
        self.Th_out = [s["Tout"] for s in hot]
        self.Fh = [s["F"] for s in hot]
        self.Tc_in = [s["Tin"] for s in cold]
        self.Tc_out = [s["Tout"] for s in cold]
        self.Fc = [s["F"] for s in cold]
        self.Qh = [self.Fh[i] * (self.Th_in[i] - self.Th_out[i]) for i in range(self.nH)]
        self.Qc = [self.Fc[j] * (self.Tc_out[j] - self.Tc_in[j]) for j in range(self.nC)]
        law = prob["law"]
        forbid = prob.get("forbid") or [[False] * self.nC for _ in range(self.nH)]
        mult = prob.get("mult") or [[1.0] * self.nC for _ in range(self.nH)]
        override = prob.get("material") or {}
        allm = MATERIALS
        acc = lambda s: s.get("mat") or allm

        self.allowed, self.reason = [], []
        self.U_pc, self.kind_pc, self.par_pc, self.pair_pc = [], [], [], []
        for i, hs in enumerate(hot):
            row_ok, row_r, rU, rk, rp, rpair = [], [], [], [], [], []
            for j, cs in enumerate(cold):
                ok, why, pr = True, "", None
                if forbid[i][j]:
                    ok, why = False, "forbidden"
                else:
                    pairs = material_pairs(acc(hs), acc(cs), _law_kind(law))
                    if f"{i},{j}" in override:
                        pr = tuple(override[f"{i},{j}"])
                        if pr not in pairs:
                            ok, why = False, "material not compatible"
                    elif not pairs:
                        ok, why = False, "no common material"
                    else:
                        pr = cheapest_pair(law, pairs, mult[i][j])
                    if ok and not self.Th_in[i] - self.Tc_in[j] > self.emat + 1e-9:
                        ok, why = False, "no driving force"
                row_ok.append(ok)
                row_r.append(why)
                rU.append(overall_U(hs["h"], cs["h"]))
                kind, p = law_params(law, pr or ("CS", "CS"), mult[i][j]) if ok else (0, [0.0] * 8)
                rk.append(kind)
                rp.append(p)
                rpair.append(pr)
            self.allowed.append(row_ok)
            self.reason.append(row_r)
            self.U_pc.append(rU)
            self.kind_pc.append(rk)
            self.par_pc.append(rp)
            self.pair_pc.append(rpair)

        # utilities: statically feasible options per stream
        self.cool, self.heat = [], []
        for i, hs in enumerate(hot):
            opts = []
            for u, cu in enumerate(prob["cu"]):
                if (self.Th_out[i] - cu["Tin"] >= self.emat - 1e-9
                        and self.Th_in[i] - cu["Tout"] > self.emat + 1e-9):
                    pairs = material_pairs(acc(hs), acc(cu), _law_kind(law))
                    if pairs:
                        kind, p = law_params(law, cheapest_pair(law, pairs, 1.0), 1.0)
                        opts.append(dict(u=u, U=overall_U(hs["h"], cu["h"]), kind=kind, par=p,
                                         Tin=cu["Tin"], Tout=cu["Tout"], cost=cu["cost"]))
            self.cool.append(opts)
        for j, cs in enumerate(cold):
            opts = []
            for u, hu in enumerate(prob["hu"]):
                if (hu["Tin"] - self.Tc_out[j] >= self.emat - 1e-9
                        and hu["Tout"] - self.Tc_in[j] > self.emat + 1e-9):
                    pairs = material_pairs(acc(cs), acc(hu), _law_kind(law))
                    if pairs:
                        kind, p = law_params(law, cheapest_pair(law, pairs, 1.0), 1.0)
                        opts.append(dict(u=u, U=overall_U(cs["h"], hu["h"]), kind=kind, par=p,
                                         Tin=hu["Tin"], Tout=hu["Tout"], cost=hu["cost"]))
            self.heat.append(opts)


def _law_kind(law):
    return {"power": LAW_POWER, "seider": LAW_SEIDER, "turton": LAW_TURTON}[law["kind"]]


# =========================================================================
# 3. Targets: problem table and LP transshipment
# =========================================================================


def problem_table(prob):
    """Heat cascade (Linnhoff): minimum hot and cold utility [kW] and the
    pinch (hot-stream temperature), for one hot and one cold utility and no
    forbidden matches.  Shifted scale: cold temperatures + EMAT."""
    dT = prob["emat"]
    edges = set()
    for s in prob["hot"]:
        edges |= {s["Tin"], s["Tout"]}
    for s in prob["cold"]:
        edges |= {s["Tin"] + dT, s["Tout"] + dT}
    b = sorted(edges, reverse=True)
    cascade, flow, lowest, pinch = [0.0], 0.0, 0.0, None
    for hi, lo in zip(b, b[1:]):
        net = 0.0
        for s in prob["hot"]:
            net += s["F"] * max(0.0, min(hi, s["Tin"]) - max(lo, s["Tout"]))
        for s in prob["cold"]:
            net -= s["F"] * max(0.0, min(hi, s["Tout"] + dT) - max(lo, s["Tin"] + dT))
        flow += net
        cascade.append(flow)
    qh = max(0.0, -min(cascade))
    flows = [c + qh for c in cascade]
    for t, f in zip(b, flows):
        if abs(f) < 1e-6 * (1.0 + qh):
            pinch = t
    return dict(QH=qh, QC=flows[-1], pinch=pinch, T=b, cascade=flows)


def intervals(prob):
    """Temperature intervals on the hot scale (cold + EMAT), and the heat each
    stream/utility brings to (hot) or needs in (cold) every interval.

    Returns dict(T=boundaries, H=[[...]] hot process rows, C=..., fHU=[[...]]
    fraction of each hot utility's load per interval, fCU likewise)."""
    dT = prob["emat"]
    edges = set()
    for s in prob["hot"] + prob["hu"]:
        edges |= {s["Tin"], s["Tout"]}
    for s in prob["cold"] + prob["cu"]:
        edges |= {s["Tin"] + dT, s["Tout"] + dT}
    b = sorted(edges, reverse=True)
    n = len(b) - 1

    def share(top, bot, cold):
        """Fraction of a stream spanning [bot, top] in each interval."""
        out = [0.0] * n
        if top - bot < 1e-9:            # isothermal utility: all at one level
            for k in range(n):
                if (not cold and abs(b[k] - top) < 1e-9) or (cold and abs(b[k + 1] - bot) < 1e-9):
                    out[k] = 1.0
                    break
            return out
        for k in range(n):
            out[k] = max(0.0, min(b[k], top) - max(b[k + 1], bot)) / (top - bot)
        return out

    H = [[s["F"] * (s["Tin"] - s["Tout"]) * f for f in share(s["Tin"], s["Tout"], False)] for s in prob["hot"]]
    C = [[s["F"] * (s["Tout"] - s["Tin"]) * f for f in share(s["Tout"] + dT, s["Tin"] + dT, True)] for s in prob["cold"]]
    fHU = [share(max(u["Tin"], u["Tout"]), min(u["Tin"], u["Tout"]), False) for u in prob["hu"]]
    fCU = [share(max(u["Tin"], u["Tout"]) + dT, min(u["Tin"], u["Tout"]) + dT, True) for u in prob["cu"]]
    return dict(T=b, n=n, H=H, C=C, fHU=fHU, fCU=fCU)


def _transship_structure(prob, allowed_pc):
    """Variables and equality rows of the expanded transshipment model.

    Hot side = process hot streams then hot utilities; cold side = process
    cold streams then cold utilities.  Variables: q[(a,b,k)] heat from hot a
    to cold b inside interval k; R[(a,k)] heat hot a carries down from
    interval k to k+1; Q[hu u], Q[cu v] utility loads."""
    iv = intervals(prob)
    nH, nC, n = len(prob["hot"]), len(prob["cold"]), iv["n"]
    nHU, nCU = len(prob["hu"]), len(prob["cu"])
    hot_has = [[iv["H"][a][k] > 1e-12 for k in range(n)] for a in range(nH)] + \
              [[iv["fHU"][u][k] > 1e-12 for k in range(n)] for u in range(nHU)]
    cold_has = [[iv["C"][b][k] > 1e-12 for k in range(n)] for b in range(nC)] + \
               [[iv["fCU"][v][k] > 1e-12 for k in range(n)] for v in range(nCU)]
    # a hot side carries heat down only below where it appears
    first = [next((k for k in range(n) if hot_has[a][k]), n) for a in range(nH + nHU)]

    def pair_ok(a, b):
        if a >= nH and b >= nC:
            return False                        # utility to utility
        if a < nH and b < nC:
            return allowed_pc[a][b]
        return True

    var = {}
    for a in range(nH + nHU):
        for b in range(nC + nCU):
            if pair_ok(a, b):
                for k in range(n):
                    if cold_has[b][k] and k >= first[a]:
                        var[("q", a, b, k)] = len(var)
    for a in range(nH + nHU):
        for k in range(first[a], n - 1):
            var[("R", a, k)] = len(var)
    for u in range(nHU):
        var[("QH", u)] = len(var)
    for v in range(nCU):
        var[("QC", v)] = len(var)

    rows, rhs = [], []      # each row: dict var->coef, = rhs
    for a in range(nH + nHU):
        for k in range(first[a], n):
            r = {}
            if ("R", a, k - 1) in var:
                r[var[("R", a, k - 1)]] = r.get(var[("R", a, k - 1)], 0) - 1.0
            if ("R", a, k) in var:
                r[var[("R", a, k)]] = r.get(var[("R", a, k)], 0) + 1.0
            for b in range(nC + nCU):
                if ("q", a, b, k) in var:
                    r[var[("q", a, b, k)]] = 1.0
            if a < nH:
                rows.append(r)
                rhs.append(iv["H"][a][k])          # out - in = supply
            else:
                r[var[("QH", a - nH)]] = -iv["fHU"][a - nH][k]
                rows.append(r)
                rhs.append(0.0)
    for b in range(nC + nCU):
        for k in range(n):
            if not cold_has[b][k]:
                continue
            r = {}
            for a in range(nH + nHU):
                if ("q", a, b, k) in var:
                    r[var[("q", a, b, k)]] = 1.0
            if b < nC:
                rows.append(r)
                rhs.append(iv["C"][b][k])
            else:
                r[var[("QC", b - nC)]] = -iv["fCU"][b - nC][k]
                rows.append(r)
                rhs.append(0.0)
    return iv, var, rows, rhs, pair_ok


def _dense(rows, nvar):
    import numpy as np
    A = np.zeros((len(rows), nvar))
    for r, row in enumerate(rows):
        for c, v in row.items():
            A[r, c] = v
    return A


def lp_targets(prob, allowed_pc=None):
    """Minimum utility cost by the expanded transshipment LP (Papoulias &
    Grossmann 1983).  Forbidden matches remove their q variables, so any
    energy penalty they cause shows up here.  Solved with HiGHS (scipy)."""
    import numpy as np
    from scipy.optimize import linprog
    if allowed_pc is None:
        allowed_pc = Model(prob).allowed
    iv, var, rows, rhs, _ = _transship_structure(prob, allowed_pc)
    c = np.zeros(len(var))
    for u, h in enumerate(prob["hu"]):
        c[var[("QH", u)]] = h["cost"]
    for v, h in enumerate(prob["cu"]):
        c[var[("QC", v)]] = h["cost"]
    res = linprog(c, A_eq=_dense(rows, len(var)), b_eq=np.array(rhs), bounds=(0, None), method="highs")
    if res.status != 0:
        return dict(ok=False, msg=res.message)
    x = res.x
    QH = [float(x[var[("QH", u)]]) for u in range(len(prob["hu"]))]
    QC = [float(x[var[("QC", v)]]) for v in range(len(prob["cu"]))]
    return dict(ok=True, cost=float(res.fun), QH=QH, QC=QC, intervals=iv)


def milp_matches(prob, QH, QC, weights=None, allowed_pc=None, time_limit=60.0):
    """Minimum (weighted) number of matches: transshipment MILP with the
    utility loads fixed at their LP targets.  y[a,b] = 1 if hot a and cold b
    exchange any heat; sum_k q[a,b,k] <= U_ab y[a,b] with U_ab = min of the
    two total heats.  weights[(a,b)] defaults to 1 (count matches)."""
    import numpy as np
    from scipy.optimize import Bounds, LinearConstraint, milp
    if allowed_pc is None:
        allowed_pc = Model(prob).allowed
    iv, var, rows, rhs, pair_ok = _transship_structure(prob, allowed_pc)
    nH, nC = len(prob["hot"]), len(prob["cold"])
    nHU, nCU = len(prob["hu"]), len(prob["cu"])
    tot_h = [sum(iv["H"][a]) for a in range(nH)] + list(QH)
    tot_c = [sum(iv["C"][b]) for b in range(nC)] + list(QC)
    pairs = sorted({(key[1], key[2]) for key in var if key[0] == "q"})
    y0 = len(var)
    nv = y0 + len(pairs)
    c = np.zeros(nv)
    for p, ab in enumerate(pairs):
        c[y0 + p] = 1.0 if weights is None else weights.get(ab, 1.0)
    A = _dense(rows, nv)
    lo = np.zeros(nv)
    hi = np.full(nv, np.inf)
    hi[y0:] = 1.0
    for u in range(nHU):
        lo[var[("QH", u)]] = hi[var[("QH", u)]] = QH[u]
    for v in range(nCU):
        lo[var[("QC", v)]] = hi[var[("QC", v)]] = QC[v]
    link = np.zeros((len(pairs), nv))
    for p, (a, b) in enumerate(pairs):
        for k in range(iv["n"]):
            if ("q", a, b, k) in var:
                link[p, var[("q", a, b, k)]] = 1.0
        link[p, y0 + p] = -min(tot_h[a], tot_c[b])
    integrality = np.zeros(nv)
    integrality[y0:] = 1
    cons = [LinearConstraint(A, np.array(rhs), np.array(rhs)),
            LinearConstraint(link, -np.inf, 0.0)]
    res = milp(c, constraints=cons, integrality=integrality, bounds=Bounds(lo, hi),
               options=dict(time_limit=time_limit, disp=False))
    if res.x is None:
        return dict(ok=False, msg=res.message)
    x = res.x
    matches = []
    for p, (a, b) in enumerate(pairs):
        if x[y0 + p] > 0.5:
            load = sum(x[var[("q", a, b, k)]] for k in range(iv["n"]) if ("q", a, b, k) in var)
            # heat-weighted mean interval temperature (hot scale), for staging
            tm = sum(x[var[("q", a, b, k)]] * 0.5 * (iv["T"][k] + iv["T"][k + 1])
                     for k in range(iv["n"]) if ("q", a, b, k) in var) / max(load, 1e-12)
            matches.append(dict(hot=a, cold=b, load=float(load), Tmean=float(tm)))
    return dict(ok=True, n=len(matches), objective=float(res.fun), matches=matches,
                optimal=res.status == 0, gap=getattr(res, "mip_gap", None), msg=res.message)


# =========================================================================
# 5. Network: stage-wise superstructure, isothermal mixing
# =========================================================================
#
# A network is dict(matches=[(i, j, k), ...], hu=[...], cu=[...]):
#   (i, j, k): hot i meets cold j in stage k (0 = hot end).
#   hu[j]: index into model.heat[j] (heater option of cold j), -1 = none.
#   cu[i]: index into model.cool[i] (cooler option of hot i), -1 = none.
# Heat loads x are the decision variables (one per match, kW).


def lmtd(a, b):
    """Log-mean temperature difference and its partial derivatives."""
    m = 0.5 * (a + b)
    d = a - b
    if abs(d) < 1e-4 * m:
        L = m - d * d / (12.0 * m)
        return L, 0.5 - d / (6.0 * m) + d * d / (24.0 * m * m), 0.5 + d / (6.0 * m) + d * d / (24.0 * m * m)
    lr = math.log(a / b)
    L = d / lr
    return L, (lr - d / a) / (lr * lr), (d / b - lr) / (lr * lr)


def temperatures(model, net, x):
    """Stage-boundary temperatures.  th[i][k]: hot i entering stage k
    (th[i][K] = outlet of the last stage); tc[j][k]: cold j leaving stage k
    (tc[j][K] = inlet)."""
    K = model.K
    th = [[0.0] * (K + 1) for _ in range(model.nH)]
    tc = [[0.0] * (K + 1) for _ in range(model.nC)]
    dh = [[0.0] * K for _ in range(model.nH)]
    dc = [[0.0] * K for _ in range(model.nC)]
    for m, (i, j, k) in enumerate(net["matches"]):
        dh[i][k] += x[m]
        dc[j][k] += x[m]
    for i in range(model.nH):
        th[i][0] = model.Th_in[i]
        for k in range(K):
            th[i][k + 1] = th[i][k] - dh[i][k] / model.Fh[i]
    for j in range(model.nC):
        tc[j][K] = model.Tc_in[j]
        for k in range(K - 1, -1, -1):
            tc[j][k] = tc[j][k + 1] + dc[j][k] / model.Fc[j]
    return th, tc


def evaluate(model, net, x, tau=0.0, mu=0.0, scale=1.0, want_grad=False):
    """TAC of a network with loads x, plus (for the NLP) the barrier and
    penalty terms and the exact gradient.

    phi = TAC/scale - tau * sum(log slack) + mu * sum((residual/duty)^2)
    Slacks (must stay > 0): every load, every approach temperature minus
    EMAT, every utility load that is switched on.  Residual: the utility
    load of a stream whose utility is switched off (must be 0).

    Returns dict(phi, tac, grad (if asked), ok (all slacks > 0), units, ...).
    """
    K, E = model.K, model.emat
    th, tc = temperatures(model, net, x)
    gth = [[0.0] * (K + 1) for _ in range(model.nH)]   # d phi / d th
    gtc = [[0.0] * (K + 1) for _ in range(model.nC)]
    gx = [0.0] * len(x)
    tac = 0.0
    barrier = 0.0
    penalty = 0.0
    ok = True
    units = []

    def slack(s):
        nonlocal barrier, ok
        if s < 0.0 or (s == 0.0 and tau > 0.0):
            ok = False
            return 0.0
        if tau == 0.0:                          # plain TAC: s = 0 is allowed
            return 0.0
        barrier -= math.log(s)
        return -tau / s                         # d(barrier term)/d s

    for m, (i, j, k) in enumerate(net["matches"]):
        q = x[m]
        a = th[i][k] - tc[j][k]                 # hot end
        b = th[i][k + 1] - tc[j][k + 1]         # cold end
        gq = slack(q)
        ga = slack(a - E)
        gb = slack(b - E)
        if not ok:
            continue
        L, La, Lb = lmtd(a, b)
        U = model.U_pc[i][j]
        A = q / (U * L)
        C, dC = unit_cost(model.kind_pc[i][j], model.par_pc[i][j], A)
        tac += C
        units.append(dict(type="match", i=i, j=j, k=k, q=q, A=A, cost=C, dT1=a, dT2=b))
        dCs = dC / scale
        gq += dCs * A / q if q > 0.0 else 0.0
        ga += -dCs * A / L * La
        gb += -dCs * A / L * Lb
        gx[m] += gq
        gth[i][k] += ga
        gtc[j][k] -= ga
        gth[i][k + 1] += gb
        gtc[j][k + 1] -= gb

    # coolers on hot streams
    for i in range(model.nH):
        Q = model.Fh[i] * (th[i][K] - model.Th_out[i])
        u = net["cu"][i]
        if u < 0:
            r = Q / model.Qh[i]
            penalty += r * r
            gth[i][K] += mu * 2.0 * r / model.Qh[i] * model.Fh[i]
            continue
        o = model.cool[i][u]
        gQ = slack(Q)
        a = th[i][K] - o["Tout"]                 # hot end
        b = model.Th_out[i] - o["Tin"]           # cold end (fixed)
        ga = slack(a - E)
        if not ok:
            continue
        L, La, Lb = lmtd(a, b)
        A = Q / (o["U"] * L)
        C, dC = unit_cost(o["kind"], o["par"], A)
        C_op = o["cost"] * Q
        tac += C + C_op
        units.append(dict(type="cooler", i=i, u=o["u"], q=Q, A=A, cost=C, op=C_op, dT1=a, dT2=b))
        dCs = dC / scale
        gQ += (dCs * A / Q if Q > 0.0 else 0.0) + o["cost"] / scale
        ga += -dCs * A / L * La
        gth[i][K] += gQ * model.Fh[i] + ga

    # heaters on cold streams
    for j in range(model.nC):
        Q = model.Fc[j] * (model.Tc_out[j] - tc[j][0])
        u = net["hu"][j]
        if u < 0:
            r = Q / model.Qc[j]
            penalty += r * r
            gtc[j][0] += -mu * 2.0 * r / model.Qc[j] * model.Fc[j]
            continue
        o = model.heat[j][u]
        gQ = slack(Q)
        a = o["Tin"] - model.Tc_out[j]           # hot end (fixed)
        b = o["Tout"] - tc[j][0]                 # cold end
        gb = slack(b - E)
        if not ok:
            continue
        L, La, Lb = lmtd(a, b)
        A = Q / (o["U"] * L)
        C, dC = unit_cost(o["kind"], o["par"], A)
        C_op = o["cost"] * Q
        tac += C + C_op
        units.append(dict(type="heater", j=j, u=o["u"], q=Q, A=A, cost=C, op=C_op, dT1=a, dT2=b))
        dCs = dC / scale
        gQ += (dCs * A / Q if Q > 0.0 else 0.0) + o["cost"] / scale
        gb += -dCs * A / L * Lb
        gtc[j][0] += -gQ * model.Fc[j] - gb

    if not ok:
        return dict(ok=False, phi=math.inf, tac=math.inf)
    phi = tac / scale + tau * barrier + mu * penalty
    out = dict(ok=True, phi=phi, tac=tac, penalty=penalty, units=units, th=th, tc=tc)
    if want_grad:
        out["grad"] = _backprop(model, net, gx, gth, gtc)
    return out


def _backprop(model, net, gx, gth, gtc):
    """Chain rule through the temperature recurrences (reverse order):
    th[i][k+1] = th[i][k] - sum q/Fh ;  tc[j][k] = tc[j][k+1] + sum q/Fc."""
    K = model.K
    stage_hot = [[[] for _ in range(K)] for _ in range(model.nH)]
    stage_cold = [[[] for _ in range(K)] for _ in range(model.nC)]
    for m, (i, j, k) in enumerate(net["matches"]):
        stage_hot[i][k].append(m)
        stage_cold[j][k].append(m)
    g = list(gx)
    for i in range(model.nH):
        acc = 0.0
        for k in range(K - 1, -1, -1):
            acc += gth[i][k + 1]                # d phi / d th[i][k+1] incl. downstream
            for m in stage_hot[i][k]:
                g[m] -= acc / model.Fh[i]
    for j in range(model.nC):
        acc = 0.0
        for k in range(K):
            acc += gtc[j][k]
            for m in stage_cold[j][k]:
                g[m] += acc / model.Fc[j]
    return g


# =========================================================================
# 6. Loads: barrier NLP solved with L-BFGS
# =========================================================================

TAUS = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9]
MUS = [1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7]


def load_scale(model, net):
    """Natural size of each load: the smaller of the two stream duties."""
    return [min(model.Qh[i], model.Qc[j]) for (i, j, k) in net["matches"]]


def start_point(model, net, frac=1e-4):
    """A strictly feasible start: every load a tiny fraction of its scale."""
    return [frac * s for s in load_scale(model, net)]


def lbfgs_level(model, net, y, sx, tau, mu, scale, max_iter=200, mem=8):
    """Minimise phi over scaled loads y (x = y * sx) at fixed tau, mu.
    Two-loop L-BFGS; each step stays strictly inside the barrier (the
    slacks are linear in x, so the largest safe step follows from the slack
    change along the direction)."""
    n = len(y)
    xs = lambda yy: [yy[m] * sx[m] for m in range(n)]
    ev = evaluate(model, net, xs(y), tau, mu, scale, True)
    f = ev["phi"]
    g = [ev["grad"][m] * sx[m] for m in range(n)]
    S, Y = [], []
    nfev = 1
    small = 0
    for it in range(max_iter):
        # two-loop recursion
        d = [-v for v in g]
        al = []
        for s, yv in zip(reversed(S), reversed(Y)):
            rho = 1.0 / sum(a * b for a, b in zip(yv, s))
            a_ = rho * sum(a * b for a, b in zip(s, d))
            al.append((a_, rho))
            d = [d[m] - a_ * yv[m] for m in range(n)]
        if S:
            gam = sum(a * b for a, b in zip(S[-1], Y[-1])) / sum(a * a for a in Y[-1])
        else:
            gam = 0.1 / max(1e-300, max(abs(v) for v in g))
        d = [gam * v for v in d]
        for (a_, rho), s, yv in zip(reversed(al), S, Y):
            b_ = rho * sum(a * b for a, b in zip(yv, d))
            d = [d[m] + (a_ - b_) * s[m] for m in range(n)]
        gd = sum(a * b for a, b in zip(g, d))
        if gd >= 0.0:                         # not a descent direction: reset
            S, Y = [], []
            gam = 0.1 / max(1e-300, max(abs(v) for v in g))
            d = [-gam * v for v in g]
            gd = sum(a * b for a, b in zip(g, d))
        # largest step keeping every slack positive
        amax = max_feasible_step(model, net, xs(y), [d[m] * sx[m] for m in range(n)])
        a = min(1.0, 0.99 * amax)
        while True:
            yn = [y[m] + a * d[m] for m in range(n)]
            evn = evaluate(model, net, xs(yn), tau, mu, scale, True)
            nfev += 1
            if evn["ok"] and evn["phi"] <= f + 1e-4 * a * gd:
                break
            a *= 0.5
            if a < 1e-16:
                return y, f, nfev, it
        gn = [evn["grad"][m] * sx[m] for m in range(n)]
        s = [yn[m] - y[m] for m in range(n)]
        yv = [gn[m] - g[m] for m in range(n)]
        sy = sum(p * q for p, q in zip(s, yv))
        if sy > 1e-12 * math.sqrt(sum(p * p for p in s) * sum(q * q for q in yv)):
            S.append(s)
            Y.append(yv)
            if len(S) > mem:
                S.pop(0)
                Y.pop(0)
        df = f - evn["phi"]
        y, f, g = yn, evn["phi"], gn
        small = small + 1 if df <= 1e-12 * (abs(f) + 1e-12) else 0
        if small >= 3 or max(abs(v) for v in s) < 1e-14:     # 3 tiny decreases in a row
            return y, f, nfev, it + 1
    return y, f, nfev, max_iter


def slacks(model, net, x):
    """All barrier slacks in a fixed order (same as evaluate)."""
    K, E = model.K, model.emat
    th, tc = temperatures(model, net, x)
    s = []
    for m, (i, j, k) in enumerate(net["matches"]):
        s += [x[m], th[i][k] - tc[j][k] - E, th[i][k + 1] - tc[j][k + 1] - E]
    for i in range(model.nH):
        u = net["cu"][i]
        if u >= 0:
            s += [model.Fh[i] * (th[i][K] - model.Th_out[i]), th[i][K] - model.cool[i][u]["Tout"] - E]
    for j in range(model.nC):
        u = net["hu"][j]
        if u >= 0:
            s += [model.Fc[j] * (model.Tc_out[j] - tc[j][0]), model.heat[j][u]["Tout"] - tc[j][0] - E]
    return s


def min_slack(model, net, x):
    return min([1.0] + slacks(model, net, x))


def feasible_start(model, net, x):
    """x itself if strictly feasible; otherwise the loads scaled down by the
    largest factor theta (bisection) that makes them feasible, each kept
    above the tiny start value (theta -> 0 is the feasible tiny start)."""
    if min_slack(model, net, x) > 0.0:
        return list(x)
    eps = start_point(model, net)
    at = lambda theta: [max(theta * x[m], eps[m]) for m in range(len(x))]
    lo, hi = 0.0, 1.0
    for _ in range(30):
        mid = 0.5 * (lo + hi)
        if min_slack(model, net, at(mid)) > 0.0:
            lo = mid
        else:
            hi = mid
    xs = at(lo)
    return xs if min_slack(model, net, xs) > 0.0 else eps


def max_feasible_step(model, net, x, dx):
    """Largest alpha with all slacks(x + alpha dx) > 0 (slacks are linear)."""
    s0 = slacks(model, net, x)
    s1 = slacks(model, net, [x[m] + dx[m] for m in range(len(x))])
    amax = math.inf
    for a, b in zip(s0, s1):
        ds = b - a
        if ds < 0.0:
            amax = min(amax, -a / ds)
    return amax


def optimize_loads(model, net, x0=None, scale=None, max_iter=200):
    """Optimal loads of a fixed topology: barrier/penalty continuation.

    Starts from x0 if strictly feasible, otherwise from tiny loads.  Returns
    dict(x, tac, ok, feasible (equalities met), ...)."""
    n = len(net["matches"])
    sx = load_scale(model, net)
    x0 = start_point(model, net) if x0 is None else feasible_start(model, net, x0)
    if scale is None:
        scale = max(1.0, evaluate(model, net, x0)["tac"])
    y = [x0[m] / sx[m] for m in range(n)]
    nfev = 0
    for tau, mu in zip(TAUS, MUS):
        if n:
            y, f, nf, _ = lbfgs_level(model, net, y, sx, tau, mu, scale, max_iter)
            nfev += nf
    x = [y[m] * sx[m] for m in range(n)]
    ev = evaluate(model, net, x)
    resid = residuals(model, net, x)
    feasible = ev["ok"] and max([0.0] + [abs(r) for r in resid]) <= 1e-6
    return dict(x=x, tac=ev["tac"], ok=ev["ok"], feasible=feasible, resid=resid,
                units=ev.get("units", []), nfev=nfev, net=net)


def residuals(model, net, x):
    """Relative utility load of streams whose utility is switched off."""
    th, tc = temperatures(model, net, x)
    K = model.K
    r = []
    for i in range(model.nH):
        if net["cu"][i] < 0:
            r.append(model.Fh[i] * (th[i][K] - model.Th_out[i]) / model.Qh[i])
    for j in range(model.nC):
        if net["hu"][j] < 0:
            r.append(model.Fc[j] * (model.Tc_out[j] - tc[j][0]) / model.Qc[j])
    return r


# =========================================================================
# 7. Topology: simulated annealing with the NLP inside
# =========================================================================


class Mulberry32:
    """Small 32-bit PRNG, bit-identical in Python, JavaScript and Rust."""

    def __init__(self, seed):
        self.a = seed & 0xFFFFFFFF

    def next_u32(self):
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return (t ^ (t >> 14)) & 0xFFFFFFFF

    def random(self):
        return self.next_u32() / 4294967296.0

    def below(self, n):
        return self.next_u32() % n


def initial_network(model):
    """No process matches; every stream on its first feasible utility."""
    return dict(matches=[], hu=[0 if model.heat[j] else -1 for j in range(model.nC)],
                cu=[0 if model.cool[i] else -1 for i in range(model.nH)])


def objective(model, res, ref):
    """What SA minimises: TAC plus a penalty for missed stream targets."""
    if not res["ok"]:
        return math.inf
    return res["tac"] + ref * 10.0 * sum(abs(r) for r in res["resid"])


def propose(model, net, rng):
    """One random topology move (returns a new network, or None)."""
    mv = rng.random()
    M = list(net["matches"])
    if mv < 0.35 or not M:                                 # add a match
        i, j, k = rng.below(model.nH), rng.below(model.nC), rng.below(model.K)
        if not model.allowed[i][j] or (i, j, k) in M:
            return None
        M.append((i, j, k))
    elif mv < 0.6:                                         # remove a match
        M.pop(rng.below(len(M)))
    elif mv < 0.8:                                         # move to another stage
        m = rng.below(len(M))
        i, j, k = M[m]
        k2 = rng.below(model.K)
        if k2 == k or (i, j, k2) in M:
            return None
        M[m] = (i, j, k2)
    else:                                                  # change a utility
        s = rng.below(model.nH + model.nC)
        hu, cu = list(net["hu"]), list(net["cu"])
        if s < model.nH:
            n = len(model.cool[s])
            cu[s] = rng.below(n + 1) - 1
            if cu[s] == net["cu"][s]:
                return None
        else:
            j = s - model.nH
            n = len(model.heat[j])
            hu[j] = rng.below(n + 1) - 1
            if hu[j] == net["hu"][j]:
                return None
        return dict(matches=M, hu=hu, cu=cu)
    return dict(matches=sorted(M), hu=list(net["hu"]), cu=list(net["cu"]))


def warm_start(old_net, old_x, new_net, model):
    """Carry over the loads of matches that survive the move."""
    prev = {mt: x for mt, x in zip(old_net["matches"], old_x)}
    sx = load_scale(model, new_net)
    return [prev.get(mt, 1e-4 * sx[m]) for m, mt in enumerate(new_net["matches"])]


def anneal(model, iters, seed, net0=None, T0=0.05, T1=1e-4, max_iter=200, log=None):
    """Simulated annealing over the topology; each candidate's loads are
    optimised by optimize_loads.  Temperature falls geometrically from
    T0*TAC0 to T1*TAC0.  Returns the best feasible network found."""
    rng = Mulberry32(seed)
    cur_net = net0 or initial_network(model)
    cur = optimize_loads(model, cur_net, max_iter=max_iter)
    ref = cur["tac"] if math.isfinite(cur["tac"]) else 1e6
    cur_obj = objective(model, cur, ref)
    best = cur if cur["feasible"] else None
    T = T0 * ref
    alpha = (T1 / T0) ** (1.0 / max(1, iters))
    nfev = cur["nfev"]
    for it in range(iters):
        cand_net = propose(model, cur_net, rng)
        if cand_net is not None:
            x0 = warm_start(cur_net, cur["x"], cand_net, model)
            cand = optimize_loads(model, cand_net, x0, max_iter=max_iter)
            nfev += cand["nfev"]
            obj = objective(model, cand, ref)
            d = obj - cur_obj
            u = rng.random()            # always drawn, so round-off cannot shift the stream
            if d < 0.0 or (math.isfinite(d) and u < math.exp(-d / T)):
                cur_net, cur, cur_obj = cand_net, cand, obj
                if cur["feasible"] and (best is None or cur["tac"] < best["tac"]):
                    best = cur
                    if log:
                        log(it, best["tac"])
        T *= alpha
    return dict(best=best, nfev=nfev)


# =========================================================================
# Problem sets
# =========================================================================


def power_law(cf, cv, beta):
    return dict(kind="power", cf=cf, cv=cv, beta=beta)


def benchmark(name):
    """Literature benchmark problems (data as given in the cited sources;
    see the page's Benchmarks tab)."""
    B = BENCHMARKS[name]
    hot = [dict(name=f"H{n + 1}", Tin=a, Tout=b, F=f, h=h) for n, (a, b, f, h) in enumerate(B["hot"])]
    cold = [dict(name=f"C{n + 1}", Tin=a, Tout=b, F=f, h=h) for n, (a, b, f, h) in enumerate(B["cold"])]
    hu = [dict(name=f"HU{n + 1}", Tin=a, Tout=b, h=h, cost=c) for n, (a, b, h, c) in enumerate(B["hu"])]
    cu = [dict(name=f"CU{n + 1}", Tin=a, Tout=b, h=h, cost=c) for n, (a, b, h, c) in enumerate(B["cu"])]
    return dict(name=name, hot=hot, cold=cold, hu=hu, cu=cu, emat=B["emat"],
                law=power_law(*B["law"]), stages=B.get("stages"))


# (Tin, Tout, F [kW/K], h [kW/m2K]); utilities (Tin, Tout, h, cost $/kW yr);
# law (cf, cv, beta) in $/yr with A in m2.
BENCHMARKS = {
    # Escobar & Trierweiler (2013), as tabulated by Caballero et al. (2021), Table S3
    "H2C2 (Escobar & Trierweiler)": dict(
        hot=[(270, 160, 18, 0.5), (220, 60, 22, 0.5)],
        cold=[(50, 210, 20, 0.5), (160, 210, 50, 0.5)],
        hu=[(250, 250, 1.0, 200)], cu=[(15, 20, 1.0, 20)],
        law=(4000, 500, 0.83), emat=10),
    # Ahmad (1985) 4-stream, as tabulated by Huber et al. (2023), Table 1
    "H2C2 (Ahmad 1985)": dict(
        hot=[(260, 160, 3.0, 0.4), (250, 130, 1.5, 0.4)],
        cold=[(120, 235, 2.0, 0.4), (180, 240, 4.0, 0.4)],
        hu=[(280, 279, 0.4, 110)], cu=[(30, 80, 0.4, 12.2)],
        law=(0, 300, 0.5), emat=1),
    # Yee & Grossmann (1990), as tabulated by Caballero et al. (2021), Table S9
    "H5C1 (Yee & Grossmann)": dict(
        hot=[(500, 320, 6, 0.5), (480, 380, 4, 0.5), (460, 360, 6, 0.5),
             (380, 360, 20, 0.5), (380, 320, 12, 0.5)],
        cold=[(290, 660, 18, 0.5)],
        hu=[(700, 700, 0.5, 140)], cu=[(300, 320, 0.5, 10)],
        law=(0, 1200, 0.6), emat=10),
    # Linnhoff & Ahmad (1990) aromatics plant ("9SP"), Caballero Table S11 / Huber Table 4
    "H4C5 aromatics (Linnhoff & Ahmad)": dict(
        hot=[(327, 40, 100, 0.50), (220, 160, 160, 0.40), (220, 60, 60, 0.14), (160, 45, 400, 0.30)],
        cold=[(100, 300, 100, 0.35), (35, 164, 70, 0.70), (85, 138, 350, 0.50),
              (60, 170, 60, 0.14), (140, 300, 200, 0.60)],
        hu=[(330, 250, 0.5, 60)], cu=[(15, 30, 0.5, 6)],
        law=(2000, 70, 1.0), emat=1),
    # Ahmad (1985) 10-stream (H6C4), Caballero Table S15
    "H6C4 (Ahmad 1985)": dict(
        hot=[(85, 45, 156.3, 0.05), (120, 40, 50.0, 0.05), (125, 35, 23.9, 0.05),
             (56, 46, 1250.0, 0.05), (90, 85, 1200.0, 0.05), (225, 75, 50.0, 0.05)],
        cold=[(40, 55, 466.7, 0.05), (55, 65, 600.0, 0.05), (65, 165, 180.0, 0.05), (10, 170, 81.3, 0.05)],
        hu=[(200, 198, 0.05, 100)], cu=[(15, 20, 0.05, 15)],
        law=(8000, 60, 1.0), emat=1),
    # Bjork & Pettersson (2003) 15-stream (H8C7), Caballero Table S21
    "H8C7 (Bjork & Pettersson)": dict(
        hot=[(180, 75, 30, 2.0), (280, 120, 60, 1.0), (180, 75, 30, 2.0), (140, 40, 30, 1.0),
             (220, 120, 50, 1.0), (180, 55, 35, 2.0), (200, 60, 30, 0.4), (120, 40, 100, 0.5)],
        cold=[(40, 230, 20, 1.0), (100, 220, 60, 1.0), (40, 190, 35, 2.0), (50, 190, 30, 2.0),
              (50, 250, 60, 2.0), (90, 190, 50, 1.0), (160, 250, 60, 3.0)],
        hu=[(325, 325, 1.0, 80)], cu=[(25, 40, 2.0, 10)],
        law=(8000, 500, 0.75), emat=1),
    # Luo et al. (2009) 20-stream (H10C10), Caballero Table S27
    "H10C10 (Luo et al.)": dict(
        hot=[(180, 75, 30, 2.00), (280, 120, 15, 0.60), (180, 75, 30, 0.30), (140, 45, 30, 2.00),
             (220, 120, 25, 0.08), (180, 55, 10, 0.02), (170, 45, 30, 2.00), (180, 50, 30, 1.50),
             (280, 90, 15, 1.00), (180, 60, 30, 2.00)],
        cold=[(40, 230, 20, 1.50), (120, 260, 35, 2.00), (40, 190, 35, 1.50), (50, 190, 30, 2.00),
              (50, 250, 20, 2.00), (40, 150, 10, 0.06), (40, 150, 20, 0.40), (120, 210, 35, 1.50),
              (40, 130, 35, 1.00), (60, 120, 30, 0.70)],
        hu=[(325, 325, 1.0, 70)], cu=[(25, 40, 2.0, 10)],
        law=(8000, 800, 0.8), emat=1),
    # Bjork & Pettersson (2003) 39-stream (H22C17), Caballero Table S29
    "H22C17 (Bjork & Pettersson)": dict(
        hot=[(180, 75, 30, 2.00), (280, 120, 15, 2.50), (180, 75, 30, 2.00), (140, 45, 30, 2.00),
             (220, 120, 25, 1.50), (180, 55, 10, 2.00), (170, 45, 30, 2.00), (180, 50, 30, 2.00),
             (280, 90, 15, 2.00), (180, 60, 30, 2.00), (120, 45, 30, 2.00), (220, 120, 25, 2.00),
             (180, 55, 10, 2.00), (140, 45, 20, 2.00), (140, 60, 70, 2.00), (220, 50, 15, 2.50),
             (220, 60, 10, 2.50), (150, 70, 20, 2.00), (140, 80, 70, 2.00), (220, 50, 35, 2.00),
             (180, 60, 10, 2.00), (150, 45, 20, 2.50)],
        cold=[(40, 230, 20, 1.50), (120, 260, 35, 1.00), (40, 190, 35, 1.50), (50, 190, 30, 2.00),
              (50, 250, 60, 2.00), (40, 150, 20, 2.00), (40, 150, 20, 2.00), (120, 210, 35, 2.50),
              (40, 130, 35, 2.50), (60, 120, 30, 2.50), (50, 150, 10, 3.00), (40, 130, 20, 1.00),
              (120, 160, 35, 1.00), (40, 90, 35, 1.75), (50, 90, 30, 1.50), (50, 150, 30, 2.00),
              (30, 150, 50, 2.00)],
        hu=[(325, 325, 1.0, 70)], cu=[(25, 40, 2.0, 10)],
        law=(8000, 800, 0.8), emat=1),
}


def load_furman(path):
    """Read a Furman-Sahinidis instance (format of Letsios et al. 2018):
    'DTmin x', then 'HSn Tin Tout FCp', 'CSn ...', 'HUn Tin Tout cost', 'CUn ...'."""
    prob = dict(name=path.rsplit("/", 1)[-1].replace(".dat", ""), hot=[], cold=[], hu=[], cu=[],
                law=power_law(0, 1, 1))
    for line in open(path):
        w = line.split()
        if not w:
            continue
        if w[0] == "DTmin":
            prob["emat"] = float(w[1])
        elif w[0][:2] in ("HS", "CS", "HU", "CU") and len(w) >= 4:
            a, b, c = float(w[1]), float(w[2]), float(w[3])
            if w[0].startswith("HS"):
                prob["hot"].append(dict(name=w[0], Tin=a, Tout=b, F=c, h=1.0))
            elif w[0].startswith("CS"):
                prob["cold"].append(dict(name=w[0], Tin=a, Tout=b, F=c, h=1.0))
            elif w[0].startswith("HU"):
                prob["hu"].append(dict(name=w[0], Tin=a, Tout=b, h=1.0, cost=c))
            else:
                prob["cu"].append(dict(name=w[0], Tin=a, Tout=b, h=1.0, cost=c))
    return prob


# =========================================================================
# Sequential synthesis, step 3: from MILP matches to an optimised network
# =========================================================================


def network_from_matches(prob, milp):
    """Put each process match of the MILP into its own stage, ordered from
    the hot end by the mean temperature of the heat it exchanges, and give
    each stream the utility the MILP used for it.  Returns (model, net, x0)."""
    nH, nC = len(prob["hot"]), len(prob["cold"])
    proc = [m for m in milp["matches"] if m["hot"] < nH and m["cold"] < nC]
    proc.sort(key=lambda m: -m["Tmean"])
    model = Model(dict(prob, stages=max(1, len(proc))))
    matches = [(m["hot"], m["cold"], k) for k, m in enumerate(proc)]
    x0 = [m["load"] for m in proc]
    hu, cu = [-1] * nC, [-1] * nH
    for j in range(nC):
        used = [m for m in milp["matches"] if m["hot"] >= nH and m["cold"] == j]
        if used:
            u = max(used, key=lambda m: m["load"])["hot"] - nH
            opts = [o["u"] for o in model.heat[j]]
            hu[j] = opts.index(u) if u in opts else (0 if opts else -1)
        elif model.heat[j]:
            hu[j] = 0                   # allowed, the NLP decides the load
    for i in range(nH):
        used = [m for m in milp["matches"] if m["cold"] >= nC and m["hot"] == i]
        if used:
            u = max(used, key=lambda m: m["load"])["cold"] - nC
            opts = [o["u"] for o in model.cool[i]]
            cu[i] = opts.index(u) if u in opts else (0 if opts else -1)
        elif model.cool[i]:
            cu[i] = 0
    return model, dict(matches=matches, hu=hu, cu=cu), x0


def improve_placement(model, net, res, passes=10, max_iter=200):
    """Greedy local search used after step 3: move single matches to other
    stages and switch single utilities on/off; keep a change if it lowers
    the SA objective (TAC + penalty for missed targets)."""
    ref = res["tac"] if math.isfinite(res["tac"]) else 1e6
    best, best_obj = res, objective(model, res, ref)
    for _ in range(passes):
        improved = False
        cands = []
        for m, (i, j, k) in enumerate(best["net"]["matches"]):
            for k2 in range(model.K):
                if k2 != k and (i, j, k2) not in best["net"]["matches"]:
                    M = list(best["net"]["matches"])
                    M[m] = (i, j, k2)
                    cands.append(dict(best["net"], matches=sorted(M)))
        for i in range(model.nH):
            for u in range(-1, len(model.cool[i])):
                if u != best["net"]["cu"][i]:
                    cu = list(best["net"]["cu"])
                    cu[i] = u
                    cands.append(dict(best["net"], cu=cu))
        for j in range(model.nC):
            for u in range(-1, len(model.heat[j])):
                if u != best["net"]["hu"][j]:
                    hu = list(best["net"]["hu"])
                    hu[j] = u
                    cands.append(dict(best["net"], hu=hu))
        for cand_net in cands:
            x0 = warm_start(best["net"], best["x"], cand_net, model)
            r = optimize_loads(model, cand_net, x0, max_iter=max_iter)
            obj = objective(model, r, ref)
            if obj < best_obj - 1e-9 * abs(best_obj):
                best, best_obj, improved = r, obj, True
        if not improved:
            break
    return best


def units_tac(units, law, emat=None):
    """TAC of a network given exchanger by exchanger with its terminal
    temperatures, e.g. a network read from a paper.  units: list of dicts
    q, Th_in, Th_out, Tc_in, Tc_out, h_hot, h_cold, and op (utility cost
    $/kW yr, 0 for process matches).  Counter-current, exact LMTD."""
    kind, p = law_params(law, ("CS", "CS"), 1.0)
    tot, area, rows = 0.0, 0.0, []
    for u in units:
        a = u["Th_in"] - u["Tc_out"]
        b = u["Th_out"] - u["Tc_in"]
        L = lmtd(a, b)[0]
        A = u["q"] / (overall_U(u["h_hot"], u["h_cold"]) * L)
        C = unit_cost(kind, p, A)[0] + u.get("op", 0.0) * u["q"]
        rows.append(dict(A=A, C=C, dTmin=min(a, b)))
        tot += C
        area += A
    return dict(tac=tot, area=area, rows=rows)


# =========================================================================
# Illustrative stream sets (made up to show the effects; not plant data)
# =========================================================================

ANY = MATERIALS


def seider_law(cepci=800.0, annual=None, p_psig=150.0, tube_ft=20, typ="floating head"):
    """Seider et al. bare-module cost, annualised.  cepci is an editable
    placeholder (the current index is paywalled)."""
    return dict(kind="seider", type=typ, cepci=cepci, p_psig=p_psig, tube_ft=tube_ft, fbm=3.17,
                annual=capital_recovery_factor(0.10, 10) if annual is None else annual)


def illustrative(name, prices=None):
    """Illustrative cases.  Utility prices come from utility_price()."""
    pr = dict(DEFAULT_PRICES, **(prices or {}))
    C = ILLUSTRATIVE[name]
    s = lambda t: [dict(name=n, Tin=a, Tout=b, F=f, h=h, mat=list(m), note=note)
                   for n, a, b, f, h, m, note in t]
    hu = [dict(name=n, kind=k, Tin=a, Tout=b, h=h, mat=list(m), cost=utility_price(k, a, b, pr)[0])
          for n, k, a, b, h, m in C["hu"]]
    cu = [dict(name=n, kind=k, Tin=a, Tout=b, h=h, mat=list(m), cost=utility_price(k, a, b, pr)[0])
          for n, k, a, b, h, m in C["cu"]]
    hot, cold = s(C["hot"]), s(C["cold"])
    forbid = [[(hs["name"], cs["name"]) in C["forbid"] for cs in cold] for hs in hot]
    return dict(name=name, hot=hot, cold=cold, hu=hu, cu=cu, emat=C["emat"], law=seider_law(),
                forbid=forbid, mult=[[1.0] * len(cold) for _ in hot], stages=C.get("stages"),
                description=C["description"])


ILLUSTRATIVE = {
    "HF alkylation (illustrative)": dict(
        description="HF-bearing streams need Monel; seawater needs titanium (or brass) tubes, so an "
                    "HF stream and seawater share no tube material and cannot be matched.",
        hot=[("H1 reactor effluent (HF)", 95, 40, 60, 0.8, ["Monel"], "HF acid: Monel"),
             ("H2 isobutane recycle", 150, 60, 30, 1.0, ANY, ""),
             ("H3 alkylate product", 185, 45, 20, 0.9, ANY, "")],
        cold=[("C1 isostripper feed", 45, 140, 50, 0.9, ANY, ""),
              ("C2 depropanizer feed (HF)", 40, 110, 25, 0.8, ["Monel"], "HF acid: Monel"),
              ("C3 isostripper reboiler", 155, 160, 400, 2.0, ANY, "")],
        hu=[("LP steam 165 C", "steam", 165, 165, 3.0, ANY),
            ("MP steam 200 C", "steam", 200, 200, 3.0, ANY)],
        cu=[("Cooling water 25-35 C", "cw", 25, 35, 1.5, ANY),
            ("Seawater 20-30 C", "seawater", 20, 30, 1.5, ["Ti", "brass"])],
        forbid=[], emat=10),
    "Oxidation unit: oxygen vs hydrocarbons (illustrative)": dict(
        description="Oxygen-rich streams must not be matched with hydrocarbon streams (a tube leak "
                    "would bring them together), so those pairs are forbidden matches.",
        hot=[("H1 oxidiser effluent", 260, 150, 20, 0.8, ANY, ""),
             ("H2 heavy hydrocarbon product", 150, 40, 20, 0.6, ANY, "hydrocarbon"),
             ("H3 compressed oxygen", 120, 40, 5, 0.4, ["SS", "Monel"], "oxygen")],
        cold=[("C1 hydrocarbon feed", 30, 220, 15, 0.7, ANY, "hydrocarbon"),
              ("C2 oxygen feed", 25, 140, 12, 0.4, ["SS", "Monel"], "oxygen"),
              ("C3 boiler feed water", 105, 180, 10, 1.5, ANY, "")],
        hu=[("HP steam 250 C", "steam", 250, 250, 3.0, ANY),
            ("Fired heater (hot oil 320-280 C)", "furnace", 320, 280, 0.8, ANY)],
        cu=[("Cooling water 25-35 C", "cw", 25, 35, 1.5, ANY)],
        forbid=[("H2 heavy hydrocarbon product", "C2 oxygen feed"),
                ("H3 compressed oxygen", "C1 hydrocarbon feed")], emat=10),
}


# =========================================================================
# Flat layout shared with the Rust solver (Model::from_flat, Net::from_flat)
# =========================================================================


def flatten_model(model):
    v = [model.nH, model.nC, model.K, model.emat]
    for i in range(model.nH):
        v += [model.Th_in[i], model.Th_out[i], model.Fh[i]]
    for j in range(model.nC):
        v += [model.Tc_in[j], model.Tc_out[j], model.Fc[j]]
    for i in range(model.nH):
        for j in range(model.nC):
            v += [1.0 if model.allowed[i][j] else 0.0, model.U_pc[i][j], model.kind_pc[i][j]] + list(model.par_pc[i][j])
    for opts in model.cool + model.heat:
        v.append(len(opts))
        for o in opts:
            v += [o["u"], o["U"], o["kind"]] + list(o["par"]) + [o["Tin"], o["Tout"], o["cost"]]
    return [float(a) for a in v]


def flatten_net(net):
    v = [len(net["matches"])]
    for (i, j, k) in net["matches"]:
        v += [i, j, k]
    return [float(a) for a in v + list(net["hu"]) + list(net["cu"])]


def page_data():
    """Everything the page's JavaScript needs from this module (one source)."""
    return dict(
        SEIDER_FM=[[s, t, a, b] for (s, t), (a, b) in SEIDER_FM.items()],
        SEIDER_CB=SEIDER_CB, SEIDER_CE=SEIDER_CE,
        SEIDER_LENGTH_FACTOR={str(k): v for k, v in SEIDER_LENGTH_FACTOR.items()},
        TURTON_K=TURTON_K, TURTON_B=TURTON_B, TURTON_C=TURTON_C, TURTON_FM=TURTON_FM,
        TURTON_CE=TURTON_CE, MATERIALS=MATERIALS, M2_TO_FT2=M2_TO_FT2,
        STEAM_TABLE=STEAM_TABLE, H_FEEDWATER=H_FEEDWATER, MMBTU_GJ=MMBTU_GJ,
        DEFAULT_PRICES=DEFAULT_PRICES, BENCHMARKS=BENCHMARKS, ILLUSTRATIVE=ILLUSTRATIVE,
    )


DEFAULT_CASE = "Oxidation unit: oxygen vs hydrocarbons (illustrative)"


def make_law(law):
    """Cost law from the page's sidebar settings."""
    annual = capital_recovery_factor(law["rate"], law["years"])
    if law["kind"] == "seider":
        return seider_law(cepci=law["cepci"], annual=annual, p_psig=law["p_psig"], tube_ft=law["tube_ft"],
                          typ=law["type"])
    if law["kind"] == "turton":
        return dict(kind="turton", cepci=law["cepci"], annual=annual, p_barg=law["p_barg"])
    raise ValueError(law["kind"])


def problem_from_inputs(inp):
    """The problem the page's sidebar describes (USER_INPUTS of the
    breakdown).  Missing keys keep the case's own data."""
    case = inp.get("case", DEFAULT_CASE)
    prices = dict(DEFAULT_PRICES, **inp.get("prices", {}))
    p = benchmark(case) if case in BENCHMARKS else illustrative(case, prices)
    if inp.get("emat") is not None:
        p["emat"] = inp["emat"]
    if inp.get("stages"):
        p["stages"] = inp["stages"]
    law = inp.get("law")
    if law and law["kind"] != "paper":
        p["law"] = make_law(law)
    for key in ("forbid", "mult", "material"):
        if inp.get(key) is not None:
            p[key] = inp[key]
    return p
