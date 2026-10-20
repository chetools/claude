# Sequential design of experiments for a global model

**Live page:** https://chetools.github.io/claude/sequential-design/

A teaching page on choosing experiments in batches when the goal is a model that predicts well everywhere.
It is a simplified rework of `chetools/muse`'s `sequential-design-lab`: one or two inputs, so the model, its
uncertainty, and every choice can be drawn.

- **Problems:** Forrester, Gramacy & Lee, and a series-reaction yield (1-D); Branin, Forrester with an inert
  second input, and the reaction yield vs temperature and residence time (2-D). Gaussian measurement noise.
- **Model:** Gaussian process, Matérn 5/2 with one length scale per input, fitted by maximum likelihood
  (analytic gradient, BFGS written out, three starts).
- **Strategies:** random, one-shot maximin Latin hypercube, max predictive variance, IMSE (largest drop in
  grid-averaged variance). Batches are built greedily with exact rank-one covariance updates on the grid.
- **App:** step through a session round by round (truth, model, uncertainty, error, selection score, learning
  curve), and compare the four strategies over many seeds (median and interquartile band).
- **Hybrid implementation.**
  - **Rust → WebAssembly** (`solver/`) drives every chart; the comparison runs in parallel Web Workers (one per CPU core, up to 8).
  - **Python / numpy** (`python/sdl.py`) is the readable reference, explained step by step on the page and re-runnable
    live in the browser (Pyodide). Same functions, same order, same random numbers as the Rust code.
- **Editable MoLab notebook**, generated from the same cells as the page's breakdown with `sdl.py` embedded:
  [open in MoLab](https://molab.marimo.io/github/chetools/claude/blob/gh-pages/sequential-design/walkthrough_molab.py)
  (run all cells once after opening; edit `USER_INPUTS` and re-run).

## Layout

```
solver/            Rust crate (cdylib -> sdl.wasm; rlib for native tests)
  src/lib.rs       RNG, test functions, GP, BFGS, designs, greedy batches, session loop, WASM exports
  tests/checks.rs  cargo tests
  examples/dump.rs reference values for the Python parity test
python/
  sdl.py           reference implementation
  walkthrough.py   the step-by-step breakdown shown on the page
  runner.py        runs the breakdown cells (CPython at build time, Pyodide live)
  make_molab.py    generates notebook/walkthrough_molab.py
  test_sdl.py      pytest: finite differences, scipy L-BFGS-B, re-conditioning, ODE check, Rust parity
notebook/          the generated MoLab notebook (also published on gh-pages)
web/               page template, app.js, theory and Rust-guide texts (Markdown + LaTeX)
build.py           builds dist/sequential-design-standalone.html (single self-contained file)
```

## Build and test

Requirements: Rust with the `wasm32-unknown-unknown` target, Node/npm, and Python with
`numpy scipy pygments markdown-it-py pytest` (and `marimo plotly` for the notebook).

```bash
cd solver && cargo test --release                               # Rust checks
cargo run --release --example dump > ref.json && cd ..          # reference values
python -m pytest -q python/                                     # Python checks (incl. Rust parity)
python build.py                                                 # -> dist/sequential-design-standalone.html
marimo check notebook/walkthrough_molab.py && python notebook/walkthrough_molab.py
python build.py --pages ../gh-pages-checkout/sequential-design  # publish page + notebook
```
