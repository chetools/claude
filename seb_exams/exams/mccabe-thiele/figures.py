"""Draws fig_stages.svg for the stepping question from the reference stepper (python/mccabe.py)."""
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "python"))
import mccabe as m  # noqa: E402

ALPHA, ZF, XD, XB, Q, R = 3.0, 0.5, 0.9, 0.1, 1.0, 1.2


def main(out_dir):
    pts, n, feed = m.step_off(ALPHA, ZF, XD, XB, Q, R)
    assert (n, feed) == (7, 3), (n, feed)  # the answer key depends on this
    xi, yi = m.intersection(R, ZF, XD, Q)
    plt.rcParams.update({"font.size": 12, "svg.fonttype": "path"})
    fig, ax = plt.subplots(figsize=(6, 6))
    x = np.linspace(0, 1, 400)
    ax.plot(x, m.y_eq(x, ALPHA), color="#1f4e8c", lw=2, label=r"equilibrium, $\alpha = 3$")
    ax.plot([0, 1], [0, 1], color="#555", lw=1, label="$y = x$")
    ax.plot([xi, XD], [yi, XD], color="#b5432f", lw=1.8, label="rectifying line")
    ax.plot([XB, xi], [XB, yi], color="#2f8a4e", lw=1.8, label="stripping line")
    ax.plot([ZF, ZF], [ZF, yi], color="#8a6d1f", lw=1.5, ls="--", label="q-line (q = 1)")
    px, py = zip(*pts)
    ax.plot(px, py, color="black", lw=1.2)
    for v, lab in ((XB, "$x_B$"), (ZF, "$z_F$"), (XD, "$x_D$")):
        ax.plot([v, v], [0, v], color="#999", lw=0.8, ls=":")
        ax.annotate(lab, (v, 0.0), xytext=(0, -26), textcoords="offset points", ha="center")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_aspect("equal")
    ax.set_xticks(np.arange(0, 1.01, 0.1))
    ax.set_yticks(np.arange(0, 1.01, 0.1))
    ax.grid(color="#e5e5e5", lw=0.6)
    ax.set_xlabel("$x$ (liquid mole fraction)", labelpad=18)
    ax.set_ylabel("$y$ (vapour mole fraction)")
    ax.legend(loc="lower right", fontsize=10, framealpha=0.95)
    fig.tight_layout()
    fig.savefig(Path(out_dir) / "fig_stages.svg", format="svg")
    plt.close(fig)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE)
