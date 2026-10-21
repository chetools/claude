"""Fluid kinetic energy of the impulsively started spinning cylinder (centred, Nz=1, Re=100) at t=2:
LBM and FV against the exact azimuthal solution (annulus.py, outer radius 0.5; the flow has not reached
the outer boundary by t=2).  Energy per unit span over r > R (exact) vs over fluid cells (codes), and the
same exact energy restricted to the cells each code counts as fluid (cell centres with r > R)."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "python"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import annulus, diagnostics as D, fv3d, lbm3d

R, Us, Re, T = 0.1, 1.0, 100.0, 2.0
GAP = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0   # exclude cells within GAP*h of the surface
nu = Us * 2 * R / Re
sol = annulus.solve(R, Us / R, nu, 0.5, [T])
key = list(sol)[-1]
r_full, ut = sol[key][0], sol[key][1]          # (r, u_theta, torque)
E_exact = np.trapezoid(0.5 * ut ** 2 * 2 * np.pi * r_full, r_full)
print(f"GAP={GAP} h; exact fluid energy per unit span at t={T}: {E_exact:.6f}")
for N in (32, 64, 128):
    h = 1.0 / N
    xc = (np.arange(N) + 0.5) * h
    X, Y = np.meshgrid(xc, xc)
    rr = np.hypot(X - 0.5, Y - 0.5)
    ue = np.interp(rr, r_full, ut, left=np.nan, right=0.0)
    fl = rr > R + GAP * h
    E_ex_cells = np.nansum(0.5 * ue[fl] ** 2) * h * h
    out = [f"N={N:3d}  exact-on-fluid-cells {E_ex_cells:.6f}"]
    for name, M in (("FV", fv3d), ("LBM", lbm3d)):
        if name == "LBM" and N > 64:
            continue
        p = M.make_params(N=N, Nz=1, Re=Re, R=R, ro=0.0, Us=Us, Uo=0.0, seed=0.0)
        s = M.init_state(p)
        while s["t"] < T - 1e-12:
            M.step(s, p)
        U = M.cell_velocity(s, p)
        E = D.energy(U, h, p["Lz"], fluid=fl[None])
        out.append(f"{name} E={E:.6f} ({100*(E/E_ex_cells-1):+.1f}% vs exact on same cells, t={s['t']:.4f})")
    print("  ".join(out), flush=True)
