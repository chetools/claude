"""3D incompressible Navier-Stokes in a unit box x, y in [0,1] and span z in [0, Lz],
with a cylinder (axis along z) that spins and orbits.  Numpy reference implementation.

This file is ref2d/ns2d.py extended by one dimension: same functions, same names,
same algorithm.  With Nz = 1 and span = "periodic" it reproduces ns2d to round-off
(the z-terms are exactly zero).  Arrays are indexed [k (z), j (y), i (x)].

Method
------
* Finite volumes on a staggered (MAC) grid of N x N x Nz cubic cells, h = 1/N:
    u  (Nz, N, N+1)   x-velocity on x-faces   u[k,j,i] at x = i h,       y = (j+1/2) h, z = (k+1/2) h
    v  (Nz, N+1, N)   y-velocity on y-faces   v[k,j,i] at x = (i+1/2) h, y = j h,       z = (k+1/2) h
    w  (Nz+1, N, N)   z-velocity on z-faces   w[k,j,i] at x = (i+1/2) h, y = (j+1/2) h, z = k h
    q  (Nz, N, N)     cell centres; q = dt * pressure
* span = "periodic": z wraps round (w[Nz] is a copy of w[0]).
  span = "walls":    no-slip end walls at z = 0 and z = Lz (w = 0 there).
* No-slip walls through ghost values (odd mirrors), advection by MUSCL-minmod
  fluxes, diffusion with the 7-point stencil.
* Time stepping: variable-step Adams-Bashforth 2, then the body (Brinkman
  penalisation on u, v, w), then projection: L q = div u by multigrid, u -= grad q.
* Multigrid: z is coarsened together with x and y while the grid has 2 or more
  cells in z; after that only x and y are coarsened.  With Nz = 1 this is ns2d's.
"""
import numpy as np


# ----------------------------------------------------------------- parameters
def make_params(N=64, Nz=1, Re=200.0, R=0.1, ro=0.2, Us=1.0, Uo=0.0, span="periodic", seed=1e-3,
                cfl=0.3, fdiff=0.05, width=1.0, mask="ramp", vcycles=2, nu1=2, nu2=2, ncoarse=40):
    """Inputs -> dict of everything a time step needs.

    Us  spin surface speed  Omega R   (sign = direction, + is counter-clockwise)
    Uo  orbit speed of the centre  omega_o ro
    Re  = U_ref (2R) / nu  with  U_ref = max(|Us|, |Uo|)  (1 if both are zero)
    """
    assert N >= 8 and N & (N - 1) == 0, "N must be a power of two"
    assert Nz >= 1 and Nz & (Nz - 1) == 0, "Nz must be a power of two"
    assert span in ("periodic", "walls")
    assert span == "periodic" or Nz >= 2, "walls need at least 2 cells in z"
    h = 1.0 / N
    if ro < 0.02:                      # a centred cylinder cannot orbit
        ro, Uo = 0.0, 0.0
    Uref = max(abs(Us), abs(Uo)) or 1.0
    nu = Uref * 2 * R / Re
    Omega = Us / R
    omega_o = Uo / ro if ro > 0 else 0.0
    Umax = abs(Us) + abs(omega_o) * (ro + R)        # fastest point of the body
    # Same formula as 2D.  The explicit diffusion limit of AB2 is nu dt/h^2 < 1/8 in 2D
    # and < 1/12 in 3D (largest eigenvalue of the 7-point stencil is 12 nu/h^2).
    # fdiff = 0.05 < 1/12 keeps a safety factor 1.7 in 3D, so it is NOT changed; keeping
    # it also makes dt independent of Nz (needed for the Nz = 1 <-> Nz > 1 comparison).
    dt = 1.0 / (Umax / (cfl * h) + nu / (fdiff * h * h))      # both limits, combined
    return dict(N=N, Nz=Nz, h=h, Lz=Nz * h, span=span, Re=Re, R=R, ro=ro, Us=Us, Uo=Uo,
                mask=mask, nu=nu, Uref=Uref, seed=seed, Omega=Omega, omega_o=omega_o, dt=dt, eps=width * h, vcycles=vcycles,
                nu1=nu1, nu2=nu2, ncoarse=ncoarse)


