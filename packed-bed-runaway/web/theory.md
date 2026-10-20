## 1. The physical picture

A multitubular fixed-bed reactor is a bundle of narrow tubes packed with catalyst and
surrounded by a coolant (often molten salt) at temperature $T_c$. A strongly exothermic
reaction, here the partial oxidation of o-xylene to phthalic anhydride, releases heat
faster than it can leave through the tube wall. The temperature therefore climbs to a maximum, the
**hot spot**, a short distance into the bed. Further down, the reactant is depleted and the coolant wins,
so the temperature falls again.

The reaction rate grows exponentially with temperature (Arrhenius), and that exponential
feedback is what makes the hot spot dangerous. If the feed is a little richer or the coolant a
little hotter, the hot spot can grow from tens of kelvin to hundreds. That jump is **runaway**: catalyst
damage, loss of selectivity (here, total combustion to CO₂), and a safety hazard. Near the
boundary the hot-spot temperature is **parametrically sensitive**: a tiny change in an
input produces a large change in the output. This page computes that sensitivity directly
and maps it over the operating conditions.

## 2. The 2D pseudo-homogeneous model

The model rests on four assumptions:

1. **Steady state.**
2. **Pseudo-homogeneous.** Gas and catalyst share one temperature and composition locally, so there are no interphase gradients.
3. **Plug flow with radial dispersion.** The superficial mass flux $G$ is uniform over the cross-section. Mixing in the radial direction is described by effective transport coefficients:
   - an effective radial conductivity $\lambda_{er}$ and dispersivity $D_{er}$, which lump conduction through the solid, the gas and radiation;
   - a wall coefficient $\alpha_w$, which captures the extra resistance next to the wall where the packing is looser.
4. **Axial dispersion neglected.** For beds many particle diameters long it is small.

Consider a ring of radius $r$, thickness $dr$ and length $dz$. Balancing convection in and out, radial
dispersion in and out, and generation by reaction gives:

$$
\frac{G}{M_m}\frac{\partial y}{\partial z} = \frac{\rho_g D_{er}}{M_m}\,\frac{1}{r}\frac{\partial}{\partial r}\!\left(r\frac{\partial y}{\partial r}\right) - \rho_B\, r_A(p, T)
$$

$$
G c_p \frac{\partial T}{\partial z} = \lambda_{er}\,\frac{1}{r}\frac{\partial}{\partial r}\!\left(r\frac{\partial T}{\partial r}\right) + (-\Delta H)\,\rho_B\, r_A(p, T)
$$

- $y = p/P$ is the reactant mole fraction and $P = 1$ atm.
- $\rho_B$ is the catalyst bulk density.
- The rate per kilogram of catalyst is Froment's pseudo-first-order law, with a large excess of oxygen ($p_{O_2}$ constant):

$$
r_A = k(T)\,p\,p_{O_2}, \qquad k(T) = \exp\!\left(\ln A - \frac{E/R}{T}\right)
$$

The boundary conditions are:
- **Inlet** ($z = 0$): $T = T_{in}$, $p = p_0$.
- **Axis** ($r = 0$): symmetry, $\partial/\partial r = 0$.
- **Wall** ($r = R$): no mass flux, and the heat conducted to the wall equals the heat passed to the coolant:

$$
-\lambda_{er}\left.\frac{\partial T}{\partial r}\right|_{R} = \alpha_w\,(T_R - T_c).
$$

## 3. Dimensionless form

The scaled variables are $\xi = z/L$, $\rho = r/R$, the conversion $x = 1 - p/p_0$, and the
**Frank-Kamenetskii temperature**:

$$
\theta = \gamma\,\frac{T - T_0}{T_0}, \qquad \gamma = \frac{E}{R\,T_0}, \qquad T_0 = T_{in}.
$$

This choice of $\theta$ makes the Arrhenius factor exact and compact. Since $T/T_0 = 1 + \theta/\gamma$,

$$
\frac{k(T)}{k(T_0)} = \exp\!\left[\gamma\left(1 - \frac{T_0}{T}\right)\right] = \exp\!\left(\frac{\theta}{1 + \theta/\gamma}\right) \;\xrightarrow{\;\gamma\to\infty\;}\; e^{\theta}.
$$

