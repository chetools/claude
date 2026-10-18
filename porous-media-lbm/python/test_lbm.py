"""Checks of the reference implementation (pytest).

Lattice symmetry, conservation, exact plane Poiseuille flow, permeability of an
ordered array of cylinders against Sangani & Acrivos and Gebart, viscosity
independence of the TRT permeability, tracer diffusion in uniform flow, the
moment analysis, and bit-level agreement with the page's JavaScript solver.
"""
import json
import os
import shutil
import subprocess

import numpy as np
import pytest

import lbm

HERE = os.path.dirname(os.path.abspath(__file__))


def test_lattice_moments():
    cx, cy = lbm.C[:, 0], lbm.C[:, 1]
    assert np.isclose(lbm.W.sum(), 1)
    assert np.allclose([(lbm.W * cx).sum(), (lbm.W * cy).sum(), (lbm.W * cx * cy).sum()], 0)
    assert np.isclose((lbm.W * cx * cx).sum(), lbm.CS2)
    assert np.isclose((lbm.W * cx ** 4).sum(), 3 * lbm.CS2 ** 2)
    assert np.isclose((lbm.W * cx ** 2 * cy ** 2).sum(), lbm.CS2 ** 2)
    assert np.all(lbm.C[lbm.OPP] == -lbm.C)


def test_equilibrium_moments():
    rho, ux, uy = 0.97, 0.04, -0.03
    f = lbm.equilibrium(np.array(rho), np.array(ux), np.array(uy))
    assert np.isclose(f.sum(), rho)
    assert np.isclose((f * lbm.C[:, 0]).sum(), rho * ux)
    assert np.isclose((f * lbm.C[:, 1]).sum(), rho * uy)
    assert np.isclose((f * lbm.C[:, 0] * lbm.C[:, 1]).sum(), rho * ux * uy)


def test_mass_conservation_in_bed():
    solid, _ = lbm.make_bed(60, 40, 0.6, 8, seed=5)
    r = lbm.run_flow(solid, tau=0.9, g=1e-4, steps=300, record_every=300)
    assert abs(r["rho"][~solid].sum() / (~solid).sum() - 1) < 1e-12


@pytest.mark.parametrize("tau", [0.7, 1.5])
def test_poiseuille_exact_with_trt(tau):
    ny = 18
    ch = lbm.make_bed(4, ny, layout="empty", walls=True)[0]
    r = lbm.run_flow(ch, tau=tau, g=1e-6, steps=8000, walls=True, record_every=8000)
    ue, _ = lbm.poiseuille_profile(ny, lbm.viscosity(tau), 1e-6)
    assert np.abs(r["ux"][1:-1, 0] - ue[1:-1]).max() / ue.max() < 1e-5


def _square(eps, D=20):
    n = int(round(D * np.sqrt(np.pi / (4 * (1 - eps)))))
    solid, disks = lbm.make_bed(n, n, eps, D, layout="square")
    return solid, lbm.porosity_of(solid), disks[0][2]


def test_square_array_dilute_vs_sangani_acrivos():
    # D = 20 cells per diameter: the staircase disk costs a few percent
    solid, e, d = _square(0.8)
    k = lbm.run_flow(solid, tau=1.0, g=1e-6, steps=5000, record_every=5000)["k"][-1]
    assert abs(k / lbm.sangani_acrivos_square(e, d) - 1) < 0.05


def test_square_array_dense_vs_gebart():
    # Gebart's lubrication model is itself only good to about 10 % at this packing
    solid, e, d = _square(0.5)
    k = lbm.run_flow(solid, tau=1.0, g=1e-6, steps=5000, record_every=5000)["k"][-1]
    assert abs(k / lbm.gebart_square(e, d) - 1) < 0.10


def test_trt_permeability_independent_of_tau_bgk_not():
    solid, _ = lbm.make_bed(48, 32, 0.65, 8, seed=2)
    k = {}
    for name, magic in [("trt", 3 / 16), ("bgk", None)]:
        for tau in (0.6, 1.6):
            k[name, tau] = lbm.run_flow(solid, tau=tau, g=1e-6, steps=6000, magic=magic,
                                        record_every=6000)["k"][-1]
    assert abs(k["trt", 1.6] / k["trt", 0.6] - 1) < 1e-4
    assert abs(k["bgk", 1.6] / k["bgk", 0.6] - 1) > 0.05


