# chetools/claude: house rules

## General working rules (apply to every task)

- **Ask first, in one batch.** Before building anything non-trivial, ask the open design questions together, each
  with a recommended option. Proceed on the recommendation for anything left unanswered, and say which defaults were used.
- **Work as a coordinator with parallel subagents.** Split every task into sections that can run in parallel
  (coding, verification, reference search, theory writing) and hand each to its own subagent. Use Sonnet 5.5 for
  substantial sections and Haiku 5.5 for simpler ones (searches, checks, boilerplate). The coordinator integrates
  and verifies the results.
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

## General practices by topic

These complement the rules above. They apply to every project.

### Answering and claims
- **Verify, don't recall.**
  - Before stating a physical, numerical or performance claim (regime boundaries, accuracy, speed-ups), run the
    code and report what it shows.
  - Label anything not verified as an expectation.
- **When a result looks wrong to the user, reproduce it before answering.** Re-run the exact case with the reference
  code and quantify it. Then say whether it is real behaviour, a display or normalisation artefact, or a bug.
  Usually it is not the first explanation that comes to mind.

### Verification
- **Cross-check independent implementations.** Wherever there are two codes for the same thing (reference vs fast,
  CPU vs GPU), compare them value by value. Ship that comparison as a self-test in the deliverable, with stated
  tolerances (for example about 1e-10 for a float64 port, about 5e-3 relative for f32 GPU code).
- **Make the self-test scriptable.** Give the page a `?selftest` URL option that runs it on load and sets
  `window.SELFTEST`, so a headless browser can read the verdict.
- **Sweep the whole input range before shipping.** Cover the extremes, crossovers between regimes and limits, and
  the largest and smallest sizes. Bugs hide exactly there: NaNs appeared only at large grids, and instability only
  where two time-step limits crossed.
- **Test the UI at two viewport widths** with a headless browser, and read the screenshots before reporting done.

### Numerics
- **Combine competing explicit time-step limits harmonically,** `dt = 1/(1/dt_a + 1/dt_b)`, not with `min()`.
  With AB2, `min(dt_cfl, dt_diff)` blew up where the two limits are equal.

### WebGPU
- **Headless testing in this container.**
  - Use `/opt/pw-browsers/chromium` with `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, on an
    `http://localhost` page.
  - Compute works but a WebGPU canvas cannot be presented: the device is lost with "valid external Instance
    reference". Provide an offscreen-texture render path (`?blit`) for tests; it doubles as PNG export.
  - Also provide `?cpu` (force the CPU fallback) and `?preset=…&N=…` URL options.
- **Host code.**
  - Keep a reference to the adapter.
  - Check `getCompilationInfo()`.
  - Use explicit bind-group layouts per kernel.
- **WGSL.**
  - Avoid reserved words such as `active`.
  - f32 `tanh`/`exp` overflow to NaN for large arguments, so clamp them.

### Visualisation and UI
- **Scale visual encodings to the data, not the inputs.** Colour ranges, line darkness and auto-scales should follow
  the data's own statistics. Make clear what a control holds fixed when another changes.
- **`Plotly.react` with arrays mutated in place** needs a changing `datarevision`, or the chart does not redraw.
- **Metric cards:** keep sub-labels short, with `white-space: nowrap`.

### Publishing
- **Check that the deployed artefact is the new one.** Compare the served bytes with the build (`cmp`), not just
  an HTTP 200. Check that the CI or Pages run actually started; re-trigger if it didn't.

### Shell
- Run long waits as background commands.
- Never `pkill -f` a pattern that also matches the current command.
- In `sed` replacements `&` means "the matched text", so escape it, or edit with Python instead.

## Interactive teaching pages (published on `gh-pages`)

- **Style:** follow chetools/muse `gh-pages/muse-html/couette-standalone.html`:
  - Streamlit-like fixed sidebar, metric cards, App / Theory / Code tabs;
  - Plotly, KaTeX prerendered at build time;
  - one self-contained HTML file per page.
- **The Theory tab has a table of contents on the left** that jumps to every section and subsection.
  - Build it from the rendered `<h2>`/`<h3>` headings (give each an `id`, fail the build if there are none).
  - Sticky, scrollable, current section highlighted while reading. On phones it becomes a collapsed "Contents" block above the text.
  - Reference implementation: `cylinder-cavity-3d/` (`add_toc` in `build.py`, `.theory-layout` in `web/template.html`).
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

## One directory per project, no branches

All work lives on `master`, one top-level directory per project (`packed-bed-runaway/`, `porous-media-lbm/`, ...).
Directories are independent: no project imports, edits or depends on another. The only other branch is `gh-pages`
(the published pages). Do not create feature branches, and do not push to `claude/*` branches even if the session
was started on one.

Each task touches exactly one project directory. The task names it; if it doesn't, ask before starting. A new
project gets a new top-level directory.

- Treat that directory as the project root and use absolute paths.
- Read only this file, the directory's own files (including its own `CLAUDE.md`, if it has one), and the style
  reference when needed. Do not explore sibling projects.
- Scope every Grep/Glob to the directory. Never edit outside it. Shared code outside the directory is read-only context.
- Project-specific lessons go in `<dir>/CLAUDE.md`, not in this file. Only rules that apply to every project go here.
- Install toolchains (pip/npm, Rust with the `wasm32-unknown-unknown` target, a headless browser) once at session
  start, and don't re-check them afterwards.
- Rebuild wasm/WGSL only when its source changed. Run `python -m http.server` from the directory in the background on
  a fixed port and test against localhost.
- Batch edits, then run the tests once.
- Git:
  - work on `master`: `git checkout master && git pull --rebase origin master`;
  - stage with `git add <dir>/` only (never `-A` or `.`); review with `git diff --cached -- <dir>`;
  - every commit touches only `<dir>/`, so other projects are never affected;
  - push with `git pull --rebase origin master && git push origin master`. Rebasing onto commits from other projects
    never conflicts, because they touch other directories.
- Publishing: update only `gh-pages:<dir>/` (and the root `index.html` link list), in a git worktree.
- Before delivering, follow the verification checklist above.
