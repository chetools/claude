"""Reference values for the in-page self-test of the LBM solvers (JS float64 and WebGPU float32).

reference() runs a few small cases with the numpy reference lbm3d and returns a JSON-able dict
    {cases: [{inp, steps, outputs: {torque, E, mass, samples: [[c,k,j,i,value],...], checksum}}]}
that build.py embeds as window.REF.lbm and CC3.lbm.selftest(solverFactory, ref) compares against.

Cases: N = 16, Nz = 4 and 1, periodic and walls, spin + orbit (so the cylinder moves, uncovers nodes and
`refill` runs), seed > 0, every collision model at least once.  u_lb = 0.1 (not the page default 0.05)
so that the cylinder moves ~3 cells in 50 steps; the cases test equivalence of implementations, not accuracy.

Outputs (physical units, SPEC.md):
    torque    lbm3d.torque(s, p)                          after the last step
    E         diagnostics.energy(U, h, Lz)                = 0.5 sum |U|^2 h^3 / Lz over all cells
    mass      lbm3d.mass(s)                               lattice units, fluid nodes
    samples   20 velocity components U[c,k,j,i] at fixed positions
    checksum  sum_n |U_n| (1 + n/len(U))                  over the flattened (3,Nz,N,N) velocity

Run `python selftest_lbm.py` to print a summary (and check that refill was exercised).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lbm3d      # noqa: E402

COMMON = dict(N=16, Re=100.0, R=0.1, ro=0.2, Us=0.5, Uo=1.0, u_lb=0.1, seed=1e-3)
STEPS = 50
CASES = [
    dict(Nz=4, span="periodic", collision="reg"),
    dict(Nz=4, span="walls", collision="reg"),
    dict(Nz=1, span="periodic", collision="bgk"),
    dict(Nz=1, span="walls", collision="mrt"),
    dict(Nz=4, span="periodic", collision="mrt"),
    dict(Nz=4, span="walls", collision="bgk"),
]


def sample_positions(Nz, N, n=20):
    """Deterministic spread of (c, k, j, i); includes nodes near and inside the cylinder."""
    return [((t % 3), (t * 3) % Nz, (7 + t * 3) % N, (3 + t * 5) % N) for t in range(n)]


def run_case(extra, steps=STEPS):
    inp = dict(COMMON, **extra)
    p = lbm3d.make_params(**inp)
    s = lbm3d.init_state(p)
    refilled = 0
    for _ in range(steps):
        old = s["solid"].copy()
        lbm3d.step(s, p)
        refilled += int((old & ~s["solid"]).sum())
    U = lbm3d.cell_velocity(s, p)
    n = U.size
    flat = U.reshape(-1)
    out = dict(
        torque=float(lbm3d.torque(s, p)),
        E=float(0.5 * np.sum(U ** 2) * p["h"] ** 3 / p["Lz"]),
        mass=float(lbm3d.mass(s)),
        samples=[[c, k, j, i, float(U[c, k, j, i])] for c, k, j, i in sample_positions(p["Nz"], p["N"])],
        checksum=float(np.sum(np.abs(flat) * (1 + np.arange(n) / n))),
    )
    return dict(inp=inp, steps=steps, outputs=out), refilled


def reference():
    cases = []
    for extra in CASES:
        c, _ = run_case(extra)
        cases.append(c)
    return dict(cases=cases)


if __name__ == "__main__":
    ref = {"cases": []}
    for extra in CASES:
        c, nref = run_case(extra)
        ref["cases"].append(c)
        o = c["outputs"]
        print(f"{extra}: refilled nodes over {STEPS} steps = {nref}, torque={o['torque']:.6e}, E={o['E']:.6e}, "
              f"mass={o['mass']:.6f}")
        assert nref > 0, "refill not exercised"
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w") as fh:
            json.dump(ref, fh)
        print("wrote", sys.argv[1])
