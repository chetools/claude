"""Tests of the 3D finite-volume reference solver fv3d.py.

Run:  pytest test_fv3d.py            (fast, a few tens of seconds)
      pytest test_fv3d.py -m slow    (heavier cases)
"""
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fv3d                       # noqa: E402
from ref2d import ns2d            # noqa: E402

SPIN_ORBIT = dict(Re=200.0, Us=1.0, Uo=0.5, ro=0.2)      # the case used for the 2D comparison


def no_body(p):
    """Switch the body off: a negative radius makes chi = 0.5 (1 - tanh(large)) = 0 exactly."""
    p["R"] = -10.0
    return p


# ------------------------------------------------------------ Nz = 1 is the 2D solver
def test_nz1_periodic_matches_ns2d():
    """Nz = 1, periodic: u, v, q, torque equal ns2d after 50 steps (tolerance 1e-13,
    observed exactly 0 because every z-term is exactly zero); w stays exactly 0."""
    p2 = ns2d.make_params(N=32, **SPIN_ORBIT)
    p3 = fv3d.make_params(N=32, Nz=1, **SPIN_ORBIT)
    assert p2["dt"] == p3["dt"]
    s2, s3 = ns2d.init_state(p2), fv3d.init_state(p3)
    for _ in range(50):
        ns2d.step(s2, p2)
        fv3d.step(s3, p3)
    scale = np.abs(s2["u"]).max()
    assert np.abs(s3["u"][0] - s2["u"]).max() < 1e-13 * scale
    assert np.abs(s3["v"][0] - s2["v"]).max() < 1e-13 * scale
    assert np.abs(s3["q"][0] - s2["q"]).max() < 1e-13 * np.abs(s2["q"]).max()
    t2, t3 = ns2d.stats(s2, p2)["torque"], fv3d.torque(s3, p3)
    assert abs(t3 - t2) < 1e-13 * abs(t2)
    assert np.all(s3["w"] == 0.0)


# ------------------------------------------------------------ spanwise-uniform start
def plane_difference(vcycles, nz=4, steps=50):
    p1 = fv3d.make_params(N=32, Nz=1, vcycles=vcycles, **SPIN_ORBIT)
    pn = fv3d.make_params(N=32, Nz=nz, vcycles=vcycles, **SPIN_ORBIT)
    s1, sn = fv3d.init_state(p1), fv3d.init_state(pn)
    for _ in range(steps):
        fv3d.step(s1, p1)
        fv3d.step(sn, pn)
    du = max(np.abs(sn["u"][k] - s1["u"][0]).max() for k in range(nz))
    dv = max(np.abs(sn["v"][k] - s1["v"][0]).max() for k in range(nz))
    return max(du, dv), np.abs(sn["w"]).max(), fv3d.torque(s1, p1), fv3d.torque(sn, pn)


def test_uniform_span_matches_2d_to_roundoff():
    """Nz = 4 periodic, spanwise-uniform start: each z-plane equals the Nz = 1 run.
    The two V-cycles differ (z is coarsened, and the red-black colour i+j+k differs
    from plane to plane), so the planes agree only to the Poisson-solver tolerance;
    with 16 V-cycles per step that tolerance is round-off: plane difference and
    |w| < 1e-12 (observed ~3e-16), torque to 1e-10 relative."""
    d, wmax, t1, tn = plane_difference(vcycles=16)
    assert d < 1e-12 and wmax < 1e-12
    assert abs(tn - t1) < 1e-10 * abs(t1)


def test_uniform_span_default_vcycles():
    """Same with the default 2 V-cycles: the planes differ by the solver error only.
    Observed 1.5e-5 (u, v) and |w| = 9e-7 (compare U ~ 1); tolerances 1e-4 and 1e-5."""
    d, wmax, t1, tn = plane_difference(vcycles=2)
    assert d < 1e-4 and wmax < 1e-5
    assert abs(tn - t1) < 1e-4 * abs(t1)


def test_small_perturbation_stays_bounded():
    """Seeded random perturbation (amplitude 1e-6 of the spin speed) on a 3D periodic run:
    nothing blows up in 60 steps, and the spanwise energy stays far below the in-plane energy."""
    p = fv3d.make_params(N=32, Nz=8, **SPIN_ORBIT)
    s = fv3d.init_state(p)
    rng = np.random.default_rng(1234)
    for key in ("u", "v"):
        s[key] += 1e-6 * rng.standard_normal(s[key].shape)
    s["w"][:-1] += 1e-6 * rng.standard_normal(s["w"][:-1].shape)
    s["w"][-1] = s["w"][0]
    Umax = abs(p["Us"]) + abs(p["omega_o"]) * (p["ro"] + p["R"])
    e0 = fv3d.stats(s, p)["Ew"]
    for _ in range(60):
        fv3d.step(s, p)
    st = fv3d.stats(s, p)
    assert np.isfinite(st["E"]) and st["maxspeed"] < 1.5 * Umax
    assert st["Ew"] < 1e-6 * st["E"]                   # observed ~1e-12 relative; e0 was ~1e-12 as well
    assert e0 < 1e-9


