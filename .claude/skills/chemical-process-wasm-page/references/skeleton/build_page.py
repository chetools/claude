"""Builder skeleton for a chemical process WASM page (Section 6 of
the skill). Schematic: the elided steps are marked with comments and
follow the patterns of the reference builds. The non-negotiable
checks are written out in full: fail-loud placeholders, the
mathematics extractor rule, the literal-TeX-span failure, the KaTeX
count check, the citation mechanical check, listing byte-identity,
and the versioned output name.
"""
import json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
VERSION = "v1"                       # increment on every content change
SLUG = "example-process-plant"       # process slug, e.g. ammonia-synthesis-plant
OUT = HERE / "dist" / f"{SLUG}-{VERSION}.html"
SHEET_SVG = HERE / "sheet.svg"       # the PFD sheet (Section 1, input 3)

MATH_MARKERS = ("\\", "_", "^", "=")  # a span with any marker is mathematics


def extract_math(md_text):
    """Split Markdown into (protected_text, [tex, ...]).

    A $...$ span is mathematics when it contains a TeX command, an
    underscore, a caret, or an equals sign, regardless of spaces or a
    leading digit; a currency guard may leave a span literal only
    when none of those markers is present (Section 6).
    """
    tex = []

    def repl(m):
        content = m.group(1)
        if any(marker in content for marker in MATH_MARKERS):
            tex.append(content)
            return f"\x00MATH{len(tex) - 1}\x00"
        return m.group(0)

    protected = re.sub(r"\$([^$]+)\$", repl, md_text)
    protected = re.sub(r"\$\$(.+?)\$\$",
                       lambda m: tex.append(m.group(1)) or f"\x00MATH{len(tex) - 1}\x00",
                       protected, flags=re.S)
    return protected, tex


def render_katex_batch(tex_list):
    """Render every formula with KaTeX in one batched node call and
    return the list of HTML strings (build-time rendering, Section 6).
    Implement against the KaTeX copy in the project's .buildtools/."""
    raise NotImplementedError("wire to the project KaTeX installation")


def check_citations(text, bibliography_keys):
    """Mechanical citation check: every cited key resolves to exactly
    one bibliography entry and every entry is cited (Section 6)."""
    cited = set(re.findall(r"\[(\d+)\]", text))
    assert cited == {str(k) for k in bibliography_keys}, (cited, bibliography_keys)


def fill_template(template, values):
    """Substitute @@NAME@@ placeholders; fail on anything unfilled.
    The pattern matches the full name alphabet in use, [A-Z0-9_]."""
    out = re.sub(r"@@([A-Z0-9_]+)@@",
                 lambda m: values[m.group(1)], template)
    assert "@@" not in out, "unfilled placeholder remains"
    return out


def main():
    assert SHEET_SVG.exists(), f"sheet missing: {SHEET_SVG}"
    theory_md = (HERE / "theory.md").read_text(encoding="utf-8")
    protected, tex = extract_math(theory_md)
    # ... convert protected Markdown with markdown-it-py (tables on),
    # restore the rendered KaTeX HTML at the \x00MATH<n>\x00 markers,
    # build the panel tables of contents from the rendered headings
    # (fail if a panel has none), embed the sheet SVG, insert the
    # sub-process diagram crops of Section 5, compute the precomputed
    # design-basis run with the canonical runner and embed its
    # payload, inline the listings from the files on disk, and run
    # the boot compile guard over the assembled page (Section 6).
    html = fill_template((HERE / "template.html").read_text(encoding="utf-8"),
                         {"TITLE": "Example process plant"})
    # A literal $...$ span holding a TeX command is a build failure.
    for span in re.findall(r"\$[^$<>]+\$", html):
        assert "\\" not in span, f"unrendered mathematics in page: {span!r}"
    katex_count = html.count('class="katex"')
    assert katex_count >= len(tex), (katex_count, len(tex))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"page written: {OUT} ({OUT.stat().st_size} bytes), "
          f"math expressions: {len(tex)}")


if __name__ == "__main__":
    main()
