"""Ten worked problems where a quick answer is easy to get wrong.

Each case has a "naive" answer (the setup an AI or a hurried engineer is likely to use)
and a "corrected" answer (the setup an experienced plant engineer would insist on).
Pure Python (math only), so it runs unchanged in CPython and in Pyodide.

Every case function takes keyword inputs (units in the name or the INPUTS table) and
returns a dict:
    naive, correct   -- the two answers (float, NaN when the setup is infeasible)
    unit             -- unit of both answers
    details          -- list of short strings with intermediate results
"""
import math

from props_data import CO2_REF, PROPANE, WATER

G = 9.80665            # m/s2
R = 8.314462618        # J/(mol K)
P_ATM_KPA = 101.325    # kPa
PSI_PER_KPA = 0.1450377377


# ---------------------------------------------------------------- shared property helpers
def interp(x, xs, ys):
    """Linear interpolation of ys(x) on ascending xs; raises outside the table."""
    if not xs[0] <= x <= xs[-1]:
        raise ValueError(f"{x:g} outside table range {xs[0]:g}..{xs[-1]:g}")
    lo, hi = 0, len(xs) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if xs[mid] <= x:
            lo = mid
        else:
            hi = mid
    t = (x - xs[lo]) / (xs[hi] - xs[lo])
    return ys[lo] + t * (ys[hi] - ys[lo])


_IF97 = (1167.0521452767, -724213.16703206, -17.073846940092, 12020.82470247, -3232555.0322333,
         14.91510861353, -4823.2657361591, 405113.40542057, -0.23855557567849, 650.17534844798)


def water_psat_kpa(T):
    """Water saturation pressure [kPa] at T [K], IAPWS-IF97 region 4 (273.15-647.096 K)."""
    n = _IF97
    th = T + n[8] / (T - n[9])
    A = th * th + n[0] * th + n[1]
    B = n[2] * th * th + n[3] * th + n[4]
    C = n[5] * th * th + n[6] * th + n[7]
    return (2 * C / (-B + math.sqrt(B * B - 4 * A * C))) ** 4 * 1e3


def water_tsat(P_kpa):
    """Water saturation temperature [K] at P [kPa abs] (bisection on water_psat_kpa)."""
    lo, hi = 273.16, 647.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if water_psat_kpa(mid) < P_kpa:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


_WT = [r[0] for r in WATER]


def water_sat(T):
    """Saturated water at T [K]: dict rho_l, rho_v [kg/m3], h_l, h_v [kJ/kg] (CoolProp table, 274-620 K)."""
    return {k: interp(T, _WT, [r[i] for r in WATER]) for i, k in ((1, "rho_l"), (2, "h_l"), (3, "h_v"), (4, "rho_v"))}


_PP = [math.log(r[0]) for r in PROPANE]


def propane_sat(P_bar):
    """Saturated propane at P [bar abs]: T [K], lam [kJ/kg], Z (vapour), k (ideal-gas cp0/cv0). 0.5-40 bar.
    Interpolated linearly in ln P."""
    return {k: interp(math.log(P_bar), _PP, [r[i] for r in PROPANE]) for i, k in ((1, "T"), (2, "lam"), (3, "Z"), (4, "k"))}


# ---------------------------------------------------------------- 1. gauge vs absolute pressure
def compressor(P1_psig=5.0, P2_psig=100.0, T1_C=27.0, k=1.4, Patm_psia=14.696, eta=0.75):
    """Isentropic discharge temperature [deg C] of an ideal-gas compressor.
    Naive: pressure ratio from gauge pressures.  Corrected: ratio of absolute pressures."""
    T1 = T1_C + 273.15
    r_naive = P2_psig / P1_psig
    r_abs = (P2_psig + Patm_psia) / (P1_psig + Patm_psia)
    e = (k - 1) / k
    return {"naive": T1 * r_naive ** e - 273.15, "correct": T1 * r_abs ** e - 273.15, "unit": "°C",
            "details": [f"ratio from gauge pressures = {r_naive:.2f}",
                        f"ratio from absolute pressures = {r_abs:.2f}",
                        f"isentropic exponent (k-1)/k = {e:.4f}",
                        f"actual discharge with isentropic efficiency {eta:g}: "
                        f"{T1 + (T1 * r_abs ** e - T1) / eta - 273.15:.0f} °C"]}


