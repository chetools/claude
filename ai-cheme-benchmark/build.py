"""Build the standalone page dist/ai-cheme-benchmark-standalone.html.

    python build.py                       # dev build: results/data.json, else the FAKE sample with a loud warning
    python build.py --data PATH           # read another data file
    python build.py --release             # strict: real data required, no TODO left in web/methodology.md

Inputs: problems/P*.md, results/reference.json, results/data.json (schema in README of this docstring below),
python/solutions/*.py, web/*.  Output: one self-contained HTML file (Plotly inlined, KaTeX CSS from jsDelivr, math
prerendered with KaTeX at build time) and notebook/solutions_molab.py (regenerated from python/solutions).

data.json: {"models": [{id, name, vendor, release_date (YYYY-MM or YYYY-MM-DD), params (billions or null),
            params_active (optional, billions, mixture-of-experts), params_official, params_source,
            reasoning, effort, cost_usd}],
            "problems": [{id, topic, difficulty, title, parts}],
            "responses": [{model, problem, run (1..N_RUNS), text, score (0..10), justification, parts (optional)}]}
A data file with "sample": true is FAKE: the page shows a red banner and --release refuses it.
Model output (response text, justification) is untrusted: the justification is HTML-escaped; the response goes through
response_html() (markdown-it with HTML disabled + KaTeX), so it cannot inject HTML or script.
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
from error_types import TYPES, RULES                                # noqa: E402
from rubric import POINTS                                    # noqa: E402

TITLE = "AI models on ChemE problems"
PAGE_NAME = "ai-cheme-benchmark-standalone.html"
NOTEBOOK_NAME = "solutions_molab.py"
MOLAB_URL = "https://molab.marimo.io/github/chetools/claude/blob/gh-pages/ai-cheme-benchmark/solutions_molab.py"
PH_RE = re.compile(r"@@([A-Z0-9_]+)@@")
N_RUNS = 1


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


def katex_css(mods):
    """KaTeX stylesheet with its woff2 fonts embedded as data URIs, so the page renders maths offline."""
    import base64
    d = os.path.join(mods, "katex", "dist")
    css = read_file(os.path.join(d, "katex.min.css"))

    def font(m):
        path = os.path.join(d, "fonts", m.group(1) + ".woff2")
        if not os.path.exists(path):
            fail(f"KaTeX font missing: {path}")
        with open(path, "rb") as f:
            return 'src:url(data:font/woff2;base64,' + base64.b64encode(f.read()).decode() + ') format("woff2")'
    css, n = re.subn(r'src:url\(fonts/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\)(?:,url\([^)]*\) format\("[a-z]+"\))*', font, css)
    if n < 10 or "url(fonts/" in css:
        fail(f"KaTeX CSS: font inlining failed ({n} fonts replaced)")
    return css


def render_katex(items, mods):
    """items: list of (tex, display[, soft]) -> list of HTML strings (one node call)."""
    js = ("const katex=require('katex');let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>{const a=JSON.parse(s);process.stdout.write(JSON.stringify("
          "a.map(([t,d,soft])=>{if(!soft)return katex.renderToString(t,{displayMode:d,throwOnError:true,output:'html'});"
          "try{return katex.renderToString(t,{displayMode:d,throwOnError:false,output:'html'})}"
          "catch(e){return '<span class=\"katex-error\">'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')"
          ".replace(/>/g,'&gt;').replace(/\"/g,'&quot;')+'</span>'}})))});")
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
        self.mods, self.found, self.cache = mods, [], {}
        self.soft_total = self.soft_failed = 0     # model-response formulas rendered / that KaTeX could not parse

    def add_soft(self, tex, display):
        """Register one formula taken from (untrusted) model output; failures show as source text. Returns a token."""
        key = (tex, display)
        if key not in self.cache:
            self.found.append((tex, display, True))
            self.cache[key] = len(self.found) - 1
        return f"MATHX{self.cache[key]}X"

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
        soft = [h for f, h in zip(self.found, rendered) if len(f) > 2]
        self.soft_total, self.soft_failed = len(soft), sum("katex-error" in h for h in soft)

        def restore(m):
            i = int(m.group(1))
            h = rendered[i]
            if len(self.found[i]) > 2:      # model response: block-level span, valid inside <p>
                return f'<span class="eq">{h}</span>' if self.found[i][1] else h
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
        if not re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", str(m["release_date"])):
            fail(f"model {m['id']}: release_date must be YYYY-MM or YYYY-MM-DD")
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
        for part, lab in (r.get("errors") or {}).items():
            if part not in POINTS.get(r["problem"], {}) or lab.get("type") not in TYPES or not lab.get("note"):
                fail(f"{r['model']}/{r['problem']}: bad error label for part {part}: {lab!r}")
            if r.get("parts") and r["parts"].get(part, 0) >= POINTS[r["problem"]][part]:
                fail(f"{r['model']}/{r['problem']}: error label on full-marks part {part}")
        key = (r["model"], r["problem"], r["run"])
        if key in seen:
            fail(f"duplicate response {key}")
        seen.add(key)
    missing = [(m, p, k) for m in mids for p in pids for k in range(1, N_RUNS + 1) if (m, p, k) not in seen]
    if missing:
        warn(f"{len(missing)} of {len(mids) * len(pids) * N_RUNS} responses are missing, e.g. {missing[:3]}")


def expected_stats(data):
    """Per-model mean and run-total min/max in percent over the non-Frontier problems (the page's default selection),
    for the page's self-test (independent of app.js)."""
    frontier = {p["id"] for p in data["problems"] if p["difficulty"] == "Frontier"}
    out = {}
    for m in data["models"]:
        per_run = {}
        for r in data["responses"]:
            if r["model"] == m["id"] and r["problem"] not in frontier:
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


# ---------------------------------------------------------------- model responses (untrusted): markdown + math
# Raw replies are never changed (results/); this display fix-up happens only here, at build time.
# Safety: markdown-it has HTML disabled (so '<script>' is text), links/images/reference definitions are switched off,
# headings are demoted, and the only HTML added is KaTeX output for formulas.
MD_RESP = MarkdownIt("commonmark", {"html": False, "breaks": True}).enable("table")
MD_RESP.disable(["link", "image", "autolink", "reference", "code", "html_inline", "html_block"])
MD_RESP.renderer.rules["heading_open"] = lambda tokens, i, opts, env: "<h5>"     # never <h2>/<h3>: add_toc must skip them
MD_RESP.renderer.rules["heading_close"] = lambda tokens, i, opts, env: "</h5>\n"

TEX_CMD = re.compile(r"\\[A-Za-z]+")
TEX_MARK = re.compile(r"\\[A-Za-z]+|[\^_]\{")
RESP_MATH_RE = re.compile(
    r"\$\$((?:(?!\n[ \t]*\n).){1,3000}?)\$\$"                       # $$ ... $$ (may span lines, no blank line)
    r"|\\\[((?:(?!\n[ \t]*\n).){1,3000}?)\\\]"                      # \[ ... \]
    r"|\\\(((?:(?!\n[ \t]*\n).){1,1500}?)\\\)"                      # \( ... \)
    r"|(?<![\\$])\$(?![\s$])([^$\n]{1,300}?)(?<![\s\\$])\$(?![\d$])", re.S)   # $ ... $ on one line, not currency
FENCE_RE = re.compile(r"^[ \t]*```[ \t]*([A-Za-z]*)[ \t]*\n(.*?)(?:^[ \t]*```[ \t]*$|\Z)", re.S | re.M)
TICK_RE = re.compile(r"(?<!`)`([^`\n]+)`(?!`)")


def prose_words(tex):
    """Words of 4+ letters outside \\commands and \\text{...}: the sign of a sentence rather than a formula."""
    t = re.sub(r"\\(?:text|textbf|mathrm|mathbf|operatorname|mbox)\s*\{[^{}]*\}", " ", tex)
    return len(re.findall(r"[A-Za-z]{4,}", TEX_CMD.sub(" ", t)))


def looks_like_tex(s):
    return bool(TEX_MARK.search(s)) and prose_words(s) == 0


def response_html(text, batch):
    """Untrusted model reply -> safe HTML with math tokens (finished later by batch.finish).
    Display-only fixes: normalise \\( \\) \\[ \\] and $$ to math; LaTeX-only fences, backtick spans and bare LaTeX lines
    become math; stray or currency dollars stay literal text; headings are demoted."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\ue000-\uf8ff]", "", text).replace("MATHX", "MATH\u200bX")   # keep our token space clean

    def dollar(m):
        d = m.group(1) is not None or m.group(2) is not None
        tex = next(g for g in m.groups() if g is not None).strip()
        if not tex or (not d and m.group(4) is not None and prose_words(tex) >= 4):
            return m.group(0)
        return batch.add_soft(tex, d)

    def tick(m):
        return batch.add_soft(m.group(1).strip(), False) if looks_like_tex(m.group(1)) else m.group(0)

    def mixed(body):
        """A sentence containing LaTeX: wrap each run of formula-like words (no 4+ letter plain word) as inline math."""
        parts = re.split(r"(\s+)", body)
        words = [i for i, p in enumerate(parts) if p and not p.isspace()]
        res, i = [], 0
        ok = lambda p: prose_words(p) == 0 and "MATHX" not in p
        while i < len(parts):
            if not parts[i] or parts[i].isspace() or not ok(parts[i]):
                res.append(parts[i]); i += 1; continue
            j = i                                   # extend the run over formula-like words and the spaces between
            while j + 2 < len(parts) and ok(parts[j + 2]) and parts[j + 1].strip() == "" and "\n" not in parts[j + 1]:
                j += 2
            run = parts[i:j + 1]
            ws = [k for k, p in enumerate(run) if p and not p.isspace()]
            while ws and re.fullmatch(r"[a-z]{1,3}[.,;:]?", run[ws[0]]) and not TEX_MARK.search(run[ws[0]]):
                ws.pop(0)                           # drop plain little words (is, of, the) at the edges
            while ws and re.fullmatch(r"[a-z]{1,3}[.,;:]?", run[ws[-1]]) and not TEX_MARK.search(run[ws[-1]]):
                ws.pop()
            if ws and TEX_MARK.search("".join(run[ws[0]:ws[-1] + 1])):
                core = "".join(run[ws[0]:ws[-1] + 1])
                tail = re.search(r"[.,;:]+$", core)
                tex = core[:tail.start()] if tail else core
                res += run[:ws[0]] + [batch.add_soft(tex, False) + (tail.group(0) if tail else "")] + run[ws[-1] + 1:]
            else:
                res += run
            i = j + 1
        return "".join(res)

    def bare(line):
        mk = re.match(r"^(\s*(?:[-*+]|\d+[.)])?\s*)(.*?)\s*$", line)
        lead, body = mk.group(1), mk.group(2)
        if "MATHX" in body or not body:
            return line
        if not looks_like_tex(body):
            return lead + mixed(body)
        tail = re.search(r"[.,;:]+$", body)
        core = body[:tail.start()] if tail else body
        return lead + batch.add_soft(core, True) + (tail.group(0) if tail else "")

    def prose_part(seg):
        seg = TICK_RE.sub(tick, seg)
        seg = RESP_MATH_RE.sub(dollar, seg)
        seg = re.sub(r"\\[\[\]()](?=\s|$)|(?<=\s)\\[\[\]()]", "", seg)    # stray unmatched \[ \] \( \)
        return "\n".join(bare(l) for l in seg.split("\n"))

    out, pos = [], 0
    for m in FENCE_RE.finditer(text):
        out.append(prose_part(text[pos:m.start()]))
        lang, body = m.group(1).lower(), m.group(2)
        lines = [l.strip() for l in body.split("\n") if l.strip()]
        if lang in ("", "latex", "tex", "math") and lines and all(looks_like_tex(l.strip("$ ")) for l in lines):
            out.append("\n".join(batch.add_soft(l.strip("$ ").strip(), True) for l in lines) + "\n")
        else:
            out.append(m.group(0))
        pos = m.end()
    out.append(prose_part(text[pos:]))
    return MD_RESP.render("".join(out))


# ---------------------------------------------------------------- page parts
ERR_SHORT = {"method": "Method", "formula": "Formula", "numerical": "Arithmetic", "units": "Units",
             "incomplete": "Missing", "interpretation": "Interpretation"}


def num(x):
    return f"{x:g}"


def resp_id(pid, mid):
    """Anchor of one model's reply to one problem; grid cells link to it (and to its per-part notes)."""
    return f"r-{pid}-" + re.sub(r"[^a-z0-9]+", "-", mid.lower()).strip("-")


def error_legend():
    items = "".join(f'<li><span class="etag e-{k}">{esc(ERR_SHORT[k])}</span> <strong>{esc(v[0])}</strong>: {esc(v[1])}</li>'
                    for k, v in TYPES.items())
    return f'<ul class="elegend">{items}</ul>'


def error_grid(p, models, by_pr):
    """Models x parts table for one problem: where points were lost and what type of mistake it was."""
    pts = POINTS[p["id"]]
    head = "".join(f'<th>({esc(k)})<span class="pts">{num(v)} pt</span></th>' for k, v in pts.items())
    body = []
    for m in models:
        rs = by_pr.get((p["id"], m["id"]))
        if not rs:
            continue
        r = rs[0]
        rid = resp_id(p["id"], m["id"])
        parts, errs = r.get("parts") or {}, r.get("errors") or {}
        cells = []
        for k, mx in pts.items():
            got = parts.get(k)
            if got is None:
                cells.append("<td>–</td>")
            elif k in errs:
                e = errs[k]
                cells.append(f'<td class="ecell e-{e["type"]}" data-part="{esc(k)}" data-type="{e["type"]}">'
                             f'<a class="ejump" href="#{rid}-{esc(k)}" title="{esc(TYPES[e["type"]][0])}: {esc(e["note"])}">'
                             f'{esc(ERR_SHORT[e["type"]])}<span class="got">{num(got)}/{num(mx)}</span></a></td>')
            else:
                cells.append(f'<td class="ecell e-ok" data-part="{esc(k)}"><a class="ejump" href="#{rid}" title="full marks">'
                             f'✓<span class="got">{num(got)}/{num(mx)}</span></a></td>')
        body.append(f'<tr data-resp="{rid}"><th scope="row"><a class="ejump" href="#{rid}">{esc(m["name"])}</a></th>'
                    f'{"".join(cells)}<td class="tot">{num(r["score"])}</td></tr>')
    if not body:
        return ""
    return ('<div class="label">Where points were lost</div>'
            '<div class="tablewrap"><table class="egrid"><thead><tr><th>Model</th>' + head + '<th>Score</th></tr></thead>'
            '<tbody>' + "".join(body) + '</tbody></table></div>'
            '<p class="caption">Each cell is one part of the problem: a tick for full marks, otherwise the type of the main '
            'mistake with points earned / available. Hover over a cell for the note, or click it to open the '
            'model\'s reply at that note. '
            'A part that only repeats an earlier wrong value carries the type of the original mistake.</p>')


def error_chips(r, rid):
    errs = r.get("errors") or {}
    if not errs:
        return ""
    lis = "".join(f'<li id="{rid}-{esc(k)}" data-part="{esc(k)}" data-type="{e["type"]}">'
                  f'<span class="etag e-{e["type"]}">({esc(k)}) {esc(ERR_SHORT[e["type"]])}</span> {esc(e["note"])}</li>'
                  for k, e in sorted(errs.items()))
    return f'<ul class="elist">{lis}</ul>'


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
        if p["id"] == data["problems"][0]["id"]:
            out0 = ['<div class="label">Mistake types used in the grids below</div>', error_legend()]
        else:
            out0 = []
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
               error_grid(p, models, by_pr),
               '<div class="label">Responses</div>']
        out[:0] = out0
        if p["difficulty"] == "Frontier":
            given = [m for m in models if (p["id"], m["id"]) in by_pr]
            out.append('<p class="caption">Frontier problems were given only to models that scored 10/10 on every one '
                       'of P01–P12. ' + ("No model qualified." if not given else
                                         "Given to: " + esc(", ".join(m["name"] for m in given)) + "."))
        for m in models:
            rs = sorted(by_pr.get((p["id"], m["id"]), []), key=lambda r: r["run"])
            if not rs:
                continue
            scores = ", ".join(f"{r['score']:g}" for r in rs)
            avg = sum(r["score"] for r in rs) / len(rs)
            label = f"mean {avg:.1f} / 10 (runs: {scores})" if N_RUNS > 1 else f"score {avg:g} / 10"
            kinds = sorted({e["type"] for e in (rs[0].get("errors") or {}).values()})
            tags = "".join(f'<span class="etag e-{k}">{esc(ERR_SHORT[k])}</span>' for k in kinds)
            out.append(f'<details class="resp" id="{resp_id(p["id"], m["id"])}"><summary>{esc(m["name"])} {tags}<span class="mean">{esc(label)}</span></summary>')
            for r in rs:
                head = f'Run {r["run"]}<span class="score-pill">score {r["score"]:g} / 10</span>' if N_RUNS > 1 else "Response"
                out.append(f'<h4>{head}</h4>'
                           f'<div class="resp-body">{response_html(r["text"], batch)}</div>'
                           f'<p class="just"><strong>Grader:</strong> {esc(r["justification"])}</p>'
                           + error_chips(r, resp_id(p["id"], m["id"])))
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


