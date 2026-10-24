"""Single build of the HDA plant page: dist/hda-plant-<version>.html.

Sources: template.html, theory.md, python/*.py (balance, model_api, runner,
walkthrough), the two sheet SVGs (embedded, never edited) and topology.json.
Mandatory checks (all fail the build): unfilled/unused placeholders, math
extraction and KaTeX element count, literal TeX left in the page, citation
mechanical check, listing byte-identity, three-place module registration,
crop windows and subunit crops, TOC headings, boot compile guard.

Run:  python build_page.py [--dev] [--no-wasm]
  --dev      overwrite an existing dist file of the same version (development only)
  --no-wasm  skip the marimo html-wasm export
"""
import ast
import contextlib
import html as htmllib
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PYDIR = HERE / "python"
sys.path.insert(0, str(PYDIR))
sys.path.insert(0, str(HERE))

import balance  # noqa: E402
import model_api  # noqa: E402
import runner  # noqa: E402
import walkthrough  # noqa: E402
import make_molab  # noqa: E402

VERSION = "v1"
SLUG = "hda-plant"
TITLE = "Toluene hydrodealkylation plant"
OUT = HERE / "dist" / f"{SLUG}-{VERSION}.html"
SHEETS = {1: ROOT / "out" / "PFD-201-r1.svg", 2: ROOT / "out" / "PFD-202-r1.svg"}
SHEET_W, SHEET_H = 1680, 1190
TOPOLOGY = ROOT / "topology.json"
TOOLS = ROOT / ".buildtools" / "node_modules"
KATEX_VERSION = json.loads((TOOLS / "katex" / "package.json").read_text())["version"]
KATEX_CSS_URL = f"https://cdn.jsdelivr.net/npm/katex@{KATEX_VERSION}/dist/katex.min.css"
MOLAB_URL = ("https://molab.marimo.io/github/chetools/claude/blob/gh-pages/"
             "pfd-hda-example/walkthrough_molab.py")

# Equipment tag -> id of the Theory section that explains it (the Theory writer
# keeps these ids in step with the headings of theory.md; the build checks both ways).
SECTION_OF_TAG = {
    "V-201": "theory-feed-preparation", "P-201": "theory-feed-preparation",
    "E-201": "theory-feed-preparation",
    "H-201": "theory-fired-heater",
    "R-201": "theory-reactor",
    "E-202": "theory-effluent-cooling-and-separation", "V-202": "theory-effluent-cooling-and-separation",
    "LV-201": "theory-effluent-cooling-and-separation", "V-203": "theory-effluent-cooling-and-separation",
    "C-201": "theory-recycle-gas-and-purge", "PV-201": "theory-recycle-gas-and-purge",
    "E-203": "theory-benzene-column", "T-201": "theory-benzene-column", "E-204": "theory-benzene-column",
    "V-204": "theory-benzene-column", "P-202": "theory-benzene-column", "E-205": "theory-benzene-column",
    "T-202": "theory-toluene-column", "E-206": "theory-toluene-column", "V-205": "theory-toluene-column",
    "P-203": "theory-toluene-column", "E-207": "theory-toluene-column",
}
SUBUNIT_IDS = ["theory-feed-preparation", "theory-fired-heater", "theory-reactor",
               "theory-effluent-cooling-and-separation", "theory-recycle-gas-and-purge",
               "theory-benzene-column", "theory-toluene-column"]

# Module registration, place 1 of 3: files written to the Pyodide file system.
PYODIDE_MODULES = ["balance", "model_api", "runner", "walkthrough"]
# Place 3 of 3: the Code panel listing (module -> heading and one-sentence role).
CODE_LISTINGS = [
    ("balance", "balance.py", "The component balance model of the flowsheet (the model of the App panel)."),
    ("model_api", "model_api.py", "The page interface: the four inputs in, every displayed number out (also run at build time for the precomputed run)."),
    ("runner", "runner.py", "The cell runner that executes the walkthrough cells and captures printed output and figures."),
    ("walkthrough", "walkthrough.py", "The walkthrough cells: the single source of the Walkthrough sub-tab and of the notebooks."),
]
# Place 2 of 3 is make_molab.MODULE_REGISTRATION.

INPUT_LABELS = {  # key: (label, unit shown, step)
    "F": ("Fresh toluene feed rate, F", "kmol/h", 10),
    "X": ("Conversion per pass, X", "", 0.05),
    "beta": ("Purge fraction, β", "", 0.05),
    "r": ("H₂/toluene ratio at reactor inlet, r", "", 0.5),
}

