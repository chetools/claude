import json, numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq
K,tau,M=2.5,8.0,4.0
f=lambda t,y:[(K*M-y[0])/tau]
s=solve_ivp(f,[0,100],[0.0],method="DOP853",rtol=1e-13,atol=1e-14,dense_output=True)
yf=s.y[0,-1]  # t=100 >> tau
yfin=K*M
b=float(s.sol(10.0)[0])
c=brentq(lambda t:s.sol(t)[0]-0.95*yfin,0,100,xtol=1e-12)
print(json.dumps({"a":yfin,"b":b,"c":c}))
