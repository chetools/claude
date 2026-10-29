"""Draws vapour-pressure.svg: vapour pressure of water from the Antoine equation (computed, not typed in).

Antoine: log10(P/mmHg) = A - B / (C + T/degC), A = 8.07131, B = 1730.63, C = 233.426, valid 1-100 degC for water.
Usage: python3 make_figure.py [output_directory]   (default: the folder of this script)
"""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

A, B, C = 8.07131, 1730.63, 233.426  # mmHg, degC


def p_sat(t_c):
    """Vapour pressure of water in mmHg at t_c in degC (Antoine, 1-100 degC)."""
    return 10 ** (A - B / (C + np.asarray(t_c, dtype=float)))


def main(out_dir):
    plt.rcParams.update({"font.size": 12, "svg.fonttype": "path", "svg.hashsalt": "seb-exams-example"})
    t = np.linspace(20, 100, 200)
    fig, ax = plt.subplots(figsize=(6, 4.2))
    ax.plot(t, p_sat(t), color="#1f4e8c", lw=2)
    ax.axhline(760, color="#b5432f", lw=1.3, ls="--")
    ax.annotate("760 mmHg (1 atm)", (21, 760), xytext=(0, 5), textcoords="offset points", color="#b5432f")
    ax.set_xlim(20, 105)
    ax.set_ylim(0, 850)
    ax.set_xticks(np.arange(20, 101, 10))
    ax.set_yticks(np.arange(0, 801, 100))
    ax.set_xticks(np.arange(20, 106, 5), minor=True)
    ax.grid(color="#d0d0d0", lw=0.7)
    ax.grid(which="minor", axis="x", color="#ececec", lw=0.5)
    ax.set_xlabel("Temperature (°C)")
    ax.set_ylabel("Vapour pressure of water (mmHg)")
    fig.tight_layout()
    fig.savefig(Path(out_dir) / "vapour-pressure.svg", format="svg", metadata={"Date": None})
    plt.close(fig)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent)