# ---------------------------------------------------------------- boot Python
# Embedded in the worker; no backslash escapes (guard asserts this).
BOOT_PY = '''import json
import balance
import model_api


def _fail(message):
    return json.dumps({"ok": False, "error": message})


def _run(msg):
    try:
        res = model_api.payload(msg.get("F"), msg.get("X"), msg.get("beta"), msg.get("r"))
    except ValueError as err:
        return _fail(str(err))
    return json.dumps({"ok": True, "result": res}, allow_nan=False)


def handle(text):
    try:
        msg = json.loads(text)
        if not isinstance(msg, dict):
            return _fail("The request could not be read.")
        kind = msg.get("type")
        if kind == "run":
            return _run(msg)
        if kind == "selftest":
            b = balance.BASIS
            return _run({"F": b["F"], "X": b["X"], "beta": b["beta"], "r": b["r"]})
        return _fail("The request type is not recognised.")
    except Exception:
        import traceback
        print(traceback.format_exc())
        return _fail("The model could not be run with the supplied inputs.")
'''

WORKER_JS = '''importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");
/*BOOT_PY_BEGIN*/
var BOOT_PY = @@BOOT_LINES@@.join(String.fromCharCode(10));
/*BOOT_PY_END*/
var pyodide = null, handle = null;
function stage(text, pct){ postMessage({type: "stage", text: text, pct: pct}); }
self.addEventListener("message", async function(e){
  var m = e.data;
  if(m.type === "init"){
    try{
      stage("loading the Python runtime.", 25);
      pyodide = await loadPyodide();
      stage("loading numpy.", 55);
      await pyodide.loadPackage("numpy");
      stage("writing the model files.", 85);
      Object.keys(m.files).forEach(function(name){ pyodide.FS.writeFile(name, m.files[name]); });
      pyodide.runPython(BOOT_PY);
      handle = pyodide.globals.get("handle");
      postMessage({type: "ready"});
    }catch(err){
      postMessage({type: "bootfail", error: String(err)});
    }
  }else if(m.type === "req"){
    var text;
    if(!handle){
      text = JSON.stringify({ok: false, error: "The Python runtime is not ready."});
    }else{
      try{ text = handle(JSON.stringify(m.payload)); }
      catch(err){
        console.error(String(err));
        text = JSON.stringify({ok: false, error: "The Python runtime could not complete the request."});
      }
    }
    postMessage({type: "result", id: m.id, text: text});
  }
});
'''

# ---------------------------------------------------------------- mathematics
MATH_MARKERS = ("\\", "_", "^", "=")
TEX = []  # (tex, display)


def protect_math(text):
    """Replace math spans by tokens MATHPH<n>END and record the TeX.
    Display $$..$$ first; an inline $..$ span is math if it contains \\ _ ^ or =, or is a bare
    symbol of one to three letters ($F$, $X$, $r$); anything else is left literal (currency)."""
    assert "MATHPH" not in text, "reserved token in source text"

    def disp(m):
        TEX.append((m.group(1), True))
        return f"MATHPH{len(TEX) - 1}END"

    def inline(m):
        c = m.group(1)
        if (any(k in c for k in MATH_MARKERS) or re.fullmatch(r"[A-Za-z]{1,3}", c)) and "\n\n" not in c:
            TEX.append((c, False))
            return f"MATHPH{len(TEX) - 1}END"
        return m.group(0)

    text = re.sub(r"\$\$(.+?)\$\$", disp, text, flags=re.S)
    return re.sub(r"\$([^$]+)\$", inline, text)


KATEX_JS = r"""
const katex = require(process.argv[2] + '/katex');
const items = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = items.map(it => katex.renderToString(it.tex, {displayMode: it.display, throwOnError: true, strict: 'error'}));
process.stdout.write(JSON.stringify(out));
"""
KATEX_HTML = {}


def render_all_math():
    """One batched node + KaTeX call for every formula of the page."""
    if not TEX:
        return
    items = [{"tex": t, "display": d} for t, d in TEX]
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(KATEX_JS)
        script = f.name
    r = subprocess.run(["node", script, str(TOOLS)], input=json.dumps(items), capture_output=True,
                       text=True, timeout=120)
    Path(script).unlink()
    if r.returncode != 0:
        raise SystemExit("KaTeX failed:\n" + r.stderr)
    out = json.loads(r.stdout)
    assert len(out) == len(TEX)
    for i, h in enumerate(out):
        KATEX_HTML[i] = h