One unit of $\theta$ is about $T_0^2 R/E$, roughly 29 K for o-xylene: the temperature rise that multiplies the
rate by $e$. Substituting gives

$$
\frac{\partial x}{\partial \xi} = a_m\,\nabla_\rho^2 x + Da\,r(x,\theta), \qquad
\frac{\partial \theta}{\partial \xi} = a_h\,\nabla_\rho^2 \theta + S\,Da\,r(x,\theta),
$$

$$
r(x,\theta) = (1 - x)\,\exp\!\left(\frac{\theta}{1 + \theta/\gamma}\right), \qquad
\nabla^2_\rho = \frac{1}{\rho}\frac{\partial}{\partial\rho}\rho\frac{\partial}{\partial\rho},
$$

with wall condition $\partial\theta/\partial\rho = -Bi\,(\theta - \theta_w)$ at $\rho = 1$. The groups are:

| group | definition | meaning |
|---|---|---|
| $\gamma$ | $E/(R T_0)$ | temperature sensitivity of the rate |
| $S$ | $\gamma\,\Delta T_{ad}/T_0$, with $\Delta T_{ad} = (-\Delta H)\,p_0/(P M_m c_p)$ | heat potential of the feed, in units of $\theta$ |
| $Da$ | $L\,M_m \rho_B P\, k(T_0)\, p_{O_2}/G$ | reaction speed at the inlet relative to throughput |
| $a_h$ | $\lambda_{er} L/(G c_p R^2)$ | radial conduction relative to axial convection |
| $a_m$ | $D_{er} L/(u R^2)$ | radial mass dispersion relative to axial convection |
| $Bi$ | $\alpha_w R/\lambda_{er}$ | bed conduction resistance relative to wall resistance |
| $\theta_w$ | $\gamma (T_c - T_0)/T_0$ | coolant temperature |

The **heat-of-reaction coefficient** $S\,Da$ follows from dividing the energy balance by
$G c_p T_0/(\gamma L)$ and using $p = p_0 (1 - x)$. The feed partial pressure appears **only in S**: doubling $p_0$
doubles the heat released per unit conversion.

## 4. The 1D model and the link to 2D

When radial gradients are ignored, one cross-sectional average temperature remains, and the
wall resistance and bed resistance combine into one overall coefficient $U$:

$$
\frac{d\theta}{d\xi} = S\,Da\,r(x,\theta) - St\,(\theta - \theta_w), \qquad
St = \frac{2UL}{R\,G\,c_p}, \qquad
\frac{1}{U} = \frac{1}{\alpha_w} + \frac{R}{4\lambda_{er}}.
$$

The term $R/(4\lambda_{er})$ comes from the conduction resistance of a cylinder with a uniformly
distributed heat source: the parabolic radial profile has a mean-to-wall difference of
$q R^2 /(8 \lambda_{er})$ per unit volumetric source $q$. It is the standard 1D–2D
correspondence.

**Why 2D runs hotter.** In the 2D model heat released at the axis must first cross the bed
by conduction before the wall can remove it. The axis therefore runs hotter than the radial average that the
1D model tracks. Because the rate is exponential in temperature, the hotter core reacts faster still.
The 2D model thus predicts higher hot spots and runaway at milder conditions than the 1D
model with the "equivalent" $U$. The difference grows with $Bi$ and with tube diameter.

## 5. Method of lines: finite volumes in the radius

The axial coordinate behaves like time: information only travels downstream. We therefore
discretize **only** $\rho$ and integrate the resulting ODE system in $\xi$. This is the
*method of lines*.

Divide $0 \le \rho \le 1$ into $N$ annular cells of width $d = 1/N$. Cell $i$ has faces
$\rho_w = i\,d$ and $\rho_e = (i+1)\,d$ and area per radian $V_i = (\rho_e^2 - \rho_w^2)/2$.
Integrating $\nabla^2_\rho u$ over the cell turns it into a difference of fluxes. This step is exact; only
the face gradients are approximated:

