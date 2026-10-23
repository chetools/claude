r"""**P03 · Three reservoirs.** Guess the junction head $h_J$. For each pipe the head difference
$|z_i - h_J|$ fixes the flow through Darcy–Weisbach + Colebrook (solved together by iteration).
Flows into J must balance flows out of J, so $h_J$ is the root of the continuity residual,
found by bisection between the lowest and highest reservoir levels."""
import math
from common import colebrook_f, bisect, G

INPUTS = dict(z=(120.0, 100.0, 70.0), L=(1500.0, 800.0, 1200.0), D=(0.30, 0.20, 0.25),
              eps=0.26e-3, nu=1.0e-6)


def pipe_flow(h, L, D, eps, nu):
    """Flow (m^3/s) through one pipe for a head loss h > 0: iterate V <-> f."""
    f = 0.02
    for _ in range(200):
        V = math.sqrt(2 * G * h * D / (f * L))
        f_new = colebrook_f(V * D / nu, eps / D)
        if abs(f_new - f) < 1e-15:
            break
        f = f_new
    return V * math.pi * D**2 / 4


def solve(z, L, D, eps, nu):
    # Step 1: signed flow from each reservoir into J (positive = toward J)
    def inflows(hJ):
        return [math.copysign(pipe_flow(abs(zi - hJ), Li, Di, eps, nu), zi - hJ) if zi != hJ else 0.0
                for zi, Li, Di in zip(z, L, D)]
    # Step 2: continuity at J, sum of inflows = 0, solved for hJ
    hJ = bisect(lambda h: sum(inflows(h)), min(z) + 1e-9, max(z) - 1e-9)
    Q = inflows(hJ)
    # Step 3: report flows in L/s; pipe 2 is positive when water leaves B toward J
    return dict(a=hJ, b=Q[0] * 1e3, c=abs(Q[1]) * 1e3,
                c_direction="out of B" if Q[1] > 0 else "into B", d=-Q[2] * 1e3)
