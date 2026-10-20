"""Tests of the Python reference against independent results.

    cd python && pytest -q
"""
import glob
import json
import math
import os
import random

import numpy as np
import pytest
from scipy.optimize import linprog, minimize

import hen

HERE = os.path.dirname(os.path.abspath(__file__))
FURMAN = os.path.join(HERE, "..", "benchmarks", "furman")


# ----------------------------------------------------------------- costs
def fd(f, x, h):
    return (f(x + h) - f(x - h)) / (2 * h)


@pytest.mark.parametrize("a,b", [(30.0, 10.0), (10.0, 30.0), (20.0, 20.0 + 1e-5), (5.0, 50.0)])
def test_lmtd_and_derivatives(a, b):
    L, La, Lb = hen.lmtd(a, b)
    exact = (a - b) / math.log(a / b) if abs(a - b) > 1e-9 else a
    assert L == pytest.approx(exact, rel=1e-10)
    assert La == pytest.approx(fd(lambda t: hen.lmtd(t, b)[0], a, 1e-3), rel=1e-6)
    assert Lb == pytest.approx(fd(lambda t: hen.lmtd(a, t)[0], b, 1e-3), rel=1e-6)


LAWS = [hen.power_law(4000, 500, 0.83), hen.seider_law(), dict(hen.seider_law(), type="U tube"),
        dict(kind="turton", cepci=800, annual=0.16, p_barg=20)]


@pytest.mark.parametrize("law", LAWS)
@pytest.mark.parametrize("pair", [("CS", "CS"), ("CS", "Ti"), ("SS", "SS")])
@pytest.mark.parametrize("A", [20.0, 150.0, 900.0])
def test_unit_cost_derivative(law, pair, A):
    kind, p = hen.law_params(law, pair, 1.3)
    C, dC = hen.unit_cost(kind, p, A)
    assert C > 0
    assert dC == pytest.approx(fd(lambda t: hen.unit_cost(kind, p, t)[0], A, 1e-4 * A), rel=1e-6)


def test_turton_matches_eqcost():
    """eqcost (independent Go implementation of Turton App. A) test case:
    floating head, 100 m2, CS, 20 barg -> Cp0 25323, Fp 1.07321, C_BM 86393
    (CEPCI 397)."""
    law = dict(kind="turton", cepci=397.0, annual=1.0, p_barg=20.0)
    kind, p = hen.law_params(law, ("CS", "CS"), 1.0)
    assert hen.turton_pressure_factor(20.0) == pytest.approx(1.07321, rel=2e-3)
    assert hen.unit_cost(kind, p, 100.0)[0] == pytest.approx(86393.0, rel=3e-3)


def test_seider_material_factor_and_bare_module():
    """F_M = a + (A/100)^b (Seider Eq. 16.44); C_BM = C_B (F_BM + F_L F_P F_M - 1)
    (BioSTEAM's installed-cost rule).  Values recomputed from the formulas."""
    law = dict(hen.seider_law(cepci=567.0, annual=1.0, p_psig=0.0, tube_ft=20))
    A_ft = 1000.0
    kind, p = hen.law_params(law, ("CS", "Ti"), 1.0)
    cb = math.exp(12.0310 - 0.8709 * math.log(A_ft) + 0.09005 * math.log(A_ft) ** 2)
    fm = 5.2 + (A_ft / 100) ** 0.16
    expect = cb * (3.17 + 1.0 * 0.9803 * fm - 1.0)
    assert hen.unit_cost(kind, p, A_ft / hen.M2_TO_FT2)[0] == pytest.approx(expect, rel=1e-12)
    # carbon steel: F_M = 1 at any area
    kind, p = hen.law_params(law, ("CS", "CS"), 1.0)
    assert hen.unit_cost(kind, p, 50.0)[0] == pytest.approx(
        math.exp(12.0310 - 0.8709 * math.log(50 * hen.M2_TO_FT2) + 0.09005 * math.log(50 * hen.M2_TO_FT2) ** 2)
        * (3.17 + 0.9803 - 1.0), rel=1e-12)


def test_material_pairs():
    """Both fluids touch the tubes; the shell suits the shell-side fluid."""
    hf, sea, anyf = ["Monel"], ["Ti", "brass"], hen.MATERIALS
    assert hen.material_pairs(hf, sea, hen.LAW_SEIDER) == []
    assert set(hen.material_pairs(hf, anyf, hen.LAW_SEIDER)) == {("CS", "Monel"), ("Monel", "Monel")}
    assert ("CS", "CS") in hen.material_pairs(anyf, anyf, hen.LAW_SEIDER)


