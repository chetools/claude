"""3D lattice Boltzmann (D3Q19) in a box with a moving cylinder.  Numpy reference.

The WebGPU solver and the CPU fallback implement the same steps with the same names.

Method, one time step (function `step`) = the functions below in this order
-----------------------------------------------------------------------------
 0. body       the cylinder moves to its new position; `refill` gives sensible
               populations to the nodes it just uncovered
 1. collide    relax every node towards equilibrium (BGK, regularised or MRT)
 2. stream     every population moves one node along its lattice velocity c_q
 3. bounce_back_walls   stationary walls half a cell away: the population that
               would leave the box is reflected (halfway bounce-back)
 4. bounce_back_body    the populations that would arrive from inside the
               cylinder are rebuilt from the exact cut position q of the circle
               (Bouzidi-Firdaouss-Lallemand) plus a moving-wall term; the same
               links give force and torque (momentum exchange)

Layout and units
----------------
f has shape (19, Nz, N, N), index order [q, k (z), j (y), i (x)].  Node (k, j, i) sits
at the cell centre ((i+1/2) h, (j+1/2) h, (k+1/2) h).  Inside the solver all lengths
are in lattice units (h = 1, dt = 1); only make_params, cell_velocity and torque
convert to the physical units of SPEC.md (box side 1, density 1).
"""
import numpy as np

