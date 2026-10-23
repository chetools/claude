r"""**P04 · Isothermal gas pipeline.** For isothermal ideal-gas flow with constant mass flux $G$,
integrating the momentum equation gives
$p_1^2 - p_2^2 = \frac{G^2 RT}{M}\left[f_D\frac{L}{D} + 2\ln\frac{p_1}{p_2}\right]$.
$Re = GD/\mu$ is constant along the pipe, so $f_D$ is constant; iterate $G \leftrightarrow f_D$."""
import math
from common import colebrook_f

INPUTS = dict(M=16.04, mu=1.1e-5, T=288.0, D=0.30, L=40e3, eps=0.046e-3, p1=5.0e6, p2=3.0e6, R=8314.0)


def solve(M, mu, T, D, L, eps, p1, p2, R):
    A = math.pi * D**2 / 4
    f = 0.01
    for _ in range(200):
        # Step 1: mass flux from the isothermal flow equation for the current f
        G2 = (p1**2 - p2**2) * M / (R * T) / (f * L / D + 2 * math.log(p1 / p2))
        Gm = math.sqrt(G2)
        # Step 2: Reynolds number and Colebrook friction factor
        Re = Gm * D / mu
        f_new = colebrook_f(Re, eps / D)
        if abs(f_new - f) < 1e-15:
            break
        f = f_new
    # Step 3: outlet density and velocity
    rho2 = p2 * M / (R * T)
    return dict(a=Gm * A, b=Re, c=f, d=Gm / rho2)
