"""Build the standalone page dist/cylinder-cavity-3d-standalone.html.

    python build.py                 # dev build: missing optional parts and TODO(measured) markers only warn
    python build.py --release       # strict: TODO(measured) markers and a missing make_molab.py are errors
    python build.py --pages DIR     # also copy the page to DIR/index.html and the notebook to DIR/

Steps: check that every input exists; run the Python breakdown (python/walkthrough.py through python/runner.py)
with CPython to capture its outputs and figures; regenerate the editable MoLab (marimo) notebook with
python/make_molab.py; compute the numpy reference for the page's self-test; prerender all LaTeX with KaTeX;
syntax-highlight the sources with Pygments; inline Plotly, the WGSL shaders and the JavaScript into one HTML file.
Any unfilled template placeholder, unused content, or missing input stops the build with a message.
Needs: node/npm, python packages pygments markdown-it-py.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys

from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import JavascriptLexer, PythonLexer, WgslLexer

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
PYDIR = os.path.join(ROOT, "python")
TOOLS = os.path.join(ROOT, ".buildtools")
DIST = os.path.join(ROOT, "dist")
NOTEBOOK_DIR = os.path.join(ROOT, "notebook")
sys.path.insert(0, PYDIR)

TITLE = "Cylinder in a Box — 3D Navier–Stokes"
MOLAB_URL = "https://molab.marimo.io/github/chetools/claude/blob/gh-pages/cylinder-cavity-3d/walkthrough_molab.py"
PAGE_NAME = "cylinder-cavity-3d-standalone.html"
NOTEBOOK_NAME = "walkthrough_molab.py"
PH_RE = re.compile(r"@@([A-Z0-9_]+)@@")

# page JavaScript, concatenated in this order (SPEC.md, "Web runtime")
CPU_JS = ("lbm_cpu.js", "fv_cpu.js")
GPU_JS = ("lbm_gpu.js", "fv_gpu.js")
APP_JS_FILES = ("render.js", "diagnostics.js", "app.js")

# every file the page is built from (relative to the project root); a missing one stops the build
INPUTS = [
    "web/template.html", "web/base.css", "web/presets.json",
    "web/theory_physics.md", "web/theory_lbm.md", "web/code_guide.md",
    "web/lbm.wgsl", "web/fv.wgsl", "web/render.wgsl", "web/iso.wgsl",
    *[f"web/{f}" for f in ("lbm_cpu.js", "fv_cpu.js", "lbm_gpu.js", "fv_gpu.js", "render.js",
                            "diagnostics.js", "app.js")],
    "python/selftest_lbm.py", "python/selftest_fv.py", "python/selftest_exact.py", "notes/verify/annulus.py",
    "python/walkthrough.py", "python/runner.py",
    "python/lbm3d.py", "python/fv3d.py", "python/diagnostics.py",
]
THEORY_FILES = ["web/theory_physics.md", "web/theory_lbm.md"]
PY_FILES = ["lbm3d.py", "fv3d.py", "diagnostics.py"]
TODO_MARK = "TODO(measured"


def fail(msg):
    print(f"BUILD FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f"WARNING: {msg}", file=sys.stderr)


def read_file(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def read(*p):
    return read_file(os.path.join(ROOT, *p))


def check_inputs():
    missing = [p for p in INPUTS if not os.path.isfile(os.path.join(ROOT, p))]
    if missing:
        fail("missing input files: " + ", ".join(missing))


def check_todos(release):
    """Numbers that must come from simulations are marked TODO(measured: ...) in the theory files."""
    for p in THEORY_FILES:
        for n, line in enumerate(read(p).splitlines(), 1):
            if TODO_MARK in line:
                msg = f"{p}:{n} still has a '{TODO_MARK}' marker: {line.strip()}"
                if release:
                    fail(msg)
                warn(msg)


def ensure_node_tools():
    mods = os.path.join(TOOLS, "node_modules")
    if not (os.path.isdir(os.path.join(mods, "katex")) and os.path.isdir(os.path.join(mods, "plotly.js-dist-min"))):
        os.makedirs(TOOLS, exist_ok=True)
        subprocess.run(["npm", "install", "--prefix", TOOLS, "--no-save", "katex@0.16.11",
                        "plotly.js-dist-min@2.35.2"], check=True)
    return mods


# ---------------------------------------------------------------- math + markdown
MATH_RE = re.compile(r"\$\$(.+?)\$\$|\$(?!\$)(.+?)(?<!\\)\$", re.S)


def render_katex(items, mods):
    """items: list of (tex, display) -> list of HTML strings (one node call)."""
    js = ("const katex=require('katex');let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>{const a=JSON.parse(s);process.stdout.write(JSON.stringify("
          "a.map(([t,d])=>katex.renderToString(t,{displayMode:d,throwOnError:true,output:'html'}))))});")
    r = subprocess.run(["node", "-e", js], input=json.dumps(items), capture_output=True, text=True,
                       env=dict(os.environ, NODE_PATH=mods), check=False)
    if r.returncode:
        raise RuntimeError("KaTeX failed:\n" + r.stderr)
    return json.loads(r.stdout)


LEXERS = {"python": PythonLexer, "wgsl": WgslLexer, "js": JavascriptLexer, "javascript": JavascriptLexer}


def code_html(src, lexer):
    return highlight(src, lexer, HtmlFormatter(cssclass="codehilite"))


def _fence(code, lang, attrs):
    return code_html(code, LEXERS[lang]()) if lang in LEXERS else ""


MD = MarkdownIt("commonmark", {"html": True, "highlight": _fence}).enable("table")


def md_to_html(text, mods):
    """Markdown with $inline$ and $$display$$ math, tables and highlighted code."""
    found = []

    def protect(m):
        found.append((m.group(1) if m.group(1) is not None else m.group(2), m.group(1) is not None))
        return f"MATHX{len(found) - 1}X"

    # keep code (fenced blocks and inline spans) out of the math scan
    parts = re.split(r"(```.*?```|`[^`\n]*`)", text, flags=re.S)
    text = "".join(p if p.startswith("`") else MATH_RE.sub(protect, p) for p in parts)
    out = MD.render(text)
    rendered = render_katex(found, mods) if found else []

    def restore(m):
        i = int(m.group(1))
        h = rendered[i]
        return f'<div class="eq">{h}</div>' if found[i][1] else h

    out = re.sub(r"<p>\s*MATHX(\d+)X\s*</p>", restore, out)
    return re.sub(r"MATHX(\d+)X", restore, out)


def add_toc(body):
    """Give every <h2>/<h3> of the rendered theory an id; return (body with ids, table-of-contents HTML)."""
    used, items = set(), []

    def tag(m):
        level, inner = m.group(1), m.group(2)
        plain = re.sub(r"<[^>]+>", "", inner)
        num = re.match(r"(\d+(?:\.\d+)*)\.?\s", plain)
        slug = f"sec-{num.group(1).replace('.', '-')}" if num else \
            "sec-" + (re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-") or "x")
        while slug in used:
            slug += "-b"
        used.add(slug)
        items.append((level, slug, inner))
        return f'<h{level} id="{slug}">{inner}</h{level}>'

    body = re.sub(r"<h([23])>(.*?)</h\1>", tag, body, flags=re.S)
    if not items:
        fail("the theory has no <h2>/<h3> headings, so the table of contents would be empty")
    toc = "".join(f'<a class="toc{lv}" href="#{sid}">{inner}</a>' for lv, sid, inner in items)
    return body, toc


# ---------------------------------------------------------------- walkthrough
def build_walkthrough(mods):
    import runner
    import walkthrough
    cells = walkthrough.CELLS
    if not cells:
        fail("python/walkthrough.py defines no CELLS")
    results = runner.run_cells(cells, {})
    blocks, plots = [], {}
    for i, (cell, r) in enumerate(zip(cells, results)):
        if r["error"]:
            fail(f"walkthrough cell {i + 1} ({cell['title']}) failed:\n{r['error']}")
        code = cell["code"].strip("\n")
        out = f'<pre>{html.escape(r["out"])}</pre>' if r["out"] else ""
        divs = []
        for j, fig in enumerate(r["figs"]):
            key = f"wt-{i}-{j}"
            plots[key] = fig
            divs.append(f'<div class="wt-plot" data-wt-plot="{key}"></div>')
        blocks.append(
            f'<div class="wt-step"><div class="wt-stepnum">Step {i + 1}</div>'
            f'<div class="wt-title">{html.escape(cell["title"])}</div>'
            f'<div class="wt-prose">{md_to_html(cell["md"], mods)}</div>'
            f'<details class="wt-code" open><summary>Code</summary>{code_html(code, PythonLexer())}</details>'
            f'<div class="wt-out">{out}</div>'
            f'<div class="wt-plots">{"".join(divs)}</div>'
            f'<div class="wt-meta">ran in {r["secs"]:.2f} s (CPython, at build time)</div></div>')
        print(f"  step {i + 1:2d} {r['secs']:6.2f} s  {cell['title']}")
    return "\n".join(blocks), plots


# ---------------------------------------------------------------- notebook + self-test
def make_notebook(release, pages):
    """Regenerate notebook/walkthrough_molab.py with python/make_molab.py (its main())."""
    nb = os.path.join(NOTEBOOK_DIR, NOTEBOOK_NAME)
    path = os.path.join(PYDIR, "make_molab.py")
    if not os.path.isfile(path):
        msg = "python/make_molab.py is missing, so the MoLab notebook is not regenerated"
        if release:
            fail(msg)
        warn(msg)
        return nb
    import make_molab
    if os.path.exists(nb):
        os.remove(nb)               # so a generator that writes nothing cannot leave a stale notebook
    saved_argv = sys.argv
    sys.argv = [sys.argv[0]]        # keep --release etc. away from the generator's own argument parsing
    try:
        make_molab.main()
    finally:
        sys.argv = saved_argv
    if not os.path.isfile(nb):
        msg = f"make_molab.main() did not write notebook/{NOTEBOOK_NAME}"
        if release or pages:
            fail(msg)
        warn(msg)
    return nb


def selftest_reference():
    """numpy reference values for the page's self-test (python/selftest_lbm.py, selftest_fv.py)."""
    import selftest_fv
    import selftest_lbm
    import selftest_exact
    ref = {"lbm": selftest_lbm.reference(), "fv": selftest_fv.reference()}
    for k, v in ref.items():
        if not v.get("cases"):
            fail(f"selftest_{k}.reference() returned no cases")
    ref["exact"] = selftest_exact.reference()          # spin-up vs the exact azimuthal solution
    return ref


