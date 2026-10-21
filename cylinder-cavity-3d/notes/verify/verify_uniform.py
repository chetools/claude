"""Check 6: (a) seed=0, Nz=4 periodic spin+orbit: z-uniformity over 500 steps for both solvers.
(b) seed=1e-3, Re=50: 3D energy E3d(t), Ew(t) for both solvers (should decay initially)."""
import sys
from vcommon import *
which = sys.argv[1]
if which == "a":
    for name in ("fv", "lbm"):
        m = mod(name)
        p = m.make_params(N=32, Nz=4, Re=100.0, Us=1.0, Uo=1.0, ro=0.2, seed=0.0)
        s = m.init_state(p)
        for n in range(500):
            m.step(s, p)
        U = m.cell_velocity(s, p)
        sc = np.abs(U).max()
        print(f"{name}: after 500 steps (t={s['t']:.3f}) max plane difference / max|U| = {np.abs(U-U[:, :1]).max()/sc:.2e}; max|w|/max|U| = {np.abs(U[2]).max()/sc:.2e}; max|U|={sc:.3f}")
        if name == "fv":
            d = max(np.abs(s[c] - s[c][:1]).max() for c in ("u", "v"))
            print("   FV face arrays: max plane diff u,v =", d, " max|w|=", np.abs(s['w']).max())
else:
    N, Nz, tend = int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
    span = sys.argv[5] if len(sys.argv) > 5 else "periodic"
    for name in ("fv", "lbm"):
        m = mod(name)
        p = m.make_params(N=N, Nz=Nz, Re=50.0, Us=1.0, Uo=1.0, ro=0.2, seed=1e-3, span=span)
        s = m.init_state(p)
        nst = int(tend / p["dt"]); every = max(1, nst // 25)
        rows = []
        def rec():
            U = m.cell_velocity(s, p); sp = dg.spanwise_energy(U, p["h"], p["Lz"], span)
            rows.append((s["t"], sp["E3d"], sp["Ew"], dg.energy(U, p["h"], p["Lz"]), None if sp["Ekz"] is None else sp["Ekz"][1:5]))
        rec()
        for n in range(nst):
            m.step(s, p)
            if (n + 1) % every == 0: rec()
        print(f"--- {name} N={N} Nz={Nz} Re=50 seed=1e-3 span={span}  (E3d = energy of departure from z-average; E total)")
        for r in rows:
            print(f"  t={r[0]:.3f}  E3d={r[1]:.4e}  Ew={r[2]:.4e}  E={r[3]:.5f}  " + ("" if r[4] is None else "Ekz1..4=" + np.array2string(r[4], precision=2)))
