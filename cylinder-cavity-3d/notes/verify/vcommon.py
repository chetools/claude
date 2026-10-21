"""Shared helpers for the verification scripts (independent of the authors' tests)."""
import os, sys, time, json, hashlib
import numpy as np
PY = "/home/user/claude/cylinder-cavity-3d/python"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, PY)
import fv3d, lbm3d, diagnostics as dg

def md5(f):
    return hashlib.md5(open(os.path.join(PY, f), "rb").read()).hexdigest()

def mod(name):
    return fv3d if name == "fv" else lbm3d

def centre_line_v(U, p):
    """v(x) along the horizontal line y = 1/2 (average of the two cell rows around it), z-plane 0."""
    N = p["N"]
    v = U[1, 0]
    return (np.arange(N) + 0.5) / N, 0.5 * (v[N // 2 - 1] + v[N // 2])

def run_case(name, tend, every_t=0.05, nz_plane_avg=True, **kw):
    """Run solver `name` to t=tend recording a history row every ~every_t.
    Row: t, torque, E, Z (diagnostics over the whole box), plus own fluid-only E (cells with r > R+0.5h)."""
    m = mod(name)
    p = m.make_params(**kw)
    s = m.init_state(p)
    nstep = int(np.ceil(tend / p["dt"] - 1e-9))
    every = max(1, int(round(every_t / p["dt"])))
    rows = []
    t0 = time.time()
    for n in range(nstep):
        m.step(s, p)
        if (n + 1) % every == 0 or n + 1 == nstep:
            U = m.cell_velocity(s, p)
            rows.append(dict(t=s["t"], torque=float(m.torque(s, p)), E=dg.energy(U, p["h"], p["Lz"]),
                             Z=dg.enstrophy(U, p["h"], p["Lz"], p["span"])))
    return p, s, rows, time.time() - t0
