r"""**P02 · Pump power.** Reynolds number, Colebrook friction factor, then the mechanical-energy
balance between the two free surfaces: $H = \Delta z + (f_D L/D + \sum K)\,V^2/2g$, and
shaft power $= \rho g Q H/\eta$."""
import math
from common import colebrook_f, G

INPUTS = dict(rho=998.0, mu=1.0e-3, Q=0.025, D=0.10, L=150.0, eps=0.046e-3, dz=12.0, K=5.5, eta=0.72)


def solve(rho, mu, Q, D, L, eps, dz, K, eta):
    # Step 1: velocity and Reynolds number
    V = Q / (math.pi * D**2 / 4)
    Re = rho * V * D / mu
    # Step 2: Colebrook friction factor
    f = colebrook_f(Re, eps / D)
    # Step 3: pump head = static lift + friction + minor losses
    H = dz + (f * L / D + K) * V**2 / (2 * G)
    # Step 4: shaft power in kW
    P = rho * G * Q * H / eta
    return dict(a=Re, b=f, c=H, d=P / 1e3)
