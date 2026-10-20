"""Lattice-Boltzmann flow and tracer dispersion in a 2D packed bed: readable numpy reference.

The WebGPU shaders (web/lbm.wgsl) and the plain-JavaScript fallback (web/cpu.js)
implement exactly the same algorithm, with the same function names where that
makes sense:

* make_bed       -- random (or ordered) bed of disks on the lattice, same PRNG as the page
* flow_step      -- one D2Q9 step: pull streaming with halfway bounce-back, moments,
                    two-relaxation-time (TRT) collision with Guo body forcing
* tracer_step    -- one D2Q5 TRT advection-diffusion step for a passive tracer,
                    inlet concentration at x = 0, zero-gradient outlet
* permeability, kozeny_carman, ergun_gradient, rtd_moments, fit_dispersion, ...

Arrays are indexed [direction, y, x].  Everything is in lattice units
(dx = dt = 1, reference density 1) unless a name says otherwise.
"""
import numpy as np

# ---------------------------------------------------------------- lattices
# D2Q9 for the flow: rest, 4 axis neighbours, 4 diagonals.
C = np.array([[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]])
W = np.array([4 / 9] + [1 / 9] * 4 + [1 / 36] * 4)
OPP = np.array([0, 3, 4, 1, 2, 7, 8, 5, 6])      # C[OPP[i]] == -C[i]
CS2 = 1.0 / 3.0                                  # lattice speed of sound squared

# D2Q5 for the tracer: the first five D2Q9 velocities.
C5 = C[:5]
W5 = np.array([1 / 3] + [1 / 6] * 4)
OPP5 = OPP[:5]


# ---------------------------------------------------------------- relaxation rates
def trt_rates(tau, magic=3 / 16):
    """TRT rates (omega_plus, omega_minus) for the flow.

    omega_plus = 1/tau sets the viscosity nu = cs2 (tau - 1/2).  omega_minus is
    chosen from the 'magic' parameter Lambda = (1/w+ - 1/2)(1/w- - 1/2).  For a
    fixed Lambda the steady solution does not depend on tau, so neither does the
    permeability; Lambda = 3/16 also puts the bounce-back wall exactly halfway
    between nodes (exact plane Poiseuille flow).
    magic=None gives BGK (omega_minus = omega_plus).
    """
    wp = 1.0 / tau
    if magic is None:
        return wp, wp
    return wp, 1.0 / (0.5 + magic / (tau - 0.5))


def tracer_rates(D, magic=0.25):
    """TRT rates for D2Q5 advection-diffusion: D = cs2 (1/omega_minus - 1/2)."""
    wm = 1.0 / (0.5 + D / CS2)
    return 1.0 / (0.5 + magic / (1.0 / wm - 0.5)), wm


def viscosity(tau):
    return CS2 * (tau - 0.5)


# ---------------------------------------------------------------- the bed
def mulberry32(seed):
    """Tiny 32-bit PRNG, bit-for-bit the same as the page's JavaScript, so a seed
    gives the same bed in the page, in this module and in the notebook."""
    a = seed & 0xFFFFFFFF
    M = 0xFFFFFFFF

    def imul(x, y):
        return (x * y) & M

    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & M
        t = imul(a ^ (a >> 15), a | 1)
        t = ((t + imul(t ^ (t >> 7), t | 61)) & M) ^ t
        return ((t ^ (t >> 14)) & M) / 4294967296.0

    return rnd


