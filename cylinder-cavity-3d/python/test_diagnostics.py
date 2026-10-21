"""Tests of diagnostics.py against closed-form fields."""
import numpy as np
import pytest

import diagnostics as dg

K = 2 * np.pi


def grid(N, Nz):
    h = 1.0 / N
    x = (np.arange(N) + 0.5) * h
    z = (np.arange(Nz) + 0.5) * h
    return h, z[:, None, None], x[None, :, None], x[None, None, :]      # z, y, x broadcast


# components = products f(x) g(y) h(z), listed with their derivative
S = lambda m: (lambda t: np.sin(m * K * t), lambda t: m * K * np.cos(m * K * t))
C = lambda m: (lambda t: np.cos(m * K * t), lambda t: -m * K * np.sin(m * K * t))
# each component: (x-factor, y-factor, z-factor); all odd about x,y = 0, 1 so walls are exact
COMP = [(S(1), S(1), C(1)), (S(2), S(1), S(1)), (S(1), S(2), C(1))]


def field_and_gradient(N, Nz):
    """Smooth periodic-in-z field vanishing like an odd function at the x,y walls; Lz = 1 (Nz = N)."""
    h, z, y, x = grid(N, Nz)
    U = np.zeros((3, Nz, N, N))
    G = np.zeros((3, 3) + (Nz, N, N))
    for a, (fx, fy, fz) in enumerate(COMP):
        U[a] = fx[0](x) * fy[0](y) * fz[0](z)
        G[a, 0] = fx[1](x) * fy[0](y) * fz[0](z)
        G[a, 1] = fx[0](x) * fy[1](y) * fz[0](z)
        G[a, 2] = fx[0](x) * fy[0](y) * fz[1](z)
    return h, U, G


def test_vorticity_and_q_second_order():
    errw, errq = [], []
    for N in (32, 64, 128):
        h, U, G = field_and_gradient(N, N)
        w = np.array([G[2, 1] - G[1, 2], G[0, 2] - G[2, 0], G[1, 0] - G[0, 1]])
        Q = -0.5 * np.einsum("ab...,ba...->...", G, G)          # Q = -1/2 tr(G G), independent of S/Omega split
        errw.append(np.abs(dg.vorticity(U, h, "periodic") - w).max())
        errq.append(np.abs(dg.q_criterion(U, h, "periodic") - Q).max())
    for err in (errw, errq):
        orders = [np.log2(err[i] / err[i + 1]) for i in range(2)]
        assert min(orders) > 1.9, (err, orders)


def interior(f):
    return f[..., :, 1:-1, 1:-1]


def test_solid_body_rotation():
    N, Nz, Om = 32, 4, 0.7
    h, z, y, x = grid(N, Nz)
    U = np.zeros((3, Nz, N, N))
    U[0] = -Om * (y - 0.5) + 0 * x + 0 * z
    U[1] = Om * (x - 0.5) + 0 * y + 0 * z
    w = dg.vorticity(U, h, "periodic")
    Q = dg.q_criterion(U, h, "periodic")
    # interior cells only: the field does not vanish at the walls, so the mirror ghost is wrong there
    assert np.allclose(interior(w[2]), 2 * Om)
    assert np.allclose(interior(w[0]), 0) and np.allclose(interior(w[1]), 0)
    assert np.allclose(interior(Q), Om ** 2) and interior(Q).min() > 0


def test_pure_strain():
    N, Nz, a = 32, 4, 0.9
    h, z, y, x = grid(N, Nz)
    U = np.zeros((3, Nz, N, N))
    U[0] = a * (x - 0.5) + 0 * y + 0 * z
    U[1] = -a * (y - 0.5) + 0 * x + 0 * z
    Q = dg.q_criterion(U, h, "periodic")
    assert np.allclose(interior(Q), -a ** 2) and interior(Q).max() < 0
    assert np.allclose(interior(dg.vorticity(U, h, "periodic")), 0)


