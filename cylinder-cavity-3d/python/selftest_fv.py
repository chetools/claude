"""Self-test values of the 3D finite-volume solver (fv3d.py) for the JS / WGSL ports.

reference() runs small cases with the numpy reference and returns a JSON-able dict

    {"cases": [{"name", "inp", "params", "steps",
                "outputs": {"torque", "E", "samples": [[c, k, j, i, value], ...], "checksum"}}]}

The JS side (CC3.fv.selftest) builds the same case from `inp`, advances `steps` steps and compares.
  torque    z-torque of the fluid on the body per unit span          (fv3d.torque)
  E         (1/Lz) integral of 1/2 |u|^2 dV                           (fv3d.stats)
  samples   cell-centred velocity values U[c, k, j, i] (physical units), 20 fixed positions
  checksum  sum of U**2 over the whole cell-centred velocity array
`params` (fv3d.make_params) is extra: it lets the JS side check makeParams number by number.

Usage:  python selftest_fv.py [out.json]      (runs in a few seconds)
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fv3d                                    # noqa: E402

BASE = dict(N=16, Re=100.0, R=0.1, ro=0.2, Us=1.0, Uo=0.5, seed=1e-3)
CASES = [
    ("periodic Nz=4 spin+orbit", dict(BASE, Nz=4, span="periodic"), 40),
    ("walls Nz=4 spin+orbit",    dict(BASE, Nz=4, span="walls"), 40),
    ("periodic Nz=1 spin+orbit", dict(BASE, Nz=1, span="periodic"), 40),
    ("walls Nz=8 spin+orbit",    dict(BASE, Nz=8, span="walls"), 30),
    ("tanh mask Nz=4 periodic",  dict(BASE, Nz=4, span="periodic", mask="tanh"), 30),
    ("walls Nz=2 spin only",     dict(BASE, Nz=2, span="walls", Uo=0.0, Us=-1.0, seed=2e-3), 30),
    ("periodic Nz=8 orbit only", dict(BASE, Nz=8, span="periodic", Us=0.0, Uo=0.8, Re=200.0), 30),
]


def sample_positions(Nz, N, count=20):
    """Fixed, spread-out (c, k, j, i) positions (also used by the JS side through the stored list)."""
    return [(n % 3, (7 * n + 1) % Nz, (5 * n + 3) % N, (11 * n + 2) % N) for n in range(count)]


def run_case(inp, steps):
    p = fv3d.make_params(**inp)
    s = fv3d.init_state(p)
    for _ in range(steps):
        fv3d.step(s, p)
    U = fv3d.cell_velocity(s, p)
    st = fv3d.stats(s, p)
    samples = [[c, k, j, i, float(U[c, k, j, i])] for c, k, j, i in sample_positions(p["Nz"], p["N"])]
    out = dict(torque=float(fv3d.torque(s, p)), E=float(st["E"]), samples=samples,
               checksum=float(np.sum(U ** 2)))
    params = {k: (float(v) if isinstance(v, (float, np.floating)) else v) for k, v in p.items()}
    return params, out


def reference():
    cases = []
    for name, inp, steps in CASES:
        params, out = run_case(inp, steps)
        cases.append(dict(name=name, inp=inp, params=params, steps=steps, outputs=out))
    return dict(cases=cases)


if __name__ == "__main__":
    ref = reference()
    text = json.dumps(ref, indent=1)
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w") as f:
            f.write(text)
        print("wrote", sys.argv[1])
    else:
        print(text)
