r"""**P11 · McCabe–Thiele.** Overall balances give $D$. The $q$-line $y = \frac{q}{q-1}x - \frac{z_F}{q-1}$
meets the equilibrium curve at the pinch $(x', y')$, so $R_{min} = (x_D - y')/(y' - x')$.
Step down from $x_D$: equilibrium $x = y/(\alpha - (\alpha-1)y)$, then the rectifying line until
$x$ falls below the operating-line intersection, then the stripping line until $x \le x_B$."""
from common import bisect

INPUTS = dict(alpha=2.4, F=100.0, zF=0.45, q=0.6, xD=0.96, xB=0.04, R_factor=1.5)


def solve(alpha, F, zF, q, xD, xB, R_factor):
    # Step 1: overall and component balances
    D = F * (zF - xB) / (xD - xB)
    B = F - D
    # Step 2: q-line meets the equilibrium curve -> minimum reflux
    y_eq = lambda x: alpha * x / (1 + (alpha - 1) * x)
    x_eq = lambda y: y / (alpha - (alpha - 1) * y)
    q_line = lambda x: q / (q - 1) * x - zF / (q - 1)
    xp = bisect(lambda x: y_eq(x) - q_line(x), 1e-9, zF)
    yp = y_eq(xp)
    Rmin = (xD - yp) / (yp - xp)
    R = R_factor * Rmin
    # Step 3: operating lines and their intersection
    L, V = R * D, (R + 1) * D
    Lb, Vb = L + q * F, V - (1 - q) * F
    rect = lambda x: L / V * x + D * xD / V
    strip = lambda x: Lb / Vb * x - B * xB / Vb
    xi = bisect(lambda x: rect(x) - q_line(x), 1e-9, 1 - 1e-9)
    # Step 4: step off stages from the top
    xs, x, y, feed = [], None, xD, None
    while True:
        x = x_eq(y)
        xs.append(x)
        if x <= xB:
            break
        if feed is None and x < xi:
            feed = len(xs)
        y = rect(x) if feed is None else strip(x)
    n = len(xs)
    frac = (xs[-2] - xB) / (xs[-2] - xs[-1])
    return dict(a=D, b=Rmin, c=R, d=n - 1 + frac, e=feed)
