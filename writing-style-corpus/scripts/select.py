"""Select the most cited papers with an arXiv ID, per STEM field of study.

Source: Semantic Scholar Graph API, /paper/search/bulk sorted by citationCount.
Years 2000-2026. Output: data/selection.csv (field, rank, role, arxiv, s2id, year, citations, title).
role is "corpus" for the analysis set and "heldout" for the validation set.
"""
import csv, json, random, sys, time, urllib.parse, urllib.request
from pathlib import Path

FIELDS = ["Physics", "Mathematics", "Computer Science", "Chemistry",
          "Engineering", "Materials Science", "Biology", "Environmental Science"]
N_CORPUS, N_HELDOUT = 20, 2
WINDOWS = [(2000, 2004), (2005, 2008), (2009, 2012), (2013, 2016), (2017, 2019),
           (2020, 2022), (2023, 2026)]
URL = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
OUT = Path(__file__).resolve().parents[1] / "data" / "selection.csv"


def get(params):
    q = URL + "?" + urllib.parse.urlencode(params)
    for attempt in range(8):
        try:
            with urllib.request.urlopen(q, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # 429 from the shared pool: back off
            time.sleep(2 ** attempt)
            err = e
    raise SystemExit(f"Semantic Scholar failed: {err}")


def top_with_arxiv(field, n):
    """Top-cited arXiv papers since 2000, merged over year windows.

    The API refuses an empty query with more than 1e7 hits, so each window is
    queried separately (first page = 1000 most cited) and the results merged.
    """
    keep = []
    for y0, y1 in WINDOWS:
        d = get({"query": "", "fieldsOfStudy": field, "sort": "citationCount:desc",
                 "year": f"{y0}-{y1}",
                 "fields": "title,citationCount,externalIds,year,publicationTypes"})
        for p in d["data"]:
            ax = (p.get("externalIds") or {}).get("ArXiv")
            if ax and "Review" not in (p.get("publicationTypes") or []):
                keep.append(p)
        time.sleep(2)
    keep.sort(key=lambda p: -p["citationCount"])
    return keep[:n]


def main():
    rng, rows, seen = random.Random(0), [], set()
    for field in FIELDS:
        papers = [p for p in top_with_arxiv(field, N_CORPUS + N_HELDOUT + 15)
                  if p["externalIds"]["ArXiv"] not in seen][:N_CORPUS + N_HELDOUT]
        if len(papers) < N_CORPUS + N_HELDOUT:
            raise SystemExit(f"{field}: only {len(papers)} papers")
        held = set(rng.sample(range(len(papers)), N_HELDOUT))
        for i, p in enumerate(papers):
            seen.add(p["externalIds"]["ArXiv"])
            rows.append([field, i + 1, "heldout" if i in held else "corpus",
                         p["externalIds"]["ArXiv"], p["paperId"], p["year"],
                         p["citationCount"], p["title"]])
        print(field, len(papers), file=sys.stderr)
        time.sleep(2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["field", "rank", "role", "arxiv", "s2id", "year", "citations", "title"])
        w.writerows(rows)


if __name__ == "__main__":
    main()
