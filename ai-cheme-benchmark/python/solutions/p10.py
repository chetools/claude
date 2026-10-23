r"""**P10 · Kremser absorber.** At minimum solvent the rich liquid leaving the bottom is in
equilibrium with the entering gas, $x_N^* = y_{in}/m$. Then $A = L/(mG)$ and
$N = \ln\!\left[\frac{y_{in} - m x_0}{y_{out} - m x_0}\left(1 - \frac1A\right) + \frac1A\right]/\ln A$."""
import math

INPUTS = dict(G=100.0, y_in=0.020, rec=0.95, m=1.8, factor=1.5, x0=0.0)


def solve(G, y_in, rec, m, factor, x0):
    y_out = y_in * (1 - rec)                     # Step 1: outlet gas composition
    L_min = G * (y_in - y_out) / (y_in / m - x0)  # Step 2: pinch at the rich end
    L = factor * L_min
    A = L / (m * G)                               # Step 3: absorption factor
    N = math.log((y_in - m * x0) / (y_out - m * x0) * (1 - 1 / A) + 1 / A) / math.log(A)  # Step 4: Kremser
    return dict(a=L_min, b=A, c=N)