def test_utility_prices():
    pr = hen.DEFAULT_PRICES
    # steam: fuel/boiler efficiency x (h_g - h_fw)/h_fg + water
    c, _ = hen.utility_price("steam", 150, 150, pr)
    hf, hg = 632.25, 2745.92
    fuel = pr["fuel"] / 1.055056 * (hg - 440.21) / (hg - hf) / pr["eta_boiler"]
    water = pr["steam_water"] / 1000 * 1e6 / (hg - hf)
    assert c == pytest.approx(pr["hours"] * 3600 / 1e6 * (fuel + water), rel=1e-12)
    # furnace with a carbon price: 1 kW for a year = 28.8 GJ at 8000 h
    c, _ = hen.utility_price("furnace", 300, 250, dict(pr, co2=50.0))
    assert c == pytest.approx(28.8 * (pr["fuel"] + 50 * 52.91 / 1000) / 1.055056 / 0.85, rel=1e-12)
    # refrigeration: electricity / COP
    c, note = hen.utility_price("refrig", -20, -20, pr)
    cop = 0.6 * 248.15 / (313.15 - 248.15)
    assert c == pytest.approx(8000 * pr["elec"] / cop, rel=1e-12)


# ----------------------------------------------------------------- LP and MILP
def transportation_lp(prob, allowed):
    """Independent check: transportation formulation (heat from hot a in
    interval k may go to cold b in any interval l >= k)."""
    iv = hen.intervals(prob)
    nH, nC, n = len(prob["hot"]), len(prob["cold"]), iv["n"]
    nHU, nCU = len(prob["hu"]), len(prob["cu"])
    var = {}
    for a in range(nH + nHU):
        for b in range(nC + nCU):
            if a >= nH and b >= nC:
                continue
            if a < nH and b < nC and not allowed[a][b]:
                continue
            for k in range(n):
                for l in range(k, n):
                    var[(a, k, b, l)] = len(var)
    nq = len(var)
    nv = nq + nHU + nCU
    A, rhs = [], []
    for a in range(nH + nHU):
        for k in range(n):
            row = np.zeros(nv)
            for (aa, kk, b, l), c in var.items():
                if aa == a and kk == k:
                    row[c] = 1
            if a < nH:
                A.append(row); rhs.append(iv["H"][a][k])
            else:
                row[nq + a - nH] = -iv["fHU"][a - nH][k]; A.append(row); rhs.append(0)
    for b in range(nC + nCU):
        for l in range(n):
            row = np.zeros(nv)
            for (a, k, bb, ll), c in var.items():
                if bb == b and ll == l:
                    row[c] = 1
            if b < nC:
                A.append(row); rhs.append(iv["C"][b][l])
            else:
                row[nq + nHU + b - nC] = -iv["fCU"][b - nC][l]; A.append(row); rhs.append(0)
    cost = np.zeros(nv)
    cost[nq:nq + nHU] = [u["cost"] for u in prob["hu"]]
    cost[nq + nHU:] = [u["cost"] for u in prob["cu"]]
    r = linprog(cost, A_eq=np.array(A), b_eq=np.array(rhs), bounds=(0, None), method="highs")
    return r.fun


@pytest.mark.parametrize("name", list(hen.ILLUSTRATIVE))
def test_restricted_lp_against_transportation_model(name):
    p = hen.illustrative(name)
    m = hen.Model(p)
    lp = hen.lp_targets(p)
    assert lp["cost"] == pytest.approx(transportation_lp(p, m.allowed), rel=1e-9)
    free = [[True] * len(p["cold"]) for _ in p["hot"]]
    assert hen.lp_targets(p, free)["cost"] == pytest.approx(transportation_lp(p, free), rel=1e-9)


def test_forbidden_matches_raise_the_target():
    p = hen.illustrative("Oxidation unit: oxygen vs hydrocarbons (illustrative)")
    free = [[True] * len(p["cold"]) for _ in p["hot"]]
    assert hen.lp_targets(p)["cost"] > 1.5 * hen.lp_targets(p, free)["cost"]


def test_lp_equals_problem_table_on_benchmarks():
    for name in hen.BENCHMARKS:
        p = hen.benchmark(name)
        free = [[True] * len(p["cold"]) for _ in p["hot"]]
        lp = hen.lp_targets(p, free)
        pt = hen.problem_table(p)
        assert sum(lp["QH"]) == pytest.approx(pt["QH"], abs=1e-6 * (1 + pt["QH"]))
        assert sum(lp["QC"]) == pytest.approx(pt["QC"], abs=1e-6 * (1 + pt["QC"]))


def furman_published():
    cost = {l.split()[0]: float(l.split("=")[1]) for l in open(os.path.join(FURMAN, "published_lp_cost.txt"))}
    mm = {}
    for l in open(os.path.join(FURMAN, "published_min_matches.txt")):
        if not l.startswith("#"):
            w = l.split()
            mm[w[0]] = int(w[1].split("=")[1])
    return cost, mm


