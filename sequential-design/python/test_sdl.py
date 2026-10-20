"""Checks for sdl.py, each against something independent:

* the gradient of the marginal likelihood vs. central finite differences;
* our BFGS fit vs. scipy's L-BFGS-B on the same likelihood;
* the rank-one covariance downdate vs. re-conditioning the GP on the extra point;
* the IMSE score vs. the brute-force drop in average variance;
* the reactor yield formula vs. numerical integration of the rate equations;
* the Rust solver vs. this file, case by case (values printed by
  `cargo run --release --example dump > solver/ref.json`).
"""
import json
import math
import os

import numpy as np
import pytest
from scipy.integrate import solve_ivp
from scipy.optimize import minimize

import sdl

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, "..", "solver", "ref.json")


def data(truth="branin", n=12, seed=3, noise=0.05):
    T = sdl.TRUTHS[truth]
    X = sdl.lhs_maximin(sdl.Rng(seed), n, T["d"])
    rng = sdl.Rng(seed, 9)
    y = T["f"](X)
    y = y + noise * np.std(y) * np.array([rng.normal() for _ in y])
    return X, y


def test_gradient_matches_finite_differences():
    X, y = data()
    yz = (y - y.mean()) / y.std()
    for z in (np.array([0.3, -0.2, 0.1, -0.5]), np.array([-1.0, 1.5, 0.7, 2.0])):
        _, g = sdl.nll_grad(z, X, yz)
        h = 1e-6
        fd = [(sdl.nll_grad(z + h * e, X, yz)[0] - sdl.nll_grad(z - h * e, X, yz)[0]) / (2 * h)
              for e in np.eye(len(z))]
        np.testing.assert_allclose(g, fd, rtol=1e-6, atol=1e-7)


def test_fit_agrees_with_scipy_lbfgsb():
    for truth in ("forrester", "branin", "reactor_2d"):
        X, y = data(truth, n=14)
        gp = sdl.gp_fit(X, y)
        yz = (y - y.mean()) / y.std()
        lo, hi = sdl.bounds(X.shape[1])

        def f_theta(th):                               # same likelihood, in theta directly
            return sdl.nll_grad(sdl.to_z(np.clip(th, lo + 1e-12, hi - 1e-12), X.shape[1]), X, yz)[0]

        best = min((minimize(f_theta, np.r_[[math.log(l0)] * X.shape[1], 0.0, math.log(0.1)],
                             method="L-BFGS-B", bounds=list(zip(lo, hi))) for l0 in (0.1, 0.3, 1.0)),
                   key=lambda r: r.fun)
        assert gp["nll"] <= best.fun + 1e-4, (truth, gp["nll"], best.fun)


def test_downdate_equals_reconditioning():
    X, y = data()
    gp = sdl.gp_fit(X, y)
    G = sdl.grid(2)
    C = sdl.posterior_cov(gp, G)
    picks, _ = sdl.greedy_batch(C, gp["sn2"], 3, "imse")
    # condition on the three new points explicitly (any y values: C does not depend on them)
    X3 = np.vstack([X, G[picks]])
    gp3 = sdl.gp_build(X3, np.r_[y, np.zeros(3)], gp["ell"], gp["sf2"], gp["sn2"])
    C3 = sdl.posterior_cov(gp3, G)
    Cd = C.copy()
    for j in picks:
        u = Cd[:, j] / math.sqrt(Cd[j, j] + gp["sn2"])
        Cd -= np.outer(u, u)
    np.testing.assert_allclose(Cd, C3, atol=1e-7)


def test_imse_score_is_drop_in_average_variance():
    X, y = data(n=10)
    gp = sdl.gp_fit(X, y)
    G = sdl.grid(2)
    C = sdl.posterior_cov(gp, G)
    _, score = sdl.greedy_batch(C, gp["sn2"], 1, "imse")
    base = np.mean(np.diag(C))
    for j in (0, 100, 480, 960):
        gpj = sdl.gp_build(np.vstack([X, G[j]]), np.r_[y, 0.0], gp["ell"], gp["sf2"], gp["sn2"])
        drop = base - np.mean(np.diag(sdl.posterior_cov(gpj, G)))
        assert abs(score[j] - drop) < 1e-9 * max(1.0, abs(drop))


