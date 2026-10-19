# chetools/claude: house rules

## General working practices (apply to all work in this repo)

- **Verify, don't recall.**
  - Before stating a physical, numerical or performance claim (regime boundaries, accuracy, speed-ups), run the
    code and report what it shows.
  - Label anything not verified as an expectation.
- **When a result looks wrong to the user, reproduce it before answering.** Re-run the exact case with the reference
  code and quantify it. Then say whether it is real behaviour, a display or normalisation artefact, or a bug.
  Usually it is not the first explanation that comes to mind.
- **Cross-check independent implementations.** Wherever there are two codes for the same thing (reference vs fast,
  CPU vs GPU), compare them value by value. Ship that comparison as a self-test in the deliverable, with stated
  tolerances.
- **Sweep the whole input range before shipping.** Cover the extremes, crossovers between regimes and limits, and
  the largest and smallest sizes. Bugs hid exactly there: NaNs only at large grids, instability only where two
  time-step limits crossed.
- **Scale visual encodings to the data, not the inputs.** Colour ranges, line darkness and auto-scales should follow
  the data's own statistics. Make clear what a control holds fixed when another changes.
- **Check that the deployed artefact is the new one.** Compare the served bytes with the build (`cmp`), not just
  an HTTP 200. Check that the CI or Pages run actually started; re-trigger if it didn't.
- **Test the UI at two viewport widths** with a headless browser, and read the screenshots before reporting done.
- **Shell hygiene.**
  - Run long waits as background commands.
  - Never `pkill -f` a pattern that also matches the current command.
  - In `sed` replacements `&` means "the matched text", so escape it, or edit with Python instead.
- **Headless WebGPU in this container.**
  - Use `/opt/pw-browsers/chromium` with `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`, on an
    `http://localhost` page.
  - Compute works but a WebGPU canvas cannot be presented, so render through an offscreen texture for tests.
  - f32 `tanh`/`exp` overflow to NaN for large arguments, so clamp them.

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

- Use three implementations with the same names: a numpy reference (pytest), a float64 JS port (CPU fallback) and
  the WGSL kernels. A page **Validation** tab and a `?selftest` URL option (which sets `window.SELFTEST`) compare
  them against numpy values embedded at build time.
- URL options worth repeating on GPU pages:
  - `?blit` (offscreen render for headless tests; also used by Save PNG);
  - `?cpu` (force the fallback);
  - `?preset=…&N=…`.
- WebGPU details:
  - keep a reference to the adapter;
  - check `getCompilationInfo()`;
  - use explicit bind-group layouts per kernel;
  - avoid WGSL reserved words such as `active`.
- AB2 with `dt = min(dt_cfl, dt_diff)` blew up where the two limits cross. Adding the reciprocals,
  `dt = 1/(1/dt_cfl + 1/dt_diff)`, fixed it.
- `Plotly.react` with arrays mutated in place needs a changing `datarevision`. Keep metric-card sub-labels short,
  with `white-space: nowrap`.
