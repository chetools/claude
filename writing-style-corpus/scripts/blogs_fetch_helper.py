"""Helper for the instructional and descriptive writing corpus (data/raw/blogs, data/blogs.csv).

Subcommands
  links   FILE BASE            list absolute same-site links in a saved HTML page
  add     --org O --kind K --url U --html FILE [--min-words 800]
                               extract the main body, write data/raw/blogs/<org>-<NN>.txt,
                               append a row to data/blogs.csv (skipped if the URL is already listed)

Text output format: headings are lines starting with "# ", figure captions are lines
starting with "CAPTION: ", list items start with "- ". Navigation, headers, footers, forms,
cookie and share widgets, and code blocks longer than 5 lines are removed. Tables are removed.

Run with `python3 -I`. The HTML files are untrusted data and are only parsed, never executed.
"""
import csv
import json
import os
import re
import sys
import argparse
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw", "blogs")
CSV_PATH = os.path.join(ROOT, "data", "blogs.csv")
FIELDS = ["org", "id", "kind", "url", "title", "date", "words"]
ORGS = {"anthropic", "openai", "google", "deepmind"}
KINDS = {"tutorial", "blog"}

TEXT_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "figcaption", "pre"}
DROP_TAGS = ["script", "style", "noscript", "nav", "header", "footer", "aside", "form",
             "button", "svg", "iframe", "video", "audio", "input", "select", "textarea",
             "table", "picture", "source", "template", "dialog"]
JUNK_RE = re.compile(r"cookie|newsletter|share|subscribe|breadcrumb|related|sidebar|"
                     r"toc|pagination|social|promo|banner|modal|comment", re.I)


