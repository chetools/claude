"""Local smoke test of the molab notebooks, in a venv pinned to molab's package versions (molab-lock.txt).

    python smoke.py --setup     # create .molab-venv (Python 3.13, CUDA 13 torch) and install molab-lock.txt
    python smoke.py             # run env_check, pipeline (all stages) and 04_eval with WL_SMOKE=1
    python smoke.py --fresh     # same, after deleting work-smoke/ (re-decode, re-run VGGT/SAM 2 from scratch)

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
NOTEBOOKS = ["env_check.py", "pipeline.py", "04_eval.py"]


def setup():
    uv = shutil.which("uv") or sys.exit("uv not found")
    subprocess.run([uv, "venv", "--python", "3.13", str(VENV)], check=True)
    subprocess.run([uv, "pip", "install", "--python", str(PY), "-r", str(HERE / "molab-lock.txt"),
                    "--extra-index-url", TORCH_INDEX, "--index-strategy", "unsafe-best-match"], check=True)


def main():
    if "--setup" in sys.argv:
        setup()
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