# ------------------------------------------------------------ projection and Poisson solver
@pytest.mark.parametrize("span", ["periodic", "walls"])
def test_projection_matches_laplacian(span):
    """-div(grad q) equals the Laplacian L q used by the multigrid (tolerance 1e-13,
    relative to max |L q|): the pressure boundary conditions and the projection agree."""
    p = fv3d.make_params(N=16, Nz=8, span=span)
    h = p["h"]
    q = np.random.default_rng(0).standard_normal((8, 16, 16))
    u, v, w = fv3d.project(np.zeros((8, 16, 17)), np.zeros((8, 17, 16)), np.zeros((9, 16, 16)), q, h, span)
    Lq = fv3d.laplacian(q, h, span)
    assert np.abs(-fv3d.divergence(u, v, w, h) - Lq).max() < 1e-13 * np.abs(Lq).max()


@pytest.mark.parametrize("N,Nz,span", [(32, 1, "periodic"), (32, 16, "periodic"), (32, 16, "walls"),
                                       (32, 4, "periodic"), (32, 4, "walls"), (16, 64, "periodic")])
def test_poisson_vcycle_reduction(N, Nz, span):
    """Residual reduction per V-cycle (nu1 = nu2 = 2) for a random zero-mean right-hand side.
    Nz = 1: x,y coarsening only; Nz = 16: z coarsened together with x,y all the way;
    Nz = 4: z runs out of layers after two levels, then x,y only (semi-coarsening);
    N = 16, Nz = 64: z much longer than x,y (coarsest grid keeps many layers).
    Observed factors 0.04 - 0.09; tolerance: every factor of the first 6 cycles < 0.15."""
    p = fv3d.make_params(N=N, Nz=Nz, span=span)
    h = p["h"]
    b = np.random.default_rng(5).standard_normal((Nz, N, N))
    b -= b.mean()                                      # the pure-Neumann/periodic problem needs sum(b) = 0
    x = np.zeros_like(b)
    res = [np.linalg.norm(b - fv3d.laplacian(x, h, span))]
    for _ in range(6):
        fv3d.vcycle(x, b, h, p)
        res.append(np.linalg.norm(b - fv3d.laplacian(x, h, span)))
    factors = [res[i + 1] / res[i] for i in range(6)]
    assert max(factors) < 0.15, factors


def test_divergence_after_projection_vs_vcycles():
    """max |div u| after the projection (N = 32, Nz = 8, spin+orbit, 30 steps).
    Observed 6.8e-3, 3.5e-4, 1.8e-6 for 1, 2, 4 V-cycles; checked: strictly decreasing,
    with tolerances 1e-2, 1e-3 and 1e-5."""
    maxdiv = {}
    for vc in (1, 2, 4):
        p = fv3d.make_params(N=32, Nz=8, vcycles=vc, **SPIN_ORBIT)
        s = fv3d.init_state(p)
        for _ in range(30):
            fv3d.step(s, p)
        maxdiv[vc] = fv3d.stats(s, p)["maxdiv"]
    assert maxdiv[1] > maxdiv[2] > maxdiv[4]
    assert maxdiv[1] < 1e-2 and maxdiv[2] < 1e-3 and maxdiv[4] < 1e-5


# ------------------------------------------------------------ exact solution
def exact_w_error(N, Re=10.0, T=0.5):
    """Spanwise diffusion of a z-uniform jet, body off, periodic z, Nz = 2.
    u = v = 0 and  w(x, y, t) = sin(pi x) sin(pi y) exp(-2 pi^2 nu t)  solves the FULL
    Navier-Stokes equations exactly: all advection terms vanish (u = v = 0 and
    w dw/dz = 0 because w does not depend on z), div u = dw/dz = 0 so the pressure is
    zero, and what remains is dw/dt = nu (w_xx + w_yy), whose solution this is, with
    w = 0 on the x and y walls.  Returns the max error at the final time."""
    p = no_body(fv3d.make_params(N=N, Nz=2, Re=Re))
    nsteps = int(np.ceil(T / p["dt"]))
    s = fv3d.init_state(p)
    x = (np.arange(N) + 0.5) * p["h"]
    shape = np.outer(np.sin(np.pi * x), np.sin(np.pi * x))          # [j, i]
    s["w"][:] = shape                                                # same in every z-face
    for _ in range(nsteps):
        fv3d.step(s, p)
    exact = shape * np.exp(-2 * np.pi ** 2 * p["nu"] * s["t"])
    assert np.abs(s["u"]).max() < 1e-14 and np.abs(s["v"]).max() < 1e-14
    assert np.abs(s["q"]).max() < 1e-14
    return np.abs(s["w"][0] - exact).max(), s["w"][0].max()


