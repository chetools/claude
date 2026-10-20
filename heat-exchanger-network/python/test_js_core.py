"""The page's JavaScript core (web/core.js) against this Python reference:
compiled models (the numbers handed to Rust), utility prices, and the LP and
MILP solved by HiGHS-js in node against scipy's HiGHS.

Needs node and highs in ../.buildtools (python build.py installs it)."""
import json
import os
import shutil
import subprocess

import pytest

import hen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODS = os.path.join(ROOT, ".buildtools", "node_modules")

pytestmark = pytest.mark.skipif(shutil.which("node") is None or not os.path.isdir(os.path.join(MODS, "highs")),
                                reason="node + .buildtools/highs needed")

LAWS = {"power": None,
        "seider": hen.seider_law(cepci=750.0, annual=0.2, p_psig=300.0, tube_ft=12, typ="U tube"),
        "turton": dict(kind="turton", cepci=750.0, annual=0.2, p_barg=20.0)}
PRICES = [None, dict(fuel=5.0, co2=60.0, hours=7000.0, elec=0.12)]


def variants():
    for name in hen.BENCHMARKS:
        yield ("bench", name, None, "power", None)
    for name in hen.ILLUSTRATIVE:
        for pr in PRICES:
            for law in LAWS:
                yield ("ill", name, pr, law, {"0,1": ["Monel", "Monel"]} if "HF" in name else None)


def py_problem(kind, name, pr, law, mat):
    p = hen.benchmark(name) if kind == "bench" else hen.illustrative(name, pr)
    if LAWS[law] is not None:
        p["law"] = LAWS[law]
    if mat:
        p["material"] = mat
    if kind == "ill":
        p["mult"][0][0] = 1.7
    return p


def run_node(script, payload):
    env = dict(os.environ, NODE_PATH=MODS)
    r = subprocess.run(["node", "-e", script], input=json.dumps(payload), capture_output=True, text=True,
                       env=env, cwd=ROOT, timeout=600)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


NODE_PRELUDE = r"""
const {makeCore} = require('./web/core.js');
let s = ''; process.stdin.on('data', (d) => s += d);
process.stdin.on('end', async () => {
  const P = JSON.parse(s); const core = makeCore(P.consts); const out = [];
  for (const v of P.variants) {
    const [kind, name, pr, law, mat] = v;
    const p = kind === 'bench' ? core.benchmark(name) : core.illustrative(name, pr);
    if (P.laws[law]) p.law = P.laws[law];
    if (mat) p.material = mat;
    if (kind === 'ill') p.mult[0][0] = 1.7;
    out.push(await P_WORK(core, p));
  }
  process.stdout.write(JSON.stringify(out));
});
"""


def test_compiled_models_identical():
    vs = list(variants())
    script = NODE_PRELUDE.replace("P_WORK", "(async (core, p) => core.compileModel(p).flat)")
    js = run_node(script, dict(consts=hen.page_data(), variants=vs, laws=LAWS))
    for v, flat in zip(vs, js):
        py = hen.flatten_model(hen.Model(py_problem(*v)))
        assert len(py) == len(flat), v
        assert flat == pytest.approx(py, rel=1e-13, abs=1e-13), v


def test_utility_prices_identical():
    script = r"""
const {makeCore} = require('./web/core.js');
let s=''; process.stdin.on('data', d => s += d);
process.stdin.on('end', () => { const P = JSON.parse(s); const c = makeCore(P.consts);
  process.stdout.write(JSON.stringify(P.cases.map(([k, a, b, pr]) => c.utilityPrice(k, a, b, Object.assign({}, P.consts.DEFAULT_PRICES, pr))[0]))); });
"""
    cases = [("steam", 150, 150, {}), ("steam", 251.3, 251.3, dict(co2=40.0)), ("furnace", 320, 280, {}),
             ("cw", 25, 35, dict(fan=0.01)), ("refrig", -30, -30, {}), ("seawater", 20, 30, {})]
    js = run_node(script, dict(consts=hen.page_data(), cases=cases))
    for (k, a, b, pr), v in zip(cases, js):
        assert v == pytest.approx(hen.utility_price(k, a, b, dict(hen.DEFAULT_PRICES, **pr))[0], rel=1e-14)


HIGHS_WORK = r"""(async (core, p) => {
  const highs = await require('highs')();
  const m = core.compileModel(p);
  const f = core.transshipLP(p, m.allowed, 'lp');
  const sol = highs.solve(f.text);
  const lp = core.readLP(sol, f, p);
  const g = core.transshipLP(p, m.allowed, 'milp', lp.QH, lp.QC);
  const s2 = highs.solve(g.text, {time_limit: 60, mip_rel_gap: 0});
  const mi = core.readLP(s2, g, p);
  return {lp: lp.objective, QH: lp.QH, QC: lp.QC, n: mi.matches.length, status: s2.Status};
})"""


def test_highs_js_lp_and_milp_match_scipy():
    vs = [v for v in variants() if v[3] == "power" or v[0] == "bench"]
    vs = [v for v in vs if v[2] is None]
    js = run_node(NODE_PRELUDE.replace("P_WORK", HIGHS_WORK), dict(consts=hen.page_data(), variants=vs, laws=LAWS))
    for v, r in zip(vs, js):
        p = py_problem(*v)
        m = hen.Model(p)
        lp = hen.lp_targets(p, m.allowed)
        assert r["lp"] == pytest.approx(lp["cost"], rel=1e-9, abs=1e-6), v
        if len(p["hot"]) + len(p["cold"]) <= 10:              # MILPs that both prove optimal quickly
            mi = hen.milp_matches(p, lp["QH"], lp["QC"], allowed_pc=m.allowed, time_limit=60)
            assert r["status"] == "Optimal" and mi["optimal"], v
            assert r["n"] == mi["n"], v


def test_problem_from_inputs_identical():
    inputs = [
        {},
        dict(case="HF alkylation (illustrative)", emat=12.0, stages=4,
             law=dict(kind="turton", cepci=820.0, rate=0.08, years=15, p_barg=12.0, p_psig=0, tube_ft=20,
                      type="floating head"),
             prices=dict(fuel=4.2, co2=30.0), forbid=[[False, True, False], [False] * 3, [False] * 3],
             mult=[[1.0, 1.0, 1.0], [1.5, 1.0, 1.0], [1.0, 1.0, 2.0]]),
        dict(case="H4C5 aromatics (Linnhoff & Ahmad)", emat=5.0,
             law=dict(kind="seider", cepci=700.0, rate=0.12, years=8, p_psig=200.0, tube_ft=16, type="fixed head",
                      p_barg=0)),
        dict(case="H2C2 (Ahmad 1985)", law=dict(kind="paper")),
    ]
    script = r"""
const {makeCore} = require('./web/core.js');
let s=''; process.stdin.on('data', d => s += d);
process.stdin.on('end', () => { const P = JSON.parse(s); const c = makeCore(P.consts);
  process.stdout.write(JSON.stringify(P.inputs.map((i) => c.compileModel(c.problemFromInputs(i)).flat))); });
"""
    js = run_node(script, dict(consts=hen.page_data(), inputs=inputs))
    for inp, flat in zip(inputs, js):
        assert flat == pytest.approx(hen.flatten_model(hen.Model(hen.problem_from_inputs(inp))), rel=1e-13, abs=1e-13)
