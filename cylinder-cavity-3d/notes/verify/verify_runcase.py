"""Run one 2D case with one solver and save history + final centre-line profile.
usage: verify_runcase.py {fv|lbm} N tend tag key=value ...   (values parsed as python literals)
saves out/<tag>_<solver>_N<N>.npz"""
import sys, ast, numpy as np
from vcommon import *
name, N, tend, tag = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
kw = {k: ast.literal_eval(v) for k, v in (a.split("=") for a in sys.argv[5:])}
p, s, rows, secs = run_case(name, tend, N=N, Nz=1, **kw)
m = mod(name)
U = m.cell_velocity(s, p)
x, v = centre_line_v(U, p)
_, u_col = None, None
np.savez(f"{OUT}/{tag}_{name}_N{N}.npz", t=[r["t"] for r in rows], T=[r["torque"] for r in rows],
         E=[r["E"] for r in rows], Z=[r["Z"] for r in rows], x=x, v=v, U=U, secs=secs,
         dt=p["dt"], phi=s["phi"])
print(name, N, tag, "done", round(secs, 1), "s; steps", s["nstep"], "T_end", rows[-1]["torque"])
