# chetools/claude: house rules

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

## Lessons from building `cylinder-cavity-ns/` (WebGPU CFD page)

- **Validate in three implementations.**
  - Keep a numpy reference (pytest), a float64 JS port (the CPU fallback) and the WebGPU kernels, with the same
    algorithm and names in all three.
  - Add a page **Validation** tab and a `?selftest` URL option that sets `window.SELFTEST`. It compares all three
    value by value against numpy results embedded at build time.
  - Tolerances: about 1e-10 for f64 JS, about 5e-3 relative for f32 GPU.
- **Test WebGPU headless in this container.**
  - Use `/opt/pw-browsers/chromium` with `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`.
  - Serve the page from `http://localhost` (a secure context). `about:blank` has no `navigator.gpu`.
  - SwiftShader cannot present a WebGPU canvas; the device is lost with "valid external Instance reference". So give
    the page an offscreen-texture render path (`?blit`) for tests; it doubles as Save PNG.
  - Keep a reference to the adapter.
  - Also provide `?cpu` (force the fallback) and `?preset=…&N=…` URL options.
- **f32 and WGSL pitfalls.**
  - `tanh` (and `exp`) overflow to NaN for large arguments, so clamp them.
  - Test at the *largest* grid sizes too: that bug appeared only at N ≥ 128.
  - Avoid reserved words such as `active`.
  - Check `getCompilationInfo()`, and use explicit bind-group layouts per kernel.
- **Sweep stability before publishing.** Run the reference across the whole slider range, especially where two
  time-step limits cross. `dt = min(dt_cfl, dt_diff)` blew up near the crossover with AB2; adding the reciprocals
  fixed it.
- **Do not state physics from memory.** Before writing regime thresholds, preset names or "turbulent" labels, run
  the reference and describe what it shows; label anything unverified. When the user asks "is this sensible?",
  reproduce the case numerically and separate physics from display artefacts before answering.
- **Normalise displays by the flow itself, not by inputs.**
  - Colour ranges and particle-trail darkness come from flow statistics (rms speed, enstrophy). Use a square root
    for wide dynamic range.
  - Re-enable auto range when the displayed field changes.
  - Say which quantity a slider holds fixed. Moving a speed keeps ν fixed, and Re follows.
- **UI details.** `Plotly.react` with arrays mutated in place needs a changing `datarevision`. Keep metric-card
  sub-labels short, with `white-space: nowrap`.
- **Publishing.**
  - A push to `gh-pages` does not always start a Pages build. Check the "pages build and deployment" runs, and
    re-trigger with a new commit if one is missing.
  - Confirm the live page by comparing the served bytes with `dist/` (`cmp`), not by an HTTP 200.
  - Never `pkill -f` a pattern that also matches the current shell command.
