"""Check 2/3: spin-only centred cylinder, Re=100, 2D: FV vs LBM vs independent azimuthal solution
(annulus.py, exact NS solution of the impulsively started rotating cylinder), plus spin+orbit comparison.
Reads out/spin_*.npz and out/orbit_*.npz written by verify_runcase.py."""
import sys, glob, os
import numpy as np
from scipy.optimize import brentq, minimize_scalar
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import annulus as A
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
R, Om, nu = 0.1, 10.0, 0.002
Ns = [N for N in (32, 64, 128) if all(os.path.exists(f"{OUT}/spin_{m}_N{N}.npz") for m in ("fv", "lbm"))]
print("N available (spin):", Ns)
tg = [0.1, 0.25, 0.5, 1, 2, 3, 4, 5]
ex = {R2: A.solve(R, Om, nu, R2, tg, n=2000) for R2 in (0.5, 0.7071)}
print("\nexact torque, R2 = 0.5 (inscribed circle) / 0.7071 (circumscribed) -- box-size bracket:")
for t in tg:
    print(f"  t={t:5.2f}  {ex[0.5][t][2]:.6f}  {ex[0.7071][t][2]:.6f}")
D = {(m, N): np.load(f"{OUT}/spin_{m}_N{N}.npz") for m in ("fv", "lbm") for N in Ns}

def at(d, t, key="T", w=5):
    i = np.argmin(abs(d["t"] - t)); sl = slice(max(0, i - w), i + w + 1)
    return d["t"][i], d[key][sl].mean()

print("\nTORQUE (window-averaged +-5 samples = +-0.25 time units/20) vs exact (R2=0.5); relative error in %")
print("   t   exact       " + "   ".join(f"{m}{N:4d}" for m in ("FV", "LBM") for N in Ns))
for t in tg:
    row = []
    for m in ("fv", "lbm"):
        for N in Ns:
            ts, T = at(D[(m, N)], t)
            row.append(100 * (T / ex[0.5][t][2] - 1))
    print(f" {t:5.2f} {ex[0.5][t][2]:.6f}  " + "  ".join(f"{r:+8.1f}" for r in row))
print("\nT(t=5): ")
T5 = {}
for m in ("fv", "lbm"):
    for N in Ns:
        T5[(m, N)] = D[(m, N)]["T"][-1]
        print(f"  {m:4s} N={N:4d}  T={T5[(m,N)]:.6f}  err vs exact(R2=.5)={100*(T5[(m,N)]/ex[.5][5][2]-1):+.2f}%  vs exact(R2=.707)={100*(T5[(m,N)]/ex[.7071][5][2]-1):+.2f}%")
for m in ("fv", "lbm"):
    if len(Ns) >= 3:
        a, b, c = [T5[(m, N)] for N in Ns[-3:]]
        order = np.log2((a - b) / (b - c))
        print(f"  Richardson {m}: observed order p={order:.2f}; extrapolated T(t=5) = {c-(b-c)/(2**order-1):.6f}")
        print(f"      two-point first order  {2*c-b:.6f},  second order {c-(b-c)/3:.6f}")
print("  reference: exact azimuthal solution, box radius 0.5 -> %.6f, 0.7071 -> %.6f" % (ex[.5][5][2], ex[.7071][5][2]))
print("  NOTE the square box lies between the inscribed (0.5) and circumscribed (0.707) circle.")

print("\nCENTRE-LINE PROFILE v(x) at y=1/2, t=5 (cell values at x>0.5, compared with exact at the same radius)")
for m in ("fv", "lbm"):
    for N in Ns:
        d = D[(m, N)]; x = d["x"]; v = d["v"]; msk = x > 0.5
        rr = x[msk] - 0.5
        r, u, T = ex[0.5][5]
        ue = np.interp(rr, r, u)
        sel = rr > R + 1.5 / N      # outside the body incl. cut cells
        e = v[msk][sel] - ue[sel]
        print(f"  {m:4s} N={N:4d}: max|v-exact|={np.abs(e).max():.4f}  rms={np.sqrt((e**2).mean()):.4f}  (u_exact max in region {ue[sel].max():.3f})  max v overall={v.max():.3f}")

