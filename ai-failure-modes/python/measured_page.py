"""Turn measured/{questions,references}.json, runs/*.json and grades/*.json into the Measured tab.

stats() gives the numbers used in web/measured_intro.md; blocks() gives the per-question HTML.
Verbatim answers are rendered as Markdown without raw HTML and without math, so nothing in them can
break the page.
"""
import html
import json
import math
import os

from markdown_it import MarkdownIt

HERE = os.path.dirname(os.path.abspath(__file__))
MEAS = os.path.join(HERE, "..", "measured")
SAFE_MD = MarkdownIt("commonmark", {"html": False}).enable("table")

TITLES = {
    "compressor": "Gauge readings in a compression ratio", "pipe": "Pipe pressure drop with fittings",
    "npsh": "NPSH available for 90 °C water", "valve": "Control valve on 130 °C water",
    "vle": "Ethanol–water vapour above the azeotrope", "co2": "CO₂ density near the critical point",
    "hx": "1-2 shell-and-tube area", "relief": "Fire-case PSV on a propane bullet",
    "scaleup": "Semi-batch feed time at plant scale", "flash": "Condensate return line volume",
    "antoine": "Water vapour pressure at 180 °C by Antoine", "xylene": "Critical constants of m-xylene",
    "ammonia": "Latent heat of ammonia at 10 bar(a)", "scfm": "SCFM to Nm³/h",
    "dittus": "Dittus–Boelter exponent for cooling", "arrhenius": "Arrhenius with temperatures in °C",
    "nh3_heat": "Heat of reaction: per mole of what?", "immiscible": "Bubble point of water + n-hexane",
    "umf": "Minimum fluidization velocity", "robertson": "Robertson stiff kinetics",
    "h2": "Hydrogen density at 700 bar", "api521": "API 521 fire heat input in SI",
    "psm": "OSHA PSM threshold for chlorine", "citation": "Citation of the Peng–Robinson paper",
    "column_dp": "Rising column ΔP: flooding?",
}
CAT_ORDER = ["Conventions that differ between sources", "Numbers recalled from memory", "Non-ideal thermodynamics",
             "Regime checks in equipment sizing", "Empirical correlations", "Numerical code that runs but is wrong",
             "Codes, standards and regulations", "Citations", "Plant-floor knowledge"]


def load():
    qs = json.load(open(os.path.join(MEAS, "questions.json"), encoding="utf-8"))
    refs = json.load(open(os.path.join(MEAS, "references.json"), encoding="utf-8"))
    grades = {}
    for q in qs:
        p = os.path.join(MEAS, "grades", f"{q['id']}.json")
        if not os.path.exists(p):
            raise SystemExit(f"BUILD FAILED: missing grade file {p}")
        grades[q["id"]] = json.load(open(p, encoding="utf-8"))
    runs = {}
    for g in grades.values():
        for r in g["runs"]:
            runs[r["run"]] = json.load(open(os.path.join(MEAS, "runs", f"{r['run']}.json"), encoding="utf-8"))
    return qs, refs, grades, runs


def per_question(g):
    v = [r["verdict"] for r in g["runs"]]
    return {"n": len(v), "correct": v.count("correct"), "wrong": v.count("wrong"), "graded": len(v) - v.count("not_graded"),
            "computed": sum(bool(r.get("computed")) for r in g["runs"]),
            "side_runs": sum(bool(r.get("side_errors")) for r in g["runs"]),
            "side_n": sum(len(r.get("side_errors") or []) for r in g["runs"])}


