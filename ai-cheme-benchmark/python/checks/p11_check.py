import json
from scipy.optimize import brentq
a=2.4; F=100; zF=.45; q=.6; xD=.96; xB=.04
yeq=lambda x:a*x/(1+(a-1)*x)
xeq=lambda y:y/(a-(a-1)*y)
D=F*(zF-xB)/(xD-xB); B=F-D
qline=lambda x:q/(q-1)*x-zF/(q-1)
xp=brentq(lambda x:yeq(x)-qline(x),1e-9,zF); yp=yeq(xp)
Rmin=(xD-yp)/(yp-xp)
# no tangent pinch: line from (xD,xD) to (xp,yp) above curve between xp and xD
import numpy as np
xx=np.linspace(xp,xD,5001); s=(xD-yp)/(xD-xp)
assert np.all(yeq(xx)-(yp+s*(xx-xp))>=-1e-12)
R=1.5*Rmin
# intersection of operating lines: rect y=R/(R+1)x+xD/(R+1) with q-line
xi=brentq(lambda x:R/(R+1)*x+xD/(R+1)-qline(x),0,1); yi=qline(xi)
ss=(yi-xB)/(xi-xB)
rect=lambda x:R/(R+1)*x+xD/(R+1)
strip=lambda x:xB+ss*(x-xB)
x=xeq(xD); xs=[x]; feed=None; n=1
while x>xB:
    if x>xi: y=rect(x)
    else:
        if feed is None: feed=n   # stage n is first with x<xi
        y=strip(x)
    x=xeq(y); n+=1; xs.append(x)
# n = stage where x_n<=xB
frac=(xs[-2]-xB)/(xs[-2]-xs[-1])
N=n-1+frac
print(json.dumps({"a":D,"b":Rmin,"c":R,"d":N,"e":feed,"B":B,"x_int":xi,"y_int":yi,"x_pinch":xp,"y_pinch":yp,"whole_stages":n,"xs":xs}))
