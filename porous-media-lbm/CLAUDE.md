# porous-media-lbm: lessons

These lessons come from the `CLAUDE.md` on the old `claude/dazzling-carson-1n7le5` branch. They apply to this directory; the repo-wide rules are in the root `CLAUDE.md`.

Learned building `porous-media-lbm/` (WebGPU lattice-Boltzmann). Reference implementation for GPU pages.

**Testing in this container**
- WebGPU *compute* works in headless Chromium with SwiftShader. A WebGPU *canvas* does not: the instance is lost
  ("A valid external Instance reference no longer exists"). Run headed under `xvfb-run` for anything that draws.
  - Flags: `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader`.
  - Executable: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- WebGPU needs a secure context, so serve the page from an `https://` origin through `page.route`. A plain
  `http://` host other than localhost has no `navigator.gpu`.
- SwiftShader runs at about 0.5 million cell updates per second. Test long workflows (convergence, sweeps, RTD)
  through the page's CPU fallback, and keep GPU runs to small grids.
- Drivers: `porous-media-lbm/web/page_check.cjs` (scripted clicks, inputs, screenshots and console errors) and
  `porous-media-lbm/web/gpu_check.cjs` (GPU vs CPU numbers).

**One algorithm, several implementations (numpy reference, JS fallback, GPU shader)**
- Use the same function names and the same order of operations in all of them.
- Make random geometry bit-identical across languages, so a seed means the same thing on the page, in Pyodide and
  in the notebook:
  - use a shared 32-bit PRNG (mulberry32);
  - compute coordinates with the same float operations;
  - avoid `%` on negative numbers.
- Test every pair: numpy vs JS in pytest (through node), GPU vs CPU in Chromium, and GPU vs Pyodide on the page itself.
- float32 loses digits to O(1) cancellation. In LBM, store `f − w` (the deviation from rest) so velocities stay
  accurate to about 1e-6 of the float64 reference.

**Numerics**
- Before calling a mismatch a solver bug, compute the reference at the *discrete* level and check it in the Python
  reference too. Example: a plane-channel flux averaged at cell centres is `(h² + ½)/12`, not `h²/12`.
- Lattice-Boltzmann specifics:
  - TRT with Λ = 3/16 gives exact halfway walls, and the steady flow does not depend on τ. BGK permeability does.
  - The D2Q5 linear equilibrium under-predicts the diffusivity by a factor `(c_s² − u²)/c_s²`.
  - Keep the lattice velocity ≲ 0.03 and τ ≳ 0.52, and cap swept Re by resolution accordingly.
  - Stop a sweep on a non-finite result and report the dropped points instead of fitting NaNs.
- Parameters derived from live state (e.g. a tracer diffusivity from the current velocity) are only right at steady
  state. Warn when the user acts earlier.

**Display**
- Auto colour scales come from the displayed field's own maximum (reduced on the GPU). Let them rise at once, fall
  slowly, and never drop below a floor.
  - Never derive them from the history of sparse probes: a tracer view drawn that way showed numerical traces of
    1e-10 as a saturated wall, then "jumped".
- Offer a log scale when tails matter.

**Tooling gotchas**
- markdown-it wraps Pygments fence output in `<pre><code>`; unwrap it. Keep inline code spans out of the `$…$` math scan.
- marimo treats `_name` variables as private to their cell, so values shared between cells need public names. Take
  the notebook's default inputs by executing step 1 instead of keeping a second copy.
- Browsers clamp `setTimeout(0)` to at least 4 ms. When timing CPU work, run it in slices of about 30 ms.
- Keep the step-by-step breakdown under about 30 s in CPython, because Pyodide re-runs it live (about 1–2× slower).
- WGSL: index module-scope `var<private>` arrays, not `let`/`const` arrays, with a runtime index.
