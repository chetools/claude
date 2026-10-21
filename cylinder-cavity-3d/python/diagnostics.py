"""Method-independent flow diagnostics for the 3D cylinder-in-a-box page.

Every function takes the cell-centred velocity U of shape (3, Nz, N, N), index order
[component (u, v, w), k (z), j (y), i (x)], with cell centres at x = (i + 1/2) h etc.
It does not matter whether U came from the finite-volume or the lattice-Boltzmann solver.

Geometry
--------
* x and y: no-slip walls at 0 and 1, half a cell outside the outermost cell centres.
* z, span = "periodic": the grid wraps around, Lz = Nz h.
* z, span = "walls":    no-slip walls at z = 0 and z = Lz, again half a cell outside.

Derivatives
-----------
Second-order central differences, (f[i+1] - f[i-1]) / (2h).  At a wall the missing
neighbour is a ghost value u_ghost = -u (odd mirror: the velocity is zero half a cell
away, so the straight line through u and u_ghost crosses zero on the wall).  This is the
same rule the solvers use for no-slip.  Periodic z wraps around; for Nz = 1 periodic the
neighbour is the cell itself, so every z-derivative is exactly zero.
"""
import numpy as np


# ----------------------------------------------------------------- derivatives
def ddx(f, axis, h, wall=True):
    """Central difference of f along `axis` (0 = z, 1 = y, 2 = x).

    wall=True : ghost value = -(edge value)  (no-slip wall half a cell away)
    wall=False: periodic wrap
    """
    lo, hi = np.take(f, [0], axis), np.take(f, [-1], axis)
    if wall:
        lo, hi = -lo, -hi                       # ghost below the first cell, above the last
    else:
        lo, hi = hi, lo                         # wrap: below the first cell is the last cell
    fp = np.concatenate([lo, f, hi], axis=axis)
    n = f.shape[axis]
    return (np.take(fp, np.arange(2, n + 2), axis) - np.take(fp, np.arange(0, n), axis)) / (2 * h)


def gradient(U, h, span="periodic"):
    """G[a][b] = d u_a / d x_b, each of shape (Nz, N, N)  (b = 0, 1, 2 is x, y, z)."""
    zwall = span == "walls"
    return [[ddx(U[a], 2, h), ddx(U[a], 1, h), ddx(U[a], 0, h, wall=zwall)] for a in range(3)]


# ----------------------------------------------------------------- vorticity and Q
def vorticity(U, h, span="periodic"):
    """omega = curl u, shape (3, Nz, N, N)."""
    G = gradient(U, h, span)
    return np.array([G[2][1] - G[1][2],         # dw/dy - dv/dz
                     G[0][2] - G[2][0],         # du/dz - dw/dx
                     G[1][0] - G[0][1]])        # dv/dx - du/dy


def q_criterion(U, h, span="periodic"):
    """Q = 1/2 (|Omega|^2 - |S|^2); S, Omega = symmetric / antisymmetric part of grad u.
    Q > 0: rotation beats strain (a vortex core)."""
    G = gradient(U, h, span)
    S2 = 0.0
    O2 = 0.0
    for a in range(3):
        for b in range(3):
            S2 = S2 + (0.5 * (G[a][b] + G[b][a])) ** 2
            O2 = O2 + (0.5 * (G[a][b] - G[b][a])) ** 2
    return 0.5 * (O2 - S2)


# ----------------------------------------------------------------- integral measures
def energy(U, h, Lz):
    """(1/Lz) * integral of 1/2 |u|^2 dV, dV = h^3: kinetic energy per unit span.
    For a z-uniform flow this equals the 2D energy, whatever Nz is."""
    return float(0.5 * np.sum(U ** 2) * h ** 3 / Lz)


def enstrophy(U, h, Lz, span="periodic"):
    """(1/Lz) * integral of 1/2 |omega|^2 dV."""
    return float(0.5 * np.sum(vorticity(U, h, span) ** 2) * h ** 3 / Lz)