# ---------------------------------------------------------------- 2. pipe pressure drop
def colebrook(Re, rel_rough):
    """Darcy friction factor from the Colebrook equation (fixed-point iteration on 1/sqrt(f))."""
    if Re < 2300:
        return 64.0 / Re
    x = 7.0  # 1/sqrt(f)
    for _ in range(100):
        x_new = -2.0 * math.log10(rel_rough / 3.7 + 2.51 * x / Re)
        if abs(x_new - x) < 1e-13:
            break
        x = x_new
    return 1.0 / x_new ** 2


def pipe_dp(Q_m3h=50.0, D_mm=102.3, L_m=100.0, rough_mm=0.046, K_fittings=8.0, rho=998.2, mu_cP=1.0016):
    """Frictional pressure drop [kPa] for liquid in a pipe (Darcy-Weisbach, Colebrook).
    Naive: straight pipe only.  Corrected: straight pipe + fittings and valves (sum of K)."""
    D = D_mm / 1e3
    u = Q_m3h / 3600 / (math.pi * D * D / 4)
    Re = rho * u * D / (mu_cP / 1e3)
    f = colebrook(Re, rough_mm / D_mm)
    head = rho * u * u / 2
    dp_pipe = f * L_m / D * head / 1e3
    dp_fit = K_fittings * head / 1e3
    return {"naive": dp_pipe, "correct": dp_pipe + dp_fit, "unit": "kPa",
            "details": [f"velocity = {u:.2f} m/s, Re = {Re:.3g}",
                        f"Darcy f = {f:.5f} (Fanning f = {f / 4:.5f})"
                        + (" -- transitional flow, Colebrook is uncertain here" if 2300 <= Re < 4000 else ""),
                        f"if a Fanning f is put into the Darcy formula: {dp_pipe / 4:.1f} kPa (4x low)",
                        f"fittings add {dp_fit:.1f} kPa = {K_fittings * D / f:.0f} m of equivalent pipe"]}


# ---------------------------------------------------------------- 3. NPSH available for a hot liquid
def npsh(T_C=90.0, P_surf_kPa=101.325, z_m=2.0, hf_m=0.5):
    """NPSH available [m] for water drawn from a vessel with liquid z_m above the pump suction.
    Naive: vapour pressure and density of cold (20 deg C) water.  Corrected: at the pumping temperature."""
    def nps(T):
        rho = water_sat(T)["rho_l"]
        Pv = water_psat_kpa(T)
        return (P_surf_kPa - Pv) * 1e3 / (rho * G) + z_m - hf_m, Pv, rho
    n, Pv0, rho0 = nps(293.15)
    c, Pv, rho = nps(T_C + 273.15)
    return {"naive": n, "correct": c, "unit": "m",
            "details": [f"vapour pressure at 20 °C = {Pv0:.2f} kPa, at {T_C:g} °C = {Pv:.2f} kPa",
                        f"density at {T_C:g} °C = {rho:.1f} kg/m³",
                        f"pressure head above vapour pressure = {(P_surf_kPa - Pv) * 1e3 / (rho * G):.2f} m"]}


