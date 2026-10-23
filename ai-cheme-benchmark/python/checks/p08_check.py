import json, numpy as np
from scipy.optimize import brentq
tI=4.0
den=np.polymul(np.polymul([1,1],[2,1]),[5,1])
def poly(Kc): # tI*s*den + Kc*(tI*s+1)
    p=np.polyadd(np.polymul([tI,0],den),Kc*np.array([tI,1.0]))
    return p
mr=lambda Kc:max(np.roots(poly(Kc)).real)
# scan to find first crossing (stable at small Kc)
Ks=np.linspace(0.01,20,20000); m=np.array([mr(k) for k in Ks])
assert m[0]<0
i=np.argmax(m>=0)
Kmax=brentq(mr,Ks[i-1],Ks[i],xtol=1e-13)
r=np.roots(poly(Kmax)); crit=r[np.argmax(r.real)]
w=abs(crit.imag)
# offset: P-only, Kc=3; simulate closed loop final value via state-space
import scipy.signal as sg
Kp=3.0
cl=sg.TransferFunction([Kp],np.polyadd(den,[Kp]))
t=np.linspace(0,2000,200001); _,y=sg.step(cl,T=t)
off=1-y[-1]
print(json.dumps({"a":Kmax,"b":w,"c":off}))
