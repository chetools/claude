"""Install or verify the writing-skills package (and the stem-visual-style skill) in a repository.

Canonical sources live in chetools/muse: writing-skills/ (package) and
.claude/skills/stem-visual-style/SKILL.md. Usage:
  python sync_skill.py install <repo-root>   copy into <repo-root>/.claude/skills/
  python sync_skill.py check <repo-root>     byte-compare; exit 1 on any difference
"""
import filecmp, pathlib, shutil, sys
pkg = pathlib.Path(__file__).resolve().parent.parent
muse = pkg.parent
files = ["SKILL.md", "README.md", "APPENDIX.md", *sorted(p.relative_to(pkg).as_posix() for p in (pkg / "references").glob("*.md")),
         *sorted(p.relative_to(pkg).as_posix() for p in (pkg / "tools").glob("*.py"))]
pairs = [(pkg / f, pathlib.Path(".claude/skills/writing-skills") / f) for f in files]
visual = muse / ".claude/skills/stem-visual-style/SKILL.md"
pairs.append((visual, pathlib.Path(".claude/skills/stem-visual-style/SKILL.md")))
mode, target = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
bad = 0
dest = target / ".claude/skills/writing-skills"
wanted = {(target / r).resolve() for _, r in pairs}
extra = sorted(p for p in dest.rglob("*") if p.is_file() and p.suffix in (".md", ".py") and p.resolve() not in wanted) if dest.exists() else []
if mode == "install":
    for p in extra:  # drop only package files removed from the package, named one by one
        print("REMOVED", p.relative_to(target)); p.unlink()
for src, rel in pairs:
    dst = target / rel
    if src.resolve() == dst.resolve():
        continue
    if mode == "install":
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
    elif not dst.exists() or not filecmp.cmp(src, dst, shallow=False):
        print("DIFFERS", rel); bad += 1
if mode == "check":
    for p in extra:
        print("EXTRA", p.relative_to(target)); bad += 1
print(f"{mode}: {len(pairs)} files, {bad} problems"); sys.exit(1 if bad else 0)
