r"""**P09 · Fenske and minimum reflux.** $N_{min} = \ln[(x_D/(1-x_D))((1-x_B)/x_B)]/\ln\alpha$.
For saturated liquid feed ($q=1$) the pinch is at $x = z_F$ on the equilibrium curve:
$R_{min} = (x_D - y^*)/(y^* - z_F)$."""
import math

INPUTS = dict(alpha=2.5, zF=0.40, xD=0.95, xB=0.05)


def solve(alpha, zF, xD, xB):
    Nmin = math.log(xD / (1 - xD) * (1 - xB) / xB) / math.log(alpha)  # Step 1: Fenske
    y_star = alpha * zF / (1 + (alpha - 1) * zF)                       # Step 2: pinch point
    Rmin = (xD - y_star) / (y_star - zF)                               # Step 3: slope of the pinch line
    return dict(a=Nmin, b=Rmin)
