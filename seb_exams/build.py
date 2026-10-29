"""Build the SEB exam pages.

    python build.py                      # every exam in exams/ and private/
    python build.py exams/mccabe-thiele  # one exam

For each exam directory with an exam.yaml this writes
    dist/<id>/index.html   the exam page (self-contained; no answers in it)
    dist/<id>/done.html    the page that quits SEB after submission (SEB quitURL)
    dist/<id>/<id>.seb     unencrypted SEB configuration that starts the exam
    dist/<id>/key.json     answer key + SEB Config Keys for the database (gitignored, see deploy.py)
and dist/results/index.html, the teacher's results page.
"""
import hashlib
import html
import json
import os
import plistlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml
from markdown_it import MarkdownIt

ROOT = Path(__file__).resolve().parent
MODS = ROOT / ".buildtools" / "node_modules"
DIST = ROOT / "dist"
SITE = "https://chetools.github.io/claude/seb_exams/"
WORKER_URL = "https://seb-exams.carloscomail.workers.dev"
KATEX_VERSION = "0.19.1"
PLACEHOLDER = re.compile(r"@@[A-Z0-9_]+@@")


def fail(msg):
    sys.exit(f"build failed: {msg}")


# ---------------------------------------------------------------- markdown + math
MATH_RE = re.compile(r"\$\$(.+?)\$\$|\$(?!\$)(.+?)(?<!\\)\$", re.S)
MD = MarkdownIt("commonmark", {"html": False}).enable("table")


def render_katex(items):
    js = ("const katex=require('katex');let s='';process.stdin.on('data',d=>s+=d);"
          "process.stdin.on('end',()=>{const a=JSON.parse(s);process.stdout.write(JSON.stringify("
          "a.map(([t,d])=>katex.renderToString(t,{displayMode:d,throwOnError:true,output:'html'}))))});")
    r = subprocess.run(["node", "-e", js], input=json.dumps(items), capture_output=True, text=True,
                       env=dict(os.environ, NODE_PATH=str(MODS)), check=False)
    if r.returncode:
        fail("KaTeX: " + r.stderr)
    return json.loads(r.stdout)


class Markdown:
    """Collects markdown snippets, then renders all their math with one KaTeX call."""

    def __init__(self):
        self.math, self.pending = [], []

    def add(self, text, inline=False):
        def protect(m):
            self.math.append((m.group(1) if m.group(1) is not None else m.group(2), m.group(1) is not None))
            return f"MATHX{len(self.math) - 1}X"

        out = MD.renderInline(MATH_RE.sub(protect, text)) if inline else MD.render(MATH_RE.sub(protect, text))
        slot = [out]
        self.pending.append(slot)
        return slot

    def finish(self):
        rendered = render_katex(self.math) if self.math else []

        def restore(m):
            i = int(m.group(1))
            return f'<div class="eq">{rendered[i]}</div>' if self.math[i][1] else rendered[i]

        for slot in self.pending:
            s = re.sub(r"<p>\s*MATHX(\d+)X\s*</p>", restore, slot[0])
            slot[0] = re.sub(r"MATHX(\d+)X", restore, s)


# ---------------------------------------------------------------- SEB configuration
def seb_json(v):
    """SEB-JSON as defined on safeexambrowser.org/developer/seb-config-key.html: keys sorted
    case-insensitively at every level, no whitespace, no character escaping, empty dicts removed."""
    if isinstance(v, dict):
        items = [(k, x) for k, x in v.items() if not (isinstance(x, dict) and not x)]
        items.sort(key=lambda kv: kv[0].lower())
        return "{" + ",".join(f'"{k}":{seb_json(x)}' for k, x in items) + "}"
    if isinstance(v, list):
        return "[" + ",".join(seb_json(x) for x in v) + "]"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return f'"{v}"'
    fail(f"SEB setting of unsupported type {type(v)}")


