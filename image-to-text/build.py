"""Build dist/image-to-text-standalone.html: one self-contained file (CSS, markdown-it, converters, app inlined)."""
import pathlib
import re
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
    values = {
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
