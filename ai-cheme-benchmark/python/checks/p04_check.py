import json, math
from scipy.integrate import solve_ivp
from scipy.optimize import brentq
M,mu,T,D,L,eps,R=16.04,1.1e-5,288.,0.30,40e3,0.046e-3,8314.
p1,p2=5e6,3e6
a=R*T/M; A=math.pi*D**2/4
def colebrook(Re):
    r=lambda f:1/math.sqrt(f)+2*math.log10(eps/(3.7*D)+2.51/(Re*math.sqrt(f)))
    return brentq(r,1e-4,0.5,xtol=1e-15)
def outlet(m):
    G=m/A; Re=G*D/mu; f=colebrook(Re)
    rhs=lambda x,p:-f*G*G*a/(2*D*p[0])/(1-G*G*a/p[0]**2)
    pc=G*math.sqrt(a)*(1+1e-9)   # choking pressure; below it the model is invalid
    if p1<=pc: return -1e9
    ev=lambda x,p:p[0]-pc
    ev.terminal=True
    s=solve_ivp(rhs,[0,L],[p1],rtol=1e-11,atol=1e-4,method='LSODA',events=ev)
    return s.y[0,-1] if s.status==0 else 0.0
m=brentq(lambda m:outlet(m)-p2,10,2000,xtol=1e-12)
G=m/A; Re=G*D/mu; f=colebrook(Re)
u2=G*a/p2
print(json.dumps({"a":m,"b":Re,"c":f,"d":u2}))