# ---------------------------------------------------------------- 4. control valve: choked / flashing liquid
def valve(Q_m3h=50.0, P1_bar=6.0, P2_bar=1.5, T_C=130.0, FL=0.9, xFz=0.4):
    """Required Kv [m3/h at 1 bar] of a liquid control valve (IEC 60534-2-1, SI form).
    Naive: Kv = Q sqrt(SG/dP) with the full pressure drop.  Corrected: dP limited to the choked value
    FL^2 (P1 - FF Pv), FF = 0.96 - 0.28 sqrt(Pv/Pc).
    Incipient cavitation is flagged when dP > xFz (P1 - Pv)."""
    T = T_C + 273.15
    Pv = water_psat_kpa(T) / 100.0  # bar
    Pc = 220.64                      # bar, water critical pressure
    rho = water_sat(T)["rho_l"]
    SG = rho / 999.1                 # relative to water at 15 deg C
    dP = P1_bar - P2_bar
    FF = 0.96 - 0.28 * math.sqrt(Pv / Pc)
    dP_ch = FL * FL * (P1_bar - FF * Pv)
    kv_naive = Q_m3h * math.sqrt(SG / dP)
    kv = Q_m3h * math.sqrt(SG / min(dP, dP_ch))
    state = "flashing (P2 below vapour pressure)" if P2_bar < Pv else (
        "choked, cavitating" if dP >= dP_ch else
        "not choked, but cavitation likely (dP > xFz (P1 - Pv))" if dP > xFz * (P1_bar - Pv) else
        "not choked, no cavitation expected")
    return {"naive": kv_naive, "correct": kv, "unit": "Kv",
            "details": [f"vapour pressure = {Pv:.3f} bar, FF = {FF:.3f}, SG = {SG:.3f}",
                        f"actual dP = {dP:.2f} bar, choked dP = {dP_ch:.2f} bar",
                        f"flow regime: {state}",
                        f"Cv = 1.156 Kv: naive {1.156 * kv_naive:.1f}, corrected {1.156 * kv:.1f}"]}


# ---------------------------------------------------------------- 5. non-ideal VLE: ethanol-water
VL_A12, VL_A21 = 1.6798, 0.9227   # van Laar constants (ln gamma form), ethanol (1) - water (2)


def ethanol_psat_kpa(T):
    """Ethanol vapour pressure [kPa] at T [K]; Antoine fit (NIST WebBook, 292.8-366.6 K), log10 bar form."""
    return 10 ** (5.37229 - 1670.409 / (T - 40.191)) * 100.0


def van_laar(x1):
    """Activity coefficients (gamma1, gamma2) of ethanol-water from the van Laar equation."""
    x2 = 1 - x1
    d = VL_A12 * x1 + VL_A21 * x2
    return math.exp(VL_A12 * (VL_A21 * x2 / d) ** 2), math.exp(VL_A21 * (VL_A12 * x1 / d) ** 2)


def bubble(x1, P_kpa, ideal):
    """Bubble temperature [K] and vapour mole fraction y1 at liquid x1 and pressure P (modified Raoult)."""
    g1, g2 = (1.0, 1.0) if ideal else van_laar(x1)
    lo, hi = 250.0, 450.0
    for _ in range(80):
        T = 0.5 * (lo + hi)
        if x1 * g1 * ethanol_psat_kpa(T) + (1 - x1) * g2 * water_psat_kpa(T) > P_kpa:
            hi = T
        else:
            lo = T
    T = 0.5 * (lo + hi)
    return T, x1 * g1 * ethanol_psat_kpa(T) / P_kpa


def vle(x1=0.95, P_kPa=101.325):
    """Vapour composition y1 [mol % ethanol] in equilibrium with liquid x1 at P.
    Naive: Raoult's law (ideal solution).  Corrected: van Laar activity coefficients."""
    Tn, yn = bubble(x1, P_kPa, True)
    Tc, yc = bubble(x1, P_kPa, False)
    a = lambda y: (y / x1) / ((1 - y) / (1 - x1))
    return {"naive": 100 * yn, "correct": 100 * yc, "unit": "mol %",
            "details": [f"bubble point: ideal {Tn - 273.15:.2f} °C, van Laar {Tc - 273.15:.2f} °C",
                        f"relative volatility: ideal {a(yn):.3f}, van Laar {a(yc):.3f}",
                        "alpha < 1 means the vapour is leaner in ethanol than the liquid (past the azeotrope)"
                        if a(yc) < 1 else "alpha > 1: ethanol still enriches in the vapour"]}


def azeotrope(P_kPa=101.325):
    """Azeotrope (x1, T [K]) of the van Laar model: where y1 = x1 (bisection on y1 - x1)."""
    lo, hi = 0.5, 0.999
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if bubble(mid, P_kPa, False)[1] > mid:
            lo = mid
        else:
            hi = mid
    x = 0.5 * (lo + hi)
    return x, bubble(x, P_kPa, False)[0]


