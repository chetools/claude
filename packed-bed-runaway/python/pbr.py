"""Packed-bed reactor hot spots and runaway -- Python reference implementation.

2D pseudo-homogeneous model (radial + axial), method of lines, adaptive
Rosenbrock 2(3) integration, parametric sensitivity by finite differences.
Every function has a twin of the same name in the Rust solver (solver/src/lib.rs);
this file is the readable reference that the fast Rust code is checked against.

Symbols (dimensional, SI unless noted)
---------------------------------------
    T_in    inlet temperature [K]  (also the reference temperature T0)
    T_c     coolant / wall temperature [K]
    p0      inlet partial pressure of the reactant (o-xylene) [atm]
    d_t, R  tube diameter and radius [m];  L  bed length [m]
    G       superficial mass flux [kg/m2/s]; u = G/rho_g superficial velocity [m/s]
    lam     effective radial thermal conductivity lambda_er [W/m/K]
    alpha_w wall heat-transfer coefficient [W/m2/K]
    D_er    effective radial mass dispersivity [m2/s]
    E_R     activation temperature E/R [K];  lnA  ln of the pre-exponential factor
    dH      heat of reaction, -dH > 0 for exothermic [J/kmol]
    rho_B   catalyst bulk density [kg/m3];  cp  gas heat capacity [J/kg/K]
    M_m     mean molar mass of the gas [kg/kmol];  p_O2  oxygen partial pressure [atm]

Dimensionless model (xi = z/L, rho = r/R, x = conversion, theta = gamma (T - T0)/T0)
----------------------------------------------------------------------------------
    dx/dxi     = a_m Lap(x)     + Da r(x, theta)
    dtheta/dxi = a_h Lap(theta) + S Da r(x, theta)
    r = (1 - x) exp(theta / (1 + theta/gamma)),   Lap(u) = (1/rho) d/drho (rho du/drho)
    rho = 0: symmetry;  rho = 1: dx/drho = 0, dtheta/drho = -Bi (theta - theta_w)
    1D model: one radial cell, wall flux replaced by  -St (theta - theta_w).

Array-shape convention: the state vector y has shape (2N,), interleaved as
[x_0, th_0, x_1, th_1, ...]; y[0::2] is conversion and y[1::2] is theta in
the N radial cells, ordered from the axis (cell 0) to the wall (cell N-1).
"""

import math

import numpy as np
from scipy.linalg import solve_banded
from scipy.integrate import solve_ivp
from scipy.sparse import diags

# --------------------------------------------------------------------------
# 1. Parameters
# --------------------------------------------------------------------------

# Order of the flat parameter array -- identical to the Rust `p` module.
PARAM_NAMES = ["T_in", "T_c", "p0", "d_t", "L", "G", "lam", "alpha_w", "D_er",
               "E_R", "lnA", "dH", "rho_B", "cp", "M_m", "p_O2", "rho_g"]
GROUP_NAMES = ["gamma", "S", "Da", "a_m", "a_h", "Bi", "St", "theta_w"]


def oxylene_preset():
    """Froment's o-xylene -> phthalic anhydride tube, converted to SI.

    The kinetic constants are Froment's: k = exp(19.837 - 13636/T) in
    kmol/(kg_cat h atm^2), rate = k p_xylene p_O2, -dH = 307 000 kcal/kmol.
    """
    kcal = 4184.0
    q = dict(T_in=625.0, T_c=625.0, p0=0.011, d_t=0.0254, L=3.0,
             G=4684.0 / 3600.0,                # 4684 kg/(m2 h)
             lam=0.67 * kcal / 3600.0,         # 0.67 kcal/(m h K)
             alpha_w=155.0 * kcal / 3600.0,    # 155 kcal/(m2 h K)
             D_er=0.0, E_R=13636.0, lnA=19.837,
             dH=307000.0 * kcal,               # J/kmol
             rho_B=1300.0, cp=0.237 * kcal, M_m=29.48, p_O2=0.208,
             rho_g=1.293 * 273.15 / 625.0 * 29.48 / 28.96)
    u = q["G"] / q["rho_g"]
    q["D_er"] = u * 0.003 / 10.0   # radial mass Peclet u d_p / D_er = 10, d_p = 3 mm
    return q


