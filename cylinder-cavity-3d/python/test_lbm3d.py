"""Tests of the numpy D3Q19 lattice Boltzmann reference (lbm3d.py).

Every test compares with an exact solution or an independent implementation, with the
tolerance stated in the test.  Heavier cases are marked `slow` (pytest -m slow).
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lbm3d as L  # noqa: E402

COLLISIONS = ("bgk", "reg", "mrt")


def plain_step(f, p):
    """collide -> stream -> walls: a box without body (periodic directions via the p flags)."""
    fpost = L.collide(f, p)
    g = L.stream(fpost)
    L.bounce_back_walls(g, fpost, p)
    return g


# ---------------------------------------------------------------- lattice and equilibrium
def test_lattice_tables():
    assert np.all(C_sum := L.C[L.OPP] + L.C == 0), C_sum
    assert np.all(L.OPP[L.OPP] == np.arange(19))
    assert abs(L.W.sum() - 1) < 1e-15
    # isotropy: sum w c_a c_b = c_s^2 delta_ab, odd moments vanish
    assert np.allclose(np.einsum("q,qa,qb->ab", L.W, L.C, L.C), np.eye(3) / 3, atol=1e-15)
    assert np.allclose(np.einsum("q,qa->a", L.W, L.C), 0, atol=1e-15)


def test_equilibrium_moments_exact():
    """rho, rho u and the momentum flux rho c_s^2 delta + rho u u are reproduced to round-off."""
    rng = np.random.default_rng(1)
    shape = (3, 4, 5)
    rho = 1 + 0.1 * rng.random(shape)
    u = 0.1 * (rng.random((3,) + shape) - 0.5)
    feq = L.equilibrium(rho, u)
    assert np.abs(feq.sum(0) - rho).max() < 1e-14
    j = np.einsum("qa,q...->a...", L.C, feq)
    assert np.abs(j - rho * u).max() < 1e-14
    Pi = np.einsum("qa,qb,q...->ab...", L.C, L.C, feq)
    exact = rho * (np.eye(3)[:, :, None, None, None] / 3 + u[:, None] * u[None, :])
    assert np.abs(Pi - exact).max() < 1e-14


def test_mrt_matrix_properties():
    G = L.M_MRT @ L.M_MRT.T
    assert np.abs(G - np.diag(np.diag(G))).max() < 1e-12            # rows orthogonal
    A = L.mrt_matrix(1.7)
    assert np.abs(A.sum(0)).max() < 1e-13                           # mass conserved by collision
    assert np.abs(L.C.T @ A).max() < 1e-13                          # momentum conserved
    # shear moments relax at omega: M row 'pxy' of A's image
    row = L.M_MRT[13]
    assert np.allclose(row @ A, 1.7 * row, atol=1e-12)


# ---------------------------------------------------------------- Taylor-Green vortex
def tg_amplitude_ratio(N, collision, tau=0.8, nsteps_16=60, U0_16=0.04):
    """Decaying Taylor-Green vortex in a fully periodic box under diffusive scaling
    (dt ~ h^2, u ~ h, tau fixed).  Returns (measured, exact) amplitude ratio A(T)/A(0)."""
    m = N // 16
    nu = (tau - 0.5) / 3
    p = L.lattice_params(N, 1, nu, collision, wall_x=False, wall_y=False)
    n = nsteps_16 * m * m
    k = 2 * np.pi / N
    x = np.arange(N) + 0.5
    X, Y = np.meshgrid(x, x)
    U0 = U0_16 / m
    ux = -U0 * np.cos(k * X) * np.sin(k * Y)
    uy = U0 * np.sin(k * X) * np.cos(k * Y)
    rho = 1 - 0.75 * U0 ** 2 * (np.cos(2 * k * X) + np.cos(2 * k * Y))     # p = -U0^2/4 (cos 2kx + cos 2ky), rho = 1 + p/c_s^2
    u = np.zeros((3, 1, N, N))
    u[0, 0], u[1, 0] = ux, uy
    f = L.equilibrium(rho[None], u)
    shape = -np.cos(k * X) * np.sin(k * Y)

    def amp(f):
        _, v = L.macroscopic(f)
        return (v[0, 0] * shape).sum() / (shape ** 2).sum()

    a0 = amp(f)
    for _ in range(n):
        f = plain_step(f, p)
    return amp(f) / a0, np.exp(-2 * nu * k * k * n)


@pytest.mark.parametrize("collision", COLLISIONS)
def test_taylor_green_decay_and_convergence(collision):
    """Amplitude decays as exp(-2 nu k^2 t); error falls at second order with the grid.
    Tolerances: error(16) < 4 %, observed order between N=16->32 and 32->64 >= 1.8."""
    errs = []
    for N in (16, 32, 64):
        meas, exact = tg_amplitude_ratio(N, collision)
        errs.append(abs(meas - exact) / exact)
    orders = [np.log2(errs[0] / errs[1]), np.log2(errs[1] / errs[2])]
    print(f"TG {collision}: errors {errs}, orders {orders}")
    assert errs[0] < 0.04
    assert min(orders) > 1.8


# ---------------------------------------------------------------- walls half a cell away
def sine_decay_rate(f, p, nsteps, profile, extract):
    a0 = extract(f, profile)
    for _ in range(nsteps):
        f = plain_step(f, p)
    return -np.log(extract(f, profile) / a0) / nsteps


@pytest.mark.parametrize("collision", COLLISIONS)
def test_halfway_wall_y(collision):
    """u_x = U0 sin(pi y/H) e^{-nu pi^2 t/H^2} between walls at y = 0 and y = H = N (nodes at
    j + 1/2) is an exact solution of the Navier-Stokes equations.  If the walls sit exactly
    half a cell outside the outer nodes the lattice decay rate is that of height H.  The effective
    height H_eff = pi sqrt(nu/rate) must equal N to within 0.5 % at N=8 and the error must fall
    at (about) second order."""
    errs = []
    for N in (8, 16, 32):
        nu = 0.1
        p = L.lattice_params(N, 1, nu, collision, wall_x=False, wall_y=True)
        y = np.arange(N) + 0.5
        prof = np.sin(np.pi * y / N)[None, :, None] * np.ones((1, 1, N))
        u = np.zeros((3, 1, N, N))
        u[0] = 0.01 * prof
        f = L.equilibrium(np.ones((1, N, N)), u)
        ext = lambda f, pr: (L.macroscopic(f)[1][0] * pr).sum() / (pr ** 2).sum()
        n = int(0.6 * N * N / (np.pi ** 2 * nu))               # amplitude decays by e^-0.6
        rate = sine_decay_rate(f, p, n, prof, ext)
        Heff = np.pi * np.sqrt(nu / rate)
        errs.append(abs(Heff - N) / N)
    print(f"wall y {collision}: relative H_eff error {errs}")
    assert errs[0] < 5e-3
    assert errs[2] < errs[1] < errs[0] and errs[0] / errs[2] > 8     # ~ 1/N^2


@pytest.mark.parametrize("collision", COLLISIONS)
def test_halfway_wall_z(collision):
    """Same exact solution with the walls at z = 0 and z = Lz (span="walls")."""
    nu, Nz, N = 0.1, 32, 4
    p = L.lattice_params(N, Nz, nu, collision, span="walls", wall_x=False, wall_y=False)
    z = np.arange(Nz) + 0.5
    prof = np.sin(np.pi * z / Nz)[:, None, None] * np.ones((1, N, N))
    u = np.zeros((3, Nz, N, N))
    u[0] = 0.01 * prof
    f = L.equilibrium(np.ones((Nz, N, N)), u)
    ext = lambda f, pr: (L.macroscopic(f)[1][0] * pr).sum() / (pr ** 2).sum()
    n = int(0.6 * Nz * Nz / (np.pi ** 2 * nu))
    rate = sine_decay_rate(f, p, n, prof, ext)
    Heff = np.pi * np.sqrt(nu / rate)
    print(f"wall z {collision}: H_eff/Nz - 1 = {Heff / Nz - 1:.2e}")
    assert abs(Heff - Nz) / Nz < 5e-3


# ---------------------------------------------------------------- D3Q19 with Nz = 1 is D2Q9
def test_nz1_equals_d2q9_bgk():
    """An independent D2Q9 BGK step; the D3Q19 populations summed over c_z must agree to round-off."""
    N, tau, nsteps = 16, 0.7, 60
    c9 = np.array([(0, 0), (1, 0), (0, 1), (-1, 0), (0, -1), (1, 1), (-1, 1), (-1, -1), (1, -1)])
    w9 = np.array([4 / 9] + [1 / 9] * 4 + [1 / 36] * 4)

    def feq9(rho, ux, uy):
        cu = c9[:, 0, None, None] * ux + c9[:, 1, None, None] * uy
        return w9[:, None, None] * rho * (1 + 3 * cu + 4.5 * cu ** 2 - 1.5 * (ux ** 2 + uy ** 2))

    def step9(f):
        rho = f.sum(0)
        ux = (c9[:, 0, None, None] * f).sum(0) / rho
        uy = (c9[:, 1, None, None] * f).sum(0) / rho
        fp = f - (f - feq9(rho, ux, uy)) / tau
        return np.array([np.roll(fp[q], (c9[q, 1], c9[q, 0]), axis=(0, 1)) for q in range(9)])

    x = np.arange(N) + 0.5
    X, Y = np.meshgrid(x, x)
    k = 2 * np.pi / N
    ux = -0.04 * np.cos(k * X) * np.sin(2 * k * Y) + 0.01 * np.sin(3 * k * Y)
    uy = 0.04 * np.sin(k * X) * np.cos(k * Y) - 0.02 * np.cos(2 * k * X)
    rho = 1 + 0.02 * np.cos(k * X + 0.3) * np.sin(k * Y)
    f9 = feq9(rho, ux, uy)
    p = L.lattice_params(N, 1, (tau - 0.5) / 3, "bgk", wall_x=False, wall_y=False)
    u3 = np.zeros((3, 1, N, N))
    u3[0, 0], u3[1, 0] = ux, uy
    f19 = L.equilibrium(rho[None], u3)
    for _ in range(nsteps):
        f9 = step9(f9)
        f19 = plain_step(f19, p)
    summed = np.zeros_like(f9)
    for q in range(19):
        cx, cy, _ = L.C[q]
        summed[[i for i in range(9) if tuple(c9[i]) == (cx, cy)][0]] += f19[q, 0]
    err = np.abs(summed - f9).max()
    print(f"D3Q19(Nz=1) vs D2Q9 after {nsteps} steps: max |df| = {err:.2e}")
    assert err < 1e-13
    # and the flow really evolved
    assert np.abs(f9 - feq9(np.ones((N, N)), 0 * X, 0 * X)).max() > 1e-3


# ---------------------------------------------------------------- the body: geometry and exchange
def test_cut_fractions_are_exact_on_the_circle():
    """Every link, including those with c_z != 0, cuts the circle at s with the fluid node outside,
    the far node inside, and the point x + s c on the circle (3D point, distance in x-y)."""
    p = L.make_params(N=32, Nz=2, ro=0.2, Uo=0.5)
    body = L.make_body(0.7, p)
    N = p["N"]
    solid = L.solid_mask(body, N)
    links = L.find_links(body, ~solid, N)
    nlink = 0
    for q in range(1, 19):
        if links[q] is None:
            continue
        jj, ii, s = links[q]
        cx, cy, cz = L.C[q]
        nlink += jj.size
        assert np.all((s >= 0) & (s <= 1))
        xf, yf = ii + 0.5, jj + 0.5
        assert np.all(np.hypot(xf - body["cx"], yf - body["cy"]) >= body["R"])
        assert np.all(np.hypot(xf + cx - body["cx"], yf + cy - body["cy"]) < body["R"])
        on = np.hypot(xf + s * cx - body["cx"], yf + s * cy - body["cy"])
        assert np.abs(on - body["R"]).max() < 1e-12
        before = np.hypot(xf + 0.999 * s * cx - body["cx"], yf + 0.999 * s * cy - body["cy"])
        assert np.all(before >= body["R"] - 1e-12)                  # first crossing
    assert nlink > 100
    # links with c_z != 0 and the same (cx, cy) as an in-plane link have the same cut
    for q_in, q_z in ((1, 11), (1, 13), (3, 15), (3, 17)):
        a, b = links[q_in], links[q_z]
        assert np.array_equal(a[0], b[0]) and np.array_equal(a[1], b[1]) and np.allclose(a[2], b[2])


@pytest.mark.parametrize("span", ("periodic", "walls"))
def test_uniform_co_moving_flow_is_preserved_and_force_free(span):
    """Fluid in equilibrium at velocity U, body translating at the same U: the interpolated
    bounce-back must reproduce the equilibrium exactly (all cut fractions) and the
    Galilean-invariant momentum exchange gives zero force and torque."""
    p = L.make_params(N=32, Nz=4, ro=0.2, Uo=0.5, span=span)
    body = L.make_body(0.3, p)
    U = np.array([0.03, -0.02])
    body["velocity"] = lambda x, y: (0 * x + U[0], 0 * x + U[1])
    N, Nz = p["N"], p["Nz"]
    solid = L.solid_mask(body, N)
    u = np.zeros((3, Nz, N, N))
    u[0], u[1] = U[0], U[1]
    feq = L.equilibrium(np.ones((Nz, N, N)), u)
    f = np.full_like(feq, np.nan)
    links = L.find_links(body, ~solid, N)
    F = L.bounce_back_body(f, feq, links, ~solid, body, p)
    got = np.isfinite(f)
    assert got.sum() > 0
    assert np.abs(f[got] - feq[got]).max() < 1e-14
    assert np.abs(F[:2]).max() < 1e-12                       # force: antisymmetric link terms cancel
    assert abs(F[2]) < 1e-3                                  # torque: arms differ per link, small (measured 5e-5)


def test_stationary_cylinder_at_rest_has_no_force():
    """Fluid at rest, body at rest and off-centre: momentum exchange is zero to round-off."""
    p = L.make_params(N=32, Nz=2, ro=0.2, Us=0.0, Uo=0.0)
    s = L.init_state(p)
    for _ in range(20):
        L.step(s, p)
    assert np.abs(L.force(s, p)).max() < 1e-12 and abs(L.torque(s, p)) < 1e-12
    assert np.abs(L.cell_velocity(s, p)).max() < 1e-12


# ---------------------------------------------------------------- annular circular Couette
def annulus_torque(N, nsteps, navg, collision="bgk", R2=0.4, Re=10.0):
    """Inner cylinder (radius R=0.1) spinning at Omega = Us/R inside a fixed circle of radius R2,
    both handled by the same Bouzidi code.  Starts from the exact azimuthal profile; returns
    (mean torque on the inner cylinder over the last navg steps, exact value)."""
    p = L.make_params(N=N, Nz=1, Re=Re, ro=0.0, Us=1.0, Uo=0.0, collision=collision)
    inner = L.make_body(0.0, p)
    outer = dict(cx=N / 2, cy=N / 2, R=R2 * N, solid_inside=False, velocity=lambda x, y: (0 * x, 0 * y))
    s_in, s_out = L.solid_mask(inner, N), L.solid_mask(outer, N)
    solid = s_in | s_out
    fluid = ~solid
    R, Om, nu, h, dt = p["R"], p["Omega"], p["nu"], p["h"], p["dt"]
    j, i = np.mgrid[0:N, 0:N] + 0.5
    dx, dy = (i - N / 2) / N, (j - N / 2) / N
    r = np.maximum(np.hypot(dx, dy), 1e-9)
    ut = Om * R ** 2 * (R2 ** 2 / r - r) / (R2 ** 2 - R ** 2) * dt / h
    u = np.zeros((3, 1, N, N))
    u[0, 0], u[1, 0] = -ut * dy / r * fluid, ut * dx / r * fluid
    f = L.equilibrium(np.ones((1, N, N)), u)
    links_in, links_out = L.find_links(inner, fluid, N), L.find_links(outer, fluid, N)
    T = []
    for n in range(nsteps):
        fpost = L.collide(f, p)
        f = L.stream(fpost)
        L.bounce_back_walls(f, fpost, p)
        Fi = L.bounce_back_body(f, fpost, links_in, fluid, inner, p)
        L.bounce_back_body(f, fpost, links_out, fluid, outer, p)
        L._reset_solid(f, s_in, inner)
        L._reset_solid(f, s_out, outer)
        if n >= nsteps - navg:
            T.append(Fi[2] * h ** 4 / dt ** 2 / p["Nz"])
    exact = -4 * np.pi * nu * Om * R ** 2 * R2 ** 2 / (R2 ** 2 - R ** 2)
    return np.mean(T), exact


@pytest.mark.parametrize("collision", COLLISIONS)
def test_annular_couette_torque(collision):
    """Torque per unit length on the spinning inner cylinder = -4 pi mu Omega R^2 R2^2/(R2^2-R^2).
    Tolerance 6 % at N=32 (the grid-convergence check is in the slow test)."""
    T, exact = annulus_torque(32, 1000, 300, collision)
    err = abs(T / exact - 1)
    print(f"annulus {collision} N=32: torque {T:.6f} exact {exact:.6f} rel.err {err:.3%}")
    assert err < 0.06


@pytest.mark.slow
def test_annular_couette_torque_convergence_slow():
    errs = []
    for N, nst in ((32, 1200), (64, 2400), (128, 4800)):
        T, exact = annulus_torque(N, nst, 800, "reg")
        errs.append(abs(T / exact - 1))
    print("annulus reg errors", errs)
    assert errs[2] < errs[1] < errs[0] and errs[2] < 0.01


# ---------------------------------------------------------------- spanwise behaviour
def test_walls_span_mass_and_ekman_pumping():
    """Spinning cylinder between end walls: mass is conserved (fixed body), and the end walls
    drive a spanwise velocity w (Ekman pumping) that is far above round-off."""
    p = L.make_params(N=32, Nz=8, Re=100, ro=0.0, Us=1.0, Uo=0.0, span="walls", seed=0)
    s = L.init_state(p)
    m0 = L.mass(s)
    for _ in range(400):
        L.step(s, p)
    drift = abs(L.mass(s) / m0 - 1)
    w = L.cell_velocity(s, p)[2]
    mid = w[p["Nz"] // 2 - 1: p["Nz"] // 2 + 1]
    print(f"walls span: mass drift {drift:.2e}, max|w| = {np.abs(w).max():.3e}, mid-plane {np.abs(mid).max():.3e}")
    assert drift < 5e-3          # Bouzidi interpolation does not conserve mass exactly: measured ~1.6e-3 (reg) per 400 steps
    assert np.abs(w).max() > 1e-4                          # about 1e-3 U measured; round-off is 1e-16
    # symmetric about the mid plane: w(z) = -w(Lz - z)
    assert np.abs(w + w[::-1]).max() < 1e-10 * max(1, np.abs(w).max())


def test_periodic_span_stays_two_dimensional():
    """Spanwise-uniform start, periodic z (with spin and orbit, so refill is used too):
    w stays at round-off and every z-plane is identical."""
    p = L.make_params(N=32, Nz=4, Re=200, ro=0.2, Us=1.0, Uo=0.5, span="periodic", seed=0)
    s = L.init_state(p)
    for _ in range(150):
        L.step(s, p)
    U = L.cell_velocity(s, p)
    print(f"periodic span: max|w| = {np.abs(U[2]).max():.2e}, plane spread {np.abs(U - U[:, :1]).max():.2e}")
    assert np.abs(U[2]).max() < 1e-12
    assert np.abs(U - U[:, :1]).max() < 1e-12
    assert np.abs(U[:2]).max() > 0.1


# ---------------------------------------------------------------- Mach number
@pytest.mark.parametrize("kw", (dict(Uo=0.0), dict(Uo=1.0)))
def test_mach_default_parameters(kw):
    """Default u_lb = 0.05: the largest lattice speed anywhere stays below 0.1 (Ma < 0.18)."""
    p = L.make_params(N=32, Nz=1, Re=200, **kw)
    s = L.init_state(p)
    umax = 0.0
    for n in range(500):
        L.step(s, p)
        if n % 20 == 0:
            umax = max(umax, np.abs(L.macroscopic(s["f"])[1]).max())
    print(f"max |u_lb| = {umax:.4f} (u_lb input {p['u_lb']})")
    assert umax <= 0.1


def test_refill_with_orbit_stays_bounded_and_runs_diagnostics():
    p = L.make_params(N=32, Nz=2, Re=200, Us=1.0, Uo=1.0)
    s, hist = L.run(p, 200, every=100)
    assert len(hist) == 2 and np.isfinite(L.cell_velocity(s, p)).all()
    rho = L.macroscopic(s["f"])[0]
    assert 0.9 < rho.min() and rho.max() < 1.1


# ---------------------------------------------------------------- deliberate 3D seed
def test_seed_spanwise_content_at_t0():
    """seed > 0: w0 = seed sin(pi x) sin(pi y) sum_m cos(2 pi m z/Lz + m) exactly, so the spanwise
    Fourier modes m = 1..M have amplitude seed*sin sin/2 with phase m, and mode 0 and m > M vanish."""
    p = L.make_params(N=16, Nz=16, seed=2e-3)
    w = L.cell_velocity(L.init_state(p), p)[2]
    x = (np.arange(16) + 0.5) / 16
    sxy = np.outer(np.sin(np.pi * x), np.sin(np.pi * x))
    spec = np.fft.rfft(w, axis=0) / 16
    assert np.abs(spec[0]).max() < 1e-14
    for m in range(1, 9):
        if m <= 4:   # rfft of cos(2 pi m (k+1/2)/Nz + m): amplitude 1/2, phase m + pi m/Nz
            expect = 0.5 * 2e-3 * sxy * np.exp(1j * (m + np.pi * m / 16))
            assert np.abs(spec[m] - expect).max() < 1e-13
        else:
            assert np.abs(spec[m]).max() < 1e-14
    assert np.abs(L.cell_velocity(L.init_state(L.make_params(N=16, Nz=1)), p)[2]).max() == 0


@pytest.mark.parametrize("collision", COLLISIONS)
def test_seed_zero_stays_spanwise_uniform(collision):
    """seed = 0, spanwise-uniform start, periodic z, spin + orbit (Bouzidi links, refill and
    momentum exchange all active): every z-plane stays identical to <= 1e-12 relative."""
    p = L.make_params(N=32, Nz=4, Re=1000, Us=1.0, Uo=1.0, seed=0, collision=collision)
    s = L.init_state(p)
    for _ in range(300):
        L.step(s, p)
    U = L.cell_velocity(s, p)
    scale = np.abs(U).max()
    assert np.abs(U - U[:, :1]).max() / scale < 1e-12
    assert np.abs(U[2]).max() / scale < 1e-12
    # default seed: z-dependence is present from the start
    p2 = L.make_params(N=32, Nz=4, Re=1000, collision=collision)
    s2 = L.init_state(p2)
    assert np.abs(L.cell_velocity(s2, p2)[2]).max() > 1e-4 * p2["Uref"]
