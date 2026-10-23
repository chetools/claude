import json, math
import numpy as np
from scipy.optimize import brentq
a=2.5; zF=.4; xD=.95; xB=.05
yeq=lambda x:a*x/(1+(a-1)*x)
xeq=lambda y:y/(a-(a-1)*y)
# total reflux stepping from top; stage 1 liquid x1 in eq with y1=xD
x=xeq(xD); n=1; xs=[x]
while x>xB:
    x=xeq(x); n+=1; xs.append(x)   # y_{n+1}=x_n at total reflux
frac=(xs[-2]-xB)/(xs[-2]-xs[-1])
Nstep=n-1+frac
Nfen=math.log((xD/(1-xD))*((1-xB)/xB))/math.log(a)
# pinch: smallest R such that line stays above curve on [zF,xD]
xx=np.linspace(zF,xD,20001)
def gap(R): return np.min(yeq(xx)-(R/(R+1)*xx+xD/(R+1)))
Rmin=brentq(gap,0.01,50,xtol=1e-14)
print(json.dumps({"a":Nfen,"a_stepping":Nstep,"b":Rmin,"b_analytic":(xD-yeq(zF))/(yeq(zF)-zF)}))
