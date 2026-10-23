import json, math
from scipy.optimize import brentq
rho,mu,Q,D,L,eps,K,dz,g,eta=998.,1e-3,0.025,0.10,150.,0.046e-3,5.5,12.,9.81,0.72
A=math.pi*D**2/4; u=Q/A; Re=rho*u*D/mu
res=lambda f: 1/math.sqrt(f)+2*math.log10(eps/(3.7*D)+2.51/(Re*math.sqrt(f)))
f=brentq(res,1e-4,0.5,xtol=1e-15)
sj=0.25/math.log10(eps/(3.7*D)+5.74/Re**0.9)**2
ha=(1/(-1.8*math.log10((eps/D/3.7)**1.11+6.9/Re)))**2
H=dz+(f*L/D+K)*u**2/(2*g)
P=rho*g*Q*H/eta/1e3
import sys; print("sanity SJ,Haaland",sj,ha,file=sys.stderr)
print(json.dumps({"a":Re,"b":f,"c":H,"d":P}))
