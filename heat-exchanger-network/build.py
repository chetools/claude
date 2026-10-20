"""Build the standalone page dist/heat-exchanger-network-standalone.html.

    python build.py                 # build
    python build.py --pages DIR     # also copy it (index.html) and the notebook to DIR

Steps: compile the Rust solver to WebAssembly; run the Python breakdown with
CPython to capture its outputs and figures; generate the editable MoLab
(marimo) notebook from the same cells; build the benchmark tables from
benchmarks/*.json (re-evaluating every Rust network in Python); prerender
all LaTeX with KaTeX; syntax-highlight the sources; inline Plotly, HiGHS and
everything else into one HTML file.  Needs cargo (+ wasm32-unknown-unknown),
node/npm and numpy, scipy, pygments, markdown-it-py, marimo.
"""
import argparse
import base64
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
from pygments.lexers import PythonLexer, RustLexer

ROOT = os.path.dirname(os.path.abspath(__file__))
PAGE = "heat-exchanger-network"
MOLAB_URL = f"https://molab.marimo.io/github/chetools/claude/blob/gh-pages/{PAGE}/walkthrough_molab.py"
PYDIR = os.path.join(ROOT, "python")
SOLVER = os.path.join(ROOT, "solver")
TOOLS = os.path.join(ROOT, ".buildtools")
sys.path.insert(0, PYDIR)
NODE_PKGS = ["katex@0.16.11", "plotly.js-dist-min@2.35.2", "highs@1.15.3"]


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


def ensure_node_tools():
    mods = os.path.join(TOOLS, "node_modules")
    if not all(os.path.isdir(os.path.join(mods, n.split("@")[0])) for n in NODE_PKGS):
        os.makedirs(TOOLS, exist_ok=True)
        subprocess.run(["npm", "install", "--prefix", TOOLS, "--no-save"] + NODE_PKGS, check=True)
    return mods


def build_wasm():
    env = dict(os.environ, RUSTFLAGS="-C target-feature=+simd128")
    subprocess.run(["cargo", "build", "--release", "--target", "wasm32-unknown-unknown"], cwd=SOLVER, env=env, check=True)
    with open(os.path.join(SOLVER, "target", "wasm32-unknown-unknown", "release", "hen.wasm"), "rb") as f:
        return f.read()


# ---------------------------------------------------------------- math + markdown
MATH_RE = re.compile(r"\$\$(.+?)\$\$|\$(?!\$)(.+?)(?<!\\)\$", re.S)


def render_katex(items, mods):
    js = ("const katex=require('katex');let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>{const a=JSON.parse(s);process.stdout.write(JSON.stringify("
          "a.map(([t,d])=>katex.renderToString(t,{displayMode:d,throwOnError:true,output:'html'}))))});")
    r = subprocess.run(["node", "-e", js], input=json.dumps(items), capture_output=True, text=True,
                       env=dict(os.environ, NODE_PATH=mods), check=False)
    if r.returncode:
        raise RuntimeError("KaTeX failed:\n" + r.stderr)
    return json.loads(r.stdout)


def md_to_html(text, mods):
    """Markdown with $inline$ and $$display$$ math, tables and highlighted code."""
    found = []

    def protect(m):
        found.append((m.group(1) if m.group(1) is not None else m.group(2), m.group(1) is not None))
        return f"MATHX{len(found) - 1}X"

    # keep code blocks and inline code out of the math scan; \$ is a literal dollar
    parts = re.split(r"(```.*?```|`[^`\n]*`)", text, flags=re.S)
    parts = [p if p.startswith("`") else MATH_RE.sub(protect, p.replace(r"\$", "DOLLARX")) for p in parts]
    out = MD.render("".join(parts))
    rendered = render_katex(found, mods) if found else []

    def restore(m):
        i = int(m.group(1))
        return f'<div class="eq">{rendered[i]}</div>' if found[i][1] else rendered[i]

    out = re.sub(r"<p>\s*MATHX(\d+)X\s*</p>", restore, out)
    out = re.sub(r"MATHX(\d+)X", restore, out)
    return out.replace("DOLLARX", "$")


def _fence(code, lang, attrs):
    lexer = RustLexer() if lang == "rust" else PythonLexer() if lang == "python" else None
    return code_html(code, lexer) if lexer else ""


MD = MarkdownIt("commonmark", {"html": True, "highlight": _fence}).enable("table")


def code_html(src, lexer):
    return highlight(src, lexer, HtmlFormatter(cssclass="codehilite"))


