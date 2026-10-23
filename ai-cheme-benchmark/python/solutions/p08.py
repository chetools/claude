r"""**P08 · Routh stability.** Characteristic equation
$\tau_I s(s+1)(2s+1)(5s+1) + K_c(\tau_I s + 1) = 0$, i.e.
$40s^4 + 68s^3 + 32s^2 + (4+4K_c)s + K_c = 0$ for $\tau_I = 4$.
The first-column Routh entries must stay positive; at the limit the $s^2$ row gives the
auxiliary equation $b_1 s^2 + K_c = 0$, so $\omega = \sqrt{K_c/b_1}$."""
import math
from common import bisect

INPUTS = dict(tauI=4.0, Kc_P=3.0)


def solve(tauI, Kc_P):
    # Step 1: open-loop denominator (s+1)(2s+1)(5s+1) = 10s^3 + 17s^2 + 8s + 1
    def char_coeffs(Kc):
        return (10 * tauI, 17 * tauI, 8 * tauI, tauI + Kc * tauI, Kc)
    # Step 2: Routh array first column for a 4th-order polynomial
    def routh(Kc):
        a4, a3, a2, a1, a0 = char_coeffs(Kc)
        b1 = (a3 * a2 - a4 * a1) / a3
        c1 = (b1 * a1 - a3 * a0) / b1
        return b1, c1
    # Step 3: c1(Kc) = 0 gives the stability limit (b1 stays positive)
    Kc_max = bisect(lambda k: routh(k)[1], 1e-6, 12.0)
    b1 = routh(Kc_max)[0]
    w = math.sqrt(Kc_max / b1)
    # Step 4: P-only offset for a unit setpoint step: 1/(1 + Kc*Kp), Kp = 1
    return dict(a=Kc_max, b=w, c=1 / (1 + Kc_P))
