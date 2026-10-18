"""Checks for the Python reference (run: python -m pytest -q python/).

The Rust cross-check reads reference values written by
    cargo run --release --example dump > solver/ref.json
and is skipped if that file is missing.
"""
import json
import os

import numpy as np
import pytest
from scipy.optimize import brentq
from scipy.special import j0, j1

import pbr

HERE = os.path.dirname(__file__)


def test_cooling_without_reaction_matches_bessel_series():
    """Da = 0: pure radial cooling of a gas entering at theta = 0 into a
    tube with wall at theta_w = 1.  Exact solution (Graetz-type series):
      theta = 1 - sum_n 2 Bi J0(l_n rho) / ((l_n^2 + Bi^2) J0(l_n)) exp(-l_n^2 a_h xi)
    with eigenvalues  l_n J1(l_n) = Bi J0(l_n)."""
    a_h, Bi = 0.5, 3.0
    gr = dict(gamma=20.0, S=0.0, Da=0.0, a_m=0.5, a_h=a_h, Bi=Bi, St=0.0, theta_w=1.0)
    run = pbr.integrate(gr, n=80, rtol=1e-9, atol=1e-12)
    f = lambda l: l * j1(l) - Bi * j0(l)
    grid_l = np.linspace(1e-6, 80, 40000)
    vals = f(grid_l)
    roots = [brentq(f, grid_l[i], grid_l[i + 1])
             for i in range(len(grid_l) - 1) if vals[i] * vals[i + 1] < 0]
    k = np.searchsorted(run["xi"], 0.2)
    xi, th = run["xi"][k], run["Y"][k, 1::2]
    rho = run["grid"].rho
    exact = 1.0 - sum(2 * Bi * j0(l * rho) / ((l * l + Bi * Bi) * j0(l)) * np.exp(-l * l * a_h * xi)
                      for l in roots)
    assert np.max(np.abs(th - exact)) < 2e-4


def test_rosenbrock_agrees_with_scipy_bdf():
    q = pbr.oxylene_preset()
    gr, T0 = pbr.groups_from_dimensional(q)
    a = pbr.integrate(gr, rtol=1e-8, atol=1e-11, record=False)
    b = pbr.integrate_bdf(gr, rtol=1e-10, atol=1e-13)
    assert abs(pbr.to_kelvin(a["theta_star"], gr, T0) - pbr.to_kelvin(b["theta_star"], gr, T0)) < 2e-3
    assert np.max(np.abs(a["y_out"] - b["y_out"])) < 1e-5


@pytest.mark.skipif(not os.path.exists(os.path.join(HERE, "..", "solver", "ref.json")),
                    reason="run the Rust dump example first")
def test_python_reproduces_rust():
    ref = json.load(open(os.path.join(HERE, "..", "solver", "ref.json")))
    q0 = pbr.oxylene_preset()
    for r in ref:
        q = dict(q0, p0=r["p0"], T_c=r["T_c"])
        gr, T0 = pbr.groups_from_dimensional(q)
        run = pbr.integrate(gr, one_d=r["one_d"], record=False)
        assert run["steps"] == r["steps"]
        assert abs(pbr.to_kelvin(run["theta_star"], gr, T0) - r["T_star"]) < 1e-6
