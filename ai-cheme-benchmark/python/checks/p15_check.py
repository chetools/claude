import json, math
import numpy as np
from scipy.optimize import fsolve, brentq
w=np.array([.30,.40,.30]); M=np.array([78.11,92.14,106.17])
A=np.array([6.90565,6.95464,6.99891]);B=np.array([1211.033,1344.800,1474.679]);C=np.array([220.790,219.482,213.686])
z=(w/M)/(w/M).sum()
P=120e3                                  # Pa
# natural-log form in Pa: ln P = a' - B ln10/(C+T), a' = A ln10 + ln(133.322)
Pa=lambda i,T: math.exp(A[i]*math.log(10)+math.log(133.322)-B[i]*math.log(10)/(C[i]+T))
# full simultaneous system: unknowns x1..x3, V/F, T (fsolve), V/F fixed or T fixed
def resid(u,mode,spec):
    x=u[:3];psi=u[3];T=u[4]
    y=np.array([Pa(i,T)/P*x[i] for i in range(3)])
    r=[z[i]-(1-psi)*x[i]-psi*y[i] for i in range(3)]
    r.append(y.sum()-x.sum())
    r.append(psi-spec if mode=="psi" else T-spec)
    return r
def flash_T(T,g=(110.)):
    s=fsolve(resid,[*z,0.3,T],args=("T",T),xtol=1e-13);return s
def flash_psi(psi,T0=115.):
    return fsolve(resid,[*z,psi,T0],args=("psi",psi),xtol=1e-13)
# bubble: psi=0 -> x=z ; dew: psi=1 -> y=z
Tb=fsolve(lambda T:sum(Pa(i,T[0])/P*z[i] for i in range(3))-1,[100.],xtol=1e-13)[0]
Td=brentq(lambda T:sum(z[i]*P/Pa(i,T) for i in range(3))-1,50.,200.,xtol=1e-13)
s=flash_T(112.0)
y1=Pa(0,112.0)/P*s[0]
sh=flash_psi(0.5)
print(json.dumps({"a":Tb,"b":Td,"c":s[3],"d":y1,"e":sh[4]}))
