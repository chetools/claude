"""Build dist/image-to-text-standalone.html: one self-contained file (CSS, markdown-it, converters, app inlined)."""
import base64
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
WEB = ROOT / "web"
MDIT = ROOT / ".buildtools/node_modules/markdown-it/dist/markdown-it.min.js"
OUT = ROOT / "dist/image-to-text-standalone.html"


def script(path):
    text = path.read_text(encoding="utf-8")
    return text.replace("</script", "<\\/script")


def main():
    if not MDIT.exists():
        sys.exit(f"missing {MDIT}: run `npm i markdown-it@14.1.0` in .buildtools/")
    # Shared-ranking Worker URL: argument (local testing) or worker/url.txt (the deployed Worker).
    url_file = ROOT / "worker/url.txt"
    ranking = sys.argv[1] if len(sys.argv) > 1 else (url_file.read_text().strip() if url_file.exists() else "")
    if not re.fullmatch(r"https://[\w.-]+|http://localhost:\d+", ranking):
        sys.exit(f"no valid ranking URL (got {ranking!r}): deploy the Worker and write its URL to {url_file}")
    subprocess.run(["node", str(ROOT / "tools/render_probe.mjs")], check=True)
    values = {
        "RANKING_URL": ranking,
        "PROBE_PNG_B64": base64.b64encode((WEB / "probe.png").read_bytes()).decode(),
        "PROBE_JSON": json.dumps(json.loads((WEB / "probe.json").read_text(encoding="utf-8")), ensure_ascii=False).replace("</", "<\\/"),
        "CSS": (WEB / "style.css").read_text(encoding="utf-8"),
        "MARKDOWN_IT": script(MDIT),
        "CONVERT_JS": script(WEB / "convert.js"),
        "APP_JS": script(WEB / "app.js"),
    }
    html = (WEB / "template.html").read_text(encoding="utf-8")
    found = set(re.findall(r"@@([A-Z0-9_]+)@@", html))
    if found != set(values):
        sys.exit(f"placeholder mismatch: template has {sorted(found)}, build fills {sorted(values)}")
    html = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: values[m.group(1)], html)
    left = re.findall(r"@@[A-Z0-9_]+@@", html)
    if left:
        sys.exit(f"unfilled placeholders: {left}")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({len(html) / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