def place_disks(nx, ny, porosity, D, layout="random", spread=0.0, gap=2.0, seed=1, walls=False,
                max_fail=4000):
    """Disk centres and diameters [(x, y, d), ...] for the requested layout.

    random    -- random sequential addition: draw a disk, keep it if it is at least
                 `gap` cells clear of every other disk (and of the walls), until the
                 solid area reaches (1 - porosity) of the domain or `max_fail`
                 consecutive draws fail.  In 2D touching disks would seal the pores,
                 so the gap keeps the bed permeable.
    square    -- disks on a square lattice, diameter adjusted to hit the porosity.
    staggered -- every other row shifted by half a spacing.
    empty     -- no disks (plane channel if walls=True).
    """
    y0, y1 = (1.0, ny - 1.0) if walls else (0.0, float(ny))
    area = nx * (y1 - y0)
    if layout == "empty":
        return []
    if layout in ("square", "staggered"):
        a = D * np.sqrt(np.pi / (4.0 * (1.0 - porosity)))
        ncol = max(1, int(round(nx / a)))
        nrow = max(1, int(round((y1 - y0) / a)))
        if layout == "staggered" and nrow % 2:
            nrow += 1
        ax, ay = nx / ncol, (y1 - y0) / nrow
        d = np.sqrt(4.0 * (1.0 - porosity) * ax * ay / np.pi)
        out = []
        for j in range(nrow):
            shift = 0.5 * ax if (layout == "staggered" and j % 2) else 0.0
            for i in range(ncol):
                out.append(((i + 0.5) * ax + shift, y0 + (j + 0.5) * ay, d))
        return out
    rnd = mulberry32(seed)
    target = (1.0 - porosity) * area
    disks, solid, fails = [], 0.0, 0
    while solid < target and fails < max_fail:
        d = D * (1.0 + spread * (2.0 * rnd() - 1.0))
        r = 0.5 * d
        x = rnd() * nx
        if walls:
            lo, hi = y0 + r + gap, y1 - r - gap
            if hi <= lo:
                break
            y = lo + rnd() * (hi - lo)
        else:
            y = rnd() * ny
        ok = True
        for (xo, yo, do) in disks:
            dx = x - xo
            if dx > nx / 2:
                dx -= nx
            elif dx < -nx / 2:
                dx += nx
            dy = y - yo
            if not walls:
                if dy > ny / 2:
                    dy -= ny
                elif dy < -ny / 2:
                    dy += ny
            lim = r + 0.5 * do + gap
            if dx * dx + dy * dy < lim * lim:
                ok = False
                break
        if ok:
            disks.append((x, y, d))
            solid += np.pi * r * r
            fails = 0
        else:
            fails += 1
    return disks


def rasterize(nx, ny, disks, walls=False):
    """Boolean solid mask [ny, nx]: a cell is solid if its centre lies inside a disk
    (periodic in x, and in y without walls).  Rows 0 and ny-1 are walls if asked."""
    solid = np.zeros((ny, nx), dtype=bool)
    X = np.arange(nx) + 0.5
    Y = np.arange(ny) + 0.5
    for (cx, cy, d) in disks:
        dx = X - cx
        dx = np.where(dx > nx / 2, dx - nx, np.where(dx < -nx / 2, dx + nx, dx))
        dy = Y - cy
        dy = np.where(dy > ny / 2, dy - ny, np.where(dy < -ny / 2, dy + ny, dy))
        r = 0.5 * d
        solid |= (dy[:, None] * dy[:, None] + dx[None, :] * dx[None, :]) < r * r
    if walls:
        solid[0, :] = True
        solid[-1, :] = True
    return solid


def make_bed(nx, ny, porosity=0.6, D=16.0, layout="random", spread=0.0, gap=2.0, seed=1, walls=False):
    """Solid mask and disk list.  Returns (solid, disks)."""
    disks = place_disks(nx, ny, porosity, D, layout, spread, gap, seed, walls)
    return rasterize(nx, ny, disks, walls), disks


def porosity_of(solid, walls=False):
    """Fluid fraction, not counting the wall rows."""
    s = solid[1:-1] if walls else solid
    return 1.0 - s.mean()


def specific_surface(disks):
    """Mean solid perimeter per solid area, a_s = 4/d for equal disks (6/d for spheres in 3D)."""
    if not disks:
        return 0.0
    d = np.array([q[2] for q in disks])
    return float(np.sum(np.pi * d) / np.sum(np.pi * d * d / 4))


# ---------------------------------------------------------------- equilibrium
def equilibrium(rho, ux, uy):
    """D2Q9 equilibrium f_i = w_i rho (1 + 3 c.u + 9/2 (c.u)^2 - 3/2 u.u)."""
    usq = ux * ux + uy * uy
    feq = np.empty((9,) + np.shape(rho))
    for i in range(9):
        cu = C[i, 0] * ux + C[i, 1] * uy
        feq[i] = W[i] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * usq)
    return feq


def init_flow(solid, ux0=0.0, uy0=0.0):
    """Post-collision populations at rest (or uniform velocity) with unit density."""
    ny, nx = solid.shape
    f = equilibrium(np.ones((ny, nx)), np.full((ny, nx), ux0), np.full((ny, nx), uy0))
    f[:, solid] = W[:, None]
    return f


# ---------------------------------------------------------------- one flow step
def stream_pull(fpost, solid):
    """Pull streaming with halfway bounce-back.

    The population arriving at x along c_i left x - c_i one step ago.  If that
    neighbour is solid, the population that left x towards the wall (direction
    opp(i)) comes straight back instead: no-slip halfway between the nodes.
    Periodic in x and y (np.roll wraps)."""
    f = np.empty_like(fpost)
    for i in range(9):
        shift = (C[i, 1], C[i, 0])
        src = np.roll(fpost[i], shift, axis=(0, 1))
        from_solid = np.roll(solid, shift, axis=(0, 1))
        f[i] = np.where(from_solid, fpost[OPP[i]], src)
    return f


