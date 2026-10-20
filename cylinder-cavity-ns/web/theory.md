## 1. The problem

A closed square box of side $L$ is filled with an incompressible Newtonian fluid. A cylinder of radius $R$
moves inside it in two ways, which can be combined:

- it **spins** about its own axis with angular velocity $\Omega$, so its surface speed is $U_s = \Omega R$;
- its centre **orbits** the centre of the box on a circle of radius $r_o$, at speed $U_o = \omega_o r_o$.

The walls are at rest, and nothing else drives the flow. With lengths scaled by $L$ and velocities by $U$, the
**incompressible Navier–Stokes equations** are

$$\frac{\partial \mathbf u}{\partial t} + \nabla\cdot(\mathbf u\,\mathbf u) = -\nabla p + \frac{1}{Re_L}\nabla^2\mathbf u,
\qquad \nabla\cdot\mathbf u = 0 ,$$

with no slip on the walls ($\mathbf u = 0$) and on the cylinder ($\mathbf u = \mathbf u_b$, the rigid-body
velocity). The page uses the **cylinder Reynolds number**

$$Re = \frac{U\,2R}{\nu}, \qquad U = \max(|U_s|, |U_o|),$$

and computes $\nu$ from it. The pressure $p$ (divided by the density) is not a thermodynamic variable here. It is
the Lagrange multiplier that keeps the velocity divergence-free.

## 2. Finite volumes on a staggered grid

The box is cut into $N\times N$ square cells of side $h = 1/N$. The equations are integrated over each control
volume, and the divergence theorem turns volume integrals of derivatives into **fluxes through the faces**.
What leaves one cell enters its neighbour, so mass and momentum are conserved by construction.

The unknowns are **staggered** (the MAC grid of Harlow & Welch, 1965):

| unknown | stored at | count |
|---|---|---|
| $u$ | centres of the vertical faces | $N(N+1)$ |
| $v$ | centres of the horizontal faces | $(N+1)N$ |
| $p$ | cell centres | $N^2$ |

For a cell $(i,j)$, the discrete divergence uses only the four velocities on its own faces:

$$(\nabla\cdot\mathbf u)_{ij} = \frac{u_{i+1,j}-u_{ij}}{h} + \frac{v_{i,j+1}-v_{ij}}{h}.$$

The pressure gradient on a face uses only the two cells that share it. With all variables at the cell centres
instead, the centred pressure gradient would skip a cell, and a checkerboard pressure would have zero
gradient and go unnoticed. Staggering removes that spurious mode without any extra stabilisation.

**Momentum fluxes.** The $u$-equation lives on a control volume centred on a $u$ face. Its convective flux
through, say, the east side is (transport velocity) × (transported $u$), $F_e = \bar u_e\,u_e$. Here $\bar u_e$
is the average of the two neighbouring $u$ values, and $u_e$ is the **reconstructed face value** (§3). The
viscous flux is the 5-point difference. Then

$$R_{ij} = -\frac{F_e - F_w + F_n - F_s}{h} + \nu\,\frac{u_{i+1,j}+u_{i-1,j}+u_{i,j+1}+u_{i,j-1}-4u_{ij}}{h^2}.$$

**Walls by ghost values.** Two layers of ghost values surround the box:
- the normal velocity is mirrored with a sign change across the wall it sits on;
- the tangential velocity is mirrored with a sign change across a wall half a cell away, which makes its
  average, the wall value, zero.

The same rule ($u_{\text{ghost}} = -u_{\text{mirror}}$) serves both, so every interior formula also works next
to a wall.

## 3. Advection: MUSCL reconstruction with the minmod limiter

At high Reynolds numbers convection dominates, and the face value $u_e$ decides whether the scheme is stable and sharp.
For a face between nodes $a$ (upwind) and $b$, with the next upwind node $a^-$,

$$u_e = a + \tfrac12\,\mathrm{minmod}(a - a^-,\; b - a), \qquad
\mathrm{minmod}(x,y) = \begin{cases} \mathrm{sign}(x)\min(|x|,|y|) & xy > 0\\ 0 & \text{otherwise.}\end{cases}$$

