"""Check 5: span="walls", spin only (ro=0), Re=100, both solvers; Ekman/Bodewadt secondary circulation.
usage: verify_ekman.py {fv|lbm} N Nz tend     -> out/ekman_<m>_N<N>_Nz<Nz>.npz + printed table
Azimuthally averaged radial velocity u_r(r,z) and axial velocity w(r,z) (cells binned by radius)."""
import sys
from vcommon import *
name, N, Nz, tend = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
m = mod(name)
p = m.make_params(N=N, Nz=Nz, Re=100.0, Us=1.0, Uo=0.0, ro=0.0, span="walls", seed=0.0)
s = m.init_state(p)
t0 = time.time()
nst = int(round(tend / p["dt"]))
for n in range(nst):
    m.step(s, p)
U = m.cell_velocity(s, p)
h = p["h"]
x = (np.arange(N) + 0.5) * h
X, Y = np.meshgrid(x, x)
r = np.hypot(X - .5, Y - .5)
ur = ((X - .5) * U[0] + (Y - .5) * U[1]) / np.maximum(r, 1e-12)      # (Nz,N,N)
ut = (-(Y - .5) * U[0] + (X - .5) * U[1]) / np.maximum(r, 1e-12)
w = U[2]
edges = np.array([0.10, 0.14, 0.18, 0.24, 0.32, 0.40])
def ring(F, k):
    return np.array([F[k][(r >= edges[i]) & (r < edges[i + 1])].mean() for i in range(len(edges) - 1)])
np.savez(f"{OUT}/ekman_{name}_N{N}_Nz{Nz}.npz", U=U, t=s["t"])
print(f"{name} N={N} Nz={Nz} t={s['t']:.3f} ({time.time()-t0:.0f}s)  ring edges r: {edges}")
print("max|w| =", np.abs(w).max(), " location (k,j,i) =", np.unravel_index(np.abs(w).argmax(), w.shape),
      " max|w| in mid half-span planes =", np.abs(w[Nz // 2 - 1:Nz // 2 + 1]).max())
print("antisymmetry max|w(k)+w(Nz-1-k)| =", np.abs(w + w[::-1]).max())
for k in (0, 1, Nz // 4, Nz // 2 - 1):
    print(f" plane k={k:2d} z/Lz={(k+.5)/Nz:.3f}: <u_theta> {np.round(ring(ut,k),3)}  <u_r> {np.round(ring(ur,k),4)}  <w> {np.round(ring(w,k),4)}")
# sign summary
print("SIGN: <u_r> in first cell above the z=0 wall, rings r<0.4: ", np.sign(ring(ur, 0)))
print("SIGN: <w> at quarter span (z=Lz/4), rings: ", np.sign(ring(w, Nz // 4)))
print("SIGN: <u_r> at mid-span planes, rings: ", np.sign(0.5 * (ring(ur, Nz // 2 - 1) + ring(ur, Nz // 2))))
# mass flux check: radial flux through the ring at r=0.2, integrated over a half span, vs axial flux through the plane at mid span
