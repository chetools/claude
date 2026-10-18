"""Step-by-step breakdown of the Python reference implementation.

CELLS is a list of {"title", "md", "code"} dicts.  The page shows each cell's
explanation (Markdown + LaTeX), its code, and the output produced by running it
with CPython at build time; make_molab.py turns the same cells into the MoLab
notebook.  Cells share one namespace, like a notebook.

Inside the cells, figure(traces, **layout) records a Plotly figure (plain
dicts, so no plotting library is needed) and ns2d is the reference module.
"""

CELLS = [
dict(title="Inputs and derived numbers", md=r"""
The box is the unit square, and lengths are measured in box widths. The cylinder has radius $R$. Its
centre orbits the middle of the box on a circle of radius $r_o$ at speed $U_o$, and the cylinder
spins about its own centre with surface speed $U_s = \Omega R$. Either motion can be switched off by
setting its speed to zero.

The Reynolds number uses the larger of the two speeds and the cylinder diameter, $Re = U\,2R/\nu$, so
it sets the viscosity $\nu$. The time step combines two limits, $\Delta t = 1/(1/\Delta t_a + 1/\Delta t_d)$:
- **advection:** a fluid particle moves at most 0.3 cells per step (CFL number 0.3);
- **diffusion:** $\nu\,\Delta t/h^2 \le 0.05$.

`USER_INPUTS` is empty here. In the MoLab notebook it is the inputs cell you edit.
""", code=r'''
import numpy as np
import ns2d

inp = dict(N=64, Re=200.0, R=0.1, ro=0.2, Us=1.0, Uo=1.0)   # the page's self-test case
inp.update(USER_INPUTS)
p = ns2d.make_params(**inp)

print(f"grid {p['N']} x {p['N']},  h = {p['h']:.5f}")
print(f"nu = {p['nu']:.3e}   Omega = {p['Omega']:.2f} rad/s   omega_orbit = {p['omega_o']:.2f} rad/s")
print(f"dt = {p['dt']:.3e}  (advection limit {0.3*p['h']/(abs(p['Us']) + abs(p['omega_o'])*(p['ro']+p['R'])):.2e},"
      f" diffusion limit {0.05*p['h']**2/p['nu']:.2e})")
if p["omega_o"]:
    print(f"one orbit = {2*np.pi/abs(p['omega_o']):.3f} time units = {2*np.pi/abs(p['omega_o'])/p['dt']:.0f} steps")
print(f"cell Reynolds number U h / nu = {max(abs(p['Us']), abs(p['Uo'])) * p['h'] / p['nu']:.1f}")
'''),

dict(title="The staggered (MAC) grid and its ghost values", md=r"""
Each velocity component lives where its flux is needed:
- $u$ sits on the vertical cell faces;
- $v$ sits on the horizontal cell faces;
- the pressure sits at the cell centres.

On this grid the divergence of a cell and the pressure gradient across a face are both plain
differences of two neighbours. That tight coupling is what rules out the "checkerboard" pressure modes
of a collocated grid (Theory §2).

The walls are handled by **ghost values** outside the box:
- the normal velocity is zero on the wall itself, so mirrored values change sign;
- the tangential velocity is mirrored with a sign change across a wall half a cell away, which makes
  it zero *at* the wall (no slip).

All the stencils below can then read their neighbours without special cases.
""", code=r'''
u4 = np.arange(1.0, 21.0).reshape(4, 5)     # a 4 x 4 grid: u has 4 rows x 5 columns
u4[:, [0, -1]] = 0.0                        # no flow through the left/right walls
print("u (rows = y, columns = x):\n", u4)
print("\nu with 2 ghost layers (pad_u):\n", ns2d.pad_u(u4).astype(int))
'''),

dict(title="Divergence, gradient and the pressure equation", md=r"""
Incompressibility, $\nabla\cdot\mathbf u = 0$, is imposed by a **projection**. Given a velocity
$\mathbf u^*$ that is not divergence-free, we solve

$$\nabla^2 q = \nabla\cdot\mathbf u^*, \qquad \mathbf u = \mathbf u^* - \nabla q,$$

where $q = \Delta t\,p$. On the MAC grid the discrete divergence of the discrete gradient is exactly the
5-point Laplacian with zero-flux walls. Discrete projection is therefore exact: once the Poisson equation
is solved, the divergence vanishes to round-off. The check below confirms the identity on a random field.
""", code=r'''
q_rand = np.random.default_rng(1).standard_normal((p["N"], p["N"]))
u_g, v_g = ns2d.project(np.zeros((p["N"], p["N"] + 1)), np.zeros((p["N"] + 1, p["N"])), -q_rand, p["h"])
mismatch = np.abs(ns2d.divergence(u_g, v_g, p["h"]) - ns2d.laplacian(q_rand, p["h"])).max()
print(f"max |div(grad q) - laplacian(q)| = {mismatch:.1e}")
'''),

dict(title="Multigrid for the pressure", md=r"""
The Poisson equation couples every cell to every other cell. Information has to cross the whole box,
so a local smoother such as Gauss–Seidel needs $O(N^2)$ sweeps. **Multigrid** combines two steps:
- a few red–black Gauss–Seidel sweeps damp the *rough* part of the error;
- the remaining *smooth* error is solved on a grid twice as coarse, where it looks rough again. This
  recurses down to 4 × 4 cells.

Each V-cycle reduces the residual by a roughly constant factor, independent of $N$. The cost is $O(N^2)$,
a few times one smoothing sweep.

Red–black ordering matters on the GPU. All red cells depend only on black cells, so a whole colour
updates in parallel in one dispatch, with the same result as the sequential numpy code.
""", code=r'''
b_rand = np.random.default_rng(2).standard_normal((p["N"], p["N"]))
b_rand -= b_rand.mean()                     # a pure-Neumann problem needs a zero-mean right-hand side
x_mg, x_gs = np.zeros_like(b_rand), np.zeros_like(b_rand)
res_mg, res_gs = [], []
for _k in range(12):
    ns2d.vcycle(x_mg, b_rand, p["h"], p)
    ns2d.smooth(x_gs, b_rand, p["h"], 9)    # about the same work as one V-cycle
    res_mg.append(np.abs(b_rand - ns2d.laplacian(x_mg, p["h"])).max())
    res_gs.append(np.abs(b_rand - ns2d.laplacian(x_gs, p["h"])).max())
print("residual reduction per V-cycle:", np.round(np.array(res_mg[1:]) / np.array(res_mg[:-1]), 3)[:6])
figure([dict(x=list(range(1, 13)), y=res_mg, name="multigrid V-cycles"),
        dict(x=list(range(1, 13)), y=res_gs, name="Gauss-Seidel, same work")],
       title="Poisson residual", xaxis=dict(title="iteration"), yaxis=dict(title="max |residual|", type="log"))
'''),

dict(title="Advection without wiggles: the minmod limiter", md=r"""
The convective flux through a face is (normal velocity) × (transported value at the face). How the face
value is reconstructed decides the character of the scheme:
- **Central** averaging is second order, but it creates oscillations near sharp gradients. With an
  explicit time step and no viscosity to damp them, they grow without bound (in the test below, by eight
  orders of magnitude).
- **First-order upwind** is stable but smears everything.
- **MUSCL with the minmod limiter** extrapolates from the upwind side with a slope, and uses the
  smaller of the two one-sided slopes (zero at an extremum). It is second order where the field is
  smooth, and creates no new extrema.

The test below pushes a square pulse once around a periodic 1D domain (the central result is shown after only 10
steps, shifted back by the 5 cells it has moved so that it overlays the exact profile). The face value comes from the same
`face_value` function the solver uses.
""", code=r'''
n1 = 100
x1 = (np.arange(n1) + 0.5) / n1
c0 = ((x1 > 0.2) & (x1 < 0.4)).astype(float)
def transport_1d(c, scheme, steps=200, cfl=0.5):
    for _ in range(steps):
        cm2, cm1, cp1 = np.roll(c, 2), np.roll(c, 1), np.roll(c, -1)
        if scheme == "central":
            f = 0.5 * (cm1 + c)                              # face between cell k-1 and k
        elif scheme == "upwind":
            f = cm1
        else:
            f = ns2d.face_value(cm2, cm1, c, cp1, 1.0)
        c = c - cfl * (np.roll(f, -1) - f)
    return c
profiles = {s: transport_1d(c0, s) for s in ("central", "upwind", "minmod")}       # one lap = 200 steps
for _s, _c in profiles.items():
    print(f"{_s:8s} after one lap:  min {_c.min():+.3g}  max {_c.max():.3g}")
central_10 = transport_1d(c0, "central", steps=10)
print(f"central  after 10 steps: min {central_10.min():+.3g}  max {central_10.max():.3g}")
figure([dict(x=x1, y=c0, name="exact", line=dict(dash="dot", color="#31333f")),
        dict(x=x1 - 0.05, y=central_10, name="central, after only 10 steps"),
        dict(x=x1, y=profiles["upwind"], name="upwind, one lap"),
        dict(x=x1, y=profiles["minmod"], name="minmod, one lap")],
       title="Square pulse, CFL 0.5", xaxis=dict(title="x"), yaxis=dict(title="c", range=[-0.6, 1.6]))
'''),

dict(title="The moving cylinder: volume penalisation", md=r"""
The grid never moves. The cylinder is a smoothed indicator $\chi$, equal to 1 inside, 0 outside, and
blending over about one cell. Inside it the fluid is forced to the rigid-body velocity

$$\mathbf u_b = \underbrace{\omega_o\,\hat z\times(\mathbf c - \mathbf c_0)}_{\text{orbit}} +
\underbrace{\Omega\,\hat z\times(\mathbf x - \mathbf c)}_{\text{spin}}.$$

This is **Brinkman penalisation**, $\partial_t\mathbf u = \dots - \chi(\mathbf u - \mathbf u_b)/\eta$,
taken implicitly in the limit $\eta\to 0$: after each momentum update, $\mathbf u \leftarrow \mathbf u +
\chi(\mathbf u_b - \mathbf u)$. The force needed to do this is the force the body applies to the fluid,
which gives the torque for free. A moving body costs nothing extra: the mask is just recomputed
every step at the new position.
""", code=r'''
xu, yu, xv, yv = ns2d.face_coords(p)
chi_u, ub_u, _ = ns2d.body_mask_velocity(xu, yu, 0.0, p)
print(f"faces with chi > 0.5: {(chi_u > 0.5).sum()}   (pi R^2 / h^2 = {np.pi*p['R']**2/p['h']**2:.0f})")
print(f"body velocity on u-faces: min {ub_u[chi_u > 0.5].min():+.3f}, max {ub_u[chi_u > 0.5].max():+.3f}")
figure([dict(type="heatmap", z=chi_u, x=xu[0], y=yu[:, 0], colorscale="Greys", reversescale=False,
             colorbar=dict(title="chi"))],
       title="Mask chi on the u-faces (centre at phi = 0)", height=400, width=440,
       xaxis=dict(title="x", scaleanchor="y"), yaxis=dict(title="y"))
'''),

dict(title="One time step, piece by piece", md=r"""
`ns2d.step` does five things. They are run here by hand on the initial state, where the fluid is at rest:
1. **Momentum:** the right-hand side $R = -\nabla\cdot(\mathbf u\mathbf u) + \nu\nabla^2\mathbf u$, then
   variable-step Adams–Bashforth 2, $\mathbf u^* = \mathbf u + \Delta t\,[(1+\tfrac r2)R^n - \tfrac r2 R^{n-1}]$
   with $r = \Delta t_n/\Delta t_{n-1}$. The first step uses forward Euler.
2. **Body:** penalise towards $\mathbf u_b$ at the new body position.
3. **Divergence**, then **multigrid**: two V-cycles, warm-started from the previous $q$.
4. **Projection:** $\mathbf u \leftarrow \mathbf u - \nabla q$.
5. **Dye:** transport the passive tracer with the new face velocities.

From a fluid at rest, two V-cycles leave a divergence about 300 times smaller than before projection.
Later steps start from the previous $q$, which is already close, so the divergence left over stays
around $10^{-4}$ (next step).

On the GPU each item is one compute dispatch. Multigrid needs 11 per grid level, so a step at $N = 256$ is
about 140 dispatches.
""", code=r'''
st1 = ns2d.init_state(p)
Ru0, Rv0 = ns2d.momentum_rhs(st1["u"], st1["v"], p)
u_pen, v_pen = ns2d.penalise(st1["u"] + p["dt"] * Ru0, st1["v"] + p["dt"] * Rv0, p["omega_o"] * p["dt"], p)
div_before = ns2d.divergence(u_pen, v_pen, p["h"])
q1 = ns2d.solve_pressure(np.zeros((p["N"], p["N"])), div_before, p)
u1, v1 = ns2d.project(u_pen, v_pen, q1, p["h"])
print(f"max |div| after penalising : {np.abs(div_before).max():.3e}")
print(f"max |div| after projection : {np.abs(ns2d.divergence(u1, v1, p['h'])).max():.3e}   (2 V-cycles)")
st1 = ns2d.step(st1, p)
print(f"ns2d.step gives the same u: {np.allclose(st1['u'], u1)}")
'''),

dict(title="Running the flow", md=r"""
Now we march 1000 steps at $N = 64$, about one and a half orbits, and record the diagnostics every 20 steps:
- the kinetic energy $E = \tfrac12\int|\mathbf u|^2$;
- the enstrophy $Z = \tfrac12\int\omega^2$;
- the torque the fluid exerts on the cylinder.

The orbiting cylinder sheds vortices; the spinning one drags fluid round with it.

The page's App tab runs this same algorithm on the GPU at up to $512^2$ cells and thousands of
steps per second. Here numpy needs a few milliseconds per step at $64^2$.
""", code=r'''
import time
_t0 = time.perf_counter()
st, hist = ns2d.run(p, 1000, every=20, s=ns2d.init_state(p))
print(f"1000 steps in {time.perf_counter() - _t0:.1f} s  ->  t = {st['t']:.3f}")
_last = hist[-1]
print(f"E = {_last['E']:.4f}  Z = {_last['Z']:.2f}  torque = {_last['torque']:+.4f}  max|div| = {_last['maxdiv']:.1e}")
_t = [r["t"] for r in hist]
figure([dict(x=_t, y=[r["E"] for r in hist], name="kinetic energy E"),
        dict(x=_t, y=[r["Z"] / 100 for r in hist], name="enstrophy Z / 100")],
       title="Spin-up", xaxis=dict(title="t"), yaxis=dict(title=""))
figure([dict(x=_t, y=[r["torque"] for r in hist], name="torque on the cylinder")],
       title="Torque of the fluid on the cylinder", xaxis=dict(title="t"), yaxis=dict(title="torque"))
'''),

dict(title="Vorticity and dye", md=r"""
The vorticity $\omega = \partial v/\partial x - \partial u/\partial y$ is computed at cell corners and averaged
to the centres. Thin sheets of strong vorticity leave the cylinder surface and the walls; they roll up
into the vortices that, at higher Reynolds numbers, interact chaotically.

The dye started as 8 horizontal stripes. It is stretched and folded by the flow, which is how mixing
proceeds.
""", code=r'''
w_final = ns2d.cell_vorticity(st["u"], st["v"], p["h"])
_lim = 3 * np.sqrt(np.mean(w_final ** 2))
xc_ = (np.arange(p["N"]) + 0.5) * p["h"]
figure([dict(type="heatmap", z=w_final, x=xc_, y=xc_, zmin=-_lim, zmax=_lim, colorscale="RdBu", reversescale=True,
             colorbar=dict(title="omega"))],
       title=f"Vorticity at t = {st['t']:.2f}", height=420, width=460,
       xaxis=dict(title="x", scaleanchor="y"), yaxis=dict(title="y"))
figure([dict(type="heatmap", z=st["dye"], x=xc_, y=xc_, colorscale=[[0, "#1f2959"], [1, "#fabf40"]], showscale=False)],
       title="Dye", height=420, width=420, xaxis=dict(title="x", scaleanchor="y"), yaxis=dict(title="y"))
'''),

dict(title="Checks", md=r"""
Two quick checks, both also in `test_ns2d.py`:
- **Symmetry.** A cylinder spinning at the centre of the box defines a problem that is unchanged by a half
  turn. The discrete solution must be too, to round-off, because every stencil, ghost rule and
  red–black ordering is the same after the rotation. This test catches almost any indexing mistake.
- **No-slip inside the body.** Deep inside the cylinder the fluid must move with it. The remaining
  difference is the error that projection reintroduces after penalisation.

The page's *Validation* tab runs the JavaScript CPU solver and the WebGPU solver on the case from
step 1 and compares them with numbers produced by this code.
""", code=r'''
p_sym = ns2d.make_params(N=32, ro=0.0, Us=1.0, Re=300)
s_sym, _ = ns2d.run(p_sym, 40)
print(f"half-turn symmetry error   : {np.abs(np.rot90(s_sym['u'], 2) + s_sym['u']).max():.1e}")
_cx, _cy = ns2d.body_centre(st["phi"], p)
_inside = np.hypot(xu - _cx, yu - _cy) < p["R"] - 3 * p["h"]
_, ub_now, _ = ns2d.body_mask_velocity(xu, yu, st["phi"], p)
print(f"max |u - u_body| inside    : {np.abs(st['u'] - ub_now)[_inside].max():.3f}"
      f"  (body speed up to {np.abs(ub_now[_inside]).max():.2f})")
'''),
]
