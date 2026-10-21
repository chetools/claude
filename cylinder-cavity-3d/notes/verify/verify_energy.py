"""Check 4: kinetic-energy budget  dE/dt = P_in - D  for a 2D (Nz=1) run with each solver.
usage: verify_energy.py {fv|lbm} N tend case   with case in {spin, orbit}
E_tot = diagnostics.energy (whole box, includes the body interior, as the page does)
Several candidate dissipations are compared:
  D1 = 2 nu Z_tot            (page's formula: enstrophy of the whole box incl. body interior)
  D2 = 2 nu Z_fl             (enstrophy of cells with r > R only)
  D3 = 2 nu * int_fl 2 S:S/2 (= nu int 2S:S over cells r>R: the true viscous dissipation of the fluid)
P_in = -(T*Omega + F.Uc): F,T = force/torque of fluid on the body from each solver (FV force computed here
from the same penalisation sums as fv3d.torque, the sign convention of SPEC)."""
import sys
from vcommon import *

def fv_force(s, p):
    h, dt, Nz = p["h"], p["dt"], p["Nz"]
    xu, yu, xv, yv, xw, yw = fv3d.face_coords(p)
    chi, ub, _ = fv3d.body_mask_velocity(xu, yu, s["phi"], p)
    fx = chi * (ub - s["us"]) / dt
    chi, _, vb = fv3d.body_mask_velocity(xv, yv, s["phi"], p)
    fy = chi * (vb - s["vs"]) / dt
    return -np.array([fx[:, :, 1:-1].sum(), fy[:, 1:-1, :].sum()]) * h * h / Nz

def fluid_integrals(U, p, cx, cy):
    N, h = p["N"], p["h"]
    x = (np.arange(N) + 0.5) * h
    X, Y = np.meshgrid(x, x)
    fl = (np.hypot(X - cx, Y - cy) > p["R"])[None]
    G = dg.gradient(U, h, "periodic")
    om = G[1][0] - G[0][1]
    S2 = 0.5 * (G[0][0] ** 2 * 2 + G[1][1] ** 2 * 2) * 0 + (G[0][0] ** 2 + G[1][1] ** 2 + 0.5 * (G[0][1] + G[1][0]) ** 2 * 2) # S:S = sxx^2+syy^2+2 sxy^2
    dA = h * h / p["Nz"] * p["Nz"]
    return (0.5 * np.sum(U[:2] ** 2 * fl) * h * h / p["Nz"] * 1.0,        # E_fluid (cells r>R)
            0.5 * np.sum(om ** 2 * fl) * h * h / p["Nz"],                # Z_fluid
            np.sum(S2 * fl) * h * h / p["Nz"])                           # int S:S over fluid

if __name__ == "__main__":
    name, N, tend, case = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    kw = dict(Re=100.0, Us=1.0, seed=0.0)
    kw.update(dict(ro=0.0, Uo=0.0) if case == "spin" else dict(ro=0.2, Uo=1.0))
    m = mod(name); p = m.make_params(N=N, Nz=1, **kw); s = m.init_state(p)
    every = max(1, int(round(0.01 / p["dt"])))
    rows = []
    nst = int(tend / p["dt"])
    for n in range(nst):
        m.step(s, p)
        if (n + 1) % every == 0:
            U = m.cell_velocity(s, p)
            cx, cy = (0.5 + p["ro"] * np.cos(s["phi"]), 0.5 + p["ro"] * np.sin(s["phi"]))
            Ef, Zf, SS = fluid_integrals(U, p, cx, cy)
            T = m.torque(s, p)
            F = fv_force(s, p) if name == "fv" else m.force(s, p)
            Uc = np.array([-p["omega_o"] * p["ro"] * np.sin(s["phi"]), p["omega_o"] * p["ro"] * np.cos(s["phi"])])
            rows.append([s["t"], dg.energy(U, p["h"], p["Lz"]), dg.enstrophy(U, p["h"], p["Lz"], "periodic"), Ef, Zf, SS, T, -(T * p["Omega"] + F @ Uc), F[0], F[1]])
    R_ = np.array(rows)
    np.save(f"{OUT}/energy_{case}_{name}_N{N}.npy", R_)
    t, E, Z, Ef, Zf, SS, T, P = R_[:, 0], R_[:, 1], R_[:, 2], R_[:, 3], R_[:, 4], R_[:, 5], R_[:, 6], R_[:, 7]
    nu = p["nu"]
    k = 5   # window of 5 samples = 0.05 time units
    print(f"{name} N={N} case={case}  (windows of 0.05; mean values over the window)")
    print("   t     dE/dt      P_in     D1=2nuZtot  D2=2nuZfl   D3=2nu*SS   | resid1/P  resid2/P  resid3/P | dEf/dt-P+D3")
    for i in range(0, len(t) - k, k * 4 if tend > 1 else k):
        sl = slice(i, i + k + 1)
        dE = (E[i + k] - E[i]) / (t[i + k] - t[i]); dEf = (Ef[i + k] - Ef[i]) / (t[i + k] - t[i])
        Pm = np.trapz(P[sl], t[sl]) / (t[i + k] - t[i])
        d1, d2, d3 = [np.trapz(v[sl], t[sl]) / (t[i + k] - t[i]) for v in (2 * nu * Z, 2 * nu * Zf, 2 * nu * SS)]
        print(f" {t[i]+0.025:5.3f} {dE:10.5f} {Pm:10.5f} {d1:10.5f} {d2:10.5f} {d3:10.5f} | {(dE-Pm+d1)/Pm:8.3f} {(dE-Pm+d2)/Pm:8.3f} {(dE-Pm+d3)/Pm:8.3f} | {dEf-Pm+d3:10.5f}")
    # whole-interval integral balance
    Pint = np.trapz(P, t); 
    print(f" integral over [{t[0]:.2f},{t[-1]:.2f}]: E gain {E[-1]-E[0]:.5f};  int P {Pint:.5f};  int D1 {np.trapz(2*nu*Z,t):.5f}; int D2 {np.trapz(2*nu*Zf,t):.5f}; int D3 {np.trapz(2*nu*SS,t):.5f}")
    print(f"   residual (E gain - intP + intD1) = {E[-1]-E[0]-Pint+np.trapz(2*nu*Z,t):.5f}, with D2: {E[-1]-E[0]-Pint+np.trapz(2*nu*Zf,t):.5f}, with D3: {E[-1]-E[0]-Pint+np.trapz(2*nu*SS,t):.5f}")
    print(f"   Z_tot(t_end)={Z[-1]:.4f}  of which body interior 2*pi*Om^2*R^2 = {2*np.pi*p['Omega']**2*p['R']**2:.4f}; Z_fluid={Zf[-1]:.4f}")
    print(f"   E_tot(t_end)={E[-1]:.5f}; body rigid KE pi R^4 Om^2/4 = {np.pi*p['R']**4*p['Omega']**2/4:.5f} (spin only); E_fluid(r>R)={Ef[-1]:.5f}")
