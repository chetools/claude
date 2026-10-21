"""Independent exact/semi-exact reference: impulsively started rotating cylinder (radius R, surface
speed Us -> angular speed Om) in a fluid of kinematic viscosity nu, contained in a circle of radius R2
(R2 = None -> estimated by a very large R2).  The azimuthal flow u_theta(r,t) is an EXACT solution of
the full Navier-Stokes equations (advection and pressure only balance the centripetal term), so only
the linear equation  u_t = nu (u_rr + u_r/r - u/r^2)  has to be solved.  Solved with a method written
here from scratch: finite differences on a stretched radial grid (very fine at the cylinder) and
Crank-Nicolson/backward-Euler time stepping with a dense tri-diagonal solver (scipy.linalg.solve_banded)."""
import numpy as np
from scipy.linalg import solve_banded

def solve(R, Om, nu, R2, tgrid, n=4000, stretch=3.0, eps=0.004, extrap=True):
    if extrap:      # Richardson in the (first-order) time step: 2 T(eps/2) - T(eps)
        a = solve(R, Om, nu, R2, tgrid, n, stretch, eps, False); b = solve(R, Om, nu, R2, tgrid, n, stretch, eps / 2, False)
        return {k: (b[k][0], 2 * b[k][1] - a[k][1], 2 * b[k][2] - a[k][2]) for k in b}
    # radial grid: r = R + (R2-R) * (exp(a s)-1)/(exp(a)-1), s in [0,1]
    s = np.linspace(0, 1, n + 1)
    r = R + (R2 - R) * (np.exp(stretch * s) - 1) / (np.exp(stretch) - 1)
    rm = 0.5 * (r[1:] + r[:-1]); dr = np.diff(r)
    # conservative form for u_theta: (1/r^2) d/dr( r^3 d(u/r)/dr ) ; use angular velocity w=u/r:
    # r^3 w_t = nu d/dr(r^3 w_r)   (exact for the azimuthal equation)
    nodes = np.arange(1, n)
    a_lo = nu * rm[:-1] ** 3 / dr[:-1]          # coefficient to w[i-1]
    a_hi = nu * rm[1:] ** 3 / dr[1:]            # coefficient to w[i+1]
    vol = r[1:-1] ** 3 * 0.5 * (dr[:-1] + dr[1:])
    Lm = np.zeros((3, n - 1))
    Lm[0, 1:] = a_hi[:-1] / vol[:-1]            # superdiag (acts on w[i+1]) row i -> placed at col i+1
    Lm[1, :] = -(a_lo + a_hi) / vol
    Lm[2, :-1] = a_lo[1:] / vol[1:]             # subdiag
    w = np.zeros(n - 1)
    bc = np.zeros(n - 1); bc[0] = a_lo[0] / vol[0] * Om   # w(R) = Om, w(R2)=0
    def torque(w):
        # d w/dr at R via 2nd-order one-sided difference (nonuniform): use first 3 points
        wn = np.concatenate([[Om], w, [0.0]])
        h1, h2 = r[1] - r[0], r[2] - r[1]
        dw = (-(2 * h1 + h2) / (h1 * (h1 + h2)) * wn[0] + (h1 + h2) / (h1 * h2) * wn[1] - h1 / (h2 * (h1 + h2)) * wn[2])
        return 2 * np.pi * nu * R ** 3 * dw        # torque = 2 pi R^2 * mu * R dw/dr
    out_t = [0.0]; out_T = [np.nan]; t = 0.0
    sol = {}
    for tt in tgrid:
        # integrate from t to tt in nsub backward-Euler-then-CN steps (start with tiny BE steps: singular start)
        # backward Euler (L-stable), steps proportional to t (and clipped to hit the output times)
        while t < tt - 1e-14:
            dt = min(max(1e-10, eps * t), tt - t)
            Ab = -dt * Lm.copy(); Ab[1] += 1.0
            w = solve_banded((1, 1), Ab, w + dt * bc)
            t += dt
        sol[tt] = (r.copy(), np.concatenate([[Om], w, [0.0]]) * r, torque(w))
    return sol

def band_mul(Lm, w):
    y = Lm[1] * w
    y[:-1] += Lm[0, 1:] * w[1:]
    y[1:] += Lm[2, :-1] * w[:-1]
    return y

def steady_torque(R, Om, nu, R2):
    return -4 * np.pi * nu * Om * R ** 2 * R2 ** 2 / (R2 ** 2 - R ** 2)