$$
\int_{\rho_w}^{\rho_e} \frac{1}{\rho}\frac{\partial}{\partial\rho}\Big(\rho\frac{\partial u}{\partial \rho}\Big)\rho\,d\rho
= \Big[\rho \frac{\partial u}{\partial\rho}\Big]_{\rho_w}^{\rho_e}
\;\Rightarrow\;
(\nabla^2 u)_i \approx \frac{1}{V_i}\left[\rho_e\frac{u_{i+1}-u_i}{d} - \rho_w \frac{u_i - u_{i-1}}{d}\right].
$$

- **Axis.** The innermost face has $\rho_w = 0$, so the flux vanishes there automatically. Symmetry is built in,
  and there is no $1/\rho$ singularity to treat.
- **Wall.** The wall temperature $\theta_R$ is an unknown that lives half a cell from the last
  centre. Writing $\partial\theta/\partial\rho \approx (\theta_R - \theta_{N-1})/(d/2)$ and equating to
  $-Bi(\theta_R - \theta_w)$ eliminates $\theta_R$:

$$
\rho\frac{\partial \theta}{\partial\rho}\Big|_{1} = -Bi_{\text{eff}}\,(\theta_{N-1} - \theta_w), \qquad
Bi_{\text{eff}} = \frac{Bi}{1 + Bi\,d/2}.
$$

The scheme is conservative, meaning the heat leaving one cell enters the next, and it is second-order accurate.
The test suite checks the order on a grid sequence and compares with the exact Bessel-series
solution for cooling without reaction.

## 6. Why the system is stiff, and the Rosenbrock method

Stacking the unknowns as $y = [x_0, \theta_0, x_1, \theta_1, \dots]$ gives
$dy/d\xi = f(y)$ with $2N$ equations. The Jacobian $J = \partial f/\partial y$ has two kinds of entries:
- **Dispersion.** It couples each cell to its neighbours with entries of order $a_h N^2$, which is large for fine grids.
- **Reaction.** It couples $x$ and $\theta$ within a cell through $\partial r/\partial\theta \propto e^{\theta}$, which becomes enormous at the hot spot.

The eigenvalues of $J$ therefore span many orders of magnitude, and the problem is **stiff**. An explicit method
would need $h \lesssim 2/|\lambda_{max}|$ everywhere, even where nothing is happening.

