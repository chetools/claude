# Packed-bed reactor: hot spots and runaway

**Live page:** https://chetools.github.io/claude/packed-bed-runaway/

An interactive, teaching-oriented study of hot spots and thermal runaway in a wall-cooled
fixed-bed reactor (o-xylene → phthalic anhydride, Froment's data):

- **2D pseudo-homogeneous model** (radial + axial). The radius is discretized with finite volumes
  (method of lines), and the system is integrated along the bed with an adaptive Rosenbrock 2(3)
  method (`ode23s`) using a block-tridiagonal linear solve.
- **Parametric sensitivity** s = (φ/T*)·∂T*/∂φ of the hot-spot temperature, computed by
  forward-mode **automatic differentiation** (dual numbers carried through the whole solver).
- **Morbidelli–Varma runaway criterion** (maximum of |s|) applied in sweeps, in a 2D map and in
  the (S, N/S) plane, benchmarked against **Semenov's** limit. The full derivations are in the
  page's Theory tab.
- **Hybrid implementation.**
  - **Rust → WebAssembly** (`solver/`) drives every live chart. Maps run on all CPU cores through Web Workers.
  - **Python / numpy / scipy** (`python/pbr.py`) is the readable reference. It is explained step by step on the
    page, can be re-run live in the browser (Pyodide), and is used to confirm the Rust results:
    - the same Rosenbrock algorithm takes the identical step sequence and agrees to about 1e-10 K;
    - scipy BDF independently agrees to within the requested tolerance;
    - Python finite differences agree with the Rust AD sensitivities.
- An **editable MoLab (marimo) notebook**, `notebook/walkthrough_molab.py`, generated from the same cells as the
  page's breakdown with `pbr.py` embedded:
  [open in MoLab](https://molab.marimo.io/github/chetools/claude/blob/gh-pages/packed-bed-runaway/walkthrough_molab.py)
  (run all cells once after opening; edit `USER_INPUTS` and re-run).
- A click-to-run **performance race** (Python ≈ 10 s vs Rust) and a panel on why Rust is fast
  and why WebGPU would not help here.

## Layout

```
solver/            Rust crate (cdylib → pbr.wasm; rlib for native tests)
  src/lib.rs       model, finite volumes, Rosenbrock, block Thomas, Dual AD, WASM exports
  tests/checks.rs  cargo tests (adiabatic invariant, AD vs FD, grid order, Semenov limit, ...)
  examples/dump.rs reference values for the Python cross-check
python/
  pbr.py           reference implementation (same function names as lib.rs)
  walkthrough.py   the step-by-step breakdown shown on the page
  runner.py        runs the breakdown cells (CPython at build time, Pyodide live)
  make_molab.py    generates notebook/walkthrough_molab.py (single-file marimo notebook for MoLab)
notebook/          the generated MoLab notebook (also published on gh-pages)
  test_pbr.py      pytest: Bessel-series solution, scipy BDF, bit-level match with Rust
web/               page template, app.js, theory / Rust guide / why-fast texts (Markdown + LaTeX)
build.py           builds dist/packed-bed-runaway-standalone.html (single self-contained file)
```

## Build and test

Requirements: Rust with the `wasm32-unknown-unknown` target, Node/npm, and Python with
`numpy scipy pygments markdown-it-py pytest` (and `marimo plotly` to run the notebook).

```bash
cd solver && cargo test --release                               # Rust checks
cargo run --release --example dump > ref.json && cd ..          # reference values
python -m pytest -q python/                                     # Python checks (incl. Rust parity)
python build.py                                                 # -> dist/packed-bed-runaway-standalone.html
python build.py --pages ../gh-pages-checkout/packed-bed-runaway # publish page + notebook
```

The page is self-contained: Plotly, the WASM module and the prerendered equations are
embedded. Only Pyodide (for the Python tabs) and the KaTeX stylesheet load from the jsDelivr CDN.
The visual style follows `chetools/muse`'s `couette-standalone.html`.