def test_tracer_uniform_flow_dispersion():
    """In uniform flow D_L = D_m, up to the known D2Q5 truncation (cs2 - u^2)/cs2."""
    nx, u, D = 500, 0.05, 0.02
    solid = np.zeros((2, nx), dtype=bool)
    ux, uy = np.full(solid.shape, u), np.zeros(solid.shape)
    t, (c1, c2) = lbm.run_tracer(solid, ux, uy, D, steps=11000, pulse_steps=20, detectors=[100, 400])
    _, m1, v1 = lbm.rtd_moments(t, c1, 20)
    _, m2, v2 = lbm.rtd_moments(t, c2, 20)
    fit = lbm.fit_dispersion(m1, v1, m2, v2, 300)
    assert abs(fit["u"] / u - 1) < 1e-3
    assert abs(fit["D_L"] / (D * (1 - u * u / lbm.CS2)) - 1) < 3e-3


def test_moment_difference_exact_for_advection_diffusion():
    u, D, x1, x2 = 0.3, 0.05, 20.0, 60.0
    t = np.linspace(1e-3, 2000, 400001)

    def c(x):
        return np.exp(-(x - u * t) ** 2 / (4 * D * t)) / np.sqrt(4 * np.pi * D * t)

    _, m1, v1 = lbm.rtd_moments(t, c(x1), tail=False)
    _, m2, v2 = lbm.rtd_moments(t, c(x2), tail=False)
    fit = lbm.fit_dispersion(m1, v1, m2, v2, x2 - x1)
    assert abs(fit["D_L"] / D - 1) < 1e-3


def test_tail_extrapolation():
    t = np.linspace(0, 50, 5001)
    lam = 4.0
    C = np.exp(-t / lam)
    _, mean, var = lbm.rtd_moments(t[:2501], C[:2501])       # truncated at t = 25
    assert abs(mean - lam) < 1e-3 and abs(var - lam ** 2) < 1e-2


def test_prng_matches_javascript():
    r = lbm.mulberry32(42)
    assert [r(), r(), r()] == [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]


def test_random_bed_porosity():
    solid, disks = lbm.make_bed(240, 96, 0.65, 12, seed=3, gap=1.8)
    assert abs(lbm.porosity_of(solid) - 0.65) < 0.01
    assert abs(lbm.specific_surface(disks) - 4 / 12) < 1e-12


@pytest.mark.skipif(shutil.which("node") is None, reason="needs node")
def test_javascript_solver_matches_numpy():
    """web/cpu.js (the page's CPU path, float32) against this module (float64)."""
    script = os.path.join(HERE, "..", "web", "parity.cjs")
    out = subprocess.run(["node", script], capture_output=True, text=True, check=True).stdout
    js = json.loads(out)
    p = js["params"]
    solid, _ = lbm.make_bed(p["nx"], p["ny"], p["porosity"], p["D"], seed=p["seed"], gap=p["gap"])
    assert np.array_equal(solid, np.array(js["solid"], dtype=bool).reshape(p["ny"], p["nx"]))
    wp, wm = lbm.trt_rates(p["tau"])
    f = lbm.init_flow(solid)
    for _ in range(p["steps"]):
        f, rho, ux, uy = lbm.flow_step(f, solid, wp, wm, p["g"])
    ux_js = np.array(js["ux"]).reshape(p["ny"], p["nx"])
    assert np.abs(ux_js - ux).max() < 1e-6 * np.abs(ux).max() + 1e-9
    twp, twm = lbm.tracer_rates(p["Dm"])
    gt = lbm.init_tracer(solid)
    for n in range(p["tsteps"]):
        gt, c = lbm.tracer_step(gt, solid, ux, uy, twp, twm, 1.0 if n < p["pulse"] else 0.0)
    c_js = np.array(js["c"]).reshape(p["ny"], p["nx"])
    assert np.abs(c_js - c).max() < 1e-5
