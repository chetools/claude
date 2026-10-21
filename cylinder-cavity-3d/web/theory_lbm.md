## 1. Why a particle picture can give Navier–Stokes

The Navier–Stokes (NS) equations treat the fluid as a continuum: fields $\rho(\mathbf x,t)$, $\mathbf u(\mathbf x,t)$,
$p(\mathbf x,t)$ that obey balance laws. The lattice Boltzmann method (LBM) starts one level below. It does not follow
individual molecules, and it does not store $\mathbf u$ and $p$ directly. It stores **populations**: how much fluid
mass at each point is moving with each of a few chosen velocities. The NS fields are then *sums over these
populations*. This section explains why that is a sensible thing to do. Sections 2–5 show that the sums obey the NS
equations, with every step written out.

### 1.1 Index notation: the only tensor mathematics needed

Vectors and tensors appear below as lists of numbers with subscripts. The rules are short.

- A vector has three components, $a_x, a_y, a_z$. The symbol $a_i$ means "component $i$", where $i$ stands for any
  of $x, y, z$. Subscripts $i, j, k, l$ always label **space directions**.
- **Repeated index means sum.** $a_ib_i = a_xb_x + a_yb_y + a_zb_z = \mathbf a\cdot\mathbf b$. A subscript that
  appears only once is free, and the equation holds for each of its values.
- The **Kronecker delta** $\delta_{ij}$ is $1$ if $i=j$ and $0$ otherwise. It is the identity matrix. Two facts
  follow at once: $\delta_{ii} = 3$ and $a_i\delta_{ij} = a_j$.
- $u_iu_j$ is a table of nine numbers, $u_xu_x, u_xu_y,\dots$ (the dyad $\mathbf u\mathbf u$ of BSL).
- $\partial_i$ means $\partial/\partial x_i$, and $\partial_t$ means $\partial/\partial t$. Then $\partial_iu_i =
  \nabla\cdot\mathbf u$, and $\partial_j(\rho u_iu_j)$ is the $i$-th component of $\nabla\cdot(\rho\mathbf u\mathbf u)$.
- The **lattice velocities** are labelled by a different index, $q = 0,\dots,18$. $\mathbf c_q$ is the $q$-th
  lattice velocity, $c_{qi}$ its component in direction $i$, and $\sum_q$ a sum over all 19 of them.

In this notation the incompressible NS momentum equation, which is the target of the whole derivation, reads

$$\partial_t(\rho u_i) + \partial_j(\rho u_iu_j) = -\partial_i p + \partial_j\!\left[\mu\,(\partial_iu_j + \partial_ju_i)\right].$$

For constant $\mu$ and $\partial_ju_j=0$, the viscous term is $\mu\,\partial_j\partial_ju_i + \mu\,\partial_i(\partial_ju_j) = \mu\nabla^2u_i$.
So this is the familiar $\rho\,D\mathbf u/Dt = -\nabla p + \mu\nabla^2\mathbf u$ of BSL, written one component at a time.

### 1.2 From molecules to a distribution function

Consider a small volume of gas or liquid. It holds an enormous number of molecules, each with its own velocity
$\mathbf c$. Sort them by velocity. Let $f(\mathbf x,\mathbf c,t)\,d^3x\,d^3c$ be the mass of molecules that are
inside the volume $d^3x$ around $\mathbf x$ *and* have a velocity inside $d^3c$ around $\mathbf c$.
The function $f$ is the **distribution function**.

**Chemical-engineering analogy.** Think of a well-mixed tank that holds many "species", where the species label is
the velocity $\mathbf c$ instead of a chemical identity. In the LBM there are exactly 19 species, one per lattice
velocity, and the tank is every lattice node. Each species is moved by convection, but its own velocity $\mathbf c$
plays the part of the convection velocity. Molecular collisions turn one species into others, like a reaction
network. A collision between two molecules conserves their total mass and their total momentum. The elements in a
reaction network play the same role: they are not created or destroyed, whatever the reactions do.

The population balance for species $\mathbf c$ is the **Boltzmann equation**

$$\frac{\partial f}{\partial t} + c_i\frac{\partial f}{\partial x_i} = \Omega(f).$$

Read it as "accumulation + convection = reaction". The left side is a convection equation in which the species
$\mathbf c$ is carried at velocity $\mathbf c$. The right side, the **collision operator** $\Omega$, is the net rate
at which collisions create species $\mathbf c$. It moves mass between velocity classes at the same place. It
creates or destroys neither mass nor momentum, so its zeroth and first velocity moments vanish (shown below).

### 1.3 Moments: density, momentum, momentum flux

The macroscopic fields are **moments** of $f$, that is, integrals over all velocities:

$$\rho = \int f\,d^3c, \qquad \rho u_i = \int c_i\,f\,d^3c, \qquad \Pi_{ij} = \int c_ic_j\,f\,d^3c .$$

The first is the mass per unit volume. The second is the momentum per unit volume. The third, $\Pi_{ij}$, is the
**momentum flux tensor**: its entry $(i,j)$ is the rate at which momentum component $i$ crosses a unit surface
normal to direction $j$. Each molecule crossing the surface carries momentum $c_i$ and crosses at rate $\propto c_j$.
$\Pi_{ij}$ is the sum of these contributions.

Split each molecular velocity into the mean and a random part: $\mathbf c = \mathbf u + \mathbf c'$. Then

$$\Pi_{ij} = \rho u_iu_j + P_{ij}, \qquad P_{ij} = \int c'_ic'_j\,f\,d^3c .$$

The first term is momentum carried by the bulk flow (convection). The second, $P_{ij}$, is momentum carried by the
*random* motion. In BSL notation $\Pi_{ij}$ is the combined momentum flux tensor
$\boldsymbol\phi = \rho\mathbf v\mathbf v + \boldsymbol\pi = \rho\mathbf v\mathbf v + p\boldsymbol\delta + \boldsymbol\tau$ (Bird, Stewart & Lightfoot 2002),
so $P_{ij}= p\,\delta_{ij} + \tau_{ij}$. Both of its parts have a simple molecular picture.

- **Pressure.** Even in a fluid at rest, molecules cross any surface in both directions, and they carry momentum
  across it. The normal-momentum flux, equal in all directions, is $p$.
