r"""**P12 · Fenske–Underwood–Gilliland.** Component splits give $D$ and the product compositions.
Fenske on the keys gives $N_{min}$. Underwood: solve $\sum \alpha_i z_i/(\alpha_i - \theta) = 1 - q = 0$
for $\alpha_{HK} < \theta < \alpha_{LK}$, then $R_{min} + 1 = \sum \alpha_i x_{D,i}/(\alpha_i - \theta)$.
Eduljee's Gilliland fit gives $N$; Kirkbride gives the feed location ratio."""
import math
from common import bisect

INPUTS = dict(F=100.0, z=(0.05, 0.35, 0.40, 0.20), alpha=(4.2, 2.0, 1.0, 0.45),
              rec_LK=0.98, rec_HK_bottoms=0.97, q=1.0, R_factor=1.3)


def solve(F, z, alpha, rec_LK, rec_HK_bottoms, q, R_factor):
    LK, HK = 1, 2
    # Step 1: component split (non-keys go entirely to one product)
    d = [F * z[0], F * z[LK] * rec_LK, F * z[HK] * (1 - rec_HK_bottoms), 0.0]
    b = [F * zi - di for zi, di in zip(z, d)]
    D, B = sum(d), sum(b)
    xD = [di / D for di in d]
    xB = [bi / B for bi in b]
    # Step 2: Fenske on the keys
    Nmin = math.log((d[LK] / b[LK]) * (b[HK] / d[HK])) / math.log(alpha[LK] / alpha[HK])
    # Step 3: Underwood feed equation for theta between the key volatilities
    feed_eq = lambda th: sum(a * zi / (a - th) for a, zi in zip(alpha, z)) - (1 - q)
    theta = bisect(feed_eq, alpha[HK] + 1e-9, alpha[LK] - 1e-9)
    Rmin = sum(a * x / (a - theta) for a, x in zip(alpha, xD)) - 1
    # Step 4: Gilliland (Eduljee) at R = 1.3 Rmin, solved for N
    R = R_factor * Rmin
    X = (R - Rmin) / (R + 1)
    Y = 0.75 * (1 - X**0.5668)
    N = (Nmin + Y) / (1 - Y)
    # Step 5: Kirkbride feed location
    ratio = 10 ** (0.206 * math.log10(z[HK] / z[LK] * (xB[LK] / xD[HK])**2 * B / D))
    return dict(a=D, b=Nmin, c=theta, d=Rmin, e=N, f=ratio)