def groups_from_dimensional(q):
    """Dimensional inputs (dict) -> (dict of dimensionless groups, T0).

    Physical meaning of each group:
      gamma   = E/(R T0): how steeply the rate rises with temperature.
      S       = gamma dT_ad / T0: adiabatic temperature rise on the theta scale.
      Da      = reaction rate at the inlet / convective throughput.
      a_m,a_h = radial dispersion of mass / heat relative to axial convection,
                over the full bed length (L/R^2 scaling).
      Bi      = wall heat-transfer resistance vs radial conduction resistance.
      St      = heat removal of the 1D model, 2 U L / (R G cp), with the
                standard 1D overall coefficient 1/U = 1/alpha_w + R/(4 lambda_er).
      theta_w = coolant temperature on the theta scale (0 if T_c = T_in).
    """
    T0 = q["T_in"]
    R = q["d_t"] / 2.0
    gamma = q["E_R"] / T0
    k0 = math.exp(q["lnA"] - q["E_R"] / T0) / 3600.0       # kmol/(kg s atm^2)
    Da = q["L"] * q["M_m"] * q["rho_B"] * k0 * q["p_O2"] / q["G"]   # P = 1 atm
    dT_ad = q["dH"] * q["p0"] / (q["M_m"] * q["cp"])
    S = gamma * dT_ad / T0
    u = q["G"] / q["rho_g"]
    a_m = q["D_er"] * q["L"] / (u * R * R)
    a_h = q["lam"] * q["L"] / (q["G"] * q["cp"] * R * R)
    Bi = q["alpha_w"] * R / q["lam"]
    U = 1.0 / (1.0 / q["alpha_w"] + R / (4.0 * q["lam"]))
    St = 2.0 * U * q["L"] / (R * q["G"] * q["cp"])
    theta_w = gamma * (q["T_c"] - T0) / T0
    gr = dict(gamma=gamma, S=S, Da=Da, a_m=a_m, a_h=a_h, Bi=Bi, St=St, theta_w=theta_w)
    return gr, T0


# --------------------------------------------------------------------------
# 2. Radial finite-volume grid
# --------------------------------------------------------------------------

class Grid:
    """N annular cells of width d = 1/N between rho = 0 and rho = 1.

    Cell i spans the faces rho_w = i d and rho_e = (i+1) d and has
    (per radian) area V_i = (rho_e^2 - rho_w^2)/2.  Integrating
    Lap(u) = (1/rho) d(rho du/drho)/drho over the cell gives
        Lap(u)_i = [rho_e (u_{i+1}-u_i)/d - rho_w (u_i - u_{i-1})/d] / V_i
    so cw_i = rho_w/(d V_i) couples to the inner cell and ce_i = rho_e/(d V_i)
    to the outer cell.  At the axis rho_w = 0 (symmetry -> no flux); the wall
    face is handled separately with the Robin condition.  All arrays have
    shape (N,).
    """

    def __init__(self, n):
        self.n = n
        self.d = 1.0 / n
        i = np.arange(n)
        rw, re = i * self.d, (i + 1) * self.d
        self.rho = 0.5 * (rw + re)
        self.area = 0.5 * (re**2 - rw**2)
        self.cw = np.where(i == 0, 0.0, rw / (self.d * self.area))
        self.ce = np.where(i == n - 1, 0.0, re / (self.d * self.area))


def wall_coeff(Bi, grid):
    """Wall flux coefficient of the last cell.

    The wall temperature theta_wall is unknown; a half-cell difference
    dtheta/drho ~ (theta_wall - theta_N)/(d/2) combined with
    -dtheta/drho = Bi (theta_wall - theta_w) eliminates it and gives the
    flux  -Bi_eff (theta_N - theta_w)  with  Bi_eff = Bi / (1 + Bi d/2).
    """
    return Bi / (1.0 + Bi * 0.5 * grid.d) / grid.area[-1]


# --------------------------------------------------------------------------
# 3. Rate, right-hand side, Jacobian
# --------------------------------------------------------------------------

def rate(x, th, gamma):
    """Dimensionless first-order rate r = (1-x) exp(theta/(1+theta/gamma)).

    theta/(1+theta/gamma) is exactly gamma (1 - T0/T): the Arrhenius factor
    k(T)/k(T0) written in theta.  Works element-wise on arrays.
    """
    return (1.0 - x) * np.exp(th / (1.0 + th / gamma))


