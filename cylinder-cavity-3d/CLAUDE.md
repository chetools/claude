# cylinder-cavity-3d: lessons

Project-specific lessons. The repo-wide rules are in the root `CLAUDE.md`; the shared interfaces (array
layouts, names, seed, diagnostics, web runtime) are in `python/SPEC.md` — read it before editing any solver.

## Numerics
- **Spanwise uniformity is a requirement, not a nicety.** The page argues that 3D growth is physical, so a
  spanwise-uniform flow must stay uniform to round-off at default settings in every implementation (numpy,
  JS, WGSL, numba). An (i+j+k) red–black colouring broke this by itself (1.5e-5 plane differences from
  nothing); colour by (i+j) and sweep every z-plane identically. Test it in every port.
- **3D growth comes from a known seed only:** the divergence-free stream-function seed in SPEC.md
  (M = min(4, Nz//4), never the Nyquist mode). A non-solenoidal seed in LBM turns into sound waves and
  a Nyquist mode that does not decay.
- **Brinkman masks with η → 0 grow the body.** Any chi > 0 applied every step locks the fluid, so the 2D
  page's tanh mask (width h) made the body R + 2–2.7h (torque +299 % at N = 32). Use the inner ramp
  chi = clamp((R − r)/h, 0, 1). Check every body treatment against the exact spinning-cylinder solution
  (`notes/verify/annulus.py`), not only against the other solver.
- **Bouzidi moving-wall term:** full 2 w_q ρ c_q·u_w/c_s² for q < ½, divided by 2q for q ≥ ½ (the plain form
  gives the wall speed 2q·u_w). Verified with a Couette test for both branches.
- **LBM mass drifts** linearly with interpolated bounce-back (~2–3e-6 per step for a spinning body); hold the
  mean fluid density at 1 with a uniform shift of f_0 (same in every plane, keeps uniformity).
- **LBM lattice speed:** u_lb = min(0.05, U/(6νN)) keeps τ ≤ 1; at large τ the bounce-back wall position
  moves and the low-Re torque falls outside the exact bracket.
- **Torque on an orbiting body is noisy** in both methods (single-step scatter 24–216 % of the mean, from
  nodes/faces switching between fluid and body). Show a labelled running mean (0.25 time units); covered/
  uncovered-node momentum exchange did not help.
- **Integrals are fluid-only.** The rigid body interior adds ~Ω²πR² to the enstrophy and hides the flow.
- **Windowed spectra in a walled box:** dividing by mean(W²) overstates the energy (×2.2 here) when the flow
  sits in the middle; rescale each plane's windowed spectrum to its true energy.
- **AB2 explicit diffusion in 3D** is stable for ν dt/h² < 1/12 (1/8 in 2D); the 2D fdiff = 0.05 still works.

## Workflow
- **Numba sweeps** (`python/sweep/`): set `OMP_WAIT_POLICY=PASSIVE` on a shared machine (6× faster); run
  sweeps resumable and in the background; a worker restart kills them (rerun the same config).
- **Parity chain:** numpy reference → numba (≈1e-15) → JS f64 (≈1e-13) → WGSL f32 (1e-5…5e-3). Every
  reference change must be ported down the chain and the self-test reference regenerated
  (`python/selftest_*.py`).
- **Subagent session limits:** agents stop mid-task on API limits; resume the same agent with SendMessage
  (its files are on disk) instead of starting over. Commit work-in-progress often.
- **Facts sheet:** `notes/facts_for_theory.md` is the single source of measured numbers for the theory
  writers; screening numbers are marked and never quoted as final.
