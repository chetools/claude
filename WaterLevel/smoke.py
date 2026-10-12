"""Local smoke test of the molab notebooks, in a venv pinned to molab's package versions (molab-lock.txt).

    python smoke.py --setup     # create .molab-venv (Python 3.13, CUDA 13 torch) and install molab-lock.txt
    python smoke.py             # run env_check, pipeline (all stages) and 04_eval with WL_SMOKE=1
    python smoke.py --fresh     # same, after deleting work-smoke/ (re-decode, re-run VGGT/SAM 2 from scratch)
    python smoke.py --lock-from REPORT.md   # update molab-lock.txt from an env_check report (then --setup)

WL_SMOKE=1 makes every stage button count as pressed and shrinks the run to 3 videos x 8 frames with a few
training steps; it uses work-smoke/ and never pushes to HF. Needs an NVIDIA GPU (the code calls .cuda()).
"""
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
VENV = HERE / os.environ.get("WL_SMOKE_VENV", ".molab-venv")
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
TORCH_INDEX = "https://download.pytorch.org/whl/cu130"
# env_check lives at the repo root; a copy next to this file is used when only WaterLevel/ is checked out
ENV_CHECK = "../env_check.py" if (HERE.parent / "env_check.py").exists() else "env_check.py"
NOTEBOOKS = [ENV_CHECK, "pipeline.py", "04_eval.py"]


def setup():
    uv = shutil.which("uv") or sys.exit("uv not found")
    subprocess.run([uv, "venv", "--python", "3.13", str(VENV)], check=True)
    subprocess.run([uv, "pip", "install", "--python", str(PY), "-r", str(HERE / "molab-lock.txt"),
                    "--extra-index-url", TORCH_INDEX, "--index-strategy", "unsafe-best-match"], check=True)


def lock_from(report: Path):
    """Rewrite the pinned versions in molab-lock.txt with the active versions in an env_check report."""
    import re

    norm = lambda n: re.sub(r"[-_.]+", "-", n).lower()
    text = report.read_text(encoding="utf-8")
    table = text.split("## All installed", 1)[1]
    have = {}
    for line in table.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[0] not in ("package", "") and not cells[0].startswith("-"):
            have[norm(cells[0])] = cells[1]
    lock = HERE / "molab-lock.txt"
    out, changes = [], []
    for line in lock.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Za-z0-9_.\-]+)==(\S+)$", line.strip())
        if m:
            new = have.get(norm(m.group(1)))
            if new is None:
                changes.append(f"  {m.group(1)}: not in report, kept {m.group(2)}")
            elif new != m.group(2):
                changes.append(f"  {m.group(1)}: {m.group(2)} -> {new}")
                line = f"{m.group(1)}=={new}"
        elif line.startswith("# Versions molab actually loaded on"):
            line = f"# Versions molab actually loaded on {report.stem} (env_check.py report), for the local smoke-test replica."
        out.append(line)
    py = re.search(r"python `([\d.]+)`", text)
    lock.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(changes) or "  no version changes")
    print(f"molab python: {py.group(1) if py else '?'}. Run `python smoke.py --setup` to rebuild .molab-venv.")


def main():
    if "--setup" in sys.argv:
        setup()
        return
    if "--lock-from" in sys.argv:
        lock_from(Path(sys.argv[sys.argv.index("--lock-from") + 1]))
        return
    if not PY.exists():
        sys.exit(f"{PY} missing: run `python smoke.py --setup` first")
    if "--fresh" in sys.argv:
        shutil.rmtree(HERE / "work-smoke", ignore_errors=True)
    env = {**os.environ, "WL_SMOKE": "1", "PYTHONUTF8": "1"}
    results = []
    for nb in NOTEBOOKS:
        print(f"\n===== {nb} =====", flush=True)
        t0 = time.time()
        rc = subprocess.run([str(PY), nb], cwd=HERE, env=env).returncode
        results.append((nb, rc, time.time() - t0))
        if rc != 0:
            break  # later notebooks depend on earlier output
    print("\n===== smoke summary =====")
    for nb, rc, secs in results:
        print(f"  {'PASS' if rc == 0 else 'FAIL'}  {nb:14} {secs:6.0f} s")
    skipped = NOTEBOOKS[len(results):]
    if skipped:
        print("  skipped: " + ", ".join(skipped))
    sys.exit(0 if all(rc == 0 for _, rc, _ in results) and not skipped else 1)


if __name__ == "__main__":
    main()
