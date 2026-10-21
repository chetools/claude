## 1. The problem and its nondimensional groups

### 1.1 The set-up

A closed square box, $x, y \in [0, L]$ with $L = 1$, is filled with an incompressible Newtonian fluid. The box is
extruded in the third direction $z$ over a **span** $L_z$. A cylinder of radius $R$ has its axis parallel to $z$ and
runs the whole span. As on the 2D page it moves in two ways, which can be combined:

- it **spins** about its own axis with angular velocity $\Omega = U_s/R$ (surface speed $U_s$);
- its centre **orbits** the box centre $(\tfrac12, \tfrac12)$ on a circle of radius $r_o$, with angular velocity
  $\omega_o = U_o/r_o$ (speed $U_o$).

The centre is at $\mathbf c(t) = (\tfrac12 + r_o\cos\varphi,\ \tfrac12 + r_o\sin\varphi)$ with $\varphi = \omega_o t$.
A point at $(x, y)$ inside the cylinder moves like a rigid body, with the same velocity as on the 2D page, plus a zero
$z$-component:

$$\begin{aligned}
u_b &= -\omega_o\,(c_y - \tfrac12) - \Omega\,(y - c_y),\\
v_b &= \phantom{-}\omega_o\,(c_x - \tfrac12) + \Omega\,(x - c_x),\\
w_b &= 0 .
\end{aligned}$$

In words: the first term of each line is the velocity of the centre (the orbit), the second is the extra velocity from
spinning about the centre. The cylinder does not move along $z$: it only turns and travels in the $(x,y)$ plane.
Everything else is at rest: the box walls do not move and nothing else drives the flow. All the motion in the box
comes from the viscous drag of the moving cylinder (and, for the orbit, from the fluid it has to push out of its way).

### 1.2 The nondimensional groups

Lengths are scaled by the box side $L$, velocities by $U_{\mathrm{ref}} = \max(|U_s|, |U_o|)$ (1 if both are zero) and
time by $L/U_{\mathrm{ref}}$. As on the 2D page the **cylinder Reynolds number** is

$$Re = \frac{U_{\mathrm{ref}}\, 2R}{\nu},$$