def seed_velocity(p):
    """The deliberate 3D seed: an analytic divergence-free velocity curl(psi y-hat),
    u = -dpsi/dz, v = 0, w = dpsi/dx, with the stream function
        psi = seed Uref F(x,y) W(z) S(z),   F = sin^2(pi x) sin(pi y),
        S(z) = sum_{m=1}^{M} sin(k_m z + m) / k_m,  k_m = 2 pi m / Lz,  M = min(4, Nz//4),
        W = 1 (periodic)  or  sin^2(pi z / Lz) (walls),
    so  u = -a F (W' S + W S'),  w = a (dF/dx) W S,  a = seed Uref,  dF/dx = pi sin(2 pi x) sin(pi y).
    It is evaluated on the u faces and the w faces.  u = w = 0 on every wall."""
    N, Nz, h, Lz = p["N"], p["Nz"], p["h"], p["Lz"]
    M = min(4, Nz // 4)
    u = np.zeros((Nz, N, N + 1))
    v = np.zeros((Nz, N + 1, N))
    w = np.zeros((Nz + 1, N, N))
    if M == 0 or p["seed"] == 0:
        return u, v, w
    a = p["seed"] * p["Uref"]

    def zfun(z):                                   # S, S' and W, W' at the heights z
        k = 2 * np.pi * np.arange(1, M + 1)[:, None] / Lz
        S = (np.sin(k * z + np.arange(1, M + 1)[:, None]) / k).sum(axis=0)
        dS = np.cos(k * z + np.arange(1, M + 1)[:, None]).sum(axis=0)
        if p["span"] == "walls":
            W, dW = np.sin(np.pi * z / Lz) ** 2, np.pi / Lz * np.sin(2 * np.pi * z / Lz)
        else:
            W, dW = np.ones_like(z), np.zeros_like(z)
        return S, dS, W, dW
    zc = (np.arange(Nz) + 0.5) * h                 # u sits at cell-centre heights
    zf = np.arange(Nz + 1) * h                     # w sits at face heights
    xu, yu = np.arange(N + 1) * h, (np.arange(N) + 0.5) * h
    xw = yw = (np.arange(N) + 0.5) * h
    S, dS, W, dW = zfun(zc)
    F = np.sin(np.pi * xu)[None, :] ** 2 * np.sin(np.pi * yu)[:, None]          # [j, i]
    u[:] = -a * F[None] * (dW * S + W * dS)[:, None, None]
    u[:, :, [0, -1]] = 0.0                         # sin^2(pi) is 1e-32, not 0
    S, dS, W, dW = zfun(zf)
    dFdx = np.pi * np.sin(2 * np.pi * xw)[None, :] * np.sin(np.pi * yw)[:, None]
    w[:] = a * dFdx[None] * (W * S)[:, None, None]
    if p["span"] == "walls":
        w[[0, -1]] = 0.0                           # sin^2(pi) is 1e-32, not 0
    else:
        w[-1] = w[0]
    return u, v, w


def init_state(p):
    """Fluid at rest plus the deliberate 3D seed (seed_velocity; none for Nz < 4 or seed = 0),
    followed by one projection so that the discrete field is exactly divergence free."""
    s = _rest_state(p)
    if p["Nz"] >= 4 and p["seed"] != 0:
        h = p["h"]
        s["u"], s["v"], s["w"] = seed_velocity(p)
        rhs = divergence(s["u"], s["v"], s["w"], h)
        solve_pressure(s["q"], rhs, dict(p, vcycles=16))
        s["u"], s["v"], s["w"] = project(s["u"], s["v"], s["w"], s["q"], h, p["span"])
        s["q"][:] = 0.0                            # q = dt * pressure of the first step starts from 0
    return s


def _rest_state(p):
    N, Nz = p["N"], p["Nz"]
    return dict(u=np.zeros((Nz, N, N + 1)), v=np.zeros((Nz, N + 1, N)), w=np.zeros((Nz + 1, N, N)),
                ru=np.zeros((Nz, N, N + 1)), rv=np.zeros((Nz, N + 1, N)), rw=np.zeros((Nz + 1, N, N)),
                us=np.zeros((Nz, N, N + 1)), vs=np.zeros((Nz, N + 1, N)), ws=np.zeros((Nz + 1, N, N)),
                q=np.zeros((Nz, N, N)), torque=0.0, maxdiv=0.0, t=0.0, phi=0.0, spin=0.0, dt_prev=0.0, nstep=0)


# ----------------------------------------------------------------- ghost values
def pad_axis(a, axis, kind):
    """Add 2 ghost layers on both ends of one axis.  kind says what the end is:
    "face"      a wall ON the first/last node (no-slip, value 0 there):  a[-k] = -a[k]
    "cell"      a wall half a cell outside the first/last node:           a[-1-k] = -a[k]
    "sym"       zero-gradient wall half a cell outside:                   a[-1-k] = +a[k]
    "wrap"      periodic, nodes are the cells 0..n-1
    "wrapface"  periodic, but the last node is a copy of the first (w with w[Nz] = w[0])."""
    n = a.shape[axis]
    t = lambda idx: np.take(a, idx, axis=axis)
    if kind == "face":
        lo, hi = -t([2, 1]), -t([n - 2, n - 3])
    elif kind == "cell":
        lo, hi = -t([1, 0]), -t([n - 1, n - 2])
    elif kind == "sym":
        lo, hi = t([1, 0]), t([n - 1, n - 2])
    elif kind == "wrap":
        lo, hi = t([(-2) % n, (-1) % n]), t([0, 1 % n])
    elif kind == "wrapface":
        m = n - 1                                  # number of distinct nodes
        lo, hi = t([(-2) % m, (-1) % m]), t([1 % m, 2 % m])
    return np.concatenate([lo, a, hi], axis=axis)


def pad_u(u, span="periodic"):
    """u with 2 ghost layers on every side (no-slip walls).
    Across x-walls (where u = 0 sits on the wall): u[-k] = -u[k].
    Across y-walls (wall half a cell away):      u[-1-k] = -u[k].
    Across z-walls (wall half a cell away):      u[-1-k] = -u[k]   (periodic: wrap)."""
    zkind = "wrap" if span == "periodic" else "cell"
    return pad_axis(pad_axis(pad_axis(u, 2, "face"), 1, "cell"), 0, zkind)


def pad_v(v, span="periodic"):
    """The same rules for v with the roles of x and y swapped."""
    zkind = "wrap" if span == "periodic" else "cell"
    return pad_axis(pad_axis(pad_axis(v, 1, "face"), 2, "cell"), 0, zkind)


def pad_w(w, span="periodic"):
    """w sits ON the z-walls (w = 0 there, odd mirror about the face) and half a cell
    from the x and y walls.  Periodic: w[Nz] = w[0], ghosts wrap round."""
    zkind = "wrapface" if span == "periodic" else "face"
    return pad_axis(pad_axis(pad_axis(w, 2, "cell"), 1, "cell"), 0, zkind)


def pad_c(c, span="periodic"):
    """Cell-centred scalar, zero-gradient walls: c[-1-k] = c[k] (z: wrap if periodic)."""
    zkind = "wrap" if span == "periodic" else "sym"
    return pad_axis(pad_axis(pad_axis(c, 2, "sym"), 1, "sym"), 0, zkind)


# ----------------------------------------------------------------- advection
def minmod(a, b):
    return np.where(a * b <= 0, 0.0, np.sign(a) * np.minimum(np.abs(a), np.abs(b)))


def face_value(am, a, b, bp, vel):
    """MUSCL face value between nodes a (left/below) and b, with the next
    nodes am and bp; upwind side chosen by the sign of vel."""
    return np.where(vel >= 0, a + 0.5 * minmod(a - am, b - a),
                    b + 0.5 * minmod(b - bp, a - b))


def shift(A, rng, dk, dj, di):
    """The block rng = (k0,k1,j0,j1,i0,i1) of a padded array, moved by (dk,dj,di) nodes.
    A[k+2, j+2, i+2] is the node [k, j, i] because of the 2 ghost layers."""
    k0, k1, j0, j1, i0, i1 = rng
    return A[k0 + 2 + dk:k1 + 2 + dk, j0 + 2 + dj:j1 + 2 + dj, i0 + 2 + di:i1 + 2 + di]


def rhs_block(F, rng, ue, uw, vn, vs, wt, wb, h, nu):
    """-div(flux) + nu lap for the nodes of one velocity component.
    F is the padded component; ue..wb are the transporting velocities on the six
    faces of its control volume (east, west, north, south, top, bottom)."""
    S = lambda dk, dj, di: shift(F, rng, dk, dj, di)
    Fc = S(0, 0, 0)
    fe = ue * face_value(S(0, 0, -1), Fc, S(0, 0, 1), S(0, 0, 2), ue)
    fw = uw * face_value(S(0, 0, -2), S(0, 0, -1), Fc, S(0, 0, 1), uw)
    fn = vn * face_value(S(0, -1, 0), Fc, S(0, 1, 0), S(0, 2, 0), vn)
    fs = vs * face_value(S(0, -2, 0), S(0, -1, 0), Fc, S(0, 1, 0), vs)
    ft = wt * face_value(S(-1, 0, 0), Fc, S(1, 0, 0), S(2, 0, 0), wt)
    fb = wb * face_value(S(-2, 0, 0), S(-1, 0, 0), Fc, S(1, 0, 0), wb)
    # x,y part first, z part added after: the z part is exactly 0 when Nz = 1
    lap = (S(0, 0, 1) + S(0, 0, -1) + S(0, 1, 0) + S(0, -1, 0) - 4 * Fc) + (S(1, 0, 0) + S(-1, 0, 0) - 2 * Fc)
    return -((fe - fw + fn - fs) + (ft - fb)) / h + nu * lap / (h * h)


def momentum_rhs(u, v, w, p):
    """R = -div(flux) + nu lap for u, v, w (interior faces only; wall faces stay 0)."""
    N, Nz, h, nu, span = p["N"], p["Nz"], p["h"], p["nu"], p["span"]
    U, V, W = pad_u(u, span), pad_v(v, span), pad_w(w, span)
    avg = lambda a, b: 0.5 * (a + b)
    # ---- u at faces i = 1..N-1, all rows j and layers k
    r = (0, Nz, 0, N, 1, N)
    sh = lambda A, dk, dj, di: shift(A, r, dk, dj, di)
    Ru = np.zeros_like(u)
    Ru[:, :, 1:N] = rhs_block(
        U, r,
        ue=avg(sh(U, 0, 0, 0), sh(U, 0, 0, 1)), uw=avg(sh(U, 0, 0, -1), sh(U, 0, 0, 0)),
        vn=avg(sh(V, 0, 1, -1), sh(V, 0, 1, 0)), vs=avg(sh(V, 0, 0, -1), sh(V, 0, 0, 0)),
        wt=avg(sh(W, 1, 0, -1), sh(W, 1, 0, 0)), wb=avg(sh(W, 0, 0, -1), sh(W, 0, 0, 0)), h=h, nu=nu)
    # ---- v at faces j = 1..N-1
    r = (0, Nz, 1, N, 0, N)
    Rv = np.zeros_like(v)
    Rv[:, 1:N, :] = rhs_block(
        V, r,
        ue=avg(sh(U, 0, -1, 1), sh(U, 0, 0, 1)), uw=avg(sh(U, 0, -1, 0), sh(U, 0, 0, 0)),
        vn=avg(sh(V, 0, 0, 0), sh(V, 0, 1, 0)), vs=avg(sh(V, 0, -1, 0), sh(V, 0, 0, 0)),
        wt=avg(sh(W, 1, -1, 0), sh(W, 1, 0, 0)), wb=avg(sh(W, 0, -1, 0), sh(W, 0, 0, 0)), h=h, nu=nu)
    # ---- w at faces k = 1..Nz-1 (walls) or k = 0..Nz-1 (periodic; w[Nz] copies w[0])
    k0 = 1 if span == "walls" else 0
    r = (k0, Nz, 0, N, 0, N)
    Rw = np.zeros_like(w)
    Rw[k0:Nz] = rhs_block(
        W, r,
        ue=avg(sh(U, -1, 0, 1), sh(U, 0, 0, 1)), uw=avg(sh(U, -1, 0, 0), sh(U, 0, 0, 0)),
        vn=avg(sh(V, -1, 1, 0), sh(V, 0, 1, 0)), vs=avg(sh(V, -1, 0, 0), sh(V, 0, 0, 0)),
        wt=avg(sh(W, 0, 0, 0), sh(W, 1, 0, 0)), wb=avg(sh(W, -1, 0, 0), sh(W, 0, 0, 0)), h=h, nu=nu)
    if span == "periodic":
        Rw[Nz] = Rw[0]
    return Ru, Rv, Rw


# ----------------------------------------------------------------- the body
def body_centre(phi, p):
    return 0.5 + p["ro"] * np.cos(phi), 0.5 + p["ro"] * np.sin(phi)


def body_mask_velocity(x, y, phi, p):
    """Smoothed indicator chi (1 inside, 0 outside; default: linear ramp from r = R - eps
    to r = R, eps = width h) and the
    rigid-body velocity (orbit of the centre + spin about it) at points x, y.
    The body does not depend on z; its z-velocity is 0."""
    cx, cy = body_centre(phi, p)
    dx, dy = x - cx, y - cy
    r = np.hypot(dx, dy)
    if p.get("mask", "ramp") == "tanh":            # legacy (ns2d) mask: tails reach ~3 cells outside R
        chi = 0.5 * (1 - np.tanh((r - p["R"]) / p["eps"]))
    else:                                          # linear ramp lying INSIDE the circle:
        chi = np.clip((p["R"] - r) / p["eps"], 0.0, 1.0)     # 0 for r >= R, 1 for r <= R - eps
    w, W = p["omega_o"], p["Omega"]
    ub = -w * (cy - 0.5) - W * dy
    vb = w * (cx - 0.5) + W * dx
    return chi, ub, vb


def face_coords(p):
    """(x, y) of the u, v and w nodes in one z-layer (they do not depend on k)."""
    N, h = p["N"], p["h"]
    xu, yu = np.meshgrid(np.arange(N + 1) * h, (np.arange(N) + 0.5) * h)
    xv, yv = np.meshgrid((np.arange(N) + 0.5) * h, np.arange(N + 1) * h)
    xw, yw = np.meshgrid((np.arange(N) + 0.5) * h, (np.arange(N) + 0.5) * h)
    return xu, yu, xv, yv, xw, yw


def penalise(us, vs, ws, phi, p):
    """u = u* + chi (u_body - u*) on interior faces (penalisation, eta -> 0); w_body = 0."""
    xu, yu, xv, yv, xw, yw = face_coords(p)
    chi, ub, _ = body_mask_velocity(xu, yu, phi, p)
    u = us + chi * (ub - us)
    chi, _, vb = body_mask_velocity(xv, yv, phi, p)
    v = vs + chi * (vb - vs)
    chi, _, _ = body_mask_velocity(xw, yw, phi, p)
    w = ws + chi * (0.0 - ws)
    u[:, :, [0, -1]] = 0.0
    v[:, [0, -1], :] = 0.0
    if p["span"] == "walls":
        w[[0, -1]] = 0.0
    else:
        w[-1] = w[0]
    return u, v, w


# ----------------------------------------------------------------- projection
def divergence(u, v, w, h):
    return ((u[:, :, 1:] - u[:, :, :-1] + v[:, 1:, :] - v[:, :-1, :]) + (w[1:] - w[:-1])) / h


def project(u, v, w, q, h, span="periodic"):
    u, v, w = u.copy(), v.copy(), w.copy()
    u[:, :, 1:-1] -= (q[:, :, 1:] - q[:, :, :-1]) / h
    v[:, 1:-1, :] -= (q[:, 1:, :] - q[:, :-1, :]) / h
    w[1:-1] -= (q[1:] - q[:-1]) / h
    if span == "periodic":                         # the face z = 0 lies between cell Nz-1 and cell 0
        w[0] -= (q[0] - q[-1]) / h
        w[-1] = w[0]
    return u, v, w


def neighbour_sum(x, span="periodic"):
    """Sum of the existing neighbours (zero-flux walls: missing ones skipped;
    periodic z: the cell above the last one is the first)."""
    s = np.zeros_like(x)
    s[:, 1:, :] += x[:, :-1, :]
    s[:, :-1, :] += x[:, 1:, :]
    s[:, :, 1:] += x[:, :, :-1]
    s[:, :, :-1] += x[:, :, 1:]
    if x.shape[0] >= 2:                            # with one layer there is no z-coupling
        if span == "periodic":
            s += np.roll(x, 1, axis=0) + np.roll(x, -1, axis=0)
        else:
            s[1:] += x[:-1]
            s[:-1] += x[1:]
    return s


def neighbour_count(shape, span="periodic"):
    nz, n = shape[0], shape[1]
    c = np.full((nz, n, n), 4.0)
    c[:, 0, :] -= 1
    c[:, -1, :] -= 1
    c[:, :, 0] -= 1
    c[:, :, -1] -= 1
    if nz >= 2:
        c += 2.0
        if span == "walls":
            c[0] -= 1
            c[-1] -= 1
    return c


def laplacian(x, h, span="periodic"):
    """L x = div(grad x) with zero normal gradient at the walls."""
    return (neighbour_sum(x, span) - neighbour_count(x.shape, span) * x) / (h * h)


def smooth(x, b, h, sweeps, span="periodic"):
    """Red-black Gauss-Seidel: x_c = (sum of neighbours - h^2 b) / count.
    Colour = parity of i+j in EVERY layer (ns2d's colouring).  A colour that depends on k
    (i+j+k) would treat neighbouring layers differently, so even z-uniform data would come
    out of the solver with small z-differences and the solver itself would seed 3D motion.
    The price: the z-coupling is relaxed Jacobi-like (a cell and its z-neighbours share a colour)."""
    nz, n = x.shape[0], x.shape[1]
    cnt = neighbour_count(x.shape, span)
    kk, jj, ii = np.meshgrid(np.arange(nz), np.arange(n), np.arange(n), indexing="ij")
    red = (ii + jj) % 2 == 0
    for _ in range(sweeps):
        for colour in (red, ~red):
            x[colour] = ((neighbour_sum(x, span) - h * h * b) / cnt)[colour]
    return x


def restrict(r):
    """Fine residual -> coarse right-hand side (average of the 4 children in x,y,
    and of the 2 layers in z while there are 2 or more)."""
    rc = 0.25 * (r[:, 0::2, 0::2] + r[:, 1::2, 0::2] + r[:, 0::2, 1::2] + r[:, 1::2, 1::2])
    if r.shape[0] >= 2:
        rc = 0.5 * (rc[0::2] + rc[1::2])
    return rc


def prolong(xc, nz, span="periodic"):
    """Coarse correction -> fine grid (nz layers), trilinear (weights 3/4, 1/4 per
    direction), zero-gradient at walls, wrapping in periodic z."""
    n = xc.shape[1]
    I = np.arange(2 * n) // 2
    off = np.where(np.arange(2 * n) % 2 == 0, -1, 1)
    I2 = np.clip(I + off, 0, n - 1)
    rows = 0.75 * xc[:, I, :] + 0.25 * xc[:, I2, :]
    xf = 0.75 * rows[:, :, I] + 0.25 * rows[:, :, I2]
    nzc = xc.shape[0]
    if nz == nzc:                                  # z was not coarsened on this level
        return xf
    K = np.arange(2 * nzc) // 2
    offk = np.where(np.arange(2 * nzc) % 2 == 0, -1, 1)
    K2 = (K + offk) % nzc if span == "periodic" else np.clip(K + offk, 0, nzc - 1)
    return 0.75 * xf[K] + 0.25 * xf[K2]


def vcycle(x, b, h, p):
    nz, n, span = x.shape[0], x.shape[1], p["span"]
    if n <= 4:                                   # coarsest grid: many sweeps, fix the constant
        smooth(x, b, h, p["ncoarse"], span)
        x -= x.mean()
        return x
    smooth(x, b, h, p["nu1"], span)
    r = b - laplacian(x, h, span)
    nzc = nz // 2 if nz >= 2 else 1              # semi-coarsening: z only while it has >= 2 layers
    xc = vcycle(np.zeros((nzc, n // 2, n // 2)), restrict(r), 2 * h, p)
    x += prolong(xc, nz, span)
    smooth(x, b, h, p["nu2"], span)
    return x


def solve_pressure(q, rhs, p, cycles=None):
    for _ in range(p["vcycles"] if cycles is None else cycles):
        vcycle(q, rhs, p["h"], p)
    return q


# ----------------------------------------------------------------- one time step
def step(s, p):
    """Advance the state dict s by one time step dt (in place)."""
    dt = p["dt"]
    Ru, Rv, Rw = momentum_rhs(s["u"], s["v"], s["w"], p)
    if s["dt_prev"] == 0.0:                        # first step: forward Euler
        a, b = 1.0, 0.0
    else:                                          # variable-step Adams-Bashforth 2
        r = dt / s["dt_prev"]
        a, b = 1 + 0.5 * r, -0.5 * r
    s["us"] = s["u"] + dt * (a * Ru + b * s["ru"])
    s["vs"] = s["v"] + dt * (a * Rv + b * s["rv"])
    s["ws"] = s["w"] + dt * (a * Rw + b * s["rw"])
    s["ru"], s["rv"], s["rw"] = Ru, Rv, Rw
    phi = s["phi"] + p["omega_o"] * dt             # body position at the new time level
    u, v, w = penalise(s["us"], s["vs"], s["ws"], phi, p)
    rhs = divergence(u, v, w, p["h"])
    solve_pressure(s["q"], rhs, p)                 # warm start from the previous q
    s["u"], s["v"], s["w"] = project(u, v, w, s["q"], p["h"], p["span"])
    s["t"] += dt
    s["phi"] = phi
    s["spin"] += p["Omega"] * dt
    s["dt_prev"] = dt
    s["nstep"] += 1
    s["torque"] = torque(s, p)                     # last step, for diagnostics.summary
    s["maxdiv"] = np.abs(divergence(s["u"], s["v"], s["w"], p["h"])).max()
    return s


# ----------------------------------------------------------------- diagnostics
def cell_velocity(s, p=None):
    """Velocity at the cell centres, shape (3, Nz, N, N): average of the two faces."""
    u, v, w = s["u"], s["v"], s["w"]
    return np.stack([0.5 * (u[:, :, 1:] + u[:, :, :-1]),
                     0.5 * (v[:, 1:, :] + v[:, :-1, :]),
                     0.5 * (w[1:] + w[:-1])])


def torque(s, p):
    """z-torque of the fluid ON the body about its centre, per unit span.
    From the penalisation force (per volume) the body puts on the fluid,
    f = chi (u_body - u*) / dt, summed over interior faces; the body feels minus that.
    This is exactly the force of the penalisation step that used the same chi."""
    h, dt, Nz = p["h"], p["dt"], p["Nz"]
    xu, yu, xv, yv, xw, yw = face_coords(p)
    cx, cy = body_centre(s["phi"], p)
    chi, ub, _ = body_mask_velocity(xu, yu, s["phi"], p)
    fx = chi * (ub - s["us"]) / dt
    chi, _, vb = body_mask_velocity(xv, yv, s["phi"], p)
    fy = chi * (vb - s["vs"]) / dt
    # volume of a cell is h^3, the span is Lz = Nz h: torque per unit span = sum * h^2 / Nz
    tq = (np.sum((xv - cx)[1:-1, :] * fy[:, 1:-1, :]) - np.sum((yu - cy)[:, 1:-1] * fx[:, :, 1:-1])) * h * h / Nz
    return -tq


def stats(s, p):
    """Energy per unit span, spanwise energy, torque on the body, max |div u|, max speed."""
    h, Nz = p["h"], p["Nz"]
    U = cell_velocity(s)
    return dict(E=0.5 * np.sum(U ** 2) * h * h / Nz,
                Ew=0.5 * np.sum(U[2] ** 2) * h * h / Nz,
                torque=torque(s, p),
                maxdiv=np.abs(divergence(s["u"], s["v"], s["w"], h)).max(),
                maxspeed=np.sqrt((U ** 2).sum(axis=0)).max())


def run(p, nsteps, every=0, s=None, summary=None):
    """Run nsteps; if every > 0 also return the history (default: stats(s, p);
    pass summary(U, s, p) to use another diagnostics function)."""
    s = s or init_state(p)
    hist = []
    for n in range(nsteps):
        step(s, p)
        if every and (n + 1) % every == 0:
            d = stats(s, p) if summary is None else summary(cell_velocity(s, p), s, p)
            hist.append(dict(t=s["t"], **d))
    return s, hist