def moments(f, gx=0.0, gy=0.0):
    """Density and velocity.  With Guo forcing the velocity includes half the
    force: u = (sum_i f_i c_i + F/2) / rho."""
    rho = f.sum(axis=0)
    ux = (f[1] - f[3] + f[5] - f[6] - f[7] + f[8] + 0.5 * gx) / rho
    uy = (f[2] - f[4] + f[5] + f[6] - f[7] - f[8] + 0.5 * gy) / rho
    return rho, ux, uy


def collide_trt(f, rho, ux, uy, wp, wm, gx=0.0, gy=0.0):
    """Two-relaxation-time collision with Guo forcing.

    Split every population into its symmetric and antisymmetric parts,
    f+_i = (f_i + f_opp(i))/2 and f-_i = (f_i - f_opp(i))/2, and relax them at rates
    w+ and w-.  The Guo source S_i = w_i [3 (c_i - u) + 9 (c_i.u) c_i].F splits the
    same way, S+_i = w_i [9 (c_i.u)(c_i.F) - 3 u.F] and S-_i = 3 w_i c_i.F.
    BGK is the special case w- = w+."""
    feq = equilibrium(rho, ux, uy)
    uF = ux * gx + uy * gy
    out = np.empty_like(f)
    for i in range(9):
        o = OPP[i]
        cu = C[i, 0] * ux + C[i, 1] * uy
        cF = C[i, 0] * gx + C[i, 1] * gy
        fp, fm = 0.5 * (f[i] + f[o]), 0.5 * (f[i] - f[o])
        ep, em = 0.5 * (feq[i] + feq[o]), 0.5 * (feq[i] - feq[o])
        sp = W[i] * (9.0 * cu * cF - 3.0 * uF)
        sm = W[i] * 3.0 * cF
        out[i] = (f[i] - wp * (fp - ep) - wm * (fm - em)
                  + (1.0 - 0.5 * wp) * sp + (1.0 - 0.5 * wm) * sm)
    return out


def flow_step(fpost, solid, wp, wm, gx=0.0, gy=0.0):
    """One time step.  Returns (new post-collision populations, rho, ux, uy).

    The fields returned are those of the pre-collision state at this step; solid
    cells report rho = 1, u = 0 and are reset to rest populations, so a cell
    that is later turned into fluid starts from a sensible state."""
    f = stream_pull(fpost, solid)
    rho, ux, uy = moments(f, gx, gy)
    fnew = collide_trt(f, rho, ux, uy, wp, wm, gx, gy)
    fnew[:, solid] = W[:, None]
    rho = np.where(solid, 1.0, rho)
    ux = np.where(solid, 0.0, ux)
    uy = np.where(solid, 0.0, uy)
    return fnew, rho, ux, uy


# ---------------------------------------------------------------- permeability
def superficial_velocity(ux, walls=False):
    """Darcy (superficial) velocity: mean of u_x over the whole cross-section,
    solid included, wall rows excluded."""
    return float((ux[1:-1] if walls else ux).mean())


def permeability(ux, nu, g, walls=False):
    """Darcy's law with the body force g playing the role of -dp/dx:
    U_s = (k / mu) g  ->  k = nu U_s / g   (lattice units, rho0 = 1)."""
    return nu * superficial_velocity(ux, walls) / g


def run_flow(solid, tau=0.8, g=1e-6, steps=4000, magic=3 / 16, walls=False, record_every=100, f=None):
    """March to (near) steady state.  Returns dict with the final populations,
    fields, and the history of the permeability estimate."""
    wp, wm = trt_rates(tau, magic)
    nu = viscosity(tau)
    if f is None:
        f = init_flow(solid)
    hist_t, hist_k = [], []
    for n in range(1, steps + 1):
        f, rho, ux, uy = flow_step(f, solid, wp, wm, g)
        if n % record_every == 0 or n == steps:
            hist_t.append(n)
            hist_k.append(permeability(ux, nu, g, walls))
    return dict(f=f, rho=rho, ux=ux, uy=uy, t=np.array(hist_t), k=np.array(hist_k), nu=nu, g=g, tau=tau)