def restore_math(h):
    h = re.sub(r"MATHPH(\d+)END", lambda m: KATEX_HTML[int(m.group(1))], h)
    assert "MATHPH" not in h
    return h


from markdown_it import MarkdownIt  # noqa: E402

MD = MarkdownIt("commonmark").enable("table")


def md_block(text):
    return MD.render(protect_math(text))


def md_inline(text):
    return MD.renderInline(protect_math(text))


# ---------------------------------------------------------------- helpers
def slug(text):
    s = re.sub(r"<[^>]+>", "", text)
    s = re.sub(r"[^a-z0-9]+", "-", htmllib.unescape(s).lower()).strip("-")
    assert s, text
    return s


def add_heading_ids(h, prefix, seen):
    """Give every <h2>/<h3> an id prefix+slug; return (html, [(level, id, text)])."""
    heads = []

    def sub(m):
        lvl, inner = m.group(1), m.group(2)
        assert "MATHPH" not in inner, f"math in heading: {inner}"
        hid = prefix + slug(inner)
        assert hid not in seen, f"duplicate heading id {hid}"
        seen.add(hid)
        heads.append((int(lvl), hid, re.sub(r"<[^>]+>", "", inner)))
        return f'<h{lvl} id="{hid}">{inner}</h{lvl}>'

    return re.sub(r"<h([23])>(.*?)</h\1>", sub, h), heads


def toc_html(heads):
    assert heads, "panel has no headings for its contents"
    return "".join(f'<a href="#{i}"{" class=sub" if l == 3 else ""}>{htmllib.escape(t)}</a>'
                   for l, i, t in heads).replace("class=sub", 'class="sub"')


def sheet_svg(n, viewbox=None, label=""):
    svg = SHEETS[n].read_text(encoding="utf-8")
    m = re.match(r"<svg [^>]*>", svg)
    assert m, "sheet root tag"
    if viewbox:
        x, y, w, h = viewbox
        root = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
                f'viewBox="{x} {y} {w} {h}" style="max-width:{w}px;min-width:{min(w, 600)}px" '
                f'role="img" aria-label="{htmllib.escape(label)}">')
    else:
        root = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{SHEET_W}" height="{SHEET_H}" '
                f'viewBox="0 0 {SHEET_W} {SHEET_H}" role="img" aria-label="{htmllib.escape(label)}">')
    return root + svg[m.end():]


def fill_template(template, values):
    """Substitute @@NAME@@ ([A-Z0-9_]); fail on unfilled placeholders and on unused values."""
    names = set(re.findall(r"@@([A-Z0-9_]+)@@", template))
    missing, unused = names - set(values), set(values) - names
    assert not missing, f"unfilled placeholders: {sorted(missing)}"
    assert not unused, f"content with no placeholder: {sorted(unused)}"
    out = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: values[m.group(1)], template)
    return out


def json_for_script(obj):
    return json.dumps(obj, allow_nan=False).replace("</", "<\\/")


# ---------------------------------------------------------------- theory
CROP_RE = re.compile(r"^<!--\s*crop\s+(.*?)\s*-->\s*$")
KV_RE = re.compile(r'(\w+)=("[^"]*"|\S+)')


