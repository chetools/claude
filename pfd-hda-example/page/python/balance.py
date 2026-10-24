"""Component balance model of the toluene hydrodealkylation (HDA) plant of
process flow diagrams PFD-201 and PFD-202.

The model computes the molar flow of each component in every numbered
stream of the two sheets at one steady operating point. Symbols, as
defined in the Theory panel (molar flows in kilomole per hour, kmol/h):

  F      fresh toluene feed rate, kmol/h (stream 1)
  X      toluene conversion per pass in the reactor R-201, dimensionless
  beta   purge fraction: share of the high-pressure separator vapour
         (stream 12) sent to the purge (stream 13), dimensionless
  r      hydrogen-to-toluene molar ratio at the reactor inlet (stream 9),
         dimensionless
  xi1    extent of the main reaction  T + H2 -> B + CH4, kmol/h
  xi2    extent of the side reaction  2 B -> D + H2, kmol/h; fixed here as
         xi2 = sigma * xi1 with sigma = 0.005
Components: H2 hydrogen, CH4 methane, B benzene, T toluene, D diphenyl.

Unit rules (sample design basis, not a rigorous simulation): the flash
drums and the vent send fixed fractions of each component to the vapour;
the columns recover fixed fractions of each component in the distillate;
the reflux is R times the distillate; the boil-up total equals the
overhead vapour total, with composition proportional to relative
volatility times bottoms composition. The make-up gas (95 mol% H2,
5 mol% CH4) is sized so that the reactor-inlet ratio equals r.

Two solution methods for the same equations:
  solve()       floating point; the flowsheet is affine in its tear
                variables (toluene recycle, recycle gas, make-up rate), so
                the steady state is the solution of one linear system;
  solve_iter()  successive substitution in floating point (independent
                check), or in integer tenths of kmol/h with every split
                rounded and its last outlet taken by difference, so that
                every balance closes exactly on the displayed values.
Pure Python (no third-party packages): runs unchanged in Pyodide.
"""

C = ["H2", "CH4", "B", "T", "D"]
NAME = {"H2": "Hydrogen", "CH4": "Methane", "B": "Benzene", "T": "Toluene", "D": "Diphenyl"}
STREAMS = list(range(1, 42))

# ---- design basis of the sheets (sample values) ----
BASIS = {"F": 100.0, "X": 0.75, "beta": 0.25, "r": 5.0}
SIGMA = 0.005                                   # xi2 / xi1
HMAKE = {"H2": 0.95, "CH4": 0.05}               # make-up gas mole fractions
VAP_HP = {"H2": 0.995, "CH4": 0.97, "B": 0.03, "T": 0.01, "D": 0.0}    # V-202 to vapour
VAP_LP = {"H2": 0.98, "CH4": 0.90, "B": 0.02, "T": 0.005, "D": 0.0}    # V-203 to vapour
VENT1 = {"H2": 1.0, "CH4": 1.0, "B": 0.001, "T": 0.0, "D": 0.0}        # V-204 vent
COL1 = dict(rec={"H2": 1.0, "CH4": 1.0, "B": 0.995, "T": 0.005, "D": 0.0}, R=1.2,
            alpha={"H2": 1.0, "CH4": 1.0, "B": 2.5, "T": 1.0, "D": 0.05})  # T-201
COL2 = dict(rec={"H2": 1.0, "CH4": 1.0, "B": 1.0, "T": 0.99, "D": 0.0}, R=0.8,
            alpha={"H2": 1.0, "CH4": 1.0, "B": 1.0, "T": 15.0, "D": 1.0})  # T-202

# Displayed design-basis values of the sheets (kmol/h), the anchor of the
# page: solve_iter(exact=True) at BASIS must reproduce them exactly.
DESIGN_ANCHOR = {
    1: {"T": 100.0}, 5: {"H2": 241.4, "CH4": 12.7}, 9: {"H2": 661.0, "T": 132.2},
    13: {"H2": 139.9, "CH4": 99.6}, 15: {"H2": 419.6, "CH4": 298.7},
    19: {"H2": 142.6, "CH4": 110.7, "B": 2.8}, 28: {"B": 95.3, "T": 0.2},
    37: {"B": 0.5, "T": 32.0}, 40: {"T": 0.3, "D": 0.5},
}

RANGES = {"F": (10.0, 500.0, "fresh toluene feed rate F", "kmol/h"),
          "X": (0.30, 0.95, "conversion per pass X", ""),
          "beta": (0.05, 0.60, "purge fraction beta", ""),
          "r": (2.0, 10.0, "hydrogen-to-toluene ratio r", "")}