def poiseuille_profile(ny, nu, g):
    """Exact plane-Poiseuille velocity between halfway bounce-back walls.  The
    walls are rows 0 and ny-1, so the fluid occupies rows 1..ny-2 and the no-slip
    planes sit at y = 1 and y = ny - 1 (cell-edge coordinates)."""
    y = np.arange(ny) + 0.5
    h = ny - 2.0
    u = g / (2.0 * nu) * (y - 1.0) * (ny - 1.0 - y)
    u[0] = u[-1] = 0.0
    return u, h


# ---------------------------------------------------------------- correlations
def kozeny_carman(eps, d, a_s=None, K=5.0):
    """Kozeny-Carman permeability from the hydraulic-radius model:
    k = eps^3 / (K a_s^2 (1 - eps)^2), a_s = solid surface / solid volume.
    For spheres a_s = 6/d, giving the Blake-Kozeny form eps^3 d^2 / (36 K (1-eps)^2),
    with K = 150/36 = 4.17 recovering Ergun's viscous term.  For disks a_s = 4/d."""
    if a_s is None:
        a_s = 4.0 / d
    return eps ** 3 / (K * a_s * a_s * (1.0 - eps) ** 2)


def ergun_gradient(U, eps, d, mu, rho, A=150.0, B=1.75):
    """Ergun pressure gradient -dp/dx for superficial velocity U (spheres, 3D)."""
    return A * mu * U * (1 - eps) ** 2 / (eps ** 3 * d * d) + B * rho * U * U * (1 - eps) / (eps ** 3 * d)


def gebart_square(eps, d):
    """Gebart (1992): transverse permeability of a square array of cylinders,
    k = C (sqrt(phi_max/phi) - 1)^(5/2) R^2, phi = 1 - eps, phi_max = pi/4."""
    phi, R = 1.0 - eps, 0.5 * d
    return 16.0 / (9.0 * np.pi * np.sqrt(2.0)) * (np.sqrt(np.pi / 4 / phi) - 1.0) ** 2.5 * R * R


def sangani_acrivos_square(eps, d):
    """Sangani & Acrivos (1982) dilute expansion for transverse flow through a
    square array of cylinders (radius a): k = a^2/(8 phi) (-ln phi - 1.476 + 2 phi
    - 1.774 phi^2 + 4.076 phi^3)."""
    phi, a = 1.0 - eps, 0.5 * d
    return a * a / (8 * phi) * (-np.log(phi) - 1.476 + 2 * phi - 1.774 * phi ** 2 + 4.076 * phi ** 3)


def fit_kozeny_constant(k, eps, a_s):
    """Kozeny constant K that makes kozeny_carman match a measured k."""
    return eps ** 3 / (k * a_s * a_s * (1.0 - eps) ** 2)


# ---------------------------------------------------------------- tracer (D2Q5)
def init_tracer(solid):
    return np.zeros((5,) + solid.shape)


def tracer_step(gpost, solid, ux, uy, wp, wm, c_in):
    """One D2Q5 TRT step for dc/dt + u.grad c = D lap c.

    Equilibrium g_i = w_i c (1 + 3 c_i.u): its symmetric part w_i c carries the
    concentration, its antisymmetric part 3 w_i c c_i.u the advective flux.
    Streaming is periodic in y but not in x: a population that would come from
    beyond the outlet is taken from the outlet cell itself (zero gradient), and
    the inlet column x = 0 is held at equilibrium with concentration c_in.
    Solid neighbours bounce back (no flux into the particles).
    Returns (new post-collision populations, c)."""
    ny, nx = solid.shape
    xs = np.arange(nx)
    g = np.empty_like(gpost)
    for i in range(5):
        cx, cy = C5[i]
        sx = np.clip(xs - cx, 0, nx - 1)                       # source column (clamped)
        src = np.roll(gpost[i][:, sx], cy, axis=0)
        from_solid = np.roll(solid[:, sx], cy, axis=0)
        g[i] = np.where(from_solid, gpost[OPP5[i]], src)
    c = g.sum(axis=0)
    out = np.empty_like(g)
    for i in range(5):
        o = OPP5[i]
        cu = C5[i, 0] * ux + C5[i, 1] * uy
        gp, gm = 0.5 * (g[i] + g[o]), 0.5 * (g[i] - g[o])
        out[i] = g[i] - wp * (gp - W5[i] * c) - wm * (gm - 3.0 * W5[i] * c * cu)
    for i in range(5):                                         # inlet: equilibrium at c_in
        cu = C5[i, 0] * ux[:, 0] + C5[i, 1] * uy[:, 0]
        out[i][:, 0] = W5[i] * c_in * (1.0 + 3.0 * cu)
    c[:, 0] = c_in
    out[:, solid] = 0.0
    c = np.where(solid, 0.0, c)
    return out, c