A **Rosenbrock method** is an implicit Runge–Kutta method linearized once per step. Each
stage solves a linear system with the same matrix $W = I - h\,d\,J$, so there are no Newton iterations. We use the
two-stage, order 2 method with an embedded order-3 error estimate of Shampine & Reichelt
(MATLAB's `ode23s`), with $d = 1/(2+\sqrt2)$ and $e_{32} = 6+\sqrt2$:

$$
\begin{aligned}
W k_1 &= f(y_n)\\
W (k_2 - k_1) &= f\!\left(y_n + \tfrac12 h k_1\right) - k_1\\
y_{n+1} &= y_n + h\,k_2\\
W k_3 &= f(y_{n+1}) - e_{32}\left(k_2 - f(y_n + \tfrac12 h k_1)\right) - 2\left(k_1 - f(y_n)\right)\\
\text{err} &= \tfrac{h}{6}\,(k_1 - 2k_2 + k_3).
\end{aligned}
$$

The step is accepted if $\max_i |\text{err}_i|/(\text{atol} + \text{rtol}\,|y_i|) \le 1$. The next step is
$h \leftarrow h\cdot\min(5, \max(0.2, 0.8\,\text{err}^{-1/3}))$. Near the hot spot the steps shrink
automatically to resolve the steep front, and afterwards they grow again.

With interleaved unknowns $W$ is **block-tridiagonal** with $2\times2$ blocks: reaction within a
cell, dispersion to the two neighbours. Block Gaussian elimination (block Thomas) solves
it in $O(N)$ operations instead of $O(N^3)$. Python uses LAPACK's banded solver for the same
structure (bandwidth 2).

## 7. Locating the hot spot

The peak almost never falls exactly on an accepted step. Between steps $n$ and $n+1$ we know both the
values $\theta_n$ and the slopes $\theta'_n = f_\theta(y_n)$, so the solution there is a cubic
Hermite polynomial. We maximize it analytically by finding where its derivative, a quadratic, has a root. A plain
parabola through three samples fails at the sharp "corner" a runaway hot spot develops,
where the slope jumps from very large to slightly negative.

For the *sensitivity* of the peak we use the **envelope theorem**. At the maximum,
$\partial\theta/\partial\xi = 0$, so

$$
\frac{d\theta^*}{d\phi} = \frac{d}{d\phi}\,\theta\big(\xi^*(\phi);\phi\big)
= \underbrace{\frac{\partial\theta}{\partial\xi}\Big|_{\xi^*}}_{=0}\frac{d\xi^*}{d\phi} + \frac{\partial \theta}{\partial \phi}\Big|_{\xi^*}
= \frac{\partial \theta}{\partial \phi}\Big|_{\xi^*}.
$$

The peak location can therefore be frozen when differentiating.

## 8. Parametric sensitivity

The **normalized sensitivity** of an output $y$ (here the hot-spot temperature) to an input
$\phi$ is

$$
s(y;\phi) = \frac{\phi}{y}\,\frac{\partial y}{\partial \phi} = \frac{\partial \ln y}{\partial \ln \phi},
$$

the percentage change of $y$ per percentage change of $\phi$. It is dimensionless and comparable across
inputs.

**Sensitivity equations.** Differentiating the model $y' = f(y,\phi)$ with respect to $\phi$ gives a
linear ODE for $w = \partial y/\partial\phi$:

$$
w' = J(y)\,w + \frac{\partial f}{\partial \phi}, \qquad w(0) = \frac{\partial y(0)}{\partial\phi}.
$$

Near runaway $J$ has a large positive eigenvalue, from the reaction feedback outrunning cooling.
$w$ is then amplified exponentially, and that amplification is the sensitivity.

**Three ways to compute $\partial\theta^*/\partial\phi$** (all three are on this page):

1. **Finite differences** (the Python code): $[\theta^*(\phi+h) - \theta^*(\phi-h)]/2h$. This needs two extra
   solves. It is also fragile exactly where it matters: a large $h$ smears the steep curve, while a small $h$
   amplifies the solver's tolerance noise, of relative size about $\text{rtol}/h$. The Python breakdown shows this
   V-shaped error.
2. **Sensitivity equations**, integrated alongside the model.
3. **Forward-mode automatic differentiation** (the Rust code). Every number carries a second
   component, $v + \dot v\,\varepsilon$ with $\varepsilon^2 = 0$, and every arithmetic operation applies the chain
   rule exactly:
   $(a + \dot a\varepsilon)(b + \dot b \varepsilon) = ab + (\dot a b + a \dot b)\varepsilon$ and
   $e^{a + \dot a\varepsilon} = e^a + \dot a e^a \varepsilon$.

   Seeding the chosen input with $\dot\phi = 1$ and running the *same* Rosenbrock code once yields the exact
   derivative of the discrete solution. This is equivalent to option 2, because the dual parts satisfy the
   discretized sensitivity equations, but with no extra code. Two details make it accurate:
   - the step sizes are plain numbers, so they are not differentiated;
   - the error test also checks the derivative parts (scaled by their largest component), so the
     sensitivities are resolved as well as the solution.

## 9. Using the page

- **App → Hot spot**: the 2D temperature and conversion fields for the sidebar inputs, with axial
  and radial profiles and the 1D model for comparison.
- **App → Sensitivity sweep**: $T^*$ and $s$ along one input, for the 2D and the 1D model.
- **App → Sensitivity map**: $\log_{10}|s|$ and $T^*$ over coolant temperature × feed partial pressure,
  with the operating point.

## References

- G. F. Froment, *Fixed bed catalytic reactors – current design status*, Ind. Eng. Chem. 59(2), 18–27 (1967).
- G. F. Froment, K. B. Bischoff, J. De Wilde, *Chemical Reactor Analysis and Design*, 3rd ed., Wiley (2011), Ch. 11.
- D. A. Frank-Kamenetskii, *Diffusion and Heat Transfer in Chemical Kinetics*, 2nd ed., Plenum (1969).
- L. F. Shampine, M. W. Reichelt, *The MATLAB ODE suite*, SIAM J. Sci. Comput. 18, 1–22 (1997).
