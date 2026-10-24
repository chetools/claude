"""Simple component-balance model of the HDA plant (sample values).

The unit rules live in page/python/balance.py (shared with the page's live
model). Two calculations of the same flowsheet are compared here:
  1. floating point (reference);
  2. integer tenths of kmol/h, every split rounded and its last outlet taken
     by difference, so that every unit balance formed from the DISPLAYED
     values (0.1 kmol/h) closes exactly (PFD-SPEC-001 requirement A5).
The two must agree to within display rounding; checked in main().

Assumptions (sample design basis, not a converged rigorous simulation):
  reactions   T + H2 -> B + CH4   (toluene conversion per pass X = 0.75)
              2 B -> D + H2      (extent = 0.005 x extent of reaction 1)
  make-up H2  95 mol% H2, 5 mol% CH4; flow set so that H2/toluene = 5 at the
              reactor inlet
  purge       25 % of the high-pressure separator vapour
  flashes     fixed fractions of each component to the vapour
  columns     fixed recoveries to the distillate; reflux ratio R; boil-up
              total equal to the overhead vapour total (an assumption of the
              model), boil-up composition y_i ~ alpha_i x_i of the bottoms
              product
Temperatures and pressures are nominal sample values; the column
temperatures were set near ideal-solution (Raoult + Antoine) bubble points
of the displayed compositions, see bubble_points().
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).parent / "page" / "python"))
import balance  # the single source of the unit rules (also run by the page)

C, NAME = balance.C, balance.NAME

# nominal temperature (deg C), pressure (kPa), phase  -- sample values
TPP = {1: (25, 190, "Liquid"), 2: (50, 160, "Liquid"), 3: (50, 160, "Liquid"),
       4: (51, 2700, "Liquid"), 5: (25, 2600, "Vapour"), 6: (40, 2550, "Vapour"),
       7: (45, 2550, "Mixed"), 8: (230, 2500, "Vapour"), 9: (600, 2450, "Vapour"),
       10: (650, 2400, "Vapour"), 11: (38, 2350, "Mixed"), 12: (38, 2350, "Vapour"),
       13: (38, 2350, "Vapour"), 14: (38, 2350, "Vapour"), 15: (45, 2550, "Vapour"),
       16: (38, 2350, "Liquid"), 17: (37, 280, "Mixed"), 18: (37, 280, "Vapour"),
       19: (37, 250, "Vapour"), 20: (37, 280, "Liquid"), 21: (90, 250, "Liquid"),
       22: (108, 220, "Vapour"), 23: (45, 200, "Mixed"), 24: (45, 200, "Vapour"),
       25: (45, 200, "Liquid"), 26: (45, 400, "Liquid"), 27: (45, 400, "Liquid"),
       28: (45, 400, "Liquid"), 29: (141, 230, "Liquid"), 30: (142, 230, "Vapour"),
       31: (142, 230, "Liquid"), 32: (127, 160, "Vapour"), 33: (120, 150, "Liquid"),
       34: (120, 150, "Liquid"), 35: (121, 350, "Liquid"), 36: (121, 350, "Liquid"),
       37: (121, 350, "Liquid"), 38: (134, 170, "Liquid"), 39: (173, 170, "Vapour"),
       40: (173, 170, "Liquid"), 41: (35, 260, "Vapour")}




class Arith:
    """Float arithmetic (exact=False) or integer tenths with rounding (exact=True)."""
    def __init__(self, exact):
        self.exact = exact


def run(A):
    """Design-basis streams from balance.solve_iter (same interface as before)."""
    S, _ = balance.solve_iter(exact=A.exact)
    return S, 0


ANTOINE = {"B": (6.90565, 1211.033, 220.790), "T": (6.95464, 1344.800, 219.482)}  # log10 P/mmHg, T/C


def psat(c, T):
    A, B, C_ = ANTOINE[c]
    return 10 ** (A - B / (T + C_)) * 0.133322           # kPa


def bubble_point(flows, P):
    """Ideal-solution bubble point (deg C) of the benzene/toluene part of a
    stream at P (kPa); diphenyl treated as non-volatile, H2/CH4 ignored."""
    tot = flows["B"] + flows["T"] + flows["D"]
    lo, hi = 0.0, 400.0
    for _ in range(100):
        T = (lo + hi) / 2
        s = (flows["B"] * psat("B", T) + flows["T"] * psat("T", T)) / tot
        lo, hi = (T, hi) if s < P else (lo, T)
    return T


def main():
    Sf, itf = run(Arith(False))
    St, itt = run(Arith(True))
    worst = max(abs(Sf[n][c] - St[n][c]) for n in Sf for c in C)
    print(f"max |float - displayed| over all streams and components: {worst:.3f} kmol/h")
    assert worst < 1.0, worst
    out = {"components": C, "names": NAME, "assumptions": __doc__,
           "streams": {str(n): {"flows": {c: round(St[n][c], 1) for c in C},
                                "total": round(sum(St[n].values()), 1),
                                "T": TPP[n][0], "P": TPP[n][1], "phase": TPP[n][2]}
                       for n in range(1, 42)},
           "float_reference": {str(n): Sf[n] for n in Sf}}
    pathlib.Path(__file__).with_name("streams.json").write_text(json.dumps(out, indent=1))
    for n in range(1, 42):
        s = St[n]
        print(f"{n:3d} " + " ".join(f"{s[c]:8.1f}" for c in C) + f" | {sum(s.values()):8.1f}")


if __name__ == "__main__":
    main()
