"""2D incompressible Navier-Stokes in a closed unit square with a moving cylinder.

Reference implementation (numpy).  The WebGPU solver (web/shaders.wgsl) and the
CPU fallback (web/cpu.js) implement exactly the same algorithm with the same
names, so their results can be compared value by value.

Method
------
* Finite volumes on a staggered (MAC) grid of N x N square cells, h = 1/N:
    u  (N, N+1)   x-velocity on vertical faces    u[j, i] at x = i h,       y = (j+1/2) h
    v  (N+1, N)   y-velocity on horizontal faces  v[j, i] at x = (i+1/2) h, y = j h
    q  (N, N)     cell centres; q = dt * pressure
  Arrays are indexed [row j (y), column i (x)], the order of the flat GPU buffers.
* No-slip walls through ghost values: every wall is an odd mirror (pad_u, pad_v).
* Advection: conservative fluxes, face values from a MUSCL reconstruction with
  the minmod limiter (upwind biased, no new extrema).  Diffusion: 5-point.
* Time stepping: variable-step Adams-Bashforth 2 for advection + diffusion,
  then the body (Brinkman penalisation in the limit eta -> 0, smoothed mask),
  then projection: solve  L q = div u  by multigrid and set  u -= grad q.
* Body: cylinder of radius R whose centre orbits the box centre on a circle of
  radius ro (angle phi), while spinning about its own centre.
"""
import numpy as np

# ----------------------------------------------------------------- parameters
def make_params(N=64, Re=200.0, R=0.1, ro=0.2, Us=1.0, Uo=0.0, cfl=0.3, fdiff=0.05,
                width=1.0, vcycles=2, nu1=2, nu2=2, ncoarse=40):
    """Inputs -> dict of everything a time step needs.

    Us  spin surface speed  Omega R   (sign = direction, + is counter-clockwise)
    Uo  orbit speed of the centre  omega_o ro
    Re  = U_ref (2R) / nu  with  U_ref = max(|Us|, |Uo|)  (1 if both are zero)
    """
    assert N >= 8 and N & (N - 1) == 0, "N must be a power of two"
    h = 1.0 / N
    if ro < 0.02:                      # a centred cylinder cannot orbit
        ro, Uo = 0.0, 0.0
    Uref = max(abs(Us), abs(Uo)) or 1.0
    nu = Uref * 2 * R / Re
    Omega = Us / R
    omega_o = Uo / ro if ro > 0 else 0.0
    Umax = abs(Us) + abs(omega_o) * (ro + R)        # fastest point of the body
    dt = 1.0 / (Umax / (cfl * h) + nu / (fdiff * h * h))      # both limits, combined
    return dict(N=N, h=h, Re=Re, R=R, ro=ro, Us=Us, Uo=Uo, nu=nu, Omega=Omega,
                omega_o=omega_o, dt=dt, eps=width * h, vcycles=vcycles, nu1=nu1,
                nu2=nu2, ncoarse=ncoarse)