def rate_grad(x, th, gamma):
    """Partial derivatives (dr/dx, dr/dtheta), derived by hand.

    (The Rust code gets these by automatic differentiation instead.)
    d/dtheta [theta/(1+theta/gamma)] = 1/(1+theta/gamma)^2.
    """
    e = np.exp(th / (1.0 + th / gamma))
    return -e, (1.0 - x) * e / (1.0 + th / gamma) ** 2


def rhs(y, gr, grid, one_d=False):
    """dy/dxi for the interleaved state y, shape (2N,) -> (2N,)."""
    x, th = y[0::2], y[1::2]
    r = gr["Da"] * rate(x, th, gr["gamma"])
    # discrete Laplacian: inner and outer neighbour differences (vectorised;
    # the zero coefficients cw[0] and ce[-1] switch off the missing neighbour)
    lap_x = np.zeros_like(x)
    lap_t = np.zeros_like(th)
    lap_x[1:] += grid.cw[1:] * (x[:-1] - x[1:])
    lap_t[1:] += grid.cw[1:] * (th[:-1] - th[1:])
    lap_x[:-1] += grid.ce[:-1] * (x[1:] - x[:-1])
    lap_t[:-1] += grid.ce[:-1] * (th[1:] - th[:-1])
    cool = np.zeros_like(th)
    if one_d:
        cool[:] = gr["St"] * (th - gr["theta_w"])
    else:
        cool[-1] = gr["a_h"] * wall_coeff(gr["Bi"], grid) * (th[-1] - gr["theta_w"])
    f = np.empty_like(y)
    f[0::2] = gr["a_m"] * lap_x + r
    f[1::2] = gr["a_h"] * lap_t + gr["S"] * r - cool
    return f


def jacobian_parts(y, gr, grid, one_d=False):
    """The block-tridiagonal Jacobian as its pieces, each of shape (N,).

    Returns (jxx, jxt, jtx, jtt, lo_x, lo_t, up_x, up_t): the 2x2 diagonal
    block entries d f_x/d x etc. for each cell, and the couplings to the
    inner (lo) and outer (up) neighbour from dispersion.
    """
    x, th = y[0::2], y[1::2]
    rx, rt = rate_grad(x, th, gr["gamma"])
    rx, rt = gr["Da"] * rx, gr["Da"] * rt
    c = grid.cw + grid.ce
    cool = np.zeros_like(th)
    if one_d:
        cool[:] = gr["St"]
    else:
        cool[-1] = gr["a_h"] * wall_coeff(gr["Bi"], grid)
    jxx = rx - gr["a_m"] * c
    jxt = rt
    jtx = gr["S"] * rx
    jtt = gr["S"] * rt - gr["a_h"] * c - cool
    return (jxx, jxt, jtx, jtt,
            gr["a_m"] * grid.cw, gr["a_h"] * grid.cw,
            gr["a_m"] * grid.ce, gr["a_h"] * grid.ce)


def jacobian_sparse(y, gr, grid, one_d=False):
    """The same Jacobian as a scipy sparse matrix (used by scipy's BDF)."""
    jxx, jxt, jtx, jtt, lox, lot, upx, upt = jacobian_parts(y, gr, grid, one_d)
    n = grid.n
    main = np.empty(2 * n); main[0::2] = jxx; main[1::2] = jtt
    sup1 = np.zeros(2 * n - 1); sup1[0::2] = jxt          # d f_x,i / d th_i
    sub1 = np.zeros(2 * n - 1); sub1[0::2] = jtx          # d f_th,i / d x_i
    sup2 = np.empty(2 * n - 2); sup2[0::2] = upx[:-1]; sup2[1::2] = upt[:-1]
    sub2 = np.empty(2 * n - 2); sub2[0::2] = lox[1:]; sub2[1::2] = lot[1:]
    return diags([sub2, sub1, main, sup1, sup2], [-2, -1, 0, 1, 2], format="csc")


def w_banded(y, gr, grid, one_d, hd):
    """W = I - hd J in LAPACK banded storage for solve_banded((2, 2), ...).

    With interleaved unknowns the Jacobian has only 5 non-zero diagonals
    (offsets -2..2).  Banded storage keeps diagonal k in row 2 - k, so the
    solve costs O(N) instead of O(N^3).
    """
    jxx, jxt, jtx, jtt, lox, lot, upx, upt = jacobian_parts(y, gr, grid, one_d)
    m = 2 * grid.n
    ab = np.zeros((5, m))
    ab[2, 0::2] = 1.0 - hd * jxx            # main diagonal
    ab[2, 1::2] = 1.0 - hd * jtt
    ab[1, 1::2] = -hd * jxt                 # +1: column th_i, row x_i
    ab[3, 0::2] = -hd * jtx                 # -1: column x_i, row th_i
    ab[0, 2::2] = -hd * upx[:-1]            # +2: x_i <- x_{i+1}
    ab[0, 3::2] = -hd * upt[:-1]            #     th_i <- th_{i+1}
    ab[4, 0:m - 2:2] = -hd * lox[1:]        # -2: x_i <- x_{i-1}
    ab[4, 1:m - 2:2] = -hd * lot[1:]
    return ab