def process_theory(md_text):
    """Returns (html, headings, n_crops, crops_by_section). Crop directives sit
    directly under a heading and are replaced by numbered sub-process figures."""
    head_part, sep, ref_part = md_text.partition("\n## References")
    assert sep, "theory.md has no '## References' section"
    lines, out, crops, last_heading = head_part.splitlines(), [], [], None
    prev_nonblank = ""
    for ln in lines:
        m = CROP_RE.match(ln)
        if m:
            assert re.match(r"#{2,3} ", prev_nonblank), f"crop directive not directly under a heading: {ln[:60]}"
            kv = {k: v.strip('"') for k, v in KV_RE.findall(m.group(1))}
            assert set(kv) == {"sheet", "x", "y", "w", "h", "caption"}, f"crop keys: {sorted(kv)}"
            sheet, x, y, w, h = (int(kv[k]) for k in ("sheet", "x", "y", "w", "h"))
            assert sheet in SHEETS, f"crop sheet {sheet}"
            assert w > 0 and h > 0 and x >= 0 and y >= 0 and x + w <= SHEET_W and y + h <= SHEET_H, \
                f"crop window outside the sheet: {(x, y, w, h)}"
            crops.append(dict(section=slug(prev_heading), sheet=sheet, box=(x, y, w, h), caption=kv["caption"]))
            out.append(f'<div data-crop="{len(crops)}"></div>')
            continue
        if re.match(r"#{2,3} ", ln):
            prev_heading = re.sub(r"^#+\s*", "", ln)
        if ln.strip():
            prev_nonblank = ln
        out.append(ln)
    body_html = MD.render(protect_math("\n".join(out)))
    # citations in the body
    refs = re.findall(r"(?m)^(\d+)\.\s+(.+)$", ref_part)
    keys = [k for k, _ in refs]
    assert len(keys) == len(set(keys)), "duplicate reference numbers"
    body_wo_math = re.sub(r"MATHPH\d+END", "", "\n".join(out))
    cited = set(re.findall(r"\[(\d+)\]", body_wo_math))
    assert cited == set(keys), f"citation mismatch: cited {sorted(cited)}, listed {sorted(keys)}"
    body_html = re.sub(r"\[(\d+)\]", lambda m: f'<a href="#ref-{m.group(1)}">[{m.group(1)}]</a>', body_html)
    refs_html = "<h2>References</h2>\n<ol>" + "".join(
        f'<li id="ref-{k}" value="{k}">{md_inline(t)}</li>' for k, t in refs) + "</ol>"
    full = body_html + refs_html
    full, heads = add_heading_ids(full, "theory-", set())
    heads = [h for h in heads]
    # crops
    def crop_fig(m):
        k = int(m.group(1))
        c = crops[k - 1]
        cap = restore_inline_later(md_inline(c["caption"]))
        return (f'<figure class="subdiagram" id="fig-t{k}"><div class="figscroll">'
                f'{sheet_svg(c["sheet"], c["box"], f"Fig. T{k}: sub-process diagram")}</div>'
                f'<figcaption>Fig. T{k} | {cap}</figcaption></figure>')
    full = re.sub(r'<div data-crop="(\d+)"></div>', crop_fig, full)
    return full, heads, crops


def restore_inline_later(s):
    return s  # tokens are restored for the whole page in one pass


# ---------------------------------------------------------------- code panel
def highlight(src, lexer="python"):
    from pygments import highlight as hl
    from pygments.formatters import HtmlFormatter
    from pygments.lexers import get_lexer_by_name
    return hl(src, get_lexer_by_name(lexer), HtmlFormatter(nowrap=True))


def listing_html(src):
    h = highlight(src)
    # byte-identity: the visible text of the listing equals the file on disk
    text = htmllib.unescape(re.sub(r"<[^>]+>", "", h))
    assert text.rstrip("\n") == src.rstrip("\n"), "listing differs from the file on disk"
    return f'<pre><code class="highlight">{h}</code></pre>'


def modules_on_disk():
    return {p.stem for p in PYDIR.glob("*.py") if not p.name.startswith("test_")}


def check_registration():
    disk = modules_on_disk()
    places = {"Pyodide write list": set(PYODIDE_MODULES),
              "notebook generator": set(make_molab.MODULE_REGISTRATION),
              "Code listing": {m for m, _, _ in CODE_LISTINGS}}
    for name, s in places.items():
        assert s == disk, f"module registration mismatch in {name}: {sorted(s ^ disk)}"


def walkthrough_html(results):
    parts, heads, figs = [], [], {}
    for i, (cell, res) in enumerate(zip(walkthrough.CELLS, results), 1):
        assert res["error"] is None, f"walkthrough step {i} failed:\n{res['error']}"
        hid = f"code-walkthrough-step-{i}"
        heads.append((3, hid, f"Step {i}: {cell['title']}"))
        s = f'<section><h3 id="{hid}">Step {i}: {htmllib.escape(cell["title"])}</h3>\n{md_block(cell["md"])}'
        s += f'<div class="wt-label">Code</div>{listing_html(cell["code"])}'
        s += f'<div class="wt-label">Output (computed when this page was built)</div><pre class="wt-output">{htmllib.escape(res["out"].rstrip())}</pre>'
        for k, fg in enumerate(res["figs"], 1):
            fid = f"wtfig-{i}-{k}"
            figs[fid] = {"data": fg["data"], "layout": dict(fg["layout"], margin=dict(l=60, r=16, t=10, b=110),
                                                            paper_bgcolor="#fff", plot_bgcolor="#fff")}
            n = len(figs)
            s += (f'<figure><div id="{fid}" class="chart"></div><figcaption>Fig. W{n} | Figure of step {i}, '
                  f'computed when this page was built.</figcaption></figure>')
        parts.append(s + "</section>")
    return "\n".join(parts), heads, figs