def seb_settings(exam, page_url):
    q = exam.get("seb", {})
    pw = q.get("quit_password_sha256", "")
    if pw and not re.fullmatch(r"[0-9a-f]{64}", pw):
        fail("seb.quit_password_sha256 must be 64 lower-case hex characters")
    prefix = page_url.replace(".", r"\.")  # the exam URLs contain no other regex metacharacters
    if re.search(r"[\\^$*+?()\[\]{}|]", page_url):
        fail(f"page URL {page_url} has regex metacharacters")
    return {
        "sebConfigPurpose": 0,                 # configure a client for starting an exam
        "startURL": page_url,
        "sendBrowserExamKey": True,            # Config Key in HTTP headers (older SEB versions)
        "browserWindowWebView": 3,             # "Prefer Modern": SEB JavaScript API for the Config Key
        "URLFilterEnable": True,
        "URLFilterEnableContentFilter": False, # a content filter would disable the JS API on macOS/iOS
        "URLFilterRules": [{"action": 1, "active": True, "expression": f"^{prefix}.*", "regex": True}],
        "allowQuit": True,
        "hashedQuitPassword": pw,              # proctor's password to quit before submitting
        "quitURL": page_url + "done.html",     # the "Quit Safe Exam Browser" link after submission
        "quitURLConfirm": True,
    }


# ---------------------------------------------------------------- exam
def load_exam(d):
    exam = yaml.safe_load((d / "exam.yaml").read_text())
    for k in ("id", "title", "duration_minutes", "questions"):
        if k not in exam:
            fail(f"{d}/exam.yaml: missing '{k}'")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", exam["id"]):
        fail(f"{d}: id must be lower-case letters, digits and hyphens")
    if exam["id"] != d.name:
        fail(f"{d}: id '{exam['id']}' must equal the directory name")
    ids = [q.get("id") for q in exam["questions"]]
    if len(set(ids)) != len(ids) or None in ids:
        fail(f"{d}: every question needs a unique id")
    for q in exam["questions"]:
        where = f"{d}/{q['id']}"
        if q.get("type") not in ("mc", "fill", "open"):
            fail(f"{where}: type must be mc, fill or open")
        if not (isinstance(q.get("points"), (int, float)) and q["points"] > 0):
            fail(f"{where}: points must be positive")
        if q["type"] == "mc":
            opts = q.get("options") or []
            if len(opts) < 2 or sum(bool(o.get("correct")) for o in opts) != 1:
                fail(f"{where}: needs at least two options and exactly one marked correct: true")
            if len({o.get("id") for o in opts}) != len(opts):
                fail(f"{where}: option ids must be unique")
        if q["type"] == "fill":
            if q["text"].count("[blank]") != 1:
                fail(f"{where}: the text needs exactly one [blank]")
            ans = q.get("answers") or []
            if not ans or any(len(str(a)) < 2 for a in ans):
                fail(f"{where}: needs a list of accepted answers (words of at least two letters)")
            if len({str(a)[1].lower() for a in ans}) != 1:
                fail(f"{where}: all accepted answers must share the second letter shown as the hint")
    return exam