print("\nEffective radius of the FV body (hydrodynamic), two estimates:")
def torque_at5(Reff):
    return A.solve(Reff, Om, nu, 0.5, [5.0], n=1500)[5.0][2]
for N in Ns:
    d = D[("fv", N)]
    Tfv = d["T"][-1]
    # (a) torque match: Om fixed, so surface speed = Om*Reff
    f = lambda Re_: torque_at5(Re_) - Tfv
    try:
        Ra = brentq(f, R, 0.25, xtol=1e-5)
    except ValueError:
        Ra = np.nan
    # (b) profile fit for r in [0.2, 0.35]
    x = d["x"]; v = d["v"]; msk = x > 0.5; rr = x[msk] - 0.5; sel = (rr > 0.2) & (rr < 0.35)
    def cost(Re_):
        r, u, T = A.solve(Re_, Om, nu, 0.5, [5.0], n=1500)[5.0]
        return np.sum((v[msk][sel] - np.interp(rr[sel], r, u)) ** 2)
    Rb = minimize_scalar(cost, bounds=(R, 0.25), method="bounded", options=dict(xatol=1e-5)).x
    print(f"  N={N:4d} h={1/N:.4f}: R_eff(torque)={Ra:.4f} ({(Ra-R)/(1/N):.2f} h beyond R); R_eff(profile)={Rb:.4f} ({(Rb-R)/(1/N):.2f} h)")
for m in ("lbm",):
    for N in Ns:
        d = D[(m, N)]; Tl = d["T"][-1]
        try: Ra = brentq(lambda Re_: torque_at5(Re_) - Tl, 0.08, 0.2, xtol=1e-5)
        except ValueError: Ra = np.nan
        print(f"  (LBM N={N}: R_eff(torque)={Ra:.4f}, {(Ra-R)/(1/N):+.2f} h)")

# -------- spin + orbit
print("\n=== spin + orbit (Us=1, Uo=1, ro=0.2, Re=100, Nz=1) ===")
No = [N for N in (32, 64, 128) if all(os.path.exists(f"{OUT}/orbit_{m}_N{N}.npz") for m in ("fv", "lbm"))]
O = {(m, N): np.load(f"{OUT}/orbit_{m}_N{N}.npz") for m in ("fv", "lbm") for N in No}
tt = np.array([0.1, 0.25, 0.5, 1.0, 1.5, 2.0])
for key, name in (("T", "torque"), ("E", "E (whole box)")):
    print(f"\n{name}: t | " + " | ".join(f"{m}{N}" for m in ("FV", "LBM") for N in No))
    for t in tt:
        vals = []
        for m in ("fv", "lbm"):
            for N in No:
                d = O[(m, N)]
                vals.append(at(d, t, key, 2)[1])
        print(f" {t:5.2f} | " + " | ".join(f"{v:10.5f}" for v in vals))
print("\nratio FV/LBM at the same N:")
for N in No:
    for key in ("T", "E"):
        print(f"  N={N} {key}: " + ", ".join(f"t={t}: {at(O[('fv',N)],t,key,2)[1]/at(O[('lbm',N)],t,key,2)[1]:.3f}" for t in tt))
if len(No) >= 2:
    print("\nChange N -> 2N at t=2 (self-convergence):")
    for m in ("fv", "lbm"):
        for key in ("T", "E"):
            vals = [at(O[(m, N)], 2.0, key, 2)[1] for N in No]
            print(f"  {m} {key}: " + "  ".join(f"{v:.5f}" for v in vals) + "  diffs " + str(np.round(np.diff(vals), 6)))
