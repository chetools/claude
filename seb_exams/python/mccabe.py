"""McCabe-Thiele stepping for a binary with constant relative volatility (mole fractions, dimensionless).

Reference implementation used to compute the example exam's diagram and answer.
Independent check: smoker_stages() (Smoker 1938 closed form), see tests/test_mccabe.py.
"""
import numpy as np


def y_eq(x, alpha):
    return alpha * x / (1 + (alpha - 1) * x)


def x_eq(y, alpha):
    return y / (alpha - (alpha - 1) * y)


def r_min(alpha, zF, xD, q):
    """Minimum reflux from the pinch where the q-line meets the equilibrium curve."""
    if abs(q - 1) < 1e-12:
        xp = zF
    else:  # solve q-line y = q/(q-1) x - zF/(q-1) against equilibrium (quadratic)
        m, b = q / (q - 1), -zF / (q - 1)
        a2, a1, a0 = m * (alpha - 1), m + b * (alpha - 1) - alpha, b
        roots = np.roots([a2, a1, a0])
        xp = [r.real for r in roots if abs(r.imag) < 1e-12 and 0 < r.real < 1][0]
    yp = y_eq(xp, alpha)
    return (xD - yp) / (yp - xp)


def intersection(R, zF, xD, q):
    """Point where rectifying line meets the q-line."""
    if abs(q - 1) < 1e-12:
        x = zF
    else:
        x = (zF / (q - 1) + xD / (R + 1)) / (q / (q - 1) - R / (R + 1))
    return x, R / (R + 1) * x + xD / (R + 1)


def step_off(alpha, zF, xD, xB, q, R):
    """Step from the top. Returns (corners, number of stages, optimal feed stage).

    Stage count includes the partial reboiler; the last stage is counted whole."""
    xi, yi = intersection(R, zF, xD, q)
    rect = lambda x: R / (R + 1) * x + xD / (R + 1)
    strip = lambda x: xB + (yi - xB) / (xi - xB) * (x - xB)
    pts, y, n, feed = [(xD, xD)], xD, 0, None
    while True:
        x = x_eq(y, alpha)
        n += 1
        pts.append((x, y))
        if x <= xB:
            break
        if feed is None and x < xi:
            feed = n
        y = rect(x) if feed is None else strip(x)
        pts.append((x, y))
        if n > 200:
            raise RuntimeError("no convergence")
    return pts, n, feed


def smoker_stages(alpha, slope, intercept, x_start, x_end):
    """Smoker (1938) closed form for the (fractional) number of ideal stages when stepping down one straight
    operating line y = slope*x + intercept, from liquid composition x_start (the top of the section, on the
    operating line) to liquid composition x_end. Constant relative volatility alpha."""
    a, m, b = alpha, slope, intercept
    roots = np.roots([m * (a - 1), m + b * (a - 1) - a, b])
    k = [r.real for r in roots if abs(r.imag) < 1e-12 and -1e-9 <= r.real <= 1 + 1e-9][0]
    c = 1 + (a - 1) * k
    beta = m * c * (a - 1) / (a - m * c * c)
    x0, xn = x_start - k, x_end - k
    return np.log(x0 * (1 - beta * xn) / (xn * (1 - beta * x0))) / np.log(a / (m * c * c))
