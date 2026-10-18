# Spinning, orbiting cylinder in a box: 2D Navier–Stokes on WebGPU

**Live page:** https://chetools.github.io/claude/cylinder-cavity-ns/

An interactive, teaching-oriented finite-volume solver for the incompressible Navier–Stokes equations in a closed
square box, stirred by a cylinder that spins about its own axis, orbits the centre of the box, or both. The
Reynolds number takes the flow from steady and laminar, through unsteady vortex shedding, to chaotic
two-dimensional turbulence.

- **Method.** Finite volumes on a staggered (MAC) grid. Advection uses MUSCL reconstruction with the minmod
  limiter, time stepping is variable-step Adams–Bashforth 2, and incompressibility comes from a projection whose
  pressure equation is solved by geometric multigrid (red–black Gauss–Seidel V-cycles). The moving cylinder is a
  smoothed mask (Brinkman volume penalisation), so the grid never moves.
- **Turbulence treatment.** No explicit model (no RANS, no Smagorinsky). The flow is a DNS where the cell Reynolds
  number U h/ν is small. At the high-Re presets (cell Re ≈ 50–100) the minmod limiter's numerical dissipation acts as
  an implicit sub-grid model: implicit LES / MILES. The page's Theory §8 explains this.
- **WebGPU** (`web/shaders.wgsl`, `web/gpu.js`). Every part of a time step is a compute kernel. The page runs
  grids up to 1024² live in the browser, with vorticity, speed, pressure or a passive dye drawn by a fragment
  shader together with animated tracer particles (pathlines with fading trails), and diagnostics computed by parallel reductions: energy, enstrophy, torque, divergence and a probe spectrum.
- **Python / numpy reference** (`python/ns2d.py`). It implements the same algorithm with the same names. It is
  explained step by step on the page and checked by pytest. The page's Validation tab compares the WebGPU (f32)
  and JavaScript CPU (f64) solvers with numpy, value by value, and benchmarks them.
- **CPU fallback** (`web/cpu.js`). A double-precision JavaScript port runs in browsers without WebGPU. It agrees
  with numpy to about 1e-14.
- An **editable MoLab (marimo) notebook**, `notebook/walkthrough_molab.py`, is generated from the same cells as
  the page's breakdown, with `ns2d.py` embedded:
  [open in MoLab](https://molab.marimo.io/github/chetools/claude/blob/gh-pages/cylinder-cavity-ns/walkthrough_molab.py).
  Run all cells once after opening; then edit `USER_INPUTS` and re-run.

## Layout

```
python/
  ns2d.py          reference solver (numpy)
  walkthrough.py   the step-by-step breakdown shown on the page
  runner.py        runs the breakdown cells, capturing output and figures
  make_molab.py    generates notebook/walkthrough_molab.py (single-file marimo notebook for MoLab)
  test_ns2d.py     pytest checks
notebook/          the generated MoLab notebook (also published on gh-pages)
web/
  shaders.wgsl     compute kernels (one per stage of a time step, multigrid, reductions)
  render.wgsl      colour-maps the field, draws the cylinder
  gpu.js           WebGPU host code
  cpu.js           parameters, colour maps, CPU fallback solver
  app.js           page logic
  template.html    page template; theory.md, gpu_guide.md (Markdown + LaTeX)
build.py           builds dist/cylinder-cavity-ns-standalone.html (single self-contained file)
```

## Build and test

Requirements: Node/npm, and Python with `numpy scipy pygments markdown-it-py pytest` (plus `marimo plotly` to
run the notebook).

```bash
python -m pytest -q python/                                       # reference checks
python build.py                                                   # -> dist/cylinder-cavity-ns-standalone.html
python build.py --pages ../gh-pages-checkout/cylinder-cavity-ns   # publish page + notebook
```

Page URL options:
- `?preset=turb&N=512&field=3` opens a preset at a given grid, showing a given field;
- `?cpu` forces the CPU solver;
- `?selftest` runs the Validation tab on load;
- `?blit` renders through an offscreen texture, for headless browsers that cannot present a WebGPU canvas.

The page is self-contained: Plotly, the shaders and the prerendered equations are embedded. Only the KaTeX
stylesheet loads from the jsDelivr CDN. The visual style follows `chetools/muse`'s `couette-standalone.html`.
