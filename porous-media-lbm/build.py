"""Build the standalone page dist/porous-media-lbm-standalone.html.

    python build.py                 # build
    python build.py --pages DIR     # also copy it to DIR/index.html (gh-pages), with the notebook

Steps: run the Python breakdown with CPython to capture its outputs and
figures; generate the editable MoLab (marimo) notebook
notebook/walkthrough_molab.py from the same cells; prerender all LaTeX with
KaTeX; syntax-highlight the sources with Pygments; inline Plotly, the WGSL
shaders and the JavaScript into one HTML file.
Needs node/npm and the python packages numpy pygments markdown-it-py.
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
MOLAB_URL = "https://molab.marimo.io/github/chetools/claude/blob/gh-pages/porous-media-lbm/walkthrough_molab.py"
PYDIR = os.path.join(ROOT, "python")
TOOLS = os.path.join(ROOT, ".buildtools")
JS_FILES = ["bed.js", "cpu.js", "gpu.js", "app.js"]       # concatenated, in this order
sys.path.insert(0, PYDIR)


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


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
    out = re.sub(r"MATHX(\d+)X", restore, out)
    # markdown-it wraps highlighted fences in <pre><code>; Pygments already made its own block
    return re.sub(r'<pre><code[^>]*>(<div class="codehilite">.*?</div>)\s*</code></pre>', r"\1", out, flags=re.S)


LEXERS = {"python": PythonLexer, "wgsl": WgslLexer, "js": JavascriptLexer, "javascript": JavascriptLexer}


def _fence(code, lang, attrs):
    lexer = LEXERS.get(lang)
    return code_html(code, lexer()) if lexer else ""


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
            f'<div class="wt-prose">{md_to_html(cell["md"], mods)}</div>'
            f'<details class="wt-code" open><summary>Code</summary>{code_html(code, PythonLexer())}</details>'
            f'<div class="wt-out" id="wt-out-{i}">{out}</div>'
            f'<div class="wt-plots" id="wt-plots-{i}">{"".join(divs)}</div>'
            f'<div class="wt-meta" id="wt-meta-{i}"></div></div>')
        cells.append({"title": cell["title"], "code": code, "secs": r["secs"]})
        print(f"  step {i + 1:2d} {r['secs']:6.2f} s  {cell['title']}")
    return "\n".join(blocks), plots, cells


def js_json(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", help="directory to copy the page to as index.html")
    args = ap.parse_args()
    mods = ensure_node_tools()
    print("running the Python breakdown (CPython)")
    wt_html, wt_plots, wt_cells = build_walkthrough(mods)
    print("generating the MoLab notebook")
    import make_molab
    nb = os.path.join(ROOT, "notebook", "walkthrough_molab.py")
    os.makedirs(os.path.dirname(nb), exist_ok=True)
    with open(nb, "w", encoding="utf-8") as f:
        f.write(make_molab.generate())          # also checks one-definition-per-name
    print("rendering markdown + KaTeX")
    app_js = "\n".join(f"// ===== {f} =====\n" + read("web", f) for f in JS_FILES)
    parts = {
        "COUETTE_CSS": read("web", "base.css"),
        "PYGMENTS_CSS": HtmlFormatter().get_style_defs(".codehilite"),
        "THEORY": md_to_html(read("web", "theory.md"), mods),
        "GPU_GUIDE": md_to_html(read("web", "gpu_guide.md"), mods),
        "WHY_GPU": md_to_html(read("web", "why_gpu.md"), mods),
        "WALKTHROUGH": wt_html,
        "PY_SRC": code_html(read("python", "lbm.py"), PythonLexer()),
        "PY_TEST": code_html(read("python", "test_lbm.py"), PythonLexer()),
        "WGSL_SRC": code_html(read("web", "lbm.wgsl"), WgslLexer()),
        "RENDER_SRC": code_html(read("web", "render.wgsl"), WgslLexer()),
        "GPUJS_SRC": code_html(read("web", "gpu.js"), JavascriptLexer()),
        "LBM_WGSL_JSON": js_json(read("web", "lbm.wgsl")),
        "RENDER_WGSL_JSON": js_json(read("web", "render.wgsl")),
        "WT_PLOTS": js_json(wt_plots),
        "WT_CELLS": js_json(wt_cells),
        "PY_FILES": js_json({"lbm.py": read("python", "lbm.py"), "runner.py": read("python", "runner.py")}),
        "PLOTLY": read(os.path.relpath(os.path.join(mods, "plotly.js-dist-min", "plotly.min.js"), ROOT)),
        "APP_JS": app_js.replace("</script", "<\\/script"),
        "MOLAB_URL": MOLAB_URL,
    }
    tpl = read("web", "template.html")
    missing = set(re.findall(r"@@([A-Z0-9_]+)@@", tpl)) - set(parts)
    if missing:
        raise RuntimeError(f"template placeholders without content: {missing}")
    page = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: parts[m.group(1)], tpl)
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    dst = os.path.join(ROOT, "dist", "porous-media-lbm-standalone.html")
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
