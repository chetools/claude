"""Cut the test units from the held-out documents.

Papers (role heldout): abstract; introduction opening (whole paragraphs up to
about 350 words); conclusion or discussion opening (up to about 300 words);
up to three figure captions of at least 15 words. Papers without an
introduction use the opening of the body text.
Company writing (role heldout): opening of the post (up to about 450 words).
Units under 80 words are dropped.
Output: data/sections/validation/originals.json (gitignored; deleted with the texts).
Usage: python -I scripts/validation_units.py
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "sections" / "validation" / "originals.json"


def opening(text, limit):
    paras = [p.strip() for p in text.split("\n\n") if len(p.split()) >= 15]
    out, n = [], 0
    for p in paras:
        if n and n + len(p.split()) > limit:
            break
        out.append(p)
        n += len(p.split())
    if n > 1.6 * limit:  # one very long paragraph (PDF text): cut at a sentence end
        words = " ".join(out).split()[:limit]
        cut = " ".join(words)
        out = [cut[:cut.rfind(". ") + 1] or cut]
    return "\n\n".join(out)


def main():
    units = []
    for p in sorted((ROOT / "data" / "sections").glob("*.json")):
        d = json.loads(p.read_text())
        if d["role"] != "heldout":
            continue
        doc = d["arxiv"]
        by = {}
        for s in d["sections"]:
            by.setdefault(s["type"], []).append(s["text"])
        units.append({"doc": doc, "group": d["field"], "unit": "abstract", "text": d["abstract"]})
        intro = by.get("introduction") or by.get("body") or by.get("other")
        if intro:
            units.append({"doc": doc, "group": d["field"], "unit": "introduction",
                          "text": opening("\n\n".join(intro), 350)})
        end = by.get("conclusion") or by.get("discussion") or by.get("results_discussion")
        if end:
            units.append({"doc": doc, "group": d["field"], "unit": "conclusion",
                          "text": opening("\n\n".join(end), 300)})
        caps = [c for c in d["captions"] if len(c.split()) >= 15][:3]
        if caps:
            units.append({"doc": doc, "group": d["field"], "unit": "captions",
                          "text": "\n\n".join(caps)})
    rows = {r["id"]: r for r in csv.DictReader(open(ROOT / "data" / "blogs.csv"))}
    for i, r in rows.items():
        if r["role"] != "heldout":
            continue
        lines = (ROOT / "data" / "raw" / "blogs" / f"{i}.txt").read_text().splitlines()
        paras = []
        for l in lines:
            if l.startswith(("CAPTION: ", "# ")) or not l.strip():
                continue
            if l.startswith("- ") and paras:  # keep list items with their lead-in line
                paras[-1] += "\n" + l
            else:
                paras.append(l)
        units.append({"doc": i, "group": f"{r['org']} {r['kind']}", "unit": "post_opening",
                      "text": opening("\n\n".join(paras), 450)})
    units = [u for u in units if len(u["text"].split()) >= 80]
    for k, u in enumerate(units):
        u["uid"] = f"u{k + 1:02d}"
        u["words"] = len(u["text"].split())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(units, indent=1))
    for u in units:
        print(u["uid"], u["doc"], u["unit"], u["words"])


if __name__ == "__main__":
    main()