# ---------------------------------------------------------------- 6. real-gas density: CO2
CO2 = {"Tc": 304.13, "Pc": 73.773, "w": 0.22394, "M": 44.0095}   # K, bar, -, g/mol


def peng_robinson_Z(T, P_bar, Tc, Pc, w):
    """Compressibility factor from the Peng-Robinson EOS; picks the root of lowest Gibbs energy."""
    kappa = 0.37464 + 1.54226 * w - 0.26992 * w * w
    alpha = (1 + kappa * (1 - math.sqrt(T / Tc))) ** 2
    A = 0.45724 * alpha * (P_bar / Pc) / (T / Tc) ** 2
    B = 0.07780 * (P_bar / Pc) / (T / Tc)
    # Z^3 + c2 Z^2 + c1 Z + c0 = 0
    c2, c1, c0 = -(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B ** 3)
    roots = cubic_real_roots(c2, c1, c0)
    roots = [z for z in roots if z > B]
    s2 = math.sqrt(2)

    def lnphi(z):
        return z - 1 - math.log(z - B) - A / (2 * s2 * B) * math.log((z + (1 + s2) * B) / (z + (1 - s2) * B))
    return min(roots, key=lnphi)


def cubic_real_roots(a, b, c):
    """Real roots of z^3 + a z^2 + b z + c = 0 (trigonometric / Cardano)."""
    p = b - a * a / 3
    q = 2 * a ** 3 / 27 - a * b / 3 + c
    disc = (q / 2) ** 2 + (p / 3) ** 3
    if disc > 0:
        s = math.sqrt(disc)
        u = math.copysign(abs(-q / 2 + s) ** (1 / 3), -q / 2 + s)
        v = math.copysign(abs(-q / 2 - s) ** (1 / 3), -q / 2 - s)
        return [u + v - a / 3]
    r = 2 * math.sqrt(-p / 3)
    phi = math.acos(max(-1.0, min(1.0, 3 * q / (p * r))))
    return [r * math.cos((phi - 2 * math.pi * k) / 3) - a / 3 for k in range(3)]


def co2_density(P_bar=100.0, T_C=37.0):
    """CO2 density [kg/m3].  Naive: ideal gas.  Corrected: Peng-Robinson
    (itself a few % off near the critical point; see the reference table)."""
    T = T_C + 273.15
    rho_ig = P_bar * 1e5 * CO2["M"] / 1e3 / (R * T)
    Z = peng_robinson_Z(T, P_bar, CO2["Tc"], CO2["Pc"], CO2["w"])
    return {"naive": rho_ig, "correct": rho_ig / Z, "unit": "kg/m³",
            "details": [f"T/Tc = {T / CO2['Tc']:.3f}, P/Pc = {P_bar / CO2['Pc']:.3f}",
                        f"Peng-Robinson Z = {Z:.4f}"]}


# ---------------------------------------------------------------- 7. shell-and-tube: LMTD correction factor
def lmtd(dt1, dt2):
    return dt1 if abs(dt1 - dt2) < 1e-12 else (dt1 - dt2) / math.log(dt1 / dt2)


def f_1_2(R_, P):
    """LMTD correction factor F for one shell pass, two (or 2n) tube passes; NaN where infeasible."""
    s = math.sqrt(R_ * R_ + 1)
    try:
        if abs(R_ - 1) < 1e-9:
            num = s * P / (1 - P)
        else:
            num = s / (R_ - 1) * math.log((1 - P) / (1 - R_ * P))
        den = math.log((2 - P * (R_ + 1 - s)) / (2 - P * (R_ + 1 + s)))
        F = num / den
    except (ValueError, ZeroDivisionError):
        return float("nan")
    return F if 0 < F <= 1.0000001 else float("nan")