def check_inputs(F, X, beta, r):
    """Plain-language validation; returns the inputs as floats or raises ValueError."""
    vals = {}
    for k, v in (("F", F), ("X", X), ("beta", beta), ("r", r)):
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"The {RANGES[k][2]} must be a number.")
        lo, hi, name, unit = RANGES[k]
        if not (lo <= v <= hi) or v != v:
            u = f" {unit}" if unit else ""
            raise ValueError(f"The {name} must lie between {lo:g} and {hi:g}{u}.")
        vals[k] = v
    return vals


def _add(*ss):
    return {c: sum(s[c] for s in ss) for c in C}


def _q(v, exact):
    return int(round(v)) if exact else v


def _split(s, f, exact):
    """Split s: fraction f[c] of each component to the first outlet, the
    second outlet by difference (exact closure in integer arithmetic)."""
    a = {c: _q(s[c] * f[c], exact) for c in C}
    return a, {c: s[c] - a[c] for c in C}


def _pass(p, s37, s15, fh, exact=False):
    """One pass through the flowsheet from the tear values.
    s37: toluene recycle, s15: recycle gas, fh: make-up gas rate.
    Returns all streams, the new tear values and the ratio residual."""
    U = 10 if exact else 1
    z = {c: 0 for c in C}
    S = {}
    S[1] = dict(z, T=_q(p["F"] * U, exact))
    S[2] = _add(S[1], s37); S[3] = S[2]; S[4] = S[3]
    S[5] = {c: _q(fh * HMAKE.get(c, 0.0), exact) for c in C}
    S[6] = _add(S[5], s15); S[7] = _add(S[4], S[6]); S[8] = S[7]; S[9] = S[8]
    xi1 = _q(p["X"] * S[9]["T"], exact)
    xi2 = _q(SIGMA * p["X"] * S[9]["T"], exact)
    s10 = dict(S[9])
    s10["T"] -= xi1; s10["H2"] += -xi1 + xi2; s10["B"] += xi1 - 2 * xi2
    s10["CH4"] += xi1; s10["D"] += xi2
    S[10] = s10; S[11] = s10
    S[12], S[16] = _split(S[11], VAP_HP, exact)
    S[13], S[14] = _split(S[12], {c: p["beta"] for c in C}, exact)
    S[17] = S[16]
    S[18], S[20] = _split(S[17], VAP_LP, exact)
    S[41] = S[13]
    S[19] = _add(S[41], S[18])
    S[21] = S[20]
    dist, bot = _split(S[21], COL1["rec"], exact)
    S[24], S[28] = _split(dist, VENT1, exact)
    S[27] = {c: _q(S[28][c] * COL1["R"], exact) for c in C}
    S[26] = _add(S[27], S[28]); S[25] = S[26]; S[23] = _add(S[24], S[25]); S[22] = S[23]
    w = {c: COL1["alpha"][c] * bot[c] for c in C}; sw = sum(w.values()) or 1.0
    V1 = sum(S[22].values())
    S[30] = {c: _q(V1 * w[c] / sw, exact) for c in C}
    S[31] = bot; S[29] = _add(S[30], S[31])
    S[37], S[40] = _split(S[31], COL2["rec"], exact)
    S[36] = {c: _q(S[37][c] * COL2["R"], exact) for c in C}
    S[35] = _add(S[36], S[37]); S[34] = S[35]; S[33] = S[34]; S[32] = S[33]
    w = {c: COL2["alpha"][c] * S[40][c] for c in C}; sw = sum(w.values()) or 1.0
    V2 = sum(S[32].values())
    S[39] = {c: _q(V2 * w[c] / sw, exact) for c in C}
    S[38] = _add(S[39], S[40])
    S[15] = S[14]
    resid = p["r"] * S[9]["T"] - S[9]["H2"]
    return S, S[37], S[14], resid, (xi1, xi2)


def _unpack(u):
    return ({c: u[i] for i, c in enumerate(C)}, {c: u[5 + i] for i, c in enumerate(C)}, u[10])


def _residual(p, u):
    s37, s15, fh = _unpack(u)
    _, n37, n15, res, _ = _pass(p, s37, s15, fh)
    return [s37[c] - n37[c] for c in C] + [s15[c] - n15[c] for c in C] + [res]


def _gauss(A, b):
    """Solve A x = b by Gaussian elimination with partial pivoting."""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for k in range(n):
        piv = max(range(k, n), key=lambda i: abs(M[i][k]))
        if abs(M[piv][k]) < 1e-14:
            raise ValueError("The balance equations have no unique solution at these inputs.")
        M[k], M[piv] = M[piv], M[k]
        for i in range(k + 1, n):
            f = M[i][k] / M[k][k]
            if f:
                for j in range(k, n + 1):
                    M[i][j] -= f * M[k][j]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (M[i][n] - sum(M[i][j] * x[j] for j in range(i + 1, n))) / M[i][i]
    return x


