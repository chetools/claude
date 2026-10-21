# cylinder-cavity-ns: project notes

The general rules (verification, numerics, WebGPU, visualisation, publishing) are in the root `CLAUDE.md` under
"General practices by topic". Only notes specific to this page are here.

- **Three implementations with the same function names:**
  - `python/ns2d.py`, the numpy reference, checked by pytest;
  - `web/cpu.js`, the float64 JS port and CPU fallback;
  - `web/shaders.wgsl`, the GPU kernels.

  The Validation tab (also `?selftest`) compares JS and GPU against numpy values embedded by `build.py`
  (`SELFTEST` case: N = 64, Re 200, spin and orbit, 100 steps).
- **URL options:**
  - `?blit` (offscreen render, for headless tests);
  - `?cpu` (force the fallback);
  - `?preset=spin-lam|orbit-lam|orbit-shed|spin-high|turb`;
  - `?N=64…1024`;
  - `?field=0..3`.
- **Time step:** `dt = 1/(1/dt_cfl + 1/dt_diff)` (CFL 0.3, diffusion number 0.05). With `min()`, the orbit case at
  Re ≈ 100, N = 128 blew up, because that is where the two limits are equal.
- **Re uses the larger of the spin and orbit speeds.** Speed and size sliders keep ν fixed, and Re follows.
- **Presets and regime text** come from numpy runs (N = 128, 10–20 time units), not from the literature. Re-run
  before changing them.
