r"""**P15 · Ternary flash.** *Step 1, feed.* Convert the mass fractions to mole fractions:
$z_i = (w_i/M_i)\,/\,\sum_j (w_j/M_j)$.
*Step 2, vapour pressures.* $\log_{10} P_i^{sat}[\mathrm{mmHg}] = A_i - B_i/(C_i + T[^\circ\mathrm C])$, and
Raoult's law gives $K_i = P_i^{sat}/P$ with $P$ converted to mmHg (1 mmHg = 0.133322 kPa).
*Step 3, bubble point:* the temperature where $\sum_i z_i K_i = 1$. *Dew point:* where $\sum_i z_i/K_i = 1$
(both found by bisection, because $K_i$ rises with $T$).
*Step 4, flash at a given $T$:* the Rachford–Rice function $g(\psi)=\sum_i z_i(K_i-1)/(1+\psi(K_i-1))$,
$\psi=V/F$, is monotonically decreasing, so it has one root in $(0,1)$ when $T$ lies between the bubble and dew points.
Then $x_i = z_i/(1+\psi(K_i-1))$ and $y_i=K_i x_i$.
*Step 5, $T$ for $V/F=0.5$:* an outer bisection on $T$ around the inner Rachford–Rice solve,
using that $\psi(T)$ increases with $T$."""
from common import bisect

INPUTS = dict(P_kPa=120.0, w=(0.30, 0.40, 0.30), M=(78.11, 92.14, 106.17),
              A=(6.90565, 6.95464, 6.99891), B=(1211.033, 1344.800, 1474.679),
              C=(220.790, 219.482, 213.686), T_flash=112.0, psi_target=0.5)

MMHG_PER_KPA = 1 / 0.133322


def solve(P_kPa, w, M, A, B, C, T_flash, psi_target):
    # Step 1: mole fractions of the feed
    n = [wi / Mi for wi, Mi in zip(w, M)]
    z = [ni / sum(n) for ni in n]
    P = P_kPa * MMHG_PER_KPA                        # mmHg

    # Step 2: K-values from Antoine + Raoult
    def K(T):
        return [10 ** (A[i] - B[i] / (C[i] + T)) / P for i in range(3)]

    # Step 3: bubble and dew points
    Tb = bisect(lambda T: sum(zi * k for zi, k in zip(z, K(T))) - 1, 20.0, 300.0)
    Td = bisect(lambda T: sum(zi / k for zi, k in zip(z, K(T))) - 1, 20.0, 300.0)

    # Step 4: Rachford-Rice at a given temperature
    def rr(T):
        k = K(T)
        g = lambda psi: sum(zi * (ki - 1) / (1 + psi * (ki - 1)) for zi, ki in zip(z, k))
        psi = bisect(g, 0.0, 1.0)
        x = [zi / (1 + psi * (ki - 1)) for zi, ki in zip(z, k)]
        return psi, x, [ki * xi for ki, xi in zip(k, x)]

    psi, x, y = rr(T_flash)
    # Step 5: outer iteration on T for V/F = psi_target
    T_half = bisect(lambda T: rr(T)[0] - psi_target, Tb + 1e-6, Td - 1e-6)
    return dict(a=Tb, b=Td, c=psi, d=y[0], e=T_half)


if __name__ == "__main__":
    print(solve(**INPUTS))
