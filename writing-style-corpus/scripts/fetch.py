"""Download arXiv e-prints (LaTeX source, latest version; PDF text if no source) for data/selection.csv.

Each paper is unpacked into its own directory data/raw/arxiv/<id>/ (untrusted
data, never executed). Usage: python -I scripts/fetch.py [field ...] | --pdf ID ...
Writes data/fetch_log.csv (arxiv, status, detail).
"""
import csv, gzip, io, subprocess, sys, tarfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "arxiv"


def safe_name(axid):
    return axid.replace("/", "_")


def fetch(axid):
    d = RAW / safe_name(axid)
    if d.exists() and any(d.iterdir()):
        return "ok", "cached"
    req = urllib.request.Request(f"https://arxiv.org/e-print/{axid}",
                                 headers={"User-Agent": "writing-style-corpus/1.0"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                blob = r.read()
            break
        except Exception as e:
            err = e
            time.sleep(3 * 2 ** attempt)
    else:
        return "fail", f"download: {err}"
    d.mkdir(parents=True, exist_ok=True)
    if blob[:4] == b"%PDF":  # no LaTeX source: keep the PDF text instead
        (d / "paper.pdf").write_bytes(blob)
        r = subprocess.run(["pdftotext", str(d / "paper.pdf"), str(d / "paper.txt")],
                           capture_output=True)
        (d / "paper.pdf").unlink()
        if r.returncode or not (d / "paper.txt").exists():
            return "fail", "pdf only, pdftotext failed"
        return "ok", "pdf text"
    try:
        tf = tarfile.open(fileobj=io.BytesIO(blob), mode="r:*")
        for m in tf.getmembers():
            name = Path(m.name)
            if not m.isfile() or name.is_absolute() or ".." in name.parts:
                continue
            if name.suffix.lower() not in (".tex", ".bbl", ".sty", ".cls", ".ltx", ""):
                continue
            out = d / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(tf.extractfile(m).read())
    except tarfile.ReadError:
        try:
            text = gzip.decompress(blob)
        except OSError:
            text = blob
        (d / "main.tex").write_bytes(text)
    if not list(d.rglob("*.tex")):
        return "fail", "no .tex in source"
    return "ok", ""


def fetch_pdf(axid):
    """PDF text fallback (source wraps a PDF, uses old macros, or e-print fails)."""
    d = RAW / safe_name(axid)
    d.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f"https://arxiv.org/pdf/{axid}",
                                 headers={"User-Agent": "writing-style-corpus/1.0"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                blob = r.read()
            break
        except Exception as e:
            err = e
            time.sleep(3 * 2 ** attempt)
    else:
        return "fail", f"pdf download: {err}"
    if blob[:4] != b"%PDF":
        return "fail", "pdf url did not return a PDF"
    (d / "paper.pdf").write_bytes(blob)
    r = subprocess.run(["pdftotext", str(d / "paper.pdf"), str(d / "paper.txt")], capture_output=True)
    (d / "paper.pdf").unlink()
    return ("ok", "pdf text (fallback)") if not r.returncode else ("fail", "pdftotext failed")


def main():
    if sys.argv[1:2] == ["--pdf"]:
        log_path = ROOT / "data" / "fetch_log.csv"
        done = {r["arxiv"]: r for r in csv.DictReader(open(log_path))}
        for axid in sys.argv[2:]:
            status, detail = fetch_pdf(axid)
            done[axid] = {"arxiv": axid, "status": status, "detail": detail}
            print(axid, status, detail, flush=True)
            time.sleep(3)
        with open(log_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["arxiv", "status", "detail"])
            w.writeheader()
            w.writerows(done.values())
        return
    fields = set(sys.argv[1:])
    rows = list(csv.DictReader(open(ROOT / "data" / "selection.csv")))
    log_path = ROOT / "data" / "fetch_log.csv"
    done = {}
    if log_path.exists():
        done = {r["arxiv"]: r for r in csv.DictReader(open(log_path))}
    for r in rows:
        if fields and r["field"] not in fields:
            continue
        if done.get(r["arxiv"], {}).get("status") == "ok":
            continue
        status, detail = fetch(r["arxiv"])
        done[r["arxiv"]] = {"arxiv": r["arxiv"], "status": status, "detail": detail}
        print(r["field"], r["arxiv"], status, detail, flush=True)
        time.sleep(3)  # arXiv asks for at most one request every 3 s
    with open(log_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["arxiv", "status", "detail"])
        w.writeheader()
        w.writerows(done.values())


if __name__ == "__main__":
    main()