# ---------------------------------------------------------------- app panel
def equipment_table(theory_heads):
    topo = json.loads(TOPOLOGY.read_text())
    equip = [(k, v["service"]) for k, v in topo["nodes"].items() if v["kind"] == "equip"]
    tags = {k for k, _ in equip}
    assert tags == set(SECTION_OF_TAG), f"SECTION_OF_TAG differs from topology: {sorted(tags ^ set(SECTION_OF_TAG))}"
    title_of = {i: t for _, i, t in theory_heads}
    for tag, sec in SECTION_OF_TAG.items():
        assert sec in title_of, f"{tag} points to a Theory section that does not exist: {sec}"
    rows = "".join(f'<tr><td>{t}</td><td>{htmllib.escape(s)}</td>'
                   f'<td><a href="#{SECTION_OF_TAG[t]}">{htmllib.escape(title_of[SECTION_OF_TAG[t]])}</a></td></tr>'
                   for t, s in equip)
    return ('<div class="tablescroll"><table><tr><th>Tag</th><th>Service</th><th>Explained in</th></tr>'
            + rows + "</table></div>")


def input_fields():
    out = []
    for k in ("F", "X", "beta", "r"):
        lo, hi, _, unit = balance.RANGES[k]
        label, u, step = INPUT_LABELS[k]
        rng = f"range {lo:g} to {hi:g}" + (f" {unit}" if unit else "")
        lab = label + (f" ({u})" if u else "")
        out.append(f'<label for="in-{k}">{htmllib.escape(lab)} <small>[{rng}]</small></label>'
                   f'<input id="in-{k}" type="number" step="{step}" min="{lo:g}" max="{hi:g}" '
                   f'value="{balance.BASIS[k]:g}" disabled>')
    return "\n".join(out)


def app_html(theory_heads, anchor_gap):
    intro = md_block(
        "The model computes the molar flow of every component (hydrogen, methane, benzene, toluene, diphenyl) "
        "in every numbered stream of the two sheets at one steady operating point. Flows are in kilomole per "
        "hour (kmol/h). The four inputs are the fresh toluene feed rate $F$ (kmol/h, stream 1); the toluene "
        "conversion per pass $X$ in the reactor (dimensionless); the purge fraction $\\beta$, the share of the "
        "high-pressure separator vapour (stream 12) sent to the purge (stream 13; dimensionless); and the "
        "hydrogen-to-toluene molar ratio $r$ at the reactor inlet (stream 9; dimensionless). "
        "The overall benzene yield is the benzene product flow (stream 28) divided by $F$; the hydrogen "
        "utilisation is the hydrogen consumed by the two reactions divided by the make-up hydrogen flow "
        "(stream 5); the methane fraction is the mole fraction of methane in the recycle gas (stream 15). "
        "The values on the sheets are sample values: they are the design-basis operating point "
        f"($F = 100$, $X = 0.75$, $\\beta = 0.25$, $r = 5$) with every flow rounded to 0.1 kmol/h. "
        "The model solves the same equations in floating point; at the design basis its results differ from the "
        f"printed sheet values by at most {anchor_gap:.2f} kmol/h (computed when the page was built).")
    cap1 = md_inline("Process flow diagram PFD-201 (sheet 1 of 2), reaction section: feed preparation, fired heater, "
                     "reactor, effluent cooling and separation, recycle gas and purge. Stream values on the sheet "
                     "are sample values, not the result of a rigorous simulation.")
    cap2 = md_inline("Process flow diagram PFD-202 (sheet 2 of 2), separation section: benzene column and toluene "
                     "column. Stream values on the sheet are sample values, not the result of a rigorous simulation.")
    cap3 = md_inline("Make-up hydrogen flow (stream 5) and recycle-gas flow (stream 15) against the purge fraction "
                     "$\\beta$ at the displayed $F$, $X$ and $r$. Each curve is twelve runs of the model over the "
                     "permitted range of $\\beta$; the cross marks the displayed run.")
    cap4 = md_inline("Toluene recycle flow (stream 37) and toluene flow into the reactor (stream 9) against the "
                     "conversion per pass $X$ at the displayed $F$, $\\beta$ and $r$. Each curve is fourteen runs of "
                     "the model over the permitted range of $X$; the cross marks the displayed run.")
    return f'''<h2 id="app-flowsheets">Process flow diagrams</h2>
<figure id="fig-1"><div class="figscroll">{sheet_svg(1, None, "Process flow diagram PFD-201")}</div><figcaption>Fig. 1 | {cap1}</figcaption></figure>
<figure id="fig-2"><div class="figscroll">{sheet_svg(2, None, "Process flow diagram PFD-202")}</div><figcaption>Fig. 2 | {cap2}</figcaption></figure>
<h2 id="app-equipment-index">Equipment index</h2>
<p>Each item of equipment is explained in the Theory section linked in the last column.</p>
{equipment_table(theory_heads)}
<h2 id="app-model">Balance model</h2>
{intro}
<div class="grid">
<div>
{input_fields()}
<button id="btn-run" disabled>Run model</button>
<p id="stale-note">The inputs differ from the displayed results. Press Run model to recompute.</p>
<p id="run-error" role="alert"></p>
</div>
<div>
<div class="cards" id="cards"></div>
<p id="out-note"></p>
<h3 id="app-key-streams">Key streams of the displayed run</h3>
<div class="tablescroll" id="out-table"></div>
<h3 id="app-purge-sweep">Purge trade-off</h3>
<figure><div id="chart-purge" class="chart"></div><figcaption>Fig. 3 | {cap3}</figcaption></figure>
<h3 id="app-conversion-sweep">Conversion trade-off</h3>
<figure><div id="chart-conv" class="chart"></div><figcaption>Fig. 4 | {cap4}</figcaption></figure>
</div>
</div>'''