def test_exact_spanwise_diffusion_second_order():
    """Max error against the exact solution for N = 8, 16, 32 (nu = 0.02, t ~ 0.5, the
    amplitude has decayed to ~0.82).  Expected order 2 (the wall is half a cell from the
    first node and the ghost value is an odd mirror).  Observed order printed; checked: both
    observed orders between 1.8 and 2.3 and the finest error below 1e-3."""
    errs = [exact_w_error(N)[0] for N in (8, 16, 32)]
    orders = [np.log2(errs[i] / errs[i + 1]) for i in range(2)]
    print("errors", errs, "orders", orders)
    assert all(1.8 < o < 2.3 for o in orders)
    assert errs[-1] < 1e-3


# ------------------------------------------------------------ symmetry: swap y and z
def test_swap_y_z_symmetry_walls():
    """Body off, walls in x, y AND z, Nz = N = 16 (a cube).  Exchanging the roles of y and z
    (u -> u with axes 0,1 transposed, v <-> w with axes 0,1 transposed) must commute with the
    solver.  Run A from a random field; run B from its swapped copy; after 20 steps swapping
    B back must equal A to 1e-9 relative (observed ~1e-13: only the floating-point summation
    order differs).  This exercises advection, diffusion, padding, projection and the
    multigrid in all three directions."""
    N = 16
    p = no_body(fv3d.make_params(N=N, Nz=N, Re=100.0, span="walls"))
    rng = np.random.default_rng(7)
    A, B = fv3d.init_state(p), fv3d.init_state(p)
    A["u"] = 0.3 * rng.standard_normal((N, N, N + 1))
    A["u"][:, :, [0, -1]] = 0.0
    A["v"] = 0.3 * rng.standard_normal((N, N + 1, N))
    A["v"][:, [0, -1], :] = 0.0
    A["w"] = 0.3 * rng.standard_normal((N + 1, N, N))
    A["w"][[0, -1]] = 0.0
    B["u"] = A["u"].transpose(1, 0, 2).copy()
    B["v"] = A["w"].transpose(1, 0, 2).copy()
    B["w"] = A["v"].transpose(1, 0, 2).copy()
    for _ in range(20):
        fv3d.step(A, p)
        fv3d.step(B, p)
    scale = max(np.abs(A[k]).max() for k in "uvw")
    err = max(np.abs(B["u"].transpose(1, 0, 2) - A["u"]).max(),
              np.abs(B["w"].transpose(1, 0, 2) - A["v"]).max(),
              np.abs(B["v"].transpose(1, 0, 2) - A["w"]).max())
    print("swap error", err / scale)
    assert err < 1e-9 * scale


# ------------------------------------------------------------ spinning cylinder between end walls
def test_walls_centred_spin_ekman_pumping():
    """span = walls, centred spinning cylinder (ro = 0), N = 32, Nz = 16, Re = 100.
    80 steps with the default 2 V-cycles: w is generated (Ekman pumping at the end walls,
    max |w| ~ 0.09 U), is zero on the end walls, and is antisymmetric about mid-span
    (w[k] = -w[Nz-k]) while u is symmetric.  The exact symmetry is broken only by the
    Poisson-solver error (red-black colour i+j+k flips under z -> Lz - z): observed 5e-6
    relative, tolerance 1e-4.  Divergence free: max |div| < 5e-3 (observed in the print).
    With 16 V-cycles (30 steps) the symmetry holds to round-off: tolerance 1e-12 (observed 8e-15)."""
    p = fv3d.make_params(N=32, Nz=16, Re=100.0, Us=1.0, Uo=0.0, ro=0.0, span="walls")
    s, _ = fv3d.run(p, 80)
    w, u = s["w"], s["u"]
    assert np.abs(w[0]).max() == 0 and np.abs(w[-1]).max() == 0
    wmax = np.abs(w).max()
    assert wmax > 1e-2                                   # the end walls drive a real spanwise flow
    assert np.abs(w + w[::-1]).max() < 1e-4 * wmax       # w(z) = -w(Lz - z)
    assert np.abs(u - u[::-1]).max() < 1e-4 * np.abs(u).max()    # u symmetric about mid-span
    md = fv3d.stats(s, p)["maxdiv"]
    print("ekman wmax", wmax, "maxdiv", md)
    assert md < 5e-3
    p16 = fv3d.make_params(N=32, Nz=16, Re=100.0, Us=1.0, Uo=0.0, ro=0.0, span="walls", vcycles=16)
    s16, _ = fv3d.run(p16, 30)
    w = s16["w"]
    assert np.abs(w + w[::-1]).max() < 1e-12 * np.abs(w).max()


@pytest.mark.slow
def test_walls_orbit_and_spin_bounded_N64():
    """N = 64, Nz = 32, walls, spin + orbit: 30 steps stay finite, speed below 1.5 Umax,
    divergence below 1e-2 (smoke test of the largest planned size)."""
    p = fv3d.make_params(N=64, Nz=32, span="walls", **SPIN_ORBIT)
    s, hist = fv3d.run(p, 30, every=10)
    Umax = abs(p["Us"]) + abs(p["omega_o"]) * (p["ro"] + p["R"])
    assert all(np.isfinite(h["E"]) and h["maxspeed"] < 1.5 * Umax and h["maxdiv"] < 1e-2 for h in hist)
