"""FV spin-up profile versus the exact azimuthal solution, vs time (N=64, Re=100, centred spin)."""
import sys; sys.path.insert(0,'.')
from vcommon import *
import annulus as A
from ref2d import ns2d
R,Om,nu=0.1,10.0,0.002
N=int(sys.argv[1]) if len(sys.argv)>1 else 64
tg=[0.05,0.2,1.0,3.0]
sol=A.solve(R,Om,nu,0.5,tg,n=2000)
p=fv3d.make_params(N=N,Nz=1,Re=100.0,ro=0.0,Us=1.0,Uo=0.0,seed=0.0)
s=fv3d.init_state(p)
rr=np.array([0.09,0.11,0.13,0.15,0.18,0.22,0.3])
k=0
while k<len(tg):
    fv3d.step(s,p)
    if s['t']>=tg[k]:
        U=fv3d.cell_velocity(s,p); x,v=centre_line_v(U,p)
        r,u,T=sol[tg[k]]
        m=x>0.5
        print(f"t={s['t']:.3f} T_fv={fv3d.torque(s,p):.5f} T_exact={T:.5f}")
        print("   r     :",rr)
        print("   v_fv  :",np.round(np.interp(rr,x[m]-0.5,v[m]),3))
        print("   exact :",np.round(np.interp(rr,r,u),3))
        k+=1
