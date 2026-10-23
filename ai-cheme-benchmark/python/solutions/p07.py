r"""**P07 · Dead-time loop.** Phase of $G_p$: $-\theta\omega - \arctan(\tau\omega)$; set it to $-\pi$
and solve for $\omega_u$. Then $K_u = 1/|G_p(i\omega_u)|$, $P_u = 2\pi/\omega_u$, Ziegler–Nichols PI.
With the PI controller the phase gains $-\pi/2 + \arctan(\tau_I\omega)$; solve again for the
phase crossover (gain margin) and for $|G_cG_p| = 1$ (phase margin)."""
import math
from common import bisect

INPUTS = dict(K=1.8, theta=2.5, tau=12.0)


def solve(K, theta, tau):
    mag_p = lambda w: K / math.sqrt(1 + (tau * w)**2)
    ph_p = lambda w: -theta * w - math.atan(tau * w)
    # Step 1: ultimate frequency, phase(Gp) = -pi
    wu = bisect(lambda w: ph_p(w) + math.pi, 1e-6, math.pi / theta)
    # Step 2: ultimate gain and period
    Ku = 1 / mag_p(wu)
    Pu = 2 * math.pi / wu
    # Step 3: Ziegler-Nichols PI settings
    Kc, tauI = Ku / 2.2, Pu / 1.2
    mag = lambda w: Kc * math.sqrt(1 + 1 / (tauI * w)**2) * mag_p(w)
    ph = lambda w: ph_p(w) - math.atan(1 / (tauI * w))
    # Step 4: gain margin at the phase crossover of Gc*Gp
    w180 = bisect(lambda w: ph(w) + math.pi, 1e-6, wu)
    GM = 1 / mag(w180)
    # Step 5: phase margin at the gain crossover |Gc*Gp| = 1
    wc = bisect(lambda w: mag(w) - 1, 1e-4, w180)
    PM = 180 + math.degrees(ph(wc))
    return dict(a=wu, b=Ku, c=Pu, d_Kc=Kc, d_tauI=tauI, e=GM, f=PM)
