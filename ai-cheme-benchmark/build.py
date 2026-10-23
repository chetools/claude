"""Build the standalone page dist/ai-cheme-benchmark-standalone.html.

    python build.py                       # dev build: results/data.json, else the FAKE sample with a loud warning
    python build.py --data PATH           # read another data file
    python build.py --release             # strict: real data required, no TODO left in web/methodology.md

Inputs: problems/P*.md, results/reference.json, results/data.json (schema in README of this docstring below),
python/solutions/*.py, web/*.  Output: one self-contained HTML file (Plotly inlined, KaTeX CSS from jsDelivr, math
prerendered with KaTeX at build time) and notebook/solutions_molab.py (regenerated from python/solutions).

data.json: {"models": [{id, name, vendor, release_date, params (billions or null), params_official, params_source,
            reasoning, effort, cost_usd}],
            "problems": [{id, topic, difficulty, title, parts}],
            "responses": [{model, problem, run (1..3), text, score (0..10), justification}]}
A data file with "sample": true is FAKE: the page shows a red banner and --release refuses it.
Model output (response text, justification) is untrusted: it is HTML-escaped here and never passes through markdown.
Any unfilled template placeholder, unused content, a Table of contents without headings or (with --release) a TODO
stops the build with a message.  Needs: node, python packages markdown-it-py, pygments.
"""
import argparse
import ast
import html
import json
import os
import re
import subprocess
import sys

from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import PythonLexer

ROOT = os.path.dirname(os.path.abspath(__file__))
PYDIR = os.path.join(ROOT, "python")
SOL = os.path.join(PYDIR, "solutions")
TOOLS = os.path.join(ROOT, ".buildtools")
DIST = os.path.join(ROOT, "dist")
sys.path.insert(0, PYDIR)

TITLE = "AI models on ChemE problems"
PAGE_NAME = "ai-cheme-benchmark-standalone.html"
NOTEBOOK_NAME = "solutions_molab.py"
MOLAB_URL = "https://molab.marimo.io/github/chetools/claude/blob/gh-pages/ai-cheme-benchmark/solutions_molab.py"
PH_RE = re.compile(r"@@([A-Z0-9_]+)@@")
N_RUNS = 3


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


def ensure_node_tools():
    mods = os.path.join(TOOLS, "node_modules")
    if not (os.path.isdir(os.path.join(mods, "katex")) and os.path.isdir(os.path.join(mods, "plotly.js-dist-min"))):
        os.makedirs(TOOLS, exist_ok=True)
        subprocess.run(["npm", "install", "--prefix", TOOLS, "--no-save", "katex@0.16.11",
                        "plotly.js-dist-min@2.35.2"], check=True)
    return mods


# ---------------------------------------------------------------- math + markdown (trusted project text only)
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


def code_html(src):
    return highlight(src, PythonLexer(), HtmlFormatter(cssclass="codehilite"))


MD = MarkdownIt("commonmark", {"html": True}).enable("table")
MD_BREAKS = MarkdownIt("commonmark", {"html": True, "breaks": True}).enable("table")   # problem statements: (a)/(b) lines stay separate


class MathBatch:
    """Collect every $..$ / $$..$$ of the page's trusted markdown, render them in ONE node call, then fill in."""

    def __init__(self, mods):
        self.mods, self.found = mods, []

    def md(self, text, tag, breaks=False):
        """Markdown -> HTML with math placeholders; returns a token to be replaced by finish()."""
        def protect(m):
            self.found.append((m.group(1) if m.group(1) is not None else m.group(2), m.group(1) is not None))
            return f"MATHX{len(self.found) - 1}X"

        parts = re.split(r"(```.*?```|`[^`\n]*`)", text, flags=re.S)
        text = "".join(p if p.startswith("`") else MATH_RE.sub(protect, p) for p in parts)
        out = (MD_BREAKS if breaks else MD).render(text)
        return out

    def finish(self, htmls):
        """Render all math once and substitute it in each html string."""
        rendered = render_katex(self.found, self.mods) if self.found else []

        def restore(m):
            i = int(m.group(1))
            h = rendered[i]
            return f'<div class="eq">{h}</div>' if self.found[i][1] else h

        res = []
        for out in htmls:
            out = re.sub(r"<p>\s*MATHX(\d+)X\s*</p>", restore, out)
            res.append(re.sub(r"MATHX(\d+)X", restore, out))
        return res


