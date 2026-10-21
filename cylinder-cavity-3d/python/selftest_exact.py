"""Exact-solution check for the page's Validation section.

An impulsively started cylinder spinning at the centre of the box (ro = 0, Us = 1, Re = 100, Nz = 1).  Until
the flow reaches the box walls it is the exact azimuthal solution of the full Navier-Stokes equations
u_theta(r, t), solved independently in notes/verify/annulus.py (outer radius 0.5; at t = 1 the diffusion
length sqrt(nu t) = 0.045 is far from it).  Compared quantities at t = 1:
  * torque per unit span on the cylinder;
  * kinetic energy per unit span of the cells whose centre is more than GAP*h from the cylinder surface
    (the cells next to the surface are excluded: there the two methods represent the body differently).
reference() returns the exact values and the numpy values of both solvers at the page's check grid, so the
page can show solver vs numpy (parity) and solver vs exact (accuracy) side by side.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "notes", "verify"))

import annulus  # noqa: E402
import diagnostics as D  # noqa: E402
import fv3d  # noqa: E402
import lbm3d  # noqa: E402

CASE = dict(N=64, Nz=1, Re=100.0, R=0.1, ro=0.0, Us=1.0, Uo=0.0, seed=0.0)
T_END = 1.0
GAP = 2.0


def far_mask(N, R, gap):
    h = 1.0 / N
    xc = (np.arange(N) + 0.5) * h
    X, Y = np.meshgrid(xc, xc)
    return np.hypot(X - 0.5, Y - 0.5) > R + gap * h


def exact_values(N=CASE["N"]):
    R, Us, Re = CASE["R"], CASE["Us"], CASE["Re"]
    nu = Us * 2 * R / Re
    sol = annulus.solve(R, Us / R, nu, 0.5, [T_END])
    r, ut, torque = sol[T_END]
    h = 1.0 / N
    xc = (np.arange(N) + 0.5) * h
    X, Y = np.meshgrid(xc, xc)
    rr = np.hypot(X - 0.5, Y - 0.5)
    m = far_mask(N, R, GAP)
    ue = np.interp(rr[m], r, ut)
    return dict(torque=float(torque), E_far=float(0.5 * np.sum(ue ** 2) * h * h))


def solver_values(M, N=CASE["N"]):
    p = M.make_params(**{**CASE, "N": N})
    s = M.init_state(p)
    while s["t"] < T_END - 1e-12:
        M.step(s, p)
    U = M.cell_velocity(s, p)
    m = far_mask(N, p["R"], GAP)[None]
    return dict(t=float(s["t"]), nstep=int(s["nstep"]), torque=float(M.torque(s, p)),
                E_far=float(D.energy(U, p["h"], p["Lz"], fluid=m)))


def reference():
    return dict(case=CASE, t_end=T_END, gap_cells=GAP, exact=exact_values(),
                lbm=solver_values(lbm3d), fv=solver_values(fv3d))


if __name__ == "__main__":
    import json
    print(json.dumps(reference(), indent=1))
