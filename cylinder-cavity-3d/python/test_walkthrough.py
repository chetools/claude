"""Tests of the step-by-step breakdown (walkthrough.py) and of the MoLab notebook generator (make_molab.py).

* every cell runs through runner.py (the same runner the page uses at build time) without error;
* every figure is JSON-serialisable (the page embeds them as JSON);
* the cells respect the marimo rules the notebook generator relies on (one definition per global,
  figure() at top level, no _private name shared between cells);
* the generated notebook passes `marimo check` (skipped if marimo is not installed) and, in the slow
  test, runs end to end with `python notebook.py`.
"""
import ast
import json
import os
import re
import subprocess
import sys
import textwrap
import time

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import make_molab  # noqa: E402
import runner  # noqa: E402
import walkthrough  # noqa: E402

CELLS = walkthrough.CELLS


@pytest.fixture(scope="module")
def results():
    t = time.perf_counter()
    res = runner.run_cells(CELLS, {})
    res_total = time.perf_counter() - t
    for r in res:
        r["total"] = res_total
    return res


def test_cell_format():
    assert len(CELLS) >= 20
    for i, c in enumerate(CELLS, 1):
        assert set(c) >= {"title", "md", "code"}, f"cell {i}"
        assert c["title"].strip() and "$" not in c["title"], f"cell {i}: the page prints titles without math rendering"
        assert len(c["md"].split()) >= 80, f"cell {i} ({c['title']}): explanation too short"
        compile(c["code"], f"<cell {i}>", "exec")


def test_all_cells_run(results):
    for i, (c, r) in enumerate(zip(CELLS, results), 1):
        assert r["error"] is None, f"cell {i} ({c['title']}):\n{r['error']}"
    print(f"\nall {len(CELLS)} cells ran in {results[0]['total']:.1f} s;"
          f" slowest {max(r['secs'] for r in results):.1f} s")
    assert results[0]["total"] < 120, "the breakdown must stay under about two minutes in CPython"


def test_figures_are_json(results):
    n = 0
    for i, r in enumerate(results, 1):
        for fig in r["figs"]:
            assert fig["data"], f"cell {i}: a figure without traces"
            json.dumps(fig)
            n += 1
    assert n >= 20


def test_outputs_have_no_nan(results):
    for i, r in enumerate(results, 1):
        assert "nan" not in r["out"].lower().replace("nanosecond", ""), f"cell {i}: NaN in the printed output"


def test_marimo_rules():
    make_molab.check_unique(CELLS)                 # one definition per global, figure() at top level
    for i, c in enumerate(CELLS, 1):
        tree = ast.parse(c["code"])
        stored = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store)}
        stored |= {a.arg for n in ast.walk(tree) if isinstance(n, ast.arguments) for a in n.args + n.kwonlyargs}
        stored |= {n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
        loaded = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}
        shared = sorted(n for n in loaded if n.startswith("_") and n not in stored)
        assert not shared, f"cell {i} ({c['title']}) uses private names it does not define (marimo hides them): {shared}"


def test_generated_notebook_text():
    src = make_molab.generate()
    assert src.startswith("# /// script")
    assert '"marimo"' in src and '"numpy"' in src and '"plotly"' in src
    assert '__generated_with = "' in src
    assert src.count("@app.cell") >= 2 * len(CELLS) + 3
    for name in make_molab.MODULES:                       # the embedded module sources are the real files
        m = re.search(r"_%s_SOURCE = r'''(.*?)'''\n" % name.upper(), src, re.S)
        assert m, name
        assert textwrap.dedent(m.group(1)) == "\n" + open(os.path.join(HERE, name + ".py"), encoding="utf-8").read()
    assert "_fig1 = make_fig(" in src and "\nfigure(" not in src
    assert "USER_INPUTS = dict(" in src
    compile(src, "walkthrough_molab.py", "exec")


def _write_notebook(tmp_path):
    dst = tmp_path / "walkthrough_molab.py"
    make_molab.main(str(dst))
    return dst


def test_marimo_check(tmp_path):
    pytest.importorskip("marimo")
    nb = _write_notebook(tmp_path)
    r = subprocess.run([sys.executable, "-m", "marimo", "check", str(nb)], capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "error" not in (r.stdout + r.stderr).lower() or "0 error" in (r.stdout + r.stderr).lower()


@pytest.mark.slow
def test_notebook_runs(tmp_path):
    pytest.importorskip("marimo")
    nb = _write_notebook(tmp_path)
    t = time.perf_counter()
    r = subprocess.run([sys.executable, str(nb)], capture_output=True, text=True, timeout=900)
    print(f"\nnotebook ran in {time.perf_counter() - t:.1f} s")
    assert r.returncode == 0, (r.stdout + r.stderr)[-3000:]
