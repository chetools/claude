import json, math
from scipy.optimize import brentq
z=[.05,.35,.40,.20]; al=[4.2,2.0,1.0,.45]; F=100
f=[F*c for c in z]
d=[f[0],.98*f[1],.03*f[2],0.0]; b=[fi-di for fi,di in zip(f,d)]
D=sum(d); B=sum(b)
xD=[di/D for di in d]; xBc=[bi/B for bi in b]
LK,HK=1,2
Nmin=math.log((d[LK]/b[LK])*(b[HK]/d[HK]))/math.log(al[LK]/al[HK])
q=1.0
fu=lambda t:sum(a*c/(a-t) for a,c in zip(al,z))-(1-q)
eps=1e-9
th=brentq(fu,al[HK]+eps,al[LK]-eps,xtol=1e-15)
Rmin=sum(a*c/(a-th) for a,c in zip(al,xD))-1
R=1.3*Rmin; X=(R-Rmin)/(R+1); Y=.75*(1-X**.5668)
N=brentq(lambda N:(N-Nmin)/(N+1)-Y,Nmin,1e3)
ratio=10**(0.206*math.log10((z[HK]/z[LK])*(xBc[LK]/xD[HK])**2*(B/D)))
print(json.dumps({"a":D,"b":Nmin,"c":th,"d":Rmin,"e":N,"f":ratio,"B":B,"xD":xD,"R":R,"X":X,"Y":Y,"NR":ratio/(1+ratio)*(N)}))
