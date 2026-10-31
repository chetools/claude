"""Measure style features of each text unit (paper section, caption set, blog post).

Input: data/sections/*.json (papers) and data/raw/blogs/*.txt (company writing).
Output: data/metrics_units.csv (one row per unit) and
        analysis/metrics_summary.csv (median and interquartile range per genre and unit type).
Usage: python -I scripts/metrics.py

Definitions (all per unit):
  sent_mean, sent_sd  mean and standard deviation of words per sentence
  sent_cv             sent_sd / sent_mean (spread of sentence length)
  long40_share        share of sentences with more than 40 words
  passive_share       share of sentences with a passive auxiliary (spaCy dep auxpass/nsubjpass)
  we_per_kw           occurrences of we/our/us per 1000 words
  you_per_kw          occurrences of you/your per 1000 words
  hedge_per_kw        hedge words (HEDGES list) per 1000 words
  connective_open     share of sentences opening with a connective (CONNECTIVES list)
  this_bare_open      share of sentences opening with This/These followed by a verb
  para_mean           mean words per paragraph
  emdash_per_kw, semicolon_per_kw, paren_per_kw   punctuation rates per 1000 words
  cite_per_sent       [CITE] markers per sentence
  nominal_per_kw      words ending in -tion/-ment/-ness/-ity/-ance/-ence per 1000 words
  cap_first_words     (captions) words in the first sentence of each caption, mean
  cap_first_noverb    (captions) share of captions whose first sentence has no finite verb
"""
import csv, json, re, statistics as st
from pathlib import Path
import spacy

ROOT = Path(__file__).resolve().parents[1]
HEDGES = {"may", "might", "could", "suggest", "suggests", "suggested", "appear", "appears",
          "likely", "possibly", "possible", "approximately", "indicate", "indicates", "seem",
          "seems", "perhaps", "potentially", "roughly", "presumably", "probably", "somewhat"}
CONNECTIVES = ("however", "thus", "therefore", "hence", "in contrast", "by contrast", "moreover",
               "furthermore", "additionally", "in addition", "consequently", "finally", "first",
               "second", "third", "next", "instead", "similarly", "conversely", "nevertheless",
               "still", "yet", "as a result", "for example", "for instance", "in particular",
               "indeed", "overall", "in summary", "importantly", "notably", "here", "to this end",
               "on the other hand", "in practice", "in other words")
NOMINAL = re.compile(r"\b\w{4,}(tion|ment|ness|ity|ance|ence)s?\b", re.I)

nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer"])


def features(text, paragraphs=None):
    doc = nlp(text[:400000])
    sents = [s for s in doc.sents if sum(t.is_alpha for t in s) >= 3]
    if len(sents) < 3:
        return None
    lens = [sum(not t.is_punct and not t.is_space for t in s) for s in sents]
    words = sum(lens)
    kw = words / 1000
    low = text.lower()
    toks = re.findall(r"[a-z']+", low)

    def opens(s, pre):
        st_ = s.text.strip().lower()
        return any(st_.startswith(c + " ") or st_.startswith(c + ",") for c in pre)
    paras = paragraphs or [p for p in text.split("\n\n") if len(p.split()) >= 5]
    return {
        "words": words, "sentences": len(sents),
        "sent_mean": st.mean(lens), "sent_sd": st.pstdev(lens),
        "sent_cv": st.pstdev(lens) / st.mean(lens),
        "long40_share": sum(l > 40 for l in lens) / len(lens),
        "passive_share": sum(any(t.dep_ in ("auxpass", "nsubjpass") for t in s) for s in sents) / len(sents),
        "we_per_kw": sum(t in ("we", "our", "us") for t in toks) / kw,
        "you_per_kw": sum(t in ("you", "your") for t in toks) / kw,
        "hedge_per_kw": sum(t in HEDGES for t in toks) / kw,
        "connective_open": sum(opens(s, CONNECTIVES) for s in sents) / len(sents),
        "this_bare_open": sum(len(s) > 1 and s[0].lower_ in ("this", "these") and s[1].pos_ in ("VERB", "AUX")
                              for s in sents) / len(sents),
        "para_mean": st.mean(len(p.split()) for p in paras) if paras else float("nan"),
        "emdash_per_kw": (text.count("—") + text.count("---")) / kw,
        "semicolon_per_kw": text.count(";") / kw,
        "paren_per_kw": text.count("(") / kw,
        "cite_per_sent": text.count("[CITE]") / len(sents),
        "nominal_per_kw": len(NOMINAL.findall(text)) / kw,
    }


def caption_features(caps):
    caps = [c for c in caps if len(c.split()) >= 4]
    if len(caps) < 2:
        return None
    f = features("\n\n".join(caps), paragraphs=caps)
    if f is None:
        return None
    firsts = [next(iter(nlp(c).sents)) for c in caps]
    f["cap_first_words"] = st.mean(sum(not t.is_punct for t in s) for s in firsts)
    f["cap_first_noverb"] = sum(not any(t.tag_ in ("VBD", "VBZ", "VBP", "MD") for t in s)
                                for s in firsts) / len(firsts)
    return f


def units():
    for p in sorted((ROOT / "data" / "sections").glob("*.json")):
        d = json.loads(p.read_text())
        base = {"genre": "paper", "field": d["field"], "id": d["arxiv"], "role": d["role"]}
        if d["abstract"]:
            yield {**base, "unit": "abstract"}, d["abstract"], None
        by_type = {}
        for s in d["sections"]:
            by_type.setdefault(s["type"], []).append(s["text"])
        for typ, texts in by_type.items():
            yield {**base, "unit": typ}, "\n\n".join(texts), None
        if d["captions"]:
            yield {**base, "unit": "captions"}, None, d["captions"]
    for p in sorted((ROOT / "data" / "raw" / "blogs").glob("*.txt")):
        lines = p.read_text(errors="replace").splitlines()
        caps = [l[len("CAPTION: "):] for l in lines if l.startswith("CAPTION: ")]
        body = "\n".join(l for l in lines if not l.startswith(("CAPTION: ", "# ")))
        base = {"genre": "company", "field": p.stem.split("-")[0], "id": p.stem, "role": "corpus"}
        yield {**base, "unit": "post"}, body, None
        if caps:
            yield {**base, "unit": "captions"}, None, caps


def main():
    rows = []
    for meta, text, caps in units():
        f = caption_features(caps) if caps is not None else features(text)
        if f:
            rows.append({**meta, **f})
    keys = list(rows[0].keys()) + ["cap_first_words", "cap_first_noverb"]
    keys = list(dict.fromkeys(keys))
    with open(ROOT / "data" / "metrics_units.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    num = [k for k in keys if k not in ("genre", "field", "id", "role", "unit")]
    groups = {}
    for r in rows:
        if r["role"] == "corpus":
            groups.setdefault((r["genre"], r["unit"]), []).append(r)
    out = []
    for (g, u), rs in sorted(groups.items()):
        row = {"genre": g, "unit": u, "n": len(rs)}
        for k in num:
            v = sorted(r[k] for r in rs if k in r and r[k] == r[k])
            if len(v) >= 3:
                q = st.quantiles(v, n=4)
                row[k] = f"{q[1]:.3g} [{q[0]:.3g}, {q[2]:.3g}]"
        out.append(row)
    (ROOT / "analysis").mkdir(exist_ok=True)
    with open(ROOT / "analysis" / "metrics_summary.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["genre", "unit", "n"] + num)
        w.writeheader()
        w.writerows(out)
    print(len(rows), "units;", len(out), "groups")


if __name__ == "__main__":
    main()
