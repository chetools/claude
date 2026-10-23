import json, numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq
a2,a1,a0,K,M=9.0,2.4,1.0,4.0,2.0
zeta=a1/(2*np.sqrt(a2*a0))
def f(t,x): return [x[1],(K*M-a1*x[1]-a0*x[0])/a2]
s=solve_ivp(f,[0,60],[0,0],method="DOP853",rtol=1e-13,atol=1e-14,dense_output=True)
dy=lambda t:s.sol(t)[1]
ts=np.linspace(1e-3,60,60001); v=dy(ts)
idx=np.where(np.sign(v[:-1])!=np.sign(v[1:]))[0]
pk=[brentq(dy,ts[i],ts[i+1],xtol=1e-12) for i in idx]
y1,y2,y3=[s.sol(t)[0] for t in pk[:3]]
yf=K*M
# peak 1 (max), peak 2 (min, first undershoot), peak 3 (second max)
os_=(y1-yf)/yf*100
dr=(y3-yf)/(y1-yf)
dr2=(y1-yf and (y3-yf)/(y1-yf))
print(json.dumps({"a":zeta,"b":os_,"c":pk[0],"d":y1,"e":dr,"e_alt_successive_peaks_same_sign":dr,"first_undershoot_time":pk[1]}))
