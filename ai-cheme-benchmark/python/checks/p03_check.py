import json, math
from scipy.optimize import brentq
g,nu,eps=9.81,1e-6,0.26e-3
Z={'A':120.,'B':100.,'C':70.}
P={1:(1500.,0.30),2:(800.,0.20),3:(1200.,0.25)}
def Qmag(h,L,D):
    h=abs(h)
    if h==0: return 0.
    s=math.sqrt(2*g*D*h/L)
    v=-2*s*math.log10(eps/(3.7*D)+2.51*nu/(D*s))
    return v*math.pi*D**2/4
def flows(H):  # positive = toward J
    q1=math.copysign(Qmag(Z['A']-H,*P[1]),Z['A']-H)
    q2=math.copysign(Qmag(Z['B']-H,*P[2]),Z['B']-H)
    q3=math.copysign(Qmag(Z['C']-H,*P[3]),Z['C']-H)
    return q1,q2,q3
H=brentq(lambda H:sum(flows(H)),70.,120.,xtol=1e-13)
q1,q2,q3=flows(H)
print(json.dumps({"a":H,"b":q1*1e3,"c":abs(q2)*1e3,"c_direction":"into B" if q2<0 else "out of B","d":-q3*1e3}))
