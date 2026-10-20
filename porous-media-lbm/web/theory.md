## 1. The physical picture

Packed beds are everywhere in chemical engineering: catalytic reactors, adsorbers, ion-exchange columns, filters,
chromatography. Design work treats them as a **continuum**. A pressure-drop correlation (Ergun) gives the pumping cost,
and an axial dispersion coefficient $D_L$, or a number of tanks in series, gives the spread of residence times. Both are
averages over a pore structure that nobody solves directly.

This page solves it directly. The Navier–Stokes equations are integrated **inside the pores**, around every particle,
and the continuum quantities are then *measured* from the result:

- **Permeability.** With the flow known everywhere, the superficial velocity $U_s$ and the driving force give $k$ through Darcy's law (§7).
- **Channeling.** The velocity field is far from uniform. A few wide, connected paths carry most of the flow while
  narrow throats and the wakes behind particles are almost stagnant. The correlations hide this, but it controls dispersion.
- **Residence-time distribution.** A tracer pulse released at the inlet spreads as it moves through the bed. Its spread
  measures $D_L$ (§9).

The bed is **two-dimensional**: a layer of parallel cylinders seen end-on, rather than spheres. 2D keeps the problem
small enough to run live and to look at, and all the ideas carry over. The quantitative differences from 3D are
discussed where they matter (§2, §9). In 2D, touching particles would close the pores completely, so the
particles keep a minimum gap. That is also why 2D beds need higher porosities ($\varepsilon \gtrsim 0.5$) than real
packings ($\varepsilon \approx 0.4$).

## 2. Darcy, Kozeny–Carman and Ergun

**Darcy's law.** In slow flow the pressure gradient is proportional to the superficial velocity:

$$
-\frac{\mathrm dp}{\mathrm dx} = \frac{\mu}{k}\,U_s .
$$

The **permeability** $k$ (units m², or darcy, $1\,\mathrm D \approx 0.987\times10^{-12}\,\mathrm m^2$) is a property of the
geometry alone. Dimensional analysis says $k = d^2\,\phi(\varepsilon, \text{shape, arrangement})$, so the page reports
$k/d^2$.

**Kozeny–Carman: the capillary-bundle model.** Replace the pore space by a bundle of tortuous tubes with the same
volume and wetted surface as the pores. Their **hydraulic radius** is pore volume per wetted area:

$$
r_h = \frac{\varepsilon}{a_s(1-\varepsilon)},\qquad a_s = \frac{\text{particle surface}}{\text{particle volume}} =
\begin{cases} 6/d & \text{spheres}\\ 4/d & \text{cylinders (disks in 2D)}\end{cases}
$$

Laminar flow in a tube gives a mean velocity proportional to $r_h^2\,\Delta p/L_e$. The fluid in the pores moves at
$U_s/\varepsilon$ along paths of length $L_e > L$. Collecting the shape factor and the tortuosity $(L_e/L)^2$ into one
**Kozeny constant** $K$:

$$
k = \frac{\varepsilon^3}{K\,a_s^2\,(1-\varepsilon)^2}.
$$

For random packings of spheres $K \approx 5$ (Carman). Ergun's value is $K = 150/36 \approx 4.17$, which turns
$a_s = 6/d$ into the familiar **Blake–Kozeny** term $150\,\mu U_s (1-\varepsilon)^2/(\varepsilon^3 d^2)$. The model
captures the strong $\varepsilon^3/(1-\varepsilon)^2$ dependence but not the geometry: $K$ is a fitted number.
For a 2D bed of disks it comes out much larger than 5 (try the porosity sweep). In 2D the flow cannot go *around*
a particle in the third dimension, so the paths are more tortuous and the throats narrower for the same porosity.

**Inertia: Ergun's equation.** As the Reynolds number grows, the fluid must also accelerate through the throats and loses
kinetic energy in the wakes. That adds a term quadratic in velocity (Forchheimer, and Burke–Plummer for spheres):

$$
-\frac{\mathrm dp}{\mathrm dx} = 150\,\frac{\mu U_s(1-\varepsilon)^2}{\varepsilon^3 d^2} + 1.75\,\frac{\rho U_s^2(1-\varepsilon)}{\varepsilon^3 d}.
$$

In terms of a friction factor and a modified Reynolds number this reads

