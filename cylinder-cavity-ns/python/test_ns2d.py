"""pytest checks of the reference solver ns2d.py."""
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

import ns2d

rng = np.random.default_rng(0)


def random_velocity(N):
    u, v = rng.standard_normal((N, N + 1)), rng.standard_normal((N + 1, N))
    u[:, [0, -1]] = 0
    v[[0, -1], :] = 0
    return u, v


def test_div_grad_is_the_pressure_laplacian():
    """Projection is consistent: div(grad q) on the MAC grid == laplacian(q)."""
    N, h = 16, 1 / 16
    q = rng.standard_normal((N, N))
    u, v = ns2d.project(np.zeros((N, N + 1)), np.zeros((N + 1, N)), -q, h)   # u = grad q
    assert np.allclose(ns2d.divergence(u, v, h), ns2d.laplacian(q, h), atol=1e-10)


def laplacian_matrix(n, h):
    I = sp.identity(n)
    d = np.full(n, -2.0)
    d[[0, -1]] = -1
    T = sp.diags([np.ones(n - 1), d, np.ones(n - 1)], [-1, 0, 1])
    return (sp.kron(I, T) + sp.kron(T, I)) / h ** 2


def test_multigrid_matches_direct_solve_and_converges_fast():
    N = 64
    p = ns2d.make_params(N=N)
    b = rng.standard_normal((N, N))
    b -= b.mean()                                  # compatible right-hand side
    q = np.zeros((N, N))
    res = [np.abs(b).max()]
    for _ in range(10):
        ns2d.vcycle(q, b, p["h"], p)
        res.append(np.abs(b - ns2d.laplacian(q, p["h"])).max())
    rate = (res[-1] / res[2]) ** (1 / 8)
    assert rate < 0.2, rate
    A = laplacian_matrix(N, p["h"]).tolil()
    A[0, :] = 0
    A[0, 0] = 1                                    # pin one value (singular Neumann problem)
    rhs = b.ravel().copy()
    rhs[0] = 0
    qd = spla.spsolve(A.tocsr(), rhs).reshape(N, N)
    assert np.allclose(q - q.mean(), qd - qd.mean(), atol=1e-8)


def test_projection_removes_divergence():
    N = 32
    p = ns2d.make_params(N=N)
    u, v = random_velocity(N)
    q = ns2d.solve_pressure(np.zeros((N, N)), ns2d.divergence(u, v, p["h"]), p, cycles=12)
    u, v = ns2d.project(u, v, q, p["h"])
    assert np.abs(ns2d.divergence(u, v, p["h"])).max() < 1e-8


def test_minmod_transport_creates_no_new_extrema():
    """1D square wave pushed by a uniform flow stays within [0, 1] (TVD)."""
    N = 64
    p = ns2d.make_params(N=N, Re=100)
    c = np.zeros((N, N))
    c[:, 10:20] = 1
    u = np.full((N, N + 1), 1.0)
    u[:, [0, -1]] = 0
    v = np.zeros((N + 1, N))
    for _ in range(40):
        c = ns2d.advect_dye(c, u, v, p)
    assert c.min() > -1e-12 and c.max() < 1 + 1e-12
    assert abs(c.sum() - 10 * N) < 1e-9           # conservative


def test_body_at_rest_leaves_fluid_at_rest():
    p = ns2d.make_params(N=32, Us=0.0, Uo=0.0)
    s, _ = ns2d.run(p, 5)
    assert np.abs(s["u"]).max() == 0 and np.abs(s["v"]).max() == 0


def test_centred_spinning_cylinder_has_quarter_turn_symmetry():
    """A cylinder spinning at the box centre: the problem is invariant under a
    90 degree rotation, so the discrete solution must be too (tests every index).
    A half turn maps the red-black colouring onto itself: exact to round-off.
    A quarter turn swaps red and black (N even), so it holds to the multigrid tolerance."""
    p = ns2d.make_params(N=32, ro=0.0, Us=1.0, Re=300)
    s, _ = ns2d.run(p, 40)
    u, v = s["u"], s["v"]
    assert np.abs(np.rot90(u, 2) + u).max() < 1e-13
    assert np.abs(np.rot90(v, 2) + v).max() < 1e-13
    assert np.abs(np.rot90(u) + v).max() < 1e-4 * np.abs(u).max()


def test_fluid_inside_body_moves_with_body():
    p = ns2d.make_params(N=64, Us=1.0, Uo=0.5, Re=100)
    s, _ = ns2d.run(p, 30)
    xu, yu, _, _ = ns2d.face_coords(p)
    cx, cy = ns2d.body_centre(s["phi"], p)
    inside = np.hypot(xu - cx, yu - cy) < p["R"] - 3 * p["h"]
    _, ub, _ = ns2d.body_mask_velocity(xu, yu, s["phi"], p)
    assert np.abs(s["u"] - ub)[inside].max() < 0.05 * p["Us"] * 2


def test_spin_torque_opposes_rotation():
    p = ns2d.make_params(N=64, ro=0.0, Us=1.0, Re=100)
    s, _ = ns2d.run(p, 50)
    assert ns2d.stats(s, p)["torque"] < 0


def test_velocity_interpolation():
    """Exact for linear fields inside, equal to the face value at a face, zero on the walls."""
    N, h = 16, 1 / 16
    xu, yu = np.arange(N + 1) * h, (np.arange(N) + 0.5) * h
    xv, yv = (np.arange(N) + 0.5) * h, np.arange(N + 1) * h
    u_lin = 1 + 2 * xu[None, :] + 3 * yu[:, None]
    v_lin = -2 + 0.5 * xv[None, :] - yv[:, None]
    x, y = rng.uniform(0.1, 0.9, 50), rng.uniform(0.1, 0.9, 50)
    up, vp = ns2d.interp_velocity(u_lin, v_lin, x, y)
    assert np.allclose(up, 1 + 2 * x + 3 * y) and np.allclose(vp, -2 + 0.5 * x - y)
    u, v = random_velocity(N)
    assert np.isclose(ns2d.interp_velocity(u, v, xu[3], yu[5])[0], u[5, 3])
    assert np.isclose(ns2d.interp_velocity(u, v, xv[7], yv[2])[1], v[2, 7])
    wx = np.array([0.0, 1.0, 0.3, 0.6])
    wy = np.array([0.4, 0.7, 0.0, 1.0])
    up, vp = ns2d.interp_velocity(u, v, wx, wy)    # points on the four walls
    assert np.abs(up).max() < 1e-14 and np.abs(vp).max() < 1e-14


def test_rk2_particles_in_solid_body_rotation():
    """u = (-(y-1/2), x-1/2) is linear, so interpolation is exact inside; RK2 keeps the
    radius to O(dt^3) per step."""
    N, h = 32, 1 / 32
    xu, yu = np.arange(N + 1) * h, (np.arange(N) + 0.5) * h
    xv, yv = (np.arange(N) + 0.5) * h, np.arange(N + 1) * h
    u = np.broadcast_to(-(yu[:, None] - 0.5), (N, N + 1)).copy()
    v = np.broadcast_to(xv[None, :] - 0.5, (N + 1, N)).copy()
    xp, yp = np.array([0.7, 0.5, 0.35]), np.array([0.5, 0.25, 0.6])
    r0 = np.hypot(xp - 0.5, yp - 0.5)
    dt = 0.05
    for _ in range(int(2 * np.pi / dt)):
        xp, yp = ns2d.advect_particles(xp, yp, u, v, dt)
    assert np.abs(np.hypot(xp - 0.5, yp - 0.5) - r0).max() < 2e-3