def stats():
    qs, refs, grades, runs = load()
    s = {k: 0 for k in ("n", "correct", "wrong", "graded", "computed", "side_runs", "side_n")}
    for q in qs:
        for k, v in per_question(grades[q["id"]]).items():
            s[k] += v
    rows = ["| Question | Run | False side statement (checked) |", "|---|---|---|"]
    for q in qs:
        for r in grades[q["id"]]["runs"]:
            for e in r.get("side_errors") or []:
                rows.append(f"| {TITLES[q['id']]} | {r['run']} | {e.replace('|', '/')} |")
    return {"m_runs": str(s["n"]), "m_runs_per": str(s["n"] // len(qs)), "m_graded": str(s["graded"]),
            "m_correct": str(s["correct"]), "m_wrong": str(s["wrong"]), "m_tools": str(s["computed"]),
            "m_side_runs": str(s["side_runs"]), "m_side_n": str(s["side_n"]),
            "m_ub_all": f"{100 * (1 - 0.05 ** (1 / s['graded'])):.1f}",
            "m_ub_q": f"{100 * (1 - 0.05 ** (1 / 5)):.0f}",
            "side_table": "\n".join(rows)}


def case_summary():
    """Measured summary per question id (used for the App-tab pills)."""
    qs, refs, grades, runs = load()
    return {q["id"]: per_question(grades[q["id"]]) for q in qs}


def fmt_ref(ref):
    v = ref["value"]
    if v is None:
        return "not graded"
    if isinstance(v, (int, float)):
        return f"{v:.4g} {ref['unit']}"
    if isinstance(v, list):
        return f"{' to '.join(f'{x:.4g}' for x in v)} {ref['unit']}"
    if isinstance(v, dict):
        return ", ".join(f"{k} = {x:.4g}" for k, x in v.items())
    return str(v)


def fmt_accept(a):
    if a is None:
        return ""
    if isinstance(a, list):
        return f"accepted {a[0]:.4g} to {a[1]:.4g}"
    if isinstance(a, dict):
        return "accepted " + ", ".join(f"{k} {x[0]:.4g} to {x[1]:.4g}" for k, x in a.items())
    return f"accepted: {a}"


def blocks():
    """HTML for section 3: one <h3> per category, one block per question (<h4>, not in the contents)."""
    qs, refs, grades, runs = load()
    out = []
    for ci, cat in enumerate(CAT_ORDER):
        items = [q for q in qs if q["cat"] == cat]
        if not items:
            raise SystemExit(f"BUILD FAILED: no questions in category {cat}")
        out.append(f"<h3>3.{ci + 1} {html.escape(cat)}</h3>")
        for q in items:
            g, ref, s = grades[q["id"]], refs[q["id"]], per_question(grades[q["id"]])
            res = ("not graded" if s["graded"] == 0 else f"<b>{s['correct']} of {s['graded']} correct</b>") + \
                f" · computed or looked up in {s['computed']} of {s['n']}" + \
                (f" · false side statement in {s['side_runs']} of {s['n']}" if s["side_runs"] else "")
            side = "".join(f"<li>{html.escape(r['run'])}: {html.escape(e)}</li>"
                           for r in g["runs"] for e in (r.get("side_errors") or []))
            answers = []
            for r in g["runs"]:
                tag = {"correct": "pass", "wrong": "fail"}.get(r["verdict"], "")
                answers.append(
                    f'<div class="run"><div class="run-h"><b>{html.escape(r["run"])}</b> · '
                    f'<span class="{tag}">{html.escape(r["verdict"])}</span> · '
                    f'{"computed" if r.get("computed") else "from memory"} · grader: {html.escape(r.get("note", ""))}</div>'
                    f'<div class="run-a">{SAFE_MD.render(runs[r["run"]]["answer"])}</div></div>')
            out.append(
                f'<div class="mq"><h4 id="mq-{q["id"]}">{html.escape(TITLES[q["id"]])}</h4>'
                f'<blockquote>{html.escape(q["q"])}</blockquote>'
                f'<p class="mres">{res}</p>'
                f'<p><b>Reference:</b> {html.escape(fmt_ref(ref))}'
                f'{" (" + html.escape(fmt_accept(ref["accept"])) + ")" if ref.get("accept") else ""}.'
                f'{" " + html.escape(ref["note"]) if ref.get("note") else ""}</p>'
                f'<p><b>How a user would catch it:</b> {html.escape(q["catch"])}</p>'
                + (f'<p><b>False side statements found:</b></p><ul>{side}</ul>' if side else "")
                + f'<details class="mans"><summary>The five answers, verbatim</summary>{"".join(answers)}</details></div>')
    return "\n".join(out)