def add_toc(body, prefix, what, levels="23"):
    """Give every <h2>/<h3> of rendered HTML an id; return (body with ids, table-of-contents HTML).
    A heading's attributes are kept; data-toc="..." gives a shorter label for the contents."""
    used, items = set(), []

    def tag(m):
        level, attrs, inner = m.group(1), m.group(2) or "", m.group(3)
        label = re.search(r'data-toc="([^"]*)"', attrs)
        plain = re.sub(r"<[^>]+>", "", html.unescape(label.group(1) if label else inner))
        slug = prefix + (re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-") or "x")
        while slug in used:
            slug += "-b"
        used.add(slug)
        items.append((level, slug, label.group(1) if label else inner))
        return f'<h{level} id="{slug}"{attrs}>{inner}</h{level}>'

    body = re.sub(r"<h([" + levels + r"])((?:\s+[a-z-]+=\"[^\"]*\")*)>(.*?)</h\1>", tag, body, flags=re.S)
    if not items:
        fail(f"{what} has no <h2>/<h3> headings, so its table of contents would be empty")
    toc = "".join(f'<a class="toc{lv}" href="#{sid}">{inner}</a>' for lv, sid, inner in items)
    return body, toc


# ---------------------------------------------------------------- data
def parse_problem_md(pid):
    path = os.path.join(ROOT, "problems", f"{pid}.md")
    if not os.path.isfile(path):
        fail(f"problems/{pid}.md is missing")
    head, sep, statement = read_file(path).partition("\n---\n")
    if not sep:
        fail(f"problems/{pid}.md has no '---' line after its header")
    meta = {}
    for line in head.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, statement.strip()


def load_data(path, release):
    if path is None:
        real = os.path.join(ROOT, "results", "data.json")
        if os.path.isfile(real):
            path = real
        elif release:
            fail("--release needs results/data.json (the real results); it does not exist")
        else:
            path = os.path.join(ROOT, "results", "data_sample.json")
            warn("=" * 70)
            warn("results/data.json NOT FOUND: building from FAKE SAMPLE DATA. Do not publish this page.")
            warn("=" * 70)
    if not os.path.isfile(path):
        fail(f"data file not found: {path}")
    data = json.loads(read_file(path))
    is_sample = bool(data.get("sample")) or "sample" in os.path.basename(path)
    if is_sample and release:
        fail(f"--release refuses sample data ({path})")
    for key in ("models", "problems", "responses"):
        if not isinstance(data.get(key), list) or not data[key]:
            fail(f"{path}: '{key}' must be a non-empty list")
    return data, is_sample, path


def validate(data):
    mids = [m["id"] for m in data["models"]]
    pids = [p["id"] for p in data["problems"]]
    for what, ids in (("model", mids), ("problem", pids)):
        if len(set(ids)) != len(ids):
            fail(f"duplicate {what} ids")
    for m in data["models"]:
        for k in ("id", "name", "vendor", "release_date", "params", "params_official", "params_source",
                  "reasoning", "effort", "cost_usd"):
            if k not in m:
                fail(f"model {m.get('id')}: field '{k}' missing")
        if m["params"] is not None and not isinstance(m["params"], (int, float)):
            fail(f"model {m['id']}: params must be a number (billions) or null")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(m["release_date"])):
            fail(f"model {m['id']}: release_date must be YYYY-MM-DD")
    seen = set()
    for r in data["responses"]:
        for k in ("model", "problem", "run", "text", "score", "justification"):
            if k not in r:
                fail(f"response {r.get('model')}/{r.get('problem')}: field '{k}' missing")
        if r["model"] not in mids or r["problem"] not in pids:
            fail(f"response refers to unknown model/problem: {r['model']}/{r['problem']}")
        if r["run"] not in range(1, N_RUNS + 1):
            fail(f"{r['model']}/{r['problem']}: run must be 1..{N_RUNS}")
        if not isinstance(r["score"], (int, float)) or not 0 <= r["score"] <= 10:
            fail(f"{r['model']}/{r['problem']}/{r['run']}: score must be a number in 0..10")
        key = (r["model"], r["problem"], r["run"])
        if key in seen:
            fail(f"duplicate response {key}")
        seen.add(key)
    missing = [(m, p, k) for m in mids for p in pids for k in range(1, N_RUNS + 1) if (m, p, k) not in seen]
    if missing:
        warn(f"{len(missing)} of {len(mids) * len(pids) * N_RUNS} responses are missing, e.g. {missing[:3]}")


def expected_stats(data):
    """Overall per-model mean and run-total min/max in percent, for the page's self-test (independent of app.js)."""
    out = {}
    for m in data["models"]:
        per_run = {}
        for r in data["responses"]:
            if r["model"] == m["id"]:
                per_run.setdefault(r["run"], []).append(r["score"])
        totals = [10 * sum(v) / len(v) for v in per_run.values()]
        out[m["id"]] = dict(mean=sum(totals) / len(totals), min=min(totals), max=max(totals))
    return out