FAST_MILP = ["4sp1", "6sp-cf1", "6sp-gg1", "6sp1", "7sp-cm1", "7sp-s1", "7sp-torw1", "7sp1", "7sp2",
             "7sp4", "8sp-fs1", "8sp1", "9sp-al1", "9sp-has1", "10sp-la1", "10sp-ol1", "12sp1",
             "15sp-tkm", "28sp-as1"]


@pytest.mark.parametrize("name", FAST_MILP)
def test_furman_lp_cost_and_min_matches(name):
    """Letsios, Kouyialis & Misener (2018): utility cost from their
    transshipment LP and the optimal number of matches (CPLEX/Gurobi)."""
    cost, mm = furman_published()
    p = hen.load_furman(os.path.join(FURMAN, name + ".dat"))
    free = [[True] * len(p["cold"]) for _ in p["hot"]]
    lp = hen.lp_targets(p, free)
    assert lp["cost"] == pytest.approx(cost[name], rel=1e-9, abs=1e-9)
    mi = hen.milp_matches(p, lp["QH"], lp["QC"], allowed_pc=free, time_limit=60)
    assert mi["optimal"] and mi["n"] == mm[name]


# ----------------------------------------------------------------- network
def random_network(model, rng, n):
    pairs = [(i, j) for i in range(model.nH) for j in range(model.nC) if model.allowed[i][j]]
    M = set()
    while len(M) < n:
        i, j = rng.choice(pairs)
        M.add((i, j, rng.randrange(model.K)))
    return dict(matches=sorted(M), hu=[0 if h else -1 for h in model.heat],
                cu=[0 if c else -1 for c in model.cool])


@pytest.mark.parametrize("name", ["H2C2 (Escobar & Trierweiler)", "H4C5 aromatics (Linnhoff & Ahmad)"])
def test_gradient_against_finite_differences(name):
    model = hen.Model(hen.benchmark(name))
    rng = random.Random(3)
    for trial in range(5):
        net = random_network(model, rng, 4)
        net["hu"][0] = -1                           # one switched-off utility (penalty term)
        x = hen.start_point(model, net, 0.05)
        for tau, mu in [(0.0, 0.0), (1e-3, 1e2)]:
            ev = hen.evaluate(model, net, x, tau, mu, 1e5, True)
            if not ev["ok"]:
                continue
            for m in range(len(x)):
                h = 1e-5 * x[m]
                xp, xm = list(x), list(x)
                xp[m] += h
                xm[m] -= h
                d = (hen.evaluate(model, net, xp, tau, mu, 1e5)["phi"] -
                     hen.evaluate(model, net, xm, tau, mu, 1e5)["phi"]) / (2 * h)
                assert ev["grad"][m] == pytest.approx(d, rel=1e-5, abs=1e-12)


def linear_rows(fun, n):
    """fun(x) is linear in x: return (A, b) with fun(x) = A x + b."""
    z = np.array(fun([0.0] * n))
    cols = [np.array(fun([1.0 if k == m else 0.0 for k in range(n)])) - z for m in range(n)]
    return np.array(cols).T, z


def trust_constr_from_near(model, net, r):
    """scipy's interior-point trust-constr on the plain TAC, with the
    (linear) slack and residual constraints, started 5 % below r."""
    from scipy.optimize import LinearConstraint
    n = len(net["matches"])
    sx = np.array(hen.load_scale(model, net))
    A, b = linear_rows(lambda x: hen.slacks(model, net, x), n)
    cons = [LinearConstraint(A * sx, -b, np.inf)]
    if hen.residuals(model, net, r["x"]):
        Ae, be = linear_rows(lambda x: hen.residuals(model, net, x), n)
        cons.append(LinearConstraint(Ae * sx, -be, -be))

    def f(y):
        ev = hen.evaluate(model, net, list(y * sx), 0.0, 0.0, r["tac"], True)
        return (ev["phi"], np.array(ev["grad"]) * sx) if ev["ok"] else (10.0, np.zeros(n))

    return minimize(f, np.array(r["x"]) / sx * 0.95, jac=True, method="trust-constr", constraints=cons,
                    options=dict(gtol=1e-12, xtol=1e-14, maxiter=3000))


