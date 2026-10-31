"""Select the most cited papers with an arXiv version, stratified by arXiv category.

1. Pool: Semantic Scholar /paper/search/bulk, sorted by citationCount, for each
   field of study and year window (2000-2026); papers with an arXiv ID, no reviews.
   The API refuses an empty query with more than 1e7 hits, hence the windows.
2. Check: the arXiv API record of each candidate (most cited first) must have a
   title matching the Semantic Scholar title (difflib ratio >= 0.85); Semantic
   Scholar links some papers to the wrong arXiv ID.
3. Strata: arXiv primary category mapped to group(); the N_CORPUS + N_HELDOUT most
   cited checked papers per group, N_HELDOUT of them drawn at random as held out.
Output: data/selection.csv, data/selection_rejected.csv.
"""
import csv, difflib, json, random, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

FIELDS = ["Physics", "Mathematics", "Computer Science", "Chemistry", "Engineering",
          "Materials Science", "Biology", "Environmental Science", "Medicine", "Geology"]
WINDOWS = [(2000, 2004), (2005, 2008), (2009, 2012), (2013, 2016), (2017, 2019),
           (2020, 2022), (2023, 2026)]
N_CORPUS, N_HELDOUT = 20, 2
ROOT = Path(__file__).resolve().parents[1]
POOL = ROOT / "data" / "pool.json"
OUT = ROOT / "data" / "selection.csv"
ML = {"cs.LG", "cs.CV", "cs.CL", "cs.AI", "cs.NE", "cs.IR", "stat.ML"}
GROUPS = 7


def group(cat):
    if cat in ML:
        return "machine learning"
    if cat.startswith(("cs.", "eess.")):
        return "computer science and EESS (other)"
    if cat.startswith("cond-mat"):
        return "condensed matter"
    if cat.startswith("astro-ph"):
        return "astrophysics"
    if cat.startswith(("physics.", "quant-ph", "hep-", "gr-qc", "nucl-", "nlin.")):
        return "physics (other)"
    if cat.startswith(("math.", "stat.", "math-ph")):
        return "mathematics and statistics"
    if cat.startswith("q-bio"):
        return "quantitative biology"
    return None


def get_json(url):
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # 429 from the shared pool: back off
            err = e
            time.sleep(2 ** attempt)
    raise SystemExit(f"request failed: {err}: {url}")


def build_pool():
    pool = {}
    for field in FIELDS:
        for y0, y1 in WINDOWS:
            d = get_json("https://api.semanticscholar.org/graph/v1/paper/search/bulk?" +
                         urllib.parse.urlencode({
                             "query": "", "fieldsOfStudy": field, "sort": "citationCount:desc",
                             "year": f"{y0}-{y1}",
                             "fields": "title,citationCount,externalIds,year,publicationTypes"}))
            for p in d["data"]:
                ax = (p.get("externalIds") or {}).get("ArXiv")
                if ax and "Review" not in (p.get("publicationTypes") or []):
                    pool[ax] = {"arxiv": ax, "s2id": p["paperId"], "title": p["title"],
                                "year": p["year"], "citations": p["citationCount"]}
            print(field, y0, len(pool), file=sys.stderr, flush=True)
            time.sleep(2)
    POOL.write_text(json.dumps(list(pool.values())))


def arxiv_meta(ids):
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode(
        {"id_list": ",".join(ids), "max_results": len(ids)})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                root = ET.fromstring(r.read())
            break
        except Exception as e:
            err = e
            time.sleep(5 * 2 ** attempt)
    else:
        raise SystemExit(f"arXiv API failed: {err}")
    ns = {"a": "http://www.w3.org/2005/Atom", "x": "http://arxiv.org/schemas/atom"}
    out = {}
    for e in root.findall("a:entry", ns):
        m = re.search(r"abs/(.+?)(v\d+)?$", e.findtext("a:id", "", ns))
        pc = e.find("x:primary_category", ns)
        if m and pc is not None:
            out[m.group(1)] = {"title": " ".join(e.findtext("a:title", "", ns).split()),
                               "category": pc.get("term")}
    return out


def norm(t):
    return re.sub(r"[^a-z0-9 ]", "", t.lower())


def main():
    if not POOL.exists():
        build_pool()
    pool = sorted(json.loads(POOL.read_text()), key=lambda p: -p["citations"])
    need = N_CORPUS + N_HELDOUT
    chosen, rejected = {}, []
    for i in range(0, len(pool), 100):
        batch = pool[i:i + 100]
        meta = arxiv_meta([p["arxiv"] for p in batch])
        for p in batch:
            m = meta.get(p["arxiv"])
            if not m:
                rejected.append((p["arxiv"], "no arXiv record"))
                continue
            if difflib.SequenceMatcher(None, norm(m["title"]), norm(p["title"])).ratio() < 0.85:
                rejected.append((p["arxiv"], f"title mismatch: {p['title'][:50]} / {m['title'][:50]}"))
                continue
            g = group(m["category"])
            if g and len(chosen.setdefault(g, [])) < need:
                chosen[g].append({**p, "category": m["category"]})
        print(i + 100, {g: len(v) for g, v in chosen.items()}, file=sys.stderr, flush=True)
        if len(chosen) == GROUPS and all(len(v) >= need for v in chosen.values()):
            break
        time.sleep(3)
    rng, rows = random.Random(0), []
    for g, papers in sorted(chosen.items()):
        if len(papers) < need:
            print(f"warning: {g} has only {len(papers)} papers", file=sys.stderr)
        held = set(rng.sample(range(len(papers)), min(N_HELDOUT, len(papers) // 5)))
        for k, p in enumerate(papers):
            rows.append([g, k + 1, "heldout" if k in held else "corpus", p["arxiv"], p["category"],
                         p["s2id"], p["year"], p["citations"], p["title"]])
    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["field", "rank", "role", "arxiv", "category", "s2id", "year", "citations", "title"])
        w.writerows(rows)
    with (ROOT / "data" / "selection_rejected.csv").open("w", newline="") as f:
        csv.writer(f).writerows([["arxiv", "reason"]] + rejected)
    print(len(rows), "selected;", len(rejected), "rejected", file=sys.stderr)


if __name__ == "__main__":
    main()