- **Viscous shear stress.** Let $\tau_{xy}$ be the flux of $x$-momentum across a surface normal to $y$.
  Molecules that move upward ($c'_y>0$) come from the layer below, where the mean $x$-velocity is lower. Those
  that move downward come from the layer above, where it is higher. The two streams carry different $x$-momentum
  across the surface, so $\int c'_xc'_y f\,d^3c \ne 0$. This is BSL's molecular picture of viscosity.

Taking $\int d^3c$ of the Boltzmann equation, and using the fact that collisions conserve mass ($\int\Omega\,d^3c=0$),
gives the exact continuity equation. Taking $\int c_i\,d^3c$ of it, and using conservation of momentum
($\int c_i\Omega\,d^3c=0$), gives the exact momentum equation:

$$\partial_t\rho + \partial_i(\rho u_i) = 0, \qquad \partial_t(\rho u_i) + \partial_j\Pi_{ij} = 0 .$$

These are the conservation laws of BSL. Everything now depends on **what $\Pi_{ij}$ is**. If it equals
$\rho u_iu_j + p\delta_{ij} - \mu(\partial_iu_j+\partial_ju_i)$, these *are* the NS equations. The system is not closed
yet, because $\Pi_{ij}$ is a moment of $f$, and $f$ obeys its own equation. Collisions drive $f$ quickly towards a
local equilibrium. Close to equilibrium, $\Pi_{ij}$ can be computed in terms of $\rho$ and $\mathbf u$. The slight
departure from equilibrium is proportional to the velocity gradients. That is where viscosity comes from.
The Chapman–Enskog expansion (§5; Chapman & Cowling 1970) carries this out. The lattice Boltzmann method is a
numerical scheme that follows $f$ directly, with so few velocities that the whole calculation is affordable.

One more physical fact: the page's LBM is **isothermal**. Temperature is fixed, and the only thermodynamic
constant is the **lattice sound speed** $c_s$, with $c_s^2 = k_BT/m$ for an ideal gas. The pressure is then
$p = \rho c_s^2$, an ideal-gas equation of state. Pressure is no longer a Lagrange multiplier as in the
finite-volume code. It is a property of the local density.

## 2. The D3Q19 lattice

### 2.1 Velocities and weights

Instead of a continuum of velocities $\mathbf c$, the LBM keeps $19$ ("Q19") in three dimensions ("D3"). Place
nodes on a cubic grid with spacing $h$. Choose a time step $\Delta t$ and write $c = h/\Delta t$ for the lattice
speed. The 19 velocities are $c\,\mathbf e_q$ with integer vectors $\mathbf e_q$ that point from a node to
its neighbours:

- the node itself, $(0,0,0)$: 1 vector;
- the 6 **face neighbours** $(\pm1,0,0)$, $(0,\pm1,0)$, $(0,0,\pm1)$, at distance $h$;
- the 12 **edge neighbours** $(\pm1,\pm1,0)$, $(\pm1,0,\pm1)$, $(0,\pm1,\pm1)$, at distance $\sqrt2\,h$.

Picture a $3\times3\times3$ block of nodes with the centre node in the middle. The centre, the 6 face centres and the
12 edge midpoints are used. The 8 corners are left out. (The D3Q27 lattice keeps the corners, and D3Q19 saves
memory by dropping them.) The numbering used by the page's code is:

| $q$ | $\mathbf e_q$ | $w_q$ | opposite | $q$ | $\mathbf e_q$ | $w_q$ | opposite |
|---|---|---|---|---|---|---|---|
| 0 | $(0,0,0)$ | $1/3$ | 0 | 10 | $(-1,1,0)$ | $1/36$ | 9 |
| 1 | $(1,0,0)$ | $1/18$ | 2 | 11 | $(1,0,1)$ | $1/36$ | 12 |
| 2 | $(-1,0,0)$ | $1/18$ | 1 | 12 | $(-1,0,-1)$ | $1/36$ | 11 |
| 3 | $(0,1,0)$ | $1/18$ | 4 | 13 | $(1,0,-1)$ | $1/36$ | 14 |
| 4 | $(0,-1,0)$ | $1/18$ | 3 | 14 | $(-1,0,1)$ | $1/36$ | 13 |
| 5 | $(0,0,1)$ | $1/18$ | 6 | 15 | $(0,1,1)$ | $1/36$ | 16 |
| 6 | $(0,0,-1)$ | $1/18$ | 5 | 16 | $(0,-1,-1)$ | $1/36$ | 15 |
| 7 | $(1,1,0)$ | $1/36$ | 8 | 17 | $(0,1,-1)$ | $1/36$ | 18 |
| 8 | $(-1,-1,0)$ | $1/36$ | 7 | 18 | $(0,-1,1)$ | $1/36$ | 17 |
| 9 | $(1,-1,0)$ | $1/36$ | 10 | | | | |

For odd $q$ the opposite direction is $q+1$, and for even $q>0$ it is $q-1$. We write $\bar q$ for the opposite of
$q$, so that $\mathbf c_{\bar q} = -\mathbf c_q$. The page works in **lattice units** from here on: $h=\Delta t=1$ and
$\mathbf c_q = \mathbf e_q$. Physical units come back in §7.

The $w_q$ are **weights**. They depend only on the length of $\mathbf c_q$ (the rest vector, face vectors, edge
vectors), and they sum to one. In the equilibrium (§4) they give the share of the fluid mass that sits on each
link when the fluid is at rest: $1/3$ stays at the node, $1/18$ on each of the six face links, $1/36$ on each of the
twelve edge links.

For this set of 19 velocities the weights and the sound speed are not chosen freely. They are fixed by the requirement that the lattice has
**no preferred direction up to fourth-order moments**. This is the subject of §2.2 and §2.3.

### 2.2 Why isotropy matters

Section 1 showed that the macroscopic fields are velocity moments of $f$. In the continuum, moments of an
equilibrium (Gaussian) distribution are *isotropic*. For instance, the pressure is the same in all directions.
The lattice replaces integrals over velocity by sums over 19 vectors:

$$\int g(\boldsymbol\xi)\,P(\boldsymbol\xi)\,d^3\xi \;\longrightarrow\; \sum_q w_q\,P(\mathbf c_q).$$

Here $P$ is a polynomial in the velocity and $g$ is the Gaussian weight function of §4. If the sums are to
reproduce the continuum results, they must have the continuum's rotational symmetry for all moments that appear in the derivation, which go up to fourth order. The
required identities are

$$
\begin{aligned}
\sum_q w_q &= 1, \\
\sum_q w_q\,c_{qi} &= 0, \\
\sum_q w_q\,c_{qi}c_{qj} &= c_s^2\,\delta_{ij}, \\
\sum_q w_q\,c_{qi}c_{qj}c_{qk} &= 0, \\
\sum_q w_q\,c_{qi}c_{qj}c_{qk}c_{ql} &= c_s^4\left(\delta_{ij}\delta_{kl} + \delta_{ik}\delta_{jl} + \delta_{il}\delta_{jk}\right).
\end{aligned}
$$

The right-hand sides are exactly the moments of a Gaussian of variance $c_s^2$ per velocity component. Its
second moment is $c_s^2\delta_{ij}$. Its fourth moment is $c_s^4$ times the sum over the three ways to pair up four
indices, which is the standard rule for Gaussian moments (Isserlis' theorem). The left-hand sides are sums over the
lattice that we can count.

In words, the identities say: (1) the weights are a probability distribution; (2) and (4) for every velocity there is
an opposite one, so the average velocity and every odd moment vanish; (3) the "thermal motion" is equal in
all directions ($x$, $y$, $z$) and uncorrelated between them; (4) the fourth-order statistics also do not
depend on direction. If any of these failed, the lattice would produce a stress tensor with built-in
preferred directions (an anisotropic viscosity or pressure), and the result would not be NS.

### 2.3 Proving the identities for D3Q19 by counting

*Odd moments.* The velocity set is symmetric under $\mathbf c\to-\mathbf c$ (every vector has its opposite, and the weight
is the same for both). A term $w\,c_ic_jc_k$ then cancels against the term of the opposite vector, and the same holds
for the first moment. So $\sum_q w_qc_{qi} = 0$ and $\sum_q w_qc_{qi}c_{qj}c_{qk}=0$. (The same argument kills any
odd order, in particular the fifth.)

*Even-order sums with an odd index count.* The lattice is mirror-symmetric in each axis. For example, flipping the sign of
$c_y$ maps the lattice onto itself, so a sum such as $\sum w\,c_x^3c_y$ must equal minus itself, and is zero. In general, any component of the
second- or fourth-order sums in which some index occurs an *odd* number of times is zero. What remains are the patterns with all indices paired:
$\sum w\,c_x^2$ (and its $y$, $z$ copies), $\sum w\,c_x^4$ and $\sum w\,c_x^2c_y^2$. The cubic symmetry
(permuting $x,y,z$) makes the copies equal. So only four numbers need to be counted.

*Counting.* Let the unknown weights be $w_0$ (rest vector), $w_1$ (the 6 face vectors) and $w_2$ (the 12 edge vectors).
For each sum, count how many vectors of each class contribute (a vector contributes only if the product of
the components is non-zero; then the product equals $1$):

| sum | rest (1 vector) | face (6) | edge (12) |
|---|---|---|---|
| $\sum w$ (all vectors) | 1 | 6 | 12 |
| $\sum w\,c_x^2$: vectors with $c_x\ne0$ | 0 | 2 $(\pm1,0,0)$ | 8 (4 with $c_y\ne0$, 4 with $c_z\ne0$) |
| $\sum w\,c_x^4$: the same vectors, since $c_x^4=1$ | 0 | 2 | 8 |
| $\sum w\,c_x^2c_y^2$: vectors with $c_x\ne0$ and $c_y\ne0$ | 0 | 0 | 4 $(\pm1,\pm1,0)$ |

The identities then read, with $c_s^2$ also unknown:

$$
\begin{aligned}
\text{(a)}\quad & w_0 + 6w_1 + 12w_2 = 1, \\
\text{(b)}\quad & 2w_1 + 8w_2 = c_s^2 \qquad (\text{the } xx \text{ component of the second-moment identity}), \\
\text{(c)}\quad & 2w_1 + 8w_2 = 3c_s^4 \qquad (xxxx: \ \delta_{xx}\delta_{xx}+\delta_{xx}\delta_{xx}+\delta_{xx}\delta_{xx}=3), \\
\text{(d)}\quad & 4w_2 = c_s^4 \qquad (xxyy: \ \delta_{xx}\delta_{yy}+0+0=1).
\end{aligned}
$$

Four equations, four unknowns. Solve in order.

1. Left sides of (b) and (c) are identical, so $c_s^2 = 3c_s^4$. Dividing by $c_s^2\ne0$ gives
   $$c_s^2 = \tfrac13 .$$
2. Equation (d): $w_2 = c_s^4/4 = \tfrac19\cdot\tfrac14 = \tfrac1{36}$.
3. Equation (b): $2w_1 = \tfrac13 - 8\cdot\tfrac1{36} = \tfrac{12}{36}-\tfrac{8}{36} = \tfrac4{36}$, so $w_1 = \tfrac1{18}$.
4. Equation (a): $w_0 = 1 - \tfrac6{18} - \tfrac{12}{36} = 1-\tfrac13-\tfrac13 = \tfrac13$.

These are the weights in the table. As a check on the symmetry argument, the other components follow without new
equations: $\sum w\,c_x^2c_z^2$ counts the four vectors $(\pm1,0,\pm1)$, so it is $4w_2=\tfrac19=c_s^4$ again, and $\sum w\,c_xc_y=0$.

**Reading.** The sound speed $c_s^2 = 1/3$ (in lattice units, $c_s = c/\sqrt3$) is not a modelling choice. It is a
consequence of the geometry: only with this value can the 19 vectors (rest, face, edge) mimic a Gaussian to fourth
order. It is smaller than the lattice speed $c$ by a factor $\sqrt3$. A sound wave is the fastest *hydrodynamic* signal in the
model, and it travels through the lattice at $c_s$, less than one lattice spacing per time step. This is the origin of
the Mach-number limits in §5.9 and §7.

One limitation is worth recording. The sixth-order sum $\sum w\,c_x^2c_y^2c_z^2$ is $0$ because D3Q19 has no vector
with three non-zero components, whereas a Gaussian gives $c_s^6 = 1/27$. So D3Q19 is isotropic only up to fourth
order. The derivation in §4 and §5 needs nothing beyond that. The same limit also means that the cubic ($u^3$) term of the
Maxwellian's third moment cannot be represented: its $xxx$ component needs the sum
$\sum_q w_q c_x^3\,(c_x^3 - 3c_s^2c_x)$, which is $0$ on the lattice and $6c_s^6 = 2/9$ for the Gaussian (§5.9).

*Checked by computer* (script `/tmp/claude-0/theory_lbm_check/c1.py`, numpy on the code's own `C` and `W` arrays): the identities
(a) to (d), all components of the second-, third- and fourth-order sums, and the two sixth-order numbers above hold to $10^{-16}$.

## 3. The lattice Boltzmann equation

### 3.1 Stream and collide

Let $f_q(\mathbf x,t)$ be the population of velocity $\mathbf c_q$ at node $\mathbf x$ and time $t$. The macroscopic
fields are the lattice versions of the moments of §1.3:

$$\rho = \sum_q f_q, \qquad \rho u_i = \sum_q c_{qi}\,f_q .$$

One time step has two parts.

1. **Collision (local).** At each node, the populations relax towards an equilibrium $f_q^{eq}$ that depends only on
   the local $\rho$ and $\mathbf u$. With the BGK ("single relaxation time") operator of Bhatnagar, Gross and Krook:
   $$f_q^\star(\mathbf x,t) = f_q(\mathbf x,t) - \frac1\tau\left[f_q(\mathbf x,t) - f_q^{eq}(\rho,\mathbf u)\right].$$
   The star marks the **post-collision** population. $\tau$ is a dimensionless relaxation time.
2. **Streaming (shift).** Each post-collision population moves to the neighbour in its own direction:
   $$f_q(\mathbf x + \mathbf c_q,\; t+1) = f_q^\star(\mathbf x,t).$$

Together:

$$f_q(\mathbf x + \mathbf c_q\Delta t,\; t+\Delta t) - f_q(\mathbf x,t) = -\frac1\tau\left[f_q(\mathbf x,t) - f_q^{eq}(\rho,\mathbf u)\right]. \tag{LBE}$$

The left side is the discrete version of "accumulation + convection" in the Boltzmann equation. The population
moves along the *characteristic* $\mathbf x + \mathbf c_q t$ and arrives exactly at a node, because every $\mathbf c_q\Delta t$
is a lattice vector. There is therefore **no interpolation and no numerical diffusion from the advection step**.
The shift is exact. This is why the lattice is built from integer vectors. The edge vectors have length
$\sqrt2\,h$ and take the same time $\Delta t$ as the face vectors, so they move faster by a factor $\sqrt2$.

Geometrically, the update is a two-phase dance on the grid. First every node lets its 19 populations
"collide" (no neighbour is needed). Then each population is passed to its neighbour. No pressure Poisson equation
and no global communication appear anywhere.

### 3.2 BGK as first-order kinetics

Rewrite the collision step as $f_q^\star = (1-\tfrac1\tau)f_q + \tfrac1\tau f_q^{eq}$. Define the
**non-equilibrium part** $f_q^{neq} = f_q - f_q^{eq}$. Then

$$f_q^\star - f_q^{eq} = \left(1-\frac1\tau\right) f_q^{neq}.$$

This is a first-order relaxation, as for a species whose concentration approaches its equilibrium value
by $dC/dt = -k(C-C_{eq})$. In one step, the fraction $1/\tau$ of the departure from equilibrium is removed.
The mapping between $\tau$ and the behaviour:

| $\tau$ | factor $1-1/\tau$ | what happens in one collision |
|---|---|---|
| $1$ | $0$ | $f^\star = f^{eq}$: relaxed completely in one step |
| $>1$ | $0 < \cdot < 1$ | under-relaxation: part of the departure survives |
| $\tfrac12<\tau<1$ | $-1<\cdot<0$ | over-relaxation: the departure flips sign and shrinks |
| $\tfrac12$ | $-1$ | $f^\star = 2f^{eq}-f$: the departure is mirrored, not damped |
| $<\tfrac12$ | $<-1$ | the departure grows at every collision: unstable (and the viscosity of §5 would be negative) |

The mass and momentum are the "elements" of the analogy. Each collision must conserve them,
$\sum_q f^\star_q = \sum_q f_q$ and $\sum_q c_{qi}f_q^\star = \sum_q c_{qi}f_q$. That is true if and only if
$\sum_q f_q^{neq}=0$ and $\sum_q c_{qi}f_q^{neq}=0$. This holds whenever the equilibrium has the same $\rho$ and
$\rho\mathbf u$ as $f$ itself (checked in §4). The equilibrium composition is determined by the conserved
quantities, just as a chemical equilibrium is determined by the elemental balances (and temperature).

The "relaxation time" $\tau$ will turn out to set the viscosity (§5.7). In chemical-engineering language:
**the viscosity is proportional to the relaxation time, that is, to the inverse of the rate constant $1/\tau$ of the approach to local
equilibrium** (less a half step, §5.8). A fluid that equilibrates slowly keeps
its momentum distribution anisotropic for longer, and it transports momentum between layers more effectively.

## 4. The equilibrium distribution

### 4.1 Maxwell–Boltzmann and its moments

In a gas in local equilibrium that moves at velocity $\mathbf u$, with ideal-gas variance $c_s^2$ per velocity
component, the velocity distribution is Gaussian (Maxwell–Boltzmann):

$$f^{MB}(\boldsymbol\xi) = \rho\,g(\boldsymbol\xi-\mathbf u), \qquad
g(\boldsymbol\zeta) = \frac{1}{(2\pi c_s^2)^{3/2}}\exp\!\left(-\frac{\zeta_k\zeta_k}{2c_s^2}\right).$$

Here $\boldsymbol\xi$ is the continuous molecular velocity and $\boldsymbol\zeta = \boldsymbol\xi-\mathbf u$ is the random
part. Its moments follow from $\int g\,d^3\zeta = 1$, $\int\zeta_ig\,d^3\zeta=0$, $\int\zeta_i\zeta_jg\,d^3\zeta = c_s^2\delta_{ij}$.
Substituting $\xi_i=u_i+\zeta_i$:

$$
\begin{aligned}
\int f^{MB}d^3\xi &= \rho, \\
\int \xi_i f^{MB}d^3\xi &= \rho u_i + \rho\!\int\zeta_ig\,d^3\zeta = \rho u_i, \\
\int \xi_i\xi_j f^{MB}d^3\xi &= \rho\!\int(u_i+\zeta_i)(u_j+\zeta_j)\,g\,d^3\zeta = \rho\,(u_iu_j + c_s^2\delta_{ij}),
\end{aligned}
$$

since the cross terms $u_i\!\int\zeta_jg$ vanish. The last line is the momentum flux of §1.3. It contains the
convective part $\rho u_iu_j$ and an isotropic part $\rho c_s^2\delta_{ij}$, which is a pressure
$p=\rho c_s^2$ and has no shear stress. This is the Euler (inviscid) closure. An equilibrium gas has no viscosity;
viscosity belongs to the *departure* from equilibrium.

### 4.2 Expansion to second order in $u$

Write the exponent: $-\tfrac{(\xi_k-u_k)(\xi_k-u_k)}{2c_s^2} = -\tfrac{\xi_k\xi_k}{2c_s^2} + \tfrac{\xi_ku_k}{c_s^2} - \tfrac{u_ku_k}{2c_s^2}$. So

$$f^{MB} = \rho\,g(\boldsymbol\xi)\,\exp\!\left(z\right), \qquad z = \frac{\xi_ku_k}{c_s^2} - \frac{u_ku_k}{2c_s^2}.$$

The flow is slow compared with the thermal speed, $|u|\ll c_s$, so $z$ is small and we expand $e^z = 1 + z + z^2/2+\dots$.
Keep terms up to $u^2$. The square contributes $z^2 = (\xi_ku_k)^2/c_s^4 + O(u^3)$. Hence

$$f^{MB} \approx \rho\,g(\boldsymbol\xi)\left[1 + \frac{\xi_ku_k}{c_s^2} + \frac{(\xi_ku_k)^2}{2c_s^4} - \frac{u_ku_k}{2c_s^2}\right] + O(u^3).$$

The bracket is a polynomial of degree two in $\boldsymbol\xi$, multiplied by the Gaussian $g$. It is the Taylor (equivalently, Hermite)
expansion of the Maxwellian to second order. Hermite polynomials are the orthogonal polynomials for a Gaussian weight:
the bracket equals $1 + \xi_ku_k/c_s^2 + (\xi_i\xi_j - c_s^2\delta_{ij})u_iu_j/(2c_s^4)$, i.e. Hermite polynomials of order 0, 1 and 2 multiplied by $1$, $u_k/c_s^2$ and $u_iu_j/(2c_s^4)$.

Now replace the continuous velocity by the lattice. The Gaussian weight $g(\boldsymbol\xi)$ is replaced by the
lattice weights $w_q$ and $\boldsymbol\xi$ by $\mathbf c_q$. Section 2.2 showed that
$\sum_q w_qP(\mathbf c_q) = \int gP\,d^3\xi$ for all polynomials $P$ up to degree 5 (even degrees by the identities of
§2.2, odd degrees because both sides vanish). So

$$\boxed{\,f_q^{eq} = w_q\,\rho\left[1 + \frac{c_{qk}u_k}{c_s^2} + \frac{(c_{qk}u_k)^2}{2c_s^4} - \frac{u_ku_k}{2c_s^2}\right]\,},
\qquad c_s^2=\tfrac13 .$$

In lattice units with $c_s^2=1/3$: $f_q^{eq} = w_q\rho\,[\,1 + 3\,\mathbf c_q\!\cdot\!\mathbf u + \tfrac92(\mathbf c_q\!\cdot\!\mathbf u)^2 - \tfrac32\,\mathbf u\!\cdot\!\mathbf u\,]$.

**Reading.** At $\mathbf u=0$ the bracket is $1$: the mass is shared among the links in proportion to the
weights. A velocity $\mathbf u$ *tilts* the share. The linear term adds mass to links pointing along $\mathbf u$
($\mathbf c_q\cdot\mathbf u>0$) and removes it from the opposite links. This tilt is what carries momentum.
The quadratic terms are corrections of order $u^2$ that give the right momentum flux, as the next section shows.
Because the expansion is only valid for small $u/c_s$, **the lattice velocity must be small compared with $c_s$**. This is
the origin of the low-Mach-number restriction (§5.9).

### 4.3 Checking the moments by explicit summation

The equilibrium must reproduce $\rho$, $\rho\mathbf u$ and the Euler momentum flux. We verify it using only the
identities of §2.2. Write $a_q = c_{qk}u_k$ for brevity, and use $\sum_q w_q a_q = 0$, $\sum_q w_qa_q^2 =
u_ku_lc_s^2\delta_{kl} = c_s^2u_ku_k$.

*Zeroth moment (density).*

$$\sum_q f_q^{eq} = \rho\left[\sum_qw_q + \frac1{c_s^2}\sum_qw_qa_q + \frac1{2c_s^4}\sum_qw_qa_q^2 - \frac{u_ku_k}{2c_s^2}\sum_qw_q\right]
= \rho\left[1 + 0 + \frac{c_s^2u_ku_k}{2c_s^4} - \frac{u_ku_k}{2c_s^2}\right] = \rho .$$

*First moment (momentum).* The quadratic term gives $\sum_qw_qc_{qi}a_q^2$ (third moment times $u_ku_l$), which
vanishes; so does $\sum_q w_qc_{qi}$:

$$\sum_q c_{qi}f_q^{eq} = \rho\left[\sum_qw_qc_{qi} + \frac1{c_s^2}\sum_qw_qc_{qi}c_{qk}u_k + \dots\right]
= \rho\left[0 + \frac{c_s^2\delta_{ik}u_k}{c_s^2} + 0 - 0\right] = \rho u_i .$$

*Second moment (momentum flux).* The terms with a single or triple power of $\mathbf c$ vanish. What remains:

$$
\begin{aligned}
\sum_q c_{qi}c_{qj}f_q^{eq} &= \rho\left[\sum_qw_qc_{qi}c_{qj} + \frac{1}{2c_s^4}\sum_qw_qc_{qi}c_{qj}c_{qk}c_{ql}\,u_ku_l - \frac{u_ku_k}{2c_s^2}\sum_qw_qc_{qi}c_{qj}\right]\\
&= \rho\left[c_s^2\delta_{ij} + \frac{c_s^4(\delta_{ij}\delta_{kl}+\delta_{ik}\delta_{jl}+\delta_{il}\delta_{jk})u_ku_l}{2c_s^4} - \frac{u_ku_k}{2c_s^2}\,c_s^2\delta_{ij}\right]\\
&= \rho\left[c_s^2\delta_{ij} + \tfrac12\left(\delta_{ij}u_ku_k + 2u_iu_j\right) - \tfrac12\delta_{ij}u_ku_k\right]\\
&= \rho\,(u_iu_j + c_s^2\delta_{ij}).
\end{aligned}
$$

In the third line, $\delta_{ij}\delta_{kl}u_ku_l = \delta_{ij}u_ku_k$ and $\delta_{ik}\delta_{jl}u_ku_l=u_iu_j$ (and the same for the
third pairing), by the substitution rule $a_i\delta_{ij}=a_j$.

All three match the Maxwellian's moments of §4.1. The ones that matter later are these:

$$\Pi^{(0)}_{ij} \equiv \sum_qc_{qi}c_{qj}f^{eq}_q = \rho u_iu_j + \rho c_s^2\delta_{ij}, \qquad
\sum_q f_q^{eq}=\rho, \quad \sum_qc_{qi}f_q^{eq}=\rho u_i .$$

**Third moment (needed in §5).** In $\sum_q c_{qi}c_{qj}c_{qk}f_q^{eq}$, only the linear term survives, because the
constant and quadratic terms give odd sums (3 or 5 powers of $\mathbf c$):

$$Q^{(0)}_{ijk} \equiv \sum_qc_{qi}c_{qj}c_{qk}f_q^{eq} = \frac{\rho}{c_s^2}\sum_qw_qc_{qi}c_{qj}c_{qk}c_{ql}u_l
= \rho c_s^2\left(\delta_{ij}u_k + \delta_{ik}u_j + \delta_{jk}u_i\right).$$

**Reading.** With $\rho=\sum f$ and $\rho\mathbf u=\sum\mathbf cf$ the collision conserves mass and momentum
(§3.2). The second moment is the Euler momentum flux with pressure $p=\rho c_s^2$. The third moment lacks a term
$\rho u_iu_ju_k$ that the true Maxwellian has (it is cubic in $u$; the lattice and the truncated expansion cannot
represent it). That missing term is the source of the $O(Ma^3)$ error found in §5.9.

## 5. Chapman–Enskog: from the lattice equation to Navier–Stokes

Section 4 gave the equilibrium. Now we show what macroscopic equations the LBE (LBE) implies for $\rho$ and $\mathbf u$.
The technique is the Chapman–Enskog expansion (Chapman & Cowling 1970), in the form used in Krüger et al. (2017).
The idea has two parts: (i) the lattice step is small compared with the scales of the flow, so the lattice
equation can be expanded in a Taylor series; (ii) the flow variables change on two time scales (a fast
convective/acoustic one and a slow diffusive one), which we treat as independent.

### 5.1 Taylor expansion of the lattice equation

Write the streaming operator as $D_q = \partial_t + c_{qi}\partial_i$ (the derivative along the characteristic of
velocity $\mathbf c_q$). For a smooth $f$, a Taylor expansion in $\Delta t$ gives

$$f_q(\mathbf x+\mathbf c_q\Delta t,\,t+\Delta t) = f_q + \Delta t\,D_qf_q + \frac{\Delta t^2}{2}D_q^2f_q + O(\Delta t^3),$$

because moving by $\Delta t$ along the characteristic changes $f$ by $\Delta t\,D_q f + \tfrac12\Delta t^2D_q^2f+\dots$. The
$x$-derivative terms come out of $(\partial_t + c_{qi}\partial_i)^2$ with the second derivatives and cross terms
included automatically. Substituting in (LBE) and dividing by $\Delta t$:

$$D_qf_q + \frac{\Delta t}{2}D_q^2f_q + O(\Delta t^2) = -\frac1{\tau\Delta t}\left(f_q - f^{eq}_q\right). \tag{5.1}$$

Keeping the second-order term $\tfrac{\Delta t}{2}D_q^2f_q$ is essential. It is what produces the "$-\tfrac12$" in
the viscosity formula of §5.8.

In this section the velocities are $\mathbf c_q = (h/\Delta t)\,\mathbf e_q$, and $\Delta t$ is kept explicit so that you can
follow where it enters. The identities of §2 hold with $c_s^2 = (h/\Delta t)^2/3$.

### 5.2 Multiscale expansion

Now introduce a small bookkeeping parameter $\varepsilon$. It stands for the ratio of the lattice step to the length
scale of the flow; derivative terms carry powers of it. Expand the populations around the equilibrium,

$$f_q = f_q^{(0)} + \varepsilon f_q^{(1)} + \varepsilon^2f_q^{(2)} + \dots, \qquad f_q^{(0)} = f_q^{eq},$$

and split the derivatives:

$$\partial_t = \varepsilon\,\partial_{t_1} + \varepsilon^2\partial_{t_2}, \qquad \partial_i = \varepsilon\,\partial_{1i}.$$

The two times are the two time scales. $t_1$ is the fast one (convection and sound across the flow scale,
$\sim L/c$, with $c$ the lattice speed). $t_2$ is the slow one (diffusion across the flow scale, $\sim L^2/\nu$). There
is a single space scale, $x_1$. This is how a hyperbolic (wave-like) first-order process and a diffusive
second-order process can coexist in a single equation. At the end, $\varepsilon$ is set to $1$ and the contributions are added.

Also required: $\rho = \sum_qf_q$ and $\rho\mathbf u = \sum_qc_{qi}f_q$ are *defined* to be exactly the moments of the
total $f$. The equilibrium $f^{eq}$ already has these moments (§4.3). So the corrections must carry none:

$$\sum_qf_q^{(n)} = 0, \qquad \sum_qc_{qi}f_q^{(n)} = 0 \qquad (n\ge1). \tag{5.2}$$

These are the **solvability conditions**. They say that the non-equilibrium parts redistribute mass and momentum among the
velocity classes without changing the totals, consistent with collisions that conserve both.

The operator $D_q$ becomes $D_q = \varepsilon D_{1q} + \varepsilon^2\partial_{t_2}$ with $D_{1q} \equiv \partial_{t_1} + c_{qi}\partial_{1i}$.
To the order needed, $D_q^2 = \varepsilon^2D_{1q}^2 + O(\varepsilon^3)$.

### 5.3 The equations order by order

Insert the expansions into (5.1). The left side is

$$D_qf_q = \varepsilon D_{1q}f^{(0)} + \varepsilon^2\left(D_{1q}f^{(1)} + \partial_{t_2}f^{(0)}\right) + O(\varepsilon^3), \qquad
\tfrac{\Delta t}2D_q^2f_q = \tfrac{\Delta t}2\varepsilon^2D_{1q}^2f^{(0)} + O(\varepsilon^3),$$

and the right side is $-\tfrac{1}{\tau\Delta t}(\varepsilon f^{(1)} + \varepsilon^2f^{(2)}+\dots)$, because $f-f^{eq} = \varepsilon f^{(1)}+\varepsilon^2f^{(2)}+\dots$.
Collect equal powers of $\varepsilon$ (the index $q$ is dropped where unambiguous):

$$
\begin{aligned}
O(\varepsilon^0):\quad & 0 = 0,\\
O(\varepsilon^1):\quad & D_{1}f^{(0)} = -\frac1{\tau\Delta t}\,f^{(1)}, && \text{(A)}\\
O(\varepsilon^2):\quad & D_{1}f^{(1)} + \partial_{t_2}f^{(0)} + \frac{\Delta t}{2}D_{1}^2f^{(0)} = -\frac1{\tau\Delta t}\,f^{(2)}. && \text{(B)}
\end{aligned}
$$

Equation (A) says that the first correction to the equilibrium is *proportional to the rate of change of the equilibrium
along the characteristic*. If the equilibrium varied nowhere, $f^{(1)}$ would vanish. This is the mathematical form of
"departures from equilibrium are driven by gradients".

Now simplify (B). Apply $D_1$ to (A): $D_1^2f^{(0)} = -\tfrac1{\tau\Delta t}D_1f^{(1)}$. Substitute for the last term on the left of (B):
$\tfrac{\Delta t}2D_1^2f^{(0)} = -\tfrac1{2\tau}D_1f^{(1)}$. Then

$$\left(1-\frac1{2\tau}\right)D_1f^{(1)} + \partial_{t_2}f^{(0)} = -\frac1{\tau\Delta t}\,f^{(2)}. \tag{B'}$$

The factor $1-\tfrac1{2\tau}$ is the origin of the "$-\tfrac12$" in the viscosity, as shown in §5.8. It came from the Taylor
term $\tfrac{\Delta t}{2}D^2f$, that is, from the fact that streaming moves populations by a full step while the collision is
evaluated only at the beginning of it.

### 5.4 Euler level: moments of (A)

Take the sums $\sum_q$ and $\sum_q c_{qi}$ of (A). Use (5.2) for $f^{(1)}$, and $D_1=\partial_{t_1}+c_{qk}\partial_{1k}$:

$$
\begin{aligned}
\sum_q(\text{A}): \quad & \partial_{t_1}\rho + \partial_{1k}(\rho u_k) = 0,\\
\sum_qc_{qi}(\text{A}): \quad & \partial_{t_1}(\rho u_i) + \partial_{1k}\Pi^{(0)}_{ik} = 0,
\end{aligned}
$$

where we used $\sum_qf^{(0)}=\rho$, $\sum_qc_{qk}f^{(0)}=\rho u_k$, $\sum_qc_{qi}c_{qk}f^{(0)}=\Pi^{(0)}_{ik}$ and the right
sides vanish because $\sum_q f^{(1)} = \sum_qc_{qi}f^{(1)}=0$. With the second moment from §4.3, the second equation is

$$\partial_{t_1}(\rho u_i) + \partial_{1k}(\rho u_iu_k) = -\partial_{1i}\,p, \qquad p = \rho c_s^2 . \tag{Euler}$$

**Reading.** At the leading order in the small parameter the lattice fluid obeys the **Euler equations** (continuity
and inviscid momentum balance). The pressure is $p=\rho c_s^2$, the ideal-gas law at fixed temperature. There is no
viscosity yet, since viscosity arises at the next order. The Euler equations contain sound waves: linearise about
$\rho_0,\ \mathbf u=0$ to get $\partial_{t}^2\delta\rho = c_s^2\nabla^2\delta\rho$, a wave equation with speed $c_s$.
So the lattice fluid is a **weakly compressible** fluid, and the size of the compressibility is set by the Mach number (§5.9).

### 5.5 The non-equilibrium stress

The next order needs the momentum flux of the first correction,

$$\Pi^{(1)}_{ij} \equiv \sum_qc_{qi}c_{qj}f_q^{(1)} .$$

Use (A), $f^{(1)} = -\tau\Delta t\,D_1f^{(0)}$, and write $D_1=\partial_{t_1}+c_{qk}\partial_{1k}$:

$$\Pi^{(1)}_{ij} = -\tau\Delta t\left[\partial_{t_1}\Pi^{(0)}_{ij} + \partial_{1k}Q^{(0)}_{ijk}\right],$$

where the first term uses $\sum_qc_{qi}c_{qj}f^{(0)}=\Pi^{(0)}_{ij}$ and the second term uses $\sum_qc_{qi}c_{qj}c_{qk}f^{(0)}=Q^{(0)}_{ijk}$.
We now evaluate each term. The first, $\partial_{t_1}\Pi^{(0)}_{ij} = \partial_{t_1}(\rho u_iu_j) + c_s^2\delta_{ij}\partial_{t_1}\rho$,
needs the time derivative of the product $\rho u_iu_j$. Expand with the product rule: 

$$\partial_{t_1}(\rho u_iu_j) = u_j\,\partial_{t_1}(\rho u_i) + u_i\,\partial_{t_1}(\rho u_j) - u_iu_j\,\partial_{t_1}\rho .$$

(Check: the right side equals $u_j(u_i\partial\rho + \rho\,\partial u_i) + u_i(u_j\partial\rho+\rho\,\partial u_j) - u_iu_j\partial\rho
= u_iu_j\partial\rho + \rho u_j\partial u_i + \rho u_i\partial u_j$, which is the product rule for $\rho u_iu_j$.) Now insert the
Euler equations (§5.4) for the three $t_1$-derivatives:

$$\partial_{t_1}\rho = -\partial_k(\rho u_k), \qquad \partial_{t_1}(\rho u_i) = -\partial_k(\rho u_iu_k) - c_s^2\partial_i\rho.$$

(The subscript 1 on $\partial$ is dropped from here on.) The result is

$$\partial_{t_1}(\rho u_iu_j) = -u_j\partial_k(\rho u_iu_k) - u_i\partial_k(\rho u_ju_k) - c_s^2\left(u_j\partial_i\rho + u_i\partial_j\rho\right) + u_iu_j\partial_k(\rho u_k) .$$

The three terms with $\partial_k(\rho\,u\,u\,u)$ combine. Expanding each with the product rule,

$$u_j\partial_k(\rho u_iu_k) = u_iu_j\partial_k(\rho u_k) + \rho u_ju_k\partial_ku_i, \qquad u_i\partial_k(\rho u_ju_k) = u_iu_j\partial_k(\rho u_k) + \rho u_iu_k\partial_ku_j,$$

so that their combination with $+u_iu_j\partial_k(\rho u_k)$ is $-u_iu_j\partial_k(\rho u_k) - \rho u_ju_k\partial_ku_i - \rho u_iu_k\partial_ku_j$.
This is $-\partial_k(\rho u_iu_ju_k)$ by the product rule for $\rho u_iu_ju_k$, so

$$\partial_{t_1}\Pi^{(0)}_{ij} = -\partial_k(\rho u_iu_ju_k) - c_s^2(u_j\partial_i\rho + u_i\partial_j\rho) - c_s^2\delta_{ij}\partial_k(\rho u_k),$$

where the last term is $c_s^2\delta_{ij}\partial_{t_1}\rho$. The second term is, from §4.3,

$$\partial_kQ^{(0)}_{ijk} = c_s^2\left[\delta_{ij}\partial_k(\rho u_k) + \partial_i(\rho u_j) + \partial_j(\rho u_i)\right].$$

Add the two. The $\delta_{ij}\partial_k(\rho u_k)$ terms cancel exactly. Also $\partial_i(\rho u_j) - u_j\partial_i\rho = \rho\,\partial_iu_j$ and
$\partial_j(\rho u_i) - u_i\partial_j\rho = \rho\,\partial_ju_i$. Therefore

$$\partial_{t_1}\Pi^{(0)}_{ij} + \partial_kQ^{(0)}_{ijk} = c_s^2\rho\,(\partial_iu_j+\partial_ju_i) - \partial_k(\rho u_iu_ju_k),$$

$$\boxed{\;\Pi^{(1)}_{ij} = -\tau\Delta t\left[c_s^2\rho\,(\partial_iu_j + \partial_ju_i) - \partial_k(\rho u_iu_ju_k)\right]\;} \tag{5.5}$$

**Reading.** The momentum flux of the first correction is proportional to the **rate-of-strain tensor**
$S_{ij}=\tfrac12(\partial_iu_j+\partial_ju_i)$, with a coefficient $-2\tau\Delta t\,c_s^2\rho$. This is exactly the structure
of a Newtonian stress, $\tau_{ij} = -\mu(\partial_iu_j+\partial_ju_i)$ in the BSL convention. It was not put in by hand: it
appeared because the non-equilibrium population is driven by the gradient of the equilibrium (A), and the
lattice isotropy (the third-moment formula) converts it into a symmetric tensor. The last term is cubic in the velocity. It
is the price of the truncated equilibrium (§4.3: the lattice third moment lacks $\rho u_iu_ju_k$), and it will be discussed in §5.9.

### 5.6 Navier–Stokes level: moments of (B$'$)

Take $\sum_q$ and $\sum_qc_{qi}$ of (B$'$). By (5.2), $\sum_qf^{(2)}=\sum_qc_{qi}f^{(2)}=0$, so the right sides vanish.
The moments of $D_1f^{(1)}$ are

$$\sum_qD_1f^{(1)} = \partial_{t_1}\sum_qf^{(1)} + \partial_k\sum_qc_{qk}f^{(1)} = 0, \qquad
\sum_qc_{qi}D_1f^{(1)} = \partial_{t_1}\sum_qc_{qi}f^{(1)} + \partial_k\sum_qc_{qi}c_{qk}f^{(1)} = \partial_k\Pi^{(1)}_{ik},$$

again by (5.2). Therefore

$$\partial_{t_2}\rho = 0, \qquad \partial_{t_2}(\rho u_i) = -\left(1-\frac1{2\tau}\right)\partial_k\Pi^{(1)}_{ik}.$$

Insert (5.5), dropping the cubic term for the moment:

$$\partial_{t_2}(\rho u_i) = \left(1-\frac1{2\tau}\right)\tau\Delta t\,c_s^2\;\partial_k\!\left[\rho\,(\partial_iu_k+\partial_ku_i)\right]
= c_s^2\left(\tau-\tfrac12\right)\Delta t\;\partial_k\!\left[\rho\,(\partial_iu_k+\partial_ku_i)\right].$$

### 5.7 Assembling the equations and reading off the viscosity

Recombine the two scales, $\partial_t=\varepsilon\partial_{t_1}+\varepsilon^2\partial_{t_2}$, and set $\varepsilon=1$. Add the $t_1$
equations (Euler, §5.4) and the $t_2$ equations (§5.6):

$$
\begin{aligned}
&\partial_t\rho + \partial_k(\rho u_k) = 0,\\
&\partial_t(\rho u_i) + \partial_k(\rho u_iu_k) = -\partial_ip + \partial_k\!\left[\rho\nu\,(\partial_iu_k + \partial_ku_i)\right],
\end{aligned}
\qquad
\boxed{\;p=\rho c_s^2,\qquad \nu = c_s^2\left(\tau-\tfrac12\right)\Delta t\;}
$$

**Reading.** This is the compressible Navier–Stokes momentum equation of §1.1 with kinematic viscosity
$\nu = c_s^2(\tau-\tfrac12)\Delta t$. In lattice units ($c_s^2 = 1/3$, $\Delta t=1$)

$$\nu_{lb} = \frac{\tau-\tfrac12}{3}, \qquad \tau = 3\nu_{lb}+\tfrac12 .$$

Each of these statements is worth reading physically.

- $\nu>0$ requires $\tau>\tfrac12$, consistent with the table of §3.2: a relaxation that is not strong enough to
  damp the departure from equilibrium would give negative viscosity and unstable growth.
- $\nu = c_s^2\times(\text{effective relaxation time})$ with the effective time $(\tau-\tfrac12)\Delta t$: the units
  work out as (velocity)$^2\times$(time) $=$ length$^2$/time. This is the dimensional reading only; the page does not derive a mean free path.
- The stress has no separate term proportional to $\delta_{ik}\partial_ju_j$ (compare BSL's
  $\boldsymbol\tau = -\mu[\nabla\mathbf v+(\nabla\mathbf v)^\dagger] + (\tfrac23\mu-\kappa)(\nabla\cdot\mathbf v)\boldsymbol\delta$).
  The trace of BSL's $\boldsymbol\tau$ is $-2\mu\nabla\cdot\mathbf v + 3(\tfrac23\mu-\kappa)\nabla\cdot\mathbf v = -3\kappa\,\nabla\cdot\mathbf v$, and the trace of
  our viscous momentum flux, $-\rho\nu(\partial_iu_j+\partial_ju_i)$, is $-2\rho\nu\,\partial_ju_j$. Matching them gives a bulk viscosity $\kappa = \tfrac23\rho\nu$ for BGK. This is fixed by the single
  relaxation time. It does not matter for nearly incompressible flow, because $\nabla\cdot\mathbf u\approx0$. It is relevant to MRT (§6.3), where it can be set separately.
- For constant density, $\partial_k[\nu(\partial_iu_k+\partial_ku_i)] = \nu\nabla^2u_i + \nu\partial_i(\nabla\cdot\mathbf u)$, and with
  $\nabla\cdot\mathbf u\approx0$ this is the usual $\nu\nabla^2\mathbf u$.

### 5.8 Where the "$-\tfrac12$" comes from

Had we kept only the first-order Taylor term in (5.1) (as if the collision acted continuously with relaxation time $\lambda=\tau\Delta t$ in a
continuous kinetic equation), the same algebra, without the factor $1-\tfrac1{2\tau}$ in (B$'$), would give
$\nu = c_s^2\,\tau\Delta t$, i.e. $\nu = c_s^2\lambda$. The lattice scheme gives
$c_s^2(\tau-\tfrac12)\Delta t$. The difference is the term $\tfrac{\Delta t}{2}D^2f$: *a property of the lattice
and of explicit time stepping, not of physics*. There is a clear way to see it.

The momentum flux that streaming transports is carried by the populations *after* the collision, $f^\star$. They contain
the fraction $1-\tfrac1\tau$ of the non-equilibrium part. The populations *before* the collision contain all of it
(fraction $1$). A heuristic way to see the factor (it is an illustration, not a second derivation; the derivation is §5.3) is that the stress the fluid effectively feels is the **time average** over the step, the mean of the two:

$$\tfrac12\left[1 + \left(1-\tfrac1\tau\right)\right] = 1-\frac1{2\tau}.$$

This is precisely the factor in (B$'$). Multiply "relaxation time" $\tau\Delta t$ by "fraction of the non-equilibrium
stress that is transported", $1-\tfrac1{2\tau}$, and the result is $(\tau-\tfrac12)\Delta t$. The
mechanism is the same as the trapezoidal rule: using the mean of the beginning-of-step and end-of-step values
is the second-order accurate choice. At $\tau=\tfrac12$ the factor $\tfrac12[1 + (1-2)] = 0$: the
pre-collision and post-collision departures cancel on average, and no stress is transported.

**An exact check by hand (shear flow).** The Chapman–Enskog result can be confirmed without any expansion, for a steady
linear shear flow $u_x(y)=u'y$ with uniform density $\rho=1$, low velocity, and populations that depend only on $y$.
Write $f_q = f_q^{eq} + g_q$ with the equilibrium linearised in $u$, $f^{eq}_q = w_q(1+c_{qx}u/c_s^2)$.
Streaming moves a population by $c_{qy}$ in $y$, and for a steady state the LBE reads
$f_q(y+c_{qy}) = f^{eq}_q(y) + (1-\tfrac1\tau)g_q$. Insert $f_q(y+c_{qy}) = f_q^{eq}(y) + w_qc_{qx}c_{qy}u'/c_s^2 + g_q$ and solve
for $g_q$:

$$g_q = -\tau\,w_q\,\frac{c_{qx}c_{qy}\,u'}{c_s^2},$$

independent of $y$. So this $g_q$ with a linear $u(y)$ is an *exact* steady solution of the lattice equation in the bulk, for every $\tau$.
Now compute the flux of $x$-momentum upward across the plane halfway between two adjacent nodes: sum of $c_{qx}f_q^\star$ over
the populations with $c_{qy}=+1$ at the lower node, minus the same sum for $c_{qy}=-1$ at the upper node. Only the four edge vectors
$(\pm1,\pm1,0)$ have $c_x\ne0$ and $c_y\ne0$, and $\sum_{c_y=+1}w_qc_{qx}^2 = 2/36=1/18$ (same for $c_y=-1$). The equilibrium part gives
$(u_{lower}-u_{upper})\,\tfrac{1}{18c_s^2} = -\tfrac{u'}6$. The non-equilibrium part, with the factor $1-\tfrac1\tau$ of
$f^\star$, gives $(1-\tfrac1\tau)(-\tau u')\cdot\tfrac13 = -\tfrac{(\tau-1)u'}{3}$. The total flux is

$$-\frac{u'}{6} - \frac{(\tau-1)u'}{3} = -\frac{\tau-\tfrac12}{3}\,u' = -\nu_{lb}\,u',$$

exactly Newton's law of viscosity with $\nu_{lb}=(\tau-\tfrac12)/3$. This is a second, independent derivation of the same
result, and it makes the "$-\tfrac12$" visible as the $\tfrac16$ from the equilibrium part. It is also the solution we
use in §8 to check the wall boundary conditions.

*Numerical confirmation of $\nu$ and of the bulk viscosity.* Both checks use the page's own `collide`/`stream` functions on a periodic
$64\times64$ box ($N_z=1$, no body; script `c2.py`). (i) A shear wave $u_x=10^{-3}\sin(ky)$, $k=2\pi/64$: the fitted decay rate divided
by $k^2$ gives $0.03336$ (BGK), $0.03335$ (regularised), $0.03336$ (MRT) at $\tau=0.6$ against the formula $(\tau-\tfrac12)/3 = 0.03333$, and
$0.13337$, $0.13334$, $0.13348$ at $\tau=0.9$ against $0.13333$. (ii) A density wave $\delta\rho=10^{-4}\cos(kx)$ at $\tau=0.8$: the fitted
oscillation speed is $0.57728$ against $c_s = 0.57735$, and the fitted amplitude damping rate is
$9.641\times10^{-4}$ (BGK and regularised) and $10.073\times10^{-4}$ (MRT with the rates of §6.3). The linear sound-wave damping rate is
$\tfrac{k^2}{2}\left(\tfrac43\nu+\zeta/\rho\right)$, which with $\zeta=\tfrac23\rho\nu$ (BGK, §5.7) gives $9.638\times10^{-4}$ and with
the MRT bulk viscosity of §6.3 gives $10.070\times10^{-4}$. The damping-rate formula was used here only as the independent check; it is not derived on the page.

### 5.9 Error terms, Mach number, and the incompressible limit

The derivation produced two kinds of errors that matter in practice.

**(a) The cubic term.** The term $\partial_k(\rho u_iu_ju_k)$ in (5.5) was dropped. Compare its size with the retained viscous term:
$c_s^2\rho\,\partial u\sim c_s^2\rho\,U/L$ against $\rho U^3/L$. The ratio is $U^2/c_s^2 = Ma^2$, where
$Ma = U/c_s$ is the **lattice Mach number**. So the stress has a relative error of order $Ma^2$. The origin is exact and known: the true
Maxwellian has a third moment $\rho c_s^2(\delta u+\dots) + \rho u_iu_ju_k$, whose last piece would
cancel the term exactly (its divergence $+\partial_k(\rho u_iu_ju_k)$ cancels the one above). The lattice equilibrium of §4 does
not have this piece. In terms of the
page's input, the Mach number of the fastest point of the cylinder is $Ma = u_{lb}/c_s = \sqrt3\,u_{lb}$ (for the default
$u_{lb}=0.05$, $\sqrt3\times0.05 = 0.0866$).

**(b) Compressibility.** The lattice fluid is not incompressible. A steady flow with speed $U$ has pressure variations
$\delta p\sim\rho U^2$ (the Bernoulli estimate), and the equation of state gives $\delta p=c_s^2\delta\rho$, so

$$\frac{\delta\rho}{\rho}\sim\frac{U^2}{c_s^2} = Ma^2, \qquad \nabla\cdot\mathbf u = -\frac1\rho\frac{D\rho}{Dt} = O(Ma^2)\,\frac UL \quad(\text{steady flow}).$$

For $Ma\ll1$ the density is nearly constant and the divergence is small. The continuity and momentum equations then reduce to the
incompressible NS equations with the pressure $p=\rho c_s^2$ (only gradients of it matter, so the constant $\rho_0c_s^2$ drops
out) and the kinematic viscosity $\nu$ above. The remaining velocity-divergence is a *discretisation error of the model*: it
shrinks as $Ma^2$ but does not vanish.

**What this means for the choice of $u_{lb}$.** The page fixes the lattice velocity of the fastest body point, $u_{lb}$ (and thereby
$\Delta t\propto h$, called *acoustic scaling*, §7). Refining the grid at fixed $u_{lb}$ keeps $Ma$ fixed, so the $O(Ma^2)$
errors above are *not* reduced by refinement. Only a smaller $u_{lb}$ reduces them, at the price of more time steps
($\Delta t\propto u_{lb}$). The measured size of these errors for the page's cases is TODO(measured: not yet measured. Missing: $\max|\nabla\cdot\mathbf u|$ and the density variation $\max|\rho-1|$ of the LBM runs of `results_final.md`, and a repeat of one case at smaller `u_lb` to show the $Ma^2$ scaling; the final-run tables contain neither).

**(c) Lattice errors.** The truncation in (5.1) after the second-order term gives, formally, errors of higher order in $\varepsilon\sim h/L$
(this is the expectation from the expansion, not a measured rate). These decrease with
refinement. They are the discretisation errors in the usual sense. Measured on this page's code, for the impulsively started spinning cylinder at
$Re=100$, $t=5$, centred, $N_z=1$ (independent review, `notes/verify/REPORT.md`, check 2): the torque differs from the exact solution by $+6.0\,\%$, $+0.7\,\%$,
$+0.5\,\%$ at $N=32,64,128$. These three numbers do not establish an order of convergence (the error does not fall by a constant factor), and the review's Richardson
extrapolation of them is not a clean order estimate either. TODO(measured: observed order of accuracy of the torque or of the velocity with $N$, from a sequence with at least four resolutions, or the reason the error flattens between $N=64$ and $128$).

## 6. The collision operators used

All three operators conserve $\rho$ and $\rho\mathbf u$ and share the same equilibrium. They differ in how the 19
populations are relaxed. The page's default is the **regularised** collision (`DEFAULT_COLLISION = "reg"`). It was chosen by a stability comparison (project notes, LBM agent's table): over six test cases up to $Re=3000$ the regularised operator stayed finite in all six, while BGK failed in one and MRT in one. The cases and the failing ones are not reproduced on this page.

### 6.1 BGK

The BGK operator of §3.2 relaxes all 19 populations towards equilibrium at the same rate $1/\tau$:

$$f_q^\star = f_q - \frac1\tau\,f_q^{neq}.$$

It is the simplest and cheapest operator, and the one for which §5 was derived. Its drawback is that **everything** is
relaxed at one rate. The 6 independent components of the stress, which set the viscosity, must have rate $1/\tau$. The remaining 9 combinations
of the populations (see §6.3) get the same rate. In the derivation of §5 only the moments of order 0, 1 and 2 of $f^{(1)}$ entered, so these 9 do not affect the Navier–Stokes equations at the viscous
order, but they are tied to the same $\tau$. When $\tau$ is close to $\tfrac12$ their relaxation factor $1-1/\tau$ is close to $-1$ (for the page's default preset
$\tau=0.5192$, §7.1, the factor is $-0.926$), so they are hardly damped.

### 6.2 Regularised collision (the default)

Latt & Chopard (2006) regularise the pre-collision populations using the local density, velocity and momentum flux (their abstract; the equation below is
written out here from the code and derived in this section, because the paper's text was not available to the author of this page). We saw in §5.5 that the part of
$f^{neq}$ that matters for Navier–Stokes is its second moment, the stress
$\Pi^{neq}_{ij}=\sum_qc_{qi}c_{qj}f^{neq}_q$ (it has 6 independent components). The other $19 - 4 - 6 = 9$ components of $f^{neq}$
are *kinetic ("ghost") modes*: they carry no mass, momentum or stress, and the derivation of §5 never used them.

The code (`collide`, kind `"reg"`) replaces $f^{neq}_q$ by a population that has **exactly the same stress but no ghost content**:

$$f^{neq}_q \;\longrightarrow\; \hat f_q = \frac{w_q}{2c_s^4}\,\left(c_{qi}c_{qj} - c_s^2\delta_{ij}\right)\Pi^{neq}_{ij},
\qquad f^\star_q = f^{eq}_q + \left(1-\frac1\tau\right)\hat f_q .$$

Here $f^{neq}=f-f^{eq}$ and $\Pi^{neq}$ are computed at every node from the incoming populations (with that node's own $\rho,\mathbf u$), and $(c_{qi}c_{qj}-c_s^2\delta_{ij})$ is the second-order Hermite
polynomial. The identities of §2.2 show that $\hat f$ has the stress $\Pi^{neq}$
and nothing else:

$$
\begin{aligned}
\sum_q\hat f_q &= \frac{\Pi^{neq}_{ij}}{2c_s^4}\Big(\sum_qw_qc_{qi}c_{qj} - c_s^2\delta_{ij}\sum_qw_q\Big) = \frac{\Pi^{neq}_{ij}}{2c_s^4}\left(c_s^2\delta_{ij}-c_s^2\delta_{ij}\right)=0,\\
\sum_qc_{qk}\hat f_q &= 0 \quad\text{(odd moments vanish)},\\
\sum_qc_{qk}c_{ql}\hat f_q &= \frac{\Pi^{neq}_{ij}}{2c_s^4}\Big(\sum_qw_qc_{qi}c_{qj}c_{qk}c_{ql} - c_s^2\delta_{ij}\sum_qw_qc_{qk}c_{ql}\Big)\\
&= \frac{\Pi^{neq}_{ij}}{2c_s^4}\,c_s^4\left(\delta_{ij}\delta_{kl}+\delta_{ik}\delta_{jl}+\delta_{il}\delta_{jk}-\delta_{ij}\delta_{kl}\right) = \tfrac12\left(\Pi^{neq}_{kl}+\Pi^{neq}_{lk}\right)=\Pi^{neq}_{kl}.
\end{aligned}
$$

The last step uses the symmetry of $\Pi^{neq}$. The projection keeps the trace of $\Pi^{neq}$ as well as its traceless part. *Checked by computer* (`c1.py`): for a random $f^{neq}$ with zero mass and momentum the three moments above hold to $10^{-16}$, and the 10 vectors
$\{w_q,\ w_qc_{qi},\ w_qH_{ij}(\mathbf c_q)\}$ that span the space of $f^{eq}$ and $\hat f$ are linearly independent (rank 10). Since $f^{eq}$ lies in this 10-dimensional space, $f^\star$ has zero ghost content.

**Same viscosity as BGK.** Write the projection as a linear operator $P$, $\hat f = Pf^{neq}$. It leaves the moments of order 0, 1 and 2 unchanged (just shown). Repeat the Taylor expansion of §5.1 with the regularised collision. The right side of (5.1) becomes $\tfrac1{\Delta t}\left[-f^{neq}+(1-\tfrac1\tau)Pf^{neq}\right]=-\tfrac1{\Delta t}Kf^{neq}$ with $K=I-(1-\tfrac1\tau)P$. Order by order:

- $O(\varepsilon)$: $D_1f^{(0)}=-\tfrac1{\Delta t}Kf^{(1)}$. Take $\sum_qc_{qi}c_{qj}$: because $P$ preserves the second moment, $\sum_qc_{qi}c_{qj}Kf^{(1)} = \Pi^{(1)}_{ij}-(1-\tfrac1\tau)\Pi^{(1)}_{ij}=\Pi^{(1)}_{ij}/\tau$. Hence $\Pi^{(1)}_{ij} = -\tau\Delta t\sum_qc_{qi}c_{qj}D_1f^{(0)}$, **the same as for BGK**, so (5.5) holds unchanged.
- $O(\varepsilon^2)$, momentum moment: $\sum_qc_{qi}\left[D_1f^{(1)}+\partial_{t_2}f^{(0)}+\tfrac{\Delta t}2D_1^2f^{(0)}\right]=0$. With $D_1f^{(0)}=-\tfrac1{\Delta t}Kf^{(1)}$ the last term is $-\tfrac12\sum_qc_{qi}D_1Kf^{(1)} = -\tfrac12\partial_k\Pi^{(1)}_{ik}/\tau$ (the time-derivative part vanishes since $K$ preserves the momentum moment of $f^{(1)}$, which is zero). So $\partial_{t_2}(\rho u_i)=-(1-\tfrac1{2\tau})\partial_k\Pi^{(1)}_{ik}$, the same as in §5.6.

Therefore the regularised collision gives **the same Navier–Stokes equations and the same $\nu = c_s^2(\tau-\tfrac12)\Delta t$** as BGK (and the numerical test of §5.8 confirms the value). It differs from BGK only in the 9 ghost components, which are set to zero after every collision (relaxation factor $0$ instead of $1-1/\tau$).

**Reading.** BGK and regularised collisions model the same fluid. Regularisation deletes the part of the
distribution that is invisible to the macroscopic equations and that BGK would damp only with factor $1-1/\tau$, close to $-1$ near $\tau=\tfrac12$. It costs a little more
arithmetic per node (computing $\Pi^{neq}$ and the projection). The page uses it because of the stability comparison in the introduction to this section.

### 6.3 Multiple relaxation times (MRT)

MRT (d'Humières et al. 2002) changes the *basis* in which the relaxation is done. The 19 populations
$\mathbf f=(f_0,\dots,f_{18})$ are transformed by a fixed $19\times19$ matrix $M$ into 19 **moments**
$\mathbf m = M\mathbf f$ (density, momentum, the components of stress, and so on). Each moment is relaxed at its own rate,

$$m_k^\star = m_k - s_k\left(m_k - m_k^{eq}\right), \qquad \mathbf f^\star = M^{-1}\mathbf m^\star, \qquad m^{eq}_k = (M\mathbf f^{eq})_k,$$

where $s_k$ is the rate of moment $k$. (Collect the rates in the diagonal matrix $S$: $\mathbf f^\star = \mathbf f - M^{-1}SM(\mathbf f-\mathbf f^{eq})$; this is what `mrt_matrix` builds.)

**Chemical-engineering analogy.** A reaction network is easier to analyse in terms of its *normal modes*: independent
combinations of species concentrations, each decaying with its own rate constant. The moments are the normal modes of the
collision. BGK corresponds to all modes having the same rate constant.

BGK is the special case $s_k=1/\tau$ for every non-conserved moment, because then $M^{-1}SM = \tfrac1\tau M^{-1}M=\tfrac1\tau I$.

**The basis and the rates as implemented** (`_mrt_basis`, `MRT_RATES`, `mrt_matrix`). With $c^2=c_x^2+c_y^2+c_z^2$ evaluated on each lattice vector, the 19 rows of $M$ are

| group | rows (functions of $\mathbf c_q$) | number | rate |
|---|---|---|---|
| density | $1$ | 1 | $0$ |
| momentum | $c_x,\ c_y,\ c_z$ | 3 | $0$ |
| $e$ (trace of the stress) | $19c^2-30$ | 1 | $s_e=1.19$ |
| shear stress | $3c_x^2-c^2,\ c_y^2-c_z^2,\ c_xc_y,\ c_yc_z,\ c_xc_z$ | 5 | $\omega=1/\tau$ |
| $\epsilon$ | $(21c^4-53c^2+24)/2$ | 1 | $s_\epsilon=1.4$ |
| $q_x,q_y,q_z$ | $(5c^2-9)\,c_x$, and $y$, $z$ | 3 | $s_q=1.2$ |
| $\pi_{xx},\pi_{ww}$ | $(3c^2-5)(3c_x^2-c^2),\ (3c^2-5)(c_y^2-c_z^2)$ | 2 | $s_\pi=1.4$ |
| $m_x,m_y,m_z$ | $(c_y^2-c_z^2)c_x,\ (c_z^2-c_x^2)c_y,\ (c_x^2-c_y^2)c_z$ | 3 | $s_m=1.98$ |

The 9 rows $\epsilon,q,\pi,m$ are the ghost modes. The numerical values $1.19,\,1.4,\,1.2,\,1.4,\,1.98$ match the set printed for the D3Q19 model in secondary sources that follow d'Humières et al. (2002) (for example arXiv:2512.23116, Appendix B). The original table was not opened, and one 2024 paper (arXiv:2402.08037) uses $1.6$ instead of $1.4$ for $\epsilon$ and $\pi$, so these are implemented values, not a verified quotation of the 2002 paper. *Checked by computer:* $M$ has rank 19.

*Which rate sets which viscosity.* Repeat the derivation of §5.3–5.6 with a general diagonal $S$. In place of (A),
$D_1f^{(0)} = -\tfrac1{\Delta t}M^{-1}SM f^{(1)}$, so for any non-conserved moment of the correction we get $m_k^{(1)}=-\Delta t\,s_k^{-1}(MD_1f^{(0)})_k$:
each moment is divided by its own rate instead of $1/\tau$. In place of (B$'$), the factor
$1-\tfrac1{2\tau}$ becomes $1-\tfrac{s_k}{2}$, since $\tfrac{\Delta t}{2}D_1^2f^{(0)}=-\tfrac12D_1(M^{-1}SMf^{(1)})$. Hence each stress moment $k$ is transported with
the effective coefficient $(1-\tfrac{s_k}2)\,\Delta t/s_k=(\tfrac1{s_k}-\tfrac12)\Delta t$. The second-moment space is spanned by the rows $e$ and the five shear rows, because these rows are exactly the trace $c^2$ (plus a multiple of $\rho$) and the traceless quadratics $3c_x^2-c^2$ etc.; so the trace of $\Pi^{(1)}$ is relaxed with $s_e$ and its traceless part with $\omega$. *Checked by computer* (`c1.py`): for a random $f^{neq}$ with zero mass and momentum, the second moment of $M^{-1}SMf^{neq}$ equals $\omega\times$(traceless part) $+\,s_e\times$(trace part) of that of $f^{neq}$, to $10^{-15}$, at three values of $\omega$. In the end the viscous stress is

$$\sigma'_{ij} = \left(\tfrac1{\omega}-\tfrac12\right)\Delta t\;\rho c_s^2\,2S^{dev}_{ij} + \left(\tfrac1{s_e}-\tfrac12\right)\Delta t\;\tfrac23\rho c_s^2\,(\partial_ku_k)\,\delta_{ij},$$

in which $S^{dev}_{ij}$ is the traceless part of the rate-of-strain tensor. Here the traceless part of the tensor $c_s^2\rho(\partial_iu_j+\partial_ju_i)$ is relaxed
with $\omega$ and its trace $2c_s^2\rho\,\partial_ku_k$ (whose isotropic share per diagonal entry is $\tfrac23c_s^2\rho\,\partial_ku_k$) with $s_e$. Therefore

$$\nu = c_s^2\left(\frac1{\omega}-\frac12\right)\Delta t = c_s^2(\tau-\tfrac12)\Delta t, \qquad
\zeta = \frac23\,\rho\,c_s^2\left(\frac1{s_e}-\frac12\right)\Delta t,$$

where $\nu$ is the shear (kinematic) viscosity and $\zeta$ is the bulk viscosity (the coefficient of $\partial_ku_k\,\delta_{ij}$, in the convention of a
stress $2\mu S^{dev} + \zeta(\nabla\cdot\mathbf u)\boldsymbol\delta$; it is the $\kappa$ of BSL and of §5.7). Setting $s_e=\omega=1/\tau$ recovers BGK: $\zeta=\tfrac23\rho\nu$,
as found in §5.7. With the implemented $s_e=1.19$, in lattice units $\zeta/\rho=\tfrac29\left(\tfrac1{1.19}-\tfrac12\right)=0.0756$ whatever $\tau$ is. The ghost rates do not appear in $\nu$ or $\zeta$. The sound-damping test of §5.8 confirms the bulk-viscosity formula for MRT numerically.

**Reading.** MRT lets the shear viscosity be set independently of the other 10 non-conserved moments. The shear
viscosity is set by $\omega$ and the bulk viscosity by $s_e$. The ghost rates do not enter the Navier–Stokes equations at all; they are tuned for
stability. For nearly incompressible flow the bulk viscosity multiplies $\nabla\cdot\mathbf u\approx0$, so it
matters little for the flow itself.

## 7. Units: physical to lattice

The lattice code works with numbers of order one: $h=\Delta t=1$, $\rho\approx1$, $|\mathbf u|\ll1$. The page
works in the nondimensional physical units of the finite-volume code (box side $L=1$, velocity unit $U_{ref}$, and density $1$). Two numbers are fixed
by hand, and the others follow.

### 7.1 Conversion

| quantity | physical | lattice |
|---|---|---|
| length | $h = 1/N$ (cells per box side $N$) | $1$ |
| time | $\Delta t$ (chosen below) | $1$ |
| velocity | $\mathbf u$ | $\mathbf u_{lb}=\mathbf u\,\Delta t/h$ |
| kinematic viscosity | $\nu = U_{ref}\,2R/Re$ | $\nu_{lb} = \nu\,\Delta t/h^2$ |
| relaxation time | | $\tau = 3\nu_{lb}+\tfrac12$ |

The first free choice is $\Delta t$. The page fixes the lattice speed of the **fastest point of the body**,
$U_{b}=|U_s|+|\omega_o|(r_o+R)$ with $\omega_o=U_o/r_o$ (the spin speed plus the orbital speed of the outermost point), at a value
$u_{lb}$:

$$\Delta t = \frac{u_{lb}\,h}{U_b}.$$

Then $U_b\Delta t/h=u_{lb}$. Because $c = h/\Delta t$ and $c_s=c/\sqrt3$, the Mach number of the fastest body point is
$u_{lb}/c_s=\sqrt3\,u_{lb}$. The second free choice is the viscosity: it comes from $Re$ and fixes $\tau$.

**The rule for $u_{lb}$ in the code** (`make_params`):

$$u_{lb}=\min\!\left(0.05,\ \frac{U_b}{6\,\nu\,N}\right).$$

Derivation of the second argument: with $\Delta t=u_{lb}h/U_b$ and $h=1/N$, $\nu_{lb}=\nu\Delta t/h^2=\nu\,u_{lb}N/U_b$. Requiring $\nu_{lb}\le\tfrac16$ gives $u_{lb}\le U_b/(6\nu N)$, and then $\tau=3\nu_{lb}+\tfrac12\le1$. The first argument, $0.05$, caps the Mach number at $\sqrt3\times0.05=0.0866$. An explicit $u_{lb}$ overrides the rule.

*Why $\tau\le1$.* Two things were measured. (1) On the page's code (independent review, `notes/verify/REPORT.md` item 5, and the project notes): for a spinning cylinder at $Re=1$ the torque has a rigorous bracket $|T|\in[0.2565,0.2618]$ (circular-annulus formula with outer radius $0.5$ and $0.7071$). With $u_{lb}=0.05$ ($\tau=1.46$ at $N=32$, $2.42$ at $N=64$) the LBM gave $0.2343$ and $0.2413$, below the bracket; with the rule, at $N=64$, it gives $0.2564$, at the lower edge. (2) A separate test of the halfway bounce-back wall rule alone (BGK, $16$ nodes across a channel, steady force-driven Poiseuille flow, first-order forcing added to the post-collision populations; script `c3.py`, not the page's code): fitting a parabola to the node velocities gives the apparent wall position relative to the halfway plane. It is within $0.017$ cell for $\tau\le1$ ($0.016, 0.016, 0.014, 0.011, 0.005$ at $\tau=0.55,0.7,0.8,0.9,1.0$) and moves outward by $0.047$, $0.27$, $0.88$ cell at $\tau=1.5, 2.5, 4$. So for curved velocity profiles the halfway wall is where it is assumed only for $\tau\lesssim1$, which is the reason for the rule. (This statement rests on the computation above only; no literature value is quoted.)

**Worked example (symbols).** Given $N$, $Re$, $R$, $r_o$, $U_s$, $U_o$ and $u_{lb}$:

1. $h=1/N$.
2. $U_b=|U_s|+|U_o|\,(r_o+R)/r_o$ and $U_{ref}=\max(|U_s|,|U_o|)$ (both are taken as 1 if zero).
3. $\Delta t=u_{lb}h/U_b$. The number of time steps per unit of physical time is $1/\Delta t=U_bN/u_{lb}$.
4. $\nu=U_{ref}\,2R/Re$.
5. $\nu_{lb}=\nu\Delta t/h^2 = \dfrac{U_{ref}}{U_b}\,\dfrac{2R\,N\,u_{lb}}{Re}$.
6. $\tau=3\nu_{lb}+\tfrac12 = \tfrac12 + 3\,\dfrac{U_{ref}}{U_b}\,\dfrac{D_{lb}\,u_{lb}}{Re}$, where $D_{lb}=2R/h=2RN$ is the number of cells across the cylinder diameter.
7. A lattice field value $\tilde{\mathbf u}$ is turned back into a physical velocity by $\mathbf u = \tilde{\mathbf u}\,h/\Delta t = \tilde{\mathbf u}\,U_b/u_{lb}$.

For a spin-only case ($U_o=0$) $U_{ref}=U_b$ and step 5 reduces to $\nu_{lb}=D_{lb}u_{lb}/Re$, the lattice form of $Re=UD/\nu$.

**The numbers for the page's presets** (computed with `make_params`, $N=64$, $N_z=32$, $R=0.1$, $r_o=0.2$, $U_s=1$, regularised collision; the rule gives $u_{lb}=0.05$, $Ma=0.0866$ in all four):

| preset | $Re$ | $U_o$ | $h$ | $\Delta t$ | steps per time unit | $\nu_{lb}$ | $\tau$ |
|---|---|---|---|---|---|---|---|
| Re 40, spin | 40 | 0 | $1/64$ | $7.8125\times10^{-4}$ | 1280 | $0.016$ | $0.5480$ |
| Re 100, spin | 100 | 0 | $1/64$ | $7.8125\times10^{-4}$ | 1280 | $0.0064$ | $0.5192$ |
| Re 200, spin, end walls | 200 | 0 | $1/64$ | $7.8125\times10^{-4}$ | 1280 | $0.0032$ | $0.5096$ |
| Re 800, spin + orbit | 800 | 1 | $1/64$ | $3.125\times10^{-4}$ | 3200 | $0.00032$ | $0.50096$ |

### 7.2 Trade-offs

- **$\tau\to\tfrac12$.** From step 6, $\tau-\tfrac12\propto D_{lb}\,u_{lb}/Re$. A higher Reynolds number at a fixed resolution and $u_{lb}$
  pushes $\tau$ towards $\tfrac12$, where the viscosity vanishes and, by §3.2, BGK no longer damps the non-equilibrium parts
  (factor $1-1/\tau\to-1$). The regularised and MRT collisions of §6 are meant to cope with this. The smallest stable $\tau-\tfrac12$ for each collision model is
  TODO(measured: not measured. Only the case-level comparison of §6 exists (regularised finite in six cases up to $Re=3000$; BGK and MRT each failed once); what is missing is the stability limit in $\tau-\tfrac12$ for each model, at fixed grid and $u_{lb}$).
- **Small $u_{lb}$.** Lowering $u_{lb}$ lowers $Ma$ and the $O(Ma^2)$ errors of §5.9, and it lowers $\tau-\tfrac12$ too (step 6). It also lowers $\Delta t$ in proportion, so the number of
  steps for a given physical time rises as $1/u_{lb}$.
- **Refinement.** While $u_{lb}=0.05$ (the cap is active), $\Delta t\propto h$ (acoustic scaling). Doubling $N$ doubles the number of steps
  per unit time and multiplies the nodes by 8 (for $N_z\propto N$) or 4 (for $N_z=1$), so the work for a fixed physical time grows as
  $N^4$ (full 3D) or $N^3$ (2D baseline), by counting. Then $\nu_{lb}\propto N$ at fixed $Re$, so refinement moves $\tau$ away from $\tfrac12$ until the second argument of the rule takes over: there $\nu_{lb}=\tfrac16$ is fixed and $\Delta t=u_{lb}h/U_b=1/(6\nu N^2)$ (diffusive scaling), so the steps per unit time grow as $N^2$ and the work as $N^5$ (3D) or $N^4$ (2D), again by counting. For example, at $Re=1$, $N=64$ the rule gives $u_{lb}=0.0130$ and $\tau=1$.

### 7.3 Initial condition and the deliberate 3D seed

`init_state` starts the fluid at rest with $\rho=1$ everywhere, plus a small prescribed velocity field, the **seed**, set as the equilibrium of §4.2 at that velocity (and $\rho=1$). The cylinder starts at orbit angle $\varphi=0$ and moves at full speed from the first step. The seed exists only to break the spanwise symmetry deliberately, so that any three-dimensional growth on the page comes from a known, tiny perturbation (or from physics) and not from solver round-off. With seed amplitude $0$, or $N_z<4$, no seed is added. The seed is built from a stream function so that it is divergence-free by construction. Write
$\mathbf u=\nabla\times(\psi\,\hat{\mathbf y})$, i.e.

$$u=-\frac{\partial\psi}{\partial z},\qquad v=0,\qquad w=\frac{\partial\psi}{\partial x}.$$

*Divergence-free:* $\partial_xu+\partial_yv+\partial_zw=-\partial_x\partial_z\psi+\partial_z\partial_x\psi=0$, because mixed derivatives commute. (Geometrically, $\psi$ is the stream function of the flow in each $x$–$z$ plane; streamlines close on themselves, so no net fluid is created.) The code uses

$$\psi = a\,F(x,y)\,W(z)\,S(z),\quad F=\sin^2(\pi x)\sin(\pi y),\quad S(z)=\sum_{m=1}^{M}\frac{\sin(k_mz+m)}{k_m},\quad k_m=\frac{2\pi m}{L_z},$$

with $a=\text{seed}\times U_{ref}$ (default seed $10^{-3}$), $M=\min(4,\lfloor N_z/4\rfloor)$, and $W=1$ for the periodic span or $W=\sin^2(\pi z/L_z)$ with end walls. The product rule gives

$$u=-aF\,(W'S+WS'),\qquad w=a\,\frac{\partial F}{\partial x}\,WS,\qquad \frac{\partial F}{\partial x}=\pi\sin(2\pi x)\sin(\pi y),\quad S'=\sum_m\cos(k_mz+m).$$

*Why these factors.* $F$ vanishes on all four side walls ($x=0,1$ through $\sin^2\pi x$; $y=0,1$ through $\sin\pi y$) and so does $\partial F/\partial x$ (through $\sin2\pi x$ and $\sin\pi y$): the seed is zero on the side walls, compatible with no-slip. With end walls, $W$ and $W'$ vanish at $z=0$ and $L_z$, so $u=w=0$ there as well. $S$ is a sum of the first $M$ spanwise Fourier modes $k_m$, periodic in $z$ (the phase $m$ only decorrelates the modes); dividing by $k_m$ in $S$ makes $S'$, hence $u$, of equal size for every mode. $M\le N_z/4$ keeps every mode well below the grid's shortest wavelength (the Nyquist mode is $m=N_z/2$). In the periodic case the velocity is the sum of $x$–$y$ patterns times $\cos(k_mz+m)$ (for $u$) and $\sin(k_mz+m)/k_m$ (for $w$), so each plane carries a different, small, in-plane pattern. In lattice units the velocity is multiplied by $\Delta t/h$ before it is used in the equilibrium.

## 8. Boundaries

**One time step as implemented** (`step`): (0) the body moves to its new position and the nodes it has just uncovered are refilled (§8.4); (1) collision, at every node (§6); (2) streaming, which wraps around the box periodically; (3) the box walls replace the populations that wrapped around (§8.1); (4) the populations that would arrive from inside the cylinder are rebuilt on the cut links (§8.3), and the same links give force and torque (§8.6); (5) the global mass correction (§8.5); (6) the nodes inside the cylinder are reset to the equilibrium at the body velocity, which only keeps them finite (the fluid never reads them).

A wall or a body removes some of the populations that streaming would have supplied to a fluid node: the
ones that would come from inside the solid. The boundary condition must construct these missing populations so that the macroscopic
velocity satisfies the no-slip condition at the correct place.

**Notation for a boundary link.** Let $\mathbf x_f$ be a fluid node and $\mathbf c_q$ a lattice vector pointing from it towards the solid, so that
$\mathbf x_f+\mathbf c_q$ is a solid node. After the collision, the population $f_q^\star(\mathbf x_f)$ would stream into the
solid. The population that must arrive at $\mathbf x_f$ with velocity $\mathbf c_{\bar q}=-\mathbf c_q$ is unknown, because its source lies
inside the solid. The boundary condition supplies $f_{\bar q}(\mathbf x_f,t+\Delta t)$. The wall crosses the link at
$\mathbf x_w=\mathbf x_f+q\,\mathbf c_q$, where the **cut fraction** $q\in(0,1]$ is the fraction of the link length that lies in the fluid.
(This $q$ is a number, not the velocity index $q$ that labels $\mathbf c_q$, $w_q$ and $f_q$. In formulas the index appears as a subscript, the fraction does not. The code calls the fraction `s`.)

### 8.1 Halfway bounce-back on a stationary wall

For a flat wall that coincides with a coordinate plane, say $y=0$, with the first fluid nodes at $y=h/2$, every link
pointing to the wall has a $y$-component $-1$ and crosses the plane exactly in its middle. The wall is half a link away
from the node: $q=\tfrac12$. The **halfway bounce-back** rule is

$$f_{\bar q}(\mathbf x_f,t+\Delta t) = f_q^\star(\mathbf x_f,t).$$

**Picture.** A population that leaves $\mathbf x_f$ with velocity $\mathbf c_q$ moves towards the wall. The node is $h/2$ from the wall and the
velocity component normal to the wall is $h/\Delta t$, so it reaches the wall plane at the time $\Delta t/2$, after having travelled half of the
link. There its velocity is reversed. It then retraces its path in the other direction, and arrives back at $\mathbf x_f$ at
time $\Delta t$. (For a diagonal link such as $(1,-1,0)$, the particle goes half a cell sideways and then comes back the same half cell
sideways. Reversing the whole velocity returns it to the starting node.) This is exact for axis-aligned walls with nodes at $h/2$.
So the page's box walls at $x,y=0,1$ and (for end walls) $z=0,L_z$ lie *exactly* halfway between a fluid node and
the ghost node outside. This is how the lattice agrees with the finite-volume grid on the position of the walls (the grid nodes
are at cell centres $(i+\tfrac12)h$).

**Why the wall is at the half-link and the slip is zero.** Take the exact linear shear solution of §5.8, $u(y)=u'(y-y_{w})$, with a wall at an unknown
position $y_w$ below the first node, which is at $y_0=\tfrac12$ (lattice units, with $\rho=1$). From §5.8, the populations of the first node are
$f_q=f^{eq}_q+g_q$ with $g_q=-\tau w_qc_{qx}c_{qy}u'/c_s^2$ and $f_q^{eq}=w_q(1+c_{qx}u_0/c_s^2)$, where $u_0=u(y_0)$. The unknown populations are those arriving with
$c_y=+1$ (for example $q=7$, $(1,1,0)$). Their reflected partner $\bar q$ has $c_y=-1$ and $c_{\bar q,x}=-c_{qx}$. We require the exact solution to satisfy

$$f_q(y_0) = f^\star_{\bar q}(y_0) \qquad (c_{qy}=+1).$$

Left side: $f_q(y_0) = w_q\left(1+\dfrac{c_{qx}u_0}{c_s^2}\right) - \dfrac{\tau w_qc_{qx}u'}{c_s^2}$, since $c_{qy}=1$.
Right side: $f^\star_{\bar q} = f^{eq}_{\bar q} + (1-\tfrac1\tau)g_{\bar q}$, with $f^{eq}_{\bar q} = w_q(1-c_{qx}u_0/c_s^2)$ and
$g_{\bar q} = -\tau w_q(-c_{qx})(-1)u'/c_s^2 = -\tau w_qc_{qx}u'/c_s^2$. So

$$f^\star_{\bar q} = w_q\left(1-\frac{c_{qx}u_0}{c_s^2}\right) - \left(1-\tfrac1\tau\right)\frac{\tau w_qc_{qx}u'}{c_s^2}.$$

Subtract the right side from the left side:

$$\frac{2w_qc_{qx}u_0}{c_s^2} - \frac{\tau w_qc_{qx}u'}{c_s^2}\left[1-\left(1-\tfrac1\tau\right)\right] = \frac{w_qc_{qx}}{c_s^2}\left(2u_0 - u'\right) .$$

This vanishes if and only if $u_0=u'/2$. Since $u_0 = u'(y_0-y_w)$ and $y_0=\tfrac12$ (in units of $h$), $y_w=0$. **For linear shear (Couette flow) the bounce-back condition is satisfied exactly with the wall at the half-link position and
zero velocity there, for every $\tau$.**

**Reading.** The "no-slip" condition holds at the plane half a link from the first node, not at the node: the wall lies
between the last fluid node and the first ghost node, which is also where the finite-volume code puts it.
For flows whose velocity profile is curved (such as the pressure-driven Poiseuille flow), the profile is no longer linear and the exact shear solution above does not apply.
What happens then was computed, not derived: the apparent wall position of the halfway rule depends on $\tau$, it is within $0.017$ cell of the halfway plane for $\tau\le1$ and moves outward for $\tau>1$ (numbers in §7.1). This is why the page keeps $\tau\le1$.

### 8.2 A moving wall

If the wall moves with velocity $\mathbf u_w$, the reflected population must also carry the wall's momentum. Ladd (1994, Eq. 3.3) adds
a term proportional to the wall velocity to the bounce-back, and verifies it on Couette flow. We derive it here by changing frames.

Go into the frame that moves with the wall. There the wall is at rest and the halfway rule applies as it stands: the reflected population equals the
incident one. Now go back to the laboratory frame. To first order in $\mathbf u_w$, a velocity shift $\mathbf u_w$ changes the population in direction $\mathbf c_q$
by the linear term of the equilibrium (§4.2), $\delta f_q = w_q\rho\,\mathbf c_q\!\cdot\!\mathbf u_w/c_s^2$, and the population in the opposite direction by $-\delta f_q$ (it is odd in $\mathbf c$).
Let $f_q^{\star w}$ and $f_{\bar q}^{w}$ be the incident and reflected populations in the wall frame, with $f^w_{\bar q}=f_q^{\star w}$. In the lab frame:

$$
\begin{aligned}
f^\star_q &= f_q^{\star w} + \delta f_q &&\Rightarrow\; f_q^{\star w} = f_q^\star - \delta f_q,\\
f_{\bar q} &= f_{\bar q}^w - \delta f_q = f_q^{\star w} - \delta f_q = f_q^\star - 2\,\delta f_q,
\end{aligned}
$$

that is,

$$\boxed{\,f_{\bar q}(\mathbf x_f,t+\Delta t) = f^\star_q(\mathbf x_f,t) - \frac{2\,w_q\,\rho\,\mathbf c_q\!\cdot\!\mathbf u_w}{c_s^2}\,}$$

This is the halfway rule for a moving wall. (The code takes $\rho=1$ in the term, the density that §8.5 holds the mean at; the local density differs from 1 by $O(Ma^2)$, §5.9.) (The quadratic part of the equilibrium is even in $\mathbf c$ and cancels between the two directions.)

**Reading.** Bounce-back alone returns the same momentum that arrives, so the wall appears at rest. The term shifts the balance
between the incident and returning populations so that the net flux along the link equals that of a fluid moving with the wall,
$f^\star_q - f_{\bar q} = 2w_q\rho\,\mathbf c_q\!\cdot\!\mathbf u_w/c_s^2 = f^{eq}_q(\mathbf u_w)-f^{eq}_{\bar q}(\mathbf u_w)$.
Equivalently: reflect the non-equilibrium part and substitute the equilibrium at the wall velocity. For a flat
wall that moves tangentially the terms cancel in pairs across a node, so no net mass enters the fluid ($\mathbf c_q\cdot\mathbf u_w$
is odd under flipping the tangential component of $\mathbf c_q$). For a curved wall this cancellation is not exact.

**Check on the exact shear solution.** Take the upper wall of a Couette channel at distance $h/2$ above the last node,
$y_N$, moving with $u_w$. For a link pointing up to the wall ($c_{qy}=+1$), the arriving population has velocity $\mathbf c_{\bar q}$ with $c_{\bar qy}=-1$ and $c_{\bar qx}=-c_{qx}$.
Both $g_q$ and $g_{\bar q}$ equal $-\tau w_qc_{qx}u'/c_s^2$. The condition $f_{\bar q}=f^\star_q-2w_q c_{qx}u_w/c_s^2$ reads

$$w_q\Big(1-\tfrac{c_{qx}u_N}{c_s^2}\Big)+g_q = w_q\Big(1+\tfrac{c_{qx}u_N}{c_s^2}\Big)+\big(1-\tfrac1\tau\big)g_q-\tfrac{2w_qc_{qx}u_w}{c_s^2},$$

and collecting terms (using $g_q/\tau=-w_qc_{qx}u'/c_s^2$) gives

$$\frac{2w_qc_{qx}}{c_s^2}\left(u_w-u_N-\tfrac12u'\right)=0 \quad\Longrightarrow\quad u_N+\tfrac12u'=u_w,$$

and $u_N+\tfrac12u'$ is the linear profile extrapolated to the wall position. The moving wall term has exactly the size needed
to make the velocity at the wall equal to $u_w$.

### 8.3 A curved, moving body: interpolated bounce-back

The cylinder surface is generally *not* halfway between nodes. The cut fraction $q$ varies from link to link. If we
applied the halfway rule everywhere (**staircase bounce-back**), the wall would effectively sit at distance $\tfrac12$ link from each fluid node rather than $q$.
Its position would be wrong by $(q-\tfrac12)$ link lengths, up to $\tfrac12$ of a link. This is a first-order error in $h$.

**The cut fraction from the circle** (`find_links`). Let $\mathbf d=\mathbf x_f-\mathbf x_c$ be the fluid node relative to the cylinder centre and $\mathbf c_{xy}$ the in-plane part of the link vector, with $a=|\mathbf c_{xy}|^2$ and $b=\mathbf d\cdot\mathbf c_{xy}$. The link point at fraction $s$ is at $\mathbf d+s\,\mathbf c_{xy}$ (in-plane), and it is on the circle when
$|\mathbf d+s\mathbf c_{xy}|^2=R^2$, that is $a s^2+2bs+(|\mathbf d|^2-R^2)=0$. The fluid node is outside the circle and the neighbour is inside, so the surface is met first at the **smaller root**,

$$q=\frac{-b-\sqrt{b^2-a\,(|\mathbf d|^2-R^2)}}{a},$$

clipped to $[0,1]$. A link with $c_z\ne0$ has the same $q$ as its in-plane projection, because the cylinder does not depend on $z$ (the point $\mathbf x_f+q\mathbf c$ is on the surface exactly when its $(x,y)$ is). The cut point is $\mathbf x_w=\mathbf x_f+q\,\mathbf c_q$.

Bouzidi, Firdaouss & Lallemand (2001) combine bounce-back with first- or second-order spatial interpolation; the version used here is linear. We follow the reflected particle for exactly one time step with the true wall position, and interpolate (the derivation below is written out here from the geometry; the paper's equations were not available to the author of this page, but the two formulas coincide with the form implemented in the code and verified below on an exact solution).
The particle must arrive at $\mathbf x_f$ at time $t+\Delta t$ with velocity $\mathbf c_{\bar q}$.
Measure positions along the link from $\mathbf x_f$ in units of the link length, with the wall at $+q$ and the next node in the solid at $+1$. The speed is one link length per time step.

**Case $q<\tfrac12$ (wall close to the fluid node).** The particle returns from the wall to $\mathbf x_f$ over a distance $q$. Its total path is
one link length in time $\Delta t$, so the incident leg has length $1-q$ and the particle started at position $q-(1-q)=2q-1$, which is **between the upstream node $\mathbf x_f-\mathbf c_q$ (position $-1$) and $\mathbf x_f$ (position $0$)**,
at distance $1-2q$ upstream of $\mathbf x_f$. We know the post-collision populations at both nodes, so we interpolate $f^\star_q$ linearly between them
to the starting point. The weight on $\mathbf x_f$ is $2q$ and the weight on the upstream node is $1-2q$:

$$f_{\bar q}(\mathbf x_f,t+\Delta t) = 2q\,f_q^\star(\mathbf x_f) + (1-2q)\,f_q^\star(\mathbf x_f-\mathbf c_q).$$

**Case $q\ge\tfrac12$ (wall close to the solid node).** Now the starting point $2q-1$ of the returning particle would lie on the
solid side of $\mathbf x_f$, in $[0,1)$, so there is nothing to interpolate from there. Follow instead the particle that *starts at $\mathbf x_f$*. It runs
the incident leg of length $q$ to the wall and then the reflected leg of the remaining length $1-q$, so at $t+\Delta t$ it sits at position
$q-(1-q)=2q-1$, between $\mathbf x_f$ and the wall, carrying the known value $f^\star_q(\mathbf x_f)$. That is a value of the reflected
population $f_{\bar q}$ at position $2q-1$. A second value of $f_{\bar q}$ at $t+\Delta t$ is available at position $-1$: it is the node
$\mathbf x_f-\mathbf c_q$, which receives $f^\star_{\bar q}(\mathbf x_f)$ by ordinary streaming. We want the value at position $0$, which is a fraction
$\tfrac{0-(-1)}{(2q-1)-(-1)}=\tfrac1{2q}$ of the way from the second point to the first. Linear interpolation gives

$$f_{\bar q}(\mathbf x_f,t+\Delta t) = \frac1{2q}\,f_q^\star(\mathbf x_f) + \frac{2q-1}{2q}\,f_{\bar q}^\star(\mathbf x_f).$$

Both formulas give the halfway rule at $q=\tfrac12$, and both use only fluid nodes. For $q\to1$ the second becomes the average of the incident and returning populations at the node. If the second fluid node $\mathbf x_f-\mathbf c_q$ is not available for $q<\tfrac12$ (outside the box or inside the body), the code uses $f^\star_q(\mathbf x_f)$ in its place (first-order fallback).

**Moving body: where the factor $1/(2q)$ comes from.** In the frame of the wall (velocity $\mathbf u_w$ at the cut point, taken uniform near the link) the wall is at rest, so the interpolation rules above apply to the wall-frame populations. A frame change shifts the population of direction $\mathbf c_q$ by $\delta=w_q\rho\,\mathbf c_q\!\cdot\!\mathbf u_w/c_s^2$ and that of $\mathbf c_{\bar q}$ by $-\delta$ (§8.2): lab $=$ wall frame $+\ \delta$ for $q$ and $-\delta$ for $\bar q$. So $f^{\star w}_q=f^\star_q-\delta$ and $f^{\star w}_{\bar q}=f^\star_{\bar q}+\delta$. Apply the rule in the wall frame, then shift the result (direction $\bar q$) back by $-\delta$:

- $q<\tfrac12$: $\;2q(f^\star_q-\delta)+(1-2q)(f^\star_q{}' -\delta)-\delta = [\text{lab interpolation}]-2\delta$, since the two weights sum to $1$.
- $q\ge\tfrac12$: $\;\tfrac1{2q}(f^\star_q-\delta)+\tfrac{2q-1}{2q}(f^\star_{\bar q}+\delta)-\delta = [\text{lab interpolation}]-\delta\left(\tfrac{1}{2q}-\tfrac{2q-1}{2q}+1\right) = [\text{lab interpolation}]-\tfrac{\delta}{q}$.

With $g\equiv-2\delta=-2w_q\rho\,\mathbf c_q\!\cdot\!\mathbf u_w/c_s^2$ (the wall term of §8.2) the correction is therefore

$$\text{wall term}=\begin{cases}g & q<\tfrac12\\[2pt] \dfrac{g}{2q} & q\ge\tfrac12\end{cases}$$

This is what `bounce_back_body` implements (with $\rho=1$, so $g=-6w_q\,\mathbf c_q\!\cdot\!\mathbf u_w$ in lattice units). Equivalently, $g$ is added to every *incident* post-collision population that enters the interpolation, and the interpolation then weights it: the single incident population of the case $q\ge\tfrac12$ has weight $1/(2q)$, and the two incident populations of the case $q<\tfrac12$ have weights that sum to $1$. The two cases agree at $q=\tfrac12$, where they reduce to the halfway rule of §8.2. The algebra was checked symbolically (`c1.py`), and the exact-solution check follows.

**Check on the exact shear solution (any $q$, any $\tau$).** Put the wall at $y=0$ and the first node at $y_0=q$, with the link pointing down to the wall
($c_{qy}=-1$), and let the profile be $u=u'(y-y_w)$. For these two directions $g_q=g_{\bar q}=+\tau w_qc_{qx}u'/c_s^2\equiv g_{ne}$, and
$f^{eq}_q=w_q(1+c_{qx}u/c_s^2)$, $f^{eq}_{\bar q}=w_q(1-c_{qx}u/c_s^2)$. Because $f^{eq}$ is linear in $u$, interpolating it in space just interpolates the velocity. (Here $g_{ne}$ is the non-equilibrium part of §5.8; it is not the wall term $g$.)

*Case $q<\tfrac12$.* The upstream node is at $y_0+1$, where the velocity is $u_0+u'$. The interpolated incident population is
$w_q\left[1+\tfrac{c_{qx}}{c_s^2}\left(u_0+(1-2q)u'\right)\right]+(1-\tfrac1\tau)g_{ne}$, and the required value is
$f_{\bar q}=w_q(1-c_{qx}u_0/c_s^2)+g_{ne}$. Their difference (interpolated minus required), with $g_{ne}/\tau=w_qc_{qx}u'/c_s^2$, is

$$\frac{2w_qc_{qx}}{c_s^2}\left(u_0-qu'\right)=0\quad\Longrightarrow\quad u_0=q\,u'.$$

*Case $q\ge\tfrac12$.* The interpolated population is $\tfrac1{2q}f^\star_q+\tfrac{2q-1}{2q}f^\star_{\bar q}$; its equilibrium part is
$w_q\left[1+\tfrac{c_{qx}u_0}{c_s^2}\left(\tfrac1{2q}-\tfrac{2q-1}{2q}\right)\right]=w_q\left[1+\tfrac{c_{qx}u_0}{c_s^2}\tfrac{1-q}{q}\right]$. The required value minus the interpolated one is

$$-\frac{w_qc_{qx}}{c_s^2}\,u_0\left(1+\frac{1-q}{q}\right)+\frac{w_qc_{qx}u'}{c_s^2}= -\frac{w_qc_{qx}}{q\,c_s^2}\left(u_0-qu'\right)=0\quad\Longrightarrow\quad u_0=q\,u' .$$

In both cases the profile $u'(y-y_w)$ vanishes at $y_w=0$, exactly the wall position, for every $q$ and every $\tau$.

*With a moving wall* of velocity $u_w$ along $x$ the required value gains the wall term. For $q<\tfrac12$ the condition becomes $-\tfrac{2w_qc_{qx}}{c_s^2}(u_0-qu')=-\tfrac{2w_qc_{qx}u_w}{c_s^2}$, i.e. $u_0-qu'=u_w$; for $q\ge\tfrac12$ with the factor $\tfrac1{2q}$ it becomes $-\tfrac{w_qc_{qx}}{qc_s^2}(u_0-qu')=-\tfrac{2w_qc_{qx}u_w}{2q\,c_s^2}$, again $u_0-qu'=u_w$: the linear profile has exactly the velocity $u_w$ at the cut position. *Without* the factor (adding the full $g$ in the second case), the condition is $u_0-qu'=2q\,u_w$, which is wrong unless $q=\tfrac12$: the wall would move at $2q$ times its speed. Both results were confirmed symbolically (`c1.py`). The staircase rule instead gives $u(\text{half-link})=u_w$,
i.e. a wall position wrong by $(\tfrac12-q)$ link lengths.

**Why the order differs.** The staircase rule places the wall at the wrong position by $|q-\tfrac12|$ link lengths, which is of first order in $h$. The velocity at the true wall is then
off by $|u'|\,|q-\tfrac12|\,h$ for a linear profile, again first order in $h$ for a fixed physical gradient $u'$. In addition the stair-stepped surface has the wrong shape, at order $h$.
The Bouzidi rule places the wall exactly where it is for any linear profile, as the check above shows. What remains is the error from the curvature of the profile, of order $h^2u''$, and from the discrete circle. Bouzidi et al. (2001) report second-order accuracy for their scheme on time-dependent circular Couette flow and flow past a periodic array of cylinders (from the paper's abstract). The observed order on this page's code is TODO(measured: convergence order of the torque or velocity error with $N$; the only data are the three torque errors of §5.9(c)).

### 8.4 Nodes uncovered by the moving cylinder: refilling

A node is a *solid* node if its centre lies inside the cylinder; the solid nodes hold no meaningful populations. When the
cylinder orbits, the set of solid nodes changes from step to step. At the **leading** edge, a fluid node becomes covered; its populations are just dropped. At the **trailing** edge, a solid node becomes fluid ("uncovered") and needs a full set of 19 populations at once, because the code
never evolved them as a fluid state. (Per step the cylinder moves by at most $u_{lb}$ of a cell, so only a thin sliver of nodes changes in each step.)

Using stale or arbitrary values would insert mass and momentum that do not belong to the flow. Such a defect behaves like a sudden local pressure disturbance and can radiate as a sound pulse at speed $c_s$.
The refilling scheme sets the new node's populations to

$$f_q(\mathbf x) = f_q^{eq}\big(\rho,\mathbf u_b(\mathbf x)\big) + f_q^{neq,\,\mathrm{nb}}.$$

- The equilibrium part uses the **body velocity at that node**, $\mathbf u_b(\mathbf x)$. Until one step ago the node was inside the cylinder and moved with it, so the fluid there moves with the body velocity. It also uses a density $\rho$ taken from the neighbouring fluid nodes.
- The non-equilibrium part is taken from the neighbouring fluid nodes, so that the stress of the boundary layer next to the body continues smoothly into the new node, rather than starting with a zero-stress "hole".

This follows the idea of the equilibrium-plus-non-equilibrium refill compared by Caiazzo (2008). The details of the page's version (which neighbours, how the density is chosen, how the non-equilibrium part is averaged) are TODO(code: refill scheme exactly as implemented in lbm3d.py).
Neither dropping nor refilling is exactly mass-conserving. Their effect on the total mass is TODO(measured: relative drift of total mass over one revolution, with and without refilling).

### 8.5 Force and torque by momentum exchange

The force of the fluid on the body is obtained from the **momentum balance on the boundary links** (Ladd 1994). On a link with fluid node $\mathbf x_f$,
direction $\mathbf c_q$ pointing to the body, and cut point $\mathbf x_w$, during one step:

- the population $f^\star_q$ arrives at the wall carrying momentum $\mathbf c_qf^\star_q$ (per unit lattice volume);
- the population $f_{\bar q}$ leaves with momentum $\mathbf c_{\bar q}f_{\bar q}=-\mathbf c_qf_{\bar q}$.

The fluid's momentum changes by $-\mathbf c_q f_{\bar q}-\mathbf c_qf^\star_q$. By Newton's third law the body receives the opposite,

$$\Delta\mathbf P_q = \mathbf c_q\left(f_q^\star + f_{\bar q}\right)\qquad\text{per link and time step.}$$

Summing over all boundary links gives the force on the body. This accounts for pressure and viscous forces together, since they are both carried by the
populations. For a **moving** body the lab-frame formula has a flaw. When the wall moves, mass can enter the wall on one link and leave on another. This net mass absorbed per link is
$f^\star_q-f_{\bar q}$, and carrying lab-frame momentum $\mathbf u_b$ it would be counted as a force, though it is only a change of reference frame. The
Galilean-invariant form (Wen et al. 2014) subtracts it:

$$\boxed{\;\Delta\mathbf P_q = \mathbf c_q\left(f_q^\star+f_{\bar q}\right) - \mathbf u_b\left(f_q^\star - f_{\bar q}\right)\;}
\quad\Longleftrightarrow\quad
\Delta\mathbf P_q=(\mathbf c_q-\mathbf u_b)f_q^\star-(\mathbf c_{\bar q}-\mathbf u_b)f_{\bar q}.$$

The right-hand form shows the idea: the momentum is measured relative to the moving wall. It reduces to Ladd's formula for a body at rest. Here $f_{\bar q}$ is the population *as set by the boundary rule*, including its moving-wall term, and $\mathbf u_b$ is the body velocity at the cut point.

**Conversion and torque.** In lattice units the force on the body, per time step, is $\mathbf F_{lb} = \sum_{\text{links}}\Delta\mathbf P_q$. In physical units,
with the page's density scale $\rho_0=1$, a momentum $\rho_0h^3(h/\Delta t)\,\Delta\mathbf P_q$ is exchanged per step, so the force on the body *per unit span* (divide by $L_z=N_zh$) is

$$\mathbf F' = \frac{\rho_0\,h^3}{N_z\,\Delta t^2}\sum_{\text{links}}\Delta\mathbf P_q,\qquad
T'_z=\frac{\rho_0\,h^4}{N_z\,\Delta t^2}\sum_{\text{links}}\left[\,(x_w-x_c)\,\Delta P_{q,y} - (y_w-y_c)\,\Delta P_{q,x}\,\right],$$

where $(x_c,y_c)$ is the cylinder centre, $(x_w,y_w)$ the cut point in lattice units (so the lever arm is $\mathbf x_w-\mathbf x_c$), and the second formula is the $z$-component of the torque $\sum(\mathbf x_w-\mathbf x_c)\times\Delta\mathbf P_q$ about the centre. A positive value is counterclockwise as seen from $+z$. For a cylinder spinning counterclockwise in fluid
at rest, the torque of the fluid on it is clockwise, i.e. negative: it resists the spin.
TODO(code: confirm which point is used as the lever arm, the cut point or the link midpoint, and that the Galilean-invariant correction is used in lbm3d.py).

For a span-uniform flow every plane contributes equally, so the torque per unit span is the same for any $N_z$, and for $N_z=1$ it is the 2D torque. 

**Check (shear flow).** In the Couette channel of §5.8 with halfway or cut-link walls, the sum of $\Delta P_{q,x}$ over the links of one wall column equals $-\nu_{lb}u'$ per unit wall area, the viscous shear stress
$\rho\nu\,\partial_yu$, to the accuracy of the iteration.

### 8.6 Periodic span versus end walls

Our box is periodic or walled in $z$ (the page's `span` input). The cylinder fills the whole span, so only in-plane links are cut by it.

- **Periodic span.** Streaming wraps in $z$: a population leaving node $k=N_z-1$ with $c_z=+1$ arrives at node $k=0$, and vice versa.
  No boundary condition is applied. A flow that is uniform in $z$ stays uniform, except for instabilities that break the symmetry.
- **End walls (no-slip).** The first and last layers, $k=0$ and $k=N_z-1$, are fluid nodes; the walls sit at $z=0$ and $z=L_z$, half a cell outside the
  node layers, as in §8.1. The populations that would stream in from outside are replaced by halfway bounce-back. At $k=0$ these
  are the five with $c_z=+1$ ($q=5,11,14,15,18$), each set equal to the post-collision population of its opposite ($6,12,13,16,17$)
  at the same node, and symmetrically at $k=N_z-1$. The end walls are stationary, so there is no moving-wall term. The Ekman layers that
  form at the end walls are a flow phenomenon, treated in the physics part of the page.

### 8.7 One layer, periodic in $z$: D3Q19 is exactly D2Q9

With $N_z=1$ and a periodic span, streaming in $z$ takes a population from a node to itself. Define the **summed populations**
$F_{(a,b)}=\sum_{c_z}f_{(a,b,c_z)}$: for each in-plane direction $(a,b)$, add the populations of all vectors with that in-plane part.

*Weights.* The in-plane directions collect the weights as follows. All sums run over the D3Q19 vectors with the given in-plane part:

| in-plane $(a,b)$ | D3Q19 vectors that project onto it | sum of weights | D2Q9 weight |
|---|---|---|---|
| $(0,0)$ | $(0,0,0),\ (0,0,\pm1)$ | $\tfrac13+\tfrac1{18}+\tfrac1{18}=\tfrac49$ | $\tfrac49$ |
| $(\pm1,0)$ or $(0,\pm1)$ | $(\pm1,0,0),\ (\pm1,0,\pm1)$ (two $c_z=\pm1$) | $\tfrac1{18}+2\cdot\tfrac1{36}=\tfrac19$ | $\tfrac19$ |
| $(\pm1,\pm1)$ | $(\pm1,\pm1,0)$ only | $\tfrac1{36}$ | $\tfrac1{36}$ |

D3Q19 has no vector with $c_x$, $c_y$ and $c_z$ all non-zero, so the diagonal in-plane directions have only the one $c_z=0$ member.
These are exactly the D2Q9 weights, and $c_s^2=\tfrac13$ is the same.

*Equilibrium.* With $u_z=0$ (which the symmetry $z\to-z$ of the problem preserves, starting from rest), the equilibrium of §4.2 does not depend on $c_z$:
$c_{qk}u_k=c_xu_x+c_yu_y$. So $\sum_{c_z}f^{eq}_{(a,b,c_z)} = \left(\sum_{c_z}w\right)\rho\,[\dots]$ is the D2Q9 equilibrium.

*Collision and streaming.* The BGK collision is linear in the populations, so summing over $c_z$ commutes with it:
$F^\star_{(a,b)}=F_{(a,b)}-\tfrac1\tau(F_{(a,b)}-F^{eq}_{(a,b)})$. Streaming of every member moves it by $(a,b)$ in-plane, and by $c_z$ in the (periodic) $z$-direction onto the same node. So $F_{(a,b)}$ streams by $(a,b)$, exactly the D2Q9 rule.

*Boundaries.* Bounce-back and Bouzidi interpolation are linear, use only in-plane geometry (the cut fraction of a link $(a,b,c_z)$ with the cylinder is the same for all $c_z$ because the cylinder does not depend on $z$), and use the same weights summed. So they agree with the D2Q9 versions.

Hence, for BGK, $N_z=1$ periodic D3Q19 *is* D2Q9. The page tests this with a value-by-value comparison.
The statement is for BGK only: the regularised and MRT operators of §6 act on all 19 populations and are not a priori the same as their D2Q9 versions.

## 9. What the two methods do differently on this problem

All statements below hold by construction of the two codes.

| | finite volumes (the Navier–Stokes part of this page) | lattice Boltzmann |
|---|---|---|
| time step | explicit momentum update, then a **pressure Poisson equation** solved by multigrid at every step | explicit, **local** collision, then neighbour shift; no linear system |
| pressure | Lagrange multiplier enforcing $\nabla\cdot\mathbf u=0$ | equation of state, $p=\rho c_s^2$ |
| divergence of $\mathbf u$ | zero up to the Poisson solver's residual | nonzero, of order $Ma^2U/L$ (§5.9): the fluid is weakly compressible |
| signals | pressure acts instantaneously across the domain | pressure waves travel at $c_s$ |
| body boundary | a mask $\chi$ that pulls the velocity of the cells towards $\mathbf u_b$ (Brinkman-type) | sharp surface, interpolated bounce-back at the cut points (§8.3) |
| walls | ghost cells with mirrored values | halfway bounce-back (§8.1) |
| advection | MUSCL reconstruction with a limiter | exact shift along the lattice vectors, no interpolation |
| state per cell | $u,v,w$ and the pressure $q$ | 19 populations |
| time step size | from the CFL and diffusion limits ($\propto h$ where advection dominates) | $\Delta t=u_{lb}h/U_b$, $\propto h$ |

The consequences for run time, accuracy and the smallest Reynolds number at which each method stays stable are not discussed
here because they depend on measurements: TODO(measured: comparison of the two methods on the same cases).

## References

- Bhatnagar, P. L., Gross, E. P. & Krook, M. (1954). A model for collision processes in gases. *Phys. Rev.* 94, 511–525.
- Bird, R. B., Stewart, W. E. & Lightfoot, E. N. (2002). *Transport Phenomena*, 2nd ed. Wiley.
- Bouzidi, M., Firdaouss, M. & Lallemand, P. (2001). Momentum transfer of a Boltzmann-lattice fluid with boundaries. *Phys. Fluids* 13, 3452–3459.
- Caiazzo, A. (2008). Analysis of lattice Boltzmann nodes initialisation in moving boundary problems. *Prog. Comput. Fluid Dyn.* 8, 3–10.
- Chapman, S. & Cowling, T. G. (1970). *The Mathematical Theory of Non-uniform Gases*, 3rd ed. Cambridge University Press.
- d'Humières, D., Ginzburg, I., Krafczyk, M., Lallemand, P. & Luo, L.-S. (2002). Multiple-relaxation-time lattice Boltzmann models in three dimensions. *Phil. Trans. R. Soc. A* 360, 437–451.
- Ginzburg, I. & d'Humières, D. (2003). Multireflection boundary conditions for lattice Boltzmann models. *Phys. Rev. E* 68, 066614.
- He, X., Zou, Q., Luo, L.-S. & Dembo, M. (1997). Analytic solutions of simple flows and analysis of nonslip boundary conditions for the lattice Boltzmann BGK model. *J. Stat. Phys.* 87, 115–136.
- Krüger, T., Kusumaatmaja, H., Kuzmin, A., Shardt, O., Silva, G. & Viggen, E. M. (2017). *The Lattice Boltzmann Method: Principles and Practice*. Springer.
- Ladd, A. J. C. (1994). Numerical simulations of particulate suspensions via a discretized Boltzmann equation. Part 1. Theoretical foundation. *J. Fluid Mech.* 271, 285–309.
- Latt, J. & Chopard, B. (2006). Lattice Boltzmann method with regularized pre-collision distribution functions. *Math. Comput. Simul.* 72, 165–168.
- Qian, Y. H., d'Humières, D. & Lallemand, P. (1992). Lattice BGK models for Navier–Stokes equation. *Europhys. Lett.* 17, 479–484.
- Wen, B., Zhang, C., Tu, Y., Wang, C. & Fang, H. (2014). Galilean invariant fluid–solid interfacial dynamics in lattice Boltzmann simulations. *J. Comput. Phys.* 266, 161–170.
