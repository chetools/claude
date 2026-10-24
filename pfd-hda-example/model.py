"""Simple component-balance model of the HDA plant (sample values).

Two independent calculations of the same flowsheet:
  1. `solve_float`  - successive substitution in floating point (reference);
  2. `solve_tenths` - the same unit rules in integer tenths of kmol/h, every
     split rounded and its last outlet taken by difference, so that every unit
     balance formed from the DISPLAYED values (0.1 kmol/h) closes exactly
     (PFD-SPEC-001 requirement A5).
The two must agree to within display rounding; checked in main().

Assumptions (sample design basis, not a converged rigorous simulation):
  reactions   T + H2 -> B + CH4   (toluene conversion per pass X = 0.75)
              2 B -> D + H2      (extent = 0.005 x extent of reaction 1)
  make-up H2  95 mol% H2, 5 mol% CH4; flow set so that H2/toluene = 5 at the
              reactor inlet
  purge       25 % of the high-pressure separator vapour
  flashes     fixed fractions of each component to the vapour
  columns     fixed recoveries to the distillate; reflux ratio R; boil-up
              total equal to the overhead vapour total (constant molar
              overflow, saturated-liquid feed), boil-up composition
              y_i ~ alpha_i x_i of the bottoms product
Temperatures and pressures are nominal sample values, not computed.
"""
import json, pathlib

C = ["H2", "CH4", "B", "T", "D"]          # hydrogen, methane, benzene, toluene, diphenyl
NAME = {"H2": "Hydrogen", "CH4": "Methane", "B": "Benzene", "T": "Toluene", "D": "Diphenyl"}
FRESH_T = 100.0
X, SEL2 = 0.75, 0.005
HMAKE = {"H2": 0.95, "CH4": 0.05}
RATIO_H2_T = 5.0
PURGE = 0.25
VAP_HP = {"H2": 0.995, "CH4": 0.97, "B": 0.03, "T": 0.01, "D": 0.0}   # V-202
VAP_LP = {"H2": 0.98, "CH4": 0.90, "B": 0.02, "T": 0.005, "D": 0.0}   # V-203
COL1 = dict(rec={"H2": 1.0, "CH4": 1.0, "B": 0.995, "T": 0.005, "D": 0.0}, R=1.2,
            alpha={"H2": 1.0, "CH4": 1.0, "B": 2.5, "T": 1.0, "D": 0.05})
VENT1 = {"H2": 1.0, "CH4": 1.0, "B": 0.01, "T": 0.0, "D": 0.0}       # V-204 vent
COL2 = dict(rec={"H2": 1.0, "CH4": 1.0, "B": 1.0, "T": 0.99, "D": 0.0}, R=0.8,
            alpha={"H2": 1.0, "CH4": 1.0, "B": 1.0, "T": 15.0, "D": 1.0})

# nominal temperature (deg C), pressure (kPa), phase  -- sample values
TPP = {1: (25, 190, "Liquid"), 2: (50, 160, "Liquid"), 3: (50, 160, "Liquid"),
       4: (51, 2700, "Liquid"), 5: (25, 2600, "Vapour"), 6: (40, 2550, "Vapour"),
       7: (45, 2550, "Mixed"), 8: (230, 2500, "Vapour"), 9: (600, 2450, "Vapour"),
       10: (650, 2400, "Vapour"), 11: (38, 2350, "Mixed"), 12: (38, 2350, "Vapour"),
       13: (38, 2350, "Vapour"), 14: (38, 2350, "Vapour"), 15: (45, 2550, "Vapour"),
       16: (38, 2350, "Liquid"), 17: (37, 280, "Mixed"), 18: (37, 280, "Vapour"),
       19: (37, 250, "Vapour"), 20: (37, 280, "Liquid"), 21: (90, 250, "Liquid"),
       22: (100, 220, "Vapour"), 23: (45, 200, "Mixed"), 24: (45, 200, "Vapour"),
       25: (45, 200, "Liquid"), 26: (45, 400, "Liquid"), 27: (45, 400, "Liquid"),
       28: (45, 400, "Liquid"), 29: (150, 230, "Liquid"), 30: (152, 230, "Vapour"),
       31: (152, 230, "Liquid"), 32: (128, 160, "Vapour"), 33: (120, 150, "Liquid"),
       34: (120, 150, "Liquid"), 35: (121, 350, "Liquid"), 36: (121, 350, "Liquid"),
       37: (121, 350, "Liquid"), 38: (270, 170, "Liquid"), 39: (272, 170, "Vapour"),
       40: (272, 170, "Liquid")}


class Arith:
    """Float arithmetic (exact=False) or integer tenths with rounding (exact=True)."""
    def __init__(self, exact):
        self.exact = exact
    def q(self, v):
        return int(round(v)) if self.exact else v
    def frac(self, s, f):
        """Split stream s: fraction f[c] to the first outlet; second by difference."""
        a = {c: self.q(s[c] * f[c]) for c in C}
        return a, {c: s[c] - a[c] for c in C}
    def scale(self, s, k):
        a = {c: self.q(s[c] * k) for c in C}
        return a, {c: s[c] - a[c] for c in C}


