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
- **Survive usage-limit stops (auto-resume).** A session cannot see or react to its own usage limit, so arm the
  restart before it is needed:
  - At the start of any task expected to take more than one turn, create one recurring **hourly** scheduled task
    into this session (`create_trigger`, cron `0 * * * *`, initiation `human_schedule`) named
    `auto-resume <project>`. Its prompt: "Auto-resume check: if the <project> task is unfinished, continue from the
    last commit and the task list; if it is finished or waiting on the user, delete this scheduled task and stop."
    After a usage stop, the first firing after the 5-hour window resets picks the work up again (at most an hour late).
  - Keep work resumable: commit and push after each finished step, and keep the task list current, so a resumed
    turn can continue without the lost context.
  - When the task is delivered, or blocked on the user, delete the scheduled task. Never leave more than one per project.

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
- **Look at screenshots of the realistic case, not only the test case.** Small grids at early times hid that trails
  saturated to white on a real GPU at N = 64, N_z = 32; reproduce the user's settings before judging a visual.
- **Rule out the test before the code.** False failures came from a test that read a canvas without redrawing it, a
  stub page embedding a stale copy of an edited shader, a stopped local server, and positions compared without
  periodic wrap-around (z = 0 and z = L_z are one point). Regenerate derived test fixtures in every run.

### Numerics
- **Combine competing explicit time-step limits harmonically,** `dt = 1/(1/dt_a + 1/dt_b)`, not with `min()`.
  With AB2, `min(dt_cfl, dt_diff)` blew up where the two limits are equal.

### Visualisation and UI
- **Scale visual encodings to the data, not the inputs.** Colour ranges, line darkness and auto-scales should follow
  the data's own statistics. Make clear what a control holds fixed when another changes.
- **`Plotly.react` with arrays mutated in place** needs a changing `datarevision`, or the chart does not redraw.
- **Metric cards:** keep sub-labels short, with `white-space: nowrap`.
- **Round shown values and control steps to nice numbers** (slider steps 0.05, 0.1, 0.2, …; scale tops rounded up
  to 1, 1.5, 2, 2.5, 3, 5 × 10^k), and let a preset carry display settings so the first view is the good one.
- **The page header matches the body text width.** On wide monitors the title, intro and status/progress bar must
  not span the whole window: wrap them in one block with the same `max-width` as the body column, set in the body
  font (a `ch` width set on the larger title font comes out wider). Check with Playwright at 2560 px that the
  header and body share left and right edges.

### Publishing
- **Check that the deployed artefact is the new one.** Compare the served bytes with the build (`cmp`), not just
  an HTTP 200. Check that the CI or Pages run actually started; re-trigger if it didn't.

### Shell
- Run long waits as background commands.
- Never `pkill -f` a pattern that also matches the current command. Likewise `until ! pgrep -f X` waits forever
  when the waiting command itself contains X.
- In `sed` replacements `&` means "the matched text", so escape it, or edit with Python instead.

## Interactive teaching pages (published on `gh-pages`)

- **Style:** follow chetools/muse `gh-pages/muse-html/couette-standalone.html`:
  - Streamlit-like fixed sidebar, metric cards, App / Theory / Code tabs;
  - Plotly, KaTeX prerendered at build time;
  - one self-contained HTML file per page.
- **The Theory and Code tabs (and any other long tab) have a table of contents on the left** that jumps to every
  section and subsection, the breakdown's steps included.
  - Build it from the rendered `<h2>`/`<h3>` headings (give each an `id`, fail the build if there are none). Step
    titles are headings too (`<h3 class="wt-title" data-toc="3. …">`); use `<h4>` for anything inside a collapsed
    `<details>`, so the contents never link to hidden text.
  - Sticky, scrollable, current section highlighted while reading. On phones it becomes a collapsed "Contents" block above the text.
  - The Code tab's content column is wider than the Theory text (plots and code need the width).
  - Reference implementation: `cylinder-cavity-3d/` (`add_toc` in `build.py`, the `<!--CODE_BODY-->` block and
    `tocSpy` in `web/template.html`).
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

## Chemical process pages and flow diagrams (skills in `.claude/skills/`)

- **Process flow diagrams:** follow `.claude/skills/process-flow-diagram-drawing/SKILL.md` and its specification
  PFD-SPEC-001 (`specification/`). Section 9 of that file (library corrections, strict readings of the spec, the
  process-sense review, verifier tests) is part of the skill.
- **Process pages** (an interactive page about a plant or process unit: PFD at the centre, live Python balance model,
  subunit breakdown, economics, safety): follow `.claude/skills/chemical-process-wasm-page/SKILL.md`. It is the
  process-page counterpart of the teaching-page rules above. Reference build: `pfd-hda-example/page/`.
- Where these skills differ from this file, this file wins:
  - publish under `gh-pages:<dir>/`, not `muse-html/<slug>/`;
  - the built page is committed in the project directory (as for teaching pages).
- **General lessons from the first use (HDA plant):**
  - Passing the geometric and balance checks does not make a flowsheet right. Before delivery, read the stream table
    and drawing as a process engineer:
    - pressure let-downs have valves;
    - temperatures and phases agree with computed bubble and dew points;
    - vapour compositions respect vapour pressures;
    - utilities and instrument taps are on the correct side.
  - Use an independent reviewer for that read.
  - "Shall exceed" limits are strict inequalities in checks.
  - A verifier is trusted only after planted-defect tests show that it fails.
  - Values shared between parallel sub-agents' outputs (for example sheet-continuation heights) are fixed with the most
    constrained output in view, not as an arbitrary range in advance.
  - A sub-agent's "inspected the render" may refer to an earlier draft. Re-render the deliverables from source and
    look at them yourself before issuing.

## Building and publishing pages
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

## Verification checklist (before publishing)
- Run every test suite the project has.
- **Playwright on the built page.** Use `$(npm root -g)/playwright` with the preinstalled Chromium, served by
  `python -m http.server`. Check:
  - no page or console errors;
  - every tab renders;
  - at 390 px wide there is no horizontal scroll (let the tabs wrap).
- Take screenshots and look at them.
- Confirm the gh-pages URL serves the new content before handing over the link.

## Topic skills (load only when the project needs them)
- `webgpu-page`: WebGPU compute/rendering, headless testing, tracers and trails.
- `rust-wasm-numerics-page`: Rust to WASM solver, Pyodide, AD sensitivities, stiff ODEs, marimo generation.

## Working alongside other sessions
- Another session may edit the same project directory (for example the Theory text). Never revert or overwrite its
  work: `git pull --rebase origin master` before rebuilding, then rebuild, because the built page includes every
  source file. If its change breaks a test harness (a new template placeholder), fix the harness.

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