# ------------------------------------------------------------------ the lattice D3Q19
C = np.array([(0, 0, 0), (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
              (1, 1, 0), (-1, -1, 0), (1, -1, 0), (-1, 1, 0),
              (1, 0, 1), (-1, 0, -1), (1, 0, -1), (-1, 0, 1),
              (0, 1, 1), (0, -1, -1), (0, 1, -1), (0, -1, 1)])        # (19, 3): (cx, cy, cz)
W = np.array([1 / 3] + [1 / 18] * 6 + [1 / 36] * 12)                    # weights, c_s^2 = 1/3
OPP = np.array([0] + [q + 1 if q % 2 == 1 else q - 1 for q in range(1, 19)])   # opposite direction
CS2 = 1.0 / 3.0

# second moments c_a c_b and Hermite polynomial Q_ab = c_a c_b - c_s^2 delta_ab, flattened to 9
CC9 = np.einsum("qa,qb->qab", C, C).reshape(19, 9).astype(float)
Q9 = (np.einsum("qa,qb->qab", C, C) - CS2 * np.eye(3)).reshape(19, 9).astype(float)


def _mrt_basis():
    """d'Humieres (2002) D3Q19 moment matrix M (rows = moments, columns = velocities).
    Rows: rho, e, eps, jx, qx, jy, qy, jz, qz, 3pxx, 3pixx, pww, piww, pxy, pyz, pxz, mx, my, mz."""
    x, y, z = C[:, 0].astype(float), C[:, 1].astype(float), C[:, 2].astype(float)
    c2 = x * x + y * y + z * z
    rows = [np.ones(19), 19 * c2 - 30, (21 * c2 * c2 - 53 * c2 + 24) / 2,
            x, (5 * c2 - 9) * x, y, (5 * c2 - 9) * y, z, (5 * c2 - 9) * z,
            3 * x * x - c2, (3 * c2 - 5) * (3 * x * x - c2),
            y * y - z * z, (3 * c2 - 5) * (y * y - z * z),
            x * y, y * z, x * z,
            (y * y - z * z) * x, (z * z - x * x) * y, (x * x - y * y) * z]
    return np.array(rows)


M_MRT = _mrt_basis()
# Relaxation rates of the moments that do NOT set the shear viscosity (d'Humieres 2002):
# energy e (bulk viscosity), eps, energy flux q, fourth-order stress pi, third-order m.
MRT_RATES = dict(e=1.19, eps=1.4, q=1.2, pi=1.4, m=1.98)


def mrt_matrix(omega):
    """Collision matrix A = M^-1 S M of the MRT model.  The five shear-stress moments
    (pxx, pww, pxy, pyz, pxz) relax at omega = 1/tau (this sets the viscosity), the
    conserved moments (rho, jx, jy, jz) at 0, all others at MRT_RATES."""
    r = MRT_RATES
    s = np.array([0, r["e"], r["eps"], 0, r["q"], 0, r["q"], 0, r["q"],
                  omega, r["pi"], omega, r["pi"], omega, omega, omega, r["m"], r["m"], r["m"]])
    return np.linalg.solve(M_MRT, s[:, None] * M_MRT)


# ------------------------------------------------------------------ parameters
DEFAULT_COLLISION = "reg"


def lattice_params(N, Nz, nu_lb, collision=DEFAULT_COLLISION, span="periodic",
                   wall_x=True, wall_y=True):
    """Everything that does not need physical units.  wall_x / wall_y = False makes that
    direction periodic; this exists only so that tests can use fully periodic boxes."""
    tau = 3.0 * nu_lb + 0.5
    assert collision in ("bgk", "reg", "mrt") and span in ("periodic", "walls")
    return dict(N=N, Nz=Nz, nu_lb=nu_lb, tau=tau, omega=1.0 / tau, collision=collision, span=span,
                wall_x=wall_x, wall_y=wall_y, mrt_A=mrt_matrix(1.0 / tau))


def make_params(N=64, Nz=1, Re=200.0, R=0.1, ro=0.2, Us=1.0, Uo=0.0, span="periodic",
                u_lb=None, collision=DEFAULT_COLLISION, seed=1e-3):
    """Inputs -> dict of everything a time step needs (see SPEC.md).

    u_lb is the lattice speed of the fastest body point; it fixes dt:
    dt = u_lb h / U_body_max, then nu_lb = nu dt / h^2 and tau = 3 nu_lb + 1/2.
    Default u_lb = min(0.05, U_body_max / (6 nu N)): Mach about 0.087 at most, and nu_lb <= 1/6
    (tau <= 1) because the halfway bounce-back wall position drifts at large tau.
    An explicit u_lb overrides the rule.
    """
    assert N >= 8 and N & (N - 1) == 0 and Nz >= 1 and Nz & (Nz - 1) == 0
    h = 1.0 / N
    if ro < 0.02:                                   # a centred cylinder cannot orbit
        ro, Uo = 0.0, 0.0
    Uref = max(abs(Us), abs(Uo)) or 1.0
    nu = Uref * 2 * R / Re
    Omega = Us / R
    omega_o = Uo / ro if ro > 0 else 0.0
    Umax = abs(Us) + abs(omega_o) * (ro + R)        # fastest point of the body
    Ub = Umax or Uref
    if u_lb is None:
        u_lb = min(0.05, Ub / (6.0 * nu * N))
    dt = u_lb * h / Ub
    p = lattice_params(N, Nz, nu * dt / (h * h), collision, span)
    p.update(h=h, Lz=Nz * h, Re=Re, R=R, ro=ro, Us=Us, Uo=Uo, nu=nu, Omega=Omega,
             omega_o=omega_o, dt=dt, u_lb=u_lb, seed=seed, Uref=Uref)
    return p


def seed_velocity(p):
    """Deliberate 3D seed (SPEC.md), divergence-free, physical units, shape (3, Nz, N, N) at the nodes.
    Stream function psi = seed Uref F(x,y) W(z) S(z) along y, velocity = curl(psi e_y):
      F = sin^2(pi x) sin(pi y),  S = sum_{m=1}^{M} sin(k_m z + m)/k_m,  k_m = 2 pi m/Lz,
      M = min(4, Nz//4),  W = 1 (periodic) or sin^2(pi z/Lz) (walls)
      u = -seed Uref F (W' S + W S'),   v = 0,   w = seed Uref (dF/dx) W S."""
    N, Nz = p["N"], p["Nz"]
    U = np.zeros((3, Nz, N, N))
    M = min(4, Nz // 4)
    if M == 0 or p["seed"] == 0:
        return U
    Lz = Nz / N
    x = (np.arange(N) + 0.5) / N
    z = ((np.arange(Nz) + 0.5) / N)[:, None, None]
    X, Y = x[None, None, :], x[None, :, None]
    F = np.sin(np.pi * X) ** 2 * np.sin(np.pi * Y)
    dFdx = np.pi * np.sin(2 * np.pi * X) * np.sin(np.pi * Y)
    ks = [2 * np.pi * m / Lz for m in range(1, M + 1)]
    S = sum(np.sin(k * z + m) / k for m, k in zip(range(1, M + 1), ks))
    Sp = sum(np.cos(k * z + m) for m, k in zip(range(1, M + 1), ks))
    if p["span"] == "walls":
        Wz = np.sin(np.pi * z / Lz) ** 2
        Wp = (np.pi / Lz) * np.sin(2 * np.pi * z / Lz)
    else:
        Wz, Wp = 1.0, 0.0
    a = p["seed"] * p["Uref"]
    U[0] = -a * F * (Wp * S + Wz * Sp)
    U[2] = a * dFdx * Wz * S
    return U


def init_state(p):
    """Fluid at rest (rho = 1) plus the deliberate 3D seed (seed_velocity; none for Nz < 4 or
    seed = 0) as the equilibrium at that velocity.  The cylinder starts at phi = 0."""
    N, Nz = p["N"], p["Nz"]
    u = seed_velocity(p) * (p["dt"] / p["h"]) if "seed" in p else np.zeros((3, Nz, N, N))
    f = equilibrium(np.ones((Nz, N, N)), u)
    s = dict(f=f, t=0.0, phi=0.0, nstep=0, solid=np.zeros((N, N), bool), exchange=np.zeros(3),
             torque=0.0, mass=float(f.sum()))
    if p.get("R", 0) > 0:
        body = make_body(0.0, p)
        s["solid"] = solid_mask(body, N)
        _reset_solid(s["f"], s["solid"], body)
        s["mass"] = mass(s)
    return s


# ------------------------------------------------------------------ equilibrium and moments
def equilibrium(rho, u):
    """f_q^eq = w_q rho (1 + 3 c.u + 9/2 (c.u)^2 - 3/2 u.u); rho (...), u (3, ...)."""
    cu = np.tensordot(C, u, axes=(1, 0))
    uu = np.sum(u * u, axis=0)
    w = W.reshape((19,) + (1,) * rho.ndim)
    return w * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu)


def macroscopic(f):
    """Density rho = sum f and velocity u = sum c f / rho (lattice units)."""
    rho = f.sum(axis=0)
    u = np.tensordot(C.T.astype(float), f, axes=(1, 0)) / rho
    return rho, u


# ------------------------------------------------------------------ step 1: collision
def collide(f, p):
    """Post-collision populations f*.
      bgk  f* = f - (f - feq)/tau
      reg  f* = feq + (1 - 1/tau) fneq_reg, where fneq_reg keeps only the part of f - feq
           that lies along the second-order Hermite polynomial (Latt & Chopard 2006):
           fneq_reg_q = w_q/(2 c_s^4) Q_q : Pi_neq,  Pi_neq = sum_q c c (f_q - feq_q)
      mrt  f* = f - M^-1 S M (f - feq): moments relaxed at their own rates"""
    rho, u = macroscopic(f)
    feq = equilibrium(rho, u)
    fneq = f - feq
    kind = p["collision"]
    if kind == "bgk":
        return f - p["omega"] * fneq
    if kind == "reg":
        Pi = np.tensordot(CC9.T, fneq, axes=(1, 0))                 # (9, Nz, N, N)
        fneq_reg = (0.5 / CS2 ** 2) * W.reshape(19, 1, 1, 1) * np.tensordot(Q9, Pi, axes=(1, 0))
        return feq + (1 - p["omega"]) * fneq_reg
    return f - np.tensordot(p["mrt_A"], fneq, axes=(1, 0))


# ------------------------------------------------------------------ step 2: streaming
def stream(f):
    """f_q(x + c_q) <- f*_q(x), periodic in all three directions (np.roll).  The
    populations that wrapped around a wall are replaced in the next step."""
    out = np.empty_like(f)
    for q in range(19):
        cx, cy, cz = C[q]
        out[q] = np.roll(f[q], (cz, cy, cx), axis=(0, 1, 2))
    return out


# ------------------------------------------------------------------ step 3: stationary walls
def bounce_back_walls(f, fpost, p):
    """Halfway bounce-back on the box walls x, y = 0, 1 (and z = 0, Lz for span="walls").
    The wall is half a cell outside the outermost nodes.  A population that points away
    from the wall at a boundary node came from outside, so it is replaced by the
    post-collision population of the opposite direction at the same node:
        f_q(x_b, t+1) = f*_qbar(x_b, t)."""
    # (direction component index in C, array axis in [k, j, i], is this wall on?)
    for comp, axis, on in ((0, 2, p["wall_x"]), (1, 1, p["wall_y"]), (2, 0, p["span"] == "walls")):
        if not on:
            continue
        for q in range(1, 19):
            c = C[q, comp]
            if c == 0:
                continue
            idx = [slice(None)] * 3
            idx[axis] = 0 if c > 0 else -1          # c > 0 arrives from the low wall
            idx = tuple(idx)
            f[q][idx] = fpost[OPP[q]][idx]


# ------------------------------------------------------------------ the body
def make_body(phi, p):
    """Cylinder at orbit angle phi, in lattice units.  `velocity(x, y)` is the rigid-body
    velocity (orbit of the centre + spin) in lattice units (SPEC.md formula times dt/h).
    `solid_inside=True` means the solid is the inside of the circle."""
    N = p["N"]
    cx = N * (0.5 + p["ro"] * np.cos(phi))
    cy = N * (0.5 + p["ro"] * np.sin(phi))
    wo, Om = p["omega_o"] * p["dt"], p["Omega"] * p["dt"]          # radians per step

    def velocity(x, y):
        return -wo * (cy - N / 2) - Om * (y - cy), wo * (cx - N / 2) + Om * (x - cx)

    return dict(cx=cx, cy=cy, R=p["R"] * N, solid_inside=True, velocity=velocity)


def solid_mask(body, N):
    """(N, N) boolean: node centres inside the body.  The body is the same in every z-plane."""
    j, i = np.mgrid[0:N, 0:N] + 0.5
    r = np.hypot(i - body["cx"], j - body["cy"])
    return r < body["R"] if body["solid_inside"] else r > body["R"]


def _reset_solid(f, solid, body):
    """Solid nodes carry the equilibrium of the body's velocity (never used by the fluid,
    but keeps them finite and gives a sensible velocity field inside the cylinder)."""
    j, i = np.nonzero(solid)
    ub, vb = body["velocity"](i + 0.5, j + 0.5)
    u = np.zeros((3, j.size))
    u[0], u[1] = ub, vb
    f[:, :, solid] = equilibrium(np.ones(j.size), u)[:, None, :]


def find_links(body, fluid, N):
    """Links that cross the body surface.  For each direction q a triple (j, i, s):
    fluid node (j, i) whose neighbour x + c_q is inside the body, and the fraction s in
    (0, 1] of the link at which the surface lies, from the exact circle:
        |d + s c_xy| = R,  d = x_fluid - centre  (smaller root; larger if the solid is outside).
    A link with c_z != 0 has the same s as its (c_x, c_y) projection: the surface does not
    depend on z, so the point x + s c is on the surface exactly when its (x, y) is."""
    j, i = np.mgrid[0:N, 0:N] + 0.5
    dx, dy = i - body["cx"], j - body["cy"]
    links = [None] * 19
    for q in range(1, 19):
        cx, cy, _ = C[q]
        a = cx * cx + cy * cy
        if a == 0:
            continue                                  # (0,0,+-1): never leaves the plane
        rn = np.hypot(dx + cx, dy + cy)
        inside = rn < body["R"] if body["solid_inside"] else rn > body["R"]
        link = fluid & inside
        b = dx * cx + dy * cy
        disc = np.maximum(b * b - a * (dx * dx + dy * dy - body["R"] ** 2), 0.0)
        root = np.sqrt(disc) if not body["solid_inside"] else -np.sqrt(disc)
        s = np.clip((-b + root) / a, 0.0, 1.0)
        jj, ii = np.nonzero(link)
        links[q] = (jj, ii, s[jj, ii])
    return links


# ------------------------------------------------------------------ nodes that change state
def node_exchange(f, mask, body, p, sign, mode):
    """Momentum that the body receives from nodes that switch between fluid and body.
    mask (N, N): the switching nodes.  sign = +1 for covered nodes (their fluid momentum
    sum_q c_q f_q goes to the body), -1 for uncovered nodes (the body supplies the momentum of the
    refilled populations).  This closes the momentum balance of the fluid: change of fluid momentum
    = links + switching nodes + walls.  mode "abs" uses sum_q c_q f_q, "rel" uses the momentum
    relative to the body, sum_q (c_q - u_b) f_q = rho (u - u_b); "none" switches it off.
    Returns (Fx, Fy, Tz) in lattice units, summed over the span; the torque arm is the node
    centre minus the body centre."""
    if mode == "none" or not mask.any():
        return np.zeros(3)
    jj, ii = np.nonzero(mask)
    fn = f[:, :, jj, ii]                                   # (19, Nz, n)
    px = np.tensordot(C[:, 0].astype(float), fn, axes=(0, 0))
    py = np.tensordot(C[:, 1].astype(float), fn, axes=(0, 0))
    x, y = ii + 0.5, jj + 0.5
    if mode == "rel":
        rho = fn.sum(0)
        ub, vb = body["velocity"](x, y)
        px, py = px - rho * ub, py - rho * vb
    rx, ry = x - body["cx"], y - body["cy"]
    return sign * np.array([px.sum(), py.sum(), (rx * py - ry * px).sum()])


# ------------------------------------------------------------------ step 4: moving body
def bounce_back_body(f, fpost, links, fluid, body, p):
    """Interpolated bounce-back (Bouzidi, Firdaouss & Lallemand 2001) with moving wall.

    For the link from fluid node x_f along c_q into the body, cut at fraction s, the
    unknown population f_qbar(x_f) arriving from the body is
      s < 1/2 : 2s f*_q(x_f) + (1-2s) f*_q(x_f - c_q)            + g
      s >= 1/2: f*_q(x_f)/(2s) + (2s-1)/(2s) f*_qbar(x_f)        + g/(2s)
    with the moving-wall term  g = -2 w_q rho (c_q . u_w)/c_s^2,  rho = 1, and u_w the body
    velocity at the cut point.  (Uniform flow u_w is reproduced exactly: see the tests.)
    If the second fluid node x_f - c_q does not exist (outside the box or inside a body)
    the first-order fallback f*_q(x_f) replaces it.

    Momentum exchange with the moving-boundary correction (Wen, Zhang, Li & Fang 2014,
    Galilean invariant):  every link gives the body the momentum
        dP = (c_q - u_w) f*_q(x_f) + (c_q + u_w) f_qbar(x_f, new),
    summed over links.  Returns (Fx, Fy, Tz) in lattice units, summed over the whole span:
    momentum per step given to the body, and the z-torque of it about the body centre
    taken at the cut points."""
    N, Nz = p["N"], p["Nz"]
    walls = p["span"] == "walls"
    F = np.zeros(3)
    for q in range(1, 19):
        if links[q] is None or links[q][0].size == 0:
            continue
        cx, cy, cz = C[q]
        qb = OPP[q]
        jj, ii, s = links[q]
        n = jj.size
        K = np.repeat(np.arange(Nz), n)
        J, I, S = np.tile(jj, Nz), np.tile(ii, Nz), np.tile(s, Nz)
        if walls:                                     # the node behind a z-wall link is the wall
            keep = (K + cz >= 0) & (K + cz < Nz)      # itself: bounce_back_walls has handled it
            K, J, I, S = K[keep], J[keep], I[keep], S[keep]
        xw, yw = I + 0.5 + S * cx, J + 0.5 + S * cy   # cut points on the surface
        ub, vb = body["velocity"](xw, yw)
        g = -6.0 * W[q] * (cx * ub + cy * vb)
        fq, fqb = fpost[q][K, J, I], fpost[qb][K, J, I]
        # second fluid node x_f - c_q
        I2, J2, K2 = I - cx, J - cy, K - cz
        ok = (I2 >= 0) & (I2 < N) & (J2 >= 0) & (J2 < N)
        I2c, J2c = np.clip(I2, 0, N - 1), np.clip(J2, 0, N - 1)
        ok &= fluid[J2c, I2c]
        if walls:
            ok &= (K2 >= 0) & (K2 < Nz)
        f2 = np.where(ok, fpost[q][K2 % Nz, J2c, I2c], fq)
        low = S < 0.5
        Sg = np.maximum(S, 0.5)                       # avoids dividing by tiny s in unused branch
        new = np.where(low, 2 * S * fq + (1 - 2 * S) * f2 + g,
                       (fq + (2 * Sg - 1) * fqb + g) / (2 * Sg))
        f[qb][K, J, I] = new
        # momentum exchange
        Px = (cx - ub) * fq + (cx + ub) * new
        Py = (cy - vb) * fq + (cy + vb) * new
        F[0] += Px.sum()
        F[1] += Py.sum()
        F[2] += ((xw - body["cx"]) * Py - (yw - body["cy"]) * Px).sum()
    return F


# ------------------------------------------------------------------ refill of uncovered nodes
def refill(f, solid_old, solid_new, body, p):
    """Give populations to the nodes the body has just left (solid before, fluid now).
    Scheme (after Caiazzo 2008): equilibrium at the body's velocity and the mean density of
    the neighbouring fluid nodes, plus the mean non-equilibrium part f - feq of those
    neighbours.  Neighbours are the (up to 8) in-plane nodes that were fluid before and
    after; the geometry is the same in every z-plane so the same stencil is used in all."""
    N = p["N"]
    jj, ii = np.nonzero(solid_old & ~solid_new)
    if jj.size == 0:
        return
    valid = ~solid_old & ~solid_new
    acc_neq, acc_rho, cnt = 0.0, 0.0, np.zeros(jj.size)
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            if dj == 0 and di == 0:
                continue
            jn, i_n = (jj + dj) % N, (ii + di) % N
            m = valid[jn, i_n].astype(float)
            fn = f[:, :, jn, i_n]                          # (19, Nz, n)
            rho, u = macroscopic(fn)
            acc_neq = acc_neq + m * (fn - equilibrium(rho, u))
            acc_rho = acc_rho + m * rho
            cnt += m
    c = np.maximum(cnt, 1.0)
    rho = np.where(cnt > 0, acc_rho / c, 1.0)              # no fluid neighbour: rho = 1, fneq = 0
    ub, vb = body["velocity"](ii + 0.5, jj + 0.5)
    u = np.zeros((3,) + rho.shape)
    u[0], u[1] = ub[None, :], vb[None, :]
    f[:, :, jj, ii] = equilibrium(rho, u) + acc_neq / c


# ------------------------------------------------------------------ one time step
def step(s, p):
    """Advance the state dict s by one time step dt (in place)."""
    N = p["N"]
    s["phi"] += p["omega_o"] * p["dt"]
    body = make_body(s["phi"], p)
    solid = solid_mask(body, N)
    mode = p.get("node_exchange", "none")
    F_nodes = node_exchange(s["f"], ~s["solid"] & solid, body, p, +1.0, mode)       # covered: fluid -> body
    refill(s["f"], s["solid"], solid, body, p)
    F_nodes += node_exchange(s["f"], s["solid"] & ~solid, body, p, -1.0, mode)      # uncovered: body -> fluid
    fpost = collide(s["f"], p)
    f = stream(fpost)
    bounce_back_walls(f, fpost, p)
    links = find_links(body, ~solid, N)
    s["exchange"] = bounce_back_body(f, fpost, links, ~solid, body, p) + F_nodes
    mass_correction(f, solid, p)
    _reset_solid(f, solid, body)
    s["f"], s["solid"] = f, solid
    s["t"] += p["dt"]
    s["nstep"] += 1
    s["torque"] = torque(s, p)                      # last step, so histories / diagnostics.summary carry it
    s["mass"] = mass(s)
    return s


# ------------------------------------------------------------------ global mass correction
def mass_correction(f, solid, p):
    """Keep the mean density of the fluid nodes at exactly 1.

    The interpolated bounce-back (and the nodes covered / uncovered by a moving body) do not
    conserve mass exactly.  After the body step the deficit is spread evenly over all fluid nodes
    through the rest population only, so momentum and all moments except rho are untouched:
        delta = (n_fluid - sum_fluid rho) / n_fluid,    f_0 += delta   on every fluid node.
    A uniform shift of rho is the usual 'fix the reference density' correction of weakly
    compressible schemes (no literature source verified by the author).  Every z-plane receives
    the same delta, so spanwise-uniform flow stays spanwise-uniform."""
    if not p.get("mass_fix", True):
        return
    fluid = ~solid
    n = fluid.sum() * p["Nz"]
    delta = (n - f[:, :, fluid].sum()) / n
    f[0][:, fluid] += delta


def mean_density(s, p):
    """Mean density over the fluid nodes (1 after every step when mass_fix is on)."""
    return s["f"][:, :, ~s["solid"]].sum() / ((~s["solid"]).sum() * p["Nz"])


# ------------------------------------------------------------------ outputs
def cell_velocity(s, p):
    """Physical velocity at the cell centres, shape (3, Nz, N, N)."""
    return macroscopic(s["f"])[1] * (p["h"] / p["dt"])


def force(s, p):
    """(Fx, Fy) of the fluid on the cylinder per unit span, physical units (rho = 1)
    from the momentum exchange of the last step."""
    return s["exchange"][:2] * (p["h"] ** 3 / p["dt"] ** 2) / p["Nz"]


def torque(s, p):
    """z-torque of the fluid ON the cylinder about its centre per unit span, physical
    units (rho = 1): lattice sum * h^4 / dt^2 / Nz (see bounce_back_body)."""
    return s["exchange"][2] * (p["h"] ** 4 / p["dt"] ** 2) / p["Nz"]


def mass(s):
    """Total mass on the fluid nodes (lattice units)."""
    return s["f"][:, :, ~s["solid"]].sum()


def run(p, nsteps, every=0, s=None):
    """Run nsteps; if every > 0 also return the history (diagnostics.summary rows)."""
    s = s or init_state(p)
    hist = []
    if every:
        try:
            import diagnostics
        except ImportError:
            diagnostics = None
    for n in range(nsteps):
        step(s, p)
        if every and (n + 1) % every == 0:
            U = cell_velocity(s, p)
            if diagnostics is not None:
                row = diagnostics.summary(U, s, p)
            else:
                row = dict(torque=torque(s, p), maxspeed=float(np.sqrt((U ** 2).sum(0)).max()))
            hist.append(dict(t=s["t"], **row))
    return s, hist