def cup_mixing(c, ux, solid, x):
    """Flow-weighted (cup-mixing) concentration across column x."""
    u = np.where(solid[:, x], 0.0, ux[:, x])
    return float(np.sum(u * c[:, x]) / np.sum(u))


def run_tracer(solid, ux, uy, D, steps, pulse_steps, detectors, magic=0.25, record_every=1):
    """Square pulse of unit concentration at the inlet, frozen velocity field.
    Returns times and the cup-mixing concentration at each detector column."""
    wp, wm = tracer_rates(D, magic)
    g = init_tracer(solid)
    t, out = [], [[] for _ in detectors]
    for n in range(steps):
        c_in = 1.0 if n < pulse_steps else 0.0
        g, c = tracer_step(g, solid, ux, uy, wp, wm, c_in)
        if n % record_every == 0:
            t.append(n)
            for j, x in enumerate(detectors):
                out[j].append(cup_mixing(c, ux, solid, x))
    return np.array(t, dtype=float), [np.array(o) for o in out]


# ---------------------------------------------------------------- RTD analysis
def tail_fit(t, C, frac=0.25):
    """Decay time lam of an exponential C ~ exp(-t/lam) fitted to the last `frac`
    of a detector signal (None if the signal is not decaying there)."""
    n = max(5, int(frac * len(t)))
    tt, cc = np.asarray(t[-n:], dtype=float), np.asarray(C[-n:], dtype=float)
    if np.any(cc <= 0):
        return None
    slope = np.polyfit(tt, np.log(cc), 1)[0]
    return -1.0 / slope if slope < 0 else None


def rtd_moments(t, C, pulse=0.0, tail=True):
    """Normalised E(t), mean and variance of a detector signal.

    Stagnant pockets give long, roughly exponential tails, and the variance is
    very sensitive to them.  With tail=True the signal beyond the last sample is
    extended analytically as C_T exp(-(t - T)/lam), lam from tail_fit.
    A square input pulse of width `pulse` adds pulse/2 to the mean and
    pulse^2/12 to the variance; both are removed, giving the response to a
    delta input."""
    trap = np.trapezoid if hasattr(np, "trapezoid") else np.trapz
    t = np.asarray(t, dtype=float)
    C = np.clip(np.asarray(C, dtype=float), 0.0, None)
    m0, m1, m2 = trap(C, t), trap(t * C, t), trap(t * t * C, t)
    lam = tail_fit(t, C) if tail else None
    if lam is not None:
        T, CT = t[-1], C[-1]
        m0 += CT * lam
        m1 += CT * lam * (T + lam)
        m2 += CT * lam * (T * T + 2 * T * lam + 2 * lam * lam)
    mean = m1 / m0
    var = m2 / m0 - mean * mean
    return C / m0, mean - 0.5 * pulse, var - pulse * pulse / 12.0


def fit_dispersion(mean1, var1, mean2, var2, dx):
    """Two-detector (moment difference) analysis of the axial dispersion model.

    Between two planes inside the bed the dispersion model gives exactly
    d(var)/d(mean)^2 = 2/Pe with Pe = u L / D_L, independent of the boundary
    conditions at the ends.  Returns dict with the mean interstitial velocity,
    Peclet number, D_L and the equivalent number of tanks in series."""
    dt, dv = mean2 - mean1, var2 - var1
    u = dx / dt
    Pe = 2.0 * dt * dt / dv
    return dict(u=u, Pe=Pe, D_L=u * dx / Pe, N=dt * dt / dv, tau=dt, var=dv)


def E_dispersion(theta, Pe):
    """Open-open axial-dispersion response to a delta input (dimensionless time)."""
    th = np.maximum(np.asarray(theta, dtype=float), 1e-12)
    return np.sqrt(Pe / (4 * np.pi * th)) * np.exp(-Pe * (1 - th) ** 2 / (4 * th))


def E_tanks(theta, N):
    """Tanks-in-series response (gamma distribution), dimensionless time."""
    from math import lgamma
    th = np.maximum(np.asarray(theta, dtype=float), 1e-12)
    return np.exp(np.log(N) * N + (N - 1) * np.log(th) - N * th - lgamma(N))


def taylor_aris_plates(D, U, h):
    """Taylor-Aris effective dispersion for plane Poiseuille flow (gap h, mean
    velocity U): D_eff = D (1 + Pe_h^2 / 210), Pe_h = U h / D."""
    return D * (1.0 + (U * h / D) ** 2 / 210.0)
