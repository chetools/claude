---
name: rust-wasm-numerics-page
description: Build a teaching page whose solver is Rust compiled to WebAssembly with a Python reference, Pyodide in the browser, automatic-differentiation sensitivities, stiff or runaway-prone ODEs, and a generated marimo/MoLab notebook (learned on packed-bed-runaway). Use for any Rust to WASM page or adaptive-integrator AD work.
---

# Rust to WASM teaching pages: lessons (from packed-bed-runaway)

Repo-wide rules stay in the root `CLAUDE.md`; this file holds the Rust/WASM/AD-specific lessons.

## Rust → WASM in the page
- **Plain `extern "C"` exports, no wasm-bindgen.** `alloc(n)` gives input buffers; results live in a static `Vec<f64>`
  and are read through a `Float64Array` view of `out_ptr()`/`out_len()`. The `.wasm` is base64-embedded.
- **Workers.** Compile the `WebAssembly.Module` once and post it to a Web Worker pool, whose source is a Blob built from
  stringified `makeApi`. Use chunked jobs with an `isStale` cancel, so a newer input change aborts work not yet started.
- **Generic code for AD.** Write the model generically (`T: Real`) so `f64` and `Dual<f64>` share one code path. Nested
  `Dual<Dual<T>>` gives Jacobian blocks for free.

## Numerics (stiff, runaway-prone problems)
- **Accurate AD sensitivities** through an adaptive integrator need two things:
  1. The **error test must include the derivative parts**, scaled by their largest component. Without it, the
     runaway side is garbage.
  2. The minimum step must be **relative** (`h < 1e-15·max(ξ, 1e-3)`), because ignition fronts need very small steps.
- **Peak of a sampled solution:** take the cubic Hermite between accepted steps (values plus the right-hand-side
  slopes), and use the envelope theorem for the derivative. A 3-point parabola fails at a runaway hot spot's sharp corner.
- **Validation.** Check AD against fine-tolerance finite differences on both sides of the steep region. Dump Rust
  reference values to JSON and check Python parity in pytest. With the same algorithm, both take the identical step
  sequence and agree to about 1e-10.
- **Speed race:** calibrate the Python run on several points, because cost varies with the inputs.

## Python in the browser, and MoLab
- **Pyodide** runs in a Web Worker, loaded lazily after first paint with numpy and scipy. Pass inputs with `py.toPy`.
  `runPython` returns the last expression, so return JSON strings.
- **marimo notebook generated from the breakdown cells:**
  - one definition per global (use `_`-prefixed locals, and rename collisions);
  - top-level `figure(...)` becomes `_figN = make_fig(...)`, plus a final `mo.vstack`;
  - add `__generated_with` so `marimo check` is clean.

## Extra checks before publishing
- `cargo test --release`, `pytest`, `marimo check`, and `python notebook.py` all pass.
- A live Python (Pyodide) run works on the built page.
