"""Compare a 3D run with its Nz=1 baseline (same inputs): E, Z, torque — time averages over the last half
of the run, and the first time t >= 0.5 where the two differ by more than 5 % (5-sample running mean;
earlier times are skipped because both energies start from zero, where relative differences are meaningless)."""
import json
import os
import sys

import numpy as np

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results_final")
for name in sys.argv[1:]:
    a = json.load(open(os.path.join(d, name + ".json")))["series"]
    b = json.load(open(os.path.join(d, name + "_2d.json")))["series"]
    t = np.array(a["t"])
    tb = np.array(b["t"])
    print(f"== {name}  (3D vs 2D baseline)")
    for k in ("E", "Z", "torque"):
        x = np.array(a[k], float)
        y = np.interp(t, tb, np.array(b[k], float))
        late = t >= t[-1] / 2
        rel = np.abs(x - y) / np.maximum(np.abs(y), 1e-300)
        sm = np.convolve(rel, np.ones(5) / 5, mode="same")
        bad = (sm > 0.05) & (t >= 0.5)
        first = round(float(t[np.argmax(bad)]), 2) if np.any(bad) else None
        print(f"  {k:7s} 3D mean {x[late].mean():+.5g}  2D mean {y[late].mean():+.5g}  "
              f"ratio {x[late].mean() / y[late].mean():.3f}   first >5% apart at t = {first}")
