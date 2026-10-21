"""Step-by-step breakdown of the Python reference implementation (3D page).

CELLS is a list of {"title", "md", "code"} dicts.  The page shows each cell's explanation
(Markdown + LaTeX), its code and the output produced by running it with CPython at build time;
make_molab.py turns the same cells into the MoLab notebook.  Cells share one namespace, like a
notebook.

Inside the cells
  * lbm3d, fv3d, diagnostics are the real modules (python/lbm3d.py, fv3d.py, diagnostics.py);
  * print() goes to the step's output box;
  * figure(traces, **layout) records a Plotly figure (traces = plain dicts, so no plotting library
    is needed).  Only call figure() at the top level of a cell (make_molab.py rewrites those lines);
  * USER_INPUTS (dict) overrides the defaults of the first cell.  The build runs with {}.

Rules that keep the notebook valid (marimo wants one definition per global name):
  * every global is assigned in exactly one cell; loop variables and scratch values start with "_";
  * state objects (the dicts returned by init_state) are never mutated by a later cell, a cell that
    wants to advance one makes its own copy first.

Sizes: the defaults (N = 32, Nz = 8) are chosen so that every cell runs in seconds in CPython and in
Pyodide.  The page's live solvers use bigger grids.
"""

CELLS = [
# =====================================================================================================
dict(title="Inputs, units and the time step", md=r"""
**What this page's Python does.** `lbm3d.py` (lattice Boltzmann) and `fv3d.py` (finite volumes) are two
independent ways of solving the same problem: a cylinder of radius $R$ that **spins** about its own axis
(surface speed $U_s=\Omega R$) while its centre **orbits** the middle of a unit box (speed $U_o=\omega_o r_o$),
the axis pointing along $z$. The box walls in $x,y$ are no-slip. In $z$ the flow is either *periodic* (the
cylinder is infinitely long) or bounded by two stationary no-slip walls (*walls*). `diagnostics.py` measures
the result in the same way for both solvers.

**Dimensionless numbers.** Lengths are in box widths ($L=1$) and speed in units of $U_{ref}=\max(|U_s|,|U_o|)$.
The viscosity follows from the Reynolds number built on the cylinder diameter,

$$Re=\frac{U_{ref}\,2R}{\nu}.$$

**The grid.** $N$ cells across the box, $N_z$ cells along $z$, all cubes of side $h=1/N$, so the span is
$L_z=N_z h$. $N_z=1$ is the **2D baseline** (nothing can vary in $z$); the rest of the page compares it with
$N_z>1$.

**Two time steps, one physical problem.** Each method has its own natural $\Delta t$:
- *Finite volumes* is explicit, so $\Delta t$ must satisfy an advection limit (a fluid parcel may not cross more
  than a fraction CFL of a cell per step) and a diffusion limit (viscous smoothing must not overshoot).
  The code adds the two reciprocals: $\Delta t=1/(1/\Delta t_{adv}+1/\Delta t_{diff})$.
- *Lattice Boltzmann* has $\Delta t$ tied to the lattice: the fastest point of the body moves $u_{lb}$
  cells per step (default 0.05), which keeps the lattice Mach number low. The viscosity in lattice units is
  $\nu_{lb}=\nu\,\Delta t/h^2$ and the relaxation time is $\tau=3\nu_{lb}+\tfrac12$.

Everything printed below is computed from `make_params`. **Sizes:** `USER_INPUTS` is empty on the page, so
these defaults ($N=32$, $N_z=8$) apply; the live solvers on the page run bigger grids. The demonstrations of
the individual steps use a thin slab of four layers ($N_z=4$, the smallest span that still gets the 3D seed)
because every $z$-plane is treated identically; the 2D-versus-3D experiment at the end uses the full $N_z$.
""", code=r'''
import numpy as np
import lbm3d
import fv3d
import diagnostics

inp = dict(N=32, Nz=8, Re=200.0, R=0.1, ro=0.2, Us=1.0, Uo=0.5, span="periodic", seed=1e-3,
           method="fv", T_end=3.0)
inp.update(USER_INPUTS)       # method: "fv" or "lbm" (the experiment at the end); T_end: its duration

common = {k: inp[k] for k in ("N", "Re", "R", "ro", "Us", "Uo")}
NZ_SLAB = 4                                         # thin slab for the demonstrations (4 layers: smallest span with a seed)
pl = lbm3d.make_params(Nz=NZ_SLAB, seed=inp["seed"], **common)
pf = fv3d.make_params(Nz=NZ_SLAB, seed=inp["seed"], **common)

print(f"grid {pl['N']} x {pl['N']} x Nz, h = {pl['h']:.5f}")
print(f"nu = {pl['nu']:.3e}   spin Omega = {pl['Omega']:.2f} rad/time   orbit omega_o = {pl['omega_o']:.2f} rad/time")
print(f"fastest body point U_max = {abs(pl['Us']) + abs(pl['omega_o']) * (pl['ro'] + pl['R']):.3f}")
print(f"FV : dt = {pf['dt']:.3e}   (advection limit {pf['dt']:.2e} is combined with diffusion limit)")
print(f"LBM: dt = {pl['dt']:.3e}   u_lb = {pl['u_lb']}  ->  lattice Mach number u_lb*sqrt(3) = {pl['u_lb'] * np.sqrt(3):.3f}")
print(f"LBM: nu_lb = {pl['nu_lb']:.4f}   tau = {pl['tau']:.4f}   omega = 1/tau = {pl['omega']:.4f}   collision = {pl['collision']}")
print(f"LBM needs {pf['dt'] / pl['dt']:.1f} times as many steps as FV for the same physical time")
'''),

# =====================================================================================================
# LATTICE BOLTZMANN
# =====================================================================================================
dict(title="LBM 1: the D3Q19 lattice and its weights", md=r"""
**Idea.** Instead of tracking velocity and pressure directly, lattice Boltzmann tracks how much of the
fluid is *moving in each of a few fixed directions*. At every grid node we store 19 numbers $f_q$, the
"populations", one for each lattice velocity $\mathbf c_q$: staying put ($q=0$), moving to one of the 6 face
neighbours, or to one of the 12 edge neighbours (this is the **D3Q19** set: 3 dimensions, 19 velocities).
After one time step a population has moved exactly one node along its own direction, which is why the scheme
is so simple to code and so easy to run in parallel.

Each direction carries a **weight** $w_q$: $1/3$ for the rest population, $1/18$ for the 6 face directions,
$1/36$ for the 12 edge directions. The weights are chosen so that sums over the 19 directions behave as if the
velocities were spread isotropically (the same in every direction), up to the order the physics needs:

$$\sum_q w_q=1,\qquad \sum_q w_q c_{q\alpha}=0,\qquad \sum_q w_q c_{q\alpha}c_{q\beta}=c_s^2\,\delta_{\alpha\beta},$$

$$\sum_q w_q c_{q\alpha}c_{q\beta}c_{q\gamma}=0,\qquad
\sum_q w_q c_{q\alpha}c_{q\beta}c_{q\gamma}c_{q\delta}=c_s^4(\delta_{\alpha\beta}\delta_{\gamma\delta}+\delta_{\alpha\gamma}\delta_{\beta\delta}+\delta_{\alpha\delta}\delta_{\beta\gamma}),$$

with the lattice "speed of sound" $c_s^2=1/3$ (in lattice units). Geometrically: the first sum says the weights
add to one; the second that the lattice has no preferred drift; the third that the lattice looks the same
along $x$, $y$ and $z$ (a sphere of velocities, not a cube); the fourth is what lets the lattice reproduce the
fluid's viscous stress with the right symmetry. The code below computes each sum and prints how far it is from
the exact value. `OPP[q]` is the index of the opposite direction (needed for bounce-back).
""", code=r'''
print(" q  c_q           w_q      opposite")
for _q in range(19):
    print(f"{_q:2d}  {str(tuple(int(v) for v in lbm3d.C[_q])):<13} {lbm3d.W[_q]:.5f}  {lbm3d.OPP[_q]}")

_w, _c, _cs2, _I = lbm3d.W, lbm3d.C.astype(float), lbm3d.CS2, np.eye(3)
_d4 = _cs2 ** 2 * (np.einsum("ab,cd->abcd", _I, _I) + np.einsum("ac,bd->abcd", _I, _I) + np.einsum("ad,bc->abcd", _I, _I))
iso_err = {
    "sum w - 1": abs(_w.sum() - 1),
    "sum w c": np.abs(_w @ _c).max(),
    "sum w c c - cs2 delta": np.abs(np.einsum("q,qa,qb->ab", _w, _c, _c) - _cs2 * _I).max(),
    "sum w c c c": np.abs(np.einsum("q,qa,qb,qc->abc", _w, _c, _c, _c)).max(),
    "sum w c c c c - cs4 (delta delta + ...)": np.abs(np.einsum("q,qa,qb,qc,qd->abcd", _w, _c, _c, _c, _c) - _d4).max(),
}
print()
for _name, _err in iso_err.items():
    print(f"{_name:42s} max error = {_err:.1e}")
print("OPP is the opposite direction:", bool(np.all(lbm3d.C[lbm3d.OPP] == -lbm3d.C)))

_x, _y, _z, _t = [], [], [], []
for _q in range(1, 19):
    _x += [0, *lbm3d.C[_q][:1], None]; _y += [0, *lbm3d.C[_q][1:2], None]; _z += [0, *lbm3d.C[_q][2:3], None]
figure([dict(type="scatter3d", mode="lines", x=_x, y=_y, z=_z, line=dict(width=4, color="#7a8"), name="c_q"),
        dict(type="scatter3d", mode="markers+text", x=lbm3d.C[:, 0], y=lbm3d.C[:, 1], z=lbm3d.C[:, 2],
             text=[str(q) for q in range(19)], textposition="top center",
             marker=dict(size=6 + 80 * lbm3d.W ** 1.0, color=lbm3d.W, colorscale="Viridis", showscale=True,
                         colorbar=dict(title="w_q")), name="nodes")],
       title="The 19 lattice velocities (marker size and colour = weight)", showlegend=False,
       scene=dict(aspectmode="cube", xaxis=dict(title="cx"), yaxis=dict(title="cy"), zaxis=dict(title="cz")))
'''),

# =====================================================================================================
dict(title="LBM 2: equilibrium and its moments", md=r"""
**Density and velocity are sums over populations.** At each node

$$\rho=\sum_q f_q,\qquad \rho\,\mathbf u=\sum_q \mathbf c_q f_q ,$$

i.e. density is the total amount of "stuff", and momentum is the sum of the stuff times its direction. The
function `macroscopic` is exactly this.

**Equilibrium.** If nothing disturbed the fluid, collisions would drive the populations to the distribution a
gas in local thermal equilibrium would have, a small tilt of the weights towards the flow direction:

$$f^{eq}_q=w_q\,\rho\Big(1+3\,\mathbf c_q\!\cdot\!\mathbf u+\tfrac92(\mathbf c_q\!\cdot\!\mathbf u)^2-\tfrac32\,\mathbf u\!\cdot\!\mathbf u\Big).$$

At rest ($\mathbf u=0$) it is just $w_q\rho$. With a flow, populations pointing along $\mathbf u$ ($\mathbf c_q\cdot\mathbf u>0$)
get bigger and the ones pointing against it get smaller; the quadratic terms add the correction that makes the
*momentum flux* come out right:

$$\sum_q \mathbf c_q f^{eq}_q=\rho\mathbf u,\qquad \sum_q c_{q\alpha}c_{q\beta}f^{eq}_q=\rho\,c_s^2\delta_{\alpha\beta}+\rho\,u_\alpha u_\beta .$$

The first term of the flux is the pressure $p=\rho c_s^2$ (the lattice has an equation of state: pressure is
proportional to density, so this is a *weakly compressible* method), the second is the convective momentum
transport $\rho u_\alpha u_\beta$. The code builds $f^{eq}$ for a made-up node and checks all these moments. The
bar chart shows how the 19 populations tilt.
""", code=r'''
rho0 = 1.1
u0 = np.array([0.05, 0.02, -0.03])
feq0 = lbm3d.equilibrium(np.full((1, 1, 1), rho0), u0.reshape(3, 1, 1, 1))      # shape (19, 1, 1, 1)

rho_back, u_back = lbm3d.macroscopic(feq0)
Pi_eq = np.einsum("qa,qb,q->ab", lbm3d.C, lbm3d.C, feq0[:, 0, 0, 0])
Pi_exact = rho0 * (lbm3d.CS2 * np.eye(3) + np.outer(u0, u0))
print(f"density  from f_eq: {rho_back[0, 0, 0]:.12f}   (input {rho0})")
print(f"velocity from f_eq: {u_back[:, 0, 0, 0]}   (input {u0})")
print(f"max |momentum flux - rho (cs2 delta + u u)| = {np.abs(Pi_eq - Pi_exact).max():.1e}")
print(f"populations: smallest {feq0.min():.5f}, largest {feq0.max():.5f}, at rest w_0 rho = {rho0 / 3:.5f}")

figure([dict(type="bar", x=list(range(19)), y=feq0[:, 0, 0, 0] - lbm3d.W * rho0, name="f_eq - w rho")],
       title="How the flow tilts the 19 populations (equilibrium minus the at-rest value w_q rho)",
       xaxis=dict(title="direction q"), yaxis=dict(title="f_eq - w_q rho"))
'''),

# =====================================================================================================
dict(title="LBM 3: collision (regularised)", md=r"""
**Collision relaxes the populations towards equilibrium.** Write $f_q=f^{eq}_q+f^{neq}_q$, with the
*non-equilibrium part* $f^{neq}$ carrying everything that is not yet in local equilibrium (viscous stresses
in particular). The simplest collision (BGK) shrinks it by a fixed fraction each step,

$$f^*_q=f_q-\omega\,(f_q-f^{eq}_q),\qquad \omega=\frac1\tau,\quad \nu_{lb}=c_s^2\Big(\tau-\tfrac12\Big).$$

So $\tau$ sets the viscosity: a larger $\tau$ relaxes more slowly and the fluid is more viscous. Mass and
momentum are conserved by construction ($\rho$ and $\mathbf u$ are the same for $f^{eq}$ and $f$).

**Regularisation.** Of the 19 numbers in $f^{neq}$ only the **second moment** (the viscous stress tensor
$\Pi^{neq}_{\alpha\beta}=\sum_q c_{q\alpha}c_{q\beta}f^{neq}_q$, 6 independent numbers) matters for the
Navier-Stokes equations. The rest ("ghost" modes) is lattice noise that can blow up at low viscosity. The
*regularised* collision (Latt & Chopard) rebuilds the non-equilibrium part from the stress alone:

$$f^{neq,reg}_q=\frac{w_q}{2c_s^4}\Big(c_{q\alpha}c_{q\beta}-c_s^2\delta_{\alpha\beta}\Big)\Pi^{neq}_{\alpha\beta},\qquad
f^*_q=f^{eq}_q+(1-\omega)\,f^{neq,reg}_q .$$

It is a projection (it deletes the ghost modes) followed by the same relaxation. The check below uses a node
with random non-equilibrium noise: both collisions must conserve $\rho$ and $\rho\mathbf u$ and shrink the
stress by exactly $(1-\omega)$, but only the regularised one also removes the ghost part of the noise.
The last printout splits the noise into the part the regularisation keeps and the part it removes; the two are
orthogonal in the lattice's natural norm (weights $1/w_q$), so their sizes obey Pythagoras.
`DEFAULT_COLLISION` in the module says which one the page uses by default (an MRT variant also exists in the code).
""", code=r'''
_rng = np.random.default_rng(0)
f_pre = feq0 + 0.003 * _rng.standard_normal(feq0.shape)            # an equilibrium node plus noise
rho_pre, u_pre = lbm3d.macroscopic(f_pre)
_feq = lbm3d.equilibrium(rho_pre, u_pre)

f_bgk = lbm3d.collide(f_pre, dict(pl, collision="bgk"))
f_reg = lbm3d.collide(f_pre, dict(pl, collision="reg"))

def _stress(f):
    return np.einsum("qa,qb,q->ab", lbm3d.C, lbm3d.C, f[:, 0, 0, 0] - _feq[:, 0, 0, 0])

print(f"default collision: {lbm3d.DEFAULT_COLLISION};  tau = {pl['tau']:.4f},  omega = {pl['omega']:.4f}")
for _name, _f in (("BGK", f_bgk), ("regularised", f_reg)):
    _rho, _u = lbm3d.macroscopic(_f)
    print(f"{_name:12s} |d rho| = {abs(_rho - rho_pre).max():.1e}   |d u| = {np.abs(_u - u_pre).max():.1e}   "
          f"max|stress_after - (1-omega) stress_before| = {np.abs(_stress(_f) - (1 - pl['omega']) * _stress(f_pre)).max():.1e}")

_fneq = f_pre - _feq
_fneq_reg = (f_reg - _feq) / (1 - pl["omega"])                     # the part the regularisation keeps
_wn = lambda a: float(np.sqrt(np.sum(a[:, 0, 0, 0] ** 2 / lbm3d.W)))        # the lattice's natural norm, weights 1/w_q
print(f"sizes in the weighted norm sqrt(sum f^2/w): noise {_wn(_fneq):.3e} = sqrt(kept {_wn(_fneq_reg):.3e}^2 + removed {_wn(_fneq - _fneq_reg):.3e}^2)"
      f" = {np.hypot(_wn(_fneq_reg), _wn(_fneq - _fneq_reg)):.3e}")

figure([dict(type="bar", x=list(range(19)), y=_fneq[:, 0, 0, 0], name="f_neq (all of it)"),
        dict(type="bar", x=list(range(19)), y=_fneq_reg[:, 0, 0, 0], name="kept by regularisation")],
       title="Non-equilibrium part of one node's populations", barmode="group",
       xaxis=dict(title="direction q"), yaxis=dict(title="f_neq"))
'''),

# =====================================================================================================
dict(title="LBM 4: streaming", md=r"""
**Free flight.** After the collision every population moves one lattice link along its own velocity:

$$f_q(\mathbf x+\mathbf c_q,\;t+1)=f^*_q(\mathbf x,\;t).$$

Nothing else happens in this step, so it conserves mass exactly and is just a *shift* of whole arrays.
`stream` does it with `np.roll` (shift with wrap-around), one array shift per direction. The wrap-around means
that a population leaving through the right side of the box re-enters on the left. That is wrong for a box with
walls, but those wrapped populations are overwritten in the next step (halfway bounce-back, next cell).

This step is also the reason the method is so parallel-friendly: each node only reads from and writes to its
own neighbours, so all nodes can be processed at the same time. The GPU shader fuses collision and streaming in
one kernel (the "push" form).

The check puts one unit of population in every direction at the same node and watches where each lands.
""", code=r'''
f_pulse = np.zeros((19, 2, 6, 6))                  # a tiny box: (q, k, j, i)
f_pulse[:, 0, 2, 2] = 1.0                          # one unit in every direction at node (k=0, j=2, i=2)
f_moved = lbm3d.stream(f_pulse)

print(" q  c_q            lands at (k, j, i)   expected")
_ok = True
for _q in range(19):
    _land = tuple(int(v) for v in np.argwhere(f_moved[_q])[0])
    _exp = ((0 + lbm3d.C[_q][2]) % 2, (2 + lbm3d.C[_q][1]) % 6, (2 + lbm3d.C[_q][0]) % 6)
    _ok &= _land == tuple(int(v) for v in _exp)
    print(f"{_q:2d}  {str(tuple(int(v) for v in lbm3d.C[_q])):<14} {str(_land):<20} {tuple(int(v) for v in _exp)}")
print("all 19 landed where c_q says:", _ok, "   total population before/after:", f_pulse.sum(), f_moved.sum())

_edge = np.zeros((19, 1, 1, 6)); _edge[1, 0, 0, 5] = 1.0           # a +x population at the last column
print("wrap-around: +x population at i = 5 lands at i =", int(np.argwhere(lbm3d.stream(_edge)[1])[0][-1]))

_ax, _ay = [], []
for _q in range(1, 19):
    if lbm3d.C[_q][2] == 0:
        _ax += [2, 2 + lbm3d.C[_q][0], None]; _ay += [2, 2 + lbm3d.C[_q][1], None]
figure([dict(type="scatter", mode="lines+markers", x=_ax, y=_ay, line=dict(color="#4a7"), marker=dict(size=7)),
        dict(type="scatter", mode="markers", x=[2], y=[2], marker=dict(size=14, color="#c33"))],
       title="Streaming in the x-y plane: the 8 in-plane populations leave node (2, 2)", showlegend=False,
       xaxis=dict(title="i (x)", dtick=1, range=[0.5, 3.5]), yaxis=dict(title="j (y)", dtick=1, range=[0.5, 3.5], scaleanchor="x"))
'''),

# =====================================================================================================
dict(title="LBM 5: halfway bounce-back on the box walls", md=r"""
**A wall half a cell away.** The nodes sit at cell centres, so the first node is half a cell from the box wall.
A population that would leave the box does the following instead: it is reflected, and comes back one step
later with its direction reversed. In the code, after the stream shifted everything, the populations at a
boundary node that point *away* from the wall (they would have come from outside) are overwritten by the
post-collision population of the **opposite** direction at the same node:

$$f_{\bar q}(\mathbf x_b,\;t+1)=f^*_q(\mathbf x_b,\;t),\qquad \mathbf c_{\bar q}=-\mathbf c_q .$$

Over one step the population travels half a cell to the wall and half a cell back, so the wall is
exactly midway between the boundary node and the (virtual) node outside, and the velocity is zero there for a
fluid at rest next to it: this is the **no-slip** condition. Mass is conserved exactly, because a reflected
population is just a relabelled copy of one that arrived.

The loop below follows a single +x population (free flight, no collision) towards the right wall of an 8-cell
box. Same rule at $y=0,1$; for `span="walls"` also at $z=0$ and $z=L_z$.
""", code=r'''
pbox = lbm3d.lattice_params(N=8, Nz=2, nu_lb=0.05)
f_box = np.zeros((19, 2, 8, 8))
f_box[1, :, 4, 5] = 1.0                            # +x population at column i = 5, row j = 4, both layers
print("step  populations present at row j=4 (direction q, column i)        total mass")
print(f"   0  {[(int(q), int(i)) for q, i in np.argwhere(f_box[:, 0, 4, :] > 0)]}                  {f_box.sum():.1f}")
for _n in range(1, 5):
    _fpost = f_box.copy()                          # free flight: post-collision = current
    f_box = lbm3d.stream(_fpost)
    lbm3d.bounce_back_walls(f_box, _fpost, pbox)
    print(f"   {_n}  {[(int(q), int(i)) for q, i in np.argwhere(f_box[:, 0, 4, :] > 0)]}                  {f_box.sum():.1f}")
print("q = 1 is +x, q = 2 is -x:  the population reaches the last column, flips direction, and comes back.")
'''),

# =====================================================================================================
dict(title="LBM 6: the cylinder on the lattice, cut links and the Bouzidi fraction q", md=r"""
**The staircase problem.** A circle on a square lattice is a staircase if we only say "this node is inside,
that one is outside". The error is first order in $h$: too crude. Instead we use the *exact* circle.

A **link** is the segment from a fluid node $\mathbf x_f$ to its neighbour $\mathbf x_f+\mathbf c_q$. If the
neighbour is inside the cylinder the link is *cut* by the surface. Its position along the link is the fraction
$s\in(0,1]$ (called $q$ in the literature, here $s$ to avoid a clash with the direction index): the surface is
at $\mathbf x_f+s\,\mathbf c_q$. With $\mathbf d=\mathbf x_f-\mathbf x_{centre}$ the cut is where
$|\mathbf d+s\,\mathbf c_{q,xy}|=R$, a quadratic equation in $s$:

$$a s^2+2bs+(|\mathbf d|^2-R^2)=0,\quad a=|\mathbf c_{xy}|^2,\; b=\mathbf d\cdot\mathbf c_{xy},\qquad
s=\frac{-b-\sqrt{b^2-a(|\mathbf d|^2-R^2)}}{a}$$

(the smaller root, because we come from outside). Because the cylinder does not depend on $z$, a link with a
$z$ component has the same $s$ as its $(c_x,c_y)$ projection; links $(0,0,\pm1)$ never leave their plane and
are never cut. `find_links` returns, for every direction $q$, the arrays of fluid-node rows $j$, columns $i$
and fractions $s$.

The figure draws the links of every direction, projected onto the $x$-$y$ plane, near the body: the fluid node, the cut point
(on the exact circle, which is checked numerically), and colour by $s$. Short links have $s<\tfrac12$ (the wall
is close to the fluid node), long ones $s\ge\tfrac12$; the next step treats the two cases differently.
""", code=r'''
Nl = pl["N"]
body0 = lbm3d.make_body(0.0, pl)                   # cylinder at orbit angle phi = 0, lattice units (cells)
solid0 = lbm3d.solid_mask(body0, Nl)
links0 = lbm3d.find_links(body0, ~solid0, Nl)

_x, _y, _s, _lo_x, _lo_y, _hi_x, _hi_y = [], [], [], [], [], [], []
_worst, _n_links = 0.0, 0
for _q in range(1, 19):
    if links0[_q] is None:
        continue
    _jj, _ii, _ss = links0[_q]
    _cx, _cy = lbm3d.C[_q][0], lbm3d.C[_q][1]
    _xw, _yw = _ii + 0.5 + _ss * _cx, _jj + 0.5 + _ss * _cy
    _worst = max(_worst, np.abs(np.hypot(_xw - body0["cx"], _yw - body0["cy"]) - body0["R"]).max() if _jj.size else 0.0)
    _n_links += _jj.size
    for _a, _b, _c, _d, _e in zip(_ii + 0.5, _jj + 0.5, _xw, _yw, _ss):
        (_lo_x if _e < 0.5 else _hi_x).extend([_a, _c, None])
        (_lo_y if _e < 0.5 else _hi_y).extend([_b, _d, None])
    _s.extend(_ss.tolist())
print(f"cylinder: centre ({body0['cx']:.2f}, {body0['cy']:.2f}) cells, radius {body0['R']:.2f} cells, {int(solid0.sum())} solid nodes")
print(f"cut links per direction q: { {q: int(links0[q][0].size) for q in range(1, 19) if links0[q] is not None} }")
print(f"total cut links in one z-plane: {_n_links};  fraction s: min {min(_s):.3f}, max {max(_s):.3f}, "
      f"share with s < 1/2: {np.mean(np.array(_s) < 0.5):.2f}")
print(f"cut points lie on the circle to within {_worst:.1e} cells")

_th = np.linspace(0, 2 * np.pi, 200)
_jj, _ii = np.nonzero(solid0)
figure([dict(type="scatter", mode="lines", x=body0["cx"] + body0["R"] * np.cos(_th), y=body0["cy"] + body0["R"] * np.sin(_th),
             line=dict(color="black"), name="exact circle"),
        dict(type="scatter", mode="markers", x=_ii + 0.5, y=_jj + 0.5, marker=dict(size=5, color="#999"), name="solid nodes"),
        dict(type="scatter", mode="lines", x=_lo_x, y=_lo_y, line=dict(color="#2a7fbb", width=2), name="cut links, s < 1/2"),
        dict(type="scatter", mode="lines", x=_hi_x, y=_hi_y, line=dict(color="#d8541f", width=2), name="cut links, s >= 1/2")],
       title="Cut links of the cylinder (nodes at cell centres; units: cells)",
       xaxis=dict(title="x / h", range=[body0["cx"] - body0["R"] - 3, body0["cx"] + body0["R"] + 3]),
       yaxis=dict(title="y / h", range=[body0["cy"] - body0["R"] - 3, body0["cy"] + body0["R"] + 3], scaleanchor="x"))
'''),

# =====================================================================================================
dict(title="LBM 7: interpolated bounce-back (Bouzidi) on the cut links", md=r"""
**Which population is missing?** After streaming, the fluid node $\mathbf x_f$ next to the body lacks the
population $f_{\bar q}(\mathbf x_f)$ that would have arrived from inside the cylinder (direction $\bar q$ is the
opposite of $q$, the direction of the cut link). Bounce-back provides it from the populations the fluid node has
just sent towards the wall. For $s=\tfrac12$ plain halfway bounce-back is exact: $f_{\bar q}=f^*_q$. For other
cut positions we interpolate (**Bouzidi-Firdaouss-Lallemand**): the wall is at distance $s$ along the link, and we
want the population to behave as if it travelled to the wall and back.

$$f_{\bar q}(\mathbf x_f)=\begin{cases}
2s\,f^*_q(\mathbf x_f)+(1-2s)\,f^*_q(\mathbf x_f-\mathbf c_q)+g, & s<\tfrac12\\[4pt]
\dfrac{1}{2s}f^*_q(\mathbf x_f)+\dfrac{2s-1}{2s}f^*_{\bar q}(\mathbf x_f)+\dfrac{g}{2s}, & s\ge\tfrac12
\end{cases}$$

Picture: if the wall is *close* ($s<\frac12$) the population would have reflected before reaching the node's
position, so we have to look *behind* the node, at $\mathbf x_f-\mathbf c_q$, and extrapolate the incoming
value there; if the wall is *far* ($s\ge\frac12$) the reflected population arrives after more than one step and
we blend the reflected one with the one that stays. The weights always sum to one (printed below), so the
rule reproduces a uniform state and is continuous across $s=\frac12$. The term $g$ is the moving wall
(next cell). If the second fluid node $\mathbf x_f-\mathbf c_q$ is not available (outside the box, or inside the
body) the code falls back to the first-order value $f^*_q(\mathbf x_f)$.

Below, the module's `bounce_back_body` is run on a real state after 10 steps. One cut link with $s<\frac12$ and
one with $s\ge\frac12$ are then recomputed *by hand* from the formula above using only the post-collision
populations, and compared with the module's result. The figure plots the three weights against $s$.
""", code=r'''
s_lbm10 = lbm3d.init_state(pl)                     # a state after 10 steps; later cells only read it
for _ in range(10):
    lbm3d.step(s_lbm10, pl)

_phi = s_lbm10["phi"] + pl["omega_o"] * pl["dt"]
body_b = lbm3d.make_body(_phi, pl)
fluid_b = ~lbm3d.solid_mask(body_b, Nl)
fpost_b = lbm3d.collide(s_lbm10["f"], pl)
f_b = lbm3d.stream(fpost_b)
lbm3d.bounce_back_walls(f_b, fpost_b, pl)
links_b = lbm3d.find_links(body_b, fluid_b, Nl)
f_b_before = f_b.copy()
exchange_b = lbm3d.bounce_back_body(f_b, fpost_b, links_b, fluid_b, body_b, pl)

def _hand(q, j, i, s, k=0):
    cx, cy, cz = (int(v) for v in lbm3d.C[q])
    qb = int(lbm3d.OPP[q])
    ub, vb = body_b["velocity"](i + 0.5 + s * cx, j + 0.5 + s * cy)
    g = -6.0 * lbm3d.W[q] * (cx * ub + cy * vb)
    fq, fqb = fpost_b[q][k, j, i], fpost_b[qb][k, j, i]
    i2, j2, k2 = i - cx, j - cy, (k - cz) % pl["Nz"]
    f2 = fpost_b[q][k2, j2, i2] if (0 <= i2 < Nl and 0 <= j2 < Nl and fluid_b[j2, i2]) else fq
    return 2 * s * fq + (1 - 2 * s) * f2 + g if s < 0.5 else (fq + (2 * s - 1) * fqb + g) / (2 * s)

for _label, _test in (("s < 1/2 ", lambda s: s < 0.5), ("s >= 1/2", lambda s: s >= 0.5)):
    for _q in range(1, 19):
        if links_b[_q] is None:
            continue
        _jj, _ii, _ss = links_b[_q]
        _hit = np.nonzero(_test(_ss))[0]
        if _hit.size:
            _j, _i, _sv = int(_jj[_hit[0]]), int(_ii[_hit[0]]), float(_ss[_hit[0]])
            _mod, _by = f_b[lbm3d.OPP[_q]][0, _j, _i], _hand(_q, _j, _i, _sv)
            print(f"{_label}: q={_q} node (j={_j}, i={_i}) s={_sv:.3f}  module {_mod:.10f}  by hand {_by:.10f}  diff {abs(_mod - _by):.1e}")
            break

_s = np.linspace(0.02, 1.0, 99)
_lo = _s < 0.5
w_here = np.where(_lo, 2 * _s, 1 / (2 * _s))                 # weight of f*_q(x_f)
w_back = np.where(_lo, 1 - 2 * _s, 0 * _s)                   # weight of f*_q(x_f - c_q)
w_flip = np.where(_lo, 0 * _s, (2 * _s - 1) / (2 * _s))      # weight of f*_qbar(x_f)
print(f"weights sum to 1 for every s: max |sum - 1| = {np.abs(w_here + w_back + w_flip - 1).max():.1e}")
figure([dict(type="scatter", x=_s, y=w_here, name="f*_q(x_f)"),
        dict(type="scatter", x=_s, y=w_back, name="f*_q(x_f - c_q)"),
        dict(type="scatter", x=_s, y=w_flip, name="f*_qbar(x_f)")],
       title="Weights of the Bouzidi rule against the cut fraction s",
       xaxis=dict(title="s (distance of the wall along the link)"), yaxis=dict(title="weight"))
'''),

# =====================================================================================================
dict(title="LBM 8: the moving-wall term", md=r"""
**The wall moves.** The cylinder surface at the cut point has a velocity $\mathbf u_w$: the orbit of the
centre plus the spin about it,

$$\mathbf u_w=\omega_o\,\hat{\mathbf z}\times(\mathbf x_c-\mathbf x_{box})+\Omega\,\hat{\mathbf z}\times(\mathbf x_w-\mathbf x_c)$$

(the formula in `make_body`, converted to lattice units). A bounced population must therefore carry the
wall's momentum. Reflecting a population off a wall moving with $\mathbf u_w$ changes its value by

$$g=-2\,w_q\,\rho\,\frac{\mathbf c_q\cdot\mathbf u_w}{c_s^2}=-6\,w_q\,\mathbf c_q\cdot\mathbf u_w\qquad(\rho=1),$$

i.e. twice the equilibrium tilt $w_q\rho\,3\,\mathbf c_q\cdot\mathbf u_w$ (the factor 2 because the population
changes direction: its momentum along $\mathbf c_q$ goes from $+$ to $-$ relative to the wall). The sign makes
the population leaving the wall larger when the wall moves *towards* the fluid ($\mathbf c_{\bar q}$ points
from the wall into the fluid; the wall is pushing).

**A clean check: a moving body in a uniform flow.** If the whole fluid already moves at the same velocity as the
wall, nothing should change: the bounced populations must equal the equilibrium populations of that uniform
flow. Below, every node holds $f^{eq}$ of one velocity, the body is made to move at that very velocity, and the
interpolated bounce-back is applied to all cut links. The result must reproduce $f^{eq}_{\bar q}$ to round-off,
for both branches of the rule. The last line shows how large the error would be without $g$.
""", code=r'''
uw = (0.03, -0.02)                                  # lattice units: a uniform flow and wall velocity
_u3 = np.zeros((3, pl["Nz"], Nl, Nl)); _u3[0], _u3[1] = uw
f_uni = lbm3d.equilibrium(np.ones((pl["Nz"], Nl, Nl)), _u3)
f_uni_new = lbm3d.stream(f_uni)                      # uniform, so the periodic shift changes nothing
body_uni = dict(body_b, velocity=lambda x, y: (uw[0] + 0 * x, uw[1] + 0 * x))
lbm3d.bounce_back_body(f_uni_new, f_uni, links_b, fluid_b, body_uni, pl)

_err, _miss = 0.0, 0.0
for _q in range(1, 19):
    if links_b[_q] is None or links_b[_q][0].size == 0:
        continue
    _jj, _ii, _ss = links_b[_q]
    _qb = lbm3d.OPP[_q]
    _err = max(_err, np.abs(f_uni_new[_qb][:, _jj, _ii] - f_uni[_qb][0, 0, 0]).max())
    _miss = max(_miss, abs(6 * lbm3d.W[_q] * (lbm3d.C[_q][0] * uw[0] + lbm3d.C[_q][1] * uw[1])))
print(f"max |bounced population - f_eq(uniform flow)| over all cut links = {_err:.1e}")
print(f"size of the moving-wall term g (largest |6 w c.u_w|) = {_miss:.1e}, population scale w_q = 1/18 .. 1/36")
_vel = body_b["velocity"](body_b["cx"] + body_b["R"], body_b["cy"])
print(f"body velocity at the surface point on the +x side of the centre: ({_vel[0]:.4f}, {_vel[1]:.4f}) cells/step;"
      f" the fastest body point moves Umax dt/h = {(abs(pl['Us']) + abs(pl['omega_o']) * (pl['ro'] + pl['R'])) * pl['dt'] / pl['h']:.4f} cells/step (= u_lb)")
'''),

# =====================================================================================================
dict(title="LBM 9: refill of nodes the body uncovers", md=r"""
**Nodes that change sides.** When the cylinder moves, some nodes that were inside it become fluid. They hold
only the dummy populations of the body, so before the next collision they need physical values. The
`refill` scheme (after Caiazzo) gives the new node

$$f_q=f^{eq}_q\big(\bar\rho,\;\mathbf u_{body}\big)+\overline{f^{neq}_q},$$

where $\bar\rho$ is the mean density of the neighbouring fluid nodes (the 8 in-plane neighbours that were fluid
both before and after) and $\overline{f^{neq}}$ the mean of *their* non-equilibrium parts. Physically: the fluid
that fills the gap behind the moving body moves with the body (no slip), has the density of its surroundings,
and inherits their viscous stress. Because the mean non-equilibrium part has no mass and no momentum by
construction (each neighbour's $f^{neq}$ is measured relative to its own $\rho$ and $\mathbf u$), the new node's
velocity is *exactly* the body velocity and its density *exactly* $\bar\rho$. The check verifies both on the
nodes uncovered by moving the cylinder 1 cell along its orbit.
""", code=r'''
f_ref = s_lbm10["f"].copy()
_phi_new = s_lbm10["phi"] + 1.0 / (pl["ro"] * Nl)                 # an orbit step of about one cell
body_r = lbm3d.make_body(_phi_new, pl)
solid_r = lbm3d.solid_mask(body_r, Nl)
solid_old = s_lbm10["solid"]
lbm3d.refill(f_ref, solid_old, solid_r, body_r, pl)

_jj, _ii = np.nonzero(solid_old & ~solid_r)
_rho, _u = lbm3d.macroscopic(f_ref[:, :, _jj, _ii])
_ub, _vb = body_r["velocity"](_ii + 0.5, _jj + 0.5)
print(f"{_jj.size} nodes uncovered by a 1-cell move")
print(f"max |u - u_body| on them = {max(np.abs(_u[0] - _ub).max(), np.abs(_u[1] - _vb).max(), np.abs(_u[2]).max()):.1e}")

_valid = ~solid_old & ~solid_r
_acc, _cnt = 0.0, 0
for _dj in (-1, 0, 1):
    for _di in (-1, 0, 1):
        if (_dj, _di) != (0, 0) and _valid[(_jj[0] + _dj) % Nl, (_ii[0] + _di) % Nl]:
            _acc += lbm3d.macroscopic(s_lbm10["f"][:, :, (_jj[0] + _dj) % Nl, (_ii[0] + _di) % Nl])[0][0]; _cnt += 1
print(f"first uncovered node: density {_rho[0, 0]:.10f}, mean of its {_cnt} fluid neighbours {_acc / _cnt:.10f}")

_th = np.linspace(0, 2 * np.pi, 200)
_b0 = lbm3d.make_body(s_lbm10["phi"], pl)
figure([dict(type="scatter", mode="lines", x=_b0["cx"] + _b0["R"] * np.cos(_th), y=_b0["cy"] + _b0["R"] * np.sin(_th),
             line=dict(color="#999"), name="cylinder before"),
        dict(type="scatter", mode="lines", x=body_r["cx"] + body_r["R"] * np.cos(_th), y=body_r["cy"] + body_r["R"] * np.sin(_th),
             line=dict(color="black"), name="cylinder after"),
        dict(type="scatter", mode="markers", x=_ii + 0.5, y=_jj + 0.5, marker=dict(size=9, color="#d8541f"), name="refilled nodes")],
       title="Nodes uncovered when the cylinder moves (units: cells)",
       xaxis=dict(title="x / h", range=[_b0["cx"] - _b0["R"] - 3, _b0["cx"] + _b0["R"] + 3]),
       yaxis=dict(title="y / h", range=[_b0["cy"] - _b0["R"] - 3, _b0["cy"] + _b0["R"] + 3], scaleanchor="x"))
'''),

# =====================================================================================================
dict(title="LBM 10: momentum exchange, force and torque", md=r"""
**The force comes for free from the bounce-back.** Every cut link takes a population out of the fluid
($f^*_q$ going into the body) and puts a different one back ($f_{\bar q}$ coming out). Their momentum
difference is the impulse the body gives to the fluid and, by Newton, minus what the fluid gives to the body.
With the Galilean-invariant correction for a moving wall (Wen et al.), the momentum handed to the body through one link is

$$\Delta\mathbf P=(\mathbf c_q-\mathbf u_w)\,f^*_q(\mathbf x_f)+(\mathbf c_q+\mathbf u_w)\,f_{\bar q}(\mathbf x_f,\text{new}).$$

Summing over all cut links gives the force; weighting each link by its lever arm $\mathbf r=\mathbf x_w-\mathbf x_c$
(from the body centre to the cut point) gives the **torque about the cylinder axis**,
$T_z=\sum(r_x\,\Delta P_y-r_y\,\Delta P_x)$. The sum over the whole span is divided by $N_z$ to give the torque
**per unit span**, and converted from lattice units ($h^4/\Delta t^2$) to the physical units of the page
($\rho=1$). A positive torque turns the cylinder counter-clockwise; for a counter-clockwise spinning cylinder in
still fluid the fluid resists, so the torque on the body should be negative.

Two checks below: (1) the sign for a pure spin; (2) *per unit span*: the same flow computed with one layer and
with two layers must give the same torque (the flow is uniform in $z$ and there is no seed).
""", code=r'''
pl_spin = lbm3d.make_params(Nz=NZ_SLAB, seed=0, **dict(common, Uo=0.0))
s_spin = lbm3d.init_state(pl_spin)
t_spin, tq_spin = [], []
for _ in range(40):
    lbm3d.step(s_spin, pl_spin)
    t_spin.append(s_spin["t"]); tq_spin.append(lbm3d.torque(s_spin, pl_spin))
print(f"pure spin, Us = {pl_spin['Us']}: torque on the cylinder after 1 step {tq_spin[0]:.4e}, after 40 steps {tq_spin[-1]:.4e}")
print(f"torque = exchange[2] h^4/dt^2/Nz: {s_spin['exchange'][2] * pl_spin['h'] ** 4 / pl_spin['dt'] ** 2 / pl_spin['Nz']:.4e}")

_tq = []
for _nz in (1, 2):
    _p = lbm3d.make_params(Nz=_nz, seed=0, **common)
    _s = lbm3d.init_state(_p)
    for _ in range(10):
        lbm3d.step(_s, _p)
    _tq.append(lbm3d.torque(_s, _p))
print(f"torque per unit span after 10 steps: Nz=1 {_tq[0]:.10e}, Nz=2 {_tq[1]:.10e}, relative difference {abs(_tq[0] - _tq[1]) / abs(_tq[0]):.1e}")

figure([dict(type="scatter", x=t_spin, y=tq_spin, mode="lines+markers", name="Tz")],
       title="Torque of the fluid on a spinning cylinder (LBM, first 40 steps)",
       xaxis=dict(title="time"), yaxis=dict(title="torque per unit span"))
'''),

# =====================================================================================================
dict(title="LBM 11: global mass correction", md=r"""
**Why the mass drifts.** The interpolated bounce-back, and the nodes covered or uncovered by a moving body,
do not conserve mass exactly. In a closed box a tiny error would accumulate. After the body step the code
therefore computes the deficit and spreads it evenly over all fluid nodes through the **rest population** only:

$$\delta=\frac{n_{fluid}-\sum_{fluid}\rho}{n_{fluid}},\qquad f_0\leftarrow f_0+\delta\ \text{ on every fluid node}.$$

Adding to $f_0$ changes $\rho$ and nothing else (the momentum sum $\sum\mathbf c_qf_q$ has no contribution from
$\mathbf c_0=0$), so the correction is a uniform shift of the reference density, the usual "fix the mean density"
trick of weakly compressible schemes. It is applied equally in every $z$-plane, so a $z$-uniform flow stays
$z$-uniform. The mean fluid density is therefore 1 after every step. The run below does 40 steps with and without
the correction (`mass_fix=False`), printing the mean fluid density.
""", code=r'''
mass_on, mass_off, t_mass = [], [], []
_pa, _pb = pl, dict(pl, mass_fix=False)
_sa, _sb = lbm3d.init_state(_pa), lbm3d.init_state(_pb)
for _n in range(40):
    lbm3d.step(_sa, _pa); lbm3d.step(_sb, _pb)
    t_mass.append(_sa["t"]); mass_on.append(lbm3d.mean_density(_sa, _pa)); mass_off.append(lbm3d.mean_density(_sb, _pb))
print(f"mean fluid density after 40 steps: with correction {mass_on[-1]:.12f}, without {mass_off[-1]:.12f}")
print(f"largest deviation from 1: with {np.abs(np.array(mass_on) - 1).max():.1e}, without {np.abs(np.array(mass_off) - 1).max():.1e}")
figure([dict(type="scatter", x=t_mass, y=np.array(mass_off) - 1, name="without correction"),
        dict(type="scatter", x=t_mass, y=np.array(mass_on) - 1, name="with correction")],
       title="Mean fluid density minus 1", xaxis=dict(title="time"), yaxis=dict(title="mean(rho) - 1", exponentformat="e"))
'''),

# =====================================================================================================
dict(title="LBM 12: the complete time step", md=r"""
**All pieces together.** `lbm3d.step` advances the state by one $\Delta t$ in this order:

0. move the body to its new orbit angle, build the solid mask, and `refill` the uncovered nodes;
1. `collide` every node (regularised by default);
2. `stream` every population one link;
3. `bounce_back_walls` on the box walls (and on the end walls for `span="walls"`);
4. `find_links` and `bounce_back_body`: Bouzidi interpolation with the moving-wall term, and the momentum exchange
   that gives force and torque;
5. `mass_correction`, and the solid nodes are reset to the body's equilibrium (they are never used by the fluid).

The loop below runs 60 steps of the slab with **seed = 0** and then checks the promise made in the
specification: if the start is uniform in $z$, nothing in the solver itself may create variation in $z$, so any
3D growth later is physics (or the deliberate seed), never an artefact. All layers must be identical to
round-off. The last line builds a state with the default seed and prints the size of the deliberate
perturbation (in units of $U_{ref}$).
""", code=r'''
pl0 = lbm3d.make_params(Nz=NZ_SLAB, seed=0, **common)
s_lbm_loop = lbm3d.init_state(pl0)
t_loop, speed_loop, tq_loop = [], [], []
for _ in range(60):
    lbm3d.step(s_lbm_loop, pl0)
    _U = lbm3d.cell_velocity(s_lbm_loop, pl0)
    t_loop.append(s_lbm_loop["t"]); speed_loop.append(float(np.sqrt((_U ** 2).sum(0)).max())); tq_loop.append(lbm3d.torque(s_lbm_loop, pl0))

U_loop = lbm3d.cell_velocity(s_lbm_loop, pl0)
print(f"after {s_lbm_loop['nstep']} steps (t = {s_lbm_loop['t']:.4f}): max speed {speed_loop[-1]:.4f}, torque {tq_loop[-1]:.4e}, "
      f"mean density {lbm3d.mean_density(s_lbm_loop, pl0):.12f}")
print(f"seed = 0: max over layers |u(layer) - u(layer 0)| / max|u| = {np.abs(U_loop - U_loop[:, :1]).max() / np.abs(U_loop).max():.1e}   (z-uniform to round-off)")
_Useed = lbm3d.cell_velocity(lbm3d.init_state(pl), pl)
print(f"default seed {pl['seed']}: at t = 0 max |w| = {np.abs(_Useed[2]).max():.2e} (Uref = {pl['Uref']}; "
      f"w is zero without the seed, so this is the seed's spanwise velocity)")

figure([dict(type="scatter", x=t_loop, y=speed_loop, name="max speed")],
       title="LBM, 60 steps: maximum speed", xaxis=dict(title="time"), yaxis=dict(title="max |u|"))
'''),

# =====================================================================================================
# FINITE VOLUMES
# =====================================================================================================
dict(title="FV 1: the staggered (MAC) grid and the 3D seed", md=r"""
**Where each variable lives.** In the finite-volume solver the unknowns are not all at the same place. Each
velocity component sits on the cell faces it flows through, and the pressure at the cell centres:

- $u$ on the faces normal to $x$: shape $(N_z,N,N+1)$, at $x=ih,\;y=(j+\tfrac12)h,\;z=(k+\tfrac12)h$;
- $v$ on the faces normal to $y$: shape $(N_z,N+1,N)$;
- $w$ on the faces normal to $z$: shape $(N_z+1,N,N)$, at $z=kh$ (for periodic $z$ the last plane is a copy of the first);
- $q=\Delta t\,p$ at the centres: shape $(N_z,N,N)$.

Index order is $[k,j,i]$ ($z$, $y$, $x$), as everywhere in the project. On this **MAC grid** the net flux out of a
cell is a plain difference of its six face velocities, and the pressure gradient driving a face is a plain
difference of the two cells on either side. That tight coupling avoids the "checkerboard" pressure that a grid
with everything at the centres would permit.

**The deliberate 3D seed.** To see three-dimensionality grow, the 3D run starts from rest plus a small
perturbation that varies along $z$. It is built from a **stream function** so that it is divergence-free
analytically: with $\psi(x,y,z)$ the velocity is

$$u=-\frac{\partial\psi}{\partial z},\qquad v=0,\qquad w=\frac{\partial\psi}{\partial x},\qquad
\psi=\text{seed}\,U_{ref}\;F(x,y)\,W(z)\,S(z),$$

with $F=\sin^2\pi x\,\sin\pi y$ (it vanishes on the side walls), $S(z)=\sum_{m=1}^{M}\sin(k_mz+m)/k_m$ a sum of a
few spanwise Fourier modes with $k_m=2\pi m/L_z$ and $M=\min(4,N_z/4)$, and $W=1$ for periodic $z$ or
$\sin^2(\pi z/L_z)$ for end walls (so $u=w=0$ there). It is evaluated on the $u$ and $w$ faces and followed by one
projection, which makes it divergence-free *on the grid* too. A span with fewer than 4 layers ($M=0$), or $N_z=1$,
gets no seed. The lattice Boltzmann solver starts from the equilibrium of the same velocity at its nodes.
""", code=r'''
s_fv0 = fv3d.init_state(pf)                           # slab (Nz = 2), default seed
for _name in ("u", "v", "w", "q"):
    print(f"{_name}: shape {s_fv0[_name].shape}")

p_fv = fv3d.make_params(Nz=inp["Nz"], span=inp["span"], seed=inp["seed"], **common)
s_fv_seed = fv3d.init_state(p_fv)                      # the experiment's grid, with the seed
_div = fv3d.divergence(s_fv_seed["u"], s_fv_seed["v"], s_fv_seed["w"], p_fv["h"])
print(f"experiment grid N = {p_fv['N']}, Nz = {p_fv['Nz']}, span = {p_fv['span']}: max |u| = {np.abs(s_fv_seed['u']).max():.3e}, max |w| = {np.abs(s_fv_seed['w']).max():.3e}, "
      f"max |div u| after the first projection = {np.abs(_div).max():.1e}")
print(f"the seed has no v component, but the projection adds a small one: max |v| = {np.abs(s_fv_seed['v']).max():.1e}")

_zf = np.arange(p_fv["Nz"] + 1) * p_fv["h"]
_zc = (np.arange(p_fv["Nz"]) + 0.5) * p_fv["h"]
_N = p_fv["N"]
figure([dict(type="scatter", mode="lines+markers", x=_zc, y=s_fv_seed["u"][:, _N // 2, _N // 2], name="u at the box centre"),
        dict(type="scatter", mode="lines+markers", x=_zf, y=s_fv_seed["w"][:, _N // 2, _N // 4], name="w at x = 1/4, y = 1/2")],
       title="The seed along the span", xaxis=dict(title="z"), yaxis=dict(title="velocity"))
'''),

# =====================================================================================================
dict(title="FV 2: ghost values for the walls", md=r"""
**Stencils without special cases.** Every difference in the solver reads neighbours up to two cells away.
Near a wall some of those neighbours are outside the box. Instead of writing separate formulas for the boundary,
the code pads each array with two layers of **ghost values** (`pad_axis`), chosen so that the same formula gives
the right wall condition:

| `kind` | situation | ghost rule |
|---|---|---|
| `face` | wall *on* the first/last node, value 0 there (no-slip, normal velocity) | $a_{-k}=-a_k$ |
| `cell` | wall *half a cell outside* the first/last node (no-slip, tangential velocity) | $a_{-1-k}=-a_k$ |
| `sym` | zero-gradient wall half a cell outside (pressure, cell values) | $a_{-1-k}=+a_k$ |
| `wrap` | periodic, nodes are cells $0..n-1$ | wrap around |
| `wrapface` | periodic, but the last node is a copy of the first (the $w$ faces) | wrap around the distinct nodes |

Picture of `cell`: the wall is half a cell from the first node, so the straight line through the node and its
mirror image crosses zero exactly on the wall, which is the no-slip condition to second order. `pad_u`, `pad_v`,
`pad_w`, `pad_c` choose the right kind for each axis (for example $u$ is `face` across the $x$ walls but `cell`
across $y$ and $z$ walls). The check applies each kind to a short row of numbers and verifies the wall value.
""", code=r'''
_a = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
for _kind in ("face", "cell", "sym", "wrap", "wrapface"):
    print(f"{_kind:9s} {_a} -> {fv3d.pad_axis(_a, 0, _kind)}")
_cell = fv3d.pad_axis(_a, 0, "cell"); _face = fv3d.pad_axis(_a * np.array([0, 1, 1, 1, 0]), 0, "face")
print("cell: value on the wall = mean of first node and ghost =", 0.5 * (_cell[2] + _cell[1]))
print("face: ghost across the wall node =", _face[1], "and", _face[0], "(= minus the nodes at distance 1 and 2)")
_pu = fv3d.pad_u(s_fv0["u"], "periodic")
print(f"u shape {s_fv0['u'].shape} -> padded {_pu.shape} (2 ghost layers on every side)")
'''),

# =====================================================================================================
dict(title="FV 3: advective fluxes (MUSCL-minmod) and the diffusion stencil", md=r"""
**Finite volumes in one sentence.** The momentum in a control volume changes because of what flows through its
six faces:

$$\frac{\partial u}{\partial t}=-\frac1h\sum_{\text{faces}}(\text{flux out})+\nu\nabla^2u,\qquad
\text{flux of }u\text{ through a face}=(\text{transporting velocity})\times(\text{value of }u\text{ on the face}).$$

The transporting velocities are the neighbouring face velocities averaged to the face of the control volume.
The value of $u$ *on* the face is not known (we store cell values), so it has to be reconstructed.

**Upwind and the limiter.** Taking the value from the upstream node is stable but smears sharp features;
taking the average of the two nodes is accurate but produces wiggles near a sharp step. **MUSCL** takes the
upstream value plus half a slope, $a+\tfrac12\,\text{slope}$, and **minmod** chooses the *smaller* of the two
one-sided slopes (or zero if they disagree in sign). The result never leaves the interval spanned by the two
neighbours, so no new maxima appear.

$$\text{minmod}(a,b)=\begin{cases}0 & ab\le0\\ \text{sign}(a)\min(|a|,|b|) & \text{else}\end{cases}$$

**Diffusion** uses the 7-point stencil $\nu\,(\sum_{6\text{ neighbours}}u-6u_c)/h^2$.

Two checks: (1) around a step the three reconstructions are compared, and on random data the MUSCL face value
is verified to lie between its two neighbours; (2) the full `momentum_rhs` on a velocity field that is a single
Fourier mode (and small, so the nonlinear term is negligible) must return $\nu\lambda\,w$ with $\lambda$ the
*discrete* eigenvalue of the stencil, which is slightly different from the continuous $-k^2$.
""", code=r'''
_a = np.where(np.arange(12) < 6, 0.0, 1.0)             # a sharp step
_i = np.arange(1, 9)                                   # faces between node i and i+1
face_muscl = fv3d.face_value(_a[_i - 1], _a[_i], _a[_i + 1], _a[_i + 2], np.ones(_i.size))
face_upwind = _a[_i]
face_central = 0.5 * (_a[_i] + _a[_i + 1])
print("face between nodes i and i+1:   ", _i.tolist())
print("upwind  :", face_upwind)
print("central :", face_central)
print("MUSCL   :", face_muscl)
_r = np.random.default_rng(3).standard_normal((4, 1000))
_fv = fv3d.face_value(_r[0], _r[1], _r[2], _r[3], np.ones(1000))
print("MUSCL face value lies between its two neighbours on random data:",
      bool(np.all((_fv >= np.minimum(_r[1], _r[2]) - 1e-15) & (_fv <= np.maximum(_r[1], _r[2]) + 1e-15))))

_p8 = fv3d.make_params(Nz=8, **common)
_x = (np.arange(_p8["N"]) + 0.5) * _p8["h"]; _zf8 = np.arange(9) * _p8["h"]
_kz = 2 * np.pi / _p8["Lz"]
_w = 1e-8 * np.cos(_kz * _zf8)[:, None, None] * np.outer(np.sin(np.pi * _x), np.sin(np.pi * _x))[None]; _w[-1] = _w[0]
_, _, _Rw = fv3d.momentum_rhs(np.zeros((8, _p8["N"], _p8["N"] + 1)), np.zeros((8, _p8["N"] + 1, _p8["N"])), _w, _p8)
_lam_disc = -(2 * (2 - 2 * np.cos(np.pi * _p8["h"])) + (2 - 2 * np.cos(_kz * _p8["h"]))) / _p8["h"] ** 2
_lam_cont = -(2 * np.pi ** 2 + _kz ** 2)
print(f"d w/dt for one Fourier mode: discrete eigenvalue {_lam_disc:.2f}, continuous {_lam_cont:.2f}")
print(f"max | momentum_rhs - nu*lambda_disc*w | / max|nu*lambda*w| = {np.abs(_Rw[:8] - _p8['nu'] * _lam_disc * _w[:8]).max() / np.abs(_p8['nu'] * _lam_disc * _w).max():.1e}")

figure([dict(type="scatter", mode="lines+markers", x=list(_i + 0.5), y=face_upwind, name="upwind"),
        dict(type="scatter", mode="lines+markers", x=list(_i + 0.5), y=face_central, name="central"),
        dict(type="scatter", mode="lines+markers", x=list(_i + 0.5), y=face_muscl, name="MUSCL-minmod")],
       title="Reconstructed face values around a step (flow to the right)",
       xaxis=dict(title="face position (node units)"), yaxis=dict(title="value on the face"))
'''),

# =====================================================================================================
dict(title="FV 4: time stepping (Adams-Bashforth 2)", md=r"""
**Marching forward.** With $R(\mathbf u)$ the right-hand side (advection + diffusion), the predictor is the
second-order *Adams-Bashforth* extrapolation, using the right-hand side of the previous step as well:

$$\mathbf u^*=\mathbf u^n+\Delta t\Big[\big(1+\tfrac r2\big)R^n-\tfrac r2R^{n-1}\Big],\qquad r=\frac{\Delta t}{\Delta t_{prev}}.$$

With a constant step $r=1$, which gives the familiar $\tfrac32R^n-\tfrac12R^{n-1}$; the formula is written for a
variable step. The very first step has no previous right-hand side and uses forward Euler ($a=1,\ b=0$).
$\mathbf u^*$ is only a *predictor*: it contains the momentum balance but neither the body nor the
incompressibility, which are enforced next (penalisation, then projection).

The check takes a state after three steps, builds $\mathbf u^*$ by hand from `momentum_rhs` and the stored
previous right-hand side, then lets `fv3d.step` do it and compares the stored predictor `us`.
""", code=r'''
s_fv3 = fv3d.init_state(p_fv)
for _ in range(3):
    fv3d.step(s_fv3, p_fv)
_s = {k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in s_fv3.items()}      # private copy
Ru, Rv, Rw = fv3d.momentum_rhs(_s["u"], _s["v"], _s["w"], p_fv)
_r = p_fv["dt"] / _s["dt_prev"]
ab_a, ab_b = 1 + 0.5 * _r, -0.5 * _r
print(f"first step: dt_prev = {s_fv0['dt_prev']} -> forward Euler;   later steps: r = {_r:.3f}, a = {ab_a:.3f}, b = {ab_b:.3f}")
_us_hand = _s["u"] + p_fv["dt"] * (ab_a * Ru + ab_b * _s["ru"])
fv3d.step(_s, p_fv)
print(f"max |u* by hand - u* stored by step()| = {np.abs(_us_hand - _s['us']).max():.1e}  (u* scale {np.abs(_s['us']).max():.2e})")
'''),

# =====================================================================================================
dict(title="FV 5: the cylinder as a penalisation mask", md=r"""
**A body without a body-fitted mesh.** The grid is fixed, the cylinder moves through it. **Volume
penalisation** drives the velocity inside the body to the rigid-body velocity with a smooth mask $\chi(x,y)$
($\chi=1$ inside, $0$ outside):

$$\mathbf u\leftarrow\mathbf u^*+\chi\,(\mathbf u_{body}-\mathbf u^*),\qquad
\chi=\operatorname{clip}\!\Big(\frac{R-r}{\varepsilon},0,1\Big),\quad r=|\mathbf x-\mathbf x_c|,\quad \varepsilon=\text{width}\cdot h .$$

This is the default mask, `mask="ramp"`: $\chi=1$ for $r\le R-\varepsilon$, falling linearly to $0$ at $r=R$, so the
blending layer lies *inside* the circle and nothing outside it is touched. (`mask="tanh"` selects the smoother
$\tfrac12(1-\tanh\frac{r-R}{\varepsilon})$ of the 2D page, whose tails reach about three cells outside $R$.)
Inside the cylinder the fluid velocity is replaced by the body's (orbit + spin, $w_{body}=0$); in the thin
layer it is blended; elsewhere nothing changes. The force that holds the fluid to the body is
$\chi(\mathbf u_{body}-\mathbf u^*)/\Delta t$ per volume, so **the torque** the page reports is the sum of its
moment about the axis (with the sign flipped, to get the force on the body); `fv3d.torque` does that.

Because the body is the same in every $z$-plane, $\chi$ and $\mathbf u_{body}$ are computed on one plane and
broadcast over all planes. The check evaluates the mask on the cell-centre grid, counts the cells of the
blending layer along a row through the cylinder centre, and verifies on the real predictor of the previous step that
`penalise` equals the formula, leaves the flow untouched far from the body and sets it to the body velocity at
the innermost face.
""", code=r'''
_xu, _yu, _xv, _yv, _xw, _yw = fv3d.face_coords(p_fv)
chi_c, _ub, _vb = fv3d.body_mask_velocity(_xw, _yw, 0.0, p_fv)                 # cell centres, phi = 0
print(f"eps = width*h = {p_fv['eps']:.4f}, cylinder radius {p_fv['R']}, centre at {tuple(round(float(v), 3) for v in fv3d.body_centre(0.0, p_fv))}")
_jc = int(fv3d.body_centre(0.0, p_fv)[1] / p_fv["h"])
print(f"along the row through the centre, cells with 0 < chi < 1 (the blending layer, both edges): {int(((chi_c[_jc] > 0) & (chi_c[_jc] < 1)).sum())}")

pen_u, pen_v, pen_w = fv3d.penalise(s_fv3["us"], s_fv3["vs"], s_fv3["ws"], s_fv3["phi"], p_fv)
_chu, _ubu, _ = fv3d.body_mask_velocity(_xu, _yu, s_fv3["phi"], p_fv)
_hand = s_fv3["us"] + _chu[None] * (_ubu[None] - s_fv3["us"]); _hand[:, :, [0, -1]] = 0.0
print(f"max |penalise(...) - (u* + chi (u_body - u*))| on the u faces = {np.abs(pen_u - _hand).max():.1e}")
_out = (_chu == 0)[None, :, :].repeat(p_fv["Nz"], 0); _out[:, :, [0, -1]] = False
print(f"far outside (chi = 0): max |u - u*| = {np.abs(pen_u - s_fv3['us'])[_out].max():.1e}")
_jm, _im = np.unravel_index(_chu.argmax(), _chu.shape)
print(f"innermost u face: chi = {_chu[_jm, _im]:.4f},  |u* - u_body| = {abs(s_fv3['us'][0, _jm, _im] - _ubu[_jm, _im]):.3e}  ->  "
      f"|u - u_body| = {abs(pen_u[0, _jm, _im] - _ubu[_jm, _im]):.3e}")

figure([dict(type="heatmap", z=chi_c, x=_xw[0], y=_yw[:, 0], colorscale="Greys", zmin=0, zmax=1, colorbar=dict(title="chi"))],
       title="Penalisation mask chi at the cell centres (phi = 0)", xaxis=dict(title="x"), yaxis=dict(title="y", scaleanchor="x"))
'''),

# =====================================================================================================
dict(title="FV 6: projection onto divergence-free flow", md=r"""
**Pressure as a constraint.** After penalisation the velocity $\mathbf u$ is not divergence-free. The
*projection* finds the pressure-like field $q$ that fixes it:

$$\nabla^2q=\nabla\!\cdot\mathbf u,\qquad \mathbf u^{n+1}=\mathbf u-\nabla q .$$

Taking the divergence of the second equation shows $\nabla\!\cdot\mathbf u^{n+1}=\nabla\!\cdot\mathbf u-\nabla^2q=0$.
Geometrically: split $\mathbf u$ into a divergence-free part and a gradient (the part that compresses or
expands the fluid), and throw away the gradient part. On the MAC grid the discrete divergence of the discrete
gradient *is* the 7-point Laplacian with zero-flux walls, so the discrete projection is exact: once the Poisson
equation $Lq=\text{rhs}$ is solved, the divergence is zero to the accuracy of the solve.

**Multigrid solves the Poisson equation.** The system has as many unknowns as cells, and a naive iteration
would need many sweeps. A **V-cycle** works on a ladder of grids (see next cell): smooth the error on this
grid, compute the residual, restrict it to a coarser grid, solve there (recursively), interpolate the
correction back and smooth again. The page warm-starts $q$ from the previous step and does 2 V-cycles per step.

The cell below projects the penalised field of the previous cell. It prints the grid ladder (the vertical
direction is coarsened together with $x,y$ only while it still has at least two layers) and, **after each
V-cycle**, the residual $\|b-Lq\|$.
""", code=r'''
_h, _span = p_fv["h"], p_fv["span"]
rhs_mg = fv3d.divergence(pen_u, pen_v, pen_w, _h)
print(f"max |div| of the penalised field before projection: {np.abs(rhs_mg).max():.3e}")

_lev, _nz, _n = [], p_fv["Nz"], p_fv["N"]
while True:
    _lev.append((_nz, _n))
    if _n <= 4:
        break
    _nz, _n = (_nz // 2 if _nz >= 2 else 1), _n // 2
print("grid ladder (layers in z, cells across):", _lev)

q_mg = np.zeros_like(s_fv3["q"])
res_mg = [float(np.linalg.norm(rhs_mg - fv3d.laplacian(q_mg, _h, _span)))]
for _ in range(8):
    fv3d.vcycle(q_mg, rhs_mg, _h, p_fv)
    res_mg.append(float(np.linalg.norm(rhs_mg - fv3d.laplacian(q_mg, _h, _span))))
print("V-cycle   residual        reduction factor")
for _c, _r in enumerate(res_mg):
    print(f"{_c:5d}   {_r:12.4e}   {'' if _c == 0 else f'{res_mg[_c - 1] / _r:8.2f}'}")

proj_u, proj_v, proj_w = fv3d.project(pen_u, pen_v, pen_w, q_mg, _h, _span)
print(f"max |div| after projection with 8 cycles: {np.abs(fv3d.divergence(proj_u, proj_v, proj_w, _h)).max():.3e}")

figure([dict(type="scatter", mode="lines+markers", x=list(range(len(res_mg))), y=res_mg, name="residual")],
       title="Multigrid: residual after each V-cycle", xaxis=dict(title="V-cycle"), yaxis=dict(title="||b - L q||", type="log"))
'''),

# =====================================================================================================
dict(title="FV 7: what multigrid exploits, smoothing and coarse grids", md=r"""
**The idea behind a V-cycle.** The smoother is **red-black Gauss-Seidel**: each cell is replaced by the average
of its neighbours (corrected by the right-hand side), updating the "red" cells (even $i+j$) and then the "black"
ones. It is cheap and parallel, and it is very good at removing *rough* error (neighbouring cells with opposite
errors average out at once) but very slow on *smooth* error (the whole region needs to change, and a cell only
sees its neighbours). A smooth error, however, can be represented on a grid with half as many cells and solved
there much more cheaply, where it looks rougher relative to the grid. So: smooth, restrict the residual (average
the children), solve coarse, prolong the correction (interpolate) and smooth again.

For the colouring, the code uses $i+j$ in *every* $z$-layer (not $i+j+k$). With a layer-dependent colouring,
neighbouring layers would be treated differently and a $z$-uniform field would come out of the solver with
spurious $z$-differences, seeding 3D motion that is not physical. The last step of this
section checks this directly ($z$-uniform flow must stay $z$-uniform to round-off).

The experiment below solves $Lx=0$ starting from an error that is (a) rough (random numbers) and (b) smooth
(one cosine over the box), and prints how much of the error is left after some sweeps. Then it checks how well
each error survives a trip to the coarse grid and back (`restrict` followed by `prolong`).
""", code=r'''
_n, _nz = p_fv["N"], p_fv["Nz"]
_xx = (np.arange(_n) + 0.5) / _n
_rough = np.random.default_rng(5).standard_normal((_nz, _n, _n))
_smooth = np.broadcast_to(np.cos(np.pi * _xx)[None, None, :] * np.cos(np.pi * _xx)[None, :, None], (_nz, _n, _n)).copy()
_zero = np.zeros((_nz, _n, _n))

def _size(e):
    return float(np.linalg.norm(e - e.mean()))

sweep_counts = [0, 1, 2, 4, 8, 16]
left_rough, left_smooth = [], []
for _name, _e0, _store in (("rough", _rough, left_rough), ("smooth", _smooth, left_smooth)):
    for _m in sweep_counts:
        _store.append(_size(fv3d.smooth(_e0.copy(), _zero, p_fv["h"], _m, p_fv["span"])) / _size(_e0))
print("sweeps   rough error left   smooth error left")
for _m, _a, _b in zip(sweep_counts, left_rough, left_smooth):
    print(f"{_m:6d}   {_a:16.4f}   {_b:16.4f}")

for _name, _e0 in (("rough", _rough), ("smooth", _smooth)):
    _back = fv3d.prolong(fv3d.restrict(_e0), _nz, p_fv["span"])
    print(f"{_name:6s} error: |e - prolong(restrict(e))| / |e| = {np.linalg.norm(_e0 - _back) / np.linalg.norm(_e0):.3f}")

figure([dict(type="scatter", mode="lines+markers", x=sweep_counts, y=left_rough, name="rough error"),
        dict(type="scatter", mode="lines+markers", x=sweep_counts, y=left_smooth, name="smooth error")],
       title="Fraction of the error left after Gauss-Seidel sweeps", xaxis=dict(title="sweeps"), yaxis=dict(title="remaining error", type="log"))
'''),

# =====================================================================================================
dict(title="FV 8: the complete time step", md=r"""
**All pieces together.** `fv3d.step` does, per time step:

1. `momentum_rhs`: advection (MUSCL-minmod) and diffusion for $u,v,w$;
2. Adams-Bashforth 2 predictor $\mathbf u^*$ (forward Euler on the first step);
3. move the body to its new angle and `penalise`;
4. `divergence` of the result, `solve_pressure` (`vcycles` V-cycles, warm-started from the last $q$);
5. `project`: subtract $\nabla q$.

The loop below runs 100 steps of a thin periodic slab with **seed = 0** and records `fv3d.stats`: kinetic energy
per unit span, torque on the body, maximum divergence, and maximum speed. Two things are verified, in the same
spirit as for the lattice Boltzmann solver: the printed divergence is what is left after the 2 V-cycles of each step (not zero: the multigrid solve is
not run to convergence, compare with the divergence before projection printed in step FV 6), and all layers
stay identical to round-off (the solver must not create 3D motion by itself).
""", code=r'''
pf0 = fv3d.make_params(Nz=NZ_SLAB, seed=0, **common)
s_fv_loop = fv3d.init_state(pf0)
hist_fv = []
for _ in range(100):
    fv3d.step(s_fv_loop, pf0)
    hist_fv.append(dict(t=s_fv_loop["t"], **fv3d.stats(s_fv_loop, pf0)))
U_fv_loop = fv3d.cell_velocity(s_fv_loop, pf0)
print(f"after {s_fv_loop['nstep']} steps (t = {s_fv_loop['t']:.3f}): E = {hist_fv[-1]['E']:.5f}, torque = {hist_fv[-1]['torque']:.4e}, "
      f"max speed = {hist_fv[-1]['maxspeed']:.4f}")
print(f"max |div u| left after the projections, over the run: {max(r['maxdiv'] for r in hist_fv):.2e}")
print(f"seed = 0: max over layers |u(layer) - u(layer 0)| / max|u| = {np.abs(U_fv_loop - U_fv_loop[:, :1]).max() / np.abs(U_fv_loop).max():.1e}   (z-uniform to round-off)")

figure([dict(type="scatter", x=[r["t"] for r in hist_fv], y=[r["E"] for r in hist_fv], name="E")],
       title="FV, 100 steps: kinetic energy per unit span", xaxis=dict(title="time"), yaxis=dict(title="E"))
'''),

# =====================================================================================================
# 2D vs 3D
# =====================================================================================================
dict(title="2D versus 3D: the experiment (same box, same seed)", md=r"""
**The question.** Does the flow that is exactly two-dimensional when $N_z=1$ stay two-dimensional when the
cylinder has a finite span $N_z>1$ and a tiny perturbation is added? Everything is identical in the two runs
(box, cylinder, Reynolds number, spin and orbit, $\Delta t$, solver) except $N_z$: the 3D run also carries the
seed $w_0$ of step FV 1 (the 2D run has none, and cannot have any).

**What is recorded** at regular intervals, from the cell-centred velocity $\mathbf U$ with `diagnostics.summary`
(the same code for both solvers). The integrals run over the **fluid only**, i.e. cells whose centre is outside the
cylinder (`diagnostics.fluid_mask`); otherwise the rigidly rotating interior of the cylinder would add a
constant to $Z$ and hide the flow:

- $E=\frac1{L_z}\int\tfrac12|\mathbf u|^2\,dV$ kinetic energy per unit span (equal to the 2D value for $z$-uniform flow);
- $Z=\frac1{L_z}\int\tfrac12|\boldsymbol\omega|^2\,dV$ enstrophy, with $\boldsymbol\omega=\nabla\times\mathbf u$;
- $E_w=\frac1{L_z}\int\tfrac12w^2\,dV$, the energy of the spanwise velocity (exactly 0 in the 2D run);
- $E_{3d}=\frac1{L_z}\int\tfrac12|\mathbf u-\langle\mathbf u\rangle_z|^2\,dV$, the energy of whatever varies along $z$;
- the torque on the cylinder.

`method` and `T_end` in the first cell choose the solver and the duration. The run uses `inp["Nz"]` layers and
`inp["span"]`; the 2D baseline is always $N_z=1$, periodic. The default is the finite-volume solver (fewer
steps per unit time, see the first cell). To use the lattice Boltzmann solver, set `method="lbm"` and
expect a longer run; the output prints how many steps were taken.
""", code=r'''
mod = lbm3d if inp["method"] == "lbm" else fv3d
p_run = {"2D": mod.make_params(Nz=1, span="periodic", seed=inp["seed"], **common),
         "3D": mod.make_params(Nz=inp["Nz"], span=inp["span"], seed=inp["seed"], **common)}

def _run(p, T, every=10):
    s = mod.init_state(p)
    nsteps = int(np.ceil(T / p["dt"]))
    h = {k: [] for k in ("t", "E", "Z", "Ew", "E3d", "torque")}
    for n in range(1, nsteps + 1):
        mod.step(s, p)
        if n % every == 0 or n == nsteps:
            row = diagnostics.summary(mod.cell_velocity(s, p), s, p)       # fluid-only E, Z, Ew, E3d
            h["t"].append(s["t"])
            for name in ("E", "Z", "Ew", "E3d"):
                h[name].append(row[name])
            h["torque"].append(float(mod.torque(s, p)))
    return s, {k: np.array(v) for k, v in h.items()}, nsteps

end_state, hist_run, n_steps = {}, {}, {}
for _key in ("2D", "3D"):
    end_state[_key], hist_run[_key], n_steps[_key] = _run(p_run[_key], inp["T_end"])
U_end = {k: mod.cell_velocity(end_state[k], p_run[k]) for k in ("2D", "3D")}
fluid_end = {k: diagnostics.fluid_mask(p_run[k], end_state[k]["phi"]) for k in ("2D", "3D")}      # True outside the cylinder

print(f"solver: {inp['method']},  N = {inp['N']},  Re = {inp['Re']},  Us = {inp['Us']},  Uo = {inp['Uo']},  seed = {inp['seed']}")
for _key in ("2D", "3D"):
    _h = hist_run[_key]
    print(f"{_key}: Nz = {p_run[_key]['Nz']}, span = {p_run[_key]['span']}, dt = {p_run[_key]['dt']:.3e}, {n_steps[_key]} steps to t = {_h['t'][-1]:.3f};"
          f"  E {_h['E'][0]:.4f} -> {_h['E'][-1]:.4f},  Z {_h['Z'][0]:.2f} -> {_h['Z'][-1]:.2f}")
'''),

# =====================================================================================================
dict(title="2D versus 3D: does the third dimension grow? (Ew, E3d, spanwise modes)", md=r"""
**Reading the curves.** $E_w$ and $E_{3d}$ start at the size of the seed (tiny: the seed velocity is only
a small fraction of $U_{ref}$; the printed first values show how small). If the 2D solution is *unstable* to
spanwise perturbations, they grow roughly exponentially (a straight line on the log scale); if it is stable they
decay. In the 2D run both are exactly zero (a pure 2D flow has no $w$ and no $z$ variation), so there is nothing
to plot for it.

**Spanwise modes.** $E_{kz}$ splits the energy over spanwise Fourier modes: $k_z=0$ is the $z$-average flow, the
2D part; $k_z=m$ has $m$ waves along the span (wavelength $L_z/m$). The seed contains modes $m=1\dots M$. By Parseval
their sum is the total kinetic energy; `Ekz` is only defined for periodic $z$.

The plot shows the numbers the solver produced at the end of the run; no growth rate or criterion is fitted
here. The printed lines give the first and last recorded values.
""", code=r'''
_h3 = hist_run["3D"]
print(f"Ew : {_h3['Ew'][0]:.3e} at t = {_h3['t'][0]:.3f}  ->  {_h3['Ew'][-1]:.3e} at t = {_h3['t'][-1]:.3f}")
print(f"E3d: {_h3['E3d'][0]:.3e}  ->  {_h3['E3d'][-1]:.3e}")
print(f"2D run: max Ew = {hist_run['2D']['Ew'].max():.1e}, max E3d = {hist_run['2D']['E3d'].max():.1e}")
Ekz_end = diagnostics.spanwise_energy(U_end["3D"], p_run["3D"]["h"], p_run["3D"]["Lz"], p_run["3D"]["span"], fluid_end["3D"])["Ekz"]
if Ekz_end is not None:
    print("energy per spanwise mode at the end: kz=0:", f"{Ekz_end[0]:.5f}", "  kz>=1:", np.array2string(Ekz_end[1:], precision=2))
    print(f"sum of modes {Ekz_end.sum():.8f}  vs  kinetic energy {hist_run['3D']['E'][-1]:.8f}")
else:
    print("span = walls: not periodic in z, so no spanwise Fourier modes (Ekz is None)")

figure([dict(type="scatter", x=_h3["t"], y=_h3["Ew"], name="Ew (spanwise velocity)"),
        dict(type="scatter", x=_h3["t"], y=_h3["E3d"], name="E3d (departure from z-average)")],
       title="3D run: energy of the three-dimensional part", xaxis=dict(title="time"), yaxis=dict(title="energy per unit span", type="log"))
figure([dict(type="bar", x=list(range(1, len(Ekz_end))), y=Ekz_end[1:], name="Ekz")] if Ekz_end is not None else [],
       title="3D run, end of run: energy in spanwise mode kz (kz = 0 omitted)", xaxis=dict(title="kz", dtick=1), yaxis=dict(title="E_kz", type="log"))
'''),

# =====================================================================================================
dict(title="2D versus 3D: a mid-plane slice of the vorticity omega_z", md=r"""
**Vorticity** $\boldsymbol\omega=\nabla\times\mathbf u$ measures local spin of the fluid; $\omega_z=\partial v/\partial x-\partial u/\partial y$
is the spin about axes parallel to the cylinder, the one a 2D flow has. `diagnostics.vorticity` takes central
differences of the cell-centred velocity, $(f_{i+1}-f_{i-1})/2h$; at a wall the missing neighbour is the
odd mirror image $-f$ (velocity zero half a cell outside), the same rule the solvers use for no-slip.

The slice is the horizontal plane at mid-span ($k=N_z/2$) of the 3D run, next to the (only) plane of the 2D run,
at the same time, with **one common colour scale** (set by the data's largest $|\omega_z|$ outside the
cylinder). The cylinder's cells are blanked. The printed numbers say how much the plane differs from the 2D
result and how much $\omega_z$ varies from layer to layer.
""", code=r'''
def _omega_z_plane(key, k):
    p = p_run[key]
    return diagnostics.vorticity(U_end[key], p["h"], p["span"])[2][k]

_k = p_run["3D"]["Nz"] // 2
_x = (np.arange(inp["N"]) + 0.5) / inp["N"]
in_body = ~fluid_end["3D"][0]                           # (N, N): True inside the cylinder
wz2d, wz3d = _omega_z_plane("2D", 0), _omega_z_plane("3D", _k)
_blank = lambda a: np.where(in_body, np.nan, a)
_zmax = float(max(np.abs(wz2d[~in_body]).max(), np.abs(wz3d[~in_body]).max()))
_all = diagnostics.vorticity(U_end["3D"], p_run["3D"]["h"], p_run["3D"]["span"])[2]
print(f"mid-plane k = {_k} of {p_run['3D']['Nz']};  colour scale +-{_zmax:.2f}")
print(f"rms(omega_z, 3D mid-plane - 2D) / rms(omega_z, 2D) over the fluid = "
      f"{np.sqrt(np.mean((wz3d - wz2d)[~in_body] ** 2)) / np.sqrt(np.mean(wz2d[~in_body] ** 2)):.2e}")
print(f"largest layer-to-layer variation of omega_z in the 3D run: {np.abs(_all - _all.mean(0, keepdims=True))[:, ~in_body].max():.2e} "
      f"(compare max |omega_z| = {np.abs(_all[:, ~in_body]).max():.2f})")

figure([dict(type="heatmap", z=_blank(wz2d), x=_x, y=_x, colorscale="RdBu", zmin=-_zmax, zmax=_zmax, reversescale=True, colorbar=dict(title="omega_z"))],
       title="2D baseline (Nz = 1): omega_z", xaxis=dict(title="x"), yaxis=dict(title="y", scaleanchor="x"))
figure([dict(type="heatmap", z=_blank(wz3d), x=_x, y=_x, colorscale="RdBu", zmin=-_zmax, zmax=_zmax, reversescale=True, colorbar=dict(title="omega_z"))],
       title="3D run, mid-span plane: omega_z", xaxis=dict(title="x"), yaxis=dict(title="y", scaleanchor="x"))
'''),

# =====================================================================================================
dict(title="2D versus 3D: the Q criterion and isosurface statistics", md=r"""
**Q finds vortex cores.** Split the velocity gradient $\nabla\mathbf u$ into its symmetric part $S$ (stretching
and shearing) and its antisymmetric part $\Omega$ (pure rotation). Then

$$Q=\tfrac12\big(\|\Omega\|^2-\|S\|^2\big).$$

Where $Q>0$, rotation beats strain, the signature of a vortex core (and not of a shear layer, which has both).
`diagnostics.q_criterion` builds the 3x3 gradient with the same central differences and wall ghosts as the
vorticity. The page draws **isosurfaces** $Q=\text{threshold}$ with a threshold chosen as a fraction of the
field's displayed range (a robust upper value, a percentile of $|Q|$ outside the cylinder that the GPU finds from a
histogram, rather than the single largest cell).

Since a picture of a surface is hard to compare numerically, the cell reports what such a surface would
enclose: for a range of thresholds (here as fractions of the largest $Q$ of each run, a simpler choice than the page's percentile range) the share of the fluid volume that has $Q$
above it, for the 2D and the 3D run. The cylinder's cells are excluded.
""", code=r'''
def _q_fluid(key):
    p = p_run[key]
    Q = diagnostics.q_criterion(U_end[key], p["h"], p["span"])
    return Q[fluid_end[key]]                              # 1-D array: the values in the fluid cells

Q_fluid = {k: _q_fluid(k) for k in ("2D", "3D")}
q_fracs = np.array([0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8])
vol_above = {k: np.array([(Q_fluid[k] > f * Q_fluid[k].max()).mean() for f in q_fracs]) for k in Q_fluid}
for _k2 in Q_fluid:
    print(f"{_k2}: max Q = {Q_fluid[_k2].max():.2f}, min Q = {Q_fluid[_k2].min():.2f}, fluid volume with Q > 0: {(Q_fluid[_k2] > 0).mean():.3f}")
print("fraction of the fluid volume above the threshold (threshold = fraction x max Q of that run)")
print("threshold   " + "".join(f"{f:9.2f}" for f in q_fracs))
for _k2 in Q_fluid:
    print(f"{_k2:11s} " + "".join(f"{v:9.4f}" for v in vol_above[_k2]))

figure([dict(type="scatter", mode="lines+markers", x=q_fracs, y=vol_above[k], name=k) for k in ("2D", "3D")],
       title="Fluid volume enclosed by the Q isosurface", xaxis=dict(title="threshold / max Q", type="log"),
       yaxis=dict(title="fraction of fluid volume with Q above threshold", type="log"))
'''),

# =====================================================================================================
dict(title="2D versus 3D: the horizontal energy spectrum", md=r"""
**How is the energy spread over scales?** The spectrum $E(k)$ says how much kinetic energy sits in
structures of horizontal wavenumber $k$ (wavelength $1/k$ box widths); small $k$ is big eddies, large $k$ is
fine detail. `diagnostics.spectrum_h` takes, for every $z$-plane:

1. the three velocity components, each multiplied by a **Hann window** $\sin^2\pi x\,\sin^2\pi y$ (the box
   is not periodic in $x,y$, and a Fourier transform of a field that jumps at the edges would leak energy to all
   wavenumbers; the window fades the field to zero at the walls);
2. a 2D FFT in $(x,y)$ and the energy $\tfrac12|\hat{\mathbf u}|^2$ of every Fourier mode;
3. binning of the modes in shells of $|k|=\sqrt{k_x^2+k_y^2}$ rounded to an integer;

and averages over the planes. The result is divided by the mean of the squared window so a statistically
uniform field keeps its energy. The windowed total is not the energy of the field, because the window weights the centre of the box more than
the edges; the printout compares the two for this flow. The cells inside the cylinder are set to zero
before windowing (`fluid` mask), so only the fluid is counted.
""", code=r'''
spec = {k: diagnostics.spectrum_h(U_end[k], p_run[k]["h"], fluid_end[k]) for k in ("2D", "3D")}
for _k2 in spec:
    _Eh = diagnostics.energy(U_end[_k2], p_run[_k2]["h"], p_run[_k2]["Lz"], fluid_end[_k2])
    print(f"{_k2}: sum of E_k = {spec[_k2][1].sum():.5f},  fluid energy per unit span = {_Eh:.5f}   "
          f"(windowed total / energy = {spec[_k2][1].sum() / _Eh:.3f})")

figure([dict(type="scatter", mode="lines+markers", x=spec[k][0][1:], y=spec[k][1][1:], name=k) for k in ("2D", "3D")],
       title="Horizontal energy spectrum at the end of the run (k >= 1)", xaxis=dict(title="k (units of 2 pi / L)", type="log"),
       yaxis=dict(title="E(k)", type="log"))
'''),

# =====================================================================================================
dict(title="2D versus 3D: histories of torque, energy and enstrophy", md=r"""
**Three integral measures over time** for the 2D baseline and the 3D run:

- **torque** on the cylinder per unit span about its axis (momentum exchange for the lattice Boltzmann solver,
  the penalisation force for finite volumes): how hard the fluid resists the spin and the orbit;
- **kinetic energy** $E$ per unit span;
- **enstrophy** $Z$ per unit span, which is large where the flow has strong velocity gradients (thin boundary
  layers, shear layers).

Per unit span means both runs are on the same footing even though their spans differ. The curves start from
rest, so the early part reflects the start-up of the flow and the later part, if the run is long enough, the
developed motion. The printed table gives the final values of the two runs and their difference. No further
interpretation is added here.
""", code=r'''
_final = lambda key, name: float(hist_run[key][name][-1])
print("quantity        2D            3D            3D - 2D")
for _name in ("torque", "E", "Z"):
    _a, _b = _final("2D", _name), _final("3D", _name)
    print(f"{_name:8s} {_a:13.5e} {_b:13.5e} {_b - _a:13.3e}")
print(f"time reached: 2D {hist_run['2D']['t'][-1]:.3f}, 3D {hist_run['3D']['t'][-1]:.3f}")

figure([dict(type="scatter", x=hist_run[k]["t"], y=hist_run[k]["torque"], name=k) for k in ("2D", "3D")],
       title="Torque of the fluid on the cylinder (per unit span)", xaxis=dict(title="time"), yaxis=dict(title="torque"))
figure([dict(type="scatter", x=hist_run[k]["t"], y=hist_run[k]["E"], name=k) for k in ("2D", "3D")],
       title="Kinetic energy per unit span", xaxis=dict(title="time"), yaxis=dict(title="E"))
figure([dict(type="scatter", x=hist_run[k]["t"], y=hist_run[k]["Z"], name=k) for k in ("2D", "3D")],
       title="Enstrophy per unit span", xaxis=dict(title="time"), yaxis=dict(title="Z"))
'''),
]
