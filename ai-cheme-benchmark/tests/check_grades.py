"""Cross-check the judge's part scores against the FINAL lines of each reply (a crude, independent reading).

Flags a part when
  - the judge gave full points but the FINAL value is more than 5 % off the reference, or
  - the judge gave zero but the FINAL value is within 1 % of the reference.
Units are not parsed, so a flag means "look again", not "wrong". Prints the flags and their count.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from rubric import POINTS            # noqa: E402

NUM = r"[-+−]?\d[\d,]*\.?\d*(?:\s*(?:[eE][-+−]?\d+|[×x]\s*10\^?\{?[-+−]?\d+\}?))?"


def to_float(s):
    s = s.replace(",", "").replace("−", "-").replace(" ", "")
    m = re.match(r"([-+]?[\d.]+)(?:[×x]10\^?\{?([-+]?\d+)\}?)?$", s)
    if m and m.group(2):
        return float(m.group(1)) * 10 ** int(m.group(2))
    return float(s)


def finals(text):
    out = {}
    for m in re.finditer(r"FINAL\W*\(?([a-f])\)?\W*?:?\s*\**\s*(" + NUM + ")", text):
        try:
            out[m.group(1)] = to_float(m.group(2))
        except ValueError:
            pass
    return out


def flags(data):
    """List of (model, problem, part, FINAL value, reference, judge points, part points)."""
    ref = json.loads((ROOT / "results" / "reference.json").read_text())
    out = []
    for r in data["responses"]:
        fin = finals(r["text"])
        for k, pts in POINTS[r["problem"]].items():
            want = ref[r["problem"]].get(k)
            got, given = fin.get(k), r["parts"].get(k)
            if got is None or not isinstance(want, (int, float)) or want == 0:
                continue
            rel = abs(got / want - 1)
            if (given == pts and rel > 0.05) or (given == 0 and rel < 0.01):
                out.append((r["model"], r["problem"], k, got, want, given, pts))
    return out


def main():
    fl = flags(json.loads((ROOT / "results" / "data.json").read_text()))
    for m, p, k, got, want, given, pts in fl:
        print(f"{m} {p} ({k}): FINAL {got:.6g} vs ref {want:.6g} ({100 * abs(got / want - 1):.1f} % off), "
              f"judge {given}/{pts}")
    print(f"{len(fl)} flags")


if __name__ == "__main__":
    main()
