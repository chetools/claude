# Facts for the theory writers (implementation as built, and measurements so far)

Every statement here was taken from the code or from a run; the source is given. Numbers marked
SCREENING come from the first LBM sweep (old seed, before the final code) and must NOT be quoted on the
page as final — the coordinator re-runs the presets and fills the TODO(measured) markers.

## Finite volumes (python/fv3d.py)
- Body mask changed from the 2D page's tanh: chi = clamp((R − r)/eps, 0, 1), eps = width·h, width = 1
  ("inner ramp": 0 for r ≥ R, 1 for r ≤ R − h). Penalisation as before (η → 0): u = u* + chi (u_b − u*).
  Reason (measured, notes/verify/out/cross2d_32_64.txt and the FV agent's table): with the tanh mask the
  torque on a centred spinning cylinder (Re = 100, t = 5) was +299 % / +92 % off the exact solution at
  N = 32 / 64 (hydrodynamic radius R + 2.0–2.7 h), because any chi > 0 applied every step locks the fluid.
  With the inner ramp: +7.5 % / −0.7 % / −2.9 % at N = 32 / 64 / 128 (not monotone).
- Torque: from the penalisation force chi (u_b − u*)/dt, summed over interior faces, per unit span.
- Red–black Gauss–Seidel coloured by (i + j) parity, identical in every z-plane (an (i+j+k) colouring
  seeded spanwise differences of 1.5e-5 by itself — measured — so it was replaced). Semi-coarsened
  multigrid: z coarsened together with x, y while nz ≥ 2.
- Explicit diffusion stability for AB2 in 3D: ν dt/h² < 1/12 (measured threshold ≈ 0.0833 with a
  checkerboard mode); the code uses fdiff = 0.05, combined dt = 1/(1/dt_cfl + 1/dt_diff), unchanged from 2D.
- Nz = 1 with mask="tanh" is bitwise identical to the 2D page's solver (tested).

## Lattice Boltzmann (python/lbm3d.py)
- D3Q19, default collision "reg" (regularised, Latt & Chopard 2006 form f_neq,q = w_q/(2c_s⁴) Q_q:Π_neq);
  "bgk" and "mrt" (d'Humières 2002 basis; rates: shear moments 1/τ, e 1.19, ε 1.4, q 1.2, π 1.4, m 1.98)
  available. Default chosen by measured stability (LBM agent table: reg finite in all 6 cases up to Re 3000;
  BGK failed once, MRT failed once).
- Lattice speed: u_lb = min(0.05, U_body_max/(6 ν N)) so that ν_lb ≤ 1/6, τ ≤ 1. Reason (measured,
  REPORT.md item 5): at Re = 1 the torque with τ > 1 fell below the rigorous bracket; with the rule it is at
  the lower edge at N = 64 (0.2564 vs bracket 0.2565–0.2618).
- Bouzidi interpolated bounce-back; moving-wall term g = −6 w_q (c_q·u_w) used in full for q < ½ and as
  g/(2q) for q ≥ ½ (Couette check: plain form gives wall speed 2q·u_w for q > ½). Cut fraction from the
  exact circle; links with c_z ≠ 0 use the same q as their (c_x, c_y) projection. Fallback when the second
  fluid node is missing: f*_q(x_f) used in its place.
- Momentum exchange (Wen et al. 2014 Galilean-invariant form, as recalled — citation not re-checked):
  ΔP = (c_q − u_w) f*_q(x_f) + (c_q + u_w) f_q̄(x_f, new); torque arm = cut point − body centre, u_w at the
  cut point; per unit span.
- Refill (after Caiazzo 2008, not re-checked): equilibrium at the body velocity at the node, density =
  mean of valid in-plane neighbours, plus their mean non-equilibrium part.
- Global mass correction (no literature source found; documented as such): δ = (n − Σ_fluid Σ_q f_q)/n,
  f_0 += δ on every fluid node, each step. Measured drift without it: linear, ~2–3e-6 per step for a
  spinning body (mostly from the interpolated bounce-back); with it mean density = 1 to 1e-16.
- Covered/uncovered-node momentum ("node exchange") was tried and did NOT reduce the torque noise; off.
- Torque noise when the body orbits (both methods): single-step torque scatter 216 % (N=32) / 63 % (N=64)
  of the mean for LBM, 32 % / 24 % for FV (inner ramp). The page shows a running mean over 0.25 time
  units (LBM block-mean scatter then 7 % at N=32, 3 % at N=64).
- Seed (both methods): divergence-free stream function, see SPEC.md "Deliberate 3D seed".

## Diagnostics (python/diagnostics.py)
- E, Z, Ew, E3d, Ekz, spectra are fluid-only (cell centres outside the cylinder); torque per unit span.
- Horizontal spectrum: Hann-windowed 2D FFT per z-plane gives the shape; each plane's spectrum is rescaled
  so its sum equals that plane's true fluid kinetic energy; Σ_k E_k = E exactly.
- Vorticity: central differences, odd-mirror ghosts at walls (velocity zero half a cell outside).

## Verification measured so far (notes/verify/REPORT.md, out/)
- Both methods keep a spanwise-uniform flow exactly uniform (difference 0) at default settings.
- Ekman direction (walls, spin): inward radial flow along the end walls, upwelling along the cylinder,
  outflow near mid-span — both methods. Magnitudes not converged (max|w| 0.137 FV vs 0.075 LBM at N = 32;
  0.100 vs 0.063 at N = 64).
- Fluid energy of the impulsively started spinning cylinder at t = 2 (Re = 100), cells more than 2h from
  the surface, vs the exact solution (out/energy_exact_gap2.txt): FV −34 % / −19 % / −12 % (N = 32/64/128),
  LBM +40 % / +7 % (N = 32/64). The spin-up layer √(νt) ≈ 0.063 is only ~4 cells at N = 64.
- Growth of the 3D seed, spin + orbit, Re = 200, N = 64, Nz = 32 (Lz = 0.5): growth rate σ of E3d
  (E3d ∝ e^{2σt}) 1.00 (LBM) vs 1.07 (FV), saturation E3d ≈ 0.03 in both. SCREENING.
- SCREENING sweep (LBM, N = 64, Nz = 32, Lz = 0.5, periodic): spin only Re 50: decays (σ ≈ −0.48);
  Re 200: σ ≈ 1.1, saturated E3d/E ≈ 0.11; Re 400: σ ≈ 1.4. Spin + orbit Re 50: σ ≈ 0.5; Re 100–800:
  σ ≈ 1.1–1.8, saturated E3d/E ≈ 0.19–0.23. Dominant spanwise mode kz = 1 (longest that fits) in all.