# --------------------------------------------------------------------------
# 4. Adaptive Rosenbrock 2(3) integration (ode23s)
# --------------------------------------------------------------------------

def hermite_peak(xs, ys, ms):
    """Hot-spot peak from the accepted steps.

    Between two accepted steps we know the values ys *and* the slopes
    ms = dtheta/dxi, so the solution there is a cubic Hermite polynomial.
    We maximise that cubic in the two brackets around the largest sample.
    (Taking the largest sample would be off by up to a step; a parabola
    through three samples fails at the sharp "corner" of a runaway hot spot.)
    xs, ys, ms have shape (K,).  Returns (peak value, peak location).
    """
    k = int(np.argmax(ys))
    best = (ys[k], xs[k])
    for j in (k - 1, k):
        if j < 0 or j + 1 >= len(ys):
            continue
        h = xs[j + 1] - xs[j]
        y0, y1, m0, m1 = ys[j], ys[j + 1], h * ms[j], h * ms[j + 1]
        # p(t) = h00 y0 + h10 m0 + h01 y1 + h11 m1, t in [0, 1]; dp/dt = A t^2 + B t + C
        A = 6 * y0 + 3 * m0 - 6 * y1 + 3 * m1
        B = -6 * y0 - 4 * m0 + 6 * y1 - 2 * m1
        C = m0
        if abs(A) < 1e-14 * (abs(B) + abs(C)):
            roots = [-C / B] if B != 0 else []
        else:
            disc = B * B - 4 * A * C
            if disc < 0:
                roots = []
            else:
                q = -0.5 * (B + math.copysign(math.sqrt(disc), B))
                roots = [q / A] + ([C / q] if q != 0 else [])
        for t in roots:
            if 0.0 < t < 1.0:
                p = (y0 * (2 * t**3 - 3 * t**2 + 1) + m0 * (t**3 - 2 * t**2 + t)
                     + y1 * (-2 * t**3 + 3 * t**2) + m1 * (t**3 - t**2))
                if p > best[0]:
                    best = (p, xs[j] + t * h)
    return best


def integrate(gr, n=30, rtol=1e-5, atol=1e-8, h0=1e-4, hmax=0.05, one_d=False,
              max_steps=200_000, record=True):
    """March the reactor from xi = 0 to 1 with the ode23s Rosenbrock scheme.

    Each step solves three linear systems with the same matrix
    W = I - h d J (d = 1/(2+sqrt 2)), so no Newton iteration is needed --
    that is what makes Rosenbrock methods cheap for stiff problems.
    Returns a dict with the hot spot (theta*, xi*), statistics and, if
    record=True, the arrays xi (shape (K,)) and Y (shape (K, 2N)).
    """
    grid = Grid(1 if one_d else n)
    m = 2 * grid.n
    d = 1.0 / (2.0 + math.sqrt(2.0))
    e32 = 6.0 + math.sqrt(2.0)
    y = np.zeros(m)                          # inlet: x = 0, theta = 0
    f0 = rhs(y, gr, grid, one_d)
    xi, h = 0.0, h0
    steps = rejected = 0
    n_rhs = 1
    xs, ys = [0.0], [y.copy()] if record else None
    peak_xi, peak_th, peak_m = [0.0], [0.0], [f0[1]]   # hottest cell: value, slope
    ok = True
    while xi < 1.0:
        if steps + rejected > max_steps:
            ok = False
            break
        h = min(h, hmax, 1.0 - xi)
        ab = w_banded(y, gr, grid, one_d, h * d)
        k1 = solve_banded((2, 2), ab, f0)
        f1 = rhs(y + 0.5 * h * k1, gr, grid, one_d)
        k2 = solve_banded((2, 2), ab, f1 - k1) + k1
        y_new = y + h * k2
        f2 = rhs(y_new, gr, grid, one_d)
        k3 = solve_banded((2, 2), ab, f2 - e32 * (k2 - f1) - 2.0 * (k1 - f0))
        n_rhs += 2
        e = (h / 6.0) * (k1 - 2.0 * k2 + k3)
        scale = atol + rtol * np.maximum(np.abs(y), np.abs(y_new))
        err = float(np.max(np.abs(e / scale)))
        if not math.isfinite(err):
            err = 1e10
        if err <= 1.0:
            xi += h
            y, f0 = y_new, f2
            steps += 1
            if record:
                xs.append(xi)
                ys.append(y.copy())
            ib = int(np.argmax(y[1::2]))
            peak_xi.append(xi)
            peak_th.append(y[2 * ib + 1])
            peak_m.append(f0[2 * ib + 1])
        else:
            rejected += 1
        h *= 5.0 if err == 0.0 else min(5.0, max(0.2, 0.8 * err ** (-1.0 / 3.0)))
        if h < 1e-15 * max(xi, 1e-3):
            ok = False
            break
    th_star, xi_star = hermite_peak(np.array(peak_xi), np.array(peak_th), np.array(peak_m))
    out = dict(theta_star=th_star, xi_star=xi_star, y_out=y, steps=steps,
               rejected=rejected, n_rhs=n_rhs, ok=ok, grid=grid)
    if record:
        out["xi"] = np.array(xs)
        out["Y"] = np.array(ys)
    return out


