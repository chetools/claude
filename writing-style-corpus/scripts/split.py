"""Split each downloaded LaTeX paper into abstract, sections and figure captions.

Input data/raw/arxiv/<id>/ (LaTeX, or pdftotext output as a fallback), output data/sections/<id>.json:
  {"arxiv", "field", "abstract", "sections": [{"title", "type", "text"}], "captions": [...]}
Section types: introduction, methods, results, results_discussion, discussion,
conclusion, other. Math becomes [MATH], citations [CITE], references [REF].
Usage: python -I scripts/split.py
"""
import csv, json, re, sys
from pathlib import Path
from pylatexenc.latex2text import LatexNodes2Text

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "data" / "raw" / "arxiv", ROOT / "data" / "sections"

TYPES = [  # first match wins; order matters
    ("results_discussion", r"results?\s+and\s+discussion|discussion\s+and\s+results"),
    ("introduction", r"introduc|background|motivation|overview"),
    ("conclusion", r"conclu|summary|outlook|final remarks|concluding"),
    ("discussion", r"discussion|implications|limitations"),
    ("methods", r"method|material|experimental|approach|model|setup|procedure|"
                r"formulation|theory|framework|architecture|algorithm|data|preliminar"),
    ("results", r"result|experiment|evaluation|findings|performance|analysis"),
]


def strip_comments(s):
    return re.sub(r"(?<!\\)%.*", "", s)


def expand(path, root, depth=0):
    s = strip_comments(path.read_text(errors="replace"))
    if depth > 5:
        return s

    def sub(m):
        name = m.group(2).strip()
        for cand in (root / name, root / (name + ".tex")):
            if cand.is_file() and root in cand.resolve().parents:
                return expand(cand, root, depth + 1)
        return ""
    return re.sub(r"\\(input|include)\s*\{([^}]*)\}", sub, s)


def main_tex(d):
    cands = [p for p in d.rglob("*.tex")
             if re.search(r"\\begin\s*\{document\}", p.read_text(errors="replace"))]
    return max(cands, key=lambda p: p.stat().st_size) if cands else None


def braced(s, i):
    """Return (content, end) of the {...} group starting at s[i] == '{'."""
    depth, j = 0, i
    while j < len(s):
        if s[j] == "{" and s[j - 1] != "\\":
            depth += 1
        elif s[j] == "}" and s[j - 1] != "\\":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j + 1
        j += 1
    return s[i + 1:], len(s)


def commands(s, name):
    """All {...} arguments of \\name (optional [..] and * skipped)."""
    out = []
    for m in re.finditer(r"\\" + name + r"\*?\s*(\[[^\]]*\])?\s*\{", s):
        out.append(braced(s, m.end() - 1))
    return out


L2T = LatexNodes2Text(math_mode="text", strict_latex_spaces=True)


def to_text(tex):
    tex = re.sub(r"\\(cite[a-z]*|citep|citet|parencite|autocite)\*?(\[[^\]]*\])*\{[^}]*\}", " [CITE]", tex)
    tex = re.sub(r"\\(eq|auto|c|C)?ref\*?\{[^}]*\}", "[REF]", tex)
    tex = re.sub(r"\\label\{[^}]*\}", "", tex)
    tex = re.sub(r"\\footnote\s*\{", r"\\textrm{ (footnote: ", tex)
    tex = re.sub(r"\$\$.*?\$\$|\\\[.*?\\\]", " [MATH] ", tex, flags=re.S)
    tex = re.sub(r"\\begin\{(equation|align|eqnarray|gather|multline)\*?\}.*?"
                 r"\\end\{\1\*?\}", " [MATH] ", tex, flags=re.S)
    tex = re.sub(r"(?<!\\)\$[^$]+(?<!\\)\$", "[MATH]", tex)
    tex = re.sub(r"\\begin\{(figure|table|wrapfigure|algorithm|lstlisting|verbatim|tabular)\*?\}.*?"
                 r"\\end\{\1\*?\}", "", tex, flags=re.S)
    try:
        t = L2T.latex_to_text(tex)
    except Exception:
        t = re.sub(r"\\[a-zA-Z]+\*?|[{}]", " ", tex)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n\s*", "\n\n", t)
    return t.strip()


def classify(title, idx):
    low = title.lower()
    for typ, pat in TYPES:
        if re.search(pat, low):
            return typ
    return "introduction" if idx == 0 else "other"