def solve(F=None, X=None, beta=None, r=None):
    """Steady state in floating point by one linear solve (the flowsheet is
    affine in the tear variables). Returns (streams, extents)."""
    p = check_inputs(*(BASIS[k] if v is None else v for k, v in
                       (("F", F), ("X", X), ("beta", beta), ("r", r))))
    u0 = [0.0] * 11
    f0 = _residual(p, u0)
    J = [[0.0] * 11 for _ in range(11)]
    for j in range(11):
        e = u0[:]; e[j] = 1.0
        fj = _residual(p, e)
        for i in range(11):
            J[i][j] = fj[i] - f0[i]
    u = _gauss(J, [-v for v in f0])
    s37, s15, fh = _unpack(u)
    S, n37, n15, res, ext = _pass(p, s37, s15, fh)
    gap = max([abs(s37[c] - n37[c]) for c in C] + [abs(s15[c] - n15[c]) for c in C] + [abs(res)])
    if gap > 1e-6 * max(1.0, p["F"]):
        raise ValueError("The balance did not close at these inputs.")
    return S, ext


def solve_iter(F=None, X=None, beta=None, r=None, exact=False, max_iter=20000):
    """Successive substitution (independent check); exact=True works in
    integer tenths of kmol/h and returns values rounded to 0.1 kmol/h."""
    p = check_inputs(*(BASIS[k] if v is None else v for k, v in
                       (("F", F), ("X", X), ("beta", beta), ("r", r))))
    U = 10 if exact else 1
    s37 = {c: 0 for c in C}; s15 = {c: 0 for c in C}; fh = 3.0 * p["F"] * U
    for it in range(max_iter):
        S, n37, n15, res, ext = _pass(p, s37, s15, fh, exact)
        fh_new = fh + 0.8 * res / HMAKE["H2"]
        if exact:
            done = n37 == s37 and n15 == s15 and _q(fh_new, True) == _q(fh, True)
        else:
            done = (max(abs(n37[c] - s37[c]) + abs(n15[c] - s15[c]) for c in C) < 1e-11
                    and abs(fh_new - fh) < 1e-9)
        s37, s15, fh = n37, n15, fh_new
        if done:
            break
    else:
        raise RuntimeError("successive substitution did not converge")
    if exact:
        S = {n: {c: v / 10 for c, v in s.items()} for n, s in S.items()}
        ext = (ext[0] / 10, ext[1] / 10)
    return S, ext


def evaluate(F=None, X=None, beta=None, r=None):
    """Page model: streams plus the summary quantities shown as metric cards.
    Raises ValueError with a plain-language message for invalid inputs."""
    S, (xi1, xi2) = solve(F, X, beta, r)
    Fv = S[1]["T"]
    h2_lost = S[19]["H2"] + S[24]["H2"]
    out = {
        "inputs": {"F": Fv, "X": BASIS["X"] if X is None else float(X),
                   "beta": BASIS["beta"] if beta is None else float(beta),
                   "r": BASIS["r"] if r is None else float(r)},
        "benzene_product": S[28]["B"],                     # kmol/h
        "benzene_purity": S[28]["B"] / sum(S[28].values()),
        "yield": S[28]["B"] / Fv,                          # mol benzene per mol fresh toluene
        "selectivity": (xi1 - 2 * xi2) / xi1,              # benzene formed per toluene converted
        "toluene_recycle": S[37]["T"],
        "reactor_toluene": S[9]["T"],
        "recycle_gas": sum(S[15].values()),
        "recycle_gas_ch4": S[15]["CH4"] / sum(S[15].values()),
        "makeup_gas": sum(S[5].values()),
        "makeup_h2": S[5]["H2"],
        "h2_consumed": xi1 - xi2,
        "h2_lost": h2_lost,
        "h2_efficiency": (xi1 - xi2) / S[5]["H2"],
        "purge": sum(S[13].values()),
        "diphenyl": S[40]["D"],
        "fuel_gas": sum(S[19].values()) + sum(S[24].values()),
        "xi1": xi1, "xi2": xi2,
        "streams": {n: S[n] for n in STREAMS},
    }
    return out


def sweep(var, values, **fixed):
    """Evaluate the model along one input; returns a list of result dicts."""
    res = []
    for v in values:
        kw = dict(fixed); kw[var] = v
        res.append(evaluate(**kw))
    return res
