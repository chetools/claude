"""Step-by-step breakdown of the Python reference implementation.

CELLS is a list of {"title", "md", "code"} dicts.  The page shows each cell's
explanation (Markdown + LaTeX), its code, and the output produced by actually
running it -- at build time with CPython, or live in the browser (Pyodide)
with the sidebar inputs.  Cells share one namespace, like a notebook.

Inside the cells, figure(traces, **layout) records a Plotly figure (plain
dicts, so no plotting library is needed) and pbr is the reference module.
"""

CELLS = [
dict(title="Inputs and dimensionless groups", md=r"""
Everything starts from the dimensional inputs of Froment's o-xylene tube. A dictionary maps
names to SI values. In the live run, `USER_INPUTS` holds the values from the sidebar; at build time it is empty.

`groups_from_dimensional` condenses the 17 inputs into the 8 numbers the equations actually
depend on (Theory §3). Two of them tell most of the story:
- **$S$** is the heat the feed can release, measured in units of $RT_0^2/E$ (about 29 K here).
- **$N = St/Da$** is the 1D cooling capacity relative to the reaction rate at the inlet.

Semenov's criterion (Theory §9) says to worry when $N/S$ approaches $e \approx 2.7$.
""", code=r'''
import numpy as np
import pbr

q = pbr.oxylene_preset()          # Froment's o-xylene tube, SI units
q.update(USER_INPUTS)             # sidebar values (empty at build time)

gr, T0 = pbr.groups_from_dimensional(q)
dT_ad = q["dH"] * q["p0"] / (q["M_m"] * q["cp"])
print(f"inlet T0 = {T0:.1f} K,  adiabatic rise dT_ad = {dT_ad:.0f} K")
print(f"one theta unit = T0/gamma = {T0/gr['gamma']:.1f} K")
for _k, _v in gr.items():
    print(f"  {_k:8s} = {_v:10.4f}")
print(f"N/S = St/(Da S) = {gr['St']/(gr['Da']*gr['S']):.3f}   (Semenov: e = 2.718)")
'''),

dict(title="The radial grid: finite volumes", md=r"""
We cut the cross-section into $N$ rings ("cells") of equal width $d = 1/N$. Each cell stores
one $x$ and one $\theta$ at its centre.

The Laplacian becomes *flux in minus flux out*, divided by the ring's area $V_i$:
- `cw[i]` and `ce[i]` are the weights of the inner and outer neighbours.
- At the axis the inner face has radius 0, so `cw[0] = 0` and no flux crosses it. That is the symmetry condition, with no special-casing.
- `ce[N-1] = 0` too, because the wall face is handled by the Robin condition (next cell).
""", code=r'''
g8 = pbr.Grid(8)
print("cell centres rho :", np.round(g8.rho, 4))
print("areas V_i        :", np.round(g8.area, 5), " sum =", g8.area.sum(), "(= 1/2)")
print("inner weight cw  :", np.round(g8.cw, 1))
print("outer weight ce  :", np.round(g8.ce, 1))
'''),

dict(title="Checking the discrete Laplacian and the wall condition", md=r"""
Test: for $u = \rho^2$ the exact Laplacian is $\frac{1}{\rho}(\rho\cdot 2\rho)' = 4$
everywhere. Finite volumes reproduce this **exactly** in every interior cell, including the
axis cell, because the flux $\rho\,u'$ is linear in $\rho^2$.

At the wall the Robin condition $-\partial\theta/\partial\rho = Bi(\theta_R-\theta_w)$ is
applied half a cell away from the last centre. Eliminating the unknown wall value gives
$Bi_{\text{eff}} = Bi/(1 + Bi\,d/2)$ (Theory §5).
""", code=r'''
u = g8.rho**2
lap = np.zeros_like(u)
lap[1:]  += g8.cw[1:]  * (u[:-1] - u[1:])
lap[:-1] += g8.ce[:-1] * (u[1:]  - u[:-1])
print("interior Laplacian of rho^2:", np.round(lap[:-1], 12), " (exact: 4)")
print("Bi =", round(gr["Bi"], 3), " -> Bi_eff on 8 cells =", round(gr["Bi"]/(1 + gr["Bi"]*0.5*g8.d), 3))
'''),

dict(title="The rate law and the Arrhenius feedback", md=r"""
The dimensionless rate is $r = (1-x)\exp(\theta/(1+\theta/\gamma))$.

Each unit of $\theta$ (about 29 K) multiplies the rate by roughly $e$. Unchecked, that
positive feedback (hotter means faster, which means hotter still) is what turns a hot spot into runaway. With
finite $\gamma$ the growth is slightly sub-exponential, which is why real runaway is a little
milder than the $\gamma\to\infty$ textbook picture.
""", code=r'''
th = np.linspace(0, 8, 81)
figure([dict(x=th, y=pbr.rate(0.0, th, gr["gamma"]), name=f"gamma = {gr['gamma']:.1f}"),
        dict(x=th, y=np.exp(th), name="gamma -> inf (e^theta)", line=dict(dash="dash"))],
       title="Rate multiplier at zero conversion", xaxis=dict(title="theta"),
       yaxis=dict(title="r(0, theta)", type="log"))
print("rate at theta = 1, 3, 6:", np.round(pbr.rate(0.0, np.array([1., 3., 6.]), gr["gamma"]), 2))
'''),

dict(title="The right-hand side: unknowns interleaved per cell", md=r"""
The state vector stores `[x0, th0, x1, th1, ...]`. Python slicing gives
`y[0::2]` (all conversions) and `y[1::2]` (all temperatures), so `rhs` is written with
whole-array numpy operations and no Python loop.

At the inlet ($x = 0$, $\theta = 0$) the temperature is uniform, so dispersion contributes
nothing. Every cell heats at the rate $S\,Da$, and every cell converts at the rate $Da$.
""", code=r'''
grid = pbr.Grid(30)
y0 = np.zeros(2 * grid.n)
f = pbr.rhs(y0, gr, grid)
print("dx/dxi at inlet (first 3 cells):", np.round(f[0:6:2], 4), "  Da   =", round(gr["Da"], 4))
print("dth/dxi at inlet (first 3 cells):", np.round(f[1:6:2], 4), "  S Da =", round(gr["S"]*gr["Da"], 4))
'''),

dict(title="The Jacobian: five diagonals", md=r"""
Implicit methods need the Jacobian $J = \partial f/\partial y$. With interleaved unknowns
it is **banded**:
- reaction couples $x_i$ and $\theta_i$ (offsets ±1);
- dispersion couples a cell to its neighbours (offsets ±2).

So only 5 diagonals are non-zero, whatever $N$ is. The figure shows the sparsity pattern.

We check the hand-derived Jacobian against finite differences of `rhs`. A small mismatch would
silently slow the solver down. Rust avoids the question entirely by computing the rate derivatives
with automatic differentiation.
""", code=r'''
y_test = np.linspace(0, 1, 2 * grid.n) * np.tile([0.3, 2.0], grid.n)    # some non-trivial state
J = pbr.jacobian_sparse(y_test, gr, grid).toarray()
eps = 1e-7
Jfd = np.column_stack([(pbr.rhs(y_test + eps*e, gr, grid) - pbr.rhs(y_test - eps*e, gr, grid)) / (2*eps)
                       for e in np.eye(2 * grid.n)])
print("max |J - J_fd| / max|J| =", f"{np.abs(J - Jfd).max() / np.abs(J).max():.1e}")
nz = (J[:16, :16] != 0).astype(float)
figure([dict(type="heatmap", z=nz[::-1], colorscale=[[0, "white"], [1, "#31333f"]], showscale=False)],
       title="Non-zeros of J (first 8 cells)", height=360, width=380,
       xaxis=dict(title="column"), yaxis=dict(title="row (top = 0)", showticklabels=False))
'''),

dict(title="Why the problem is stiff", md=r"""
The eigenvalues of $J$ set the time scales of the system. Their spread is the **stiffness
ratio**.

An explicit method such as forward Euler is only stable for $h < 2/|\lambda|_{max}$. That limit
is set by the fastest radial mode, about $a_h N^2$, even though the solution changes slowly almost
everywhere. Implicit and Rosenbrock methods have no such limit: their step is set by **accuracy**, not stability.
""", code=r'''
lam = np.linalg.eigvals(pbr.jacobian_sparse(np.zeros(2 * grid.n), gr, grid).toarray())
print(f"eigenvalues: min |Re| = {np.abs(lam.real).min():.3g},  max |Re| = {np.abs(lam.real).max():.3g}")
print(f"stiffness ratio ~ {np.abs(lam.real).max() / np.abs(lam.real).min():.0f}")
print(f"forward Euler would need h < {2/np.abs(lam).max():.2e}  ->  > {np.abs(lam).max()/2:.0f} steps")
'''),

dict(title="One Rosenbrock step, written out", md=r"""
This is the ode23s step (Theory §6), written out for a single step of size $h$. Each stage solves a
linear system with the *same* matrix $W = I - h\,d\,J$. The matrix is linear, so there is no Newton
iteration, and it is banded, so `solve_banded` is $O(N)$.

The two solutions of different order differ by `err`. That difference estimates the local error and
drives the step-size control. `pbr.integrate` runs exactly this loop with acceptance tests added.
""", code=r'''
from scipy.linalg import solve_banded
h = 1e-3
d, e32 = 1/(2 + np.sqrt(2)), 6 + np.sqrt(2)
y_n = np.zeros(2 * grid.n)
ab = pbr.w_banded(y_n, gr, grid, False, h * d)       # W in banded storage
F0 = pbr.rhs(y_n, gr, grid)
k1 = solve_banded((2, 2), ab, F0)
F1 = pbr.rhs(y_n + 0.5*h*k1, gr, grid)
k2 = solve_banded((2, 2), ab, F1 - k1) + k1
y1 = y_n + h * k2                                    # 2nd-order solution
F2 = pbr.rhs(y1, gr, grid)
k3 = solve_banded((2, 2), ab, F2 - e32*(k2 - F1) - 2*(k1 - F0))
err = h/6 * (k1 - 2*k2 + k3)
print("theta on the axis after one step:", y1[1])
print("estimated local error (max)     :", f"{np.abs(err).max():.2e}")
'''),

dict(title="The full solve and the adaptive step size", md=r"""
Now we march the whole bed. The step size is the clearest picture of what the solver is doing:
- it **shrinks by orders of magnitude** to resolve the hot spot, where temperature and reaction rate change fastest;
- it relaxes again downstream, once the reactant is depleted.

A fixed step small enough for the hot spot would waste most of its effort elsewhere.
""", code=r'''
run = pbr.integrate(gr, n=30, rtol=1e-5, atol=1e-8)
T = pbr.to_kelvin(run["Y"][:, 1::2], gr, T0)        # shape (steps+1, N)
Tstar = pbr.to_kelvin(run["theta_star"], gr, T0)
print(f"{run['steps']} accepted / {run['rejected']} rejected steps, {run['n_rhs']} rhs calls")
print(f"hot spot T* = {Tstar:.2f} K  (dT = {Tstar - T0:.1f} K) at z = {run['xi_star']*q['L']:.3f} m")
z = run["xi"] * q["L"]
figure([dict(x=z, y=T[:, 0], name="axis"), dict(x=z, y=T[:, -1], name="next to wall"),
        dict(x=z[1:], y=np.diff(run["xi"]), name="step size h", yaxis="y2",
             line=dict(dash="dot", color="#808495"))],
       title="Temperature and step size along the bed", xaxis=dict(title="z [m]"),
       yaxis=dict(title="T [K]"), yaxis2=dict(title="h", type="log", overlaying="y", side="right"),
       legend=dict(x=1.1, y=1))
'''),

dict(title="The temperature field", md=r"""
The 2D field shows what a 1D model cannot: the axis is far hotter than the wall region,
because heat produced at the centre must be **conducted across the bed** before the coolant can
remove it. The radial profile at the hot spot is close to a parabola, the shape behind the
$R/(4\lambda_{er})$ term of the 1D–2D link.
""", code=r'''
k_hot = int(np.argmin(np.abs(run["xi"] - run["xi_star"])))
rr = np.concatenate([-grid.rho[::-1], grid.rho]) * q["d_t"] / 2 * 100     # cm, mirrored
TT = np.hstack([T[:, ::-1], T])
figure([dict(type="heatmap", x=z, y=rr, z=TT.T, colorscale="Inferno", colorbar=dict(title="T [K]"))],
       title="T(z, r): mirrored tube cross-section", xaxis=dict(title="z [m]", range=[0, min(1.0, q["L"])]),
       yaxis=dict(title="r [cm]"))
figure([dict(x=grid.rho, y=T[k_hot], mode="lines+markers", name=f"z = {z[k_hot]:.3f} m")],
       title="Radial profile at the hot spot", xaxis=dict(title="r/R"), yaxis=dict(title="T [K]"))
'''),

dict(title="Independent confirmation with scipy (BDF)", md=r"""
Agreement with *our own* Rosenbrock code only proves the code does what we wrote. For an
independent check we hand the same `rhs` and Jacobian to `scipy.integrate.solve_ivp` with
`method="BDF"`. That is a variable-order multistep method with different error control.

Agreement at tight tolerances confirms the time integration. The model and the spatial
discretization are shared, and are checked separately (Bessel series and grid order in
`test_pbr.py`).
""", code=r'''
ref = pbr.integrate(gr, rtol=1e-9, atol=1e-12, record=False)
bdf = pbr.integrate_bdf(gr, rtol=1e-9, atol=1e-12)
for _name, _r in [("Rosenbrock rtol=1e-5", run), ("Rosenbrock rtol=1e-9", ref), ("scipy BDF  rtol=1e-9", bdf)]:
    print(f"{_name}:  T* = {pbr.to_kelvin(_r['theta_star'], gr, T0):.4f} K   "
          f"z* = {_r['xi_star']*q['L']:.4f} m   steps = {_r['steps']}")
print("outlet conversion (cup-mixing):", round(pbr.cup_mixing(ref["y_out"], ref["grid"]), 5))
'''),

dict(title="2D versus 1D", md=r"""
The 1D model sees one cross-sectional average temperature and lumps all resistance into
$1/U = 1/\alpha_w + R/(4\lambda_{er})$. Its hot spot is milder than the axis temperature of the
2D model, and it also predicts runaway later. Designing with the 1D model alone is therefore
**non-conservative** for wide tubes.
""", code=r'''
one = pbr.integrate(gr, one_d=True, rtol=1e-8, atol=1e-11)
print(f"2D axis hot spot : {pbr.to_kelvin(ref['theta_star'], gr, T0):.2f} K")
print(f"1D hot spot      : {pbr.to_kelvin(one['theta_star'], gr, T0):.2f} K")
'''),

dict(title="Parametric sensitivity by finite differences, and its pitfall", md=r"""
The normalized sensitivity $s = (\phi/T^*)\,dT^*/d\phi$ by central differences needs two extra
solves per parameter. Choosing the step $h$ is the catch:
- a **large $h$** sees the curvature of $T^*(\phi)$ (truncation error, which falls like $h^2$);
- a **small $h$** divides solver noise of relative size about rtol by $h$ (that error grows like $1/h$).

The error curve is therefore V-shaped, and near runaway, where it matters most, the
good window narrows. The Rust code avoids the choice entirely with automatic
differentiation (Theory §8).
""", code=r'''
hs = np.logspace(-7, -1, 9)
ss = [pbr.sensitivity_fd(q, "p0", rel_h=hh, rtol=1e-5, atol=1e-8)[2] for hh in hs]
s_ref = pbr.sensitivity_fd(q, "p0", rel_h=1e-4, rtol=1e-10, atol=1e-13)[2]
print(f"reference s(T*; p0) = {s_ref:.6f}")
figure([dict(x=hs, y=np.abs(np.array(ss) - s_ref) + 1e-16, mode="lines+markers", name="|error|")],
       title="Finite-difference error vs step (solver rtol = 1e-5)",
       xaxis=dict(title="relative step h", type="log"), yaxis=dict(title="|s_FD - s_ref|", type="log"))
'''),

dict(title="Morbidelli–Varma: sweep and find the critical feed", md=r"""
Sweep the feed partial pressure $p_0$, compute $T^*$ and $s$ at each value, and find the
maximum of $|s|$. That maximum is the **MV critical value** $p_{0,c}$ (Theory §10). Below it the
hot spot responds gently. Around it, a few percent more feed moves the hot spot by
hundreds of kelvin.

This sweep needs 3 solves per point, which takes seconds in Python. The App tab does the same
with Rust in milliseconds.
""", code=r'''
p0s = np.linspace(0.6, 2.0, 13) * q["p0"]
res = [pbr.sensitivity_fd(dict(q, p0=p), "p0", rel_h=1e-3) for p in p0s]
Ts = np.array([r[0] for r in res]); sv = np.array([r[2] for r in res])
k_c = int(np.argmax(np.abs(sv)))
print(f"MV critical p0 ~ {p0s[k_c]:.5f} atm  (max |s| = {abs(sv[k_c]):.1f});  current p0 = {q['p0']:.5f} atm")
figure([dict(x=p0s, y=Ts, name="T* [K]"),
        dict(x=p0s, y=np.abs(sv), name="|s(T*; p0)|", yaxis="y2", line=dict(color="firebrick"))],
       title="Hot spot and its sensitivity vs feed partial pressure", xaxis=dict(title="p0 [atm]"),
       yaxis=dict(title="T* [K]"), yaxis2=dict(title="|s|", overlaying="y", side="right", type="log"),
       legend=dict(x=1.1, y=1))
'''),

dict(title="Semenov's limit for these inputs", md=r"""
Finally we place the current inputs on Semenov's map. With finite $\gamma$ the tangency
condition $\theta_c = (1+\theta_c/\gamma)^2$ gives the critical $N/S$ (Theory §9).

Semenov ignores consumption, so it is **conservative**: below the Semenov value runaway is
*possible*, and the MV criterion tells how close you really are.
""", code=r'''
g = gr["gamma"]
thc = 0.5 * g * ((g - 2) - np.sqrt(g*g - 4*g))
NS_c = np.exp(thc / (1 + thc/g)) / thc
NS = gr["St"] / (gr["Da"] * gr["S"])
print(f"Semenov (finite gamma = {g:.2f}): theta_c = {thc:.3f},  (N/S)_c = {NS_c:.3f}")
print(f"Semenov (gamma -> inf):           (N/S)_c = e = {np.e:.3f}")
print(f"current 1D-equivalent N/S = {NS:.3f}  ->  {'below' if NS < NS_c else 'above'} the Semenov line")
'''),
]
