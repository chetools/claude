"""Build dist/ai-failure-modes-standalone.html.

    python build.py                 # build
    python build.py --pages DIR     # also copy the page (index.html) and the MoLab notebook to DIR

Steps: regenerate the CoolProp property tables; run the tests; run every case and the step-by-step breakdown
with CPython (outputs shown on the page and used as the Pyodide self-test reference); generate the MoLab
notebook; prerender LaTeX with KaTeX; highlight sources with Pygments; inline everything into one HTML file.
Needs: node/npm, python packages CoolProp iapws pytest pygments markdown-it-py marimo.
"""
import argparse
import html
import json
import math
import os
import re
import shutil
import subprocess
import sys

from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import PythonLexer

ROOT = os.path.dirname(os.path.abspath(__file__))
PYDIR = os.path.join(ROOT, "python")
TOOLS = os.path.join(ROOT, ".buildtools")
NB_NAME = "ai_failure_modes_molab.py"
MOLAB_URL = f"https://molab.marimo.io/github/chetools/claude/blob/gh-pages/ai-failure-modes/{NB_NAME}"
sys.path.insert(0, PYDIR)


def fail(msg):
    raise SystemExit(f"BUILD FAILED: {msg}")


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as f:
        return f.read()


def ensure_node_tools():
    mods = os.path.join(TOOLS, "node_modules")
    if not all(os.path.isdir(os.path.join(mods, m)) for m in ("katex", "plotly.js-dist-min")):
        os.makedirs(TOOLS, exist_ok=True)
        subprocess.run(["npm", "install", "--prefix", TOOLS, "--no-save", "katex@0.16.11",
                        "plotly.js-dist-min@2.35.2"], check=True)
    return mods


# ---------------------------------------------------------------- math + markdown
MATH_RE = re.compile(r"\$\$(.+?)\$\$|\$(?!\$)(.+?)(?<!\\)\$", re.S)


def render_katex(items, mods):
    js = ("const katex=require('katex');let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>{const a=JSON.parse(s);process.stdout.write(JSON.stringify("
          "a.map(([t,d])=>katex.renderToString(t,{displayMode:d,throwOnError:true,output:'html'}))))});")
    r = subprocess.run(["node", "-e", js], input=json.dumps(items), capture_output=True, text=True,
                       env=dict(os.environ, NODE_PATH=mods), check=False)
    if r.returncode:
        fail("KaTeX failed:\n" + r.stderr)
    return json.loads(r.stdout)


def _fence(code, lang, attrs):
    if lang == "python":
        return code_html(code)
    return f'<pre class="prompt"><code>{html.escape(code)}</code></pre>'


MD = MarkdownIt("commonmark", {"html": True, "highlight": _fence}).enable("table")


def code_html(src):
    return highlight(src, PythonLexer(), HtmlFormatter(cssclass="codehilite"))


class Katex:
    """Collects math from all markdown sources, renders it in one node call, then restores it."""

    def __init__(self, mods):
        self.mods, self.found = mods, []

    def protect(self, text):
        def sub(m):
            self.found.append((m.group(1) if m.group(1) is not None else m.group(2), m.group(1) is not None))
            return f"MATHX{len(self.found) - 1}X"
        parts = re.split(r"(```.*?```)", text, flags=re.S)
        return "".join(p if p.startswith("```") else MATH_RE.sub(sub, p) for p in parts)

    def md(self, text):
        return MD.render(self.protect(text))

    def finish(self, htmls):
        rendered = render_katex(self.found, self.mods) if self.found else []

        def restore(m):
            i = int(m.group(1))
            return f'<div class="eq">{rendered[i]}</div>' if self.found[i][1] else rendered[i]
        out = []
        for h in htmls:
            h = re.sub(r"<p>\s*MATHX(\d+)X\s*</p>", restore, h)
            out.append(re.sub(r"MATHX(\d+)X", restore, h))
        return out


