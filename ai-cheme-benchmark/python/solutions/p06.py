r"""**P06 · Underdamped second order.** Match $9s^2 + 2.4s + 1$ to $\tau^2 s^2 + 2\zeta\tau s + 1$.
Then overshoot $= e^{-\pi\zeta/\sqrt{1-\zeta^2}}$, $t_p = \pi\tau/\sqrt{1-\zeta^2}$,
decay ratio $=$ overshoot$^2$."""
import math

INPUTS = dict(K=4.0, a2=9.0, a1=2.4, M=2.0)


def solve(K, a2, a1, M):
    tau = math.sqrt(a2)                     # Step 1: time constant and damping factor
    zeta = a1 / (2 * tau)
    OS = math.exp(-math.pi * zeta / math.sqrt(1 - zeta**2))   # Step 2: overshoot
    tp = math.pi * tau / math.sqrt(1 - zeta**2)                # Step 3: first peak time
    y_max = K * M * (1 + OS)                                   # Step 4: peak value
    return dict(a=zeta, b=100 * OS, c=tp, d=y_max, e=OS**2)   # Step 5: decay ratio = OS^2
