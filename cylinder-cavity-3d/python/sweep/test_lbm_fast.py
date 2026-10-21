"""Parity of lbm_fast.step_fast with the numpy reference lbm3d.step (run: pytest -q sweep/test_lbm_fast.py).

N = 32, Nz = 8, seed > 0, Re = 200.  Spin only (the body is static) and spin + orbit
(the body moves: exercises the moving-wall term and refill), for bgk / reg / mrt and for periodic
and walled span.  Requirements: max |f_fast - f_ref| <= 1e-11 and the torque series equal to
1e-10 relative to its largest value (in practice both are ~1e-15).
"""
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import lbm3d          # noqa: E402
import lbm_fast       # noqa: E402

NSTEPS = 12      # the numpy reference costs ~0.1 s/step: 12 cases x 12 steps + one 100-step case
NLONG = 100
lbm_fast.set_num_threads(int(os.environ.get("TEST_THREADS", 2)))


def _run_both(p, nsteps=NSTEPS):
    a, b = lbm3d.init_state(p), lbm3d.init_state(p)
    ta, tb = [], []
    for _ in range(nsteps):
        lbm3d.step(a, p)
        lbm_fast.step_fast(b, p)
        ta.append(lbm3d.torque(a, p))
        tb.append(lbm3d.torque(b, p))
    return a, b, np.array(ta), np.array(tb)


@pytest.mark.parametrize("collision", ["bgk", "reg", "mrt"])
@pytest.mark.parametrize("span", ["periodic", "walls"])
@pytest.mark.parametrize("Uo", [0.0, 0.5], ids=["spin", "spin+orbit"])
def test_parity(collision, span, Uo):
    p = lbm3d.make_params(N=32, Nz=8, Re=200.0, Uo=Uo, span=span, collision=collision, seed=1e-3)
    a, b, ta, tb = _run_both(p)
    assert np.abs(a["f"]).max() > 0 and np.abs(ta).max() > 0
    assert np.abs(a["f"] - b["f"]).max() <= 1e-11
    assert np.abs(ta - tb).max() <= 1e-10 * np.abs(ta).max()
    assert np.array_equal(a["solid"], b["solid"])
    assert abs(a["t"] - b["t"]) < 1e-15 and a["nstep"] == b["nstep"]


def test_parity_100_steps():
    """The full-length case: regularised (default), walls, spin + orbit."""
    p = lbm3d.make_params(N=32, Nz=8, Re=200.0, Uo=0.5, span="walls", collision="reg", seed=1e-3)
    a, b, ta, tb = _run_both(p, NLONG)
    assert np.abs(a["f"] - b["f"]).max() <= 1e-11
    assert np.abs(ta - tb).max() <= 1e-10 * np.abs(ta).max()


def test_orbit_moves_and_refills():
    """The short orbit cases really uncover nodes (so the parity test covers refill)."""
    p = lbm3d.make_params(N=32, Nz=8, Re=200.0, Uo=0.5)
    uncovered = 0
    old = lbm3d.solid_mask(lbm3d.make_body(0.0, p), 32)
    for n in range(1, NSTEPS + 1):
        new = lbm3d.solid_mask(lbm3d.make_body(n * p["omega_o"] * p["dt"], p), 32)
        uncovered += int((old & ~new).sum())
        old = new
    assert uncovered > 0


def test_mass_fix_off_parity():
    p = lbm3d.make_params(N=32, Nz=8, Re=200.0, Uo=0.5)
    p["mass_fix"] = False
    a, b, ta, tb = _run_both(p, 10)
    assert np.abs(a["f"] - b["f"]).max() <= 1e-11


def test_geometry_matches_numpy():
    """Numba solid mask and cut links identical to lbm3d.solid_mask / find_links (also the fractions)."""
    for N in (32, 64, 128):
        p = lbm3d.make_params(N=N, Nz=2, Uo=0.5)
        for phi in np.linspace(0.0, 6.3, 150):
            g = lbm_fast._geometry(phi, p)
            ref = lbm_fast._geometry_numpy(phi, p)
            assert np.array_equal(g["solid"], ref[0])
            for x, y in zip((g["lq"], g["lj"], g["li"], g["ls"]), ref[1:]):
                assert np.array_equal(x, y)


def test_stored_torque_mass_and_node_exchange():
    p = lbm3d.make_params(N=32, Nz=8, Re=200.0, Uo=0.5)
    a, b, ta, tb = _run_both(p, 10)
    assert abs(a["torque"] - b["torque"]) <= 1e-10 * abs(a["torque"])
    assert abs(a["mass"] - b["mass"]) <= 1e-9 * a["mass"]
    p["node_exchange"] = "other"
    with pytest.raises(NotImplementedError):
        lbm_fast.step_fast(lbm3d.init_state(p), p)