def add_toc(body, prefix, what):
    """Give every <h2>/<h3> an id; return (body, contents HTML). data-toc="..." gives a shorter label."""
    used, items = set(), []

    def tag(m):
        level, attrs, inner = m.group(1), m.group(2) or "", m.group(3)
        plain = re.sub(r"<[^>]+>", "", inner)
        num = re.match(r"(\d+(?:\.\d+)*)\.?\s", plain)
        slug = f"{prefix}{num.group(1).replace('.', '-')}" if num else \
            prefix + (re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-") or "x")
        while slug in used:
            slug += "-b"
        used.add(slug)
        label = re.search(r'data-toc="([^"]*)"', attrs)
        items.append((level, slug, label.group(1) if label else inner))
        return f'<h{level} id="{slug}"{attrs}>{inner}</h{level}>'

    body = re.sub(r"<h([23])((?:\s+[a-z-]+=\"[^\"]*\")*)>(.*?)</h\1>", tag, body, flags=re.S)
    if not items:
        fail(f"{what} has no <h2>/<h3> headings, so the table of contents would be empty")
    return body, "".join(f'<a class="toc{lv}" href="#{sid}">{inner}</a>' for lv, sid, inner in items)


def clean(o):
    """NaN -> None for JSON."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o


def js_json(obj):
    return json.dumps(clean(obj), separators=(",", ":"), allow_nan=False).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", help="directory to copy index.html and the notebook to")
    args = ap.parse_args()
    mods = ensure_node_tools()

    print("regenerating property tables (CoolProp)")
    subprocess.run([sys.executable, "make_props.py"], cwd=PYDIR, check=True)
    print("running tests")
    subprocess.run([sys.executable, "-m", "pytest", "-q", "test_cases.py"], cwd=PYDIR, check=True)

    import cases
    import make_molab
    import measured_page
    import runner
    import walkthrough

    # ---- case metadata, build-time results (self-test reference)
    meta, ref = [], {}
    msum = measured_page.case_summary()
    for c in cases.CASES:
        d = cases.defaults(c)
        meta.append({"id": c["id"], "title": c["title"], "quantity": c["quantity"], "naive": c["naive"],
                     "correct": c["correct"], "sweep": c["sweep"][0], "measured": msum[c["id"]],
                     "inputs": [{"name": n, "label": lab, "step": st, "value": d[n]} for n, lab, st in c["inputs"]]})
        ref[c["id"]] = {"run": cases.run(c["id"]), "sweep": cases.sweep(c["id"])}
        if not os.path.exists(os.path.join(ROOT, "web", "problems", f"{c['id']}.md")):
            fail(f"web/problems/{c['id']}.md missing")

    # ---- markdown sources (one KaTeX batch)
    kx = Katex(mods)
    x_az, T_az = cases.azeotrope()
    fills = {"co2_table": cases.co2_table(), "azeo_x": f"{100 * x_az:.1f}", "azeo_T": f"{T_az - 273.15:.1f}"}
    fills.update(measured_page.stats())
    app = [msum[c["id"]] for c in cases.CASES]
    fills["m_app_correct"] = str(sum(s["correct"] for s in app))
    fills["m_app_graded"] = str(sum(s["graded"] for s in app))

    def fill(text, name):
        def sub(m):
            if m.group(1) not in fills:
                fail(f"{name}: unknown fill [[{m.group(1)}]]")
            return fills[m.group(1)]
        return re.sub(r"\[\[([a-z0-9_]+)\]\]", sub, text)

    prob_md = [kx.md(fill(read("web", "problems", f"{c['id']}.md"), c["id"])) for c in cases.CASES]
    prompts_md = kx.md(fill(read("web", "prompts.md"), "prompts.md"))
    measured_md = kx.md(fill(read("web", "measured_intro.md"), "measured_intro.md"))

    # ---- step-by-step breakdown
    print("running the step-by-step breakdown (CPython)")
    results = runner.run_cells()
    steps_md, wt_plots = [], {}
    for i, (cell, r) in enumerate(zip(walkthrough.CELLS, results)):
        if r["error"]:
            fail(f"breakdown step {i + 1} failed:\n{r['error']}")
        steps_md.append(kx.md(cell["md"]))
        wt_plots[f"wt-{i}"] = r["figs"][0]
    rendered = kx.finish(prob_md + [prompts_md, measured_md] + steps_md)
    prob_html = rendered[:len(prob_md)]
    prompts_html = rendered[len(prob_md)]
    measured_html = rendered[len(prob_md) + 1]
    steps_html = rendered[len(prob_md) + 2:]

    blocks = []
    for i, (cell, r, prose) in enumerate(zip(walkthrough.CELLS, results, steps_html)):
        blocks.append(
            f'<div class="wt-step"><div class="wt-stepnum">Step {i + 1}</div>'
            f'<h3 class="wt-title" data-toc="{i + 1}. {html.escape(cell["title"])}">{html.escape(cell["title"])}</h3>'
            f'<div class="wt-prose">{prose}</div>'
            f'<details class="wt-code" open><summary>Code</summary>{code_html(cell["code"].strip(chr(10)))}</details>'
            f'<div class="wt-out"><pre>{html.escape(r["out"])}</pre></div>'
            f'<div class="wt-plot" data-wt-plot="wt-{i}"></div></div>')

    code_body = read("web", "code.html")
    code_body = code_body.replace("<!--STEPS-->", "\n".join(blocks))
    prompts_body, prompts_toc = add_toc(prompts_html, "p-", "the prompting guide")
    measured_body, measured_toc = add_toc(measured_html + measured_page.blocks(), "m-", "the Measured tab")

    print("generating the MoLab notebook")
    nb = os.path.join(ROOT, "notebook", NB_NAME)
    with open(nb, "w", encoding="utf-8") as f:
        f.write(make_molab.generate())
    subprocess.run([sys.executable, "-m", "marimo", "check", nb], check=True)

    parts = {
        "BASE_CSS": read("web", "base.css"),
        "PYGMENTS_CSS": HtmlFormatter().get_style_defs(".codehilite"),
        "PROMPTS": prompts_body,
        "PROMPTS_TOC": prompts_toc,
        "MEASURED": measured_body,
        "MEASURED_TOC": measured_toc,
        "MREF_SRC": code_html(read("python", "measured_ref.py")),
        "EXTRACT_SRC": code_html(read("python", "extract_runs.py")),
        "GRADING_MD": html.escape(read("measured", "GRADING.md")),
        "PROBLEMS": "\n".join(f'<div class="prob-md" data-case="{c["id"]}" hidden>{h}</div>'
                              for c, h in zip(cases.CASES, prob_html)),
        "CASE_OPTIONS": "\n".join(f'<option value="{c["id"]}">{i + 1}. {html.escape(c["title"])}</option>'
                                  for i, c in enumerate(cases.CASES)),
        "SETUP_SRC": code_html(walkthrough.SETUP.strip("\n")),
        "CASES_SRC": code_html(read("python", "cases.py")),
        "TEST_SRC": code_html(read("python", "test_cases.py")),
        "PROPS_SRC": code_html(read("python", "make_props.py")),
        "META": js_json(meta),
        "REF": js_json(ref),
        "WT_PLOTS": js_json(wt_plots),
        "PY_FILES": js_json({"cases.py": read("python", "cases.py"), "props_data.py": read("python", "props_data.py")}),
        "PLOTLY": read(os.path.relpath(os.path.join(mods, "plotly.js-dist-min", "plotly.min.js"), ROOT)),
        "APP_JS": read("web", "app.js"),
        "MOLAB_URL": MOLAB_URL,
        "NB_NAME": NB_NAME,
    }
    tpl = read("web", "template.html")
    if "<!--CODE_BODY-->" not in tpl:
        fail("template has no <!--CODE_BODY--> marker")
    code_body, code_toc = add_toc(code_body, "c-", "the Code tab")
    tpl = tpl.replace("<!--CODE_BODY-->", code_body).replace("<!--CODE_TOC-->", code_toc)
    found = set(re.findall(r"@@([A-Z0-9_]+)@@", tpl))
    if found - set(parts):
        fail(f"template placeholders without content: {found - set(parts)}")
    if set(parts) - found:
        fail(f"content without a placeholder: {set(parts) - found}")
    page = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: parts[m.group(1)], tpl)
    left = re.findall(r"@@[A-Z0-9_]+@@|\[\[[a-z0-9_]+\]\]|MATHX\d+X",
                      page.replace(parts["PLOTLY"], "").replace(parts["MEASURED"], ""))
    if re.search(r"@@[A-Z0-9_]+@@|MATHX\d+X", parts["MEASURED"]) or re.search(r"\[\[[a-z0-9_]+\]\]", measured_html):
        fail("unfilled markers in the Measured tab")
    if left:
        fail(f"unfilled markers in the page: {sorted(set(left))[:5]}")
    dst = os.path.join(ROOT, "dist", "ai-failure-modes-standalone.html")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"wrote {dst} ({len(page) / 1e6:.2f} MB)")
    if args.pages:
        os.makedirs(args.pages, exist_ok=True)
        shutil.copy(dst, os.path.join(args.pages, "index.html"))
        shutil.copy(nb, os.path.join(args.pages, NB_NAME))
        print(f"copied index.html and {NB_NAME} to {args.pages}")


if __name__ == "__main__":
    main()
