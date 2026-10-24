"""Tests of the page build checks (run: python -m pytest page/python).
Requires dist/hda-plant-v1.html to have been built (python build_page.py)."""
import pathlib
import sys

import pytest

PAGE_DIR = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PAGE_DIR))
sys.path.insert(0, str(PAGE_DIR / "python"))
import build_page as bp  # noqa: E402

PAGE = PAGE_DIR / "dist" / "hda-plant-v1.html"


@pytest.fixture(scope="module")
def page():
    assert PAGE.exists(), "build the page first: python build_page.py --dev"
    return PAGE.read_text(encoding="utf-8")


def test_boot_guard_accepts_the_built_page(page):
    assert bp.boot_guard(page) is True


def test_boot_guard_rejects_a_missing_colon(page):
    broken = page.replace('"def handle(text):"', '"def handle(text)"')
    assert broken != page
    with pytest.raises(SyntaxError):
        bp.boot_guard(broken)


def test_boot_guard_rejects_a_traceback_leaking_to_the_reader(page):
    broken = page.replace('return _fail(str(err))', 'return _fail(__import__(\\"traceback\\").format_exc())')
    assert broken != page
    with pytest.raises(AssertionError):
        bp.boot_guard(broken)


def test_boot_guard_rejects_an_escape_sequence(page):
    broken = page.replace('print(traceback.format_exc())', 'print(\\"a\\\\n\\")')
    assert broken != page
    with pytest.raises(AssertionError):
        bp.boot_guard(broken)


def test_unfilled_and_unused_placeholders_fail():
    with pytest.raises(AssertionError):
        bp.fill_template("a @@X1@@ b", {})
    with pytest.raises(AssertionError):
        bp.fill_template("a", {"X1": "v"})
    assert bp.fill_template("a @@X1@@", {"X1": "v"}) == "a v"


def test_math_extractor_rule():
    bp.TEX.clear()
    out = bp.protect_math("cost $5 to $6 and $F$ and $x_1$ and $a = b$ and $$\\int$$")
    kinds = [t for t, _ in bp.TEX]
    assert kinds == ["\\int", "F", "x_1", "a = b"]
    assert "$5 to $" in out


def test_citation_mismatch_fails():
    bp.TEX.clear()
    with pytest.raises(AssertionError):
        bp.process_theory("## A\n\ntext [1] [3]\n\n## References\n\n1. a\n2. b\n")


def test_crop_outside_sheet_fails():
    bp.TEX.clear()
    md = '## A\n\n<!-- crop sheet=1 x=1600 y=0 w=200 h=100 caption="c" -->\n\n## References\n\n1. a\n'
    with pytest.raises(AssertionError):
        bp.process_theory(md)


def test_crop_must_follow_a_heading():
    bp.TEX.clear()
    md = '## A\n\ntext\n\n<!-- crop sheet=1 x=0 y=0 w=200 h=100 caption="c" -->\n\n## References\n\n1. a\n'
    with pytest.raises(AssertionError):
        bp.process_theory(md)