def code_html(wt_html, wt_heads):
    heads = [(2, "code-notebooks", "Notebooks"),
             (3, "code-notebook-editable", "Editable notebook"),
             (3, "code-notebook-readonly", "Read-only walkthrough")]
    listings, lheads = [], []
    for mod, fname, role in CODE_LISTINGS:
        src = (PYDIR / f"{mod}.py").read_text(encoding="utf-8")
        hid = f"code-listing-{mod.replace('_', '-')}"
        lheads.append((2, hid, f"Listing: {fname}"))
        listings.append(f'<section><h2 id="{hid}">Listing: {fname}</h2><p>{role}</p>{listing_html(src)}</section>')
    heads += lheads + [(2, "code-walkthrough-steps", "Walkthrough")] + wt_heads
    wasm = (HERE / "dist" / "walkthrough" / "index.html").exists()
    readonly = ('<p><a href="walkthrough/index.html">Read-only walkthrough (WASM)</a>: the same seven steps, run in the '
                'browser by marimo; the code is visible and not editable and no sign-in is needed.</p>'
                if wasm else '<p>The read-only walkthrough page was not produced in this build.</p>')
    html = f'''<h2 id="code-notebooks">Notebooks</h2>
<p>The Walkthrough sub-tab shows the steps with results computed when this page was built. The same steps are available as a marimo notebook.</p>
<h3 id="code-notebook-editable">Editable notebook</h3>
<p><a href="{MOLAB_URL}">Editable notebook (MoLab)</a></p>
<p>The MoLab notebook is editable; run all cells once after opening.</p>
<p><a href="walkthrough_molab.py" download>Download the notebook (.py)</a>. It is one self-contained file: the model source is inlined into it.</p>
<h3 id="code-notebook-readonly">Read-only walkthrough</h3>
{readonly}
<div class="subtabs" id="code-subtabs">
<button id="subtab-listings" aria-selected="true">Listings</button>
<button id="subtab-walkthrough" aria-selected="false">Walkthrough</button>
</div>
<div id="code-listings">
{"".join(listings)}
</div>
<div id="code-walkthrough" style="display:none">
<h2 id="code-walkthrough-steps">Walkthrough</h2>
<p>Seven steps, one transformation each, with the code of the step and its printed output. The outputs and figures below were computed when this page was built; they are not computed live. Edit the inputs in the notebook to explore. <a class="btnlink" href="{MOLAB_URL}">Open the editable notebook in MoLab</a></p>
{wt_html}
</div>'''
    return html, heads


# ---------------------------------------------------------------- boot guard
def extract_boot_py(page):
    m = re.search(r'<script type="text/worker" id="worker-src">(.*?)</script>', page, re.S)
    assert m, "worker script not found in the page"
    w = m.group(1)
    m2 = re.search(r"/\*BOOT_PY_BEGIN\*/\s*var BOOT_PY = (\[.*?\])\.join\(String\.fromCharCode\(10\)\);\s*/\*BOOT_PY_END\*/", w, re.S)
    assert m2, "embedded Python not found in the worker script"
    lines = json.loads(m2.group(1))      # undo the JS string layer (JSON string escapes)
    return "\n".join(lines)