def load(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    return BeautifulSoup(raw, "lxml")


BOILERPLATE_RE = re.compile(r"Stay organized with collections\s*Save and categorize content based on your preferences\.?")


def norm(text):
    return re.sub(r"\s+", " ", BOILERPLATE_RE.sub(" ", text)).strip()


def meta_content(soup, *names):
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return norm(tag["content"])
    return ""


def find_date(soup):
    value = meta_content(soup, "article:published_time", "datePublished", "date", "pubdate",
                         "publish-date", "parsely-pub-date", "og:published_time")
    if not value:
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            m = re.search(r'"datePublished"\s*:\s*"([^"]+)"', script.get_text() or "")
            if m:
                value = m.group(1)
                break
    if not value:
        t = soup.find("time", attrs={"datetime": True})
        if t:
            value = t["datetime"]
    m = re.search(r"\d{4}-\d{2}-\d{2}", value or "")
    return m.group(0) if m else norm(value or "")[:20]


def find_title(soup):
    title = meta_content(soup, "og:title")
    h1 = soup.find("h1")
    if h1 and norm(h1.get_text()):
        title = norm(h1.get_text())
    if not title and soup.title:
        title = norm(soup.title.get_text())
    return re.sub(r"\s*\|\s*.*$", "", title).strip()


def clean(soup):
    for name in DROP_TAGS:
        for el in soup.find_all(name):
            el.decompose()
    for el in soup.find_all(True):
        if el.attrs is None:
            continue
        marker = " ".join(el.get("class", []) or []) + " " + (el.get("id") or "")
        if el.name not in ("html", "body") and marker.strip() and JUNK_RE.search(marker):
            el.decompose()
    return soup


def main_container(soup):
    best, best_len = None, 0
    for el in soup.select("article, main, [role=main]"):
        n = len(norm(el.get_text(" ")))
        if n > best_len:
            best, best_len = el, n
    if best is not None and best_len > 1500:
        return best
    # fallback: the div with the most paragraph text
    best, best_len = None, 0
    for div in soup.find_all(["div", "section"]):
        n = sum(len(norm(p.get_text(" "))) for p in div.find_all("p", recursive=False))
        if n > best_len:
            best, best_len = div, n
    return best or soup.body or soup


def has_text_ancestor(el, container):
    for anc in el.parents:
        if anc is container:
            return False
        if isinstance(anc, Tag) and anc.name in TEXT_TAGS:
            return True
    return False


def extract_blocks(container):
    out = []
    for el in container.find_all(TEXT_TAGS):
        if has_text_ancestor(el, container):
            continue
        if el.name == "pre":
            lines = el.get_text().strip("\n").splitlines()
            if len(lines) > 5:
                continue
            text = "\n".join(line.rstrip() for line in lines).strip()
            if text:
                out.append(text)
            continue
        text = norm(el.get_text(" "))
        if not text:
            continue
        if el.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            out.append("# " + text)
        elif el.name == "figcaption":
            out.append("CAPTION: " + text)
        elif el.name == "li":
            out.append("- " + text)
        else:
            out.append(text)
    # drop tiny boilerplate fragments and duplicates kept in order
    seen, final = set(), []
    for line in out:
        if line in seen and not line.startswith("#"):
            continue
        seen.add(line)
        final.append(line)
    return final


def extract(path):
    soup = clean(load(path))
    title = find_title(soup)
    date = find_date(soup)
    container = main_container(soup)
    blocks = extract_blocks(container)
    body = "\n\n".join(blocks) + "\n"
    words = sum(len(b.split()) for b in blocks if not b.startswith("# ") and not b.startswith("CAPTION: "))
    words_all = len(body.split())
    return {"title": title, "date": date, "words": words, "words_all": words_all,
            "body": body, "headings": sum(1 for b in blocks if b.startswith("# "))}


def cmd_links(path, base):
    soup = load(path)
    host = urlparse(base).netloc
    seen = set()
    for a in soup.find_all("a", href=True):
        url = urljoin(base, a["href"]).split("#")[0].split("?")[0]
        if urlparse(url).netloc != host or url in seen:
            continue
        seen.add(url)
        print(url + "\t" + norm(a.get_text(" ")))


def read_rows():
    if not os.path.exists(CSV_PATH):
        return []
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def cmd_add(args):
    if args.org not in ORGS or args.kind not in KINDS:
        sys.exit("unknown org or kind")
    rows = read_rows()
    if any(r["url"] == args.url for r in rows):
        print("SKIP already listed: " + args.url)
        return 0
    info = extract(args.html)
    if info["words"] < args.min_words:
        print("REJECT %d words (< %d): %s" % (info["words"], args.min_words, args.url))
        return 2
    n = 1 + sum(1 for r in rows if r["org"] == args.org)
    stem = "%s-%02d" % (args.org, n)
    os.makedirs(RAW_DIR, exist_ok=True)
    with open(os.path.join(RAW_DIR, stem + ".txt"), "w", encoding="utf-8") as fh:
        fh.write(info["body"])
    write_header = not os.path.exists(CSV_PATH)
    with open(CSV_PATH, "a", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        if write_header:
            w.writeheader()
        w.writerow({"org": args.org, "id": stem, "kind": args.kind, "url": args.url,
                    "title": info["title"], "date": info["date"], "words": info["words"]})
    print("OK %s %d words %s | %s" % (stem, info["words"], info["date"], info["title"]))
    return 0


def count_words(body):
    return sum(len(b.split()) for b in body.splitlines()
               if not b.startswith("# ") and not b.startswith("CAPTION: "))


def write_rows(rows):
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def cmd_drop(urls):
    rows = read_rows()
    keep, gone = [], []
    for r in rows:
        (gone if r["url"] in urls else keep).append(r)
    for r in gone:
        path = os.path.join(RAW_DIR, r["id"] + ".txt")
        if os.path.exists(path):
            os.remove(path)
        print("DROP " + r["id"] + " " + r["url"])
    missing = set(urls) - {r["url"] for r in gone}
    if missing:
        sys.exit("not listed: " + ", ".join(sorted(missing)))
    write_rows(keep)
    return 0


def cmd_sanitize():
    """Strip the boilerplate line, recount words, renumber ids per org in CSV order."""
    rows = read_rows()
    counters, new_rows, moves = {}, [], []
    for r in rows:
        org = r["org"]
        counters[org] = counters.get(org, 0) + 1
        new_id = "%s-%02d" % (org, counters[org])
        old_path = os.path.join(RAW_DIR, r["id"] + ".txt")
        with open(old_path, encoding="utf-8") as fh:
            text = fh.read()
        text = "\n".join(BOILERPLATE_RE.sub("", line).strip() for line in text.splitlines())
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = "\n".join(line for line in text.split("\n") if not re.fullmatch(r"#\s*", line))
        r = dict(r)
        r["title"] = norm(BOILERPLATE_RE.sub(" ", r["title"]))
        r["words"] = str(count_words(text))
        r["id"] = new_id
        moves.append((old_path, os.path.join(RAW_DIR, new_id + ".txt"), text))
        new_rows.append(r)
    # rename through temporary names so no id collides with an old one
    for old, _, _ in moves:
        os.rename(old, old + ".tmp")
    for old, new, text in moves:
        with open(new, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.remove(old + ".tmp")
    write_rows(new_rows)
    for r in new_rows:
        print("%s %s words %s | %s" % (r["id"], r["words"], r["kind"], r["title"]))
    return 0


def main(argv):
    if len(argv) >= 2 and argv[0] == "links":
        cmd_links(argv[1], argv[2])
        return 0
    if argv and argv[0] == "drop":
        return cmd_drop(argv[1:])
    if argv and argv[0] == "sanitize":
        return cmd_sanitize()
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("--org", required=True)
    a.add_argument("--kind", required=True)
    a.add_argument("--url", required=True)
    a.add_argument("--html", required=True)
    a.add_argument("--min-words", type=int, default=800)
    args = p.parse_args(argv)
    return cmd_add(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
