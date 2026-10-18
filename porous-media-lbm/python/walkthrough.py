"""Step-by-step breakdown of the Python reference implementation.

CELLS is a list of {"title", "md", "code"} dicts.  The page shows each cell's
explanation (Markdown + LaTeX), its code, and the output produced by actually
running it -- at build time with CPython, or live in the browser (Pyodide)
with the sidebar inputs.  Cells share one namespace, like a notebook.

Inside the cells, figure(traces, **layout) records a Plotly figure (plain
dicts, so no plotting library is needed) and lbm is the reference module.
"""

CELLS = [
dict(title="Inputs and lattice units", md=r"""
Lattice-Boltzmann works in **lattice units**: the cell size $\Delta x$, the time step $\Delta t$ and the
reference density are all 1. A physical problem enters only through dimensionless groups.
- The bed is described in particle diameters: a domain $L_x/d \times L_y/d$, a porosity $\varepsilon$, and a
  minimum gap between particles (in 2D, touching disks would seal the pores).
- **Resolution** $D$ is the number of cells per particle diameter. It sets $\Delta x = d/D$.
- The relaxation time $\tau$ sets the lattice viscosity $\nu = c_s^2(\tau - \tfrac12)$ with $c_s^2 = 1/3$.

The breakdown runs on a coarse grid ($D = 10$) so that every step finishes in seconds in plain numpy. The
App tab runs the same algorithm on the GPU, typically at $D = 24$ and up to millions of cells.
`USER_INPUTS` holds the sidebar values in a live run and is empty at build time.
""", code=r'''
import numpy as np
import lbm

p = dict(Lx_d=20.0, Ly_d=8.0, D=10.0, porosity=0.65, gap_d=0.15, spread=0.0, seed=3,
         layout="random", walls=False, tau=1.0, Pe_m=20.0, u_tracer=0.04, d_p_mm=3.0, nu_SI=1.0e-6)
p.update(USER_INPUTS)             # sidebar values (empty at build time)

nx, ny = int(round(p["Lx_d"] * p["D"])), int(round(p["Ly_d"] * p["D"]))
nu = lbm.viscosity(p["tau"])
print(f"grid {nx} x {ny} = {nx * ny} cells,  D = {p['D']:g} cells per diameter")
print(f"tau = {p['tau']}  ->  lattice viscosity nu = {nu:.4f}")
'''),

dict(title="The D2Q9 lattice", md=r"""
Each cell stores nine populations $f_i$: the density of particles moving with the discrete
velocity $\mathbf c_i$ (rest, four axis neighbours, four diagonals). The weights $w_i$ are chosen so that the
lattice's velocity moments match those of a Maxwell distribution up to fourth order. That is what makes
the large-scale dynamics isotropic Navier–Stokes, even though particles move in only nine directions:

$$\sum_i w_i = 1,\qquad \sum_i w_i c_{i\alpha} c_{i\beta} = c_s^2\,\delta_{\alpha\beta},\qquad
\sum_i w_i c_{i\alpha}c_{i\beta}c_{i\gamma}c_{i\delta} = c_s^4(\delta_{\alpha\beta}\delta_{\gamma\delta}+\delta_{\alpha\gamma}\delta_{\beta\delta}+\delta_{\alpha\delta}\delta_{\beta\gamma}).$$

Odd moments vanish by symmetry. `OPP[i]` is the index of $-\mathbf c_i$, used for bounce-back.
""", code=r'''
print(" i   c_i      w_i     opp")
for _i in range(9):
    print(f"{_i:2d}  ({lbm.C[_i, 0]:+d},{lbm.C[_i, 1]:+d})  {lbm.W[_i]:.4f}   {lbm.OPP[_i]}")
cx, cy = lbm.C[:, 0], lbm.C[:, 1]
print("sum w            =", lbm.W.sum())
print("sum w c_x c_x    =", (lbm.W * cx * cx).sum(), "  (cs^2 = 1/3)")
print("sum w c_x c_y    =", (lbm.W * cx * cy).sum())
print("sum w c_x^4      =", (lbm.W * cx ** 4).sum(), "  (3 cs^4 = 1/3)")
print("sum w c_x^2 c_y^2=", (lbm.W * cx ** 2 * cy ** 2).sum(), "  (cs^4 = 1/9)")
'''),

dict(title="The equilibrium distribution and its moments", md=r"""
Collisions push the populations towards a local equilibrium, a second-order expansion of the Maxwell
distribution in the velocity:

$$f_i^{\mathrm{eq}} = w_i\,\rho\left(1 + \frac{\mathbf c_i\!\cdot\!\mathbf u}{c_s^2} + \frac{(\mathbf c_i\!\cdot\!\mathbf u)^2}{2c_s^4}
- \frac{\mathbf u\!\cdot\!\mathbf u}{2c_s^2}\right).$$

Its zeroth and first moments return the density and momentum it was built from. Its second moment is the
inviscid momentum flux $p\,\delta_{\alpha\beta} + \rho u_\alpha u_\beta$ with pressure $p = \rho c_s^2$. The
lattice gas is therefore an ideal gas with sound speed $c_s$. Keeping $|\mathbf u| \ll c_s \approx 0.58$
(low Mach number) is what makes it behave as an incompressible liquid.
""", code=r'''
_rho, _ux, _uy = 1.02, 0.05, -0.02
feq = lbm.equilibrium(np.array(_rho), np.array(_ux), np.array(_uy))
print("sum f          =", feq.sum(), "  (rho)")
print("sum f c_x      =", (feq * cx).sum(), "  (rho u_x =", _rho * _ux, ")")
print("sum f c_x c_x  =", (feq * cx * cx).sum(), "  (rho cs^2 + rho u_x^2 =", _rho / 3 + _rho * _ux ** 2, ")")
print("sum f c_x c_y  =", (feq * cx * cy).sum(), "  (rho u_x u_y =", _rho * _ux * _uy, ")")
'''),

dict(title="Building a random bed of disks", md=r"""
Particles are placed by **random sequential addition**:
1. Draw a diameter and a centre.
2. Keep the disk if it clears every other disk by at least the minimum gap; otherwise discard it.
3. Stop when the solid area reaches $(1-\varepsilon)$ of the domain.

The domain is periodic in both directions, so a disk leaving at one edge re-enters at the opposite one.

`rasterize` marks a cell solid if its centre lies inside a disk. The achieved porosity therefore differs
slightly from the target. The random numbers come from the same 32-bit generator as the page, so a given seed
and domain size give the same bed in numpy, in the browser and in the notebook, at any resolution.

The **specific surface** $a_s$ (solid perimeter / solid area) enters the Kozeny–Carman model.
It is $4/d$ for equal disks, compared with $6/d$ for spheres.
""", code=r'''
solid, disks = lbm.make_bed(nx, ny, p["porosity"], p["D"], layout=p["layout"], spread=p["spread"],
                            gap=p["gap_d"] * p["D"], seed=p["seed"], walls=p["walls"])
eps = lbm.porosity_of(solid, p["walls"])
a_s = lbm.specific_surface(disks)
d_mean = 4.0 / a_s if disks else p["D"]
print(f"{len(disks)} disks, porosity: target {p['porosity']}, achieved {eps:.4f}")
print(f"specific surface a_s = {a_s:.4f} per cell  (4/D = {4 / p['D']:.4f})")
figure([dict(type="heatmap", z=solid.astype(int).tolist(), colorscale=[[0, "#f4f6fa"], [1, "#5b6170"]],
             showscale=False)],
       title="Solid mask (dark = particle)", height=300,
       xaxis=dict(title="x [cells]", constrain="domain"), yaxis=dict(title="y", scaleanchor="x"))
'''),

dict(title="Streaming with halfway bounce-back", md=r"""
In the **streaming** step every population moves one cell along its velocity. We use the *pull* form: the
population arriving at $\mathbf x$ along $\mathbf c_i$ is the one that left $\mathbf x - \mathbf c_i$ one step
earlier. The GPU uses the same form, because then every cell only *reads* from its neighbours and *writes*
its own memory, so cells never conflict.

If $\mathbf x - \mathbf c_i$ is a solid cell, nothing can come from there. Instead the population that
left $\mathbf x$ towards the wall (direction $\bar\imath$, opposite to $i$) is reflected straight back:

$$f_i(\mathbf x, t+1) = f^{*}_{\bar\imath}(\mathbf x, t).$$

This is **halfway bounce-back**: the reflection takes one full step, so the no-slip wall effectively sits
halfway between the fluid and solid nodes. Streaming only moves populations around, so the fluid's mass is
conserved exactly, as the check below shows.
""", code=r'''
f0 = lbm.init_flow(solid)
_rng = np.random.default_rng(0)
f_test = f0 * (1 + 0.01 * _rng.standard_normal(f0.shape))     # perturbed state
f_test[:, solid] = lbm.W[:, None]
_m0 = f_test[:, ~solid].sum()
for _n in range(20):
    f_test = lbm.stream_pull(f_test, solid)
print(f"fluid mass before {_m0:.12f}")
print(f"fluid mass after 20 streaming steps {f_test[:, ~solid].sum():.12f}")
'''),

dict(title="Collision: two relaxation times and a body force", md=r"""
The **collision** relaxes the populations towards equilibrium. In the simplest (BGK) model all relax at
one rate $\omega = 1/\tau$. The two-relaxation-time (**TRT**) model splits each pair of opposite populations
into a symmetric and an antisymmetric part, $f_i^\pm = (f_i \pm f_{\bar\imath})/2$, and relaxes them
at separate rates:

$$f_i^* = f_i - \omega^+\,(f_i^+ - f_i^{\mathrm{eq}+}) - \omega^-\,(f_i^- - f_i^{\mathrm{eq}-})
 + \left(1-\tfrac{\omega^+}{2}\right)S_i^+ + \left(1-\tfrac{\omega^-}{2}\right)S_i^-.$$

- $\omega^+ = 1/\tau$ sets the viscosity.
- $\omega^-$ follows from the "magic" combination $\Lambda = (1/\omega^+-\frac12)(1/\omega^--\frac12)$. At fixed $\Lambda$
  the steady flow does not depend on $\nu$. $\Lambda = 3/16$ also puts the bounce-back wall exactly halfway
  between nodes (Theory §5).

The flow is driven by a uniform **body force** $g$ per unit volume. It plays the role of the pressure
gradient $-\mathrm dp/\mathrm dx$, so the domain can be periodic in $x$. Guo's scheme adds it through the
source $S_i = w_i[3(\mathbf c_i-\mathbf u) + 9(\mathbf c_i\cdot\mathbf u)\mathbf c_i]\cdot\mathbf F$ and through
the velocity $\mathbf u = (\sum_i f_i\mathbf c_i + \mathbf F/2)/\rho$.

Check: a collision conserves mass exactly and changes the momentum by exactly $\mathbf F$ per step.
""", code=r'''
wp, wm = lbm.trt_rates(p["tau"])
print(f"omega+ = {wp:.4f},  omega- = {wm:.4f}   (magic Lambda = {(1 / wp - .5) * (1 / wm - .5):.3f})")
_g = 1e-4
_rho, _ux, _uy = lbm.moments(f_test, _g)
_fc = lbm.collide_trt(f_test, _rho, _ux, _uy, wp, wm, _g)
_fl = ~solid
print("mass change in collision     :", (_fc.sum(0) - f_test.sum(0))[_fl].max())
_px0 = (f_test * cx[:, None, None]).sum(0)
_px1 = (_fc * cx[:, None, None]).sum(0)
print("x-momentum change (should = g):", (_px1 - _px0)[_fl].mean(), " g =", _g)
'''),

dict(title="Validation: plane Poiseuille flow, BGK vs TRT", md=r"""
Before trusting the solver with a packed bed, test it where the answer is known. A channel bounded by two
walls (rows 0 and $n_y-1$) and driven by $g$ has the parabolic profile

$$u(y) = \frac{g}{2\nu}\,(y - y_0)(y_1 - y),$$

with the no-slip planes $y_0$, $y_1$ halfway between the wall nodes and the first fluid nodes.

- **TRT** with $\Lambda = 3/16$ reproduces the parabola to within the convergence of the run, for every $\tau$.
- With **BGK** the wall drifts: the error grows like $(\tau - \frac12)^2$, so the flow rate, and later the
  permeability, depend on the viscosity. That is unphysical.
""", code=r'''
_ny = 18
_ch = lbm.make_bed(4, _ny, layout="empty", walls=True)[0]
_ys = np.arange(_ny) + 0.5
_traces = []
for _tau, _magic, _name in [(1.0, 3 / 16, "TRT tau=1.0"), (2.0, 3 / 16, "TRT tau=2.0"), (2.0, None, "BGK tau=2.0")]:
    _r = lbm.run_flow(_ch, tau=_tau, g=1e-6, steps=4000, magic=_magic, walls=True, record_every=2500)
    _ue, _ = lbm.poiseuille_profile(_ny, lbm.viscosity(_tau), 1e-6)
    _err = np.abs(_r["ux"][1:-1, 0] - _ue[1:-1]).max() / _ue.max()
    print(f"{_name:12s}  max relative error {_err:.2e}")
    _traces.append(dict(type="scatter", mode="markers", x=(_r["ux"][1:-1, 0] / _ue.max()).tolist(),
                        y=_ys[1:-1].tolist(), name=_name))
_yf = np.linspace(1, _ny - 1, 100)
_traces.insert(0, dict(type="scatter", mode="lines", x=((_yf - 1) * (_ny - 1 - _yf) / ((_ny - 2) / 2) ** 2).tolist(),
                       y=_yf.tolist(), name="exact", line=dict(color="#31333f")))
figure(_traces, title="Poiseuille profile u / u_max(exact)", xaxis=dict(title="u / u_max"),
       yaxis=dict(title="y [cells]"))
'''),

dict(title="Flow through the bed", md=r"""
Now the real geometry. Starting from rest, the body force accelerates the fluid until wall friction on the
particles balances it. The flow spreads from the pores in about one viscous time $d^2/\nu$.

We track the **permeability** through Darcy's law, with the body force in the role of the pressure gradient:

$$U_s = \frac{k}{\mu}\,g\quad\Longrightarrow\quad k = \frac{\nu\,U_s}{g},$$

where $U_s$ is the **superficial** velocity: the mean of $u_x$ over the whole domain, solid included. When $k$
stops changing, the flow is steady.

The velocity map shows **channeling**: most of the flow goes through a few connected wide pores, while the
fluid in narrow throats and behind particles barely moves.
""", code=r'''
g = 1e-5
res = lbm.run_flow(solid, tau=p["tau"], g=g, steps=1200, walls=p["walls"], record_every=50)
ux, uy = res["ux"], res["uy"]
k = res["k"][-1]
Us = lbm.superficial_velocity(ux, p["walls"])
speed = np.where(solid, np.nan, np.hypot(ux, uy))
print(f"k = {k:.4f} cells^2,  k/d^2 = {k / d_mean ** 2:.5f}")
print(f"last change of k over 50 steps: {abs(res['k'][-1] / res['k'][-2] - 1):.1e}")
print(f"superficial U_s = {Us:.3e},  max |u| = {np.nanmax(speed):.3e}  ({np.nanmax(speed) / Us:.1f} x U_s)")
figure([dict(type="scatter", x=res["t"].tolist(), y=(res["k"] / d_mean ** 2).tolist(), mode="lines+markers")],
       title="Convergence of k/d^2", xaxis=dict(title="time step"), yaxis=dict(title="k / d^2"))
figure([dict(type="heatmap", z=np.round(speed / Us, 3).tolist(), colorscale="Viridis",
             colorbar=dict(title="|u|/U_s"))],
       title="Speed relative to the superficial velocity", height=300,
       xaxis=dict(title="x [cells]", constrain="domain"), yaxis=dict(title="y", scaleanchor="x"))
'''),

dict(title="Comparing with Kozeny–Carman, and checking the solver on an ordered array", md=r"""
**Kozeny–Carman** treats the pore space as a bundle of tortuous capillaries with hydraulic radius
$r_h = \varepsilon/(a_s(1-\varepsilon))$. The result is

$$k = \frac{\varepsilon^3}{K\,a_s^2\,(1-\varepsilon)^2}.$$

For spheres ($a_s = 6/d$) and $K = 150/36 \approx 4.2$ this is exactly the viscous term of Ergun's equation.
A 2D bed of disks is more tortuous than a 3D packing, because the fluid cannot go *around* a particle in the
third dimension. Its Kozeny constant is therefore larger, so we measure it.

To check the solver independently, we also compute a **square array of cylinders**. For this geometry,
accurate results exist: Sangani & Acrivos for dilute arrays, and Gebart's lubrication model (good to about 10 %) for dense ones.
""", code=r'''
if disks:
    K2D = lbm.fit_kozeny_constant(k, eps, a_s)
    print(f"this bed: eps = {eps:.3f}, k/d^2 = {k / d_mean**2:.5f}, fitted Kozeny constant K = {K2D:.2f}"
          f"  (spheres: 4.17)")
    print(f"          Kozeny-Carman with K = 4.17 would give k/d^2 = "
          f"{lbm.kozeny_carman(eps, d_mean, a_s, 150/36) / d_mean**2:.5f}")
else:
    print("no particles: k is the channel's own permeability")
print()
print("square array of cylinders, D = 16:")
for _e in (0.8, 0.5):
    _a = 16 * np.sqrt(np.pi / (4 * (1 - _e)))
    _n = int(round(_a))
    _sq, _dk = lbm.make_bed(_n, _n, _e, 16, layout="square")
    _es, _d = lbm.porosity_of(_sq), _dk[0][2]
    _r = lbm.run_flow(_sq, tau=1.0, g=1e-6, steps=2500, record_every=2500)
    print(f"  eps {_es:.3f}: LBM k/d^2 = {_r['k'][-1] / _d**2:.5f},  Sangani-Acrivos {lbm.sangani_acrivos_square(_es, _d) / _d**2:.5f},"
          f"  Gebart {lbm.gebart_square(_es, _d) / _d**2:.5f}")
'''),

dict(title="A tracer pulse", md=r"""
To measure the **residence-time distribution** (RTD), a short pulse of tracer is released at the inlet
($x = 0$). The tracer obeys the advection–diffusion equation

$$\frac{\partial c}{\partial t} + \mathbf u\cdot\nabla c = D_m\nabla^2 c,$$

which is solved with a second, five-velocity lattice (D2Q5) on the same grid. The tracer does not enter the
particles, which are bounce-back walls for it too.

Two **detectors** record the flow-weighted (cup-mixing) concentration $\bar c = \sum u_x c / \sum u_x$ across
the columns at $x = 2d$ and $x = L_x - 2d$.

Creeping flow is linear in the driving force. The converged field is therefore simply rescaled to the chosen
interstitial velocity, and only the tracer is advanced. The molecular Péclet number is
$Pe_m = u\,d/D_m$, with $u$ the interstitial velocity.
""", code=r'''
u_int = p["u_tracer"]
scale = u_int * eps / Us                    # interstitial velocity u = U_s / eps
uxt, uyt = ux * scale, uy * scale
Dm = u_int * d_mean / p["Pe_m"]
x1, x2 = int(round(2 * p["D"])), int(round(nx - 2 * p["D"]))
pulse = 10
n_steps = int(2.0 * (x2 / u_int))
print(f"interstitial u = {u_int},  D_m = {Dm:.4f}  (Pe_m = {p['Pe_m']:g}),  max |u| = {np.hypot(uxt, uyt).max():.3f}")
print(f"detectors at x = {x1} and {x2},  pulse of {pulse} steps,  running {n_steps} steps")
tt, (c1, c2) = lbm.run_tracer(solid, uxt, uyt, Dm, steps=n_steps, pulse_steps=pulse,
                              detectors=[x1, x2], record_every=5)
figure([dict(type="scatter", x=tt.tolist(), y=c1.tolist(), name=f"detector x={x1}"),
        dict(type="scatter", x=tt.tolist(), y=c2.tolist(), name=f"detector x={x2}")],
       title="Cup-mixing concentration at the detectors", xaxis=dict(title="time step"),
       yaxis=dict(title="c / c_pulse"))
'''),

dict(title="RTD analysis: moments, dispersion and tanks in series", md=r"""
Normalising a detector signal gives the RTD, $E(t) = c(t)/\int c\,\mathrm dt$. Its mean $\bar t$ and variance
$\sigma^2$ are what models are fitted to.

- **Long tails** come from fluid trapped behind particles. The variance is very sensitive to them, so the
  tail is extrapolated as an exponential beyond the last sample.
- **Pulse correction:** a square pulse of width $t_p$ adds $t_p/2$ to the mean and $t_p^2/12$ to the variance.

Between two planes inside the bed, the **axial dispersion model** gives

$$\frac{\Delta\sigma^2}{\Delta\bar t^{\,2}} = \frac{2}{Pe},\qquad Pe = \frac{u\,\Delta x}{D_L},$$

independent of what happens at the inlet and outlet. The **tanks-in-series** model with
$N = \Delta\bar t^{\,2}/\Delta\sigma^2$ has the same variance. The plot compares the measured
$E(\theta)$ at the second detector with both models, in dimensionless time $\theta = t/\bar t$.
""", code=r'''
E1, m1, v1 = lbm.rtd_moments(tt, c1, pulse)
E2, m2, v2 = lbm.rtd_moments(tt, c2, pulse)
fit = lbm.fit_dispersion(m1, v1, m2, v2, x2 - x1)
print(f"detector 1: mean {m1:8.1f}  variance {v1:10.1f}")
print(f"detector 2: mean {m2:8.1f}  variance {v2:10.1f}")
print(f"interstitial velocity from the moments {fit['u']:.4f}  (imposed {u_int})")
print(f"Pe = u dx / D_L = {fit['Pe']:.2f},  tanks in series N = {fit['N']:.2f}")
print(f"D_L = {fit['D_L']:.4f} = {fit['D_L'] / Dm:.1f} x D_m;  particle Peclet u d / D_L = {u_int * d_mean / fit['D_L']:.2f}")
_th = tt / m2
_tf = np.linspace(0.02, _th.max(), 300)
_Pe2, _N2 = 2 * m2 ** 2 / v2, m2 ** 2 / v2
figure([dict(type="scatter", x=_th.tolist(), y=(E2 * m2).tolist(), name="LBM (detector 2)", line=dict(width=3)),
        dict(type="scatter", x=_tf.tolist(), y=lbm.E_dispersion(_tf, _Pe2).tolist(), name=f"dispersion, Pe = {_Pe2:.1f}",
             line=dict(dash="dash")),
        dict(type="scatter", x=_tf.tolist(), y=lbm.E_tanks(_tf, _N2).tolist(), name=f"tanks in series, N = {_N2:.1f}",
             line=dict(dash="dot"))],
       title="E(theta) at the second detector vs. models with the same variance",
       xaxis=dict(title="theta = t / mean"), yaxis=dict(title="E(theta)"))
'''),

dict(title="Back to physical units", md=r"""
Dimensionless results carry over to a real bed by matching the groups. Take particles of diameter $d_p$ and a
liquid of kinematic viscosity $\nu$ (water: $10^{-6}$ m²/s):
- **Permeability.** $k = (k/d^2)\,d_p^2$.
- **Pressure gradient.** The pressure gradient for a superficial velocity $U$ is $\mu U/k$ while flow is creeping.
- **Time.** One lattice step corresponds to $\Delta t = \nu_{\text{lattice}}\,\Delta x^2/\nu$.
  The "viscous" matching is exact for creeping flow, where only $Re$ and $Pe$ matter, not the absolute speed.

At higher Reynolds numbers inertia adds Ergun's quadratic (Burke–Plummer) term, $1.75\,\rho U^2(1-\varepsilon)/(\varepsilon^3 d)$
for spheres. The App tab's *Permeability* view sweeps $Re$ on the GPU to show that departure from Darcy's law.
""", code=r'''
dp = p["d_p_mm"] * 1e-3
nu_SI = p["nu_SI"]
k_SI = k / d_mean ** 2 * dp ** 2
dx = dp / d_mean
dt = nu * dx ** 2 / nu_SI
print(f"d_p = {dp * 1e3:g} mm:  k = {k_SI:.3e} m^2  ({k_SI / 9.869e-13:.0f} darcy)")
print(f"lattice: dx = {dx * 1e6:.0f} um, dt = {dt * 1e3:.3f} ms per step")
_U = 1e-3                                  # 1 mm/s superficial
print(f"at U = 1 mm/s: dp/dx = {1000 * nu_SI * _U / k_SI:.0f} Pa/m (Darcy, rho = 1000 kg/m^3),"
      f"  Re_p = {_U * dp / nu_SI:.1f}")
print(f"Ergun (spheres, same eps): {lbm.ergun_gradient(_U, eps, dp, 1000 * nu_SI, 1000.0):.0f} Pa/m")
'''),
]
