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
