import json, numpy as np
from scipy.optimize import brentq
K,tp,th=1.8,12.0,2.5
Gp=lambda w:K*np.exp(-1j*w*th)/(1j*w*tp+1)
# unwrapped phase of Gp analytically-continuous: sum of terms (no atan2 wrap issue): use continuous construction
def ph(G,w):  # continuous unwrapped phase via integration from w small
    ws=np.concatenate([[1e-6],np.linspace(1e-6,w,200001)[1:]]) if w>1e-6 else np.array([w])
    p=np.unwrap(np.angle(G(ws))); return p[-1]
wu=brentq(lambda w:ph(Gp,w)+np.pi,0.01,5,xtol=1e-12)
Ku=1/abs(Gp(wu)); Pu=2*np.pi/wu
Kc=Ku/2.2; tI=Pu/1.2
L=lambda w:Kc*(1+1/(1j*w*tI))*Gp(w)
# PI adds negative phase: crossover where unwrapped phase = -pi
wpc=brentq(lambda w:ph(L,w)+np.pi,0.01,5,xtol=1e-12)
GM=1/abs(L(wpc))
wgc=brentq(lambda w:abs(L(w))-1,0.01,5,xtol=1e-12)
PM=180+np.degrees(ph(L,wgc))
print(json.dumps({"a":wu,"b":Ku,"c":Pu,"d_Kc":Kc,"d_tauI":tI,"e":GM,"f":PM,"e_wpc":wpc,"f_wgc":wgc}))
