"""Independent checks of python/mccabe.py: Smoker closed form, Fenske, analytic minimum reflux."""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
import mccabe as m  # noqa: E402


def test_rmin_saturated_liquid_closed_form():
    a, z, xD = 3.0, 0.5, 0.9
    ys = a * z / (1 + (a - 1) * z)
    assert abs(m.r_min(a, z, xD, 1.0) - (xD - ys) / (ys - z)) < 1e-12
    assert abs(m.r_min(a, z, xD, 1.0) - 0.6) < 1e-12


def test_rmin_partial_vapour_feed_pinch_on_curve():
    a, z, xD, q = 3.0, 0.5, 0.9, 0.6
    R = m.r_min(a, z, xD, q)
    x, y = m.intersection(R, z, xD, q)
    assert abs(y - m.y_eq(x, a)) < 1e-10  # pinch: lines meet on the equilibrium curve


def test_single_line_against_smoker():
    # step down the rectifying line only, compare with Smoker's fractional count
    a, xD, R = 3.0, 0.9, 1.2
    slope, icpt = R / (R + 1), xD / (R + 1)
    for x_end in (0.6, 0.5, 0.45, 0.4):
        y, n, x = xD, 0, xD
        while x > x_end:
            x = m.x_eq(y, a)
            n += 1
            y = slope * x + icpt
        N = m.smoker_stages(a, slope, icpt, xD, x_end)
        assert n == math.ceil(N), (x_end, n, N)


def test_smoker_exact_endpoint():
    # stepping to an exact stage composition: Smoker gives an integer
    a, xD, R = 3.0, 0.9, 1.2
    slope, icpt = R / (R + 1), xD / (R + 1)
    y, x = xD, xD
    for _ in range(3):
        x = m.x_eq(y, a)
        y = slope * x + icpt
    assert abs(m.smoker_stages(a, slope, icpt, xD, x) - 3.0) < 1e-9


def test_total_reflux_matches_fenske():
    a, xD, xB = 3.0, 0.9, 0.1 * 1.07
    nmin = math.log(xD / (1 - xD) * (1 - xB) / xB) / math.log(a)
    _, n, _ = m.step_off(a, 0.5, xD, xB, 1.0, 1e9)
    assert n == math.ceil(nmin), (n, nmin)
