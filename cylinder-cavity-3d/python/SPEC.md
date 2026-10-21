# cylinder-cavity-3d — shared interface spec (all agents read this first)

Project root: `/home/user/claude/cylinder-cavity-3d/`. Edit ONLY files assigned to you. No git commands.
Read-only context: `/home/user/claude/cylinder-cavity-ns/` (the 2D page this extends) and the copy
`python/ref2d/ns2d.py` (2D finite-volume reference; tests may import it as `from ref2d import ns2d`).
Audience: chemical-engineering students who know Python, not much maths/physics. Every number shown to the
user must be computed and checked, or omitted. Report anything not verified.

## Problem
Box x, y ∈ [0,1] (no-slip walls), span z ∈ [0, Lz]. Cylinder of radius R, axis parallel to z, spanning the
whole span. Its centre orbits the box centre (0.5, 0.5) on a circle of radius ro (angular speed ω_o = Uo/ro)
and it spins about its own axis (Ω = Us/R). Body velocity at (x, y):
  ub = −ω_o (cy − 0.5) − Ω (y − cy),  vb = ω_o (cx − 0.5) + Ω (x − cx),  wb = 0,
  cx = 0.5 + ro cos φ, cy = 0.5 + ro sin φ, φ(t) = ω_o t.   (identical to ns2d.body_mask_velocity)
Span type `span`:
  * `"periodic"` — periodic in z. A spanwise-uniform flow stays spanwise-uniform except for instability.
  * `"walls"`    — no-slip, stationary end walls at z = 0 and z = Lz (Ekman layers).
Nondimensionalisation as 2D: L = 1 (box side), U_ref = max(|Us|, |Uo|) (1 if both 0), ν = U_ref·2R/Re,
time unit L/U_ref. All outputs are in these physical units, for both methods.

## Inputs (make_params keyword names; same names in JS)
N (cells per box side, power of two, ≥ 8), Nz (spanwise cells; Nz = 1 means the 2D baseline; power of two),
Lz = Nz·h (derived, h = 1/N), Re, R=0.1, ro=0.2, Us=1.0, Uo=0.0, span="periodic".
Method-specific extras: FV: cfl=0.3, fdiff=0.05, width=1.0, vcycles=2, nu1=2, nu2=2, ncoarse=40.
LBM: u_lb (lattice speed of the fastest body point, default 0.05 → Ma ≈ 0.087), collision ("bgk" | "reg"
(regularised) | "mrt" — choose default by measured stability), refill scheme as documented in the code.
The 2D baseline is ALWAYS `Nz=1, span="periodic"`, same other inputs.