def test_reactor_formula_matches_ode():
    for T in (330.0, 350.0, 380.0):
        k1 = 0.05 * math.exp(-6000 * (1 / T - 1 / 350))
        k2 = 0.02 * math.exp(-9000 * (1 / T - 1 / 350))
        sol = solve_ivp(lambda t, c: [-k1 * c[0], k1 * c[0] - k2 * c[1]], (0, 100), [1.0, 0.0],
                        t_eval=[5.0, 30.0, 100.0], rtol=1e-11, atol=1e-13)
        np.testing.assert_allclose(100 * sol.y[1], sdl.reactor_yield(T, sol.t), rtol=1e-7, atol=1e-6)


def test_lhs_has_one_point_per_slice():
    for n, d in ((7, 1), (12, 2)):
        X = sdl.lhs_maximin(sdl.Rng(5), n, d)
        for i in range(d):
            assert sorted(np.floor(X[:, i] * n).astype(int)) == list(range(n))


def test_noise_free_gp_interpolates():
    X = sdl.lhs_maximin(sdl.Rng(1), 8, 1)
    y = sdl.forrester(X[:, 0])
    gp = sdl.gp_build(X, y, np.array([0.2]), 1.0, 1e-8)
    mean, var = sdl.gp_predict(gp, X)
    np.testing.assert_allclose(mean, y, atol=1e-5)
    assert np.max(var) < 1e-6


@pytest.mark.skipif(not os.path.exists(REF), reason="run the Rust dump example first")
def test_rust_matches_python():
    """Same algorithm, same random numbers: same designs and errors to ~1e-6.
    Exception: when a fitted length scale sits on its bound the likelihood is
    flat, and round-off sends the two optimizers to different points of equal
    likelihood.  There we check the likelihood, and (for the adaptive
    strategies, whose next picks depend on the fit) stop comparing that case."""
    ref = json.load(open(REF))
    r = sdl.Rng(7, 3)
    np.testing.assert_array_equal(ref["uniform_7_3"], [r.uniform() for _ in range(5)])
    lo, hi = sdl.bounds(2)
    stats = dict(rounds=0, flat=0, worst=0.0)
    for c in ref["cases"]:
        strategy = sdl.STRATEGIES[c["strategy"]]
        py = sdl.run_session(sdl.TRUTH_IDS[c["truth"]], strategy, c["n0"], c["batch"], c["budget"], 5.0, c["seed"])
        assert [p["n"] for p in py] == [q["n"] for q in c["rounds"]]
        for p, q in zip(py, c["rounds"]):
            stats["rounds"] += 1
            nxt = np.zeros(0) if p["next"] is None else p["next"].ravel()
            flat = np.any(np.isclose(np.log(q["ell"]), [lo[0], hi[0]], atol=1e-3))
            if flat:
                stats["flat"] += 1
                assert abs(p["nll"] - q["nll"]) < 1e-5 * max(1.0, abs(q["nll"]))
                if strategy in ("maxvar", "imse"):
                    break
                continue
            np.testing.assert_allclose(nxt, q["next"], atol=1e-12, err_msg=str(c)[:80])
            np.testing.assert_allclose([p["nrmse"], p["est"]], [q["nrmse"], q["est"]], rtol=1e-5)
            stats["worst"] = max(stats["worst"], abs(p["nrmse"] - q["nrmse"]) / q["nrmse"])
    print(f"\n{stats['rounds']} rounds compared, {stats['flat']} with a length scale on its bound; "
          f"largest relative nRMSE difference elsewhere: {stats['worst']:.1e}")