# ---------------------------------------------------------------- walkthrough
def build_walkthrough(mods):
    import runner
    import walkthrough
    results = runner.run_cells(walkthrough.CELLS, {})
    blocks, plots, cells = [], {}, []
    for i, (cell, r) in enumerate(zip(walkthrough.CELLS, results)):
        if r["error"]:
            raise RuntimeError(f"walkthrough cell {i + 1} failed:\n{r['error']}")
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
            f'<div class="wt-prose theory">{md_to_html(cell["md"], mods)}</div>'
            f'<details class="wt-code" open><summary>Code</summary>{code_html(code, PythonLexer())}</details>'
            f'<div class="wt-out" id="wt-out-{i}">{out}</div>'
            f'<div class="wt-plots" id="wt-plots-{i}">{"".join(divs)}</div>'
            f'<div class="wt-meta" id="wt-meta-{i}">Ran at build time in {r["secs"]:.2f} s.</div></div>')
        cells.append({"title": cell["title"], "code": code, "secs": r["secs"]})
        print(f"  step {i + 1:2d} {r['secs']:6.2f} s  {cell['title']}")
    return "\n".join(blocks), plots, cells


def js_json(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", help="directory to copy the page (index.html) and notebook to")
    ap.add_argument("--first-pass", action="store_true",
                    help="allow the WebGPU build measurement to be missing (it is taken on this build)")
    args = ap.parse_args()
    mods = ensure_node_tools()
    print("compiling Rust -> WebAssembly")
    wasm = build_wasm()
    print(f"  {len(wasm) / 1024:.0f} kB")
    print("running the Python breakdown (CPython)")
    wt_html, wt_plots, wt_cells = build_walkthrough(mods)
    print("generating the MoLab notebook")
    import make_molab
    nb = os.path.join(ROOT, "notebook", "walkthrough_molab.py")
    os.makedirs(os.path.dirname(nb), exist_ok=True)
    with open(nb, "w", encoding="utf-8") as f:
        f.write(make_molab.generate())          # also checks one-definition-per-name
    print("benchmark tables")
    import bench_page
    bench_html, bench_nets = bench_page.html_and_nets(lambda t: md_to_html(t, mods))
    gpu_note = bench_page.gpu_note(allow_missing=args.first_pass)
    import hen
    print("rendering markdown + KaTeX")
    highs_dir = os.path.join(mods, "highs", "build")
    parts = {
        "COUETTE_CSS": read("web", "base.css"),
        "PYGMENTS_CSS": HtmlFormatter().get_style_defs(".codehilite"),
        "THEORY": md_to_html(read("web", "theory.md"), mods),
        "RUST_GUIDE": md_to_html(read("web", "rust_guide.md"), mods),
        "WHY_FAST": md_to_html(read("web", "why_fast.md"), mods),
        "WALKTHROUGH": wt_html,
        "PY_SRC": code_html(read("python", "hen.py"), PythonLexer()),
        "PY_TEST": code_html(read("python", "test_hen.py"), PythonLexer()),
        "PY_TEST_JS": code_html(read("python", "test_js_core.py"), PythonLexer()),
        "RS_SRC": code_html(read("solver", "src", "lib.rs"), RustLexer()),
        "RS_TEST": code_html(read("solver", "tests", "checks.rs"), RustLexer()),
        "WASM_KB": f"{len(wasm) / 1024:.0f}",
        "WASM_B64": base64.b64encode(wasm).decode(),
        "HIGHS_WASM_B64": base64.b64encode(open(os.path.join(highs_dir, "highs.wasm"), "rb").read()).decode(),
        "HIGHS_SRC": js_json(open(os.path.join(highs_dir, "highs.js"), encoding="utf-8").read()),
        "HEN_CONST": js_json(hen.page_data()),
        "WT_PLOTS": js_json(wt_plots),
        "WT_CELLS": js_json(wt_cells),
        "PY_FILES": js_json({"hen.py": read("python", "hen.py"), "runner.py": read("python", "runner.py")}),
        "BENCH_HTML": bench_html,
        "BENCH_NETS": js_json(bench_nets),
        "GPU_NOTE": gpu_note,
        "PLOTLY": read(os.path.relpath(os.path.join(mods, "plotly.js-dist-min", "plotly.min.js"), ROOT)),
        "CORE_JS": read("web", "core.js"),
        "GPU_JS": read("web", "gpu.js"),
        "APP_JS": read("web", "app.js"),
        "MOLAB_URL": MOLAB_URL,
    }
    tpl = read("web", "template.html")
    missing = set(re.findall(r"@@([A-Z0-9_]+)@@", tpl)) - set(parts)
    if missing:
        raise RuntimeError(f"template placeholders without content: {missing}")
    unused = set(parts) - set(re.findall(r"@@([A-Z0-9_]+)@@", tpl))
    if unused:
        raise RuntimeError(f"content without a placeholder: {unused}")
    page = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: parts[m.group(1)], tpl)
    left = re.findall(r"@@[A-Z0-9_]+@@", page)
    if left:
        raise RuntimeError(f"unfilled placeholders after substitution: {left[:5]}")
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    dst = os.path.join(ROOT, "dist", f"{PAGE}-standalone.html")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"wrote {dst} ({len(page) / 1e6:.1f} MB)")
    if args.pages:
        os.makedirs(args.pages, exist_ok=True)
        shutil.copy(dst, os.path.join(args.pages, "index.html"))
        shutil.copy(nb, os.path.join(args.pages, "walkthrough_molab.py"))
        print(f"copied index.html and walkthrough_molab.py to {args.pages}")


if __name__ == "__main__":
    main()