$$
f' \equiv \frac{(-\mathrm dp/\mathrm dx)\,d}{\rho U_s^2}\,\frac{\varepsilon^3}{1-\varepsilon} = \frac{150}{Re'} + 1.75,
\qquad Re' = \frac{\rho U_s d}{\mu(1-\varepsilon)}.
$$

For disks the viscous coefficient becomes $K(a_s d)^2 = 16K$ instead of $36K = 150$. The *Reynolds sweep* fits both
coefficients from the simulation.

**Ordered arrays.** Square arrays of cylinders have accurate results. For dilute arrays there is Sangani & Acrivos's
series in the solid fraction $\phi = 1-\varepsilon$ (cylinder radius $a$):

$$
\frac{k}{a^2} = \frac{1}{8\phi}\left(-\ln\phi - 1.476 + 2\phi - 1.774\phi^2 + 4.076\phi^3\right).
$$

For dense arrays there is Gebart's lubrication result, $k = \frac{16}{9\pi\sqrt2}\left(\sqrt{\phi_{\max}/\phi} - 1\right)^{5/2}a^2$
with $\phi_{\max} = \pi/4$. These are used to check the solver (*Tests* tab and the *square array* preset).

## 3. The lattice-Boltzmann method

Instead of discretizing the Navier–Stokes equations, LBM simulates a fictitious gas whose averaged behaviour *is*
Navier–Stokes. Kinetic theory describes a gas by the distribution $f(\mathbf x, \boldsymbol\xi, t)$ of particles with
velocity $\boldsymbol\xi$. With the **BGK** collision model, the Boltzmann equation is

$$
\frac{\partial f}{\partial t} + \boldsymbol\xi\cdot\nabla f = -\frac{1}{\tau}\left(f - f^{\mathrm{eq}}\right),
$$

where collisions relax $f$ towards a local Maxwellian $f^{\mathrm{eq}}$ over a time $\tau$. The density and momentum are
its moments: $\rho = \int f\,\mathrm d\boldsymbol\xi$, $\rho\mathbf u = \int \boldsymbol\xi f\,\mathrm d\boldsymbol\xi$.

LBM keeps only a handful of velocities, chosen so that the moments that matter are still exact. On the **D2Q9** lattice
each cell holds nine populations $f_i$, moving with $\mathbf c_i \in \{(0,0), (\pm1,0), (0,\pm1), (\pm1,\pm1)\}$. With
weights $w_i = 4/9, 1/9, 1/36$ (rest, axis, diagonal), the lattice reproduces the Maxwellian moments up to fourth order
with sound speed $c_s = 1/\sqrt3$. The equilibrium is the Maxwellian expanded to second order in $\mathbf u$:

$$
f_i^{\mathrm{eq}} = w_i\,\rho\left(1 + 3\,\mathbf c_i\cdot\mathbf u + \tfrac92(\mathbf c_i\cdot\mathbf u)^2 - \tfrac32\,\mathbf u\cdot\mathbf u\right).
$$

Discretizing space and time with $\Delta x = \Delta t = 1$ along the characteristics gives the
**lattice-Boltzmann equation**, a collision followed by streaming:

$$
f_i(\mathbf x + \mathbf c_i, t+1) = f_i(\mathbf x, t) - \frac{1}{\tau}\left(f_i - f_i^{\mathrm{eq}}\right) .
$$

A multiscale (Chapman–Enskog) expansion shows that, for small Mach number $\mathrm{Ma} = |\mathbf u|/c_s$, the moments
obey the Navier–Stokes equations with

$$
p = \rho\,c_s^2,\qquad \nu = c_s^2\left(\tau - \tfrac12\right).
$$

The $-\tfrac12$ comes from the second-order accurate time discretization. The density varies by $O(\mathrm{Ma}^2)$,
so the flow is weakly compressible. At $\mathrm{Ma} \lesssim 0.1$ that error is negligible.