def boot_guard(page):
    """Extract the embedded Python from the finished page, parse it, execute it
    under CPython and drive it with a representative message set."""
    code = extract_boot_py(page)
    assert "\\" not in code, "embedded Python contains a backslash"
    ast.parse(code)
    ns = {"__name__": "boot_guard"}
    exec(compile(code, "<embedded boot python>", "exec"), ns)
    raw_handle = ns["handle"]

    def handle(text):                      # tracebacks printed by the page code go to the console only
        with contextlib.redirect_stdout(io.StringIO()):
            return raw_handle(text)
    good = {"type": "run", "F": "100", "X": "0.75", "beta": "0.25", "r": "5"}
    out = json.loads(handle(json.dumps(good)))
    assert out["ok"] and abs(out["result"]["metrics"]["benzene_product"] - 95.3) < 1.0, out
    st = json.loads(handle(json.dumps({"type": "selftest"})))
    assert st["ok"] and st["result"]["inputs"] == balance.BASIS, st
    assert st["result"] == json.loads(json.dumps(model_api.payload(**balance.BASIS))), "selftest differs from model_api"
    bad_inputs = [dict(good, F="0"), dict(good, F="501"), dict(good, X="0.2"), dict(good, X="1"),
                  dict(good, beta="0.7"), dict(good, beta="0.01"), dict(good, r="1"), dict(good, r="11"),
                  dict(good, F="abc"), dict(good, X=""), dict(good, r=None), dict(good, beta=[1]),
                  dict(good, F="nan"), dict(good, X="1e999"), {"type": "run"},
                  {k: v for k, v in good.items() if k != "beta"}]
    for msg in bad_inputs:
        r = json.loads(handle(json.dumps(msg)))
        assert r["ok"] is False and r["error"], msg
        assert "must" in r["error"], (msg, r)
        assert "Traceback" not in r["error"] and "File " not in r["error"], r
    for raw in ["not json", "[1, 2]", "42", json.dumps({"type": "unknown"}), json.dumps({}), ""]:
        r = json.loads(handle(raw))
        assert r["ok"] is False and r["error"] and "Traceback" not in r["error"], (raw, r)
    return True


def check_js_syntax(page):
    scripts = re.findall(r"<script(?: type=\"text/worker\" id=\"worker-src\")?>(.*?)</script>", page, re.S)
    scripts = [s for s in scripts if "var PANELS" in s or s.lstrip().startswith("importScripts(")]
    assert len(scripts) == 2, f"expected the page script and the worker script, found {len(scripts)}"
    for i, s in enumerate(scripts):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(s)
        r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
        Path(f.name).unlink()
        assert r.returncode == 0, f"JavaScript syntax error in script {i}:\n{r.stderr}"


