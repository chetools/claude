# Independent numerics review: fv3d.py and lbm3d.py

No authors' files were edited. All scripts are `verify_*.py` here (plus `vcommon.py` and `annulus.py`); raw output is in `out/`.

**Which LBM version was run.** `lbm3d.py` (md5 e5cc73ee...) carries `mass_correction` (file mtime 12:01). All LBM runs below were started after that, so they use the corrected code. I read the code before the correction landed, so the review of `step()` is from the older text. The correction itself is a uniform `f_0 += delta` on fluid nodes. I only checked it for spanwise uniformity (check 6, exactly 0) and not for any other effect.

Machine was shared, so N=128 runs exist only for the 2D cases.

## Summary: BUG / DISCREPANCY items (most important first)

1. **DISCREPANCY (major): FV body is hydrodynamically about 2 cells too large, so torque, energy and swirl are badly wrong at N <= 128.**
   - Case: centred spin, Re=100, t=5, exact azimuthal solution computed independently (`annulus.py`). Exact torque -0.002881.
   - FV torque error: +299% (N=32), +92% (N=64), +34% (N=128). Observed order about 1.85 between 64 and 128, but the error is still large.
   - Effective radius from the torque: R+2.7h, R+2.2h, R+1.8h. From the centre-line profile: R+2.0h, R+1.9h, R+1.7h.
   - Cause: direct forcing `u = u* + chi (ub - u*)` is applied every step. Wherever chi is larger than about dt/(h^2/nu), that region behaves as rigid. That is chi > 0.02, i.e. up to about 2.3h beyond the tanh centre. The extension is rigid rotation Omega*r, so the speed overshoots: max |v| is 1.27 / 1.13 / 1.06 at N = 32 / 64 / 128, against 1 for the body.
   - LBM at the same cases: +5.8%, +0.5%, +0.2% (profile error 0.0052 at N=128, FV 0.235).
   - Not an FV-only artefact of 3D: the Nz=1 case is bit-identical to ns2d (authors' test), so ns2d has the same property.
   - Fix options: (a) shrink the mask: use R_mask = R - c h with c about 1.7-2, or a narrower tanh. (b) Compute torque from the stress at a contour. (c) At least tell users that FV results converge only at first order and quote the N=128 errors. The theory page says "smeared over about two cells". It should state the hydrodynamic radius excess and the torque error.
2. **DISCREPANCY (major): cross-method E(t) and T(t) differ strongly in the spin+orbit case (Re=100, Us=Uo=1, ro=0.2, t=2).**
   - E(2): FV 0.377 / 0.266 / 0.209 for N = 32 / 64 / 128. LBM 0.172 / 0.159 / 0.156.
   - FV/LBM ratio: 2.19, 1.67, 1.34. FV differences between successive N are -0.111, -0.057 (first order). Extrapolating FV gives about 0.152, consistent with LBM's 0.156. So they agree in the limit; the LBM is the closer one at finite N.
   - Torque at t=1: FV -0.0248 / -0.0091 / -0.0050. LBM -0.0023 / -0.0033 / -0.0031 (noisy). Fixed-time ratio FV/LBM at N=128: 1.4 to 2.3.
3. **BUG (integration): `run()` histories lose quantities.**
   - `lbm3d.run` uses `diagnostics.summary`, which reads `s["torque"]` and `s["maxdiv"]`. Neither solver ever stores them, so every LBM history row has `torque = NaN` and `maxdiv = NaN`. Shown by running `lbm3d.run(p,200,every=100)`.
   - `fv3d.run` default uses `stats()`, which has no Z or E3d.
   - Any page code that goes through `diagnostics.summary` with either solver gets NaN torque.
   - Fix: in `step()` (or `run`) set `s["torque"] = torque(s,p)`, and for FV also `s["maxdiv"]`.
4. **DISCREPANCY: LBM torque in the orbit case is noise-dominated.**
   - Scatter about a smooth cubic trend on t in [0.5, 2]: 216% of the mean (N=32), 63% (N=64). Torque changes sign at times (max +0.012 at N=32).
   - The spin-only torque is smooth after t = 0.25. The noise comes from the moving boundary: link changes and refill.
   - At the impulsive start (t = 0.1) LBM torque is wrong by -107% (N=32) and -14% (N=128).
   - Fix: low-pass filter or time-average the torque before display, and do not show the first ~0.25 time units.
5. **DISCREPANCY: LBM torque accuracy depends on tau (low Re).**
   - Test: Re=1 steady spin. Torque is bracketed rigorously by the circular-annulus formula with outer radius 0.5 and 0.7071 (the square lies between them; Stokes torque is monotone in the domain). Bracket |T| = 0.2565 to 0.2618.
   - LBM with default u_lb = 0.05: |T| = 0.2343 (N=32, tau=1.46, 10.5% under the upper bound) and 0.2413 (N=64, tau=2.42, 7.8% under).
   - LBM with u_lb = 0.0125 at N=64 (tau=0.98): 0.2567, inside the bracket. u_lb = 0.025 at N=32 (tau=0.98): 0.2502, 2.5% below the lower bound.
   - With dt proportional to h, tau grows with N at fixed Re, so refining at low Re does not converge to the bracket with u_lb = 0.05.
   - Fix: choose u_lb = min(0.05, Umax/(6 nu N)), which keeps tau <= 1. I tested only the two points above; I did not sweep Re.
   - FV at Re=1: |T| = 0.559 (N=32), 0.392 (N=64), i.e. +114% and +50% over the bracket upper end (item 1).
6. **DISCREPANCY (design): the 3D seed differs hugely between methods.**
   - FV projects it, so the initial E3d is 7.8e-9 (Nz=16, N=32). LBM sets the equilibrium without projection, so E3d is 2.3e-7 (30x larger, 1400x in Ew for Nz=8), mostly acoustic.
   - For Nz=8 and Nz=4, M = Nz/2 is the z-Nyquist mode. In LBM that mode does not decay: E3d plateaus at 3.8e-8 at t=1, against 1.3e-10 in FV.
   - For Nz=16, LBM Ew oscillates (acoustic, about 0.5e-9 to 3e-9) up to t about 0.5. After t about 0.8 the kz=1 energy agrees within 25% (2.8e-9 LBM vs 3.5e-9 FV).
   - Fix: project the LBM seed (impose a solenoidal w, e.g. by a Poisson solve or by choosing a seed with dw/dz-free structure), or limit M < Nz/2 and say that 3D diagnostics in LBM carry an acoustic floor.
7. **DISCREPANCY (definition): E and Z include the body interior.**
   - Z_total = 9.73 (FV) and 6.52 (LBM) at t=2 in the spin case, of which the rigid body is 2*pi*Omega^2*R^2 = 6.28. Fluid enstrophy is 3.72 (FV) and 1.06 (LBM).
   - The rigid body adds E = 0.00785 (spin only).
   - The page's budget `dE/dt = P_in - 2 nu Z` with Z over the whole box is off by -29% of P_in (FV) and -10% (LBM) at late times in the spin case (check 4).
8. **Test-coverage gaps (OK solvers, weak tests).**
   - `lbm3d.torque()` and `force()` (sign and unit conversion) are not called by any exact-solution test. `annulus_torque` redoes the conversion by hand. Mutations "sign flipped" and "dropped /Nz" were MISSED. I verified `torque()` independently: sign negative, N=64 error 0.49% (check 2).
   - FV has no exact-solution test of the body or torque at all. Torque and mask mutations were caught only by the Nz=1 == ns2d comparison, which cannot detect an error shared with ns2d (item 1).
   - 3 to 6% tolerances miss errors of 2 to 3%: cut-point velocity, cut-point torque arm, and dropping the moving-boundary correction all passed.

Not a problem: spanwise uniformity (exactly 0), Nz scaling of the torque, torque sign (negative for counter-clockwise spin), Ekman direction, and the seed decaying at low Re.

## Check 1: are the authors' exact solutions and tolerances right? (`verify_mutation.py`)

Derived independently:
- w = sin(pi x) sin(pi y) exp(-2 pi^2 nu t): correct (u = v = 0, no advection, zero pressure).
- Taylor-Green decay exp(-2 nu k^2 t) and its pressure: correct.
- Sine decay in a channel: correct.
- Annular Couette torque -4 pi nu Omega R^2 R2^2/(R2^2-R^2): correct. I re-derived u_theta = Omega R^2 (R2^2/r - r)/(R2^2-R^2). `annulus.py` reproduces the formula at steady state to 1e-5.
- D3Q19 with Nz=1 equals D2Q9: fine.

Mutation test: one bug planted at a time in a copy of the solver, loaded into the authors' own test functions.

LBM (annulus N=32 at 6%, N=64 cuts at 3%, co-moving force-free, Taylor-Green):

| Mutation | Result |
|---|---|
| moving-wall term x2 (+106% torque) | caught |
| s>=1/2 branch term wrong (+11.7%) | caught |
| Bouzidi weights swapped (+11%) | caught |
| viscosity +5% (+7.4%) | caught |
| wall velocity at the node (+2.3%) | **MISSED** |
| torque arm at the node (+2.3%) | **MISSED** |
| no Wen correction (+2.7%) | **MISSED** |
| torque sign flipped | **MISSED** |
| torque unit /Nz dropped | **MISSED** |

The unmutated N=32 torque is already +2.4% off (the tolerance is 6%).

FV (7 mutations): all caught (torque x1.1; mask radius +10%; mask width 2h; z-viscous x2; z upwind sign; free-slip z-wall ghost; AB2 coefficient). The first three are caught only by `nz1==ns2d`, plus the Ekman symmetry test for the width change. Seen from the output: the 3D-only mutations are caught by `swap y-z`.

Other gaps:
- The FV exact test (w diffusion) covers only x,y diffusion of w, not advection or pressure.
- The LBM wall test (2% at N=8) is meaningful.

## Check 2: cross-method, 2D, Re=100 (`verify_runcase.py`, `verify_cross2d.py`, `annulus.py`)

Independent reference: the impulsively started rotating cylinder. The azimuthal flow is an exact NS solution at any Re, so I solved u_theta(r,t) by finite differences (time-converged to about 1e-5; outer radius 0.5 and 0.7071 give identical torque to 7 digits at t <= 5).

The torque history error for the spin case is in the table in item 1. Selected rows (error vs exact):

| t | FV 32 | FV 64 | FV 128 | LBM 32 | LBM 64 | LBM 128 |
|---|---|---|---|---|---|---|
| 1 | +347% | +104% | +39% | +6.0% | +0.5% | +0.4% |
| 5 | +300% | +92% | +34% | +6.0% | +0.7% | +0.5% |

Richardson on T(t=5): LBM 0.5, 0.2 % errors, extrapolated -0.002887 (exact -0.002881). FV observed order 1.85, extrapolated -0.00323, which is still 12% off the exact value. Order 1.85 is observed over only two coarse steps, so the extrapolation is uncertain. The FV extrapolation disagrees with exact by 12% (second-order extrapolation gives -0.003314). I did not establish what FV converges to.

LBM is the closer method. Centre-line v(x) at t=5, max error against exact for r > R+1.5h: LBM 0.047 / 0.018 / 0.005; FV 0.77 / 0.44 / 0.24.

Spin+orbit: tables in `out/cross2d_orbit.txt`. E agrees in the limit (item 2). No exact solution exists for this case, so I cannot say which torque is closer; the LBM trend is noisy.

## Check 3: Stokes regime, Re=1 (`out/stokes_summary.txt`)

Bracket |T| in [0.2565, 0.2618] (see item 5). LBM (default u_lb) and FV both fall outside it: LBM below, FV far above. LBM with smaller u_lb at N=64 falls inside. Steady state was reached in all runs (torque flat to 5 digits).

## Check 4: energy budget (`verify_energy.py`, N=64, Nz=1)

Residual fractions are (dE/dt - P_in + D)/P_in, with P_in = -(T*Omega + F.Uc).

Spin, late times (t about 1.1 to 1.9):

| Dissipation used | FV | LBM |
|---|---|---|
| D1 = 2 nu Z over the whole box (page formula) | -0.30 to -0.29 | -0.12 to -0.105 |
| D2 = 2 nu Z over cells with r > R | -0.64 to -0.66 | -0.72 to -0.77 |
| D3 = 2 nu int S:S over cells with r > R | -0.02 to +0.02 | +0.24 to +0.27 |

Integrated over t in [0.01, 1.99]:
- FV: residual -0.066 (D1) and -0.025 (D3), against E gain 0.0347 and int P 0.184.
- LBM: -0.0125 (D1) and +0.0138 (D3), against E gain 0.0114 and int P 0.082.

So the page's formula with whole-box Z gives different residuals in the two solvers, and what looks "closed" for LBM comes from the body-interior enstrophy offsetting a missing term. I did not resolve why D3 over-counts by about 25% in LBM (candidates: surface-cell gradients that mix solid and fluid nodes, and the sharp centre-based mask); that is unverified. The early transient (t < 0.1) has residuals of -0.4 to -0.6 in both.

Orbit (t up to 1.5): integral residual with D1 is -0.239 (FV, E gain 0.193) and -0.119 (LBM, E gain 0.089). LBM window values are dominated by the torque noise of item 4. The FV force includes the fictitious interior's inertia; it is perpendicular to Uc in steady orbit but not during the start.

The page statement "budget closes only approximately" is correct, but its size is not small: 10 to 30% of P_in at late times in the spin case with the page's definition.

## Check 5: Ekman pumping, walls (`verify_ekman.py`, spin, Re=100, t=1)

Theory: the rotating cylinder spins the fluid; the stationary end walls slow it, so near the end walls the radial pressure gradient exceeds centrifugal force and the fluid flows inward (Bodewadt-type layer). It then turns away from the wall along the cylinder (w > 0 in the lower half near the cylinder) and returns outward near mid-span, with w < 0 at larger r.

Both solvers show:
- u_r < 0 in the first cell above the end wall at all rings 0.10 < r < 0.40.
- w > 0 at z = Lz/4 for r in 0.10-0.18 (FV, N=32 and 64; LBM N=64 has w > 0 at the first two rings; LBM N=32 has mixed sign at tiny amplitudes).
- u_r > 0 at z = 0.27-0.28 Lz, and w antisymmetric about mid-span to 1e-16 (FV) / 1e-14 (LBM).

Magnitudes (max |w|, location about r = 0.15, 3 cells from the wall):

| N, Nz | FV | LBM |
|---|---|---|
| 32, 16 | 0.137 | 0.075 |
| 64, 32 | 0.100 | 0.063 |

The ratio FV/LBM shrinks from 1.8 to 1.6. The methods have not converged to each other; FV carries the larger swirl of item 1 (<u_theta> in the first ring about 1.1 vs 0.77 at mid-height). The boundary-layer thickness sqrt(nu/Omega) = 0.014 is under one cell at N=32 and about one cell at N=64, so neither is resolved. I did not compare against an analytic Ekman magnitude.

## Check 6: uniformity and seed (`verify_uniform.py`)

- seed=0, periodic Nz=4, spin+orbit, 500 steps, N=32: plane difference and |w| are exactly 0.00e+00 in both solvers (FV 1.6 time units, LBM 0.31 time units).
- seed=1e-3, Re=50: FV E3d decays initially (2.6e-9 to 1.3e-10 for Nz=8). For Nz=16, E3d falls to 38% of its initial value by t=0.3, then rises 29% in mode kz=1 (t = 0.3 to 0.63) and decays again. LBM E3d also falls (acoustic part first). See item 6 for magnitude differences. Nothing grows without bound.

## Check 7: code review

Read line by line; found no indexing, ghost-rule or sign errors beyond the items above. Specifics checked and OK:
- FV: periodic-w ghost "wrapface", `project` periodic wrap, z-face transporting velocities, `neighbour_count` for walls, torque sign (negative for counter-clockwise) and the `h^2/Nz` normalisation (Nz=1 vs Nz=4 torque agree to 1e-5 in FV, 5e-13 in LBM).
- LBM: Bouzidi branches, moving-wall term -6 w_q (c.u_w), momentum exchange with the moving-boundary correction, unit conversions h^4/dt^2/Nz, wall bounce-back indexing, c_z links skipped at z-walls.

Issues:
- FV `torque` uses the pre-projection velocity `us`; since the pressure has no moment on a circle this is fine, but it is the body-mask force and inherits item 1.
- FV peak speed exceeds the body speed (item 1).
- Both `run()` paths as in item 3.

## Not verified

- Mass-correction effect on accuracy (all LBM data are post-correction; I have no pre-correction comparison).
- Re dependence of the tau error in item 5 beyond the points listed.
- 3D (Nz > 1) accuracy against any exact solution, and span="walls" magnitudes.
- Spin+orbit torque against an exact value.
