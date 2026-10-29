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


def test_exam_column():
    """The diagram question: alpha=3, zF=0.5 (q=1), xD=0.9, xB=0.1, R=2*Rmin -> 7 stages, feed stage 3."""
    a, z, xD, xB = 3.0, 0.5, 0.9, 0.1
    R = 2 * m.r_min(a, z, xD, 1.0)
    pts, n, feed = m.step_off(a, z, xD, xB, 1.0, R)
    assert (n, feed) == (7, 3)
    xs = [p[0] for p in pts[1::2]]  # liquid leaving each stage
    assert xs[-2] > xB + 0.04 and xs[-1] < xB - 0.03  # last step clearly crosses xB
    assert xs[1] > 0.5 > xs[2]  # stage 3 straddles xi = 0.5
    # second, independent count: Smoker on each section, the feed stage switches lines
    s1 = m.smoker_stages(a, R / (R + 1), xD / (R + 1), xD, xs[2])
    assert abs(s1 - 3) < 1e-9
    assert np.all(np.diff(xs) < 0)


def _stages_with_feed_on(fs, a=3.0, xD=0.9, xB=0.1, R=1.2):
    """Stages needed when the switch to the stripping line is forced after stage fs-1 (None if infeasible)."""
    xi, yi = m.intersection(R, 0.5, xD, 1.0)
    y, n = xD, 0
    while True:
        x = m.x_eq(y, a)
        n += 1
        if x <= xB:
            return n
        y = R / (R + 1) * x + xD / (R + 1) if n < fs else xB + (yi - xB) / (xi - xB) * (x - xB)
        if y > m.y_eq(x, a) + 1e-12:
            return None


def test_exam_distractors_are_wrong():
    """Option 'feed on stage 5' needs 8 stages and 'feed on stage 2' is infeasible, so neither gives 7."""
    assert _stages_with_feed_on(3) == 7
    assert _stages_with_feed_on(5) == 8
    assert _stages_with_feed_on(2) is None
