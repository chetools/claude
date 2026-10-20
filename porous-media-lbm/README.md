# Packed bed on the GPU: flow, permeability and RTD

**Live page:** https://chetools.github.io/claude/porous-media-lbm/

An interactive, teaching-oriented pore-scale simulation of flow and tracer dispersion through a 2D packed bed. It
runs live in the browser on the GPU through **WebGPU**.

- **Lattice-Boltzmann flow.** D2Q9 lattice with halfway bounce-back on the particles and a two-relaxation-time (TRT)
  collision with Λ = 3/16, so the permeability does not depend on the viscosity. The flow is driven by a Guo body force
  in a periodic domain.
- **Tracer.** A D2Q5 TRT advection–diffusion lattice on the same grid, with a square inlet pulse and two internal
  detectors.
- **What the page measures and compares:**
  - **permeability** against Kozeny–Carman (fitted Kozeny constant), Sangani–Acrivos and Gebart for ordered arrays;
  - **friction factor vs Re′** against Ergun;
  - the **RTD**, with tail-corrected moments and the two-detector axial-dispersion Péclet number / tanks in series;
  - **Taylor–Aris** dispersion in the empty-channel preset.
- **Implementation:**
  - **WebGPU compute shaders** (`web/lbm.wgsl`): one thread per cell, structure-of-arrays populations stored as
    deviations from rest (accurate in float32), GPU reductions, and a fragment shader that draws straight from the
    simulation buffers.
  - **JavaScript CPU fallback** (`web/cpu.js`): the same algorithm, used when WebGPU is missing, in the speed race, and
    for cross-checks.
  - **Python / numpy reference** (`python/lbm.py`): explained step by step on the page, re-runnable live in the browser
    (Pyodide), and compared cell by cell with the GPU. The same random seed gives the same bed in all three.
- An **editable MoLab (marimo) notebook**, `notebook/walkthrough_molab.py`, generated from the same cells as the page's
  breakdown with `lbm.py` embedded:
  [open in MoLab](https://molab.marimo.io/github/chetools/claude/blob/gh-pages/porous-media-lbm/walkthrough_molab.py)
  (run all cells once after opening; edit `USER_INPUTS` and re-run).

## Layout

```
python/
  lbm.py           numpy reference (lattices, bed generation, flow_step, tracer_step, RTD analysis, correlations)
  walkthrough.py   the step-by-step breakdown shown on the page
  runner.py        runs the breakdown cells (CPython at build time, Pyodide live)
  make_molab.py    generates notebook/walkthrough_molab.py (single-file marimo notebook for MoLab)
  test_lbm.py      pytest: lattice symmetry, conservation, exact Poiseuille, square arrays vs Sangani-Acrivos /
                   Gebart, TRT tau-independence, tracer dispersion, moment analysis, JS-vs-numpy parity
notebook/          the generated MoLab notebook (also published on gh-pages)
web/
  lbm.wgsl         compute shaders: flow_step, tracer_step, tick, reduce, detect
  render.wgsl      fragment shader drawing the fields
  gpu.js           WebGPU driver (buffers, pipelines, step recording, read-back)
  cpu.js           the same algorithm in plain JavaScript
  bed.js           bed generation and relaxation rates (bit-identical port of lbm.py)
  app.js           page logic: sidebar, animation, metrics, RTD analysis, sweeps, comparisons
  parity.cjs       prints a CPU-solver run for the Python parity test
  gpu_check.cjs    runs the WebGPU solver in Chromium and compares it with the CPU solver
  page_check.cjs   drives the built page in Chromium (scripted steps, screenshots, console errors)
  template.html, theory.md, gpu_guide.md, why_gpu.md, base.css
build.py           builds dist/porous-media-lbm-standalone.html (single self-contained file)
```

## Build and test

Requirements: Node/npm and Python with `numpy pygments markdown-it-py pytest` (and `marimo plotly` to run the
notebook). The GPU check needs Playwright with Chromium.

```bash
python -m pytest -q python/                                   # Python checks (incl. JS parity via node)
node web/gpu_check.cjs                                        # WebGPU vs CPU solver (headless Chromium, SwiftShader)
xvfb-run -a node web/page_check.cjs dist/porous-media-lbm-standalone.html /tmp/shots wait:15000 snap:flow
                                                              # drive the page: clicks, inputs, screenshots (see header)
python build.py                                               # -> dist/porous-media-lbm-standalone.html
marimo check notebook/walkthrough_molab.py && python notebook/walkthrough_molab.py
python build.py --pages ../gh-pages-checkout/porous-media-lbm # publish page + notebook
```

Headless Chromium can run WebGPU *compute* with SwiftShader but cannot present a WebGPU canvas. To view the page in an
automated browser, run it headed under `xvfb-run` with `--enable-unsafe-webgpu --enable-features=Vulkan
--use-vulkan=swiftshader --use-webgpu-adapter=swiftshader`.

The page is self-contained: Plotly, the shaders and the prerendered equations are embedded. Only Pyodide (for the
Python tabs) and the KaTeX stylesheet load from the jsDelivr CDN. The visual style follows `chetools/muse`'s
`couette-standalone.html`.