def spanwise_energy(U, h, Lz, span="periodic"):
    """How three-dimensional is the flow?  Returns dict(Ew, E3d, Ekz).

    Ew  = (1/Lz) int 1/2 w^2 dV            energy of the spanwise velocity
    E3d = (1/Lz) int 1/2 |u - <u>_z|^2 dV  energy of the departure from the z-average
    Ekz = energy in each spanwise Fourier mode kz = 0 .. Nz/2 (wavelength Lz/kz), periodic only;
          None for span = "walls" (not periodic in z).

    Normalisation of Ekz: c_m = rFFT_z(U)/Nz, energy of mode m = h^2 sum_xy 1/2 sum_comp |c_m|^2,
    doubled for 0 < m < Nz/2 (the rFFT keeps only half of the +/- pairs).  Then sum(Ekz) = energy(U)
    exactly (Parseval); Ekz[0] is the z-average flow, Ekz[1:] is the 3D part.
    """
    Nz = U.shape[1]
    dV = h ** 3
    Ew = 0.5 * np.sum(U[2] ** 2) * dV / Lz
    dev = U - U.mean(axis=1, keepdims=True)
    E3d = 0.5 * np.sum(dev ** 2) * dV / Lz
    Ekz = None
    if span == "periodic":
        c = np.fft.rfft(U, axis=1) / Nz
        mult = np.full(c.shape[1], 2.0)
        mult[0] = 1.0
        if Nz % 2 == 0:
            mult[-1] = 1.0                      # Nyquist mode has no partner
        Ekz = 0.5 * mult * np.sum(np.abs(c) ** 2, axis=(0, 2, 3)) * h ** 2
    return dict(Ew=float(Ew), E3d=float(E3d), Ekz=Ekz)


def spectrum_h(U, h):
    """Horizontal energy spectrum.  Returns (k, E_k), k = 0, 1, 2, ... in units of 2 pi / L, L = 1.

    For each z-plane: multiply every component by the Hann window W(x) W(y), W = sin^2(pi x),
    take the 2D FFT, and add 1/2 |u_hat|^2 into the shell round(|k|) (kx, ky integer wavenumbers).
    The box walls are not periodic, the window removes the jump at the edges.  Windowing removes
    energy, so the result is divided by mean(W^2) (the average of the window squared), which
    restores the energy of a statistically uniform field.  Then, per plane,
        sum_k E_k = (1/2) mean(|W u|^2) / mean(W^2)
    exactly (Parseval); it is only approximately the plane's energy because W weights the
    centre more than the edges.  Shells go up to the corner of the FFT square, so nothing is
    lost.  Planes are averaged.  Shell width is 1, so sum(E_k) * dk = sum(E_k).
    """
    _, Nz, N, _ = U.shape
    x = (np.arange(N) + 0.5) / N
    W = np.sin(np.pi * x) ** 2
    W2 = W[:, None] * W[None, :]                # window in (y, x)
    uhat = np.fft.fft2(U * W2, axes=(2, 3)) / N ** 2
    e = 0.5 * np.sum(np.abs(uhat) ** 2, axis=0).mean(axis=0) / np.mean(W2 ** 2)   # (N, N), planes averaged
    kk = np.fft.fftfreq(N, d=1.0 / N)
    shell = np.rint(np.hypot(kk[:, None], kk[None, :])).astype(int)
    Ek = np.bincount(shell.ravel(), weights=e.ravel())
    return np.arange(len(Ek)), Ek


# ----------------------------------------------------------------- one row of the history
def summary(U, s, p):
    """Numbers recorded every few steps: dict(E, Z, Ew, E3d, torque, maxdiv, maxspeed).

    torque and maxdiv are known only to the solver (momentum exchange on the body, divergence
    of its own velocity field).  They are copied from the state dict if the solver stored them
    there as s["torque"], s["maxdiv"], else NaN.
    """
    h, Lz, span = p["h"], p["Lz"], p["span"]
    sp = spanwise_energy(U, h, Lz, span)
    return dict(E=energy(U, h, Lz), Z=enstrophy(U, h, Lz, span), Ew=sp["Ew"], E3d=sp["E3d"],
                torque=float(s.get("torque", np.nan)), maxdiv=float(s.get("maxdiv", np.nan)),
                maxspeed=float(np.sqrt((U ** 2).sum(axis=0)).max()))
