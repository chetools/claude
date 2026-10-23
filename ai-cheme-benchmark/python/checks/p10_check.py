import json, math
from scipy.optimize import brentq
G=100; y1=.02; rec=.95; m=1.8
y2=y1*(1-rec)
# (a) pinch mass balance: exit liquid in equilibrium with inlet gas
x1=y1/m; Lmin=G*(y1-y2)/x1
L=1.5*Lmin; A=L/(m*G)
N=math.log((1-1/A)*(y1/y2)+1/A)/math.log(A)
# stage stepping from the bottom? step from top: y at top =y2, x_in=0
# top stage: x1=y_1/m ... operating line: G(y_{n+1}-y2)=L(x_n-0)
y=y2; n=0
while y<y1:
    x=y/m; y=y2+L/G*x; n+=1   # stage n: liquid x_n in eq with y_n; vapour entering y_{n+1}
ylast_prev=y2+0  # fractional: via log interpolation of y-ratio
ys=[y2]; 
yy=y2
while yy<y1:
    yy=y2+(L/G)*(yy/m); ys.append(yy)
k=len(ys)-1
frac=math.log(y1/ys[-2]) / math.log(ys[-1]/ys[-2]) if False else (y1-ys[-2])/(ys[-1]-ys[-2])
# geometric ys => linear-in-log is exact; use that
frac=math.log(y1/ys[-2])/math.log(ys[-1]/ys[-2])
print(json.dumps({"a":Lmin,"b":A,"c":N,"c_stepping":k-1+frac,"c_whole_stages_int":k}))