and the code computes $\nu = U_{\mathrm{ref}}\,2R/Re$ from it. With $L = 1$ and $U_{\mathrm{ref}} = 1$ the coefficient
of the viscous term in the dimensionless momentum equation is simply $\nu$, and this page writes $\nu$. (The Reynolds number built on the box
side would be $U_{\mathrm{ref}}L/\nu = Re/(2R)$; the page's controls and every number below use the cylinder Reynolds number $Re$.)

*Why the ratio $U\cdot 2R/\nu$ matters.* A fluid element moving at speed $U$ past a body of size $2R$ has
inertial acceleration of order $U^2/(2R)$. The viscous force per unit mass on the same element is of order
$\nu U/(2R)^2$. Their ratio is $U\,2R/\nu = Re$. For small $Re$ viscosity wins and the flow is smooth and
orderly; for large $Re$ inertia wins, thin boundary layers form, and the flow can become unsteady.

The complete list of groups that control the flow:

| group | meaning | role |
|---|---|---|
| $Re$ | inertia / viscous forces (above) | how strongly the nonlinear terms act |
| $R/L$, $r_o/L$ | cylinder size, orbit radius relative to the box | geometry of the 2D flow |
| $U_o/U_s$ | orbit speed relative to spin speed | which motion dominates |
| $L_z/L$ | span relative to the box side ($L_z = N_z h$, $h = 1/N$) | room for 3D structures; the only new geometric group |
| span type | `"periodic"` or `"walls"` | whether $z$ is homogeneous or bounded |
| $E = \nu/(\Omega_c L_z^2)$ | Ekman number, defined in section 6 (walls only) | relative thickness of the end-wall layers |

The 2D baseline is the same set of inputs with $N_z = 1$ and periodic span (section 7.8).

### 1.3 The two span types

**Periodic span** (`"periodic"`): the plane $z = L_z$ is glued to the plane $z = 0$, so a fluid particle that leaves
through one side re-enters through the other. Physically this is a *slice of an infinitely long cylinder*. No wall
anywhere distinguishes one $z$-position from another, so the problem is **homogeneous in $z$**: the equations and
the boundary conditions are unchanged if the whole flow is shifted along $z$.

**Walls** (`"walls"`): no-slip, stationary end walls at $z = 0$ and $z = L_z$. Physically this is a *finite cylinder
between two end plates*, a cylinder in a closed box in the everyday sense. The cylinder touches the end walls
and turns against them, a contact that the model does not resolve (section 7.5).

**Why the two are different experiments.** The point of the page is to see why the 3D flow differs from the 2D one.

- In the periodic box a spanwise-uniform flow, with $w = 0$ and nothing depending on $z$, is an *exact solution* of the
  3D equations (shown in section 2.3). If it is *stable*, a 3D simulation started from it stays 2D forever, up to
  round-off. If it is *unstable*, a tiny disturbance with some spanwise structure grows. The periodic box therefore
  isolates the **spontaneous 3D instability** of the 2D flow, and the question to ask is whether there is a threshold in
  $Re$ and what the wavelength along $z$ is.
- With end walls the 2D solution is *not* a solution: a velocity that does not depend on $z$ cannot be zero at
  $z = 0$ and also nonzero in the middle. The walls force a boundary layer and, as shown in section 6, a secondary
  circulation with $w \neq 0$ at *every* $Re$. There is no threshold. The 3D motion is **forced**, and the question is how large it is, not
  whether it exists.

| | `"periodic"` | `"walls"` |
|---|---|---|
| 2D flow is an exact solution | yes | no |
| 3D motion appears | only above an instability threshold | at every $Re$ (Ekman layers) |
| what the experiment measures | threshold, growth rate, spanwise wavelength | size and structure of the forced circulation, and any further instability on top of it |
| spanwise wavelengths allowed | $\lambda_z = L_z/m$, $m = 1, 2, \dots$ | not applicable (no Fourier decomposition in $z$) |

Because only whole numbers of wavelengths fit in a periodic span, the span itself selects which instabilities can
be seen: a mode whose natural wavelength does not (roughly) fit in $L_z$ is excluded, and a span that is too short
suppresses 3D motion entirely. Treat $L_z$ as a parameter, not as a detail.

## 2. The Navier–Stokes equations in 3D, and what a 2D simulation deletes

### 2.1 Index notation

Write the three velocity components as $u_1, u_2, u_3 = u, v, w$ and the coordinates as $x_1, x_2, x_3 = x, y, z$.
Abbreviate $\partial_j = \partial/\partial x_j$ and $\partial_t = \partial/\partial t$. One rule does all the work:

> **A repeated index in a product is summed over $1, 2, 3$.**

So $\partial_i u_i = \partial_x u + \partial_y v + \partial_z w = \nabla\cdot\mathbf u$,
$\;u_j\partial_j = u\,\partial_x + v\,\partial_y + w\,\partial_z = \mathbf u\cdot\nabla$, and
$\partial_j\partial_j = \nabla^2$. An index that appears once (here $i$) is *free*: the equation holds for each of its values.

### 2.2 The equations

For constant density (divided out, so $p$ is pressure over density) and constant viscosity $\nu$:

$$\partial_t u_i + u_j\,\partial_j u_i = -\,\partial_i p + \nu\,\partial_j\partial_j u_i ,
\qquad \partial_i u_i = 0 .$$

For $i = 1$ this is, written out,

$$\partial_t u + u\,\partial_x u + v\,\partial_y u + w\,\partial_z u
= -\,\partial_x p + \nu\left(\partial_x^2 u + \partial_y^2 u + \partial_z^2 u\right),$$

and $i = 2, 3$ give the same with $v$, $w$ in place of $u$ and $\partial_y p$, $\partial_z p$.

In words, and in the language of Bird, Stewart & Lightfoot: acceleration of a fluid particle
($\partial_t u_i + u_j\partial_j u_i$, the substantial derivative $Du_i/Dt$) equals the pressure force plus the net
viscous force per unit mass. The term $u_j\partial_j u_i$ is **convection of momentum**: it says that momentum
$u_i$ is carried along by the velocity $u_j$. The continuity equation $\partial_i u_i = 0$ says that no volume is
created, so the flow into any small volume equals the flow out. The pressure is not an independent unknown fixed
by an equation of state. It is whatever field is needed to keep $\partial_i u_i = 0$ at every instant. Taking the
divergence of the momentum equation, using $\partial_i\partial_t u_i = 0$ and $\partial_i\partial_j\partial_j u_i = 0$,

$$\partial_i\partial_i\, p = -\,\partial_i u_j\;\partial_j u_i ,$$

an elliptic (Poisson) equation that is the continuous version of the projection step in section 7.6.

Because $\partial_j u_j = 0$, the convection term can also be written in **conservative form**,

$$u_j\,\partial_j u_i = \partial_j\!\left(u_j u_i\right) - u_i\,\partial_j u_j = \partial_j\!\left(u_j u_i\right),$$

which says that the rate of change of $u_i$ in a fixed volume is the net flux $u_j u_i$ of momentum through its
faces. This is the form that the finite-volume method integrates.

### 2.3 What a 2D simulation assumes, and which terms it deletes

A 2D simulation assumes two things: **$w = 0$** and **nothing depends on $z$** ($\partial_z = 0$ for every
quantity). Substituting into the three momentum equations and continuity:

| equation | terms that vanish | what is lost |
|---|---|---|
| $x$-momentum | $w\,\partial_z u$ and $\nu\,\partial_z^2 u$ | transport of $x$-momentum up and down the span, and its viscous diffusion along $z$ |
| $y$-momentum | $w\,\partial_z v$ and $\nu\,\partial_z^2 v$ | the same for $y$-momentum |
| $z$-momentum | all of $\partial_t w + \dots$; what remains is $0 = -\partial_z p$ | the equation is satisfied trivially, because $\partial_z p = 0$ |
| continuity | $\partial_z w$ | the possibility of fluid leaving the $(x,y)$ plane |

The 2D equations are therefore the ordinary 3D equations with these five terms removed, nothing else.

**The 2D solution is an exact 3D solution in the periodic box.** Take any solution $(u, v, p)(x, y, t)$ of the 2D
equations, and set $w = 0$. Insert it in the 3D equations. Every deleted term is zero because it is a $z$-derivative of
something that does not depend on $z$ or is multiplied by $w = 0$; the $z$-momentum equation becomes $0 = 0$; the
boundary conditions in $x$ and $y$ are unchanged and the periodic condition in $z$ is satisfied by a function of
$z$ that is constant. So the 2D flow solves the 3D problem. This is what makes the 2D baseline a controlled
comparison: it is the same problem with the third dimension *not allowed to matter*. Whether it is the flow that is
actually realised depends on whether it is stable (section 5). With end walls, a $z$-independent $\mathbf{u}$
cannot satisfy $\mathbf u = 0$ on $z = 0$, and the statement is false (section 6).

A 2D simulation is thus not a 3D flow in which the third dimension is "ignored". It is a flow in which the third
dimension is *forbidden to act*. That matters because the terms it deletes are not small corrections. The
deleted $z$-derivatives are exactly what allows a vortex line to bend, tilt and stretch, which is the subject of
the next section.

## 3. Vorticity, vortex stretching, and why 2D and 3D turbulence differ

### 3.1 Definition

The **vorticity** is the curl of the velocity,

$$\boldsymbol\omega = \nabla\times\mathbf u ,\qquad
\omega_i = \varepsilon_{ijk}\,\partial_j u_k ,$$

or in components

$$\omega_x = \partial_y w - \partial_z v,\qquad
\omega_y = \partial_z u - \partial_x w,\qquad
\omega_z = \partial_x v - \partial_y u .$$

Here $\varepsilon_{ijk}$ is $+1$ for $(ijk) = (123), (231), (312)$, $-1$ for the reverse orders and $0$ if two
indices are equal. In 2D only $\omega_z = \partial_x v - \partial_y u$ exists, the quantity plotted on the 2D page.
It is a vector because "spin" has an axis: $\omega_z$ is spin about the $z$-axis, $\omega_x$ about the $x$-axis.
The page's `vorticity` function evaluates six of the nine velocity derivatives $\partial_ju_i$ with central differences (the Q-criterion of section 4 uses all nine).

### 3.2 Geometric meaning: twice the local angular velocity

Picture a tiny paddle wheel, much smaller than the scale of the flow, carried along by the fluid. It spins if the
fluid pushes its blades unevenly. The vorticity is **twice the angular velocity of that wheel** (twice the mean
local rotation rate of the fluid).

*Check on a rigid rotation.* Let the fluid turn like a solid disc, $\mathbf u = \Omega\,\hat{\mathbf z}\times\mathbf r$,
that is $u = -\Omega y$, $v = \Omega x$. Then $\omega_z = \partial_x v - \partial_y u = \Omega + \Omega = 2\Omega$. The
rotation rate is $\Omega$ and the vorticity is $2\Omega$.

*Circulation form.* Stokes' theorem turns the curl into a line integral around a small closed loop of area $A$,

$$\oint \mathbf u\cdot d\mathbf l = \int \boldsymbol\omega\cdot\mathbf n\,dA \approx \omega_n A .$$

For the rigid rotation and a circle of radius $a$, the left side is $2\pi a\cdot\Omega a = 2\Omega\,\pi a^2$, and
dividing by the area $A = \pi a^2$ gives $\omega = 2\Omega$ again. So $\omega_n$ is **circulation per unit area**:
how much the fluid goes round a small loop whose normal is $\mathbf n$.

*Vorticity is not the same as swirling.* In a simple shear $u = \gamma y$, $v = w = 0$ the streamlines are straight
lines, yet $\omega_z = -\gamma \neq 0$: the paddle wheel is turned because its upper blade sees faster fluid than its
lower one. Conversely, in the irrotational vortex $v_\theta = \Gamma/(2\pi r)$ the fluid goes round and round yet
$\omega_z = 0$ for $r > 0$: a wheel carried round such a vortex does not turn. The rotation it gets from going round the centre, $v_\theta/r$, is
cancelled by the shear, $dv_\theta/dr = -v_\theta/r$, so the mean rotation rate $\tfrac12(v_\theta/r + dv_\theta/dr)$ is zero. Section 4 builds a criterion that
separates real swirling from shear.

### 3.3 The vorticity equation, step by step

The goal is an equation for $\boldsymbol\omega$ alone, in which the pressure has disappeared. Start from the
momentum equation in vector form,

$$\partial_t\mathbf u + (\mathbf u\cdot\nabla)\mathbf u = -\nabla p + \nu\nabla^2\mathbf u .$$

**Step 1: rewrite the convection term.** Claim: $(\mathbf u\cdot\nabla)\mathbf u = \nabla(\tfrac12|\mathbf u|^2) - \mathbf u\times\boldsymbol\omega$.
Proof in index notation. Using $\varepsilon_{ijk}\varepsilon_{klm} = \delta_{il}\delta_{jm} - \delta_{im}\delta_{jl}$ (here $\delta_{ij}$ is
1 if $i = j$ and 0 otherwise),

$$\begin{aligned}
(\mathbf u\times\boldsymbol\omega)_i &= \varepsilon_{ijk}\,u_j\,\omega_k
= \varepsilon_{ijk}\,u_j\,\varepsilon_{klm}\,\partial_l u_m
= (\delta_{il}\delta_{jm} - \delta_{im}\delta_{jl})\,u_j\,\partial_l u_m\\
&= u_j\,\partial_i u_j - u_j\,\partial_j u_i
= \partial_i\!\left(\tfrac12 u_ju_j\right) - (\mathbf u\cdot\nabla)u_i .
\end{aligned}$$

Rearranging gives the claim. In words: the acceleration of a fluid particle splits into a gradient (which a pressure
can absorb) and a part, $-\mathbf u\times\boldsymbol\omega$, that exists only where there is vorticity.

**Step 2: take the curl of the momentum equation.** The momentum equation becomes

$$\partial_t\mathbf u - \mathbf u\times\boldsymbol\omega = -\nabla\!\left(p + \tfrac12|\mathbf u|^2\right) + \nu\nabla^2\mathbf u .$$

The curl of any gradient is zero ($\varepsilon_{ijk}\partial_j\partial_k f = 0$, because the derivatives commute and
$\varepsilon$ is antisymmetric). That removes the whole bracket containing the pressure. The curl commutes with
$\partial_t$ and with $\nabla^2$, so

$$\partial_t\boldsymbol\omega - \nabla\times(\mathbf u\times\boldsymbol\omega) = \nu\nabla^2\boldsymbol\omega .$$

**Step 3: expand the curl of the cross product.** In index notation

$$\begin{aligned}
[\nabla\times(\mathbf u\times\boldsymbol\omega)]_i
&= \varepsilon_{ijk}\,\partial_j\,\varepsilon_{klm}\,u_l\,\omega_m
= (\delta_{il}\delta_{jm} - \delta_{im}\delta_{jl})\,\partial_j(u_l\omega_m)\\
&= \partial_j(u_i\omega_j) - \partial_j(u_j\omega_i)\\
&= \omega_j\,\partial_j u_i + u_i\,\partial_j\omega_j - u_j\,\partial_j\omega_i - \omega_i\,\partial_j u_j .
\end{aligned}$$

Two terms vanish: $\partial_j\omega_j = \nabla\cdot(\nabla\times\mathbf u) = 0$ (a divergence of a curl), and
$\partial_j u_j = 0$ (incompressibility). What is left is $(\boldsymbol\omega\cdot\nabla)\mathbf u - (\mathbf u\cdot\nabla)\boldsymbol\omega$.

**Step 4: the result.** Inserting step 3 into step 2:

$$\boxed{\;\frac{D\boldsymbol\omega}{Dt} \equiv \partial_t\boldsymbol\omega + (\mathbf u\cdot\nabla)\boldsymbol\omega
= (\boldsymbol\omega\cdot\nabla)\mathbf u + \nu\nabla^2\boldsymbol\omega\;}$$

In words, the vorticity of a fluid particle changes for two reasons only: the **stretching and tilting term**
$(\boldsymbol\omega\cdot\nabla)\mathbf u$ and **viscous diffusion** $\nu\nabla^2\boldsymbol\omega$. There is no pressure
term, because pressure forces pass through the centre of a fluid element and exert no torque on it. There
is no density-gradient (baroclinic) term either, because the density is constant. The left side
says that, with these two terms switched off, vorticity is carried along with the fluid particles, like a dye.
This is the 3D vorticity equation of Helmholtz (1858); see Batchelor (1967) for the standard treatment.

### 3.4 The stretching and tilting term, geometrically

Write the term in components, $\left[(\boldsymbol\omega\cdot\nabla)\mathbf u\right]_i = \omega_j\,\partial_j u_i$. For the
$z$-component of the vorticity,

$$\frac{D\omega_z}{Dt} = \underbrace{\omega_z\,\partial_z w}_{\text{stretching}}
+ \underbrace{\omega_x\,\partial_x w + \omega_y\,\partial_y w}_{\text{tilting}} + \nu\nabla^2\omega_z .$$

**Stretching.** Suppose the vorticity points along $z$ and $\partial_z w = s > 0$: the flow pulls the fluid apart along
$z$. Then $D\omega_z/Dt = s\,\omega_z$, so $\omega_z$ grows like $e^{st}$ (neglecting viscosity). A stretched
vortex spins faster.

*The figure skater.* A skater spinning with arms out pulls them in and spins faster, because angular momentum $I\,\Omega_s$
is conserved and the moment of inertia $I$ falls. A **vortex tube** (a thin tube of fluid, with vorticity lines
running along it) does the same. When it is stretched to a length $\ell$, incompressibility keeps its volume $A\ell$
fixed, so its cross-section shrinks, $A \propto 1/\ell$. A ring of fluid in the tube has mass $m$ fixed, radius
$r \propto \sqrt A \propto \ell^{-1/2}$ and angular velocity $\omega/2$. Conservation of its angular momentum,
$m\,r^2\,\omega/2 = $ const, gives $\omega \propto 1/r^2 \propto \ell$. The same follows from Kelvin's
circulation theorem: for an inviscid flow the circulation $\Gamma = \omega A$ of the tube is conserved, so
$\omega = \Gamma/A \propto \ell$. Stretching a vortex tube by a factor of ten makes it spin ten times faster, and the
rotational energy rises because the stretching flow does work on it.

**Tilting.** The second pair of terms turns vorticity from one direction into another. A vortex tube lying
horizontally ($\omega_x \neq 0$) that is carried over a bump of $w$ (a nonzero $\partial_x w$) is tilted, and a
part of its vorticity appears in $\omega_z$, like a pencil rotated from horizontal to slanted, which gains a vertical
component. Tilting redistributes vorticity among directions; stretching changes its magnitude. Near the end walls
of section 6 the shear $\partial_z u$ makes strong *horizontal* vorticity, which tilting can convert.

**Stretching needs strain, not rotation.** Decompose the velocity gradient as
$\partial_j u_i = S_{ij} + \Omega_{ij}$ (section 4). The rotation part gives
$\Omega_{ij}\omega_j = \tfrac12(\boldsymbol\omega\times\boldsymbol\omega)_i = 0$, because a rotation turns a vector without changing
its length and a vector is parallel to itself. Hence

$$(\boldsymbol\omega\cdot\nabla)\mathbf u = \mathsf S\,\boldsymbol\omega ,$$

and vorticity can only be stretched by the **strain**, by the part of the flow that deforms fluid elements.

### 3.5 In 2D the term vanishes identically

If the flow is two-dimensional, $\boldsymbol\omega = (0, 0, \omega_z)$ and $\partial_z = 0$ for everything. Then
$(\boldsymbol\omega\cdot\nabla) = \omega_z\partial_z = 0$ acting on any component of $\mathbf u$:

$$(\boldsymbol\omega\cdot\nabla)\mathbf u = \omega_z\,\partial_z\mathbf u = \mathbf 0 .$$

So the 2D vorticity equation is

$$\frac{D\omega_z}{Dt} = \nu\nabla^2\omega_z ,$$

in which vorticity is just a *scalar carried by the flow and diffused by viscosity*, like a dye in the 2D page's
dye field. A direct consequence: in the absence of viscosity, $\omega_z$ is constant along each fluid-particle path,
so *any* function of it is conserved. Local maxima of $|\omega_z|$ cannot grow in the interior of the fluid. There is no mechanism that
intensifies a vortex, only advection, merging and viscous decay. In 3D the term $\mathsf S\boldsymbol\omega$ is generally non-zero, and it is the mechanism
by which turbulence makes small, intense vortex filaments.

### 3.6 Energy and enstrophy budgets

Define, for a box $V$ with no-slip walls (or periodic directions), the total kinetic energy and enstrophy
$$E_V = \int_V \tfrac12|\mathbf u|^2\,dV,\qquad Z_V = \int_V \tfrac12|\boldsymbol\omega|^2\,dV .$$
The page plots them per unit span and over the **fluid only**, the cells outside the cylinder ($E = E_V/L_z$, $Z = Z_V/L_z$ with the body excluded, section 8.3).
Enstrophy is the energy-like integral of the squared spin. In wavenumber space it weights the scales by $k^2$: for a
divergence-free field the Fourier components satisfy $\hat{\boldsymbol\omega} = i\mathbf k\times\hat{\mathbf u}$ and
$|\mathbf k\times\hat{\mathbf u}| = k|\hat{\mathbf u}|$, so in a periodic box
$Z_V = \int k^2 E(k)\,dk$. Enstrophy lives at *smaller scales* than energy.

**Energy budget.** Multiply the momentum equation by $u_i$ and integrate. The convection and pressure terms give surface
integrals that vanish ($\mathbf u\cdot\mathbf n = 0$ on all walls, and periodic faces cancel). Only the viscous
term needs work. Using $\nabla^2\mathbf u = -\nabla\times\boldsymbol\omega$ (true for $\nabla\cdot\mathbf u = 0$) and the identity
$\nabla\cdot(\boldsymbol\omega\times\mathbf u) = \mathbf u\cdot(\nabla\times\boldsymbol\omega) - \boldsymbol\omega\cdot(\nabla\times\mathbf u)$,

$$\int_V \mathbf u\cdot\nabla^2\mathbf u\,dV = -\int_V \mathbf u\cdot(\nabla\times\boldsymbol\omega)\,dV
= -\int_V|\boldsymbol\omega|^2\,dV - \oint_{\partial V}(\boldsymbol\omega\times\mathbf u)\cdot\mathbf n\,dS .$$

The surface term is zero because $\mathbf u = 0$ on a no-slip wall. Therefore

$$\frac{dE_V}{dt} = -\nu\int_V|\boldsymbol\omega|^2\,dV = -2\nu Z_V .$$

In words: in a closed box with stationary no-slip walls and nothing driving it, **kinetic energy decays at the rate
$2\nu$ times the enstrophy**. Dissipation is large where spin is large. With the moving cylinder as a driver the budget changes (section 8.3), and the identity just derived no longer holds in this form. In the limit $\nu\to0$ at fixed enstrophy the dissipation vanishes, which is why the
behaviour of enstrophy decides whether energy can be dissipated at all.

**Enstrophy budget.** Take the dot product of the vorticity equation with $\omega_i$:

$$\tfrac12\,\frac{D|\boldsymbol\omega|^2}{Dt} = \omega_i\omega_j\,\partial_j u_i + \nu\,\omega_i\,\partial_j\partial_j\omega_i .$$

The antisymmetric part of $\partial_j u_i$ drops out of $\omega_i\omega_j\partial_ju_i$ (it equals
$\omega_i\omega_jS_{ij}$). Integrating over $V$, the convective part of the left side becomes a surface integral
that vanishes, and one integration by parts on the viscous term gives

$$\frac{dZ_V}{dt} = \underbrace{\int_V \omega_i\,S_{ij}\,\omega_j\,dV}_{\text{vortex stretching}}
\;-\;\underbrace{\nu\int_V \partial_j\omega_i\,\partial_j\omega_i\,dV}_{\text{viscous destruction}}
\;+\;\underbrace{\nu\oint_{\partial V}\omega_i\,\partial_n\omega_i\,dS}_{\text{flux through walls}} .$$

Reading each term:

- *Stretching.* If $\boldsymbol\omega$ is aligned with a stretching direction of the strain (a positive eigenvalue of
  $\mathsf S$), then $\omega_iS_{ij}\omega_j > 0$ and enstrophy is produced. Because the strain tends to align
  vortex lines with its stretching direction, this term is positive on average in 3D turbulence (Taylor 1938; Tennekes & Lumley 1972).
- *Viscous destruction.* Always negative: viscosity smooths out vorticity gradients.
- *Wall flux.* Zero in a periodic domain. At a no-slip wall, vorticity is *created* in the boundary layer, and this
  term can have either sign.

**2D.** The stretching term is zero (section 3.5), so in the interior and in a periodic domain

$$\frac{dZ_V}{dt} = -\nu\int|\nabla\omega_z|^2\,dV \le 0 ,$$

and **enstrophy can only be destroyed by viscosity**. In the inviscid 2D limit **both energy and enstrophy are
conserved**. Two consequences follow directly.

1. In a 2D periodic flow $Z_V(t)\le Z_V(0)$, so the energy dissipation rate $2\nu Z_V$ is at most $2\nu Z_V(0)$ and
   tends to zero as $\nu\to0$: 2D flows cannot dissipate energy efficiently at high $Re$. In 3D the stretching
   term allows $Z_V$ to grow as the flow develops fine filaments, which is how a turbulent flow can dissipate at a
   rate that does not vanish as $\nu\to0$ (Kolmogorov's 1941 picture).
2. In a box with no-slip walls the wall-flux term is a third source: walls generate vorticity even in 2D
   and enhance the dissipation of confined 2D flows (Clercx & van Heijst 2017), so 2D flow in a bounded box is not literally enstrophy-conserving. The
   dual-cascade argument below is exact only for periodic or free-slip domains, and we use it as the guide for the
   interior.

### 3.7 Two invariants versus one: the cascades

**Energy goes to large scales in 2D (Fjørtoft's argument).** Suppose energy and enstrophy are transferred among three
wavenumbers $k_1<k_2<k_3$ with total energy $E=\sum E_i$ and total enstrophy $Z=\sum k_i^2E_i$ both conserved.
Let $\delta E_i$ be the changes. Then $\sum\delta E_i = 0$ and $\sum k_i^2\,\delta E_i = 0$. Subtracting $k_2^2$ times
the first from the second removes $\delta E_2$:

$$-(k_2^2 - k_1^2)\,\delta E_1 + (k_3^2 - k_2^2)\,\delta E_3 = 0 .$$

With $a = k_2^2-k_1^2>0$ and $b = k_3^2-k_2^2>0$, this gives $\delta E_3 = (a/b)\,\delta E_1$: the two outer
modes gain (or lose) energy together, and the middle one does the opposite. If the middle mode loses an amount
$\epsilon$, then $\delta E_1 = b\,\epsilon/(a+b)$ and $\delta E_3 = a\,\epsilon/(a+b)$.

*Worked example* (arithmetic, not a simulation): $k_1 = 1$, $k_2 = 2$, $k_3 = 4$. Then $a = 3$, $b = 12$, and 80 %
of the energy leaving $k_2$ goes to the *lower* wavenumber, 20 % to the higher. The enstrophy that leaves is
$k_2^2\epsilon = 4\epsilon$, of which $k_3^2\,\delta E_3 = 16\cdot 0.2\,\epsilon = 3.2\,\epsilon$ (80 %) goes to the *higher* wavenumber. So
when both are conserved, **energy tends to move to larger scales and enstrophy to smaller scales**.

**What the theory predicts** (Kraichnan 1967; Batchelor 1969; Kraichnan 1971; reviewed by Boffetta & Ecke 2012):
in forced 2D turbulence with forcing near wavenumber $k_f$,

- below $k_f$: an **inverse energy cascade** with $E(k)\propto k^{-5/3}$, which keeps feeding energy into ever larger
  vortices until the box size stops it (large coherent vortices and, in a confined box, a vortex condensate);
- above $k_f$: a **forward enstrophy cascade** with $E(k)\propto k^{-3}$ (with a logarithmic correction, Kraichnan 1971).

In 3D there is no second invariant, and the stretching term transfers energy from large eddies to small ones
(Richardson's cascade), until viscosity takes over at the Kolmogorov scale $\eta = (\nu^3/\epsilon)^{1/4}$.
Kolmogorov (1941) predicted for the inertial range

$$E(k) = C_K\,\epsilon^{2/3}\,k^{-5/3},\qquad k_L \ll k \ll 1/\eta ,$$

with the dissipation rate $\epsilon$ per unit mass and a constant $C_K$ (Pope 2000, chapter 6). Both cascades therefore have a
$-5/3$ range, with the *opposite direction* of energy transfer. A measured slope alone does not say which one is
present.

**Caveats that the page must respect.** These are asymptotic statements for large $Re$ and a wide range of scales between the forcing
and the dissipation scale. At the $Re$ values and grid sizes of this page there may be no such range at all, and the box is bounded by walls and driven by a body, not
by homogeneous forcing. They are the theoretical background to the comparison of 2D and 3D, not something the page has
measured. Where the span is much shorter than the horizontal scales of the flow, a 3D layer can behave 2D-like and
transfer energy inversely, with a crossover as the layer thickens (Smith, Chasnov & Waleffe 1996), which is one more reason to treat $L_z$ as a parameter.
What the simulations show: horizontal spectra of one spin-only snapshot at $Re=100$ and $150$ (section 8.2) have no clean power-law range, so no slope is compared with the theoretical ones.

## 4. Strain, rotation, and the Q-criterion

### 4.1 Decomposing the velocity gradient

Two nearby fluid particles separated by a small vector $\delta\mathbf x$ have velocity difference
$\delta u_i = (\partial_j u_i)\,\delta x_j$. The matrix $A_{ij} = \partial_j u_i$ is the **velocity-gradient
tensor**. Split it into a symmetric and an antisymmetric part:

$$A_{ij} = S_{ij} + \Omega_{ij},\qquad
S_{ij} = \tfrac12\left(\partial_j u_i + \partial_i u_j\right),\qquad
\Omega_{ij} = \tfrac12\left(\partial_j u_i - \partial_i u_j\right).$$

*Rotation.* The antisymmetric part is a rigid rotation of the neighbourhood: $\Omega_{ij}\,\delta x_j = \tfrac12(\boldsymbol\omega\times\delta\mathbf x)_i$.
(Proof: $(\boldsymbol\omega\times\delta\mathbf x)_i = \varepsilon_{ikl}\,\omega_k\,\delta x_l = \varepsilon_{ikl}\varepsilon_{kmn}\,\partial_m u_n\,\delta x_l = \delta x_l(\partial_l u_i - \partial_i u_l) = 2\,\Omega_{il}\,\delta x_l$.) It turns the neighbourhood
with angular velocity $\tfrac12\boldsymbol\omega$ and changes no lengths.

*Strain.* The symmetric part changes lengths and angles. It has three real eigenvalues $\lambda_1\ge\lambda_2\ge\lambda_3$
with orthogonal eigenvectors (principal axes), and incompressibility gives $\mathrm{tr}\,\mathsf S = \partial_iu_i = 0$,
so $\lambda_1+\lambda_2+\lambda_3 = 0$. Along its principal axes, $\mathsf S$ stretches by $\lambda_i$ per unit time.

**The small-cube picture.** Take a small cube of fluid. In a time $dt$ the strain stretches it along axis 1 (with $\lambda_1>0$) and squeezes it along axis 3
($\lambda_3<0$), turning the cube into a brick of the same volume (since $\sum\lambda_i = 0$) aligned with the
principal axes. The rotation turns the cube without deforming it. Every flow, however complicated, does both to
each fluid cube.

**The 2×2 picture and four examples.** In 2D, with $u=u(x,y)$, $v=v(x,y)$:

| flow | $\mathsf A$ | $\mathsf S$ | $\mathsf\Omega$ | picture |
|---|---|---|---|---|
| pure strain $u = ax,\ v = -ay$ | $\mathrm{diag}(a,-a)$ | $\mathrm{diag}(a,-a)$ | 0 | a square becomes a long thin rectangle |
| rigid rotation $u = -\Omega y,\ v = \Omega x$ | antisymmetric | 0 | $\Omega_{12} = -\Omega,\ \Omega_{21} = \Omega$ | the square just turns |
| simple shear $u = \gamma y,\ v = 0$ | $\begin{pmatrix}0&\gamma\\0&0\end{pmatrix}$ | $\begin{pmatrix}0&\gamma/2\\\gamma/2&0\end{pmatrix}$ | $\begin{pmatrix}0&\gamma/2\\-\gamma/2&0\end{pmatrix}$ | the square becomes a parallelogram |
| irrotational vortex $v_\theta=\Gamma/2\pi r$ | | nonzero | 0 | the square is sheared round the vortex without turning |

The simple shear is the sum of strain with principal axes at 45° (eigenvalues $\pm\gamma/2$) and a rotation at rate $\gamma/2$: **half
strain, half rotation**. This is why a shear layer has vorticity $|\omega_z| = \gamma$ but does not swirl.

### 4.2 The Q-criterion

Measure the size of each part by its squared Frobenius norm, $\|\mathsf S\|^2 = S_{ij}S_{ij} = \sum\lambda_i^2$ and
$\|\mathsf\Omega\|^2 = \Omega_{ij}\Omega_{ij}$. The entries of $\Omega$ are $\pm\omega_k/2$, each appearing twice, so
$\|\mathsf\Omega\|^2 = \tfrac12|\boldsymbol\omega|^2$. Hunt, Wray & Moin (1988) define

$$Q = \tfrac12\left(\|\mathsf\Omega\|^2 - \|\mathsf S\|^2\right)
= \tfrac14|\boldsymbol\omega|^2 - \tfrac12\|\mathsf S\|^2 ,$$

and identify a **vortex** with a region where $Q>0$: rotation beats strain. Compare the quantity with the vorticity
itself: $|\boldsymbol\omega|^2$ is large for *any* spin, whether produced by rotation or by shear; $Q$ subtracts the
part of it that strain accounts for.

**Evaluation on the examples**

- *Rigid rotation:* $\|\mathsf S\| = 0$, $\|\mathsf\Omega\|^2 = 2\Omega^2$, so $Q = \Omega^2>0$. Maximum swirl: a vortex.
- *Pure strain:* $\|\mathsf S\|^2 = 2a^2$, $\Omega=0$, so $Q = -a^2<0$. Stagnation-point flow: not a vortex.
- *Simple shear:* $\|\mathsf S\|^2 = 2\,(\gamma/2)^2 = \gamma^2/2$ and $\|\mathsf\Omega\|^2 = \gamma^2/2$, so **$Q = 0$ exactly**,
  although $|\omega_z| = \gamma$ may be huge. Shear has equal parts of rotation and strain, and sits exactly on the
  borderline: it is not classified as a vortex, however large $|\boldsymbol\omega|$ is. (Q is exactly zero, not
  negative, for ideal shear. Q is negative in the cylinder boundary layer below because the flow is also curved.)
- *Swirl with $v_\theta(r)$ only* (the case of the spinning cylinder): with $\omega_z = v_\theta' + v_\theta/r$ and
  $S_{r\theta} = \tfrac12(v_\theta' - v_\theta/r)$, $Q = \tfrac14\omega_z^2 - S_{r\theta}^2 = \dfrac{v_\theta}{r}\,\dfrac{dv_\theta}{dr}$.
  Since $Q = \tfrac{1}{2r}\,d(v_\theta^2)/dr$, $Q>0$ where the swirl *speed* $|v_\theta|$ increases outwards (e.g. $v_\theta=\Omega r$ inside the cylinder), and $Q<0$ where
  it *decays* outwards, as in the boundary layer on the surface of a spinning cylinder and in the
  irrotational vortex ($Q = -(\Gamma/2\pi r^2)^2$).

**Relation to pressure.** Taking the divergence of the momentum equation gave, in section 2.2,
$\nabla^2p = -\partial_iu_j\,\partial_ju_i = -\mathrm{tr}(\mathsf A^2)$. Because $\mathrm{tr}(\mathsf S\mathsf\Omega) = 0$ (symmetric times antisymmetric),
$\mathrm{tr}(\mathsf A^2) = \mathrm{tr}\,\mathsf S^2 + \mathrm{tr}\,\mathsf\Omega^2 = \|\mathsf S\|^2 - \|\mathsf\Omega\|^2$, hence

$$\nabla^2 p = 2\,Q .$$

In words: where rotation beats strain ($Q>0$), the pressure's Laplacian is positive, i.e. the pressure at that point
is *lower than the average of its surroundings*. That agrees with the picture of a vortex core: the
pressure gradient provides the centripetal force $v_\theta^2/r$, so the pressure rises outwards from the core
centre. It is a tendency, not a guarantee, since a positive Laplacian does not by itself make the minimum.
Jeong & Hussain (1995) pointed out that unsteady and viscous effects can separate the pressure minimum from the
vortex core, and proposed the $\lambda_2$ criterion instead. $Q$ remains the more widely used, and
simpler, indicator.

*Frame.* $Q$ is unchanged by a uniform translation but not by a rotating frame (which adds to the vorticity).
The page evaluates it in the lab frame, in which the walls are at rest. (The identities of this section, including $\nabla^2p=2Q$, were checked symbolically for a general velocity field.)

### 4.3 Why Q is better than $|\boldsymbol\omega|$ alone, and its relevance to this flow

- **The cylinder boundary layer** is a thin sheet of shear: the fluid goes from the surface velocity to the slower
  outer flow within a thin layer. $|\boldsymbol\omega|$ is huge there, of order (velocity change)/(layer thickness). But with decaying swirl $Q = (v_\theta/r)\,v_\theta'<0$.
  A plot of $|\boldsymbol\omega|$ is dominated by this layer and the walls' boundary layers, which hides the vortices.
- **Shed and corner vortices** have $Q>0$ cores, which the Q map picks out as compact blobs separated from the
  shear layers that feed them.
- **The penalised cylinder body**, when it spins, rotates rigidly, so its interior has $Q = \Omega^2>0$ and shows up as a large
  $Q>0$ disc. It is not a flow vortex; ignore it when reading the map.
- **3D structure.** A vortex tube can point in any direction. For instance, rolls aligned with the $x$ or $y$ axis carry
  $\omega_x$ or $\omega_y$, which a 2D-style plot of $\omega_z$ does not display. $Q$ uses all nine gradients,
  so the tube is identified whatever its orientation. An isosurface of $Q$ in a periodic box with a 3D instability reveals tubes
  whose position varies along $z$, the visible signature of a spanwise instability. In the 2D baseline the isosurface
  is a set of straight columns parallel to $z$.
- **Scale.** $Q$ has dimension 1/time$^2$; there is no universal threshold. The page scales the colour range of $Q$ to three times the root-mean-square of $Q$ in the data, so the picture adapts to the flow.

**Discretisation.** The page computes gradients with second-order central differences at cell centres; at a wall
the missing neighbour is the odd mirror of the first cell, which is exact for a linear near-wall velocity
profile. The thinnest boundary layers are therefore only as accurate as their resolution allows, and the
values of $Q$ within one or two cells of a wall or of the cylinder surface should not be trusted quantitatively.

## 5. How the spanwise-uniform flow becomes three-dimensional

### 5.1 The idea of linear stability, in plain words

Imagine a ball at the bottom of a bowl and another balanced on top of an upturned bowl. Both are at rest, both are solutions of the
equations of motion; the difference is the response to a nudge. The 2D flow of section 2.3 is a "rest state" in
the same sense: a perfectly spanwise-uniform flow stays so forever. Real simulations carry a small
disturbance, from round-off or a deliberately added seed (the page adds one, constructed in section 5.4, of amplitude $10^{-3}U_{\mathrm{ref}}$ by default). The question is whether it dies out or grows.

Write the flow as the 2D base flow $\mathbf U(x,y,t)$ plus a small perturbation $\epsilon\,\mathbf u'$, insert in the
3D equations, subtract the equations satisfied by $\mathbf U$ and **drop terms of order $\epsilon^2$**:

$$\partial_t\mathbf u' + (\mathbf U\cdot\nabla)\mathbf u' + (\mathbf u'\cdot\nabla)\mathbf U = -\nabla p' + \nu\nabla^2\mathbf u',
\qquad \nabla\cdot\mathbf u' = 0 .$$

In words: the perturbation is carried by the base flow ($\mathbf U\cdot\nabla\mathbf u'$), is itself deformed
by the gradients of the base flow ($\mathbf u'\cdot\nabla\mathbf U$), and is smoothed by viscosity. The equation is *linear* in $\mathbf u'$.
Since the base flow does not depend on $z$, the coefficients do not depend on $z$ either. Therefore solutions
can be built from Fourier modes in $z$, and **each spanwise wavenumber $k_z$ evolves independently**:

$$\mathbf u'(x,y,z,t) = \hat{\mathbf u}(x,y)\,e^{\sigma t}\,e^{ik_z z}\quad(\text{real part understood}),
\qquad k_z = \frac{2\pi m}{L_z},\ m = 0, 1, 2,\dots$$

Here $m$ counts the number of wavelengths that fit in the span. The **growth rate** $\sigma(k_z, Re)$ comes from an
eigenvalue problem in the $(x,y)$ plane (for a steady base flow). If $\mathrm{Re}\,\sigma>0$ for some $k_z$ the 2D flow is unstable.
The perturbation's energy grows like $e^{2\mathrm{Re}\,\sigma\,t}$. The $z$-derivatives bring in the viscous
damping $-\nu k_z^2$, so short wavelengths are damped more, while the inertial (here centrifugal) effects
are driving. The most unstable wavelength comes from this balance.

**Caveats particular to this flow.** The base flow here is not steady: it starts from rest and is unsteady while the
boundary layers grow; with an orbit it is time-periodic at best, and at high $Re$ it is unsteady and irregular. A growth rate is then a
*finite-time* quantity read off from the simulation, not an eigenvalue. Once the perturbation is no longer small the
neglected $\epsilon^2$ terms couple the modes, and growth **saturates** (section 8.1).
The span $L_z$ allows only $k_z = 2\pi m/L_z$, so the onset found in the periodic simulation is the first
unstable one among the *allowed* wavelengths, which cannot be below the threshold of an infinitely long span with the same cross-section (that span contains every allowed mode and more). The
2D baseline ($N_z=1$) contains only $m = 0$ and cannot show the instability at all.

### 5.2 The centrifugal (Rayleigh) criterion

Take an axisymmetric swirling flow with azimuthal velocity $v(r)$, density 1 and no viscosity. In steady state the radial
momentum equation says that the pressure gradient provides the centripetal acceleration,

$$\frac{\partial p}{\partial r} = \frac{v^2}{r} = \frac{\Gamma(r)^2}{r^3},\qquad \Gamma(r) \equiv r\,v(r) ,$$

where $\Gamma$ is the **angular momentum per unit mass**, which is also $1/2\pi$ times the circulation around the circle of radius $r$.

*The thought experiment.* Pick a thin ring of fluid at radius $r_1$ and push it to $r_2 = r_1+\xi$ with
$\xi>0$ small, quickly and without viscous friction. The ring feels no azimuthal force (the flow is axisymmetric, so
pressure gives none), so its angular momentum is conserved: it keeps $\Gamma_1 = \Gamma(r_1)$ and so has the speed
$v' = \Gamma_1/r_2$ at its new position. The surrounding fluid at $r_2$ has $\Gamma_2 = \Gamma(r_2)$. The pressure
field around the ring is set by that surrounding fluid, and exerts on the ring (per unit mass) the radial force
$-\partial p/\partial r = -\Gamma_2^2/r_2^3$. The ring's circular motion needs $v'^2/r_2 = \Gamma_1^2/r_2^3$ to
stay on its radius. The net radial force per unit mass, positive outwards, is

$$F_r = -\frac{\Gamma_2^2}{r_2^3} + \frac{\Gamma_1^2}{r_2^3} = -\frac{\Gamma_2^2 - \Gamma_1^2}{r_2^3}
\approx -\frac{1}{r^3}\frac{d\Gamma^2}{dr}\;\xi .$$

- If $\Gamma^2$ **increases** outwards, $F_r<0$: the ring is pushed back. The equation of motion
  $\ddot\xi = -N^2\xi$ with $N^2 = r^{-3}\,d\Gamma^2/dr>0$ describes stable oscillation.
- If $\Gamma^2$ **decreases** outwards, $N^2<0$ and $\ddot\xi = |N^2|\xi$ has the growing solution
  $\xi\propto e^{\sigma t}$ with $\sigma = \sqrt{-N^2}$: the displaced ring is flung farther out, and a ring pushed inwards likewise
  is driven inwards.

This is **Rayleigh's criterion** (Rayleigh 1917; proof for general axisymmetric disturbances in Drazin & Reid 2004; the ring argument above is the mechanism, not the proof): an inviscid swirling flow is stable to axisymmetric disturbances
if $\Gamma^2$ increases outwards everywhere, and unstable if $d\Gamma^2/dr<0$ somewhere. It is the rotating analogue of a heavy fluid on top of a light one, with angular momentum
playing the role of density and $\Gamma^2/r^3$ that of gravity. Since $\omega_z = r^{-1}d\Gamma/dr$ for
this flow, the condition $\Gamma\,d\Gamma/dr<0$ is the same as

$$\Gamma\,\omega_z < 0 :\quad\text{the vorticity has the opposite sign to the circulation.}$$

Rigid rotation ($\Gamma = \Omega r^2$, $\omega_z = 2\Omega$) is stable. The irrotational vortex ($\Gamma$ const) is
neutral. A vortex *surrounded by fluid of opposite-signed vorticity* is unstable, because moving outward the
circulation falls. The unstable disturbance is a stack of axisymmetric rolls along the axis, with a spacing along the axis comparable
to the width of the unstable region (Taylor 1923; Drazin & Reid 2004). In rotating flow between concentric cylinders these are the Taylor vortices.

**Viscosity** damps the disturbance, so an inviscid-unstable flow needs a large enough $Re$: the inertial growth
rate $\sigma\sim\sqrt{-N^2}$ must beat the viscous decay $\nu k_z^2$ at the unstable wavenumber, i.e. a Taylor-number-like
group $\Omega d^2/\nu$ (with $d$ the width of the unstable region) must exceed a constant. The constant is a property
of the geometry. Here it is found by simulation, not by this argument.

### 5.3 Application to the flow in the box, and what the page measured

**Theory: which mechanisms can act.**

- **Spinning cylinder.** The cylinder drags fluid round and the stationary box wall brakes it, so the circulation $\Gamma=rv_\theta$
  falls from $\Omega R^2$ at the cylinder surface towards zero at the box walls. $d\Gamma/dr<0$ with $\Gamma>0$ means $\omega_z<0$: the vorticity outside the body has the sign opposite
  to the circulation, which satisfies Rayleigh's condition. This is the geometry of Taylor–Couette flow with the inner
  cylinder rotating and the outer one at rest, the textbook centrifugally unstable case (Taylor 1923). The box is square and the cylinder
  is off-centre in the orbit cases, so the criterion is an *indication*, not a threshold: the actual instability is not axisymmetric.
  Bayly (1988) extended the centrifugal idea to inviscid 2D flows with closed non-circular streamlines.
- **Curved streamlines in a closed cavity.** The lid-driven cavity is the classical closed box with a moving boundary. Albensoeder, Kuhlmann & Rath (2001) analyse its
  three-dimensional *centrifugal* instabilities; in their analysis the modes sit on the strong eddy created by the moving lid. It is an analogy for the mechanism, not a result for this geometry.
- **Other mechanisms** (not derived and not tested on this page): vortices in a straining flow can be unstable by the **elliptic instability** (Waleffe 1990), and a boundary layer along a concave wall by the Görtler instability (Görtler 1940; Saric 1994).

**What the page measured.** The theory above does not give an onset $Re$ for this geometry. The page determines it numerically. The runs below
are all lattice-Boltzmann (regularised collision), $N=64$, $N_z=32$ (so $L_z=0.5$ unless stated), periodic span, $R=0.1$ (cylinder diameter $0.2$), $r_o=0.2$,
seed amplitude $10^{-3}$; $U_s=1$, so $U_{\mathrm{ref}}=1$ and times are in units of $L/U_{\mathrm{ref}}$. The growth rate $\sigma$ is the slope of $\ln E_{3d}$ divided by 2, fitted while $10^{-7}<E_{3d}/E<10^{-3}$ for $t\ge1$
(source: `notes/results_final.md`). "Late" quantities are means over the second half of each run ($t=10$ to $20$; $t=30$ to $60$ for the runs to $t=60$).

| case | $Re$ | $\sigma$ | late $E_{3d}/E$ | dominant $k_z$ (wavelength) |
|---|---|---|---|---|
| spin only | 40 | $-0.30$ (fit over $t\ge20$ of a run to $t=60$): seed decays | $7\times10^{-17}$ (late mean) | 1 (0.5) |
| spin only | 50 | $+0.014$ (run to $t=60$): very slow growth, still tiny at $t=60$ | $1.9\times10^{-7}$ (late mean) | 1 (0.5) |
| spin only | 60 | $+0.225$ | 0.057 | 1 (0.5) |
| spin only | 75 | $+0.426$ | 0.046 | 1 (0.5) |
| spin only | 100 | $+0.610$ | 0.135 | 1 (0.5) |
| spin only | 150 | $+0.869$ | 0.095 | 2 (0.25) |
| spin + orbit ($U_o=1$) | 25 | $-0.74$: seed decays | $1.2\times10^{-16}$ | 1 (0.5) |
| spin + orbit ($U_o=1$) | 800 | $+1.70$ | 0.27 | 1 (0.5) |
| spin only, $L_z=1$ ($N_z=64$) | 100 | $+0.543$ | 0.14 | 2 (0.5) |

What these numbers say, and what they do not.

- **Spin only: the onset lies between $Re=40$ and $Re=50$ on this grid and span.** The seed decays at $Re=40$ and grows at $Re\ge50$. At $Re=50$ the growth is so slow ($\sigma=0.014$, still $E_{3d}/E\approx2\times10^{-7}$ at the end of a run to $t=60$) that the sign rests on a long run; the bracket 40 to 50 is
  not refined further, and it was not tested against grid refinement or span.
- **Spin + orbit:** the seed decays at $Re=25$ and the flow is strongly three-dimensional at $Re=800$. Only these two Reynolds numbers were run in final form, so **no onset bracket exists** for the orbit case.
- **Spanwise wavelength.** At $Re=100$ with $L_z=0.5$ the dominant late mode is $k_z=1$ (wavelength 0.5, 2.5 cylinder diameters). With the span doubled ($L_z=1$, $k_z=2$) the dominant wavelength is again 0.5, with a similar growth rate
  (0.54 against 0.61) and the same saturated $E_{3d}/E$ (0.14). At this $Re$ the default span therefore does not force the wavelength. At $Re=150$ the dominant mode at $L_z=0.5$ is $k_z=2$ (wavelength 0.25); the span-doubling check was made only at $Re=100$.
- **Growth rate rises with $Re$** in the table, from $0.23$ at $Re=60$ to $0.87$ at $Re=150$ (spin only). The saturated $E_{3d}/E$ does not: it is 0.135 at $Re=100$ and 0.095 at $Re=150$.
- **A second method.** The same spin-only case at $Re=100$ with the finite-volume solver (inner-ramp mask, $N=64$, $N_z=32$) gives $\sigma=0.48$ (lattice-Boltzmann $0.61$) and late $E_{3d}/E=0.104$ ($0.135$). The two methods agree on the existence and rough size of the growth, not on its value to better than about 25 %.

Not measured, and so not stated: the onset $Re$ for the orbit case; the dependence of the spin-only onset on $L_z$ and on $N$ beyond the span-doubling check at $Re=100$ above.

### 5.4 The deliberate seed

Round-off alone would start a perturbation near $10^{-16}$ and the run would be too short to see it grow. The page therefore adds a small known disturbance at $t=0$. It must (i) be divergence-free, because otherwise the first projection step
would remove an unpredictable part of it, (ii) vanish on the walls, so that it respects no-slip, and (iii) have a few spanwise wavelengths, never the shortest one the grid can hold.

**Construction.** Use a stream function. For any scalar $\psi$ the field $\mathbf u=\nabla\times(\psi\,\hat{\mathbf y})$ has components

$$u=-\partial_z\psi,\qquad v=0,\qquad w=\partial_x\psi .$$

*It is divergence-free:* $\nabla\cdot\mathbf u=\partial_xu+\partial_yv+\partial_zw=-\partial_x\partial_z\psi+0+\partial_z\partial_x\psi=0$, because mixed derivatives commute. (Geometrically, $\psi$ labels streamlines in each $(x,z)$ plane, and flow that follows
streamlines of a plane neither creates nor destroys volume.) The page takes

$$\psi=a\,F(x,y)\,W(z)\,S(z),\qquad F=\sin^2(\pi x)\sin(\pi y),\qquad S(z)=\sum_{m=1}^{M}\frac{\sin(k_mz+m)}{k_m},\quad k_m=\frac{2\pi m}{L_z},$$

with $a=\text{seed}\times U_{\mathrm{ref}}$ ($10^{-3}U_{\mathrm{ref}}$ by default), $M=\min(4,\,N_z\,//\,4)$ (no seed if $N_z<4$), and $W=1$ for the periodic span or $W=\sin^2(\pi z/L_z)$ with end walls. Then

$$u=-a\,F\,(W'S+W S'),\qquad w=a\,\partial_xF\;W S,\qquad \partial_xF=\pi\sin(2\pi x)\sin(\pi y),\quad S'=\sum_m\cos(k_mz+m).$$

*It vanishes on every wall.* At $x=0,1$: $F=0$ (from $\sin^2\pi x$) and $\partial_xF=0$ (from $\sin2\pi x$), so $u=w=0$. At $y=0,1$: $\sin\pi y=0$ kills both $F$ and $\partial_xF$. With end walls,
$W=\sin^2(\pi z/L_z)$ and $W'$ both vanish at $z=0,L_z$, so $u=w=0$ there too. (These statements, the divergence and the periodicity were verified symbolically for $M=3$.)

*Periodic span:* $k_mL_z=2\pi m$, so $S$ and $S'$ repeat after $L_z$, and the seed is periodic. Since $\int_0^{L_z}\cos(k_mz+m)\,dz=\int_0^{L_z}\sin(k_mz+m)\,dz=0$, the seed has **no $z$-average**: it contains only $m\ge1$ modes
and adds nothing to the 2D part of the flow.

*Why these choices.* The factor $1/k_m$ makes the $u$ part of every mode the same size ($S'$ is $O(1)$ for each $m$), while the $w$ part of mode $m$ is proportional to $1/k_m$. The phase $+m$ keeps the modes from being all in step, which would put a single spike at one $z$. $M\le N_z/4<N_z/2$ excludes the shortest wave
($m=N_z/2$, two cells per wavelength). Since $|F|\le1$ and $|S'|\le M$, $|u|\le Ma\le4a$.

*On the grid.* The finite-volume solver evaluates the formula on its $u$- and $w$-faces and then projects once (16 V-cycles) so that the discrete divergence is also close to zero; the lattice-Boltzmann solver evaluates it at its nodes (see its page). With seed $=0$ and a $z$-uniform start, both solvers kept the flow $z$-uniform to a difference of exactly 0 in the independent review (spin + orbit, $N=32$, $N_z=4$, 500 steps), so any growth seen
comes from the seed or from physics, not from the solver.

## 6. Ekman layers: the end walls (span = "walls")

### 6.1 The physical picture: the tea-leaf effect

Stir a cup of tea and wait. The tea circulates, and the tea leaves collect in a heap in the *centre of the bottom*,
though the swirling fluid should throw them outwards. Einstein (1926) explained this: the **stationary bottom** slows
the fluid next to it. In the bulk, the radial pressure gradient exactly balances the centrifugal force of the rotating
fluid, $\partial p/\partial r = v^2/r$. This pressure field is imposed from above, and does not change across the thin layer above the bottom. But in that layer the
fluid is slow, so the centrifugal force $v^2/r$ it needs is smaller than the pressure force pushing it inwards. The excess pushes the fluid **inwards along the bottom**, carrying the leaves with it. The inflow
must go somewhere: it turns and rises in the centre. This is a **secondary circulation** (in the radial–axial plane),
driven entirely by the thin boundary layer, with a speed much smaller than the swirl.

In our box the end walls at $z = 0$ and $z=L_z$ play the part of the bottom of the cup. The
cylinder spins, the fluid swirls around it, and the end walls are stationary.

### 6.2 The balance in the boundary layer

Take a flow that is, outside the boundary layer, a rigid rotation with angular velocity $\Omega_c$ about $z$ (the **core**),
over a stationary wall at $z=0$. The following steps use the **frame rotating with the core**. In that frame the core is at rest, and the
momentum equation acquires the Coriolis term $2\Omega_c\hat{\mathbf z}\times\mathbf u$ (the centrifugal term
is absorbed in a modified pressure, $\Omega_c^2r^2/2$ subtracted from $p$). With $f = 2\Omega_c$:

$$\partial_t\mathbf u + (\mathbf u\cdot\nabla)\mathbf u + f\,\hat{\mathbf z}\times\mathbf u = -\nabla P + \nu\nabla^2\mathbf u .$$

The Coriolis force is the apparent force that turns any moving fluid, at right angles to its velocity, at the
rate $f$. In the core ($\mathbf u = 0$), $\nabla P=0$.

In the thin layer next to the wall we may make the following **approximations** (all part of the linear Ekman theory;
the last is the one that fails here, see section 6.5):

1. the layer is thin, so $z$-derivatives dominate: $\nu\nabla^2\mathbf u\approx\nu\,\partial_z^2\mathbf u$;
2. $\partial_z P\approx0$ across it, so $P$ equals its core value and $\nabla_hP=0$;
3. the flow is steady;
4. the velocity relative to the core is small compared with $\Omega_c r$, so $(\mathbf u\cdot\nabla)\mathbf u$ can be dropped;
5. curvature is negligible ($\delta\ll r$), so we may use local Cartesian axes at radius $r$, $x$ radial and $y$ azimuthal.

The horizontal components $u$ (radial) and $v$ (azimuthal) of the velocity relative to the core then satisfy

$$-f\,v = \nu\,\partial_z^2 u,\qquad f\,u = \nu\,\partial_z^2 v .$$

In words: Coriolis force (turning) balances viscous friction. The boundary condition at the wall: the wall is at rest in the lab frame,
so in the rotating frame it moves at $-V$ in the azimuthal direction, where $V=\Omega_cr$ is the core speed
in the lab frame, giving $(u,v)=(0,-V)$ at $z=0$. Far from the wall $(u,v)\to(0,0)$.

**Thickness by scaling.** Viscous and Coriolis terms are comparable when $\nu u/\delta^2\sim f u$, that is
$\delta\sim\sqrt{\nu/f}\sim\sqrt{\nu/\Omega_c}$. Intuitively, vorticity diffuses away from the wall as $\sqrt{\nu t}$, but
rotation turns the fluid around within about one rotation period $t\sim1/\Omega_c$, so the layer cannot grow
thicker than $\sqrt{\nu/\Omega_c}$.

### 6.3 The Ekman spiral, step by step

Combine the two equations into one using the complex velocity $F = u+iv$. Multiply the second equation by $i$ and
add: $\nu\,\partial_z^2(u+iv) = -fv + ifu = if\,(u+iv)$, thus

$$\partial_z^2 F = \frac{if}{\nu}F = \frac{2i}{\delta^2}F,\qquad \delta = \sqrt{\frac{2\nu}{f}} = \sqrt{\frac{\nu}{\Omega_c}} .$$

Since $(1+i)^2 = 2i$, the solutions are $e^{\pm(1+i)z/\delta}$, and only the decaying one is allowed:
$F = C\,e^{-(1+i)\zeta}$ with $\zeta = z/\delta$. The wall condition $F(0) = 0 + i(-V) = -iV$ fixes $C = -iV$. Using
$e^{-i\zeta} = \cos\zeta - i\sin\zeta$:

$$u = -V\,e^{-\zeta}\sin\zeta,\qquad v = -V\,e^{-\zeta}\cos\zeta .$$

Back in the lab frame the azimuthal speed is $V+v$:

$$u_r = -V\,e^{-\zeta}\sin\zeta ,\qquad v_\theta = V\left(1 - e^{-\zeta}\cos\zeta\right).$$

Reading the result.

- At the wall both vanish ($\zeta=0$): no slip. Far away $u_r\to0$ and $v_\theta\to V$: the core.
- $u_r<0$ throughout $0<\zeta<\pi$: the flow in the layer is **inward**, as the tea-leaf argument said. The inward
  speed is largest at $\zeta=\pi/4$, where $e^{-\zeta}\sin\zeta$ is stationary, with $|u_r| = e^{-\pi/4}\sin(\pi/4)\,V\approx0.32\,V$ (a number from this formula, not from a simulation).
- As $\zeta$ increases the velocity vector (radial, azimuthal) rotates and shrinks in magnitude: its tip traces a **spiral**, the Ekman spiral.
  Near the wall the flow is turned inwards; farther up it is turned back along the swirl direction.

### 6.4 Ekman transport and pumping

Integrate the radial velocity across the layer, with $\int_0^\infty e^{-\zeta}\sin\zeta\,d\zeta = \tfrac12$:

$$Q_E \equiv \int_0^\infty u_r\,dz = -V\delta\int_0^\infty e^{-\zeta}\sin\zeta\,d\zeta = -\frac{V\delta}{2} = -\frac{\Omega_c\,r\,\delta}{2} .$$

This is the **Ekman transport**: the volume of fluid carried inwards per unit length of circle.
Incompressibility in cylindrical coordinates, $\partial_zw = -\tfrac1r\partial_r(ru_r)$, integrated from the wall to above the layer, gives the
vertical velocity leaving the layer:

$$w_E = -\frac1r\frac{d}{dr}\left(r\,Q_E\right) = -\frac1r\frac{d}{dr}\left(-\frac{\Omega_c\delta}{2}r^2\right) = \Omega_c\,\delta = \sqrt{\nu\,\Omega_c} .$$

In words: the inward transport converges at smaller radii, and since the radial flux per unit circumference, $rQ_E$, grows with $r$, the fluid has
to leave the layer upwards, away from the wall and into the core, at the uniform speed $w_E=\sqrt{\nu\Omega_c}$ (the **Ekman pumping**). The layer on the opposite end wall does the same in the other direction, so both layers feed fluid into the core. The core cannot
absorb it all, so it returns outwards through the core, near mid-span. The closed circulation in the box is therefore: inflow along the end walls, rise (or fall) along the cylinder, and outflow near mid-span.
An independent review measured exactly this direction in both solvers (spin only, $Re=100$, $t=1$, $N=32$ and $64$, $L_z=0.5$; an earlier version of the finite-volume mask, so the magnitudes are not final): radial velocity directed inwards in the first cell above the end wall at all rings $0.10<r<0.40$,
$w>0$ in the lower half near the cylinder, $u_r>0$ near $z=0.27\,L_z$ to $0.28\,L_z$, and $w$ antisymmetric about mid-span to round-off. The magnitudes were not converged: peak $|w|$ was $0.137$ (finite volumes) against $0.075$ (lattice Boltzmann) at $N=32$ and $0.100$ against $0.063$ at $N=64$,
while the Ekman scale from the formula below is $w_E/U_s=\sqrt{2/Re}=0.14$ at $Re=100$. In the final walls run (spin only, $Re=200$, $N=64$, one grid only) the largest $|w|$ in the $xz$ slice through $y=\tfrac12$ (through the cylinder axis; the cylinder centre is at $x=0.7$) was $0.19$ at $t=5$, at $z\approx0.15$, $x\approx0.84$, just outside the cylinder surface ($x=0.8$), and $0.13$ to $0.14$ for $t=10$ to $20$. Its dependence on $N$ was not measured.

**Spin-up.** Because the pumping speed is only $\sqrt{\nu\Omega_c}$ the Ekman circulation adjusts the whole column of fluid on the time
scale $L_z/\sqrt{\nu\Omega_c}$, much shorter than the diffusion time $L_z^2/\nu$ by a factor $E^{1/2}$ (Greenspan & Howard 1963;
Greenspan 1968). That is a scale estimate, not a prediction of the page; it tells how long a run must be before the end-wall circulation is established.

### 6.5 Why the flow is 3D at every $Re$, and where the linear theory stops

**No threshold.** The no-slip end walls require $u=v=0$ at $z=0$, so the horizontal velocity necessarily varies with
$z$, and then incompressibility requires $w\neq0$ ($\partial_zw=-\partial_xu-\partial_yv$ is generally nonzero). At any finite viscosity
there is a boundary layer of thickness $\delta$ and a pumping velocity $w_E\sim\sqrt{\nu\Omega_c}$. The motion decreases
smoothly as $Re$ grows and does not appear abruptly at a critical value. Taking $\Omega_c\approx\Omega$ (an upper estimate), the pumping velocity relative to the spin speed is $w_E/U_s\approx\delta/R=\sqrt{2/Re}$ for spin only (arithmetic from the formulas above).

*What the final run shows.* Spin only, end walls, $Re=200$ (lattice Boltzmann, $N=64$, $N_z=32$, $L_z=0.5$), late means ($t=10$ to $20$): $E_w/E=0.034$ and $E_{3d}/E=0.24$ (here $E_{3d}$ includes the end-wall boundary layers, where $u$ and $v$ vary with $z$). Against the 2D baseline of the same inputs,
$E$ is $0.0110$ against $0.0212$ (ratio $0.52$). One Reynolds number does not give a dependence on $Re$: it was not measured here at other Reynolds numbers, so no exponent is stated.

**Thickness in terms of $Re$.** For spin only, $\nu=2RU_s/Re$ and $\Omega=U_s/R$, so with $\Omega_c=\Omega$,

$$\delta = \sqrt{\frac{\nu}{\Omega}} = R\sqrt{\frac{2}{Re}},\qquad \frac{\delta}{h} = N R\sqrt{\frac2{Re}} .$$

If $\Omega_c$ is the actual core rotation rate, the generalisation is $\delta/R=\sqrt{2/Re}\,\sqrt{\Omega/\Omega_c}$. The
layer needs several cells to be resolved, i.e. $N\gtrsim c\,\sqrt{Re/2}\,/R$ for $c$ cells across $\delta$. The Ekman number $E=\nu/(\Omega_cL_z^2)=(\delta/L_z)^2$ says whether
the end-wall layers are thin compared with the span (small $E$) or fill it. *Arithmetic for the final walls run* ($Re=200$, $R=0.1$, $N=64$, $\Omega_c=\Omega$): $\delta/R=0.10$, $\delta=0.010$, $\delta/h=0.64$: **less than one cell**, so the end-wall layer is not resolved on this grid, and its measured structure should be read with that in mind
(for $Re=100$ the same arithmetic gives $\delta=0.014$, 0.9 cell at $N=64$ and 0.45 cell at $N=32$). the actual $\Omega_c$ was not measured here, so $\delta/R$ and $\delta/h$ are given only by the upper estimate $\Omega_c=\Omega$ above.

**What is an approximation.** The solution above is the *linear Ekman layer*. It is a correct picture of the mechanism and a
reasonable guide to the *scalings* $\delta\propto\sqrt{\nu/\Omega}$ and $w_E\propto\sqrt{\nu\Omega}$. Its quantitative
profile and coefficients do not carry over to this flow, for the following reasons.

1. **The rotating frame is not the lab frame.** Linear Ekman theory assumes a Rossby number $\mathrm{Ro}=$ (velocity relative to the core)/($\Omega_c\times$ length) $\ll1$. Here the
   background is *not* rotating: the swirl itself is the rotation, and the wall moves at $-\Omega_cr$ relative to the core, which means $\mathrm{Ro}=O(1)$. The model for a solid-body-rotating flow over a fixed wall is the nonlinear **Bödewadt layer** (Bödewadt 1940; see Greenspan 1968 for rotating-fluid boundary layers).
   Its thickness is expected to keep the scaling $\sqrt{\nu/\Omega}$ by dimensional analysis (the only length formed from $\nu$ and $\Omega$), but its profile and coefficients differ from the linear ones, and they are not computed here.
2. **The core is not a rigid rotation.** Around a spinning cylinder the swirl decays with the distance from the axis, so the "core rotation rate" varies with
   position, $\Omega_c=\Omega_c(r)$, and $\delta$, $w_E$ do too. The formulae are local, with the local $\Omega_c$.
3. **Curvature and the cylinder.** The derivation neglected curvature and assumed an infinite plane wall. The layer meets the
   cylinder surface (and, at the corners, the side walls) at a junction where it cannot be a plane layer.
4. **Unsteadiness.** The orbiting body makes the core flow time-dependent, and the formulae assume steady flow.
5. **The layer itself can become unstable.** Ekman and Bödewadt layers are unstable to spiral or roll waves above a
   critical *layer* Reynolds number $Re_\delta=V\delta/\nu=r\sqrt{\Omega_c/\nu}$ (Lingwood 1997 analyses the absolute instability of Ekman, Bödewadt and related layers; critical values are not quoted here). Above it the end-wall layers become 3D-unsteady themselves, on top of the forced circulation.
   Whether the end-wall layers of this page become unsteady was not measured here.

**The cylinder meets the end walls.** The cylinder surface moves at the velocity $\mathbf u_b$ right up to the end wall where $\mathbf u=0$. At that line the model has a velocity
jump. The shear stress there is formally infinite and is regularised only by the grid or the mask thickness $\epsilon=h$. The flow
nearby (and the torque, section 8.3) therefore depends on the grid in a way that no physical argument above removes:
the grid dependence of the walls run was not measured here.

## 7. The finite-volume method in 3D

This extends the 2D page (its sections 2 to 6). Everything there carries over, with one more direction. Only
what changes is stated; the 2D explanations of ghost values, MUSCL–minmod and projection apply unchanged in each direction.

### 7.1 The 3D MAC grid

The box is cut into $N\times N\times N_z$ cubic cells of side $h=1/N$, so $L_z=N_zh$. The unknowns are staggered:

| unknown | stored at | array shape $[k,j,i]$ |
|---|---|---|
| $u$ | centres of faces normal to $x$: $x=ih,\ y=(j+\tfrac12)h,\ z=(k+\tfrac12)h$ | $(N_z, N, N+1)$ |
| $v$ | centres of faces normal to $y$ | $(N_z, N+1, N)$ |
| $w$ | centres of faces normal to $z$: $z=kh$ | $(N_z+1, N, N)$ |
| $q=\Delta t\,p$ | cell centres | $(N_z, N, N)$ |

The discrete divergence of cell $(i,j,k)$ uses its six faces,

$$(\nabla\cdot\mathbf u)_{ijk}=\frac{u_{i+1}-u_i}{h}+\frac{v_{j+1}-v_j}{h}+\frac{w_{k+1}-w_k}{h},$$

which is the net volume outflow divided by the cell volume $h^3$. Each velocity component sits on the face it
carries flow through, and each pressure difference is taken between the two cells sharing that face, so the pressure checkerboard problem
of the 2D page (a centred gradient skipping a cell) does not arise in any direction.

### 7.2 The momentum right-hand side

For the $u$-equation the control volume is the cube of side $h$ centred on a $u$ point; it has six faces, east/west ($x$), north/south ($y$) and
top/bottom ($z$). The right-hand side, written for $u$ and in the conservative form of section 2.2, is

$$R^u_{ijk}=-\frac{F_e-F_w}{h}-\frac{F_n-F_s}{h}-\frac{F_t-F_b}{h}+\nu\,\frac{u_{i+1}+u_{i-1}+u_{j+1}+u_{j-1}+u_{k+1}+u_{k-1}-6u_{ijk}}{h^2},$$

with each flux (transport velocity) $\times$ (reconstructed face value), e.g. $F_t=\bar w_t\,u_t$ with $\bar w_t$ the
average of the two nearest $w$ values and $u_t$ the MUSCL value (section 7.3). In words: what leaves the cube through a face enters its
neighbour, so momentum is conserved; the viscous term is the 7-point difference, six neighbours instead of the 2D page's four. $v$ and $w$ are treated
in the same way on their own control volumes.

### 7.3 Advection

For each face, the reconstruction uses the 1D recipe of the 2D page along the *direction normal to that face*:

$$u_e=a+\tfrac12\,\mathrm{minmod}(a-a^-,\ b-a),$$

with $a$ the upwind node, $a^-$ the one beyond it and $b$ the downwind node. The three directions are handled independently, with no cross terms. Everything said on the 2D page holds: second order where smooth, first-order
upwind at extrema, no new extrema, and numerical diffusion where the solution is under-resolved (implicit LES).

### 7.4 Time stepping and the 3D diffusion limit

Time stepping is the same variable-step Adams–Bashforth 2 as in 2D (the first step is forward Euler). The stability limit for the viscous term below is derived for a constant step and periodic data; the step actually used varies only slowly. The derivation has three steps.

**Step 1: the eigenvalues of the discrete Laplacian.** Test the 7-point operator on a plane wave
$e^{i(k_xx+k_yy+k_zz)}$ on the grid. Each direction contributes
$(e^{ik_dh}-2+e^{-ik_dh})/h^2=-(4/h^2)\sin^2(k_dh/2)$, so the viscous term $\nu\nabla^2_h$ multiplies the wave by

$$\lambda=-\frac{4\nu}{h^2}\left[\sin^2\frac{k_xh}2+\sin^2\frac{k_yh}2+\sin^2\frac{k_zh}2\right]\in\left[-\frac{12\nu}{h^2},\,0\right].$$

The most negative eigenvalue belongs to the *checkerboard* mode, where the field flips sign from each cell to the next in all three
directions ($k_dh=\pi$ for every $d$). In 2D this limit is $-8\nu/h^2$, in 1D $-4\nu/h^2$, each additional direction adding another neighbour that pulls on the cell.

**Step 2: forward Euler.** For $\partial_tu=\lambda u$ one step multiplies the mode by $g=1+\lambda\Delta t$. Stability needs
$|g|\le1$, i.e. $\lambda\Delta t\ge-2$, so

$$\Delta t\le\frac{2}{12\nu/h^2}=\frac{h^2}{6\nu}\quad(\text{3D, forward Euler}) ,\qquad
\frac{h^2}{4\nu}\ (\text{2D}),\quad\frac{h^2}{2\nu}\ (\text{1D}).$$

In words: a checkerboard cell is pulled towards its six neighbours; if the time step is so large that the explicit step overshoots the average of the neighbours by more than the original
deviation, the sign flips and grows.

**Step 3: Adams–Bashforth 2 (the scheme actually used).** With $z=\lambda\Delta t$ the amplification factors $\xi$ satisfy
$\xi^2-(1+\tfrac32z)\,\xi+\tfrac12z=0$. At the real value $z=-1$ this is $\xi^2+\tfrac12\xi-\tfrac12=0$, with roots
$\xi=\tfrac12$ and $\xi=-1$. The second root has $|\xi|=1$, which is the stability boundary; for more negative $z$ it passes beyond $-1$
(Durran 2010; the roots and the real-axis limit $-1$ were also checked numerically). Hence AB2 is stable on the real axis only for $\lambda\Delta t\ge-1$, i.e. for

$$\frac{\nu\,\Delta t}{h^2}\le\frac1{12}\approx0.083\quad(\text{3D}),\qquad\frac{\nu\,\Delta t}{h^2}\le\frac18=0.125\quad(\text{2D, as on the 2D page}).$$

So the bound is *half* the forward-Euler value, $h^2/(12\nu)$ in 3D. The code uses $\Delta t=\left(U_{\max}/(0.3h)+\nu/(0.05h^2)\right)^{-1}$,
whose diffusive part is $\nu\Delta t/h^2\le0.05$. That is 60 % of the 3D limit, against 40 % of the 2D limit, so the safety margin
reserved for the interplay with advection is smaller in 3D. The reciprocal sum, which the 2D page found necessary when the two
limits are equal, is kept. The two limits cross where $U_{\max}h/\nu=0.3/0.05=6$. If $N_z=1$ the $z$-neighbours are the cell itself, the $k_z\neq0$ modes do not exist, and the 2D limit is recovered.
*Measured:* AB2 applied to a checkerboard mode with the 7-point operator is stable just below and unstable just above $\nu\Delta t/h^2=1/12$ in 3D (checked here at $\pm2\,\%$ of the limit, and the same for $1/8$ in 2D and $1/4$ in 1D), and the finite-volume solver's own test found the threshold $\approx0.0833$. This is the diffusive limit only. Whether the advective constant $0.3$ is sufficient in 3D, where the three directions add, is not
derived here: the factors $0.3$ and $0.05$ were not scanned in 3D here; only the diffusive limit above was checked.

### 7.5 The cylinder: Brinkman penalisation

The cylinder is not meshed. It is a region of the grid in which the fluid is forced to move rigidly. A mask $\chi(x,y,t)\in[0,1]$ is 1 inside the body and 0 outside; it depends only on $(x,y)$, so the cylinder fills the span. After each momentum step the velocity is relaxed towards the body velocity:

$$\mathbf u\leftarrow\mathbf u^*+\chi\left(\mathbf u_b-\mathbf u^*\right),\qquad\mathbf u_b=(u_b,v_b,0),$$

so that $\chi=1$ sets the velocity to the body's and $0<\chi<1$ moves it that fraction of the way. The $w$ component is driven to 0 inside the body. This is explicit Brinkman penalisation with penalty time equal to the step: the force per unit volume on the fluid is $\mathbf f=\chi(\mathbf u_b-\mathbf u^*)/\Delta t$ (Angot, Bruneau & Fabrie 1999 analyse penalisation of this kind as the penalty parameter tends to zero).

**The mask used here is an inner ramp.**

$$\chi=\operatorname{clamp}\!\left(\frac{R-r}{h},\,0,\,1\right),\qquad r=|\mathbf x_h-\mathbf c|,$$

which is 0 for $r\ge R$, rises linearly, and is 1 for $r\le R-h$. The body lies entirely inside the circle $r=R$.

**Why not the smooth $\tanh$ mask of the 2D page.** That mask, $\chi=\tfrac12[1-\tanh((r-R)/h)]$, is centred on $r=R$ and has tails outside the circle ($\chi=0.02$ at $r=R+1.95h$, $0.01$ at $R+2.30h$, computed from the formula). A small $\chi$ looks harmless but is applied **every step**. In a cell where $\chi$ is small, each step removes the fraction $\chi$ of the difference between the fluid and the body velocity, while viscous diffusion can bring in at most a fraction of order $\nu\Delta t/h^2\le0.05$ per step (section 7.4) of the difference from its neighbours. Whenever $\chi$ is not small compared with that,
the forcing wins and the cell is locked to the body: it behaves as part of the rigid body although $\chi<1$. (Scale argument.) The effective cylinder is then bigger than $R$. A one-dimensional check run for this page (impulsively started wall, explicit diffusion with $\nu\Delta t/h^2=0.05$, $\sqrt{\nu t}=4h$, same update): the point where the velocity has fallen to half its wall value was $1.3h$ **outside** its exact position for the $\tanh$ mask and $0.5h$ **inside** it for the inner ramp (whose centre lies half a cell inside the circle).

*Measured in 2D with the real solver* (centred spinning cylinder, $Re=100$, torque at $t=5$ against the exact azimuthal solution of the impulsively started cylinder): the $\tanh$ mask gave torque errors $+299\,\%$ ($N=32$) and $+92\,\%$ ($N=64$), corresponding to a hydrodynamic radius $R+2.0h$ to $R+2.7h$ (two estimates, from the torque and from the velocity profile); the peak speed exceeded the body speed (up to 1.27 at $N=32$). With the inner ramp the errors are $+7.5\,\%$, $-0.7\,\%$ and $-2.9\,\%$ at $N=32$, $64$ and $128$ (not monotone in $N$).

The properties of the 2D page (a surface smeared over about one to two cells, an error in the interior velocity after projection) carry over. In the `"walls"` case the mask touches the end walls, producing the contact described in section 6.5. The 2D baseline of this page uses the same inner-ramp mask as the 3D run, so 2D and 3D differ only in $N_z$ and in what the third dimension allows.

### 7.6 The projection: deriving the pressure equation

After the momentum step and the body step the velocity $\mathbf u^{**}$ does not satisfy $\nabla\cdot\mathbf u=0$. Correct it with a gradient,
$\mathbf u^{n+1}=\mathbf u^{**}-\nabla q$ with $q=\Delta t\,p$. A gradient field is the only change which does not alter the vorticity (its curl is zero), as
the pressure has no torque (section 3.3), so only the divergent part of $\mathbf u^{**}$ is removed. Demand $\nabla\cdot\mathbf u^{n+1}=0$:

$$0=\nabla\cdot\mathbf u^{**}-\nabla\cdot\nabla q\quad\Longrightarrow\quad\nabla^2q=\nabla\cdot\mathbf u^{**}.$$

In words: the divergence that the momentum step created is the source of a Poisson equation, and the pressure
is the potential whose gradient removes it. Boundary conditions: on a wall the normal velocity of both $\mathbf u^{**}$ and $\mathbf u^{n+1}$ is
the wall's (zero), so $\partial_nq=0$ (Neumann); for periodic $z$, $q$ is periodic. A Neumann problem is solvable only if the
source integrates to zero, $\sum\nabla\cdot\mathbf u^{**}=0$, which holds because no net flow crosses the boundary (the periodic faces cancel);
and $q$ is fixed only up to a constant, removed on the coarsest grid. On the MAC grid
the discrete divergence of the discrete gradient is exactly the 7-point Laplacian,

$$(Lq)_{ijk}=\frac{1}{h^2}\left[\sum_{\text{6 neighbours}}q-n_{ijk}\,q_{ijk}\right],$$

where $n_{ijk}$ counts the *existing* neighbours (a missing neighbour across a wall is dropped, because the face velocity there is not corrected). Solving $Lq=\nabla\cdot\mathbf u^{**}$ exactly would
give $\nabla\cdot\mathbf u^{n+1}=0$ to round-off. Two V-cycles per step (warm-started from the previous step's $q$) leave a small residual divergence, shown by $\max|\nabla\cdot\mathbf u|$ on the page for the finite-volume solver.

### 7.7 Multigrid with semi-coarsening

The V-cycle is the 2D one (section 5 of the 2D page): red–black Gauss–Seidel smoothing, restriction of the residual, a coarse-grid solve, prolongation, and
smoothing again. The difference is in how the grid is coarsened.

**Semi-coarsening.** On each level the $x$ and $y$ cell counts are halved, as in 2D, down to $4\times4$. The $z$ count is halved too, **but only
while $n_z\ge2$**; once it is 1 it stays 1. A coarse cell then is the average of 8 fine children (4 where $z$ is not coarsened).
The prolongation is the interpolation with the weights $\tfrac34,\tfrac14$ in each direction that is coarsened, and a plain copy in $z$ where it
is not.

*Why.* The span may be a single cell ($N_z=1$) or much shorter than $N$, and a power-of-two grid cannot be halved below one cell.

*Why it is still a correct coarse problem.* Average the 3D Poisson equation over $z$ (full span). With periodic or Neumann conditions in $z$,
$\int\partial_z^2q\,dz=\partial_zq|_0^{L_z}=0$, so the $z$-average of $q$ obeys the 2D Poisson equation with the $z$-average of the source. Once $n_z=1$ the coarse problem is therefore this 2D one: it corrects the $z$-uniform part of the error, and the $z$-varying part is handled by smoothing on the finer levels. While $n_z\ge2$ the coarse cell stays cubic ($H=2h$ in all three directions), so
the problem is isotropic, which pointwise Gauss–Seidel smoothing needs. With $N_z=1$ the V-cycle is the 2D one exactly.

**The smoother is coloured in $(x,y)$ only.** Red–black Gauss–Seidel updates all cells of one colour at once (they are not neighbours of each other, so the update is well defined and parallel), then the other colour. The colour here is the parity of $i+j$, **the same in every $z$-plane**. The natural 3D choice, the parity of $i+j+k$, was tried first and rejected. The reason is that the solver runs only two V-cycles per step, so the pressure is not converged, and the leftover error depends on the colouring. For a $z$-uniform problem, a $z$-independent colouring performs identical operations in every plane, so the result stays exactly $z$-uniform; a colouring that alternates with $k$ treats neighbouring planes differently, so the left-over error differs from plane to plane, giving a small $\partial_zq$ and hence a spurious $w$: the solver would seed the very motion the page looks for.
*Measured:* a full finite-volume run with the $(i+j+k)$ colouring produced spanwise differences of $1.5\times10^{-5}$ by itself. *Checked here in isolation:* two V-cycles on a random $z$-uniform source ($N=32$, $N_z=8$) left a $z$-variation of $q$ of $2\times10^{-5}$ of $\max|q|$ with the $(i+j+k)$ colouring and $2\times10^{-16}$ with the $(i+j)$ colouring. The price of the $z$-independent colouring is that a cell and its two $z$-neighbours have the same colour, so the coupling in $z$ is relaxed Jacobi-like rather than Gauss–Seidel-like.

### 7.8 Boundary conditions in $z$, and the 2D baseline

| | `"periodic"` | `"walls"` |
|---|---|---|
| ghost values of $u,v$ across $z$ | wrap around | odd mirror (no slip, wall half a cell away) |
| ghost values of cell-centred quantities | wrap | zero gradient |
| $w$ | $w[N_z]\equiv w[0]$ (kept equal) | $w[0]=w[N_z]=0$ |
| $q$ | periodic | $\partial_zq=0$ |

The **2D baseline is the same code with $N_z=1$ and periodic span**: every $z$-neighbour of a cell is the cell itself, so all $z$-differences are exactly
zero, $w$ stays zero, and the update is identically the 2D one. A pytest checks that `fv3d` with $N_z=1$ and the old $\tanh$ mask matches the 2D page's solver `ns2d` to round-off (the default mask is now the inner ramp, which `ns2d` does not have, so the page's 2D baseline is `fv3d` with $N_z=1$ and the ramp). The code does not allow `"walls"` with
$N_z=1$, which would be a layer one cell thick between two walls rather than the baseline.

## 8. The diagnostics

Notation: $\langle\cdot\rangle_z$ is the average over the span, per $(x,y)$ and component. All integrals are over the
**fluid only**: cells whose centre lies outside the cylinder (the body moves, so the set of cells is recomputed at each time). The rigid body interior is left out because it would add a
constant $2\pi\Omega^2R^2$ to $Z$ for a spinning body and hide the flow. "Per unit span" means dividing by $L_z$, so that a $z$-uniform flow
gives the same number as the 2D simulation, whatever $N_z$ is. Energies are in units of $U_{\mathrm{ref}}^2L^2$ and $Z$ in units of $U_{\mathrm{ref}}^2$ (per unit span).

### 8.1 Spanwise energy growth: $E_w$, $E_{\mathrm{3d}}$, $E_{k_z}$

**Definitions** (integrals over the fluid cells, $dV=h^3$).

$$\begin{aligned}
E &= \frac1{L_z}\int\tfrac12|\mathbf u|^2\,dV ,\\
E_w &= \frac1{L_z}\int\tfrac12\,w^2\,dV ,\\
E_{\mathrm{3d}} &= \frac1{L_z}\int\tfrac12\left|\mathbf u-\langle\mathbf u\rangle_z\right|^2dV .
\end{aligned}$$

*What they mean.* $E$ is the total kinetic energy per unit span. $E_w$ is the part carried by the **out-of-plane velocity**. $E_{\mathrm{3d}}$ is the energy
of whatever varies along $z$: from the velocity at each $(x,y)$ it subtracts the average over $z$, i.e. the "2D part" of the flow, and what is left is the part that a 2D
simulation cannot represent. For a $z$-uniform flow $E_{\mathrm{3d}}=0$ and $E_w=0$ (periodic case).

*Why both?* $E_w$ is zero in any flow with $w=0$, but a flow may vary with $z$ before it develops much $w$; $E_{\mathrm{3d}}$ catches variation in all three components. They are different views of the same loss of 2D-ness
(and neither is a ratio the page needs to define further).

**Spanwise Fourier modes (periodic span).** A Fourier mode along $z$ is a pattern $\cos(2\pi mz/L_z)$ or $\sin(2\pi mz/L_z)$:
**$m$ is the number of wiggles that fit along the span** (wavelength $L_z/m$). $m=0$ is no wiggle at all, the span-average; $m=1$ is one full wave across the span; $m=2$ two waves; and the largest resolved is $m=N_z/2$, two cells per wave. Each velocity component at each $(x,y)$ is a sum of such modes,
and by Parseval's theorem, the mean of the squared signal equals the sum of the squared mode amplitudes. Therefore the energy splits among the modes,

$$E=\sum_{m=0}^{N_z/2}E_{k_z}(m),\qquad E_{k_z}(0)=\text{energy of the span-averaged (2D) flow},\qquad E_{\mathrm{3d}}=\sum_{m\ge1}E_{k_z}(m).$$

The sum equals $E$ exactly (to round-off) with the fluid mask too, because the body does not depend on $z$, so masking commutes with the Fourier transform along $z$; this was checked numerically on random data
($|\sum E_{k_z}-E|\sim10^{-16}$, and $E_{3d}=\sum_{m\ge1}E_{k_z}$). The code defines the amplitude of mode $m$ as the discrete transform along $z$ divided by $N_z$, sums $\tfrac12|\cdot|^2h^2$ over $(x,y)$ and components, and doubles it for $0<m<N_z/2$ (the real transform keeps only one of the $\pm m$ pair); the shortest wave $m=N_z/2$ has no partner and is not doubled. The page plots $m=1$ to $4$ (as many as fit). $E_{k_z}(m)$ is not defined for the walls case, since the flow is not periodic in $z$; there $E_w$ and $E_{\mathrm{3d}}$ are the diagnostics.

**Relevance.** These curves answer the question of the page directly. The 2D baseline has $E_w\equiv0$, $E_{\mathrm{3d}}\equiv0$. In the periodic box, if the 2D flow
is unstable, they depart from their seed level and grow; the way they grow identifies the mechanism.

**How to read them.**

1. *Flat at the floor.* Before any growth the curve sits at the level of the seed disturbance (or round-off). Nothing to see.
2. *Straight line on a log axis: linear instability.* In the linear regime of section 5.1 every mode is $\propto e^{\sigma t}$, so its
   energy is $\propto e^{2\sigma t}$ and $\ln E_{k_z}(m)$ is linear in time with slope $2\sigma_m$. The slope of the
   straight part gives the growth rate (in units of $U_{\mathrm{ref}}/L$; remember the factor 2: the energy is the *square* of the amplitude). Different modes $m$ have
   different slopes; the steepest is the fastest-growing, and its wavelength $L_z/m$ is the preferred spanwise wavelength (limited to integers $m$). Results are in section 5.3.
   The growth rate is a finite-time number measured on a flow that is itself evolving, not an eigenvalue.
3. *Harmonics.* If mode $m$ grows with amplitude $A\propto e^{\sigma t}$, the quadratic nonlinearity feeds mode $2m$ with an amplitude $\propto A^2$, and its energy $\propto A^4\propto e^{4\sigma t}$: a slope twice that of the fundamental. This is theory for weakly nonlinear growth, a way to tell
   a nonlinear transfer from independent linear growth. In the spin-only $Re=100$ run ($N=64$, $N_z=32$, lattice Boltzmann) the measured growth rates of $\ln E_{k_z}$ were $1.10$ ($m=1$, $t=1.1$ to $5.9$), $0.92$ ($m=2$, $t=1.1$ to $8.7$) and $1.03$ ($m=3$, $t=1.1$ to $10.3$) per unit time: similar rates, not twice. So $m=2$ and $m=3$ are not (only) quadratic harmonics of $m=1$, which would grow at about twice its rate; several spanwise modes are unstable at once.
4. *Saturation.* The curve bends over and levels off or oscillates: the perturbation has grown until it modifies the base flow, the neglected $\epsilon^2$ terms matter, and growth is limited by nonlinear
   interaction and dissipation. The saturation level, relative to $E$, measures how 3D the flow finally becomes: late $E_{3d}/E$ was $0.046$, $0.135$, $0.095$ at spin-only $Re=75$, $100$, $150$ and $0.27$ at spin + orbit $Re=800$ (table in section 5.3: lattice Boltzmann, $N=64$, $N_z=32$). Late $E_w/E$ was $0.0094$, $0.026$, $0.013$ and $0.10$ for the same four runs.
5. *The walls case.* $E_w$ and $E_{\mathrm{3d}}$ are non-zero from the beginning, since the Ekman layers (section 6) exist at every $Re$. There is no flat floor and no threshold, and only $E_w$ and $E_{3d}$ are drawn (no $E_{k_z}$ curves). In this case a
   rise of $E_{\mathrm{3d}}$ over time may reflect the Ekman circulation spinning up (a time scale $L_z/\sqrt{\nu\Omega_c}$) rather than an instability; a straight line on a log plot still needs to be checked against that. The final walls run ($Re=200$) had late $E_w/E=0.034$ and $E_{3d}/E=0.24$ (section 6.5).

### 8.2 Horizontal energy spectra

**What the FFT does.** A **Fourier transform** decomposes a field into waves of different sizes: any field in a box is a sum of sines and cosines with wavelengths $1,\tfrac12,\tfrac13,\dots$ of the box side, each with an amplitude; the FFT is the fast algorithm that computes these amplitudes. The horizontal
wavenumber vector $(k_x,k_y)$ (in units of $2\pi/L$) has magnitude $k$, and the wave has wavelength $L/k$: small $k$ is large structures, large $k$ is fine detail. The **energy spectrum** $E(k)$ is the
energy contained in all waves whose $|\mathbf k|$ falls in the shell of unit width around $k$ (the sketch below is for the unwindowed field; the code's version follows):

$$E_k=\sum_{\mathbf k:\ k-\frac12\le|\mathbf k|<k+\frac12}\ \tfrac12\left|\hat{\mathbf u}(\mathbf k)\right|^2 ,$$

summed over the three components, computed for each $z$-plane in $(x,y)$ and then averaged over planes. With the normalisation of the code (explained below) the sum $\sum_kE_k$ is exactly the plane's kinetic energy.

**Why a window.** The FFT treats a field as if it were periodic: the left edge is glued to the right edge. The box is not periodic; the velocity is zero at the walls but the
field is not smooth across the glued seam (in value or in slope), and the FFT spreads that artificial kink over all wavenumbers. The code therefore
multiplies each field by the **Hann window** $W(x)W(y)$, $W(x)=\sin^2(\pi x)$ (Harris 1978), which goes to zero smoothly at all four edges. The cost: the walls' boundary layers are weighted by almost nothing, so the windowed spectrum describes mainly the **core of the box**.

**Normalisation: windowed shape, rescaled to the true energy.** Windowing also removes energy: $\sum_k E^{\mathrm{win}}_k=\tfrac12\langle(Wu)^2\rangle$ (Parseval, summed over the three components) is smaller than the true plane energy $\tfrac12\langle u^2\rangle$, and the loss depends on where the energy sits. The code therefore uses the window only to decide **how the plane's energy is shared among the shells**, and fixes the **amount** by one multiplier per plane:

$$E_k=\frac{\mathcal E_{\text{true}}}{\sum_{k'}E^{\mathrm{win}}_{k'}}\;E^{\mathrm{win}}_k,\qquad \mathcal E_{\text{true}}=\tfrac12\sum|\mathbf u|^2h^2\ \text{over the fluid cells of the plane}.$$

By construction $\sum_kE_k=\mathcal E_{\text{true}}$ for each plane, and after averaging planes the sum is exactly the fluid energy $E$ (checked to $10^{-16}$ on random data). In words: the plot is a distribution of the true energy over scales; the window is only a way to avoid the artificial kink in that distribution. It cannot say anything about the part of the energy hidden by the window (the wall layers). Further details of what is plotted:

- The body cells are set to zero before the transform. The hole is a sharp discontinuity and leaks energy into all shells, a broadband contribution that is not physics.
- Shells have width 1 in $|\mathbf k|$ (shell $k$ holds $k-\tfrac12\le|\mathbf k|<k+\tfrac12$ with $k$ in units of $2\pi/L$) and run out to the corners of the FFT square. The $k=0$ shell is not plotted.
- The 2D curve is one plane. The 3D curve is the average over **at most 8 evenly spaced $z$-planes** (a cost saving), so for $N_z>8$ the sum under the 3D curve is the mean energy of those planes, not exactly $E$. The "average spectra over the last ... time units" control averages the curves in time.

**How to read the plot.** Use log–log axes.

- *A power law $E\propto k^{-s}$ is a straight line of slope $-s$* over a range of $k$. The theoretical slopes of section 3.7 are $-5/3$ (3D inertial range; 2D inverse range) and $-3$ (2D enstrophy range).
  Neither says anything unless the straight range is wide, a decade or more, which is demanding at the $Re$ and $N$ of this page.
- *A smooth laminar flow* has a spectrum that falls off faster than any power at high $k$ (exponentially), and shows a fast drop at the viscous scale.
- *The tail at the highest $k$* reflects the grid and the scheme (numerical dissipation, section 7.3), not physics, and slopes there should not be interpreted.
- *The slope cannot distinguish a forward from an inverse cascade* (both are $-5/3$), and cannot be compared across cases with different forcing without care.
- The cylinder, the walls' corners and the body's mask edge are sources of broadband energy that are not turbulence;
  the spectrum of a non-homogeneous, bounded flow is only a rough guide (this is an expectation, not something verified).

**2D versus 3D by theory.** In 3D, energy flows forward to small scales and is dissipated there; in 2D the energy goes backward and the enstrophy forward (section 3.7). The two spectra can therefore have different slopes in the fine-scale
range and different amounts of energy at the largest scales. Measured (spin only, lattice Boltzmann, $N=64$, $N_z=32$, $L_z=0.5$, one snapshot at $t=20$, fluid only): the energy at $k\le3$ is $0.0111$ (3D) against $0.0179$ (2D) at $Re=100$ and $0.0117$ against $0.0175$ at $Re=150$; the energy at $k\ge8$ is larger in 3D by the factor $1.12$ ($Re=100$) and $1.18$ ($Re=150$). Shell by shell the curves are jagged (one snapshot, and the hole left by the body leaks energy across shells). Least-squares slopes of $\ln E$ against $\ln k$ over $k=4$ to $16$ are $-1.73$ (3D) and $-1.69$ (2D) at $Re=100$, and $-1.34$ and $-1.71$ at $Re=150$, but there is no clean power-law range at these $Re$ and this grid, so these slopes are not compared with the theoretical ones.

### 8.3 Torque, kinetic energy and enstrophy histories

**Torque.** $T$ is the $z$-torque exerted by the fluid *on the cylinder* about its centre, per unit span. For a circular cylinder the pressure acts normal to the surface, along the radius, and therefore has no moment about the centre. The torque is entirely the **viscous shear stress** at the surface, integrated over the circumference times the radius.
A spinning cylinder in a fluid at rest feels a torque opposing its spin ($T<0$ for $\Omega>0$; negative in every run reported below).

*How the code gets it.* The penalisation of section 7.5 exerts the force per unit volume $\mathbf f=\chi(\mathbf u_b-\mathbf u^*)/\Delta t$ on the fluid. By Newton's third law the fluid exerts the opposite force on the body, so

$$T=-\sum(\mathbf x-\mathbf c)\times\mathbf f\;\frac{h^3}{L_z},$$

the sum running over the interior velocity faces with $z$-component $(x-c_x)f_y-(y-c_y)f_x$, and $h^3/L_z$ turning the sum over cell volumes into a torque per unit span. The sum also contains the force that keeps the fluid inside the body moving rigidly; that part is not separated here. (The lattice-Boltzmann solver obtains the torque by momentum exchange on the links cut by the cylinder surface instead.)

*Accuracy against an exact solution* (centred spinning cylinder, 2D, $Re=100$, impulsively started; exact azimuthal flow, torque at $t=5$): finite volumes with the inner ramp $+7.5\,\%$, $-0.7\,\%$, $-2.9\,\%$ at $N=32$, $64$, $128$; lattice Boltzmann $+5.8\,\%$ and $+0.5\,\%$ at $N=32$ and $64$. The exact solution is not available for the orbiting cases.

Read: the torque is large at the start (the impulsive start from rest creates thin
boundary layers with steep velocity gradients), then falls as the layer thickens and the fluid swirls along; steady swirl gives a steady torque, and **fluctuations signal unsteady flow at the cylinder surface**.

*Why the page shows a running mean.* When the cylinder orbits, the torque computed at a single time level scatters strongly about its smooth trend because the body edge moves across the grid. Measured on a spin + orbit case ($Re=100$), as scatter about a smooth fit divided by the mean: finite volumes $32\,\%$ ($N=32$) and $24\,\%$ ($N=64$); lattice Boltzmann $216\,\%$ and $63\,\%$ (the cause was not isolated for finite volumes; for lattice Boltzmann it is attributed to links changing as the boundary moves).
The page therefore plots the mean of the torque samples taken during the last 0.25 time units (one sample per displayed frame, each frame at most 0.05 time units long) and shows nothing for $t<0.25$; the raw samples can be switched on. For lattice Boltzmann the scatter of block means was $7\,\%$ at $N=32$ and $3\,\%$ at $N=64$ (so a running mean reduces, but does not remove, the noise).
The table below uses single-time-level torque samples taken every 0.1 time units, averaged over $t=10$ to $20$ (about 100 samples).

**Energy and enstrophy per unit span.** $E$ was defined in 8.1; $Z=\dfrac1{L_z}\displaystyle\int\tfrac12|\boldsymbol\omega|^2dV$, both over the fluid cells only.
$E$ measures how much the fluid moves, $Z$ how much it spins and shears, weighted towards small scales (section 3.6). For a spinning cylinder the body interior would have contributed the constant $2\pi\Omega^2R^2$ to $Z$; it is excluded. The vorticity is computed from the full velocity field (so cells next to the body use the body-cell velocities), then only fluid cells are summed.
*Accuracy of $E$* (same exact solution, $t=2$, only cells more than $2h$ from the surface, which the penalised body cannot represent): finite volumes $-34\,\%$, $-19\,\%$, $-12\,\%$ at $N=32$, $64$, $128$; lattice Boltzmann $+40\,\%$ and $+7\,\%$ at $N=32$, $64$. The spin-up layer thickness $\sqrt{\nu t}\approx0.063$ is only about 4 cells at $N=64$, which is why the early energy is the hardest to get right.

**The energy budget: what is and is not computed.** Section 3.6 gave $dE_V/dt=-2\nu Z_V$ for a closed box with fixed walls. The page does **not** draw an energy budget; it plots $E$, $Z$ and $T$ separately. The reason the budget cannot be read off from them is as follows (derivation).

Let the fluid fill $V_f$, bounded by fixed walls and by the body surface $S_b$ moving with $\mathbf u_b$ (normal $\mathbf n$ out of the fluid, i.e. into the body). Multiplying the momentum equation by $\mathbf u$ and integrating, with the convective flux relative to the moving boundary zero on $S_b$ (the fluid does not cross it), gives

$$\frac{dE_V}{dt}=P_{\mathrm{in}}-2\nu\int_{V_f}S_{ij}S_{ij}\,dV,\qquad P_{\mathrm{in}}=\oint_{S_b}\mathbf u_b\cdot\boldsymbol\sigma\cdot\mathbf n\,dS=-\left(T\,\Omega+\mathbf F\cdot\mathbf U_c\right),$$

where $\boldsymbol\sigma=-p\mathsf I+2\nu\mathsf S$ is the stress, $P_{\mathrm{in}}$ the work done on the fluid by the body (minus the power of the fluid's forces on the body, with $\mathbf F$ the force of the fluid on the body and $\mathbf U_c$ the velocity of its centre), and the second term is the viscous dissipation. In words: the motor pays for what viscosity burns plus what raises the kinetic energy.
The dissipation is expressed with the vorticity as follows. Pointwise, $\partial_ju_i\partial_ju_i=|\boldsymbol\omega|^2+\partial_ju_i\partial_iu_j$ (from $\|\mathsf\Omega\|^2=\tfrac12|\boldsymbol\omega|^2$ in section 4), so $2S_{ij}S_{ij}=|\boldsymbol\omega|^2+2\,\partial_ju_i\partial_iu_j$. With $\partial_ju_j=0$,
$\partial_ju_i\partial_iu_j=\partial_j(u_i\partial_iu_j)$, a divergence, so its integral is the surface integral $B=\oint n_ju_i\partial_iu_j\,dS$. On fixed walls $\mathbf u=0$ and it vanishes; on the moving body it does not. Hence

$$2\nu\int_{V_f}S_{ij}S_{ij}\,dV=2\nu Z_V^{\mathrm{fluid}}+2\nu B_{\mathrm{body}},\qquad Z_V^{\mathrm{fluid}}=\int_{V_f}\tfrac12|\boldsymbol\omega|^2dV .$$

For a centred spinning cylinder with an axisymmetric flow, at the surface $\mathbf u=\Omega R\,\hat{\boldsymbol\theta}$ and $(\mathbf u\cdot\nabla)\mathbf u=-\Omega^2R\,\hat{\mathbf r}$, so with $\mathbf n=-\hat{\mathbf r}$ the integrand is $\Omega^2R$ and $B=2\pi\Omega^2R^2$ per unit span: exactly the enstrophy $2\pi\Omega^2R^2$ of the rigid interior. So for a centred spin the dissipation equals $2\nu$ times the enstrophy of the *whole box including the body interior*, and **the fluid-only $Z$ that the page plots is not the dissipation**: the difference is the body-surface term. I checked this with the steady annular Couette solution (inner radius $R=0.1$, outer $0.5$): the dissipation $2\nu\int S:S$ equals the power $-T\Omega$ to round-off, $2\nu Z^{\mathrm{fluid}}$ accounts for only the fraction $R^2/r_{\mathrm{out}}^2=4\,\%$ of it, and the remainder equals $2\nu\cdot2\pi\Omega^2R^2$. (In that steady flow the fluid is nearly irrotational and the dissipation is almost all strain.) For the orbiting body $B$ has extra terms that are not derived here.

*What is not closed.* The page never evaluates $P_{\mathrm{in}}$ or the dissipation, so no budget residual is shown. An independent review that compared $dE/dt-P_{\mathrm{in}}+D$ for a spinning cylinder at $N=64$ (earlier code version, before the inner-ramp mask) found residuals of $10$ to $30\,\%$ of $P_{\mathrm{in}}$ at late times with $D=2\nu Z$ over the whole box, and much larger ones ($-64$ to $-77\,\%$) with $D=2\nu Z$ over the fluid only; $D=2\nu\int S:S$ over the fluid closed to $\pm2\,\%$ for finite volumes but left $+25\,\%$ for lattice Boltzmann, for a reason that was not resolved. the final-code residual was not measured here.

**3D against 2D histories.** The mechanism of sections 3.4 to 3.6 is an *expectation*: before the 3D instability (periodic span), or at low $Re$, the flow stays 2D and the histories coincide ($N_z>1$ against $N_z=1$). After the transition the vortex-stretching term $\int\omega_iS_{ij}\omega_j\,dV$, which is exactly zero in the 2D run, can produce enstrophy in the 3D run. The page did not compute the stretching term itself, so what follows tests only its consequences.

Measured (lattice Boltzmann, $N=64$, $N_z=32$, $L_z=0.5$, periodic unless noted; $R=0.1$, $r_o=0.2$; late means over $t=10$ to $20$; each 3D run has its own $N_z=1$ baseline with the same inputs; "separates" is the first time $t\ge0.5$ at which the five-sample running mean of $|3D-2D|/|2D|$ exceeds $5\,\%$):

| case | $Re$ | $E_{3D}/E_{2D}$ | $Z_{3D}/Z_{2D}$ | $T_{3D}/T_{2D}$ | $E$, $Z$, $T$ separate at $t$ |
|---|---|---|---|---|---|
| spin only | 50 | 1.00 | 1.00 | 1.00 | never (3D equals 2D) |
| spin only | 75 | 0.947 | 1.50 | 1.05 | 16.2, 12.9, 16.0 |
| spin only | 100 | 0.785 | 2.57 | 1.17 | 11.1, 8.6, 10.6 |
| spin only | 150 | 0.744 | 3.36 | 1.32 | 7.3, 5.5, 6.7 |
| spin + orbit | 25 | 1.00 | 1.00 | 1.00 | never |
| spin + orbit | 800 | 0.912 | 3.48 | 5.26 | 4.1, 3.2, 2.8 |
| spin only, **end walls** | 200 | 0.519 | 5.88 | 3.09 | 0.8, 0.5, 0.5 |

What this shows. (i) Where the seed decays (orbit $Re=25$) or grows only extremely slowly (spin only $Re=50$) the 3D and 2D late means are equal to the digits shown; in the spin-only runs where $E_{3d}$ grows, $Z$ separates first and by far the most, $Z_{3D}/Z_{2D}$ rising with $Re$ from 1.5 to 3.4, which agrees in direction with the stretching picture (it does not prove it: other 3D effects also change $Z$). (ii) The 3D flow has *less* kinetic energy than the 2D one in the same runs (ratio 0.74 to 0.95) and a *larger* torque (ratio 1.05 to 1.32; 5.3 for the orbit case at $Re=800$, where the 2D torque is very small, $-6.6\times10^{-5}$ against $-3.5\times10^{-4}$). (iii) With end walls the histories separate at once ($t\le0.8$) because the Ekman layers (section 6) exist from the start.
A cross-check with the finite-volume solver at spin-only $Re=100$ (inner-ramp mask, same grid) gave $E_{3D}/E_{2D}=0.864$ (lattice Boltzmann 0.785), $Z$ ratio 2.39 (2.57), $T$ ratio 1.10 (1.17): the same signs and about the same size, with differences of 6 to 10 % between the methods in these ratios. The two methods treat the cylinder surface differently, which mostly affects the enstrophy of the cells next to it.
What is *not* measured: the stretching integral $\int\omega_iS_{ij}\omega_j\,dV$ itself (the page does not compute it, so the enstrophy excess is reported, not attributed to stretching). The reason for the lower energy and higher torque was not investigated.

## References

- G. K. Batchelor, *An Introduction to Fluid Dynamics* (Cambridge University Press, 1967): vorticity equation, circulation, Kelvin's theorem.
- G. K. Batchelor, Computation of the energy spectrum in homogeneous two-dimensional turbulence, *Phys. Fluids* 12, II-233 (1969).
- R. B. Bird, W. E. Stewart, E. N. Lightfoot, *Transport Phenomena* (Wiley, 2nd ed. 2002): Navier–Stokes equations.
- B. J. Bayly, Three-dimensional centrifugal-type instabilities in inviscid two-dimensional flows, *Phys. Fluids* 31, 56 (1988).
- U. T. Bödewadt, Die Drehströmung über festem Grunde, *Z. Angew. Math. Mech.* 20, 241 (1940).
- G. Boffetta, R. E. Ecke, Two-dimensional turbulence, *Annu. Rev. Fluid Mech.* 44, 427 (2012).
- S. Albensoeder, H. C. Kuhlmann, H. J. Rath, Three-dimensional centrifugal-flow instabilities in the lid-driven-cavity problem, *Phys. Fluids* 13, 121 (2001).
- P. Angot, C.-H. Bruneau, P. Fabrie, A penalization method to take into account obstacles in incompressible viscous flows, *Numer. Math.* 81, 497 (1999).
- H. J. H. Clercx, G. J. F. van Heijst, Dissipation of coherent structures in confined two-dimensional turbulence, *Phys. Fluids* 29, 111103 (2017).
- P. G. Drazin, W. H. Reid, *Hydrodynamic Stability* (Cambridge University Press, 2nd ed. 2004): Rayleigh's criterion, Taylor–Couette flow.
- D. R. Durran, *Numerical Methods for Fluid Dynamics* (Springer, 2nd ed. 2010): stability of Adams–Bashforth schemes.
- A. Einstein, Die Ursache der Mäanderbildung der Flußläufe und des sogenannten Baerschen Gesetzes, *Die Naturwissenschaften* 14, 223 (1926): tea leaves.
- R. Fjørtoft, On the changes in the spectral distribution of kinetic energy for two-dimensional, nondivergent flow, *Tellus* 5, 225 (1953).
- H. Görtler, Über eine dreidimensionale Instabilität laminarer Grenzschichten an konkaven Wänden, *Nachr. Ges. Wiss. Göttingen, Math.-Phys. Kl.* 2, 1 (1940).
- H. Helmholtz, Über Integrale der hydrodynamischen Gleichungen, welche den Wirbelbewegungen entsprechen, *J. reine angew. Math.* 55, 25 (1858).
- H. P. Greenspan, *The Theory of Rotating Fluids* (Cambridge University Press, 1968).
- H. P. Greenspan, L. N. Howard, On a time-dependent motion of a rotating fluid, *J. Fluid Mech.* 17, 385 (1963).
- F. J. Harris, On the use of windows for harmonic analysis with the discrete Fourier transform, *Proc. IEEE* 66, 51 (1978).
- J. C. R. Hunt, A. A. Wray, P. Moin, Eddies, streams, and convergence zones in turbulent flows, *Center for Turbulence Research Report* CTR-S88, 193 (1988).
- J. Jeong, F. Hussain, On the identification of a vortex, *J. Fluid Mech.* 285, 69 (1995).
- A. N. Kolmogorov, The local structure of turbulence in incompressible viscous fluid for very large Reynolds numbers, *Dokl. Akad. Nauk SSSR* 30, 301 (1941).
- R. H. Kraichnan, Inertial ranges in two-dimensional turbulence, *Phys. Fluids* 10, 1417 (1967).
- R. H. Kraichnan, Inertial-range transfer in two- and three-dimensional turbulence, *J. Fluid Mech.* 47, 525 (1971).
- R. J. Lingwood, Absolute instability of the Ekman layer and related rotating flows, *J. Fluid Mech.* 331, 405 (1997).
- S. B. Pope, *Turbulent Flows* (Cambridge University Press, 2000).
- Lord Rayleigh, On the dynamics of revolving fluids, *Proc. R. Soc. Lond. A* 93, 148 (1917).
- W. S. Saric, Görtler vortices, *Annu. Rev. Fluid Mech.* 26, 379 (1994).
- L. M. Smith, J. R. Chasnov, F. Waleffe, Crossover from two- to three-dimensional turbulence, *Phys. Rev. Lett.* 77, 2467 (1996).
- G. I. Taylor, Stability of a viscous liquid contained between two rotating cylinders, *Phil. Trans. R. Soc. Lond. A* 223, 289 (1923).
- G. I. Taylor, Production and dissipation of vorticity in a turbulent fluid, *Proc. R. Soc. Lond. A* 164, 15 (1938).
- H. Tennekes, J. L. Lumley, *A First Course in Turbulence* (MIT Press, 1972).
- F. Waleffe, On the three-dimensional instability of strained vortices, *Phys. Fluids A* 2, 76 (1990).
- Algorithms taken over from the 2D page: F. H. Harlow, J. E. Welch (1965); A. J. Chorin (1968); B. van Leer (1979); P. L. Roe (1986); A. Brandt (1977); W. L. Briggs et al. (2000); see the references of that page.