def raw_script(text, name):
    """Raw text placed inside a <script> block must not contain a closing tag."""
    if re.search(r"</script", text, re.I):
        fail(f"{name} contains '</script', which would end its <script> block early")
    return text


def js_json(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", help="directory to copy the page (index.html) and the notebook to (gh-pages)")
    ap.add_argument("--release", action="store_true",
                    help="strict build: TODO(measured) markers and a missing make_molab.py are errors")
    args = ap.parse_args()

    check_inputs()
    check_todos(args.release)
    mods = ensure_node_tools()
    plotly_path = os.path.join(mods, "plotly.js-dist-min", "plotly.min.js")
    if not os.path.isfile(plotly_path):
        fail(f"Plotly not found at {plotly_path}")

    print("running the Python breakdown (CPython)")
    wt_html, wt_plots = build_walkthrough(mods)
    print("generating the MoLab notebook")
    nb = make_notebook(args.release, bool(args.pages))
    print("numpy reference for the self-test")
    ref = selftest_reference()

    print("rendering markdown + KaTeX")
    theory = md_to_html(read("web", "theory_physics.md") + "\n\n" + read("web", "theory_lbm.md"), mods)
    theory, theory_toc = add_toc(theory)
    code_guide = md_to_html(read("web", "code_guide.md"), mods)
    parts = {
        "TITLE": TITLE,
        "BASE_CSS": read("web", "base.css"),
        "PYGMENTS_CSS": HtmlFormatter().get_style_defs(".codehilite"),
        "PLOTLY": raw_script(read_file(plotly_path), "plotly.min.js"),
        "THEORY": theory,
        "THEORY_TOC": theory_toc,
        "CODE_GUIDE": code_guide,
        "WALKTHROUGH": wt_html,
        "WT_PLOTS": js_json(wt_plots),
        "PY_SRC": js_json({name: read("python", name) for name in PY_FILES}),
        "WGSL_LBM": raw_script(read("web", "lbm.wgsl"), "web/lbm.wgsl"),
        "WGSL_FV": raw_script(read("web", "fv.wgsl"), "web/fv.wgsl"),
        "WGSL_RENDER": raw_script(read("web", "render.wgsl"), "web/render.wgsl"),
        "WGSL_ISO": raw_script(read("web", "iso.wgsl"), "web/iso.wgsl"),
        "CPUJS_SRC": code_html("\n".join(read("web", f) for f in CPU_JS), JavascriptLexer()),
        "GPUJS_SRC": code_html("\n".join(read("web", f) for f in GPU_JS), JavascriptLexer()),
        "APP_JS": raw_script("\n".join(read("web", f) for f in CPU_JS + GPU_JS + APP_JS_FILES),
                             "the page JavaScript"),
        "REF": js_json(ref),
        "PRESETS": js_json(json.loads(read("web", "presets.json"))),
        "MOLAB_URL": MOLAB_URL,
    }

    tpl = read("web", "template.html")
    used = set(PH_RE.findall(tpl))
    if used - set(parts):
        fail(f"template placeholders without content: {sorted(used - set(parts))}")
    if set(parts) - used:
        fail(f"content not placed in the template (would be silently dropped): {sorted(set(parts) - used)}")
    page = PH_RE.sub(lambda m: parts[m.group(1)], tpl)
    left = sorted(set(PH_RE.findall(page)))
    if left:
        fail(f"placeholders left unfilled in the page: {left}")

    os.makedirs(DIST, exist_ok=True)
    dst = os.path.join(DIST, PAGE_NAME)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"wrote {dst} ({len(page) / 1e6:.1f} MB)")

    if args.pages:
        if not os.path.isfile(nb):
            fail(f"notebook/{NOTEBOOK_NAME} is needed for --pages but does not exist")
        os.makedirs(args.pages, exist_ok=True)
        shutil.copy(dst, os.path.join(args.pages, "index.html"))
        shutil.copy(nb, os.path.join(args.pages, NOTEBOOK_NAME))
        print(f"copied index.html and {NOTEBOOK_NAME} to {args.pages}")


if __name__ == "__main__":
    main()