def add(*ss):
    return {c: sum(s[c] for s in ss) for c in C}


def run(A, tol_iter=2000):
    U = 10 if A.exact else 1            # flows in tenths (exact) or kmol/h
    z = {c: 0 for c in C}
    s1 = dict(z, T=A.q(FRESH_T * U))
    s37 = dict(z)                        # tear: toluene recycle
    s15 = dict(z)                        # tear: recycle gas
    fh = 300.0 * U
    for it in range(tol_iter):
        s2 = add(s1, s37); s3 = s2; s4 = s3
        s5 = {c: A.q(fh * HMAKE.get(c, 0.0)) for c in C}
        s6 = add(s5, s15); s7 = add(s4, s6); s8 = s7; s9 = s8
        x1 = A.q(X * s9["T"]); x2 = A.q(SEL2 * X * s9["T"])
        s10 = dict(s9)
        s10["T"] -= x1; s10["H2"] += -x1 + x2; s10["B"] += x1 - 2 * x2
        s10["CH4"] += x1; s10["D"] += x2
        s11 = s10
        s12, s16 = A.frac(s11, VAP_HP)
        s13, s14 = A.frac(s12, {c: PURGE for c in C})
        new15 = s14
        s17 = s16
        s18, s20 = A.frac(s17, VAP_LP)
        s19 = add(s13, s18)
        # T-201 benzene column
        s21 = s20
        dist, bot = A.frac(s21, COL1["rec"])              # overhead products / bottoms product
        s24, liq = A.frac(dist, VENT1)                    # vent and benzene product (before reflux)
        s28 = liq
        s27 = {c: A.q(liq[c] * COL1["R"]) for c in C}     # reflux, same composition
        s26 = add(s27, s28); s25 = s26
        s23 = add(s24, s25); s22 = s23
        V1 = sum(s22.values())
        w1 = {c: COL1["alpha"][c] * bot[c] for c in C}; sw1 = sum(w1.values())
        s30 = {c: A.q(V1 * w1[c] / sw1) for c in C}       # boil-up
        s31 = bot
        s29 = add(s30, s31)
        # T-202 toluene column
        dist2, bot2 = A.frac(s31, COL2["rec"])
        s37n = dist2
        s36 = {c: A.q(dist2[c] * COL2["R"]) for c in C}
        s35 = add(s36, s37n); s34 = s35; s33 = s34; s32 = s33
        V2 = sum(s32.values())
        w2 = {c: COL2["alpha"][c] * bot2[c] for c in C}; sw2 = sum(w2.values())
        s39 = {c: A.q(V2 * w2[c] / sw2) for c in C}
        s40 = bot2
        s38 = add(s39, s40)
        # make-up H2 to meet the reactor-inlet ratio (relaxed update)
        fh_new = fh + 0.8 * (RATIO_H2_T * s9["T"] - s9["H2"]) / HMAKE["H2"]
        done = (s37n == s37 and new15 == s15 and A.q(fh_new) == A.q(fh)) if A.exact else \
               (max(abs(s37n[c] - s37[c]) + abs(new15[c] - s15[c]) for c in C) < 1e-11 and abs(fh_new - fh) < 1e-9)
        s37, s15, fh = s37n, new15, fh_new
        if done:
            break
    else:
        raise RuntimeError("balance model did not converge")
    loc = locals()
    S = {n: loc[f"s{n}"] for n in range(1, 41)}
    if A.exact:
        S = {n: {c: v / 10 for c, v in s.items()} for n, s in S.items()}
    return S, it


def main():
    Sf, itf = run(Arith(False))
    St, itt = run(Arith(True))
    worst = max(abs(Sf[n][c] - St[n][c]) for n in Sf for c in C)
    print(f"float model converged in {itf} iterations; tenths model in {itt}")
    print(f"max |float - displayed| over all streams and components: {worst:.3f} kmol/h")
    assert worst < 1.0, worst
    out = {"components": C, "names": NAME, "assumptions": __doc__,
           "streams": {str(n): {"flows": {c: round(St[n][c], 1) for c in C},
                                "total": round(sum(St[n].values()), 1),
                                "T": TPP[n][0], "P": TPP[n][1], "phase": TPP[n][2]}
                       for n in range(1, 41)},
           "float_reference": {str(n): Sf[n] for n in Sf}}
    pathlib.Path(__file__).with_name("streams.json").write_text(json.dumps(out, indent=1))
    for n in range(1, 41):
        s = St[n]
        print(f"{n:3d} " + " ".join(f"{s[c]:8.1f}" for c in C) + f" | {sum(s.values()):8.1f}")


if __name__ == "__main__":
    main()