def hx_area(Th_in=150.0, Th_out=90.0, Tc_in=30.0, Tc_out=100.0, Q_kW=1000.0, U=500.0):
    """Required area [m2] of a 1-shell-pass / 2-tube-pass exchanger.
    Naive: counter-current LMTD with F = 1.  Corrected: LMTD x F(R, P)."""
    dTlm = lmtd(Th_in - Tc_out, Th_out - Tc_in)
    R_ = (Th_in - Th_out) / (Tc_out - Tc_in)
    P = (Tc_out - Tc_in) / (Th_in - Tc_in)
    F = f_1_2(R_, P)
    A_n = Q_kW * 1e3 / (U * dTlm)
    cross = Tc_out > Th_out
    return {"naive": A_n, "correct": A_n / F if F == F else float("nan"), "unit": "m²",
            "details": [f"counter-current LMTD = {dTlm:.2f} K, R = {R_:.3f}, P = {P:.3f}",
                        f"F = {F:.3f}" if F == F else "F undefined: this duty is impossible in one 1-2 shell",
                        "temperature cross (cold outlet above hot outlet)" if cross else "no temperature cross",
                        "F below 0.75-0.8: use more shells in series" if F == F and F < 0.8 else ""]}


def hx_area_entu(Th_in=150.0, Th_out=90.0, Tc_in=30.0, Tc_out=100.0, Q_kW=1000.0, U=500.0):
    """Same area by the effectiveness-NTU method for a 1-2 shell (independent check of hx_area)."""
    Ch, Cc = Q_kW / (Th_in - Th_out), Q_kW / (Tc_out - Tc_in)   # kW/K
    Cmin, Cmax = min(Ch, Cc), max(Ch, Cc)
    Cr = Cmin / Cmax
    eps = Q_kW / (Cmin * (Th_in - Tc_in))
    s = math.sqrt(1 + Cr * Cr)
    # eps = 2 / (1 + Cr + s (1+e)/(1-e)), e = exp(-NTU s)  ->  solve for e
    g = (2 / eps - 1 - Cr) / s
    e = (g - 1) / (g + 1)
    if not 0 < e < 1:
        return float("nan")
    NTU = -math.log(e) / s
    return NTU * Cmin * 1e3 / U


# ---------------------------------------------------------------- 8. fire-case relief valve (API 520/521)
def relief_fire(A_wet_ft2=500.0, F_env=1.0, C_fire=21000.0, set_psig=250.0, overpressure_pct=21.0, Kd=0.975):
    """Required effective orifice area [in2] of a PSV on a propane vessel exposed to fire.
    Heat input Q = C_fire F A_wet^0.82 [Btu/h] (API 521; 21000 with adequate drainage and fire fighting).
    Vapour relief area, critical flow (API 520-1, US units): A = W sqrt(T Z / M) / (C Kd P1), with
    C = 520 sqrt(k (2/(k+1))^((k+1)/(k-1))).
    Naive: latent heat at the normal boiling point and Z = 1.  Corrected: both at relieving pressure."""
    P1_psia = set_psig * (1 + overpressure_pct / 100) + 14.696
    P1_bar = P1_psia / 14.503774
    sat = propane_sat(P1_bar)
    nbp = propane_sat(1.01325)
    M = 44.0956
    Q = C_fire * F_env * A_wet_ft2 ** 0.82          # Btu/h
    T_R = sat["T"] * 1.8
    k = sat["k"]
    C = 520 * math.sqrt(k * (2 / (k + 1)) ** ((k + 1) / (k - 1)))

    def area(lam_kJkg, Z):
        W = Q / (lam_kJkg * 0.429923)               # lb/h  (1 kJ/kg = 0.429923 Btu/lb)
        return W * math.sqrt(T_R * Z / M) / (C * Kd * P1_psia), W
    A_n, W_n = area(nbp["lam"], 1.0)
    A_c, W_c = area(sat["lam"], sat["Z"])
    return {"naive": A_n, "correct": A_c, "unit": "in²",
            "details": [f"relieving pressure = {P1_psia:.1f} psia = {P1_bar:.2f} bar a, T = {sat['T'] - 273.15:.1f} °C",
                        f"heat input = {Q / 1e6:.3f} MMBtu/h",
                        f"latent heat: at 1 atm {nbp['lam']:.0f} kJ/kg, at relief {sat['lam']:.0f} kJ/kg",
                        f"relief rate: naive {W_n:.0f} lb/h, corrected {W_c:.0f} lb/h; Z = {sat['Z']:.3f}, k = {k:.3f}",
                        "near the critical point (42.5 bar): latent heat goes to zero; use API 520 Annex B (direct integration)"
                        if P1_bar > 35 else ""]}


