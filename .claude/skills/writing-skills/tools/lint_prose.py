"""Mechanical scan of a prose draft for the writing-skills revision pass (references/ai-check.md, item 8).

Usage: python lint_prose.py <file.md|file.txt> [--strict]
Prints one line per flag: line number, check, and the matched text. Flags are candidates, not defects:
the density rule in ai-check.md decides. Exit 0, or exit 1 with --strict when any flag is printed.
Code blocks, inline code, and $...$ math are skipped.

Checks:
  opening     two consecutive sentences open with the same word, or "The" opens more than a third of a
              paragraph's sentences (core rule 11)
  frame       "thus", "therefore", "hence", "accordingly" in the last sentence of a paragraph (core rule 14)
  word        a word from the overused set in ai-check.md
  emdash      more than two em dashes in one paragraph
  range       a hyphen between two numbers, where an en dash is meant (core rule 33)
  minus       a hyphen before a number after a space, where a minus sign is meant (core rule 33)
  unitspace   an ordinary space between a number and a unit symbol, where a thin space is meant (core rule 33)
  house       "carry" in any form outside transport; "Scope", "Basis", or "Extent" opening a sentence
"""
import re
import sys

OVERUSED = ["additionally", "align with", "bolstered", "crucial", "delve", "emphasizing", "enduring", "enhance",
            "fostering", "garner", "highlight", "interplay", "intricate", "landscape", "tapestry", "meticulous",
            "pivotal", "robust", "showcase", "testament", "underscore", "valuable", "vibrant", "utilized"]
UNITS = r"(?:m|cm|mm|km|s|ms|h|min|K|°C|Pa|kPa|MPa|bar|mol|kmol|kg|g|L|mL|J|kJ|MJ|W|kW|MW|N|V|A|Hz|%)"
FRAME = re.compile(r"\b(thus|therefore|hence|accordingly)\b", re.I)


def strip(text):
    text = re.sub(r"```.*?```", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    text = re.sub(r"\$\$.*?\$\$", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", " ", text)
    return re.sub(r"\$[^$\n]+\$", " X ", text)


def paragraphs(text):
    """Yield (first line number, paragraph text); headings, tables, and list markers are excluded."""
    start, buf = None, []
    for no, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if not s or s.startswith(("#", "|", "---")):
            if buf:
                yield start, " ".join(buf)
            start, buf = None, []
            continue
        s = re.sub(r"^([-*+]|\d+\.)\s+", "", s)
        if start is None:
            start = no
        buf.append(s)
    if buf:
        yield start, " ".join(buf)


def sentences(par):
    return [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"“(])", par) if s.strip()]


def first_word(sentence):
    m = re.match(r"[\"“(]*([A-Za-z][\w'-]*)", sentence)
    return m.group(1) if m else ""


def lint(text):
    flags = []
    for no, par in paragraphs(strip(text)):
        sents = sentences(par)
        words = [first_word(s) for s in sents]
        for a, b in zip(words, words[1:]):
            if a and a == b:
                flags.append((no, "opening", f"two sentences open with '{a}'"))
        if len(sents) >= 3 and words.count("The") * 3 > len(sents):
            flags.append((no, "opening", f"'The' opens {words.count('The')} of {len(sents)} sentences"))
        if len(sents) >= 2 and FRAME.search(sents[-1]):
            flags.append((no, "frame", FRAME.search(sents[-1]).group(0) + " in the closing sentence"))
        if par.count("—") > 2:
            flags.append((no, "emdash", f"{par.count('—')} em dashes in one paragraph"))
    for no, line in enumerate(strip(text).split("\n"), 1):
        low = line.lower()
        for w in OVERUSED:
            for m in re.finditer(rf"\b{re.escape(w)}\w*", low):
                flags.append((no, "word", m.group(0)))
        for m in re.finditer(r"(?<![\w.-])\d+(?:\.\d+)?-\d+(?:\.\d+)?(?![\w.-])", line):
            flags.append((no, "range", m.group(0)))
        for m in re.finditer(r"(?:^|[\s(=])(-\d+(?:\.\d+)?)", line):
            flags.append((no, "minus", m.group(1)))
        for m in re.finditer(rf"\d [µ]?{UNITS}(?![\w])", line):
            flags.append((no, "unitspace", m.group(0)))
        for m in re.finditer(r"\bcarr(?:y|ies|ied|ying)\b(?! out)", low):
            flags.append((no, "house", m.group(0)))
        for m in re.finditer(r"(?:^|[.!?]\s+)(Scope|Basis|Extent)\b", line):
            flags.append((no, "house", m.group(1) + " opens a sentence"))
    return sorted(flags)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--strict"]
    if len(args) != 1:
        sys.exit(__doc__)
    found = lint(open(args[0], encoding="utf-8").read())
    for no, check, what in found:
        print(f"{args[0]}:{no}: {check}: {what}")
    print(f"{len(found)} flags")
    sys.exit(1 if found and "--strict" in sys.argv else 0)
