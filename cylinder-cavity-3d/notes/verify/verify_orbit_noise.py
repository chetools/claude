"""Torque noise / time-average comparison for the spin+orbit case (reads out/orbit_*.npz)."""
import numpy as np, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
for N in (32, 64):
    for m in ("fv", "lbm"):
        d = np.load(f"{OUT}/orbit_{m}_N{N}.npz"); t, T = d["t"], d["T"]
        sel = (t >= 0.5)
        tt, TT = t[sel], T[sel]
        # remove a smooth trend (quadratic fit) and report the rms of the residual relative to |mean|
        c = np.polyfit(tt, TT, 3); res = TT - np.polyval(c, tt)
        print(f"{m:4s} N={N:3d} (samples every {t[1]-t[0]:.3f}): mean T[0.5,2]={TT.mean():+.5f}  min={TT.min():+.5f} max={TT.max():+.5f}  rms residual about cubic trend={res.std():.5f}  ({100*res.std()/abs(TT.mean()):.0f}% of |mean|)")