# ---------------------------------------------------------------- 9. semi-batch reactor scale-up
def vessel_area(V_m3, HD):
    """Jacketed area [m2] of a flat-bottomed cylinder holding V of liquid at height/diameter HD (wall + bottom)."""
    D = (4 * V_m3 / (math.pi * HD)) ** (1 / 3)
    return math.pi * D * (HD * D) + math.pi * D * D / 4, D


def scaleup(V_plant_m3=10.0, V_lab_L=1.0, HD=1.0, q_kJ_L=300.0, U=400.0, dT_K=30.0, t_lab_min=30.0, rho_cp_kJ_LK=1.62):
    """Shortest feed (dosing) time [min] at which the jacket can remove the reaction heat.
    Naive: keep the lab dosing time.  Corrected: t = q V / (U A dT), which grows as V^(1/3)."""
    def t_min(V):
        A, D = vessel_area(V, HD)
        return q_kJ_L * V * 1e3 * 1e3 / (U * A * dT_K) / 60, A, D
    t_lab, A_lab, _ = t_min(V_lab_L / 1e3)
    t_pl, A_pl, D_pl = t_min(V_plant_m3)
    return {"naive": t_lab_min, "correct": max(t_pl, t_lab_min), "unit": "min",
            "details": [f"area/volume: lab {A_lab / (V_lab_L / 1e3):.0f} 1/m, plant {A_pl / V_plant_m3:.2f} 1/m",
                        f"plant vessel D = {D_pl:.2f} m; lab shortest dosing time = {t_lab:.2f} min",
                        f"with the lab dosing time the plant heat release is {t_pl / t_lab_min:.1f}x the jacket duty"
                        if t_pl > t_lab_min else "lab dosing time is within the plant jacket duty",
                        f"adiabatic temperature rise of the full charge = {q_kJ_L / rho_cp_kJ_LK:.0f} K",
                        "uses the full-batch area: early in the feed the wetted area is smaller, so this time is optimistic"]}


# ---------------------------------------------------------------- 10. flash steam in condensate return
def flash_steam(P1_barg=10.0, P2_barg=0.0, m_kg_h=1000.0, Patm_bar=1.01325):
    """Volumetric flow [m3/h] in the condensate return after a steam trap.
    Naive: it is all liquid.  Corrected: flash fraction x = (h_l(P1) - h_l(P2)) / (h_v(P2) - h_l(P2)),
    homogeneous two-phase volume."""
    T1 = water_tsat((P1_barg + Patm_bar) * 100)
    T2 = water_tsat((P2_barg + Patm_bar) * 100)
    s1, s2 = water_sat(T1), water_sat(T2)
    x = (s1["h_l"] - s2["h_l"]) / (s2["h_v"] - s2["h_l"])
    V_liq = m_kg_h / s1["rho_l"]
    V_mix = m_kg_h * (x / s2["rho_v"] + (1 - x) / s2["rho_l"])
    T1g = water_tsat(P1_barg * 100) if P1_barg * 100 > 0.7 else float("nan")
    return {"naive": V_liq, "correct": V_mix, "unit": "m³/h",
            "details": [f"saturation T: {T1 - 273.15:.1f} °C at {P1_barg:g} barg, {T2 - 273.15:.1f} °C at {P2_barg:g} barg",
                        f"flash fraction = {100 * x:.1f} % by mass, {100 * x / s2['rho_v'] / (V_mix / m_kg_h):.1f} % by volume",
                        f"if the pressures are read as absolute: T_sat = {T1g - 273.15:.1f} °C at {P1_barg:g} bar a"
                        if T1g == T1g else ""]}