def integrate_bdf(gr, n=30, rtol=1e-8, atol=1e-10, one_d=False):
    """Independent check: scipy's variable-order BDF with the sparse Jacobian.

    A different method (multistep, not Rosenbrock) and different error
    control -- agreement with `integrate` checks the model and the
    discretisation, not just the code.
    """
    grid = Grid(1 if one_d else n)
    sol = solve_ivp(lambda t, y: rhs(y, gr, grid, one_d), (0.0, 1.0),
                    np.zeros(2 * grid.n), method="BDF", rtol=rtol, atol=atol,
                    jac=lambda t, y: jacobian_sparse(y, gr, grid, one_d))
    ib = sol.y[1::2].argmax(axis=0)                 # hottest cell at each step
    cols = np.arange(sol.t.size)
    peak = sol.y[2 * ib + 1, cols]
    slope = np.array([rhs(sol.y[:, j], gr, grid, one_d)[2 * ib[j] + 1] for j in cols])
    th_star, xi_star = hermite_peak(sol.t, peak, slope)
    return dict(theta_star=th_star, xi_star=xi_star, y_out=sol.y[:, -1],
                steps=sol.t.size - 1, n_rhs=sol.nfev, xi=sol.t, Y=sol.y.T,
                ok=sol.success, grid=grid)


# --------------------------------------------------------------------------
# 5. Results in physical units, and parametric sensitivity
# --------------------------------------------------------------------------

def to_kelvin(theta, gr, T0):
    """theta = gamma (T - T0)/T0  ->  T = T0 (1 + theta/gamma)."""
    return T0 * (1.0 + np.asarray(theta) / gr["gamma"])


def hot_spot(q, **kw):
    """Hot-spot temperature T* [K] for dimensional inputs q (dict)."""
    gr, T0 = groups_from_dimensional(q)
    run = integrate(gr, record=False, **kw)
    return float(to_kelvin(run["theta_star"], gr, T0)), run


def sensitivity_fd(q, name, rel_h=1e-3, **kw):
    """Normalised sensitivity s = (phi/T*) dT*/dphi by central differences.

    Needs two extra solves.  The step rel_h is a compromise: too large and
    the curvature of T*(phi) biases the slope, too small and the solver's
    own tolerance noise (relative size ~rtol/rel_h) swamps it.
    """
    phi = q[name]
    h = rel_h * abs(phi)
    qp, qm = dict(q), dict(q)
    qp[name] = phi + h
    qm[name] = phi - h
    Tp, _ = hot_spot(qp, **kw)
    Tm, _ = hot_spot(qm, **kw)
    T0s, _ = hot_spot(q, **kw)
    dT = (Tp - Tm) / (2.0 * h)
    return T0s, dT, phi / T0s * dT


def cup_mixing(y_out, grid):
    """Area-averaged outlet conversion (uniform velocity -> area weights)."""
    return float(np.sum(2.0 * grid.area * y_out[0::2]))