def test_nz1_has_no_z_derivatives_and_walls_ghost():
    N = 16
    h, U, _ = field_and_gradient(N, N)
    U1 = U[:, :1]
    for span in ("periodic", "walls"):
        G = dg.gradient(U1, h, span)
        assert all(np.all(G[a][2] == 0) for a in range(3))
    # no-slip ghost: the wall-cell difference of u = const is (u + u)/(2h) = u/h
    Uc = np.ones((3, 3, 8, 8))
    G = dg.gradient(Uc, 1 / 8, "walls")
    assert np.isclose(G[0][2][0, 3, 3], (Uc[0, 1, 3, 3] + Uc[0, 0, 3, 3]) / (2 / 8))   # k = 0 wall cell
    assert np.isclose(G[0][2][1, 3, 3], 0.0)                                           # k = 1 interior


def tile(U2, Nz):
    return np.repeat(U2[:, None], Nz, axis=1)


def test_z_uniform_field():
    rng = np.random.default_rng(1)
    N, Nz = 16, 8
    U2 = rng.standard_normal((3, N, N))
    U = tile(U2, Nz)
    h, Lz = 1.0 / N, Nz / N
    sp = dg.spanwise_energy(U, h, Lz)
    assert sp["E3d"] < 1e-25 * dg.energy(U, h, Lz)
    assert sp["Ew"] > 0                                         # w random here, uniform in z
    assert np.all(sp["Ekz"][1:] < 1e-25) and np.isclose(sp["Ekz"][0], dg.energy(U, h, Lz))
    U[2] = 0
    assert dg.spanwise_energy(U, h, Lz)["Ew"] == 0