def fmt_value(v):
    if isinstance(v, bool) or isinstance(v, str):
        return str(v)
    if isinstance(v, (int, float)):
        return f"{v:.6g}"
    if isinstance(v, (list, tuple)):
        return ", ".join(fmt_value(x) for x in v)
    return json.dumps(v)


def esc(s):
    return html.escape(str(s), quote=True)


# ---------------------------------------------------------------- solutions
def solution_source(pid):
    """(docstring, code after the docstring) of python/solutions/pNN.py."""
    path = os.path.join(SOL, f"{pid.lower()}.py")
    if not os.path.isfile(path):
        fail(f"python/solutions/{pid.lower()}.py is missing")
    src = read_file(path)
    tree = ast.parse(src)
    doc = ast.get_docstring(tree, clean=False)
    if not doc:
        fail(f"python/solutions/{pid.lower()}.py has no module docstring")
    code = "\n".join(src.splitlines()[tree.body[0].end_lineno:]).strip("\n")
    return doc, code


# ---------------------------------------------------------------- page parts
def problems_html(data, ref, batch, models):
    """Pre-rendered Problems tab. Returns a list of (html with math tokens) strings; math finished later."""
    by_pr = {}
    for r in data["responses"]:
        by_pr.setdefault((r["problem"], r["model"]), []).append(r)
    blocks = []
    for p in data["problems"]:
        meta, statement = parse_problem_md(p["id"])
        for k in ("topic", "difficulty", "title"):
            if meta.get(k) != p[k]:
                warn(f"{p['id']}: {k} differs between data.json ({p[k]!r}) and problems/{p['id']}.md ({meta.get(k)!r}); "
                     "data.json is used")
        if p["id"] not in ref:
            fail(f"results/reference.json has no entry for {p['id']}")
        doc, _ = solution_source(p["id"])
        rows = "".join(f"<tr><td>({esc(k)})</td><td>{esc(fmt_value(v))}</td></tr>" for k, v in ref[p["id"]].items())
        title = f"{p['id']} · {p['title']}"
        out = [f'<section class="prob" data-pid="{esc(p["id"])}" data-topic="{esc(p["topic"])}" '
               f'data-diff="{esc(p["difficulty"])}">',
               f'<h2 data-toc="{esc(title)}">{esc(title)}</h2>',
               f'<div class="meta">{esc(p["topic"])} · {esc(p["difficulty"])}</div>',
               '<div class="label">Problem</div>', f'<div class="statement">{batch.md(statement, p["id"], breaks=True)}</div>',
               '<div class="label">Reference answer</div>',
               f'<div class="tablewrap"><table class="data"><thead><tr><th>Part</th><th>Value</th></tr></thead>'
               f'<tbody>{rows}</tbody></table></div>',
               '<div class="label">Reference solution</div>',
               f'<div class="explain">{batch.md(doc, p["id"])}</div>',
               '<div class="label">Responses</div>']
        for m in models:
            rs = sorted(by_pr.get((p["id"], m["id"]), []), key=lambda r: r["run"])
            if not rs:
                continue
            scores = ", ".join(f"{r['score']:g}" for r in rs)
            avg = sum(r["score"] for r in rs) / len(rs)
            out.append(f'<details class="resp"><summary>{esc(m["name"])}<span class="mean">mean {avg:.1f} / 10 '
                       f'(runs: {esc(scores)})</span></summary>')
            for r in rs:
                out.append(f'<h4>Run {r["run"]}<span class="score-pill">score {r["score"]:g} / 10</span></h4>'
                           f'<pre>{esc(r["text"])}</pre>'
                           f'<p class="just"><strong>Grader:</strong> {esc(r["justification"])}</p>')
            out.append("</details>")
        out.append("</section>")
        blocks.append("\n".join(out))
    return "\n".join(blocks)


def code_blocks(data, batch):
    common_src = read_file(os.path.join(SOL, "common.py"))
    common = code_html(common_src)
    sols = []
    for p in data["problems"]:
        doc, code = solution_source(p["id"])
        title = f"{p['id']} · {p['title']}"
        sols.append(f'<h2 data-toc="{esc(title)}">{esc(title)}</h2>'
                    f'<div class="explain">{batch.md(doc, p["id"])}</div>{code_html(code)}')
    return common, "\n".join(sols)


def make_notebook():
    import make_molab
    dst = os.path.join(ROOT, "notebook", NOTEBOOK_NAME)
    if os.path.exists(dst):
        os.remove(dst)             # so a generator that writes nothing cannot leave a stale notebook
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(make_molab.generate())
    if not os.path.isfile(dst) or os.path.getsize(dst) < 1000:
        fail("make_molab did not write notebook/solutions_molab.py")
    return dst


