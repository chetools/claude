"""Consistency check for the writing-skills package. Exit 1 on any failure.

Checks: every cited core rule number exists; every cited prefixed rule (T, E, B, F, C) exists in its
file; every referenced file exists (any *.md name, backticked or not, except CLAUDE.md, which is the host repository's; and tools/*.py); no stale names (CHECKLIST, What not to do, writing-style, old rule
ranges); SKILL.md front matter has name writing-skills.
"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
files = [root / "SKILL.md", root / "README.md", root / "APPENDIX.md", *sorted((root / "references").glob("*.md"))]
text = {f.name: f.read_text() for f in files}
errors = []
core_rules = {int(n) for n in re.findall(r"^(\d+)\. ", text["SKILL.md"], re.M)}
if core_rules != set(range(1, max(core_rules) + 1)):
    errors.append(f"core rules not contiguous: {sorted(core_rules)}")
defined = {p: set(re.findall(rf"^({p}\d+)\. ", text[f], re.M))
           for p, f in [("T", "textbook.md"), ("E", "equations.md"), ("B", "business.md"), ("F", "figures.md")]}
defined["C"] = set(re.findall(r"^(C\d+)\. ", text["ai-check.md"], re.M))
for name, t in text.items():
    for m in re.finditer(r"\b(?:core )?rules? (\d+)(?:[–-](\d+))?((?:, (?:and )?\d+)*)", t):
        nums = [int(m.group(1))] + ([int(m.group(2))] if m.group(2) else []) + [int(x) for x in re.findall(r"\d+", m.group(3) or "")]
        if name == "APPENDIX.md":
            continue  # cites predecessor-skill rule numbers by design
        for n in nums:
            if n not in core_rules:
                errors.append(f"{name}: cites missing core rule {n}: '{m.group(0)}'")
    for ref in re.findall(r"\b([TEBFC]\d+)\b", t):
        p = ref[0]
        if p in defined and ref not in defined[p]:
            errors.append(f"{name}: cites missing {ref}")
    for fref in re.findall(r"\b([A-Za-z0-9_-]+\.md)\b", t):
        if fref not in text and fref != "CLAUDE.md":
            errors.append(f"{name}: references missing file {fref}")
    for tref in re.findall(r"\btools/([a-z0-9_]+\.py)\b", t):
        if not (root / "tools" / tref).exists():
            errors.append(f"{name}: references missing tool {tref}")
    for stale in ["CHECKLIST", "What not to do", "writing-style", "predecessor skills, which remain"]:
        if stale in t:
            errors.append(f"{name}: stale reference '{stale}'")
if not re.match(r"---\nname: writing-skills\ndescription: .+\n---\n", text["SKILL.md"]):
    errors.append("SKILL.md front matter malformed")
for e in errors:
    print("FAIL", e)
print(f"{len(errors)} failures; core rules 1-{max(core_rules)}; " + ", ".join(f"{k}: {len(v)}" for k, v in defined.items()))
sys.exit(1 if errors else 0)
