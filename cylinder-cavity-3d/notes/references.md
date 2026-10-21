# References for the 3D spinning-cylinder LBM / FV teaching page

Status key: items marked **UNCONFIRMED** have no formula text found in a retrieved source. Bibliographic details marked UNCONFIRMED were not seen in a retrieved source.

## 1. D3Q19, c_s², second-order equilibrium, BGK viscosity

- Weights (found in several sources): $w_0 = 1/3$, $w_{1..6} = 1/18$ (axial), $w_{7..18} = 1/36$ (diagonal); $c_s^2 = 1/3$ (lattice units).
- Second-order equilibrium: $f_i^{eq} = w_i\rho\left[1 + \frac{\mathbf{c}_i\cdot\mathbf{u}}{c_s^2} + \frac{(\mathbf{c}_i\cdot\mathbf{u})^2}{2c_s^4} - \frac{\mathbf{u}\cdot\mathbf{u}}{2c_s^2}\right]$ (form found in a source; exact equation number not recorded).
- Viscosity: $\nu = c_s^2(\tau - \tfrac12)\Delta t$. Only found as code (`nu = cs2*(tau-0.5)`); the explicit $\Delta t$ form is **UNCONFIRMED** in a paper.
- Sources: weights and $c_s^2$ from [arXiv 2603.15992](https://arxiv.org/pdf/2603.15992) and [arXiv 1803.04937](https://arxiv.org/pdf/1803.04937) (the latter notes D3Q19 Galilean-invariance deficiencies); no single primary paper retrieved. Primary: Qian, d'Humières, Lallemand, EPL 17 (1992), 479–484 — **UNCONFIRMED** (not retrieved).

## 2. Regularised collision (Latt & Chopard 2006)

- Formula: $\Pi^{neq}$ is the second-order moment of $f^{neq}$, projected onto the second-order Hermite polynomials; sum over $i$ of $H^{(2)}_{i}(f_i - f_i^{eq})$. Explicit equation **UNCONFIRMED** (no paper text retrieved).
- Variables: $\Pi^{neq}_{\alpha\beta} = \sum_i c_{i\alpha}c_{i\beta}(f_i - f_i^{eq})$ (standard definition; **UNCONFIRMED** from a source).
- Source: C. Latt, B. Chopard, "Lattice Boltzmann method with regularized pre-collision distribution functions", *Math. Comput. Simul.* 72 (2006) 165–168, DOI [10.1016/j.matcom.2006.05.017](https://doi.org/10.1016/j.matcom.2006.05.017). Preprint: [arXiv physics/0506157](https://arxiv.org/abs/physics/0506157) (not read in full).
- Caveat (from a review): the second-order projection reduces the stability domain relative to SRT. Recursive variant: Coreixas et al., [arXiv 1704.04413](https://ar5iv.arxiv.org/html/1704.04413).

## 3. D3Q19 MRT (d'Humières et al. 2002)

- Shear viscosity from the shear-moment rate: $\nu_f = \tfrac13\left(\tfrac{1}{s_v} - \tfrac12\right)$; bulk viscosity from the energy-moment rate: $\nu_b = \tfrac29\left(\tfrac{1}{s_b} - \tfrac12\right)$ ([arXiv 2003.01490](https://arxiv.org/pdf/2003.01490)).
- Equivalent bulk form: $\frac{5-9c_s^2}{9}\left(\frac{1}{s_e}-\tfrac12\right)$, which equals $2/9$ at $c_s^2 = 1/3$ ([arXiv 1611.03329](https://arxiv.org/pdf/1611.03329)). The two sources use different labels for the bulk rate ($s_b$ vs $s_e$).
- Moment matrix $M$ and the rate values in the 2002 paper: **UNCONFIRMED** (paper not retrieved). Conserved moments (mass, momentum) have zero rate.
- Source: d'Humières, Ginzburg, Krafczyk, Lallemand, Luo, *Phil. Trans. R. Soc. A* 360 (2002) 437–451, per [TU Dresden musubi docs](https://geb.inf.tu-dresden.de/doxy/musubi/proc/mrt_d3q19.html). DOI: UNCONFIRMED.

## 4. Bouzidi, Firdaouss, Lallemand 2001 (interpolated bounce-back)

- Formulas for $q < 1/2$ and $q \ge 1/2$, and the moving-wall term: **UNCONFIRMED** (the retrieved secondary text describes the two regimes but gives no equation text).
- Structure as described: for $q<\tfrac12$ interpolate between $x_f$, $x_{ff}$, $x_{fff}$; for $q\ge\tfrac12$ stream first, then interpolate from the temporary point and two fluid nodes.
- Source: M. Bouzidi, M. Firdaouss, P. Lallemand, "Momentum transfer of a Boltzmann-lattice fluid with boundaries", *Phys. Fluids* 13(11) (2001) 3452–3459, DOI [10.1063/1.1399290](https://doi.org/10.1063/1.1399290). Free copy: not found.

## 5. Momentum-exchange force on moving boundaries

- Ladd 1994 moving-wall term $2w_q\rho\,\mathbf{c}_q\cdot\mathbf{u}_w/c_s^2$: **UNCONFIRMED** (formula not in retrieved text).
- Galilean-invariant link force (found): $\mathbf{F} = (\mathbf{e}_i - \mathbf{v})\tilde f_i(\mathbf{x}_f,t) - (\mathbf{e}_{\bar i} - \mathbf{v})\tilde f_{\bar i}(\mathbf{x}_b,t)$, with $\mathbf{v}$ the boundary velocity; total force and torque by summing over links. Source: [arXiv 1303.0625](https://arxiv.org/pdf/1303.0625) (authors not shown in the retrieved text; the 2014 Wen/Zhang/Fang attribution is **UNCONFIRMED**).
- Follow-up: Peng, Geneva, Guo, Wang, *Phys. Rev. E* 95 (2017) 013301, DOI [10.1103/PhysRevE.95.013301](https://doi.org/10.1103/PhysRevE.95.013301), argues the Galilean error also affects the force on the fluid.
- Ladd 1994: A. J. C. Ladd, "Numerical simulations of particulate suspensions via a discretized Boltzmann equation. Part 1. Theoretical foundation", *J. Fluid Mech.* 271 (1994) 285–309, preprint [arXiv comp-gas/9306004](https://arxiv.org/pdf/comp-gas/9306004.pdf). Part 2: *JFM* 271 (1994) 311–339, [arXiv comp-gas/9306005](https://arxiv.org/pdf/comp-gas/9306005).
- Mei et al. 2002: Mei, Yu, Shyy, Luo, "Force evaluation in the lattice Boltzmann method involving curved geometry", *Phys. Rev. E* 65 (2002) 041203, DOI 10.1103/PhysRevE.65.041203 (DOI from a secondary citation). Formula: **UNCONFIRMED**.

## 6. Refilling of fresh nodes

- Caiazzo 2008 and Lallemand & Luo 2003 refill formulas: **UNCONFIRMED** (no formula text retrieved).
- Caiazzo, "Analysis of lattice Boltzmann nodes initialisation in moving boundary problems", *Prog. Comput. Fluid Dyn.* 8 (2008). Paywalled; [Inderscience offer](https://www.inderscience.com/offer.php?id=18074). Author poster: [WIAS](https://wias-berlin.de/people/caiazzo/PAPERS/poster_ICMMES_08.pdf).
- Lallemand & Luo 2003 (J. Comput. Phys.): bibliographic details **UNCONFIRMED**.
- Comparison of Fang 2002, Lallemand & Luo 2003 and Caiazzo 2008 refills (force fluctuations): *Comput. Math. Appl.* (2016), citation **UNCONFIRMED**.

## 7. Chapman–Enskog to Navier–Stokes

- Source: T. Krüger, H. Kusumaatmaja, A. Kuzmin, O. Shardt, G. Silva, E. M. Viggen, *The Lattice Boltzmann Method: Principles and Practice*, Springer Graduate Texts in Physics (2017; copyright 2017, reprint ISBN 978-3-319-83103-9). Chapter/section numbers for the Chapman–Enskog derivation: **UNCONFIRMED** (table of contents seen only as "Part II, Analysis of the LB equation"). Free copy: not found.

## 8. Ekman and Bödewadt layers

- Ekman thickness: $\delta_E = \sqrt{\nu/\Omega}$ (found in lecture notes, [Warwick notes](https://text.www2.warwick.ac.uk/fac/sci/masdoc/people/studentpages/students2012/lindley/fluid_dynamics/atmosdynsupport6.pdf) and [UW Ocean 285](https://uw.pressbooks.pub/ocean285/chapter/ekman-pumping/)).
- Ekman pumping: $w_E = \tfrac12(\nu\Omega)^{1/2}\varepsilon$, where $\varepsilon\Omega$ is the geostrophic vorticity (Warwick notes, same source).
- Bödewadt layer (rotating fluid over a stationary disk): thickness formula **UNCONFIRMED**; retrieved rotor-stator work notes that laminar layer thickness is independent of radius ([arXiv physics/0607097](https://arxiv.org/pdf/physics/0607097)).
- Greenspan, *The Theory of Rotating Fluids* (CUP, 1968) and Schlichting, *Boundary-Layer Theory*: not retrieved; bibliographic details **UNCONFIRMED** beyond the titles.

## 9. Q-criterion and λ2

- Hunt, Wray, Moin 1988, "Eddies, streams, and convergence zones in turbulent flows", Proc. CTR Summer Program 1988, report CTR-S88, pp. 193–208 (citation from [EGU2018 abstract](https://meetingorganizer.copernicus.org/EGU2018/EGU2018-10738.pdf); NASA record [NTRS 19890015184](https://ntrs.nasa.gov/citations/19890015184)). Q definition as cited in secondary sources: $Q = \tfrac12\left(\|\boldsymbol\Omega\|^2 - \|\mathbf S\|^2\right)$ (norm convention **UNCONFIRMED**).
- Jeong, Hussain, "On the identification of a vortex", *J. Fluid Mech.* 285 (1995) 69–94, DOI [10.1017/S0022112095000462](https://doi.org/10.1017/S0022112095000462). Criterion: $\lambda_2 < 0$ for the middle eigenvalue of $\mathbf S^2+\mathbf\Omega^2$ (eigenvalue ordering differs between sources; check convention). Threshold 0 is noted as over-sensitive in a later paper.

## 10. Rayleigh circulation criterion and Taylor–Couette

- Criterion: instability for axisymmetric inviscid disturbances if $\frac{d(r u_\theta)^2}{dr} < 0$ (the form in the query; confirmed as the circulation form in a secondary source). Rayleigh discriminant $\phi = \frac{1}{r^3}\frac{\partial(r^4\Omega^2)}{\partial r}$ is "usually written" this way in a secondary summary; primary **UNCONFIRMED**.
- Source: Chandrasekhar, *Hydrodynamic and Hydromagnetic Stability* (1961): not retrieved; details **UNCONFIRMED**. Background: [arXiv physics/0603177](https://arxiv.org/pdf/physics/0603177) (general stability criteria for inviscid rotating flow).

## 11. 2D turbulence and 3D Kolmogorov

- Kraichnan 1967 (*Phys. Fluids* 10, 1417): not retrieved; bibliographic details **UNCONFIRMED**.
- Spectra found in secondary sources: inverse energy range $E(k)\propto k^{-5/3}$ (supported by a DNS result); direct enstrophy range $E(k)\propto k^{-3}$ (formal, nonlocal, log corrections needed). Direct enstrophy cascade is contested; a 2012 APS abstract reports $k^{-2}$ in forced runs ([APS DFD 2012](https://meetings-archive.aps.org/dfd/2012/e13/3)). Review: [arXiv 2211.12918](https://arxiv.org/pdf/2211.12918).
- Vanishing of vortex stretching in 2D: standard background, **UNCONFIRMED** by a retrieved source.
- Kolmogorov 1941 $E(k) = C\varepsilon^{2/3}k^{-5/3}$: not retrieved; **UNCONFIRMED**.

## 12. Cylinder-wake 3D instability and rotating cylinders

- Williamson 1996, *Annu. Rev. Fluid Mech.* 28: 477–539 (not retrieved; details **UNCONFIRMED**). Figures from secondary sources: Mode A onset $Re \approx 190$ (Re$_{c}$ = 194 in one study), $\lambda_A \approx 3.96D$; Mode B onset $Re \approx 260$ (Floquet), $\lambda_B \approx 0.8D$ (**not** 1D as in the query); switch between modes $230 \le Re \le 260$ (Williamson experiments). Papers: [Monash FLAIR](https://flair.monash.edu/publications/pdfs/RyThHo05_jfm.pdf).
- Rao, Leontini, Thompson, Hourigan, "Three-dimensionality in the wake of a rapidly rotating cylinder in uniform flow", *J. Fluid Mech.* 730 (2013) 379–391, DOI [10.1017/jfm.2013.362](https://doi.org/10.1017/jfm.2013.362). Modes E, F (lower rotation, first steady state) and F′ (higher rotation, second steady state). [PDF](https://eng.monash.edu/lbe/Publications/2013/RaLeThHo_JFM_2013.pdf).
- Companion: Rao et al., "Three-dimensionality in the wake of a rotating cylinder in a uniform flow", *JFM* 717 (2013) 1–29 (title and details from a secondary citation). Radi et al., *JFM* 734 (2013): experimental confirmation.

## 13. Circular Couette torque

- $T = \dfrac{4\pi\mu\Omega R_1^2R_2^2}{R_2^2-R_1^2}$ (per unit length). Checked by hand: $v = Ar + B/r$, no-slip gives $B = \Omega R_1^2R_2^2/(R_2^2-R_1^2)$, shear stress $\tau_{r\theta} = -2\mu B/r^2$, torque $= 2\pi r^2 |\tau_{r\theta}| = 4\pi\mu B$. Consistent with a [Bristol problem sheet](https://people.maths.bris.ac.uk/~maajh/afluids/sheet3.pdf) and an [eng-tips post](https://www.eng-tips.com/threads/friction-concentric-rotating-cylinders.221149/post-1115429) (the post mislabels $\mu$ as kinematic viscosity). Valid for laminar flow with stationary outer cylinder, no end effects.

## 14. 2D Taylor–Green vortex

- Decay rate $\exp(-2\nu k^2 t)$ for wavenumber $k$: found in a source as $e^{-2\kappa^2 t/Re}$ on $[0,2\pi]^2$ periodic, consistent with $k=1$ giving $\exp(-2\nu t)$ ([Wikipedia](https://en.wikipedia.org/wiki/Taylor%E2%80%93Green_vortex); [Nektar tutorial](https://doc.nektar.info/tutorials/5.3.0/incns/taylor-green-vortex/incns-taylor-green-vortex.pdf)).
- Exact velocity pair and pressure (e.g. $u = \sin x\cos y\,e^{-2\nu t}$, $v = -\cos x\sin y\,e^{-2\nu t}$): **UNCONFIRMED** sign and component convention.
- Original: G. I. Taylor, A. E. Green, *Proc. R. Soc. A* 158 (1937): **UNCONFIRMED** (not retrieved).

## 15. Brinkman volume penalisation

- Angot, Bruneau, Fabrie, "A penalization method to take into account obstacles in incompressible viscous flows", *Numer. Math.* 81 (1999) 497–520, DOI [10.1007/s002110050401](https://doi.org/10.1007/s002110050401). Abstract: $L^2$ penalisation gives Darcy in the solid; $H^1$ penalisation gives Brinkman; error estimates derived. Free PDF listed (not opened): [math.u-bordeaux.fr](https://www.math.u-bordeaux.fr/~chabrune/publi/ABF-NM.pdf).
- Error rate $O(\sqrt{\eta})$ (with $\eta$ the penalty parameter): **UNCONFIRMED** in the retrieved text. Penalisation equation and the penalty form: **UNCONFIRMED**.

## UNCONFIRMED items (summary)

- Item 1: explicit $\nu = c_s^2(\tau-\tfrac12)\Delta t$ in a paper; Qian et al. 1992 details.
- Item 2: Latt–Chopard $\Pi^{neq}$ equation.
- Item 3: MRT moment matrix and 2002 rate values; DOI.
- Item 4: Bouzidi $q<\tfrac12$ and $q\ge\tfrac12$ formulas; moving-wall term.
- Item 5: Ladd 1994 moving-wall force term; Wen/Zhang/Fang 2014 attribution of the Galilean-invariant formula; Mei 2002 formulas.
- Item 6: Caiazzo 2008 and Lallemand & Luo 2003 refill formulas; the 2016 comparison citation.
- Item 7: Krüger et al. chapter/section numbers for Chapman–Enskog.
- Item 8: Bödewadt thickness formula; Greenspan and Schlichting bibliographic details.
- Item 9: Q-criterion norm convention.
- Item 10: Rayleigh discriminant primary source; Chandrasekhar details.
- Item 11: Kraichnan 1967 details; vortex-stretching statement; Kolmogorov 1941.
- Item 12: Williamson 1996 bibliographic details; Mode B wavelength (sources give ~0.8D, not ~1D).
- Item 14: Taylor–Green velocity and pressure pair; Taylor–Green 1937 details.
- Item 15: $O(\sqrt{\eta})$ error rate; penalisation equations.