Why this suits a GPU: **collision is local** (only the cell's own nine numbers) and **streaming only touches nearest
neighbours**. Each cell can be updated by its own thread with no communication beyond reading eight neighbours.
There is no pressure Poisson equation to solve, unlike in incompressible Navier–Stokes solvers.

## 4. Boundaries and the driving force

**Solid walls: halfway bounce-back.** A population that would stream into a solid cell is reflected back to where
it came from, reversed:

$$
f_{\bar\imath}(\mathbf x, t+1) = f_i^*(\mathbf x, t)\quad\text{if } \mathbf x + \mathbf c_i \text{ is solid},
$$

where $\bar\imath$ is the opposite direction and $^*$ means post-collision. The round trip takes one step, so the
no-slip wall effectively sits **halfway** between the last fluid node and the first solid node. The rule is purely
local, so walls of any shape cost nothing extra. That is why LBM is a natural choice for porous media. Curved surfaces become
staircases at the resolution of the grid, costing a few percent at $D \approx 20$ cells per diameter (the Sangani–Acrivos
check). Interpolated schemes (Bouzidi, Ginzburg) remove most of this error at some cost in simplicity.

**Periodic domain and body force.** The domain is periodic in $x$ (and in $y$ unless walls are chosen). A periodic
domain cannot hold a mean pressure drop, so the flow is driven instead by a uniform **body force** $g$ per unit volume,
which is equivalent to $-\mathrm dp/\mathrm dx$. Guo's scheme adds it to second order. The velocity includes half the
force,

$$
\rho\mathbf u = \sum_i f_i\mathbf c_i + \tfrac12\mathbf F,
$$

and the collision gains a source $\left(1-\tfrac{1}{2\tau}\right)S_i$ with $S_i = w_i\left[3(\mathbf c_i - \mathbf u) + 9(\mathbf c_i\cdot\mathbf u)\mathbf c_i\right]\cdot\mathbf F$.
With TRT the source is split into symmetric and antisymmetric parts just like the populations (§5).

## 5. Accuracy: BGK, TRT and the "magic" parameter

With BGK, one rate $1/\tau$ controls both the viscosity *and* where the bounce-back wall effectively sits. The
effective wall position drifts with $\tau$. In a packed bed this makes the computed **permeability depend on the
viscosity**, which is unphysical. The error is several percent for $\tau \gtrsim 1$ (see Python step 7).

The **two-relaxation-time (TRT)** model separates the two roles. Every pair of opposite populations is split into a
symmetric (even) and an antisymmetric (odd) part,

$$
f_i^{\pm} = \tfrac12\left(f_i \pm f_{\bar\imath}\right),\qquad
f_i^* = f_i - \omega^+\left(f_i^+ - f_i^{\mathrm{eq}+}\right) - \omega^-\left(f_i^- - f_i^{\mathrm{eq}-}\right).
$$

- The even rate $\omega^+ = 1/\tau$ sets the viscosity.
- The odd rate $\omega^-$ is a free parameter. Ginzburg showed that the steady solution depends only on the combination
  $$
  \Lambda = \left(\frac{1}{\omega^+} - \frac12\right)\left(\frac{1}{\omega^-} - \frac12\right).
  $$
  Holding $\Lambda$ fixed while changing $\tau$ therefore gives exactly the same steady flow, and the same permeability.
  - $\Lambda = 3/16$ puts the bounce-back wall exactly halfway for straight channels: plane Poiseuille flow is reproduced to machine precision.
  - $\Lambda = 1/4$ is the most stable choice, and is used for the tracer.
  - BGK is the special case $\omega^- = \omega^+$, so $\Lambda = (\tau - \frac12)^2$ changes with $\tau$.

This freedom is used in the Reynolds sweep. To reach high $Re$ at a safe lattice velocity ($|\mathbf u| \lesssim 0.05$),
the viscosity is lowered, which changes nothing else.

**Stability and the Mach number.** The scheme needs $\tau > \tfrac12$. Close to $\tfrac12$ (low viscosity, high
Reynolds numbers) BGK becomes unstable; TRT is more robust. Compressibility errors scale as $\mathrm{Ma}^2$, so the page
reports $|\mathbf u|_{\max}/c_s$. In a bed the peak pore velocity is often 5–10 times the superficial velocity.

**Float32 on the GPU.** The populations are of order $w_i \approx 0.1$, while velocity information sits in differences
of order $10^{-4}$. Single precision has about 7 digits, so 3–4 of them would be lost. The GPU code therefore stores
$h_i = f_i - w_i$, the deviation from fluid at rest, and writes the equilibrium so that no $O(1)$ terms cancel. The
GPU vs Python tab shows that this keeps the velocity within about $10^{-6}$ of the float64 reference.

## 6. Units and dimensional matching

In lattice units $\Delta x = \Delta t = 1$, the reference density is 1, and a particle spans $D$ cells. A physical bed (diameter $d_p$, fluid
viscosity $\nu_{\mathrm{phys}}$) maps onto the lattice by matching dimensionless groups:

$$
\Delta x = \frac{d_p}{D},\qquad
\Delta t = \frac{\nu_{\mathrm{lat}}\,\Delta x^2}{\nu_{\mathrm{phys}}},\qquad
Re_p = \frac{U_s d}{\nu},\qquad Pe_m = \frac{u\,d}{D_m}.
$$

Any lattice run with the same $Re_p$, $Pe_m$ and geometry represents the physical bed exactly. Lattice speeds must stay
small (low Mach number), so a given $Re_p$ is reached with the largest viscosity the accuracy allows. In creeping flow
($Re_p \ll 1$) only the geometry matters, and $k/d^2$ is universal. The pressure gradient in SI units follows from
$-\mathrm dp/\mathrm dx = \rho\,g_{\mathrm{lat}}\,\Delta x/\Delta t^2$.

## 7. Measuring the permeability

With the body force in the role of the pressure gradient, Darcy's law gives

$$
k = \frac{\nu\,U_s}{g},\qquad U_s = \frac{1}{A}\int_A u_x\,\mathrm dA ,
$$

where $U_s$ is the **superficial** velocity: $u_x$ averaged over the whole domain, solid cells (where $u = 0$) included.
Starting from rest, momentum diffuses through the pores in about one viscous time $d^2/\nu$. The page calls the flow
steady when $k$ changes by less than $2\times10^{-4}$ over half a viscous time.

With the *Adjust the driving force* option, $g$ is then rescaled to hit the requested $Re_p$. This is exact in creeping
flow and iterates in a few rounds once inertia matters. Comparing the measured $k$ with Kozeny–Carman defines the bed's
Kozeny constant, $K = \varepsilon^3 / (k\,a_s^2(1-\varepsilon)^2)$.

## 8. Tracer transport

A passive tracer of concentration $c$ obeys the advection–diffusion equation

$$
\frac{\partial c}{\partial t} + \mathbf u\cdot\nabla c = D_m\,\nabla^2 c .
$$

It is solved with its own lattice on the same grid: **D2Q5** (rest plus four neighbours, $w_0 = 1/3$, $w_{1..4} = 1/6$,
$c_s^2 = 1/3$), with the linear equilibrium

$$
g_i^{\mathrm{eq}} = w_i\,c\,\left(1 + 3\,\mathbf c_i\cdot\mathbf u\right).
$$

Here the *odd* moment carries the advective flux, and the odd relaxation rate sets the diffusivity,
$D_m = c_s^2(1/\omega^- - \tfrac12)$. The even rate follows from $\Lambda = 1/4$. The velocity $\mathbf u$ is read from the
flow solver every step.

The linear equilibrium leaves a small anisotropic error,
$D_{xx}^{\mathrm{eff}} = (c_s^2 - u_x^2)(1/\omega^- - \tfrac12)$, which is under 1 % for $u < 0.05$. The Python tests
check this exactly.

Boundary conditions:
- **Particles** are bounce-back walls for the tracer too, which means zero flux into the solid.
- **Inlet** ($x = 0$): the column is held at equilibrium with the pulse concentration $c_{\mathrm{in}}(t)$, which is 1 for
  $t_p$ steps and 0 afterwards.
- **Outlet**: zero gradient. A population that would come from beyond the outlet is copied from the outlet cell itself.
- Unlike the flow, the tracer is **not periodic** in $x$.

For the scheme to be stable and positive, the grid Péclet number $|\mathbf u|\Delta x/D_m$ should not be too large.
The page warns when $D_m$ falls below about 0.002 lattice units.

## 9. Residence-time distribution and axial dispersion

A detector records the **cup-mixing** (flow-weighted) concentration across a column $x$,
$\bar c(t) = \int u_x c\,\mathrm dy\big/\!\int u_x\,\mathrm dy$, which is what leaves the column per unit flow. Normalising gives the
**exit-age distribution** and its moments:

$$
E(t) = \frac{\bar c(t)}{\int_0^\infty \bar c\,\mathrm dt},\qquad \bar t = \int_0^\infty t\,E\,\mathrm dt,\qquad
\sigma^2 = \int_0^\infty (t - \bar t)^2E\,\mathrm dt,\qquad F(t) = \int_0^t E\,\mathrm dt' .
$$

Two practical corrections are applied:
- **Pulse width.** The input is a square pulse of width $t_p$ rather than a delta. Convolution adds $t_p/2$ to the mean
  and $t_p^2/12$ to the variance, and both are subtracted.
- **Tails.** Fluid trapped behind particles and in dead-end pores releases tracer slowly, giving a long, nearly
  exponential tail. The variance weights late times heavily, so truncating the tail biases it low. Beyond the last
  sample the signal is extended as $\bar c_T\,e^{-(t-T)/\lambda}$, with $\lambda$ fitted to the last quarter of the record.

**The axial dispersion model** treats the bed as plug flow at the interstitial velocity $u$ plus a Fickian dispersion
coefficient $D_L$ that lumps all mixing mechanisms:

$$
\frac{\partial c}{\partial t} + u\frac{\partial c}{\partial x} = D_L\frac{\partial^2 c}{\partial x^2},\qquad Pe = \frac{u L}{D_L}.
$$

Its response to a pulse depends on the boundary conditions at the bed ends (open or closed). The page sidesteps
them with the **two-detector method**. Between two planes *inside* the bed, means and variances add, and for the
dispersion model

$$
\Delta\bar t = \frac{\Delta x}{u},\qquad \Delta\sigma^2 = \frac{2D_L\,\Delta x}{u^3}\quad\Longrightarrow\quad
\frac{\Delta\sigma^2}{\Delta\bar t^{\,2}} = \frac{2}{Pe},\qquad D_L = \frac{\Delta\sigma^2\,\Delta x^2}{2\,\Delta\bar t^{\,3}},
$$

whatever happens upstream of the first detector or downstream of the second. The **tanks-in-series** model with the
same variance has $N = \Delta\bar t^{\,2}/\Delta\sigma^2 = Pe/2$. Its response is the gamma distribution
$E(\theta) = N^N\theta^{N-1}e^{-N\theta}/\Gamma(N)$ in $\theta = t/\bar t$. The RTD tab overlays both models on the
measured $E(\theta)$. They match the peak but not the long tail, which comes from stagnant pockets that neither model has.

**What controls $D_L$?**

- **Molecular diffusion** dominates at very low $Pe_m$: $D_L/D_m \to \varepsilon/\text{tortuosity}$, below 1.
- **Mechanical dispersion** dominates in the usual range. Fluid elements take different paths at different speeds, so
  $D_L \propto u\,d$ and $D_L/D_m$ grows roughly in proportion to $Pe_m$. For random packings of spheres the classic
  correlation is $D_L/D_m \approx 0.7 + 0.5\,Pe_m$, which is a particle Péclet number $u d/D_L \approx 2$.
- **Stagnant zones and boundary layers** add contributions that grow faster than $Pe_m$ (holdup dispersion). They give
  the long tails seen here, and are stronger in 2D because the flow cannot go around particles in the third direction.

**Taylor–Aris check.** In the empty-channel preset, plane Poiseuille flow between walls a distance $h$ apart spreads a
tracer far more than diffusion alone. The velocity profile shears the pulse, and transverse diffusion averages it out.
Taylor and Aris showed that the result is again Fickian, with

$$
D_{\mathrm{eff}} = D_m\left(1 + \frac{Pe_h^2}{210}\right),\qquad Pe_h = \frac{U h}{D_m},
$$

once $t \gg h^2/D_m$. The RTD tab prints this prediction next to the measured value. The same preset checks the
flow: the permeability of a plane channel is $k = h^2/12$ (per unit open width), or $(h^2 + \tfrac12)/12$ exactly when the
parabola is averaged over the $h$ cell centres, as the lattice does. Mechanical dispersion in a packed bed is the same idea:
velocity differences between flow paths, smoothed out by diffusion across them.

**Wall channeling.** Next to a flat wall particles cannot pack as tightly, so the porosity is higher and the flow faster
there. In narrow tubes ($d_t/d_p \lesssim 10$) this bypass shows up as an early shoulder in the RTD. Try the
*bed between two walls* preset.

## 10. The GPU implementation in brief

One time step is two kernels, each one GPU thread per lattice cell. (The *WebGPU* tab shows them in full.)

1. **`flow_step`** does pull streaming with bounce-back, moments, and TRT collision with Guo forcing. It reads from one
   buffer of populations and writes the next ("ping-pong"), so no thread ever overwrites data that another thread
   still needs. It also stores $(u_x, u_y, \rho)$ per cell for the tracer and the display.
2. **`tracer_step`** does the same for the five tracer populations, using the velocity just written.

Each step reads and writes about 200 bytes per cell and does a few hundred floating-point operations. The GPU is
therefore limited by **memory bandwidth**, not arithmetic. Populations are stored structure-of-arrays (all $f_1$, then
all $f_2$, …), so that neighbouring threads touch neighbouring addresses and the memory system can combine their accesses.
The canvas is coloured by a fragment shader that reads the same buffers, so nothing is copied back to JavaScript. Only
a few kilobytes of reduced statistics (sums for $U_s$, detector signals) are read back, about ten times a second.

## 11. Using the page

- **App → Flow field.** The live simulation.
  - Pause/restart, re-seed the bed, add or remove particles with the mouse.
  - Switch the view between speed, vorticity, tracer and pressure.
  - The charts show the permeability converging and the detector signals after a pulse.
- **App → Tracer & RTD.** $E(\theta)$, $F(\theta)$, the moment analysis and the fitted Péclet number / number of tanks.
- **App → Permeability & Ergun.** A porosity sweep (Kozeny–Carman) and a Reynolds sweep (Ergun), each run to steady
  state on the GPU.
- **Python (step by step).** The numpy reference, with an editable MoLab notebook.
- **GPU vs Python.** The same case run by the shaders and by numpy, compared cell by cell.
- **Performance.** WebGPU vs JavaScript vs numpy, in million lattice updates per second.

## References

- T. Krüger, H. Kusumaatmaja, A. Kuzmin, O. Shardt, G. Silva, E. M. Viggen, *The Lattice Boltzmann Method: Principles and Practice*, Springer (2017).
- S. Succi, *The Lattice Boltzmann Equation for Complex States of Flowing Matter*, Oxford (2018).
- I. Ginzburg, F. Verhaeghe, D. d'Humières, *Two-relaxation-time lattice Boltzmann scheme: about parametrization, velocity, pressure and mixed boundary conditions*, Commun. Comput. Phys. 3, 427–478 (2008).
- I. Ginzburg, *Equilibrium-type and link-type lattice Boltzmann models for generic advection and anisotropic-dispersion equation*, Adv. Water Resour. 28, 1171–1195 (2005).
- Z. Guo, C. Zheng, B. Shi, *Discrete lattice effects on the forcing term in the lattice Boltzmann method*, Phys. Rev. E 65, 046308 (2002).
- S. Ergun, *Fluid flow through packed columns*, Chem. Eng. Prog. 48, 89–94 (1952).
- P. C. Carman, *Fluid flow through granular beds*, Trans. Inst. Chem. Eng. 15, 150–166 (1937).
- A. S. Sangani, A. Acrivos, *Slow flow past periodic arrays of cylinders with application to heat transfer*, Int. J. Multiphase Flow 8, 193–206 (1982).
- B. R. Gebart, *Permeability of unidirectional reinforcements for RTM*, J. Compos. Mater. 26, 1100–1133 (1992).
- G. I. Taylor, *Dispersion of soluble matter in solvent flowing slowly through a tube*, Proc. R. Soc. A 219, 186–203 (1953); R. Aris, Proc. R. Soc. A 235, 67–77 (1956).
- O. Levenspiel, *Chemical Reaction Engineering*, 3rd ed., Wiley (1999), Ch. 11–14.
- H. S. Fogler, *Elements of Chemical Reaction Engineering*, 6th ed., Pearson (2020), Ch. 16–18.
- R. B. Bird, W. E. Stewart, E. N. Lightfoot, *Transport Phenomena*, 2nd ed., Wiley (2002), §6.4.
- J. M. P. Q. Delgado, *A critical review of dispersion in packed beds*, Heat Mass Transfer 42, 279–310 (2006).
