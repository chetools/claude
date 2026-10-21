"""Horizontal energy spectra E(k) of the final velocity fields (t = 20) of the spin-only runs at Re 100 and 150,
3D (N_z = 32) against the 2D baseline (N_z = 1): fluid-only, diagnostics.spectrum_h.  Prints E(k) for
k = 1..16, the ratio 3D/2D per shell, and a least-squares slope of log E vs log k over k = 4..16 (a slope, not
a claim of an inertial range).  Output: notes/verify/out/spectra_final.txt"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import diagnostics as D  # noqa: E402
import lbm3d  # noqa: E402

RES = os.path.join(HERE, "results_spec")
out = []
for Re in (100, 150):
    spec = {}
    for tag, Nz in (("", 32), ("_2d", 1)):
        name = f"s_Re{Re}{tag}_vol"
        r = json.load(open(os.path.join(RES, name + ".json")))
        c = r["params"]
        p = lbm3d.make_params(N=c["N"], Nz=Nz, Re=c["Re"], Us=c["Us"], Uo=c["Uo"], ro=c["ro"], seed=0.0)
        U = np.load(os.path.join(RES, name + "_u.npy")).astype(float)
        fl = D.fluid_mask(p, 0.0)                    # spin only: the cylinder does not move (phi = 0)
        k, Ek = D.spectrum_h(U, p["h"], fluid=fl)
        spec[tag or "3d"] = (k, Ek, D.energy(U, p["h"], p["Lz"], fluid=fl))
    (k, e3, E3), (_, e2, E2) = spec["3d"], spec["_2d"]
    sel = (k >= 4) & (k <= 16)
    s3 = np.polyfit(np.log(k[sel]), np.log(e3[sel]), 1)[0]
    s2 = np.polyfit(np.log(k[sel]), np.log(e2[sel]), 1)[0]
    out.append(f"Re {Re}, spin only, LBM N=64, t=20 (fluid only): E 3D {E3:.4g}, 2D {E2:.4g}")
    out.append(f"  slope of log E(k) over k=4..16: 3D {s3:+.2f}, 2D {s2:+.2f}")
    out.append("   k    E3D(k)      E2D(k)     3D/2D")
    for kk in range(1, 17):
        out.append(f"  {kk:2d}  {e3[kk]:.3e}  {e2[kk]:.3e}  {e3[kk] / e2[kk]:.3f}")
    hi = k >= 8
    out.append(f"  energy in k >= 8: 3D {e3[hi].sum():.3e}, 2D {e2[hi].sum():.3e}, ratio {e3[hi].sum() / e2[hi].sum():.3f}")
    out.append(f"  energy in k <= 3: 3D {e3[(k >= 1) & (k <= 3)].sum():.3e}, 2D {e2[(k >= 1) & (k <= 3)].sum():.3e}")
txt = "\n".join(out)
print(txt)
open(os.path.join(HERE, "..", "..", "notes", "verify", "out", "spectra_final.txt"), "w").write(txt + "\n")