def error_types_md(rs):
    n = {k: 0 for k in TYPES}
    for r in rs:
        for e in (r.get("errors") or {}).values():
            n[e["type"]] += 1
    if not sum(n.values()):
        fail("no error labels in the data (results/errors/ empty?)")
    return "\n".join(f"- **{v[0]}** ({n[k]} labelled parts): {v[1]}." for k, v in TYPES.items())


def error_agreement_md(rs):
    """Agreement of the two independent labelling passes (results/errors_reader1, _reader2) and how the final labels
    in results/errors relate to them. Computed here so the numbers on the page cannot go stale."""
    def load(d):
        out = {}
        for p in sorted(POINTS):
            f = os.path.join(ROOT, "results", d, f"{p}.json")
            if not os.path.exists(f):
                fail(f"results/{d}/{p}.json missing")
            for mid, parts in json.loads(read_file(f)).items():
                for k, e in parts.items():
                    out[(mid, p, k)] = e["type"]
        return out
    r1, r2 = load("errors_reader1"), load("errors_reader2")
    final = {(r["model"], r["problem"], k): e["type"] for r in rs for k, e in (r.get("errors") or {}).items()}
    if set(r1) != set(final) or set(r2) != set(final):
        fail("the two labelling passes and results/errors do not cover the same lost parts")
    n = len(final)
    agree = sum(r1[k] == r2[k] for k in final)
    # Cohen's kappa: agreement corrected for what two readers with these type frequencies would reach by chance
    pe = sum((sum(v == t for v in r1.values()) / n) * (sum(v == t for v in r2.values()) / n) for t in TYPES)
    kappa = (agree / n - pe) / (1 - pe)
    same1 = sum(final[k] == r1[k] for k in final if r1[k] != r2[k])
    same2 = sum(final[k] == r2[k] for k in final if r1[k] != r2[k])
    other = (n - agree) - sum(final[k] in (r1[k], r2[k]) for k in final if r1[k] != r2[k])
    if any(final[k] != r1[k] for k in final if r1[k] == r2[k]):
        fail("a final label differs from a type both readers agreed on")
    return (f"Two readers labelled the {n} lost parts independently, the second without seeing the first's labels "
            f"(the first worked from the type definitions alone, the second also from the rules above). They chose the same type for {agree} of {n} parts "
            f"({100 * agree / n:.0f} %; Cohen's kappa {kappa:.2f}). The {n - agree} parts where they differed were "
            f"settled by a third reader, who re-read the justification and the reply against the rules: {same1} "
            f"took the first reader's type, {same2} the second's" + (f" and {other} a third type" if other else "") + ". "
            "For five of them (P01 (b) and (c), where a model's own wrong Reynolds number from (a) was turbulent, so a "
            "turbulent correlation was consistent with it) the third reader's call was changed back to the second "
            "reader's on review. "
            "The labels are judgements about the reply, not measurements; the readers were AI models (Claude), "
            "not human graders.")


