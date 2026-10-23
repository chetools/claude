r"""**P05 · First-order step.** $y'(t) = K M (1 - e^{-t/\tau})$; 95 % is reached at $t = \tau\ln 20$."""
import math

INPUTS = dict(K=2.5, tau=8.0, M=4.0, t=10.0)


def solve(K, tau, M, t):
    final = K * M                          # Step 1: final value theorem
    y_t = final * (1 - math.exp(-t / tau))  # Step 2: response at time t
    t95 = tau * math.log(20)                # Step 3: 1 - e^{-t/tau} = 0.95
    return dict(a=final, b=y_t, c=t95)