def js_json(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="results data file (default results/data.json, else the FAKE sample)")
    ap.add_argument("--release", action="store_true", help="strict: real data only, no TODO in web/methodology.md")
    args = ap.parse_args()

    data, is_sample, data_path = load_data(args.data, args.release)
    print(f"data: {os.path.relpath(data_path, ROOT)}{'  (SAMPLE, FAKE)' if is_sample else ''}")
    validate(data)
    ref = json.loads(read("results", "reference.json"))
    meth_md = read("web", "methodology.md")
    if args.release:
        todo = [f"web/methodology.md:{n}: {l.strip()}" for n, l in enumerate(meth_md.splitlines(), 1) if "TODO" in l]
        if todo:
            fail("--release: TODO left in the methodology:\n  " + "\n  ".join(todo))
    mods = ensure_node_tools()
    plotly_path = os.path.join(mods, "plotly.js-dist-min", "plotly.min.js")
    if not os.path.isfile(plotly_path):
        fail(f"Plotly not found at {plotly_path}")

    print("generating the MoLab notebook")
    make_notebook()
    print("rendering markdown + KaTeX (one batched call)")
    batch = MathBatch(mods)
    prob_raw = problems_html(data, ref, batch, data["models"])
    meth_raw = batch.md(meth_md, "methodology")
    common_html, sols_raw = code_blocks(data, batch)
    prob_html, meth_html, sols_html = batch.finish([prob_raw, meth_raw, sols_raw])
    prob_html, prob_toc = add_toc(prob_html, "prob-", "the Problems tab", levels="2")
    meth_html, meth_toc = add_toc(meth_html, "meth-", "the Methodology tab")

    web_data = dict(models=data["models"], problems=[{k: p[k] for k in ("id", "topic", "difficulty", "title")}
                                                     for p in data["problems"]],
                    responses=[{k: r[k] for k in ("model", "problem", "run", "score")} for r in data["responses"]])
    banner = ('<div class="banner">SAMPLE DATA: every number, response and score on this page is FAKE, made up to '
              'test the page generator. Do not publish.</div>') if is_sample else ""
    parts = {
        "TITLE": TITLE,
        "BASE_CSS": read("web", "base.css"),
        "PYGMENTS_CSS": HtmlFormatter().get_style_defs(".codehilite"),
        "PLOTLY": read_file(plotly_path),
        "BANNER": banner,
        "PROBLEMS": prob_html, "PROBLEMS_TOC": prob_toc,
        "METHODOLOGY": meth_html, "METHODOLOGY_TOC": meth_toc,
        "CODE_COMMON": common_html, "CODE_SOLUTIONS": sols_html,
        "DATA": js_json(web_data), "EXPECT": js_json(expected_stats(data)),
        "IS_SAMPLE": "true" if is_sample else "false",
        "APP_JS": read("web", "app.js"),
        "MOLAB_URL": MOLAB_URL, "NOTEBOOK_NAME": NOTEBOOK_NAME,
    }
    for name in ("PLOTLY", "APP_JS"):
        if re.search(r"</script", parts[name], re.I):
            fail(f"{name} contains '</script', which would end its <script> block early")

    # content that is not model output must not carry stray placeholders (PROBLEMS holds model text, which may)
    for name, val in parts.items():
        if name != "PROBLEMS" and PH_RE.search(val):
            fail(f"unfilled placeholder {PH_RE.search(val).group(0)} inside the content of {name}")
    tpl = read("web", "template.html")
    used = set(PH_RE.findall(tpl))
    if used - set(parts):
        fail(f"template placeholders without content: {sorted(used - set(parts))}")
    if set(parts) - used:
        fail(f"content not placed in the template (would be silently dropped): {sorted(set(parts) - used)}")
    # one pass, so text inside the substituted content (model output may contain '@@X@@') is never re-scanned
    page = PH_RE.sub(lambda m: parts[m.group(1)], tpl)
    m = re.search(r"<!--CODE_BODY-->(.*?)<!--/CODE_BODY-->", page, re.S)
    if not m or page.count("<!--CODE_TOC-->") != 1:
        fail("template.html needs one <!--CODE_TOC--> and one <!--CODE_BODY--> ... <!--/CODE_BODY--> block")
    code_body, code_toc = add_toc(m.group(1), "code-", "the Code tab")
    page = page[:m.start()] + code_body + page[m.end():]
    page = page.replace("<!--CODE_TOC-->", code_toc)
    # placeholders in the template skeleton itself: everything outside the substituted parts must be filled
    if "@@" in PH_RE.sub("", tpl):
        fail("malformed placeholder (an '@@' that is not @@NAME@@) in web/template.html")

    os.makedirs(DIST, exist_ok=True)
    dst = os.path.join(DIST, PAGE_NAME)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"wrote {dst} ({len(page) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