# ---------------------------------------------------------------- registry used by the page and the tests
CASES = [
    {"id": "compressor", "fn": compressor, "title": "Gauge vs absolute pressure in a compression ratio",
     "quantity": "Isentropic discharge temperature", "naive": "Ratio of gauge pressures", "correct": "Ratio of absolute pressures",
     "inputs": [("P1_psig", "Suction pressure [psig]", 1), ("P2_psig", "Discharge pressure [psig]", 5),
                ("T1_C", "Suction temperature [°C]", 1), ("k", "cp/cv k [-]", 0.01), ("Patm_psia", "Atmospheric pressure [psia]", 0.1),
                ("eta", "Isentropic efficiency (detail only) [-]", 0.05)],
     "sweep": ("P1_psig", 1.0, 40.0)},
    {"id": "pipe", "fn": pipe_dp, "title": "Pipe pressure drop: friction factor and fittings",
     "quantity": "Frictional pressure drop", "naive": "Straight pipe only", "correct": "Pipe + fittings and valves",
     "inputs": [("Q_m3h", "Flow [m³/h]", 5), ("D_mm", "Inside diameter [mm]", 1), ("L_m", "Straight length [m]", 10),
                ("rough_mm", "Roughness [mm]", 0.01), ("K_fittings", "Sum of fitting K [-]", 0.5),
                ("rho", "Density [kg/m³]", 1), ("mu_cP", "Viscosity [cP]", 0.1)],
     "sweep": ("Q_m3h", 5.0, 150.0)},
    {"id": "npsh", "fn": npsh, "title": "NPSH available for a hot liquid",
     "quantity": "NPSH available", "naive": "Cold-water properties", "correct": "Properties at pumping temperature",
     "inputs": [("T_C", "Liquid temperature [°C]", 1), ("P_surf_kPa", "Pressure on liquid surface [kPa abs]", 1),
                ("z_m", "Lowest liquid level above pump suction [m]", 0.1), ("hf_m", "Suction line losses [m]", 0.1)],
     "sweep": ("T_C", 20.0, 99.0)},
    {"id": "valve", "fn": valve, "title": "Control valve on a hot liquid: choked and flashing flow",
     "quantity": "Required Kv", "naive": "Full pressure drop", "correct": "Choked pressure drop (IEC 60534)",
     "inputs": [("Q_m3h", "Flow [m³/h]", 5), ("P1_bar", "Inlet pressure [bar abs]", 0.1), ("P2_bar", "Outlet pressure [bar abs]", 0.1),
                ("T_C", "Water temperature [°C]", 1), ("FL", "Liquid recovery factor FL [-]", 0.05),
                ("xFz", "Incipient cavitation factor xFz [-]", 0.05)],
     "sweep": ("P2_bar", 0.2, 5.5)},
    {"id": "vle", "fn": vle, "title": "Non-ideal VLE: ethanol-water near the azeotrope",
     "quantity": "Vapour ethanol content y", "naive": "Raoult's law", "correct": "van Laar activity coefficients",
     "inputs": [("x1", "Liquid ethanol mole fraction x [-]", 0.01), ("P_kPa", "Pressure [kPa abs]", 1)],
     "sweep": ("x1", 0.01, 0.99)},
    {"id": "co2", "fn": co2_density, "title": "Dense-phase CO2: ideal gas vs an equation of state",
     "quantity": "CO2 density", "naive": "Ideal gas", "correct": "Peng-Robinson",
     "inputs": [("P_bar", "Pressure [bar abs]", 5), ("T_C", "Temperature [°C]", 1)],
     "sweep": ("P_bar", 1.0, 150.0)},
    {"id": "hx", "fn": hx_area, "title": "Shell-and-tube area: LMTD correction and temperature cross",
     "quantity": "Required area", "naive": "Counter-current LMTD (F = 1)", "correct": "1-2 shell, LMTD × F",
     "inputs": [("Th_in", "Hot inlet [°C]", 1), ("Th_out", "Hot outlet [°C]", 1), ("Tc_in", "Cold inlet [°C]", 1),
                ("Tc_out", "Cold outlet [°C]", 1), ("Q_kW", "Duty [kW]", 50), ("U", "U [W/(m²·K)]", 10)],
     "sweep": ("Tc_out", 40.0, 105.0)},
    {"id": "relief", "fn": relief_fire, "title": "Fire-case relief valve: latent heat at relieving conditions",
     "quantity": "Required orifice area", "naive": "Latent heat at 1 atm, Z = 1", "correct": "Properties at relieving pressure",
     "inputs": [("A_wet_ft2", "Wetted area within 25 ft of grade [ft²]", 10), ("F_env", "Environment factor F [-]", 0.1),
                ("C_fire", "Heat-input constant [21000 or 34500]", 500), ("set_psig", "Set pressure [psig]", 10),
                ("overpressure_pct", "Allowed overpressure [%]", 1), ("Kd", "Discharge coefficient Kd [-]", 0.005)],
     "sweep": ("set_psig", 20.0, 450.0)},
    {"id": "scaleup", "fn": scaleup, "title": "Semi-batch scale-up: heat removal falls with size",
     "quantity": "Shortest safe dosing time", "naive": "Keep the lab dosing time", "correct": "Limited by plant jacket duty",
     "inputs": [("V_plant_m3", "Plant liquid volume [m³]", 0.5), ("V_lab_L", "Lab liquid volume [L]", 0.1),
                ("HD", "Liquid height / diameter [-]", 0.1), ("q_kJ_L", "Reaction heat [kJ per L of batch]", 10),
                ("U", "Overall U [W/(m²·K)]", 10), ("dT_K", "Mass - jacket ΔT [K]", 1),
                ("t_lab_min", "Lab dosing time [min]", 5), ("rho_cp_kJ_LK", "ρ·cp [kJ/(L·K)]", 0.01)],
     "sweep": ("V_plant_m3", 0.01, 40.0)},
    {"id": "flash", "fn": flash_steam, "title": "Condensate return: flash steam dominates the volume",
     "quantity": "Volumetric flow after the trap", "naive": "All liquid", "correct": "Liquid + flash steam",
     "inputs": [("P1_barg", "Steam / trap inlet pressure [barg]", 0.5), ("P2_barg", "Return line pressure [barg]", 0.1),
                ("m_kg_h", "Condensate flow [kg/h]", 50), ("Patm_bar", "Atmospheric pressure [bar]", 0.01)],
     "sweep": ("P1_barg", 0.5, 40.0)},
]


