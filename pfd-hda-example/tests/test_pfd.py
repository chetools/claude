"""Tests: balance model and verifier (python -m pytest tests).

The verifier tests plant known defects in copies of the delivered sheets and
require verify.py to report each one; the unmodified sheets must pass.
"""
import json, pathlib, re, shutil, subprocess, sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import model  # noqa: E402

OUT = ROOT / "out"
SHEETS = [OUT / "PFD-201-r1.svg", OUT / "PFD-202-r1.svg"]


def test_models_agree_within_display_rounding():
    Sf, _ = model.run(model.Arith(False))
    St, _ = model.run(model.Arith(True))
    worst = max(abs(Sf[n][c] - St[n][c]) for n in Sf for c in model.C)
    assert worst < 1.0
    # reactor: total moles conserved (both reactions are 2 -> 2)
    assert abs(sum(Sf[9].values()) - sum(Sf[10].values())) < 1e-9


def test_float_model_closes_overall_atom_balance():
    Sf, _ = model.run(model.Arith(False))
    atoms = {"H2": (0, 2), "CH4": (1, 4), "B": (6, 6), "T": (7, 8), "D": (12, 10)}
    for i in (0, 1):
        fin = sum(Sf[n][c] * atoms[c][i] for n in (1, 5) for c in atoms)
        fout = sum(Sf[n][c] * atoms[c][i] for n in (19, 24, 28, 40) for c in atoms)
        assert abs(fin - fout) < 1e-6


def test_reactor_inlet_ratio_spec():
    Sf, _ = model.run(model.Arith(False))
    assert abs(Sf[9]["H2"] / Sf[9]["T"] - model.RATIO_H2_T) < 1e-6


def run_verify(paths):
    r = subprocess.run([sys.executable, str(ROOT / "verify.py"), *map(str, paths)],
                       capture_output=True, text=True, cwd=ROOT)
    return r.returncode, r.stdout + r.stderr


needs_sheets = pytest.mark.skipif(not all(p.exists() for p in SHEETS), reason="sheets not built")


@needs_sheets
def test_delivered_sheets_pass():
    code, out = run_verify(SHEETS)
    assert code == 0, out
    assert "HARD FAILURES: 0" in out


def mutate(tmp_path, idx, fn):
    paths = []
    for i, p in enumerate(SHEETS):
        q = tmp_path / p.name
        txt = p.read_text()
        q.write_text(fn(txt) if i == idx else txt)
        paths.append(q)
    return run_verify(paths)


@needs_sheets
@pytest.mark.parametrize("name,idx,fn,expect", [
    # a displayed flow changed by 0.1 kmol/h -> balance cannot close
    ("balance", 0, lambda t: re.sub(r'(data-cell="7\|T"[^>]*>)([\d.]+)<',
                                    lambda m: m.group(1) + f"{float(m.group(2)) + 0.1:.1f}<", t), "A5"),
    # a stream-table row removed
    ("table row", 1, lambda t: re.sub(r'<text data-cell="25\|[^"]*"[^>]*>[^<]*</text>', "", t), "A4"),
    # a stream number marker removed
    ("marker", 0, lambda t: re.sub(r'<g data-marker="9">.*?</g>', "", t, flags=re.S), "A4"),
    # a stream end moved off its port (re-terminated 30 px away)
    ("port", 1, lambda t: re.sub(r'(<path data-stream="23"[^>]*d="M )([\d.]+)',
                                 lambda m: m.group(1) + f"{float(m.group(2)) - 30:.1f}", t), "A1"),
    # a label moved onto the middle of the sheet's first stream line
    ("label overlap", 0, None, "L3"),
])
def test_verifier_detects_planted_defect(tmp_path, name, idx, fn, expect):
    if fn is None:
        src = SHEETS[idx].read_text()
        d = re.search(r'<path data-stream="\d+"[^>]*d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+)', src)
        x = (float(d.group(1)) + float(d.group(3))) / 2; y = (float(d.group(2)) + float(d.group(4))) / 2
        fn = lambda t: t.replace("</svg>", f'<text class="lbl" x="{x}" y="{y + 4}" font-size="11">PLANTED</text></svg>')
    code, out = mutate(tmp_path, idx, fn)
    assert code == 1, f"{name}: verifier passed a defective sheet\n{out}"
    assert expect in out, f"{name}: expected a {expect} failure\n{out}"


def test_column_temperatures_near_bubble_points():
    import json
    d = json.loads((ROOT / "streams.json").read_text())["streams"]
    for n in (22, 29, 31, 32, 38, 40):
        s = d[str(n)]
        assert abs(model.bubble_point(s["flows"], s["P"]) - s["T"]) < 1.5, n


def test_vent_benzene_below_vapour_pressure_limit():
    import json
    s = json.loads((ROOT / "streams.json").read_text())["streams"]["24"]
    assert s["flows"]["B"] / s["total"] <= model.psat("B", s["T"]) / s["P"]
