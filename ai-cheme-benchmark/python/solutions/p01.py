r"""**P01 · Laminar oil flow.** Mean velocity from the flow rate, then $Re = \rho V D/\mu$.
The flow is laminar, so $f_D = 64/Re$ and Darcy–Weisbach gives the pressure drop
(identical to Hagen–Poiseuille)."""
import math

INPUTS = dict(rho=880.0, mu=0.12, Q=1.5e-3, D=0.040, L=25.0)


def solve(rho, mu, Q, D, L):
    # Step 1: mean velocity and Reynolds number
    V = Q / (math.pi * D**2 / 4)
    Re = rho * V * D / mu
    # Step 2: laminar Darcy friction factor
    f = 64.0 / Re
    # Step 3: Darcy-Weisbach pressure drop, in kPa
    dP = f * (L / D) * rho * V**2 / 2
    return dict(a=Re, b=f, c=dP / 1e3)