@pytest.mark.filterwarnings("ignore")
def test_nlp_against_trust_constr():
    """Independent check of optimize_loads (barrier + L-BFGS): scipy
    trust-constr started 5 % away reaches the same TAC (within 1e-5)."""
    cases = []
    m1 = hen.Model(hen.benchmark("H2C2 (Escobar & Trierweiler)"))
    for net in [dict(matches=[(0, 0, 1), (0, 1, 0), (1, 0, 0)], hu=[-1, 0], cu=[-1, 0]),
                dict(matches=[(0, 1, 0), (1, 0, 1)], hu=[-1, 0], cu=[0, 0]),
                dict(matches=[(0, 0, 0), (1, 0, 1), (1, 1, 0)], hu=[0, 0], cu=[0, 0])]:
        cases.append((m1, net))
    m2 = hen.Model(hen.benchmark("H4C5 aromatics (Linnhoff & Ahmad)"))
    rng = random.Random(5)
    for _ in range(4):
        cases.append((m2, random_network(m2, rng, 6)))
    for model, net in cases:
        r = hen.optimize_loads(model, net)
        s = trust_constr_from_near(model, net, r)
        assert s.status in (1, 2)
        assert s.fun == pytest.approx(1.0, abs=1e-5)


def test_global_optimum_h2c2_isothermal():
    """Chang et al. (2020) report 360,037 $/yr (5 units, HU 700 kW, CU 500 kW)
    as the global optimum of the isothermal-mixing stage model."""
    model = hen.Model(hen.benchmark("H2C2 (Escobar & Trierweiler)"))
    net = dict(matches=[(0, 0, 1), (0, 1, 0), (1, 0, 0)], hu=[-1, 0], cu=[-1, 0])
    r = hen.optimize_loads(model, net)
    assert r["feasible"]
    assert r["tac"] == pytest.approx(360037, abs=0.5)
    heat = [u for u in r["units"] if u["type"] == "heater"][0]["q"]
    assert heat == pytest.approx(700, abs=0.01)


def test_published_network_caballero_h2c2():
    """Caballero et al. (2021) best H2C2 network (non-isothermal mixing),
    loads and temperatures read from their Figure S2: TAC 352.479 k$/yr,
    area 1017.0 m2.  Loads are printed to 0.1 kW."""
    law = hen.power_law(4000, 500, 0.83)
    U = [
        dict(q=1864.1, Th_in=270, Th_out=166.44, Tc_in=160, Tc_out=215.38, h_hot=.5, h_cold=.5),
        dict(q=635.9, Th_in=220, Th_out=191.09, Tc_in=160, Tc_out=198.91, h_hot=.5, h_cold=.5),
        dict(q=2455.7, Th_in=191.09, Th_out=79.47, Tc_in=50, Tc_out=179.64, h_hot=.5, h_cold=.5),
        dict(q=115.9, Th_in=166.44, Th_out=160, Tc_in=50, Tc_out=159.61, h_hot=.5, h_cold=.5),
        dict(q=428.4, Th_in=79.47, Th_out=60, Tc_in=15, Tc_out=20, h_hot=.5, h_cold=1.0, op=20),
        dict(q=628.4, Th_in=250, Th_out=250, Tc_in=178.58, Tc_out=210, h_hot=1.0, h_cold=.5, op=200),
    ]
    r = hen.units_tac(U, law)
    assert r["area"] == pytest.approx(1017.0, abs=0.1)
    assert r["tac"] == pytest.approx(352479, rel=3e-4)


def test_mulberry32_reference_values():
    """First outputs for seed 1, as printed by the usual JavaScript
    mulberry32 (Math.imul version) in node."""
    r = hen.Mulberry32(1)
    assert [r.next_u32() for _ in range(4)] == [2693262067, 11749833, 2265367787, 4213581821]


def test_rust_parity():
    """Values printed by the Rust solver (cargo run --release --example dump)
    agree with this module."""
    path = os.path.join(HERE, "..", "solver", "ref.json")
    if not os.path.exists(path):
        pytest.skip("run: cd solver && cargo run --release --example dump")
    ref = json.load(open(path))
    for case in ref["cases"]:
        model = hen.Model(hen.benchmark(case["problem"]))
        net = dict(matches=[tuple(m) for m in case["net"]["matches"]], hu=case["net"]["hu"], cu=case["net"]["cu"])
        ev = hen.evaluate(model, net, case["x"], case["tau"], case["mu"], case["scale"], True)
        assert ev["phi"] == pytest.approx(case["phi"], rel=1e-12)
        assert ev["grad"] == pytest.approx(case["grad"], rel=1e-10, abs=1e-14)
        # Same algorithm, but libm round-off (ln, exp, pow) moves the iterates
        # slightly, so optimised loads agree to the solver's own accuracy.
        r = hen.optimize_loads(model, net)
        if r["feasible"]:
            assert r["tac"] == pytest.approx(case["opt_tac"], rel=1e-6)
    for case in ref.get("anneal", []):
        model = hen.Model(hen.benchmark(case["problem"]))
        res = hen.anneal(model, case["iters"], case["seed"])
        assert res["best"]["tac"] == pytest.approx(case["best_tac"], rel=1e-6)
