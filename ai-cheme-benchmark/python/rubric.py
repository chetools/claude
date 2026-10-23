"""Grading rubric: points per part (each problem totals 10) and the shared grading rules."""

POINTS = {
    "P01": {"a": 3, "b": 3, "c": 4},
    "P02": {"a": 2, "b": 3, "c": 3, "d": 2},
    "P03": {"a": 4, "b": 2, "c": 2, "d": 2},
    "P04": {"a": 4, "b": 2, "c": 2, "d": 2},
    "P05": {"a": 3, "b": 4, "c": 3},
    "P06": {"a": 2, "b": 2, "c": 2, "d": 2, "e": 2},
    "P07": {"a": 2, "b": 2, "c": 1, "d": 1, "e": 2, "f": 2},
    "P08": {"a": 5, "b": 3, "c": 2},
    "P09": {"a": 5, "b": 5},
    "P10": {"a": 3, "b": 3, "c": 4},
    "P11": {"a": 1, "b": 2, "c": 1, "d": 4, "e": 2},
    "P12": {"a": 1, "b": 2, "c": 2, "d": 2, "e": 2, "f": 1},
    # Frontier problems: given only to models that scored 10/10 on every one of P01-P12
    "P13": {"a": 2, "b": 2, "c": 3, "d": 2, "e": 1},
    "P14": {"a": 2, "b": 2, "c": 1, "d": 2, "e": 2, "f": 1},
    "P15": {"a": 2, "b": 2, "c": 2, "d": 2, "e": 2},
}
FRONTIER = ("P13", "P14", "P15")
for pid, pts in POINTS.items():
    assert sum(pts.values()) == 10, pid

RULES = """\
Each part is worth the points listed. For each part:
- Full points: the final value is within 1 % of the reference (2 % for values that depend on an
  iterative friction-factor or stage-stepping result: P02–P04, P11 (d), P12 (e)), with a sound method.
  Integer answers (P11 (e)) and the flow directions in P03 (c) and P13 (c) must match exactly.
  P13 (c) and P15 (c) are allowed 2 %. Temperatures in P15 (a), (b) and (e) must be within 0.2 °C
  (half points for 0.2–1 °C off with a sound method). A part with several values (P14 (b)–(f)) gets
  full points only if every value is within tolerance.
- Half points: correct method and set-up, but a numerical slip, a rounding carried through, or a
  value 1–5 % off; also a correct value carried forward from the student's own wrong earlier part
  ("error carried forward") when the method of this part is right.
- Zero: wrong method or formula, a missing part, a value more than 5 % off without a correct method,
  or a value with no supporting working.
The score is the sum over parts (0–10, half points allowed). Grade the working, not only the FINAL
lines: a FINAL value that contradicts the working gets the credit of the working.
"""