def fill_methodology(md, data):
    """Fill the @@NAME@@ numbers of web/methodology.md from the data, so they cannot go stale.
    Every grade-check flag must be listed, with the reason it was kept, in tests/reviewed_flags.json."""
    sys.path.insert(0, os.path.join(ROOT, "tests"))
    import check_grades
    rs = data["responses"]
    cut = sum("[reply cut off" in r["text"] for r in rs)
    fl = check_grades.flags(data) if all("parts" in r for r in rs) else []
    reviewed = json.loads(read("tests", "reviewed_flags.json"))
    keys = [f"{m} {p} ({k})" for m, p, k, *_ in fl]
    unreviewed = [k for k in keys if k not in reviewed]
    if unreviewed:
        fail("grade-check flags not reviewed in tests/reviewed_flags.json:\n  " + "\n  ".join(unreviewed))
    meta = json.loads(read("results", "model_meta.json"))
    shown = {m["id"] for m in data["models"]}
    absent = sorted(m["id"] for m in meta if m["id"] not in shown and not m.get("excluded"))
    if any(not a.endswith(":free") for a in absent):
        fail("models in model_meta.json without graded replies that are not free-tier (the absence note "
             f"would be wrong): {[a for a in absent if not a.endswith(':free')]}")
    sources = []
    for m in meta:
        if m["id"] not in shown:
            continue
        line = f"- {m['name'].split(': ', 1)[-1]} (`{m['id']}`): released {m['release_date']}; parameters " + \
               (m["params"] or "not published")
        if m.get("params_source"):
            line += f"; [source]({m['params_source']})"
        sources.append(line)
    total = sum(m["cost_usd"] or 0 for m in data["models"])
    vals = {
        "N_TRUNCATED": f"{cut} of the {len(rs)} replies were cut off at the provider's output limit.",
        "N_FLAGS": (f"It flagged {len(fl)} parts. Each was re-read and the grade was kept: "
                    + " ".join(f"{k}: {reviewed[k]}" for k in keys)) if fl else "It flagged no part.",
        "TOTAL_COST": f"The total over all models was ${total:.4f}.",
        "ABSENT": ("Free-tier models that were planned but are not on this page, because their runs did not "
                   "complete (the free endpoints were rate-limited or returned errors): "
                   + ", ".join(f"`{a}`" for a in absent) + ".") if absent else "",
        "MODEL_SOURCES": "\n".join(sources),
        "ERROR_TYPES": error_types_md(rs),
        "ERROR_RULES": "\n".join(f"{i}. {t}" for i, t in enumerate(RULES, 1)),
        "ERROR_AGREEMENT": error_agreement_md(rs),
    }
    def sub(m):
        if m.group(1) not in vals:
            fail(f"web/methodology.md: unknown placeholder {m.group(0)}")
        return vals[m.group(1)]
    return PH_RE.sub(sub, md)


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
    meth_md = fill_methodology(read("web", "methodology.md"), data)
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
    print(f"model-response formulas: {batch.soft_total} rendered, {batch.soft_failed} failed (shown as source text)")
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
        "KATEX_CSS": katex_css(ensure_node_tools()),
        "PYGMENTS_CSS": HtmlFormatter().get_style_defs(".codehilite"),
        "PLOTLY": read_file(plotly_path),
        "BANNER": banner,
        "PROBLEMS": prob_html, "PROBLEMS_TOC": prob_toc,
        "METHODOLOGY": meth_html, "METHODOLOGY_TOC": meth_toc,
        "CODE_COMMON": common_html, "CODE_SOLUTIONS": sols_html,
        "DATA": js_json(web_data), "EXPECT": js_json(expected_stats(data)),
        "IS_SAMPLE": "true" if is_sample else "false",
        "APP_JS": read("web", "app.js"),
        "N_MODELS": str(len(data["models"])),
        "RUNS_TEXT": "once each" if N_RUNS == 1 else f"{N_RUNS} runs each",
        "RUNS_CAPTION": "" if N_RUNS == 1 else (" and the runs. In brackets: the lowest and highest of the "
                                                 "per-run totals"),
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