# ---------------------------------------------------------------- main
def main(argv):
    dev = "--dev" in argv
    for p in list(SHEETS.values()) + [TOPOLOGY, HERE / "template.html", HERE / "theory.md",
                                      TOOLS / "plotly.js-dist-min" / "plotly.min.js"]:
        assert p.exists(), f"missing input: {p}"
    check_registration()
    make_molab.main()                    # regenerate notebooks (byte-identity of the inlined model asserted inside)
    (HERE / "dist").mkdir(exist_ok=True)
    shutil.copyfile(HERE / "notebook" / "walkthrough_molab.py", HERE / "dist" / "walkthrough_molab.py")
    if "--no-wasm" not in argv:
        wd = HERE / "dist" / "walkthrough"
        shutil.rmtree(wd, ignore_errors=True)
        r = subprocess.run(["marimo", "export", "html-wasm", str(HERE / "notebook" / "walkthrough_wasm.py"),
                            "-o", str(wd), "--mode", "run"], capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            print("WASM export failed:", r.stderr[-500:])
            shutil.rmtree(wd, ignore_errors=True)
        else:
            (wd / "CLAUDE.md").unlink(missing_ok=True)

    # theory
    theory_html, theory_heads, crops = process_theory((HERE / "theory.md").read_text(encoding="utf-8"))
    by_section = {}
    for c in crops:
        by_section.setdefault("theory-" + c["section"], []).append(c)
    for sid in SUBUNIT_IDS:
        assert sid in {i for _, i, _ in theory_heads}, f"subunit section missing in theory.md: {sid}"
        assert by_section.get(sid), f"subunit section has no crop directive: {sid}"

    # model runs at build time (same functions as the browser)
    pre = model_api.payload(**balance.BASIS)
    exact, _ = balance.solve_iter(exact=True)
    flt, _ = balance.solve()
    anchor_gap = max(abs(flt[n][c] - exact[n][c]) for n in balance.STREAMS for c in balance.C)

    # code panel
    results = runner.run_cells(walkthrough.CELLS)
    wt_html, wt_heads, wt_figs = walkthrough_html(results)
    code_body, code_heads = code_html(wt_html, wt_heads)
    app = app_html(theory_heads, anchor_gap)

    render_all_math()
    theory_html, code_body, app = (restore_math(x) for x in (theory_html, code_body, app))

    from pygments.formatters import HtmlFormatter
    pyg_css = HtmlFormatter(style="default").get_style_defs(".highlight")
    files = {f"{m}.py": (PYDIR / f"{m}.py").read_text(encoding="utf-8") for m in PYODIDE_MODULES}
    boot_lines = json.dumps(BOOT_PY.splitlines())
    plotly_js = (TOOLS / "plotly.js-dist-min" / "plotly.min.js").read_text(encoding="utf-8")
    assert "</script" not in plotly_js
    page = fill_template((HERE / "template.html").read_text(encoding="utf-8"), {
        "TITLE": TITLE,
        "INTRO": md_inline("Process flow diagrams PFD-201 and PFD-202 of a plant that produces benzene from toluene "
                           "and hydrogen, with a live component balance model computed in Python in the reader's "
                           "browser. Stream values are sample values, not the result of a rigorous simulation."),
        "KATEX_CSS_URL": KATEX_CSS_URL,
        "PYGMENTS_CSS": pyg_css,
        "APP_HTML": app,
        "THEORY_TOC": toc_html(theory_heads),
        "THEORY_HTML": theory_html,
        "CODE_TOC": toc_html(code_heads),
        "CODE_HTML": code_body,
        "VERSION": VERSION,
        "PRESTART_JSON": json_for_script(pre),
        "PY_FILES_JSON": json_for_script(files),
        "WALKTHROUGH_FIGS_JSON": json_for_script(wt_figs),
        "WORKER_JS": WORKER_JS.replace("@@BOOT_LINES@@", boot_lines),
        "PLOTLY_JS": plotly_js,
    })
    page = restore_math(page)

    # ---- checks on the finished page
    assert not re.search(r"@@[A-Z0-9_]+@@", page.replace(plotly_js, "")), "unfilled placeholder in the page"
    n_katex = page.count('class="katex"')
    assert n_katex == len(TEX), f"KaTeX elements {n_katex} != extracted formulas {len(TEX)}"
    visible = re.sub(r"<script.*?</script>|<style.*?</style>|<svg.*?</svg>|<pre.*?</pre>|<annotation.*?</annotation>",
                     "", page, flags=re.S)
    text = htmllib.unescape(re.sub(r"<[^>]+>", "", visible))
    for span in re.findall(r"\$[^$]{1,400}\$", text):
        assert "\\" not in span, f"literal TeX span left in the page: {span[:80]!r}"
    assert "$\\" not in text, "raw '$\\' in visible text"
    ids = re.findall(r' id="([^"]+)"', re.sub(r"<script.*?</script>", "", page, flags=re.S))
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, f"duplicate element ids: {sorted(dup)[:10]}"
    for href in set(re.findall(r'href="#([^"]+)"', page)):
        assert href in set(ids), f"fragment link without target: #{href}"
    boot_guard(page)
    assert extract_boot_py(page) == BOOT_PY.rstrip("\n"), "embedded Python differs from BOOT_PY"
    check_js_syntax(page)
    files_in_page = json.loads(re.search(r'id="py-files" type="application/json">(.*?)</script>', page, re.S)
                               .group(1).replace("<\\/", "</"))
    for name, src in files_in_page.items():
        assert src == (PYDIR / name).read_text(encoding="utf-8"), f"{name} in the page differs from disk"

    if OUT.exists() and OUT.read_text(encoding="utf-8") != page and not dev:
        raise SystemExit(f"{OUT.name} exists with different content: bump VERSION (or pass --dev while unpublished)")
    OUT.write_text(page, encoding="utf-8")
    print(f"page written: {OUT} ({OUT.stat().st_size} bytes); formulas: {len(TEX)}; crops: {len(crops)}; "
          f"anchor gap {anchor_gap:.3f} kmol/h; wasm walkthrough: {(HERE / 'dist' / 'walkthrough' / 'index.html').exists()}")


if __name__ == "__main__":
    main(sys.argv[1:])