def defaults(case):
    """Default inputs of a case, read from its function signature."""
    fn = case["fn"]
    names = fn.__code__.co_varnames[:fn.__code__.co_argcount]
    return dict(zip(names, fn.__defaults__))


def run(case_id, inputs=None):
    """Run one case; returns its result dict plus the percent difference corrected vs naive."""
    case = next(c for c in CASES if c["id"] == case_id)
    kw = defaults(case)
    kw.update(inputs or {})
    r = case["fn"](**kw)
    n, c = r["naive"], r["correct"]
    r["diff_pct"] = 100 * (n - c) / c if c == c and c != 0 else float("nan")
    r["details"] = [d for d in r["details"] if d]
    return r


def sweep(case_id, inputs=None, n=60):
    """Both answers over the case's sweep variable (other inputs held fixed)."""
    case = next(c for c in CASES if c["id"] == case_id)
    name, lo, hi = case["sweep"]
    xs, ns, cs = [], [], []
    for i in range(n):
        x = lo + (hi - lo) * i / (n - 1)
        kw = dict(inputs or {})
        kw[name] = x
        try:
            r = run(case_id, kw)
        except (ValueError, ZeroDivisionError, OverflowError):
            continue
        xs.append(x)
        ns.append(r["naive"])
        cs.append(r["correct"] if r["correct"] == r["correct"] else None)
    label = next(lab for nm, lab, _ in case["inputs"] if nm == name)
    return {"x": xs, "naive": ns, "correct": cs, "xlabel": label}


def co2_table():
    """Markdown table: ideal gas and Peng-Robinson vs the Span-Wagner reference (CoolProp, build time)."""
    rows = ["| T [K] | P [bar] | Reference ρ [kg/m³] | Ideal gas error | Peng-Robinson error |", "|---|---|---|---|---|"]
    for T, P, rho in CO2_REF:
        r = co2_density(P, T - 273.15)
        rows.append(f"| {T:g} | {P:g} | {rho:.1f} | {100 * (r['naive'] / rho - 1):+.1f} % | {100 * (r['correct'] / rho - 1):+.1f} % |")
    return "\n".join(rows)