### Deliberate 3D seed (both methods, identical formula in numpy / JS / WGSL)
Input `seed` (default 1e-3, in units of U_ref; 0 disables). init_state adds to the fluid at rest
  w0(x,y,z) = seed · sin(πx) sin(πy) · Σ_{m=1}^{M} cos(2π m z/Lz + m),   M = min(4, Nz//2)
(nothing for Nz = 1). FV: applied to the w faces, then one projection; LBM: equilibrium at that velocity.
REQUIREMENT: with seed = 0 and a spanwise-uniform start, each solver must keep the flow spanwise-uniform to
round-off (≤ 1e-12 relative) at DEFAULT settings, so that any 3D growth on the page comes from the known seed
(or physics) and never from solver artefacts (e.g. z-dependent Gauss–Seidel colouring). Test it.

## Array layout (numpy and flat GPU buffers alike): index order [k (z), j (y), i (x)]
FV (MAC, staggered; extends ns2d exactly):
  u (Nz, N, N+1) at x = i h, y = (j+½)h, z = (k+½)h
  v (Nz, N+1, N) at x = (i+½)h, y = j h, z = (k+½)h
  w (Nz+1, N, N) at z = k h; walls: w[0] = w[Nz] = 0; periodic: w[Nz] ≡ w[0] (kept equal)
  q (Nz, N, N) cell centres, q = dt·pressure
  Ghost rules: x/y walls as ns2d (odd mirrors); z-walls odd mirror (no-slip) for u, v, cell centres
  zero-gradient; periodic z wraps. Multigrid: semi-coarsening — coarsen z only while nz ≥ 2, so Nz = 1
  reproduces ns2d's V-cycle exactly. With Nz = 1 periodic, fv3d MUST match ns2d to round-off (pytest).
LBM (D3Q19, nodes at cell centres x = (i+½)h, etc.; halfway bounce-back walls sit at x,y = 0,1 and, for
  span="walls", z = 0, Lz — the same wall positions as FV):
  f (19, Nz, N, N). Velocity set, in this order (opposite of q is q+1 for odd q, q−1 for even q>0):
   0:(0,0,0) 1:(1,0,0) 2:(-1,0,0) 3:(0,1,0) 4:(0,-1,0) 5:(0,0,1) 6:(0,0,-1)
   7:(1,1,0) 8:(-1,-1,0) 9:(1,-1,0) 10:(-1,1,0) 11:(1,0,1) 12:(-1,0,-1) 13:(1,0,-1) 14:(-1,0,1)
   15:(0,1,1) 16:(0,-1,-1) 17:(0,1,-1) 18:(0,-1,1)
  weights 1/3 (rest), 1/18 (axis), 1/36 (diagonal); c_s² = 1/3.
  Unit conversion: dt = u_lb·h / U_body_max (U_body_max = |Us| + |ω_o|(ro+R), as FV's Umax),
  ν_lb = ν dt / h², τ = 3ν_lb + ½; u_phys = u_lb_field · h/dt.
  With Nz = 1 periodic and BGK, D3Q19 summed over c_z equals D2Q9 BGK exactly — test it.
  Body: interpolated (Bouzidi–Firdaouss–Lallemand) bounce-back with moving-wall term
  −2 w_q ρ (c_q·u_b)/c_s²; force/torque by momentum exchange (moving-boundary corrected); newly uncovered
  fluid nodes refilled (document the scheme). Exact cut fractions q from the analytic circle.

## Module API (Python; JS/WGSL use the same names in camelCase where JS idiom demands)
Both `fv3d.py` and `lbm3d.py` provide:
  make_params(**inputs) -> dict p   (includes dt, nu, h, Lz, everything a step needs)
  init_state(p) -> dict s           (fluid at rest; s["t"], s["phi"], s["nstep"])
  step(s, p) -> s                   (advance one dt, in place)
  cell_velocity(s, p) -> U          (3, Nz, N, N) physical velocity at cell centres
  torque(s, p) -> float             (z-torque of the fluid ON the cylinder about its centre, per unit span)
  run(p, nsteps, every=0, s=None) -> (s, hist)   hist rows = dict(t=..., **diagnostics.summary(...))
`diagnostics.py` (method-independent; works on U from cell_velocity; cell-centred grid with spacing h):
  vorticity(U, h, span) -> (3, Nz, N, N)   central differences, one-sided/ghost at walls (document)
  q_criterion(U, h, span) -> (Nz, N, N)    Q = ½(‖Ω‖² − ‖S‖²)
  energy(U, h, Lz) = (1/Lz)∫½|u|² dV       (per unit span: equals the 2D energy for z-uniform flow)
  enstrophy(U, h, Lz, span) = (1/Lz)∫½|ω|² dV
  spanwise_energy(U, h, Lz) -> dict(Ew=(1/Lz)∫½w² dV, E3d=(1/Lz)∫½|u−⟨u⟩_z|² dV,
                                       Ekz=array of energy per spanwise Fourier mode kz=0..Nz/2 (periodic))
  spectrum_h(U, h) -> (k, E_k)   horizontal spectrum: Hann-windowed 2D FFT of each z-plane in (x,y),
                                 shell-binned in |k|, averaged over planes, normalised so ΣE_k Δk ≈ energy
  summary(U, s, p) -> dict(E, Z, Ew, E3d, torque, maxdiv, maxspeed)
Tests: pytest files `python/test_*.py`, runtime < ~3 min total; heavy runs behind `-m slow`.

## Page build (scaffold) placeholders, `@@[A-Z0-9_]+@@`, build fails on any left unfilled
TITLE, BASE_CSS, PYGMENTS_CSS, PLOTLY, THEORY, CODE_GUIDE, WALKTHROUGH, WT_PLOTS, PY_SRC (dict of python
sources for display/Pyodide), WGSL_LBM, WGSL_FV, WGSL_RENDER, WGSL_ISO, CPUJS_SRC, GPUJS_SRC, APP_JS,
REF (self-test JSON), MOLAB_URL, PRESETS (JSON).
MOLAB_URL = https://molab.marimo.io/github/chetools/claude/blob/gh-pages/cylinder-cavity-3d/walkthrough_molab.py

## Theory files
`web/theory_physics.md`, `web/theory_lbm.md` (Markdown + $…$/$$…$$ LaTeX, CommonMark + tables). Derive only
what the page computes. Every equation block is followed by a plain-language, physical/geometric reading.
Numbers that must come from simulations are written `TODO(measured: what)`; the coordinator fills them.