def build_exam(d, out):
    exam = load_exam(d)
    eid = exam["id"]
    page_url = SITE + eid + "/"
    md = Markdown()
    pub_q, key_q = [], []
    with tempfile.TemporaryDirectory() as tmp:
        if (d / "figures.py").exists():  # regenerate figures on every build
            subprocess.run([sys.executable, str(d / "figures.py"), tmp], check=True)
        for q in exam["questions"]:
            text = q["text"].replace("[blank]", "BLANKX")
            p = {"id": q["id"], "type": q["type"], "points": q["points"], "html": md.add(text)}
            k = {"id": q["id"], "type": q["type"], "points": q["points"], "text": q["text"].strip()}
            if q.get("figure"):
                f = Path(tmp) / q["figure"]
                if not f.exists():
                    f = d / q["figure"]
                if not f.exists():
                    fail(f"{d}/{q['id']}: figure {q['figure']} not found")
                svg = f.read_text()
                p["figure"] = svg[svg.index("<svg"):]
            if q["type"] == "mc":
                p["options"] = [{"id": o["id"], "html": md.add(o["text"], inline=True)} for o in q["options"]]
                p["shuffle"] = q.get("shuffle", True)
                k["correct"] = next(o["id"] for o in q["options"] if o.get("correct"))
                k["options"] = [{"id": o["id"], "text": o["text"]} for o in q["options"]]
            elif q["type"] == "fill":
                p["hint"] = str(q["answers"][0])[1].lower()
                k["answers"] = [str(a) for a in q["answers"]]
            else:
                k["model_answer"] = q.get("model_answer", "")
            pub_q.append(p)
            key_q.append(k)
        intro = md.add(exam.get("intro", ""))
        md.finish()

    def unslot(v):
        return v[0] if isinstance(v, list) and len(v) == 1 and isinstance(v[0], str) else v

    for p in pub_q:
        p["html"] = unslot(p["html"]).replace(
            "BLANKX", '<input class="blank" type="text" autocomplete="off" spellcheck="false" aria-label="blank">')
        for o in p.get("options", []):
            o["html"] = unslot(o["html"])

    settings = seb_settings(exam, page_url)
    config_key = hashlib.sha256(seb_json(settings).encode()).hexdigest()
    extra = [k.lower() for k in exam.get("seb", {}).get("extra_config_keys", []) or []]
    if any(not re.fullmatch(r"[0-9a-f]{64}", k) for k in extra):
        fail(f"{d}: seb.extra_config_keys must be 64-character hex Config Keys")

    public = {"id": eid, "title": exam["title"], "duration_minutes": exam["duration_minutes"],
              "require_seb": bool(exam.get("require_seb", True)), "intro": unslot(intro),
              "questions": pub_q, "api": WORKER_URL, "seb_link": "sebs://" + page_url.split("://", 1)[1] + eid + ".seb",
              "seb_file": eid + ".seb", "quit_url": settings["quitURL"]}
    key = {"id": eid, "title": exam["title"], "page_url": page_url, "require_seb": public["require_seb"],
           "config_keys": [config_key] + extra, "questions": key_q}

    # no answer may reach the public page
    pub_text = json.dumps(public)
    for k in key_q:
        for s in k.get("answers", []) + [k.get("model_answer", "")]:
            if s and json.dumps(s)[1:-1] in pub_text:
                fail(f"{d}/{k['id']}: answer text '{s[:40]}' appears in the public page")
    if re.search(r'"(correct|answers|model_answer)"', pub_text):
        fail("answer fields leaked into the public exam data")

    od = out / eid
    od.mkdir(parents=True, exist_ok=True)
    fill(ROOT / "web" / "exam.html", od / "index.html", {
        "TITLE": html.escape(exam["title"]), "KATEX_VERSION": KATEX_VERSION,
        "EXAM_JSON": json.dumps(public).replace("</", "<\\/"),
        "CSS": (ROOT / "web" / "style.css").read_text(), "JS": (ROOT / "web" / "exam.js").read_text()})
    fill(ROOT / "web" / "done.html", od / "done.html", {"TITLE": html.escape(exam["title"]),
                                                       "CSS": (ROOT / "web" / "style.css").read_text()})
    (od / f"{eid}.seb").write_bytes(plistlib.dumps(settings, fmt=plistlib.FMT_XML, sort_keys=True))
    (od / "key.json").write_text(json.dumps(key, indent=1))
    print(f"built {eid}: {len(pub_q)} questions, Config Key {config_key}")
    return eid, exam["title"]


def fill(template, dest, values):
    s = template.read_text()
    for k, v in values.items():
        s = s.replace(f"@@{k}@@", v)
    left = PLACEHOLDER.findall(s)
    if left:
        fail(f"{template.name}: unfilled placeholders {sorted(set(left))}")
    dest.write_text(s)


def main(args):
    dirs = [Path(a).resolve() for a in args] or sorted(
        p.parent for base in ("exams", "private") for p in (ROOT / base).glob("*/exam.yaml"))
    if not dirs:
        fail("no exam.yaml found")
    built = [build_exam(d, DIST) for d in dirs]
    (DIST / "results").mkdir(parents=True, exist_ok=True)
    fill(ROOT / "web" / "results.html", DIST / "results" / "index.html", {
        "CSS": (ROOT / "web" / "style.css").read_text(), "JS": (ROOT / "web" / "results.js").read_text(),
        "API": WORKER_URL})
    items = "".join(f'<li><a href="{e}/">{html.escape(t)}</a></li>' for e, t in built)
    fill(ROOT / "web" / "index.html", DIST / "index.html", {"CSS": (ROOT / "web" / "style.css").read_text(), "ITEMS": items})
    return built


if __name__ == "__main__":
    main(sys.argv[1:])
