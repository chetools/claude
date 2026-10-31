"""Write one text bundle per unit type for the analysis agents.

Papers (role corpus): abstract, introduction, methods, results (results and
results_discussion), discussion (discussion and results_discussion),
conclusion, captions, body (papers without section headings).
Company writing: post, captions. Bundles larger than MAX_WORDS are split into
parts, balanced across groups. Output data/sections/bundles/<unit>[_partN].txt
(gitignored, deleted with the rest of the texts).
Usage: python -I scripts/bundle.py
"""
import csv, json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTDIR = ROOT / "data" / "sections" / "bundles"
MAX_WORDS = 70000
CAP_WORDS = 1500  # per document, so long sections do not dominate a bundle


def clip(text, n=CAP_WORDS):
    w = text.split()
    return text if len(w) <= n else " ".join(w[:n]) + " [...]"


def paper_units():
    units = {}
    for p in sorted((ROOT / "data" / "sections").glob("*.json")):
        d = json.loads(p.read_text())
        if d["role"] != "corpus":
            continue
        key = (d["arxiv"], d["field"])
        if d["abstract"]:
            units.setdefault("abstract", []).append((key, d["abstract"]))
        by = {}
        for s in d["sections"]:
            t = s["type"]
            targets = {"results_discussion": ["results", "discussion"]}.get(t, [t])
            for u in targets:
                by.setdefault(u, []).append((s["title"], s["text"]))
        for u, parts in by.items():
            if u == "other":
                continue
            text = "\n\n".join(f"## {t}\n{x}" if t else x for t, x in parts)
            units.setdefault(u, []).append((key, clip(text)))
        if d["captions"]:
            units.setdefault("captions", []).append(
                (key, clip("\n".join("- " + c for c in d["captions"]))))
    return units


def company_units():
    units = {}
    rows = {r["id"]: r for r in csv.DictReader(open(ROOT / "data" / "blogs.csv"))}
    for p in sorted((ROOT / "data" / "raw" / "blogs").glob("*.txt")):
        r = rows.get(p.stem, {})
        if r.get("role", "corpus") != "corpus":
            continue
        lines = p.read_text(errors="replace").splitlines()
        caps = [l[9:] for l in lines if l.startswith("CAPTION: ")]
        body = "\n".join(l for l in lines if not l.startswith("CAPTION: "))
        key = (p.stem, f"{r.get('org', p.stem.split('-')[0])} {r.get('kind', '')}".strip())
        units.setdefault("company_post", []).append((key, clip(body, 3000)))
        if caps:
            units.setdefault("company_captions", []).append((key, "\n".join("- " + c for c in caps)))
    return units


def write(units):
    OUTDIR.mkdir(parents=True, exist_ok=True)
    for old in OUTDIR.glob("*.txt"):
        old.unlink()
    for u, docs in units.items():
        words = sum(len(t.split()) for _, t in docs)
        k = max(1, math.ceil(words / MAX_WORDS))
        docs = sorted(docs, key=lambda d: d[0][1])  # by group, then deal round-robin
        for j in range(k):
            part = docs[j::k]
            name = f"{u}.txt" if k == 1 else f"{u}_part{j + 1}.txt"
            (OUTDIR / name).write_text("\n\n".join(
                f"=== {i} | {g}\n{t}" for (i, g), t in part))
            print(name, len(part), "docs", sum(len(t.split()) for _, t in part), "words")


if __name__ == "__main__":
    u = paper_units()
    if (ROOT / "data" / "blogs.csv").exists():
        u.update(company_units())
    write(u)