def init_state(p):
    N = p["N"]
    j = np.arange(N)[:, None] + 0 * np.arange(N)[None, :]
    return dict(u=np.zeros((N, N + 1)), v=np.zeros((N + 1, N)),
                ru=np.zeros((N, N + 1)), rv=np.zeros((N + 1, N)),
                us=np.zeros((N, N + 1)), vs=np.zeros((N + 1, N)),
                q=np.zeros((N, N)), dye=((j * 8) // N % 2).astype(float),
                t=0.0, phi=0.0, spin=0.0, dt_prev=0.0, nstep=0)


# ----------------------------------------------------------------- ghost values
def pad_u(u):
    """u with 2 ghost layers on every side (no-slip walls).
    Across x-walls (where u = 0 sits on the wall): u[-k] = -u[k].
    Across y-walls (wall half a cell away):      u[-1-k] = -u[k]."""
    N = u.shape[0]
    w = np.concatenate([-u[:, [2, 1]], u, -u[:, [N - 1, N - 2]]], axis=1)
    return np.concatenate([-w[[1, 0]], w, -w[[N - 1, N - 2]]], axis=0)


def pad_v(v):
    """The same rules for v with the roles of x and y swapped."""
    return pad_u(v.T).T


def pad_c(c):
    """Cell-centred scalar, zero-gradient walls: c[-1-k] = c[k]."""
    return np.pad(c, 2, mode="symmetric")


# ----------------------------------------------------------------- advection
def minmod(a, b):
    return np.where(a * b <= 0, 0.0, np.sign(a) * np.minimum(np.abs(a), np.abs(b)))


def face_value(am, a, b, bp, vel):
    """MUSCL face value between nodes a (left/below) and b, with the next
    nodes am and bp; upwind side chosen by the sign of vel."""
    return np.where(vel >= 0, a + 0.5 * minmod(a - am, b - a),
                    b + 0.5 * minmod(b - bp, a - b))


def momentum_rhs(u, v, p):
    """R = -div(flux) + nu lap  for u (interior faces only, walls stay 0)."""
    N, h, nu = p["N"], p["h"], p["nu"]
    U, V = pad_u(u), pad_v(v)            # U[j+2, i+2] = u[j, i]
    # ---- u at faces i = 1..N-1, all rows j
    i = np.arange(1, N)[None, :] + 2
    j = np.arange(N)[:, None] + 2
    Uc = U[j, i]
    ue = 0.5 * (Uc + U[j, i + 1])
    uw = 0.5 * (U[j, i - 1] + Uc)
    vn = 0.5 * (V[j + 1, i - 1] + V[j + 1, i])    # v at (i-1/2, j+1), (i+1/2, j+1)
    vs = 0.5 * (V[j, i - 1] + V[j, i])
    fe = ue * face_value(U[j, i - 1], Uc, U[j, i + 1], U[j, i + 2], ue)
    fw = uw * face_value(U[j, i - 2], U[j, i - 1], Uc, U[j, i + 1], uw)
    fn = vn * face_value(U[j - 1, i], Uc, U[j + 1, i], U[j + 2, i], vn)
    fs = vs * face_value(U[j - 2, i], U[j - 1, i], Uc, U[j + 1, i], vs)
    lap = U[j, i + 1] + U[j, i - 1] + U[j + 1, i] + U[j - 1, i] - 4 * Uc
    Ru = np.zeros_like(u)
    Ru[:, 1:N] = -(fe - fw + fn - fs) / h + nu * lap / (h * h)
    # ---- v at faces j = 1..N-1, all columns i
    i = np.arange(N)[None, :] + 2
    j = np.arange(1, N)[:, None] + 2
    Vc = V[j, i]
    ue = 0.5 * (U[j - 1, i + 1] + U[j, i + 1])
    uw = 0.5 * (U[j - 1, i] + U[j, i])
    vn = 0.5 * (Vc + V[j + 1, i])
    vs = 0.5 * (V[j - 1, i] + Vc)
    fe = ue * face_value(V[j, i - 1], Vc, V[j, i + 1], V[j, i + 2], ue)
    fw = uw * face_value(V[j, i - 2], V[j, i - 1], Vc, V[j, i + 1], uw)
    fn = vn * face_value(V[j - 1, i], Vc, V[j + 1, i], V[j + 2, i], vn)
    fs = vs * face_value(V[j - 2, i], V[j - 1, i], Vc, V[j + 1, i], vs)
    lap = V[j, i + 1] + V[j, i - 1] + V[j + 1, i] + V[j - 1, i] - 4 * Vc
    Rv = np.zeros_like(v)
    Rv[1:N, :] = -(fe - fw + fn - fs) / h + nu * lap / (h * h)
    return Ru, Rv


# ----------------------------------------------------------------- the body
def body_centre(phi, p):
    return 0.5 + p["ro"] * np.cos(phi), 0.5 + p["ro"] * np.sin(phi)


def body_mask_velocity(x, y, phi, p):
    """Smoothed indicator chi (1 inside, 0 outside, tanh over ~eps) and the
    rigid-body velocity (orbit of the centre + spin about it) at points x, y."""
    cx, cy = body_centre(phi, p)
    dx, dy = x - cx, y - cy
    chi = 0.5 * (1 - np.tanh((np.hypot(dx, dy) - p["R"]) / p["eps"]))
    w, W = p["omega_o"], p["Omega"]
    ub = -w * (cy - 0.5) - W * dy
    vb = w * (cx - 0.5) + W * dx
    return chi, ub, vb


def face_coords(p):
    N, h = p["N"], p["h"]
    xu, yu = np.meshgrid(np.arange(N + 1) * h, (np.arange(N) + 0.5) * h)
    xv, yv = np.meshgrid((np.arange(N) + 0.5) * h, np.arange(N + 1) * h)
    return xu, yu, xv, yv


def penalise(us, vs, phi, p):
    """u = u* + chi (u_body - u*) on interior faces (penalisation, eta -> 0)."""
    xu, yu, xv, yv = face_coords(p)
    chi, ub, _ = body_mask_velocity(xu, yu, phi, p)
    u = us + chi * (ub - us)
    chi, _, vb = body_mask_velocity(xv, yv, phi, p)
    v = vs + chi * (vb - vs)
    u[:, [0, -1]] = 0.0
    v[[0, -1], :] = 0.0
    return u, v


# ----------------------------------------------------------------- projection
def divergence(u, v, h):
    return (u[:, 1:] - u[:, :-1] + v[1:, :] - v[:-1, :]) / h


def project(u, v, q, h):
    u, v = u.copy(), v.copy()
    u[:, 1:-1] -= (q[:, 1:] - q[:, :-1]) / h
    v[1:-1, :] -= (q[1:, :] - q[:-1, :]) / h
    return u, v


def neighbour_sum(x):
    """Sum of the existing neighbours (zero-flux walls: missing ones skipped)."""
    s = np.zeros_like(x)
    s[1:, :] += x[:-1, :]
    s[:-1, :] += x[1:, :]
    s[:, 1:] += x[:, :-1]
    s[:, :-1] += x[:, 1:]
    return s


def neighbour_count(n):
    c = np.full((n, n), 4.0)
    c[0, :] -= 1
    c[-1, :] -= 1
    c[:, 0] -= 1
    c[:, -1] -= 1
    return c


def laplacian(x, h):
    """L x = div(grad x) with zero normal gradient at the walls."""
    return (neighbour_sum(x) - neighbour_count(x.shape[0]) * x) / (h * h)


def smooth(x, b, h, sweeps):
    """Red-black Gauss-Seidel: x_c = (sum of neighbours - h^2 b) / count."""
    n = x.shape[0]
    cnt = neighbour_count(n)
    ii, jj = np.meshgrid(np.arange(n), np.arange(n))
    red = (ii + jj) % 2 == 0
    for _ in range(sweeps):
        for colour in (red, ~red):
            x[colour] = ((neighbour_sum(x) - h * h * b) / cnt)[colour]
    return x


def restrict(r):
    """Fine residual -> coarse right-hand side (average of the 4 children)."""
    return 0.25 * (r[0::2, 0::2] + r[1::2, 0::2] + r[0::2, 1::2] + r[1::2, 1::2])


def prolong(xc):
    """Coarse correction -> fine grid, bilinear (weights 3/4, 1/4 per direction),
    zero-gradient at the walls."""
    n = xc.shape[0]
    I = np.arange(2 * n) // 2
    off = np.where(np.arange(2 * n) % 2 == 0, -1, 1)
    I2 = np.clip(I + off, 0, n - 1)
    rows = 0.75 * xc[I, :] + 0.25 * xc[I2, :]
    return 0.75 * rows[:, I] + 0.25 * rows[:, I2]


def vcycle(x, b, h, p):
    n = x.shape[0]
    if n <= 4:                                   # coarsest grid: many sweeps, fix the constant
        smooth(x, b, h, p["ncoarse"])
        x -= x.mean()
        return x
    smooth(x, b, h, p["nu1"])
    r = b - laplacian(x, h)
    xc = vcycle(np.zeros((n // 2, n // 2)), restrict(r), 2 * h, p)
    x += prolong(xc)
    smooth(x, b, h, p["nu2"])
    return x


def solve_pressure(q, rhs, p, cycles=None):
    for _ in range(p["vcycles"] if cycles is None else cycles):
        vcycle(q, rhs, p["h"], p)
    return q


# ----------------------------------------------------------------- passive dye
def advect_dye(c, u, v, p):
    """Explicit upwind-MUSCL transport of a cell-centred dye by the face velocities."""
    N, h, dt = p["N"], p["h"], p["dt"]
    C = pad_c(c)                                   # C[j+2, i+2] = c[j, i]
    Cx = lambda k: C[2:N + 2, k + 2]               # columns k = -2 .. N+1
    Cy = lambda k: C[k + 2, 2:N + 2]
    K = np.arange(N + 1)                           # face k lies between cells k-1 and k
    fx = u * face_value(Cx(K - 2), Cx(K - 1), Cx(K), Cx(K + 1), u)
    fy = v * face_value(Cy(K - 2), Cy(K - 1), Cy(K), Cy(K + 1), v)
    return c - dt / h * (fx[:, 1:] - fx[:, :-1] + fy[1:, :] - fy[:-1, :])


# ----------------------------------------------------------------- one time step
def step(s, p):
    """Advance the state dict s by one time step dt (in place)."""
    dt = p["dt"]
    Ru, Rv = momentum_rhs(s["u"], s["v"], p)
    if s["dt_prev"] == 0.0:                        # first step: forward Euler
        a, b = 1.0, 0.0
    else:                                          # variable-step Adams-Bashforth 2
        r = dt / s["dt_prev"]
        a, b = 1 + 0.5 * r, -0.5 * r
    s["us"] = s["u"] + dt * (a * Ru + b * s["ru"])
    s["vs"] = s["v"] + dt * (a * Rv + b * s["rv"])
    s["ru"], s["rv"] = Ru, Rv
    phi = s["phi"] + p["omega_o"] * dt             # body position at the new time level
    u, v = penalise(s["us"], s["vs"], phi, p)
    rhs = divergence(u, v, p["h"])
    solve_pressure(s["q"], rhs, p)                 # warm start from the previous q
    s["u"], s["v"] = project(u, v, s["q"], p["h"])
    s["dye"] = advect_dye(s["dye"], s["u"], s["v"], p)
    s["t"] += dt
    s["phi"] = phi
    s["spin"] += p["Omega"] * dt
    s["dt_prev"] = dt
    s["nstep"] += 1
    return s


# ----------------------------------------------------------------- diagnostics
def corner_vorticity(u, v, h):
    """omega = dv/dx - du/dy at all (N+1)^2 cell corners (walls via ghosts)."""
    U, V = pad_u(u), pad_v(v)
    N = u.shape[0]
    k = np.arange(N + 1)
    j, i = k[:, None] + 2, k[None, :] + 2
    return (V[j, i] - V[j, i - 1] - U[j, i] + U[j - 1, i]) / h


def cell_vorticity(u, v, h):
    w = corner_vorticity(u, v, h)
    return 0.25 * (w[:-1, :-1] + w[1:, :-1] + w[:-1, 1:] + w[1:, 1:])


def cell_velocity(u, v):
    return 0.5 * (u[:, 1:] + u[:, :-1]), 0.5 * (v[1:, :] + v[:-1, :])


def stats(s, p):
    """Kinetic energy, enstrophy, torque of the fluid on the body, max |div u|."""
    h, dt = p["h"], p["dt"]
    uc, vc = cell_velocity(s["u"], s["v"])
    w = cell_vorticity(s["u"], s["v"], h)
    xu, yu, xv, yv = face_coords(p)
    cx, cy = body_centre(s["phi"], p)
    chi, ub, _ = body_mask_velocity(xu, yu, s["phi"], p)
    fx = chi * (ub - s["us"]) / dt                 # force per volume the body puts on the fluid
    chi, _, vb = body_mask_velocity(xv, yv, s["phi"], p)
    fy = chi * (vb - s["vs"]) / dt
    # torque on the fluid about the body centre, interior faces only; the body feels minus that
    tq = (np.sum((xv - cx)[1:-1, :] * fy[1:-1, :]) - np.sum((yu - cy)[:, 1:-1] * fx[:, 1:-1])) * h * h
    torque = -tq
    return dict(E=0.5 * np.sum(uc ** 2 + vc ** 2) * h * h,
                Z=0.5 * np.sum(w ** 2) * h * h,
                torque=torque,
                maxdiv=np.abs(divergence(s["u"], s["v"], h)).max(),
                maxspeed=np.sqrt(uc ** 2 + vc ** 2).max(),
                maxvort=np.abs(w).max())


def run(p, nsteps, every=0, s=None):
    """Run nsteps; if every > 0 also return the stats history."""
    s = s or init_state(p)
    hist = []
    for n in range(nsteps):
        step(s, p)
        if every and (n + 1) % every == 0:
            hist.append(dict(t=s["t"], **stats(s, p)))
    return s, hist