def split_paper(tex):
    body = tex.split("\\begin{document}", 1)[-1].split("\\end{document}", 1)[0]
    body = re.split(r"\\bibliography\{|\\begin\{thebibliography\}|\\appendix\b", body)[0]
    abstract = ""
    m = re.search(r"\\begin\{abstract\}(.*?)\\end\{abstract\}", tex, re.S)
    if m:
        abstract = m.group(1)
    else:
        args = commands(tex, "abstract")
        abstract = args[0][0] if args else ""
    captions = [to_text(c) for c, _ in commands(body, "caption")]
    heads = list(re.finditer(r"\\section\*?\s*(\[[^\]]*\])?\s*\{", body))
    sections = []
    if not heads:  # letter-style paper with no sections
        sections.append({"title": "", "type": "body", "text": to_text(body)})
    for k, h in enumerate(heads):
        title, end = braced(body, h.end() - 1)
        stop = heads[k + 1].start() if k + 1 < len(heads) else len(body)
        title_t = to_text(title)
        sections.append({"title": title_t, "type": classify(title_t, k),
                         "text": to_text(body[end:stop])})
    return to_text(abstract), sections, [c for c in captions if c]


HEAD = re.compile(r"^\s*(?:\d+(?:\.\d+)*\.?\s+|[IVX]+\.\s+)?"
                  r"(abstract|introduction|background|methods?|materials and methods|"
                  r"results(?: and discussion)?|discussion|conclusions?|summary|"
                  r"acknowledg(?:e)?ments?|references)\s*$", re.I)
CAP = re.compile(r"^\s*(fig(?:ure)?\.?\s*\d+[.:|]?)", re.I)


def split_pdf_text(txt):
    """Heuristic split of pdftotext output: headings, paragraphs, captions."""
    lines = [l for l in txt.replace("\f", "\n").splitlines()]
    paras, cur = [], []
    for l in lines:
        if not l.strip():
            if cur:
                paras.append(" ".join(cur)); cur = []
        else:
            cur.append(l.strip())
    if cur:
        paras.append(" ".join(cur))
    paras = [re.sub(r"-\s(?=[a-z])", "", p) for p in paras if len(p) > 2]
    abstract, sections, captions = "", [], []
    title, buf = "", []

    def flush():
        if buf:
            k = len(sections)
            typ = classify(title, k) if title else ("body" if k == 0 else "other")
            sections.append({"title": title, "type": typ, "text": "\n\n".join(buf)})
    for p in paras:
        m = HEAD.match(p) if len(p) < 60 else None
        if m:
            if m.group(1).lower().startswith(("acknowledg", "references")):
                break
            if m.group(1).lower() == "abstract":
                title, buf = "abstract", []
                continue
            if title == "abstract":
                abstract = "\n\n".join(buf)
            else:
                flush()
            title, buf = m.group(1).strip().title(), []
        elif CAP.match(p) and len(p) > 40:
            captions.append(p)
        elif len(p.split()) >= 12:  # drop page numbers, running heads, affiliations
            buf.append(p)
    if title == "abstract":
        abstract = "\n\n".join(buf)
    else:
        flush()
    return abstract, sections, captions


def main():
    sel = {r["arxiv"]: r for r in csv.DictReader(open(ROOT / "data" / "selection.csv"))}
    OUT.mkdir(parents=True, exist_ok=True)
    n_ok = 0
    for axid, r in sel.items():
        d = RAW / axid.replace("/", "_")
        if not d.is_dir():
            continue
        mt = main_tex(d)
        if mt is not None:
            abstract, sections, captions = split_paper(expand(mt, d.resolve()))
            source = "latex"
        elif (d / "paper.txt").exists():
            abstract, sections, captions = split_pdf_text((d / "paper.txt").read_text(errors="replace"))
            source = "pdf"
        else:
            print("no text", axid, file=sys.stderr)
            continue
        words = sum(len(s["text"].split()) for s in sections)
        if words < 500:
            print("too short after split", axid, words, file=sys.stderr)
            continue
        (OUT / f"{axid.replace('/', '_')}.json").write_text(json.dumps(
            {"arxiv": axid, "field": r["field"], "role": r["role"], "title": r["title"],
             "source": source, "abstract": abstract, "sections": sections, "captions": captions}, indent=1))
        n_ok += 1
    print("split", n_ok, "papers")


if __name__ == "__main__":
    main()
