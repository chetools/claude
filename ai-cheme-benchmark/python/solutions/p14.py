r"""**P14 · Dead-time PID loop.** Let $G_{pm}(s)=G_vG_pG_m=\dfrac{K e^{-\theta s}}{(\tau_1 s+1)(\tau_2 s+1)(\tau_3 s+1)(\tau_m s+1)}$
(the sensor lag is a fourth lag).

1. **Ultimate frequency.** Phase of $G_{pm}(i\omega)$ is $\phi_p(\omega)=-\theta\omega-\sum_k\arctan(\tau_k\omega)$, continuous and
   decreasing. Solve $\phi_p(\omega_u)=-\pi$ (radians!) by bisection. Keep the exact $e^{-\theta s}$: the phase of the dead time
   is $-\theta\omega$ rad, not a Padé angle.
2. **Ultimate gain and period.** $K_u=1/|G_{pm}(i\omega_u)|$ with $|G_{pm}|=K/\prod\sqrt{1+\tau_k^2\omega^2}$ and $P_u=2\pi/\omega_u$.
3. **Ziegler–Nichols PID (ideal form).** $K_c=0.6K_u$, $\tau_I=P_u/2$, $\tau_D=P_u/8$ in
   $G_c=K_c\left(1+\dfrac{1}{\tau_I s}+\tau_D s\right)$. Its phase is $\phi_c=\arctan\!\left(\tau_D\omega-\dfrac{1}{\tau_I\omega}\right)$,
   which is $-90^\circ$ as $\omega\to0^+$ and is *positive* at $\omega_u$ (about $+25^\circ$), so the new phase crossover lies
   *above* $\omega_u$. Note the combined term is a single arctangent of the *sum*, not a sum of separate arctangents.
4. **Gain margin.** $L=G_cG_{pm}$, $\phi_L=\phi_c+\phi_p$. Solve $\phi_L(\omega_{pc})=-\pi$ (lowest root) and
   $GM=1/|L(i\omega_{pc})|$.
5. **Phase margin.** Solve $|L(i\omega_{gc})|=1$, $PM=180^\circ+\phi_L(\omega_{gc})$ in degrees.
6. **Peak sensitivity.** $M_s=\max_\omega 1/|1+L(i\omega)|$. $|1+L|$ has several minima (the dead time makes $L$ spiral), so scan
   a fine frequency grid first, then refine the best local minimum by golden-section search."""
import math
import cmath
from common import bisect

INPUTS = dict(K=2.0, theta=1.5, taus=(6.0, 2.0, 1.0), tau_m=0.5)


def solve(K, theta, taus, tau_m):
    lags = list(taus) + [tau_m]
    ph_p = lambda w: -theta * w - sum(math.atan(t * w) for t in lags)
    mag_p = lambda w: K / math.prod(math.sqrt(1 + (t * w)**2) for t in lags)
    # Steps 1-2: ultimate frequency, gain, period
    wu = bisect(lambda w: ph_p(w) + math.pi, 1e-6, math.pi / theta)
    Ku = 1 / mag_p(wu)
    Pu = 2 * math.pi / wu
    # Step 3: Ziegler-Nichols ideal PID
    Kc, tauI, tauD = 0.6 * Ku, Pu / 2, Pu / 8
    ph_c = lambda w: math.atan(tauD * w - 1 / (tauI * w))
    mag_c = lambda w: Kc * math.hypot(1, tauD * w - 1 / (tauI * w))
    ph = lambda w: ph_c(w) + ph_p(w)
    mag = lambda w: mag_c(w) * mag_p(w)
    # Step 4: gain margin (lowest phase crossover; phase is -90 deg at w->0 and rises, then falls)
    a = wu
    b = wu * 1.0001
    while ph(b) > -math.pi:      # step up until the phase has dropped below -180 deg
        a, b = b, b * 1.05
    wpc = bisect(lambda w: ph(w) + math.pi, a, b)
    GM = 1 / mag(wpc)
    # Step 5: phase margin (|L| = 1 crossing is unique; |L| -> infinity as w -> 0)
    a, b = 1e-4, wpc
    wgc = bisect(lambda w: mag(w) - 1, a, b)
    PM = 180 + math.degrees(ph(wgc))
    # Step 6: peak sensitivity by scan + golden section on |1 + L|
    def L(w):
        s = 1j * w
        Gc = Kc * (1 + 1 / (tauI * s) + tauD * s)
        Gp = K * cmath.exp(-theta * s)
        for t in lags:
            Gp /= (t * s + 1)
        return Gc * Gp
    f = lambda w: abs(1 + L(w))
    n = 20000
    ws = [0.001 * (30 / 0.001)**(k / n) for k in range(n + 1)]   # log grid 0.001 .. 30
    k = min(range(n + 1), key=lambda j: f(ws[j]))
    lo, hi = ws[max(k - 1, 0)], ws[min(k + 1, n)]
    g = (math.sqrt(5) - 1) / 2
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    for _ in range(200):
        if f(c) < f(d):
            hi, d = d, c
            c = hi - g * (hi - lo)
        else:
            lo, c = c, d
            d = lo + g * (hi - lo)
        if hi - lo < 1e-14:
            break
    w_ms = 0.5 * (lo + hi)
    Ms = 1 / f(w_ms)
    return dict(a=wu, b_Ku=Ku, b_Pu=Pu, c_Kc=Kc, c_tauI=tauI, c_tauD=tauD,
                d_GM=GM, d_wpc=wpc, e_PM=PM, e_wgc=wgc, f_Ms=Ms, f_w=w_ms)