Where the field is smooth this is a second-order upwind-biased extrapolation. At an extremum the slope is
set to zero, which locally reverts to first-order upwind. The scheme is **total-variation diminishing**: it
creates no new maxima or minima, so it does not generate the grid-scale oscillations that wreck central
differencing at high $Re$. The price is some numerical diffusion where the solution is under-resolved. In
effect it acts as a built-in sub-grid model (§8).

## 4. Time integration and projection

Each time step is a **fractional step** (Chorin's projection method):

1. **Momentum without pressure**, by variable-step Adams–Bashforth 2:
   $$\mathbf u^* = \mathbf u^n + \Delta t\left[\left(1+\tfrac r2\right)\mathbf R^n - \tfrac r2\,\mathbf R^{n-1}\right],\qquad r = \frac{\Delta t_n}{\Delta t_{n-1}}.$$
2. **Body** (§6): $\mathbf u^{**} = \mathbf u^* + \chi\,(\mathbf u_b - \mathbf u^*)$.
3. **Pressure Poisson equation** for $q = \Delta t\,p$:
   $$\nabla^2 q = \nabla\cdot\mathbf u^{**}, \qquad \frac{\partial q}{\partial n} = 0 \text{ on the walls}.$$
4. **Projection:** $\mathbf u^{n+1} = \mathbf u^{**} - \nabla q$.

On the MAC grid $\nabla\cdot\nabla$ *is* the 5-point Laplacian with zero-flux walls. So if step 3 is solved
exactly, $\nabla\cdot\mathbf u^{n+1} = 0$ to round-off. The page shows the divergence that is left over,
$\max|\nabla\cdot\mathbf u|$, in the metric cards. It comes from solving step 3 only approximately (two
V-cycles per step).

**Time step.** Explicit methods are stable only for small enough $\Delta t$. Two limits are combined:

$$\Delta t = \left(\frac{U_{\max}}{0.3\,h} + \frac{\nu}{0.05\,h^2}\right)^{-1}.$$

$U_{\max} = |U_s| + |\omega_o|(r_o+R)$ is the fastest point of the body.
- The first term is the CFL condition: a fluid particle crosses at most 0.3 cells per step.
- The second is a diffusion limit. For pure diffusion AB2 would be stable up to $\nu\Delta t/h^2 = 0.125$, but its
  stability region is narrow near that end of the real axis, so advection and diffusion together need a margin.

Taking the smaller of the two limits was not enough: runs near $Re \approx 100$ at $N = 128$, where the two limits are
equal, blew up. Adding the reciprocals halves $\Delta t$ there and leaves it unchanged where one limit
dominates. At the Reynolds
numbers of interest the CFL limit wins, so the number of steps per unit time grows like $N$, and the total
work like $N^3$.

## 5. Multigrid

The Poisson equation is elliptic: every cell influences every other. Gauss–Seidel removes error components
whose wavelength is a few cells within a few sweeps. Smooth error, though, decays by a factor of only
about $1 - O(h^2)$ per sweep. **Geometric multigrid** turns this weakness into a strength: smooth error on a
fine grid is rough on a coarser grid. One **V-cycle**:

1. 2 red–black Gauss–Seidel sweeps on the fine grid;
2. residual $r = b - Lx$, restricted to the grid with cells twice as wide (average of the 4 children);
3. recursively solve $L_{2h}e = r_{2h}$, down to $4\times4$ (where 40 sweeps are essentially exact);
4. interpolate the correction back (bilinear, weights $\tfrac34,\tfrac14$ in each direction) and add it;
5. 2 more sweeps.

The residual falls by a factor of about 0.07 per cycle, independent of $N$, and the cost is $O(N^2)$. Each step
is warm-started from the previous $q$, so two cycles per time step are enough.

The pure-Neumann problem is singular: $q$ is defined only up to a constant. It is solvable because
$\sum\nabla\cdot\mathbf u^{**} = 0$ (no flow through the walls). The coarsest level removes its mean, which
fixes the constant.

## 6. The moving cylinder: Brinkman volume penalisation

Fitting a grid to a moving body would mean remeshing every step. Instead the body is represented by a
**mask** on the fixed grid,

$$\chi(\mathbf x, t) = \tfrac12\left[1 - \tanh\frac{|\mathbf x - \mathbf c(t)| - R}{\epsilon}\right],\qquad \epsilon = h,$$

and a penalisation term is added to the momentum equation:

$$\frac{\partial\mathbf u}{\partial t} = \dots - \frac{\chi}{\eta}(\mathbf u - \mathbf u_b), \qquad
\mathbf u_b = \omega_o\,\hat z\times(\mathbf c - \mathbf c_0) + \Omega\,\hat z\times(\mathbf x - \mathbf c).$$

The body is a porous region with permeability $\eta$. Angot, Bruneau & Fabrie (1999) proved convergence to the
no-slip solution as $\eta\to 0$, with an error of $O(\sqrt{\nu\eta})$. Taken implicitly over one step, the
term becomes $\mathbf u \leftarrow (\mathbf u + \tfrac{\Delta t}{\eta}\chi\mathbf u_b)/(1 + \tfrac{\Delta t}{\eta}\chi)$.
The page uses the limit $\eta\to 0$, which is $\mathbf u \leftarrow \mathbf u + \chi(\mathbf u_b - \mathbf u)$.
The projection that follows slightly disturbs the velocity inside the body; the walkthrough's last step
measures this. The smooth mask spreads the surface over about two cells, which is the main accuracy limit
near the body.

The force the body exerts on the fluid is $\mathbf f = \chi(\mathbf u_b - \mathbf u^*)/\Delta t$ per unit
volume. Summing $(\mathbf x - \mathbf c)\times\mathbf f$ gives the **torque**, plotted in the App tab
(as the torque of the fluid on the cylinder, $-\sum(\mathbf x - \mathbf c)\times\mathbf f\,h^2$). A spinning
cylinder feels a torque that opposes its spin. That torque is the power the motor would have to supply.

## 7. Regimes: from laminar to (2D) turbulent

There are no textbook transition values for this geometry; they depend on the cylinder size, the offset and the
mix of spin and orbit. These are the regimes we found in numpy runs at $N = 128$, $R = 0.1$, $r_o = 0.2$, over
10–20 time units, which the presets reproduce:

| case | what happens |
|---|---|
| spin only, $Re = 50$ | **steady**: the cylinder drags a ring of fluid round with it; viscous, closed streamlines |
| orbit only, $Re = 200$–$500$ | **steady in the frame of the cylinder**: an attached, recirculating wake travels with it. The probe sees only the orbit frequency and its harmonics |
| orbit only, $Re = 3000$ | **unsteady**: the wake sheds vortices that wander, merge and hit the walls; the probe spectrum fills in between the harmonics |
| spin only, $Re = 5000$ | **unsteady**: the swirling boundary layers on the walls separate into corner vortices |
| orbit + counter-spin, $Re = 10\,000$ | **chaotic**: many interacting vortices and thin filaments; energy and torque fluctuate strongly |

One effect delays the transition: an orbiting cylinder **sets the whole fluid swirling** in the direction of its
orbit. The kinetic energy rises over the first few orbits, as the plot in the App tab shows. Once the fluid
swirls along, the cylinder moves through it more slowly than $U_o$, so the effective Reynolds number is
below the nominal one, and the flow stays laminar to higher nominal $Re$ than the flow past a fixed cylinder
(which sheds vortices from $Re \approx 47$).

**Spinning versus orbiting: why even a slow orbit moves the whole box at once.** A circle spinning in place
displaces no fluid. The only thing that sets the fluid moving is viscous drag at its surface, so the motion spreads
outward by diffusion, over a distance of about $\sqrt{\nu t}$. At $Re = 562$ and $t = 0.13$ that is only about 0.01.
For a long time after the start, only a thin ring of fluid round the cylinder moves. A cylinder whose centre
*moves* must push fluid out of its way. Because the fluid is incompressible, the pressure (the projection of §4)
makes room *instantly*, and a displacement flow with speed of order $U_o(R/r)^2$ fills the whole box. In a
confined box it is stronger still, because the displaced fluid has to squeeze through the gap between the cylinder
and the walls. In the numpy reference ($N = 128$, $R = 0.2$, $r_o = 0.18$, $U_s = 1$, $t = 0.13$), the mean speed
more than 0.1 from the cylinder surface is 0.0006 with spin only, and 0.07 with an added orbit of just
$U_o = 0.2$. A gentle orbit therefore dominates the far field long before a fast spin does.

**2D is not 3D.** A two-dimensional flow has no vortex stretching. Enstrophy $Z = \tfrac12\int\omega^2$ is then an
inviscid invariant as well as energy, which produces a **dual cascade**: energy moves to *large* scales
(the inverse cascade, which builds big coherent vortices), and enstrophy moves to small scales, with an
energy spectrum close to $E(k)\propto k^{-3}$ (Kraichnan, 1967). Real flows round a cylinder in a box become
three-dimensional at moderate $Re$, so the chaotic regime here is a model of 2D turbulence (as in soap
films, stratified layers or planetary atmospheres), not of the flow in a real 3D cavity.

## 8. Turbulence modelling: DNS and implicit LES

**No explicit turbulence model is used.** The solver integrates the full unsteady Navier–Stokes equations of §1. The
only dissipation added on purpose is the molecular viscosity $\nu = U\,2R/Re$. There is no eddy viscosity, no
$k$–$\varepsilon$, and no Smagorinsky term. What the computation *is* depends on whether the grid can hold the
smallest eddies.

**Direct numerical simulation (DNS) where the grid resolves the flow.** A convenient measure is the **cell Reynolds
number**

$$Re_h = \frac{U h}{\nu} = Re\,\frac{h}{2R},$$

the Reynolds number of one grid cell. When $Re_h \lesssim 2$, viscosity smooths every gradient over at least a
couple of cells. Every eddy is then computed, nothing is modelled, and the limiter of §3 is essentially inactive.
Up to $Re_h \approx 30$ the large eddies and the boundary layers are still captured by several cells, so the
result remains a DNS, if a marginal one in the thinnest layers. The Reynolds-number card in the App tab shows
$Re_h$ and this classification live.

**Implicit large-eddy simulation (ILES) when the grid is too coarse.** At higher $Re_h$ the thinnest shear layers
are thinner than a cell. A central scheme would then produce grid-scale oscillations and blow up. The minmod
limiter instead switches to first-order upwinding wherever the field is steep or has a local extremum. First-order
upwinding behaves like an added diffusion of about $\nu_{\text{num}} \approx \tfrac12|u|\,h$ (the 1D estimate),
switched on only where the resolution runs out. That dissipation removes the energy and enstrophy that would have
cascaded to the unresolved scales. It plays the role of a sub-grid model, even though no model is written down.
This is **implicit LES**, also called MILES (*monotonically integrated LES*; Boris et al., 1992; Grinstein, Margolin
& Rider, 2007).

| preset | $Re$ | $N$ | $Re_h$ | what the computation is |
|---|---|---|---|---|
| spinning, laminar | 50 | 256 | 1.0 | DNS, fully resolved |
| orbiting, laminar wake | 300 | 256 | 5.9 | DNS |
| orbiting, vortex shedding | 3000 | 256 | 59 | implicit LES |
| spinning, unsteady | 5000 | 512 | 49 | implicit LES |
| orbit + counter-spin, chaotic | 10 000 | 512 | 98 | implicit LES |

**What to trust in the implicit-LES runs.** The large vortices are well represented: their number, size, path and
lifetime, the swirl of the whole box, and the qualitative regime. Quantities set by the small scales will change if
the grid is refined, because the limiter's dissipation shrinks as $h$ does: peak vorticity, enstrophy, the
high-frequency tail of the probe spectrum, and the sharpness of the dye filaments. Run the same preset at two grid
sizes to see which features survive.

**Why not a standard turbulence model?** RANS models ($k$–$\varepsilon$, $k$–$\omega$, Spalart–Allmaras) solve
for the *time-averaged* flow and represent all the eddies by an eddy viscosity. They would average away exactly the
unsteady vortices this page is about. Their constants are calibrated on three-dimensional turbulence, whose
energy cascades to small scales, whereas in 2D energy cascades to *large* scales (§7). An explicit LES model, for
example Smagorinsky's $\nu_t = (C_s\Delta)^2|\bar S|$, could be added to $\nu$. On this grid it would add
dissipation on top of the limiter's, and $C_s$ would still have to be calibrated for 2D flow. For a teaching code
in which all dissipation comes either from the physics or from a scheme property you can explain in a paragraph,
DNS/ILES is the more honest choice.

The method is second order in space (first order at extrema, where the limiter is active), second order
in time for the convective and viscous terms, and first order in the splitting and penalisation errors.
The *Validation* tab checks the implementation, not the physics: the WebGPU and CPU solvers against the numpy
reference, value by value.

## 9. Seeing the velocity: pathlines, streaklines, streamlines

A colour map of the speed $|\mathbf u|$ hides the direction. Three classical families of curves show it, and they
coincide only in **steady** flow:

| curve | definition | how you would see it |
|---|---|---|
| **pathline** | the trajectory of one fluid particle, $\mathrm d\mathbf x_p/\mathrm dt = \mathbf u(\mathbf x_p, t)$ | a long-exposure photograph of one tracer |
| **streakline** | all particles that passed through one fixed point | dye injected continuously at a point |
| **streamline** | a curve tangent to $\mathbf u(\cdot, t)$ at one instant | the field at one frozen moment |

The App tab's **flow particles** draw pathlines with a fading memory. Each of many tracers is moved with the
current velocity every frame, by midpoint RK2 over the simulated time the frame covered, and each step adds a
short segment to a trail that fades a little every frame. The trail therefore shows where the particle came from
over the last few dozen frames; the *trail length* slider sets how many. Its direction is the flow direction. Its length grows with the speed, and so does its darkness, as
$\sqrt{|\mathbf u|/2u_{\text{rms}}}$. The square root keeps the slow far field visible next to a fast-spinning cylinder. The **dye** field shows the same thing collectively: an initially striped fluid
being stretched and folded, a streakline-like picture of mixing.

The velocity at a particle comes from bilinear interpolation of each staggered component between its own four
nearest faces. The interpolated field inherits the wall ghost values, so it vanishes on the walls, and particles
do not leak out. It is not exactly divergence-free between grid points, so a dense cloud of particles slowly
develops gaps and clumps. Each particle is therefore re-seeded at a random point after a random lifetime of
2–4 time units, and whenever it ends up inside the cylinder.

## References

- F. H. Harlow, J. E. Welch, *Phys. Fluids* 8, 2182 (1965): the MAC staggered grid.
- A. J. Chorin, *Math. Comp.* 22, 745 (1968): the projection method.
- B. van Leer, *J. Comput. Phys.* 32, 101 (1979): MUSCL; P. L. Roe, *Annu. Rev. Fluid Mech.* 18, 337 (1986): limiters.
- A. Brandt, *Math. Comp.* 31, 333 (1977); W. L. Briggs et al., *A Multigrid Tutorial* (SIAM, 2000).
- P. Angot, C.-H. Bruneau, P. Fabrie, *Numer. Math.* 81, 497 (1999): volume penalisation.
- J. P. Boris, F. F. Grinstein, E. S. Oran, R. L. Kolbe, *Fluid Dyn. Res.* 10, 199 (1992): MILES.
- F. F. Grinstein, L. G. Margolin, W. J. Rider (eds.), *Implicit Large Eddy Simulation* (Cambridge, 2007).
- R. H. Kraichnan, *Phys. Fluids* 10, 1417 (1967); G. Boffetta, R. E. Ecke, *Annu. Rev. Fluid Mech.* 44, 427 (2012): 2D turbulence.
