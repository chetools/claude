"""Rebuilds examples/example-exam/vapour-pressure.svg and writes examples/example-exam.zip (deterministic:
fixed file order, fixed timestamps, so the same inputs always give the same bytes)."""
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "example-exam"
FILES = ["exam.yaml", "vapour-pressure.svg"]  # exam.yaml at the zip root


def main():
    subprocess.run([sys.executable, str(SRC / "make_figure.py"), str(SRC)], check=True)
    out = HERE / "example-exam.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, (SRC / name).read_bytes())
    print("wrote", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
