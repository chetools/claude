import json, numpy as np
from scipy.optimize import brentq, minimize_scalar
K, th, taus, tm = 2.0, 1.5, [6.0, 2.0, 1.0], 0.5
# Independent route: complex frequency response, phase from the unwrapped angle of the product
def Gpm(w):
    s = 1j * w
    return K * np.exp(-th * s) / (np.prod([t * s + 1 for t in taus + [tm]], axis=0))
def unwrapped_phase(F, w):
    ws = np.linspace(1e-6, w, 400001)
    return np.unwrap(np.angle(F(ws)))[-1]
wu = brentq(lambda w: unwrapped_phase(Gpm, w) + np.pi, 0.05, 2.0, xtol=1e-13)
Ku = 1 / abs(Gpm(wu)); Pu = 2 * np.pi / wu
Kc, tI, tD = 0.6 * Ku, Pu / 2, Pu / 8
L = lambda w: Kc * (1 + 1 / (1j * w * tI) + 1j * w * tD) * Gpm(w)
wpc = brentq(lambda w: unwrapped_phase(L, w) + np.pi, wu * 1.0001, 1.5, xtol=1e-13)
GM = 1 / abs(L(wpc))
wgc = brentq(lambda w: abs(L(w)) - 1, 0.01, wpc, xtol=1e-13)
PM = 180 + np.degrees(unwrapped_phase(L, wgc))
ws = np.linspace(0.01, 20, 400001)
i = np.argmin(np.abs(1 + L(ws)))
r = minimize_scalar(lambda w: abs(1 + L(w)), bracket=(ws[i - 1], ws[i], ws[i + 1]), tol=1e-12)
Ms = 1 / r.fun
print(json.dumps(dict(a=wu, b_Ku=Ku, b_Pu=Pu, c_Kc=Kc, c_tauI=tI, c_tauD=tD, d_GM=GM, d_wpc=wpc,
                      e_PM=PM, e_wgc=wgc, f_Ms=Ms, f_w=float(r.x))))