def test_single_spanwise_mode():
    N, Nz, m = 16, 16, 3
    h, z, y, x = grid(N, Nz)
    U = np.zeros((3, Nz, N, N))
    U[0] = np.cos(K * m * z) * np.sin(K * x) * np.sin(K * y)
    sp = dg.spanwise_energy(U, h, Nz * h)
    Ekz = sp["Ekz"]
    assert np.argmax(Ekz) == m
    assert Ekz[m] > 0.999999 * Ekz.sum()
    assert np.isclose(sp["E3d"], dg.energy(U, h, Nz * h))      # no z-mean at all
    # Nyquist mode (kz = Nz/2) is counted once
    U[0] = np.cos(K * (Nz // 2) * z + 0.7) * np.sin(K * x) * np.sin(K * y)
    Ek = dg.spanwise_energy(U, h, Nz * h)["Ekz"]
    assert np.isclose(Ek.sum(), dg.energy(U, h, Nz * h)) and np.argmax(Ek) == Nz // 2


@pytest.mark.parametrize("Nz", [1, 2, 5, 8])
def test_parseval_ekz(Nz):
    rng = np.random.default_rng(Nz)
    N = 8
    U = rng.standard_normal((3, Nz, N, N))
    h, Lz = 1.0 / N, Nz / N
    sp = dg.spanwise_energy(U, h, Lz)
    assert len(sp["Ekz"]) == Nz // 2 + 1
    assert np.isclose(sp["Ekz"].sum(), dg.energy(U, h, Lz), rtol=1e-12)
    assert dg.spanwise_energy(U, h, Lz, span="walls")["Ekz"] is None


def test_energy_per_unit_span_independent_of_nz():
    rng = np.random.default_rng(3)
    N = 16
    U2 = rng.standard_normal((3, N, N))
    E = [dg.energy(tile(U2, Nz), 1.0 / N, Nz / N) for Nz in (1, 2, 8)]
    Z = [dg.enstrophy(tile(U2, Nz), 1.0 / N, Nz / N) for Nz in (1, 2, 8)]
    assert np.allclose(E, E[0], rtol=1e-12) and np.allclose(Z, Z[0], rtol=1e-12)
    assert np.isclose(E[0], 0.5 * np.sum(U2 ** 2) / N ** 2)     # = 2D energy, area 1


@pytest.mark.parametrize("kx,ky", [(5, 0), (0, 7), (3, 4), (9, 0)])
def test_spectrum_peak(kx, ky):
    N = 64
    h, z, y, x = grid(N, 2)
    U = np.zeros((3, 2, N, N))
    U[0] = np.cos(K * (kx * x + ky * y) + 0.3) + 0 * z
    k, Ek = dg.spectrum_h(U, h)
    assert k[np.argmax(Ek)] == round(np.hypot(kx, ky))
    assert Ek[round(np.hypot(kx, ky))] > 0.25 * Ek.sum()        # Hann leaks to the neighbouring shells (about half stays in the shell)


def test_spectrum_normalisation():
    N, Nz = 64, 3
    rng = np.random.default_rng(5)
    U = rng.standard_normal((3, Nz, N, N))
    h = 1.0 / N
    k, Ek = dg.spectrum_h(U, h)
    # exact: Parseval of the windowed, rescaled field
    W = np.sin(np.pi * (np.arange(N) + 0.5) / N) ** 2
    W2 = W[:, None] * W[None, :]
    expect = 0.5 * np.mean((U * W2) ** 2, axis=(2, 3)).sum(axis=0).mean() / np.mean(W2 ** 2)
    assert np.isclose(Ek.sum(), expect, rtol=1e-12)
    # white noise is statistically uniform, so this is also close to the plane energy
    assert np.isclose(Ek.sum(), dg.energy(U, h, Nz * h) * Nz / Nz, rtol=0.1)


def test_summary():
    N, Nz = 16, 4
    h, U, _ = field_and_gradient(N, Nz)
    p = dict(h=h, Lz=Nz * h, span="periodic")
    r = dg.summary(U, {}, p)
    assert set(r) == {"E", "Z", "Ew", "E3d", "torque", "maxdiv", "maxspeed"}
    assert np.isnan(r["torque"]) and np.isnan(r["maxdiv"])
    r = dg.summary(U, dict(torque=1.5, maxdiv=1e-9), p)
    assert r["torque"] == 1.5 and r["maxdiv"] == 1e-9
    assert np.isclose(r["maxspeed"], np.sqrt((U ** 2).sum(0)).max())


# ----------------------------------------------------------------- fluid-only mask
def body_p(N=32, Nz=4, **kw):
    return dict(N=N, Nz=Nz, h=1.0 / N, Lz=Nz / N, span="periodic", R=0.1, ro=0.2, omega_o=2.0, **kw)


def test_fluid_mask_geometry():
    p = body_p(N=64)
    m = dg.fluid_mask(p, 0.0)
    assert m.shape == (4, 64, 64) and m.dtype == bool
    assert np.all(m == m[0])                                   # same in every plane
    area_body = 1.0 - m[0].mean()
    assert abs(area_body - np.pi * 0.1 ** 2) < 0.03 * np.pi * 0.1 ** 2
    # centre at (0.7, 0.5): cell (j=31/32, i=44/45) is inside, the box centre is outside
    assert not m[0, 32, 45] and m[0, 32, 32]
    # rotating by pi/2 moves it to (0.5, 0.7)
    m2 = dg.fluid_mask(p, np.pi / 2)
    assert not m2[0, 45, 32] and m2[0, 32, 45]
    # different Nz does not change the plane
    assert np.array_equal(dg.fluid_mask(body_p(N=64, Nz=1), 0.3)[0], dg.fluid_mask(p, 0.3)[0])


def test_masked_integrals():
    rng = np.random.default_rng(7)
    p = body_p()
    N, Nz = p["N"], p["Nz"]
    h, Lz = p["h"], p["Lz"]
    U = rng.standard_normal((3, Nz, N, N))
    m = dg.fluid_mask(p, 0.4)
    # default (None) is the whole box, and an all-True mask changes nothing
    ones = np.ones((Nz, N, N), bool)
    assert dg.energy(U, h, Lz) == dg.energy(U, h, Lz, ones)
    assert dg.enstrophy(U, h, Lz) == dg.enstrophy(U, h, Lz, fluid=ones)
    # energy over the fluid = whole box minus the body cells
    Ebody = 0.5 * np.sum(U[:, ~m] ** 2) * h ** 3 / Lz
    assert np.isclose(dg.energy(U, h, Lz, m), dg.energy(U, h, Lz) - Ebody, rtol=1e-12)
    w = dg.vorticity(U, h)
    Zbody = 0.5 * np.sum(w[:, ~m] ** 2) * h ** 3 / Lz
    assert np.isclose(dg.enstrophy(U, h, Lz, fluid=m), dg.enstrophy(U, h, Lz) - Zbody, rtol=1e-12)
    # Ew, E3d, Ekz from the masked velocity; Parseval still exact
    sp = dg.spanwise_energy(U, h, Lz, "periodic", m)
    Um = U * m
    assert np.isclose(sp["Ew"], 0.5 * np.sum(Um[2] ** 2) * h ** 3 / Lz, rtol=1e-12)
    assert np.isclose(sp["E3d"], 0.5 * np.sum((Um - Um.mean(1, keepdims=True)) ** 2) * h ** 3 / Lz, rtol=1e-12)
    assert np.isclose(sp["Ekz"].sum(), dg.energy(U, h, Lz, m), rtol=1e-12)
    assert dg.spanwise_energy(U, h, Lz, "walls", m)["Ekz"] is None


def test_masked_enstrophy_body_interior():
    # spinning body only: fluid enstrophy excludes the body's 2 pi Om^2 R^2 (interior cells)
    p = body_p(N=64, Nz=2)
    h, Lz, N = p["h"], p["Lz"], p["N"]
    x = (np.arange(N) + 0.5) / N
    cx, cy, Om = 0.7, 0.5, 3.0
    inside = ~dg.fluid_mask(p, 0.0)
    U = np.zeros((3, 2, N, N))
    U[0] = np.where(inside, -Om * (x[None, :, None] - cy) , 0.0)
    U[1] = np.where(inside, Om * (x[None, None, :] - cx), 0.0)
    # deep interior of the body (3 cells in from the edge): Z = 1/2 (2 Om)^2 area = 2 Om^2 pi r^2 per unit span
    pin = dict(p, R=p["R"] - 3 * h)
    Zin = dg.enstrophy(U, h, Lz, fluid=~dg.fluid_mask(pin, 0.0))
    assert np.isclose(Zin, 2 * Om ** 2 * np.pi * pin["R"] ** 2, rtol=0.05)
    # the fluid-only value excludes all of it (only the velocity jump at the rim is left)
    Zfl = dg.enstrophy(U, h, Lz, fluid=dg.fluid_mask(p, 0.0))
    assert np.isclose(dg.enstrophy(U, h, Lz) - Zfl, dg.enstrophy(U, h, Lz, fluid=~dg.fluid_mask(p, 0.0)), rtol=1e-12)


def test_masked_spectrum():
    N, Nz = 64, 2
    p = body_p(N=N, Nz=Nz)
    m = dg.fluid_mask(p, 0.0)
    h, z, y, x = grid(N, Nz)
    U = np.zeros((3, Nz, N, N))
    U[0] = np.cos(K * 5 * x + 0.3) + 0 * y + 0 * z
    k, E0 = dg.spectrum_h(U, h)
    k, E1 = dg.spectrum_h(U, h, m)
    k, E2 = dg.spectrum_h(U * m, h)
    assert np.allclose(E1, E2, rtol=1e-12, atol=1e-30)         # masking = zeroing the body cells
    assert E1.sum() < E0.sum()                                 # energy removed with the body cells
    assert np.argmax(E1) == 5
    # without the argument nothing changed
    assert np.array_equal(E0, dg.spectrum_h(U, h, None)[1])


def test_summary_mask_from_state():
    rng = np.random.default_rng(9)
    p = body_p()
    N, Nz = p["N"], p["Nz"]
    U = rng.standard_normal((3, Nz, N, N))
    h, Lz = p["h"], p["Lz"]
    r = dg.summary(U, dict(phi=0.4, t=99.0, torque=2.0, maxdiv=3.0), p)      # phi wins over t
    m = dg.fluid_mask(p, 0.4)
    assert np.isclose(r["E"], dg.energy(U, h, Lz, m)) and np.isclose(r["Z"], dg.enstrophy(U, h, Lz, fluid=m))
    assert r["torque"] == 2.0 and r["maxdiv"] == 3.0
    r2 = dg.summary(U, dict(t=0.2), p)                                     # phi = omega_o t = 0.4
    assert np.isclose(r2["E"], r["E"]) and np.isclose(r2["Ew"], r["Ew"]) and np.isclose(r2["E3d"], r["E3d"])
    assert r["E"] < dg.energy(U, h, Lz)


def test_summary_with_real_params():
    import fv3d, lbm3d
    for mod in (fv3d, lbm3d):
        p = mod.make_params(N=16, Nz=2, Re=100.0, Uo=0.3)
        U = np.ones((3, 2, 16, 16))
        r = dg.summary(U, dict(t=1.0), p)
        assert 0 < r["E"] < dg.energy(U, p["h"], p["Lz"])
