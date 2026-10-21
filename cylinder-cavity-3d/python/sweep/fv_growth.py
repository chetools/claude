"""Cross-check of the LBM sweep with the finite-volume reference: run fv3d on one sweep case and record
the spanwise-energy series (fluid-only diagnostics), to compare growth rates between the two methods.

    python sweep/fv_growth.py NAME N Nz Re Us Uo t_end [seed]
"""
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import diagnostics as D  # noqa: E402
import fv3d  # noqa: E402

name, N, Nz, Re, Us, Uo, t_end = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), \
    float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])
seed = float(sys.argv[8]) if len(sys.argv) > 8 else 1e-3
p = fv3d.make_params(N=N, Nz=Nz, Re=Re, Us=Us, Uo=Uo, ro=0.2, span="periodic", seed=seed)
s = fv3d.init_state(p)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_fv", name + ".json")
rows, every, t0, nxt = [], 0.1, time.time(), 0.0
while s["t"] < t_end:
    if s["t"] >= nxt:
        U = fv3d.cell_velocity(s, p)
        r = D.summary(U, s, p)
        sw = D.spanwise_energy(U, p["h"], p["Lz"], p["span"], fluid=D.fluid_mask(p, s["phi"]))
        rows.append(dict(t=s["t"], E=r["E"], Z=r["Z"], Ew=r["Ew"], E3d=r["E3d"], torque=r["torque"],
                         maxdiv=r["maxdiv"], Ekz=[float(x) for x in sw["Ekz"][:5]]))
        print(f"t={s['t']:.2f} E={r['E']:.4g} E3d={r['E3d']:.3e} wall={time.time()-t0:.0f}s", flush=True)
        json.dump(dict(name=name, inp=dict(N=N, Nz=Nz, Re=Re, Us=Us, Uo=Uo, seed=seed), dt=p["dt"], rows=rows),
                  open(out, "w"))
        nxt += every
    fv3d.step(s, p)
