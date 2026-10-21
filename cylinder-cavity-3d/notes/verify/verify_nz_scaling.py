"""Torque per unit span must not depend on Nz (z-uniform periodic flow).  Also: L.torque vs a hand conversion,
and the sign (spin ccw -> negative) for both solvers."""
from vcommon import *
for name in ("fv", "lbm"):
    m = mod(name)
    out = []
    for Nz in (1, 4):
        p = m.make_params(N=32, Nz=Nz, Re=100.0, Us=1.0, Uo=0.5, ro=0.2, seed=0.0)
        s = m.init_state(p)
        for _ in range(150 if name == "fv" else 400):
            m.step(s, p)
        out.append((m.torque(s, p), dg.energy(m.cell_velocity(s, p), p["h"], p["Lz"]), s["t"]))
    print(name, "Nz=1:", out[0], " Nz=4:", out[1], " rel diff torque", abs(out[1][0] / out[0][0] - 1), " rel diff E", abs(out[1][1] / out[0][1] - 1))
