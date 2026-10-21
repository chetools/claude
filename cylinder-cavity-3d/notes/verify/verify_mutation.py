"""Check 1: are the authors' tolerances able to catch bugs?  Mutation testing: copy a solver's source
text into memory, apply ONE small plausible bug, load it as a module, patch it into the authors' test
module and run the relevant authors' tests.  'CAUGHT' = some test fails; 'MISSED' = all pass.
Also prints the size of the change in the quantity the test checks (torque).  Authors' files are not modified."""
import sys, types, io, contextlib, traceback, os, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vcommon import PY
sys.path.insert(0, PY)

def load(fname, subs):
    src = open(os.path.join(PY, fname)).read()
    for old, new in subs:
        assert src.count(old) == 1, (old, src.count(old))
        src = src.replace(old, new)
    m = types.ModuleType(fname[:-3] + "_mut")
    m.__file__ = os.path.join(PY, fname)
    exec(compile(src, fname + "_mut", "exec"), m.__dict__)
    return m

def attempt(fn, *a):
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            fn(*a)
        return "pass"
    except AssertionError as e:
        return "FAIL"
    except Exception as e:
        return "ERR " + type(e).__name__

LBM_MUT = {
 "g moving-wall term x2": [("g = -6.0 * W[q] * (cx * ub + cy * vb)", "g = -12.0 * W[q] * (cx * ub + cy * vb)")],
 "g moving-wall term missing on s>=1/2 branch": [("(fq + (2 * Sg - 1) * fqb + g) / (2 * Sg))", "(fq + (2 * Sg - 1) * fqb) / (2 * Sg) + g)")],
 "g not divided by 2s (s>=1/2) [g instead of g/2s]": [("(fq + (2 * Sg - 1) * fqb + g) / (2 * Sg))", "(fq + (2 * Sg - 1) * fqb) / (2 * Sg) + g)")],
 "wall velocity taken at fluid node, not at cut point": [("ub, vb = body[\"velocity\"](xw, yw)", "ub, vb = body[\"velocity\"](I + 0.5, J + 0.5)")],
 "torque arm taken at fluid node, not at cut point": [("F[2] += ((xw - body[\"cx\"]) * Py - (yw - body[\"cy\"]) * Px).sum()", "F[2] += ((I + 0.5 - body[\"cx\"]) * Py - (J + 0.5 - body[\"cy\"]) * Px).sum()")],
 "no moving-boundary correction in momentum exchange": [("Px = (cx - ub) * fq + (cx + ub) * new", "Px = cx * fq + cx * new"), ("Py = (cy - vb) * fq + (cy + vb) * new", "Py = cy * fq + cy * new")],
 "torque sign flipped": [("return s[\"exchange\"][2] * (p[\"h\"] ** 4 / p[\"dt\"] ** 2) / p[\"Nz\"]", "return -s[\"exchange\"][2] * (p[\"h\"] ** 4 / p[\"dt\"] ** 2) / p[\"Nz\"]")],
 "torque unit: /Nz dropped": [("return s[\"exchange\"][2] * (p[\"h\"] ** 4 / p[\"dt\"] ** 2) / p[\"Nz\"]", "return s[\"exchange\"][2] * (p[\"h\"] ** 4 / p[\"dt\"] ** 2)")],
 "Bouzidi s<1/2 weights swapped (2s <-> 1-2s)": [("2 * S * fq + (1 - 2 * S) * f2 + g", "(1 - 2 * S) * fq + 2 * S * f2 + g")],
 "viscosity 5% too high (tau=3.15 nu+.5)": [("tau = 3.0 * nu_lb + 0.5", "tau = 3.15 * nu_lb + 0.5")],
}
FV_MUT = {
 "torque x1.1 (10%)": [("    return -tq\n\n\ndef stats", "    return -1.1 * tq\n\n\ndef stats")],
 "penalisation mask radius 10% larger": [("chi = 0.5 * (1 - np.tanh((np.hypot(dx, dy) - p[\"R\"]) / p[\"eps\"]))", "chi = 0.5 * (1 - np.tanh((np.hypot(dx, dy) - 1.1 * p[\"R\"]) / p[\"eps\"]))")],
 "mask width 2h instead of h": [("eps=width * h", "eps=2 * width * h")],
 "viscous z-term x2 (3D only)": [("(S(1, 0, 0) + S(-1, 0, 0) - 2 * Fc)", "2 * (S(1, 0, 0) + S(-1, 0, 0) - 2 * Fc)")],
 "z advection flux of top face uses wrong sign of upwind": [("ft = wt * face_value(S(-1, 0, 0), Fc, S(1, 0, 0), S(2, 0, 0), wt)", "ft = wt * face_value(S(-1, 0, 0), Fc, S(1, 0, 0), S(2, 0, 0), -wt)")],
 "z-wall ghost for u free-slip instead of no-slip": [("zkind = \"wrap\" if span == \"periodic\" else \"cell\"\n    return pad_axis(pad_axis(pad_axis(u, 2, \"face\"), 1, \"cell\"), 0, zkind)", "zkind = \"wrap\" if span == \"periodic\" else \"sym\"\n    return pad_axis(pad_axis(pad_axis(u, 2, \"face\"), 1, \"cell\"), 0, zkind)")],
 "AB2 coefficient wrong (1+r/2 -> 1+r)": [("a, b = 1 + 0.5 * r, -0.5 * r", "a, b = 1 + r, -r")],
}

if __name__ == "__main__":
    which = sys.argv[1]
    import test_lbm3d as TL, test_fv3d as TF
    if which == "lbm":
        for name, subs in LBM_MUT.items():
            t0 = time.time()
            m = load("lbm3d.py", subs)
            TL.L = m
            res = {
                "annulus N=32 reg (6%)": attempt(TL.test_annular_couette_torque, "reg"),
                "moving-wall cuts R=.0917 N=64 (3%)": attempt(TL.test_annular_couette_moving_wall_term_various_cuts, 0.0917),
                "co-moving force-free": attempt(TL.test_uniform_co_moving_flow_is_preserved_and_force_free, "periodic"),
                "TG reg": attempt(TL.test_taylor_green_decay_and_convergence, "reg"),
            }
            T, ex = TL.annulus_torque(32, 1000, 300, "reg")
            caught = any(v != "pass" for v in res.values())
            print(f"{'CAUGHT' if caught else 'MISSED'} | {name} | torque change vs exact at N=32: {100*(T/ex-1):+.1f}% | {res} | {time.time()-t0:.0f}s", flush=True)
    else:
        for name, subs in FV_MUT.items():
            t0 = time.time()
            m = load("fv3d.py", subs)
            TF.fv3d = m
            res = {
                "nz1==ns2d": attempt(TF.test_nz1_periodic_matches_ns2d),
                "uniform default": attempt(TF.test_uniform_span_stays_uniform_default_settings),
                "exact w diffusion": attempt(TF.test_exact_spanwise_diffusion_second_order),
                "swap y-z": attempt(TF.test_swap_y_z_symmetry_walls),
                "ekman walls": attempt(TF.test_walls_centred_spin_ekman_pumping),
            }
            caught = any(v != "pass" for v in res.values())
            print(f"{'CAUGHT' if caught else 'MISSED'} | {name} | {res} | {time.time()-t0:.0f}s", flush=True)
