import json, math
rho,mu,Q,D,L=880.,0.12,1.5e-3,0.04,25.
A=math.pi*D**2/4; u=Q/A
Re=rho*u*D/mu
dP_hp=32*mu*u*L/D**2          # Hagen-Poiseuille
f=64/Re
dP_dw=f*L/D*rho*u**2/2        # Darcy-Weisbach
assert abs(dP_hp-dP_dw)/dP_hp<1e-12
print(json.dumps({"a":Re,"b":f,"c":dP_hp/1e3,"laminar":Re<2100}))
