"""Compressibility error of the LBM solver: max|rho - 1| and max|div u| (central differences, fluid cells away
from the body) for the spinning cylinder (Re = 100, spin only, Nz = 1, N = 64) at t = 5, for u_lb = 0.05 and
0.025.  A weakly compressible method should show the density variation scaling like Ma^2 (factor 4)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "python"))
import diagnostics as D  # noqa: E402
import lbm3d  # noqa: E402

for u_lb in (0.05, 0.025):
    p = lbm3d.make_params(N=64, Nz=1, Re=100.0, Us=1.0, Uo=0.0, ro=0.2, seed=0.0, u_lb=u_lb)
    s = lbm3d.init_state(p)
    while s["t"] < 5.0 - 1e-12:
        lbm3d.step(s, p)
    f = s["f"]
    rho = f.sum(axis=0)
    fl = D.fluid_mask(p, s["phi"])
    # cells at least 2h from the body and from the box walls
    N, h = p["N"], p["h"]
    xc = (np.arange(N) + 0.5) * h
    X, Y = np.meshgrid(xc, xc)
    cx, cy = 0.5 + p["ro"] * np.cos(s["phi"]), 0.5 + p["ro"] * np.sin(s["phi"])
    far = (np.hypot(X - cx, Y - cy) > p["R"] + 2 * h) & (X > 2 * h) & (X < 1 - 2 * h) & (Y > 2 * h) & (Y < 1 - 2 * h)
    U = lbm3d.cell_velocity(s, p)
    div = (np.gradient(U[0, 0], h, axis=1) + np.gradient(U[1, 0], h, axis=0))
    print(f"u_lb={u_lb:.3f} Ma={u_lb*np.sqrt(3):.4f} tau={p['tau']:.4f}  max|rho-1| fluid {np.abs(rho[fl]-1).max():.3e}"
          f"  far {np.abs(rho[0][far]-1).max():.3e}  max|div u| far {np.abs(div[far]).max():.3e}"
          f"  (max|u| {np.sqrt((U**2).sum(0)).max():.3f})", flush=True)
