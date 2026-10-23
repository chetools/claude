import json, math
import numpy as np
from scipy.optimize import fsolve, brentq
g = 9.81
rho, mu = 998.2, 1.002e-3
pipes = dict(s=(30., .200, .045e-3, 1.4), p1=(300., .125, .26e-3, 4.0), p2=(450., .100, .045e-3, 8.0),
             p3=(200., .075, .15e-3, 3.0), p4=(350., .100, .26e-3, 2.0), p5=(400., .125, .045e-3, 5.0),
             p6=(150., .150, .045e-3, 1.0))
H0, k, eta = 80., 12000., .70
zS, zT, zB, zC, zD, qB = 1., 14., 8., 4., 10., 0.016


def colebrook(Re, rr):  # root of the implicit Colebrook equation in f (brentq), not fixed-point
    F = lambda f: 1/math.sqrt(f) + 2*math.log10(rr/3.7 + 2.51/(Re*math.sqrt(f)))
    return brentq(F, 1e-4, 1.0, xtol=1e-15, rtol=1e-14)


def hl(Q, name):  # signed head loss
    L, D, e, K = pipes[name]
    if Q == 0: return 0.
    V = abs(Q)/(math.pi*D*D/4)
    f = colebrook(rho*V*D/mu, e/D)
    return math.copysign((f*L/D + K)*V*V/(2*g), Q)


# unknowns are pipe flows: Qp, Q1, Q3, Q5 (the others follow from continuity); equations are the energy
# balances around the two loops and the pump->tank path
def eqs(x):
    Qp, Q1, Q3, Q5 = x
    Q2 = Qp - Q1; Q4 = Q1 - Q3 - qB; Q6 = Q4 + Q5
    Q5c = Q2 + Q3                      # continuity at C must also hold
    loopI = hl(Q1, 'p1') + hl(Q3, 'p3') - hl(Q2, 'p2')
    loopII = hl(Q4, 'p4') - hl(Q5, 'p5') - hl(Q3, 'p3')
    path = zS - hl(Qp, 's') + H0 - k*Qp**2 - hl(Q2, 'p2') - hl(Q5, 'p5') - hl(Q6, 'p6') - zT
    return [loopI, loopII, path, Q5 - Q5c]


x = fsolve(eqs, [0.05, 0.03, 0.004, 0.02], xtol=1e-14)
Qp, Q1, Q3, Q5 = x
Q2 = Qp - Q1
Hp = H0 - k*Qp**2
HA = zS - hl(Qp, 's') + Hp
HC = HA - hl(Q2, 'p2')
print(json.dumps(dict(a=Qp*1e3, b=Hp, c=abs(Q3)*1e3, c_direction="from B to C" if Q3 > 0 else "from C to B",
                      d=rho*g*(HC - zC)/1e3, e=rho*g*Qp*Hp/eta/1e3)))
