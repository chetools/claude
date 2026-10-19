# chetools/claude: house rules

## General working rules (apply to every task)

- **Ask first, in one batch.** Before building anything non-trivial, ask the open design questions together, each
  with a recommended option. Proceed on the recommendation for anything left unanswered, and say which defaults were used.
- **Build only what was asked for.** No unrequested extras: derived verdicts, benchmark tabs, criteria, or "see also"
  notes. When a request says "X or Y", ask which one. Extras added on my own initiative get removed later.
- **No unverified claims.** Every number, comparison with the literature or physical statement shown to the user is
  either computed and checked, or left out. Say plainly what was not verified.
- **Teaching material.** Explain code for the audience's language (students know Python, not Rust). Keep a readable
  reference implementation, and check any fast implementation against it with results shown side by side.
- **Editable code.** Whenever Python code is shown on a page, link an editable MoLab (marimo) notebook of it (rule below).
- **Validate numerics independently.** Check results against a second method or an exact solution, not only
  against my own code. Check derivatives (AD vs. finite differences) on both sides of any steep region.
- **Verify like a user before delivering.**
  - Run every test suite.
  - Load the real page in a browser with Playwright: no console errors, every tab works, no horizontal scroll at phone width.
  - Look at screenshots.
  - Confirm the published URL serves the new content.
  - Only then hand over the shareable link.
- **Make builds fail loudly.** Guard against silent no-ops, such as unfilled template placeholders.

## Interactive teaching pages (published on `gh-pages`)

- **Style:** follow chetools/muse `gh-pages/muse-html/couette-standalone.html`:
  - Streamlit-like fixed sidebar, metric cards, App / Theory / Code tabs;
  - Plotly, KaTeX prerendered at build time;
  - one self-contained HTML file per page.
- **Every page that shows Python code must link to an editable MoLab (marimo) version of that code.**
  - The notebook is a **single self-contained marimo `.py` file**, because MoLab opens one file from GitHub with no
    repository checkout. It has:
    - a PEP 723 `# /// script` dependency header;
    - the project's own modules embedded;
    - an inputs cell of plain constants ("edit and re-run");
    - one `mo.md` explanation cell per step.
  - Generate it from the same source as the page's step-by-step breakdown, so the two cannot drift apart.
  - Every global must be defined in exactly one cell (a marimo rule). Check with `marimo check` and by running the file
    with `python notebook.py`.
  - Publish it on `gh-pages` next to the page and link it as
    `https://molab.marimo.io/github/chetools/claude/blob/gh-pages/<page-dir>/<notebook>.py`.
    Use `gh-pages` because feature-branch names contain `/`.
  - On the page, put the link under an **"Editable notebook"** heading with the caption
    "The MoLab notebook is editable; run all cells once after opening". Also add a button next to the breakdown's
    controls and a download link to the `.py` file.
  - Reference implementation: `packed-bed-runaway/` (`python/make_molab.py`, `notebook/walkthrough_molab.py`).
- **When done,** give the user the shareable `https://chetools.github.io/claude/<page-dir>/` link, after confirming
  that it serves.

## Lessons learned (packed-bed-runaway, 2026-10)

### Working with the user
- **Grill before building.** Ask the open design questions in one batch, each with a recommended option. Proceed on the
  recommendation for anything left unanswered, and say which defaults were used.
- **Build only what was asked for.** Extras were removed after delivery: the Barkelew curve, the Semenov and
  Morbidelli–Varma criteria (including the benchmark tab and verdict), and a cross-reference note.
  - When a request says "X or Y", ask which one.
  - Don't add derived verdicts, benchmark tabs or "see also" notes on my own initiative.
  - Theory derives only what the page computes.
- **Teaching priorities.**
  - Python is the readable reference, explained step by step. Students don't know Rust.
  - Rust is there for speed. It gets a "Rust for Python readers" guide and a Python↔Rust function map.
  - Every chart that reacts to the inputs is computed by Rust.
  - Rust is confirmed against Python on the page, with a click-to-run comparison and a speed race of about 10 s of Python.
- **No unverified claims on the page.** Compute a number or leave it out, whether it is a literature comparison, a flop count or a
  physics statement. For example, check the adiabatic limit numerically before calling a temperature superadiabatic.

### Build and publishing
- **Layout.** One directory per page: `solver/` (Rust), `python/` (reference + breakdown + MoLab generator),
  `web/` (template, app.js, markdown), and `build.py` producing `dist/<page>-standalone.html`. The built page is committed.
- **Template placeholders** look like `@@NAME@@`. The regex must allow digits (`[A-Z0-9_]`; `WASM_B64` was silently
  skipped otherwise), and the build must fail on any placeholder left unfilled.
- **Markdown and math.**
  - Use `markdown-it-py` (CommonMark) with `table` enabled. Python-Markdown breaks lists that follow a paragraph line,
    and lists nested with 2-space indents.
  - Protect `$…$` and `$$…$$` before rendering, and render them all with one batched `node` + KaTeX call.
  - Load the KaTeX CSS (and its fonts) from jsDelivr.
- **Tools.** Node tools (katex, plotly.js-dist-min) go in a gitignored `.buildtools/`. Rust needs
  `rustup target add wasm32-unknown-unknown`.
- **gh-pages.**
  - Work in a git worktree.
  - Add `.nojekyll` and a root `index.html` that links to each page.
  - Pushing the branch switched Pages on by itself.
  - Push a placeholder early, so the URL exists while building.

### Rust → WASM in the page
- **Plain `extern "C"` exports, no wasm-bindgen.** `alloc(n)` gives input buffers; results live in a static `Vec<f64>`
  and are read through a `Float64Array` view of `out_ptr()`/`out_len()`. The `.wasm` is base64-embedded.
- **Workers.** Compile the `WebAssembly.Module` once and post it to a Web Worker pool, whose source is a Blob built from
  stringified `makeApi`. Use chunked jobs with an `isStale` cancel, so a newer input change aborts work not yet started.
- **Generic code for AD.** Write the model generically (`T: Real`) so `f64` and `Dual<f64>` share one code path. Nested
  `Dual<Dual<T>>` gives Jacobian blocks for free.

### Numerics (stiff, runaway-prone problems)
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

### Python in the browser, and MoLab
- **Pyodide** runs in a Web Worker, loaded lazily after first paint with numpy and scipy. Pass inputs with `py.toPy`.
  `runPython` returns the last expression, so return JSON strings.
- **marimo notebook generated from the breakdown cells:**
  - one definition per global (use `_`-prefixed locals, and rename collisions);
  - top-level `figure(...)` becomes `_figN = make_fig(...)`, plus a final `mo.vstack`;
  - add `__generated_with` so `marimo check` is clean.

### Verification checklist (before publishing)
- `cargo test --release`, `pytest`, `marimo check`, and `python notebook.py` all pass.
- **Playwright on the built page.** Use `$(npm root -g)/playwright` with the preinstalled Chromium, served by
  `python -m http.server`. Check:
  - no page or console errors;
  - every tab renders;
  - a live Python run works;
  - at 390 px wide there is no horizontal scroll (let the tabs wrap).
- Take screenshots and look at them.
- Confirm the gh-pages URL serves the new content before handing over the link.
