"""Summarise sweep results: growth rate of E3d (fit of ln E3d = 2 sigma t in the window 1e-7..1e-3 of E3d/E, t >= 1),
saturated E3d/E (mean over the last quarter), dominant spanwise mode, torque mean over the last half."""
import glob
import json
import os
import sys

import numpy as np

d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
print(f"{'case':12s} {'Re':>6s} {'span':8s} {'Us':>4s} {'Uo':>4s} {'t_end':>5s}  {'sigma':>7s} {'window':>11s} "
      f"{'E3d/E sat':>9s} {'Ew/E sat':>9s} {'kz*':>3s} {'torque':>9s}")
for f in sorted(glob.glob(os.path.join(d, "*.json"))):
    r = json.load(open(f))
    if "series" not in r:
        continue
    c, s = r["params"] if "params" in r else r["case"], r["series"]
    t, E, E3, Ew = (np.array(s[k], float) for k in ("t", "E", "E3d", "Ew"))
    ratio = E3 / E
    m = (ratio > 1e-7) & (ratio < 1e-3) & (t >= 1.0)
    sig, win = (np.polyfit(t[m], np.log(E3[m]), 1)[0] / 2, f"{t[m].min():.1f}-{t[m].max():.1f}") if m.sum() > 4 \
        else (float("nan"), "-")
    q = t >= 0.75 * t[-1]
    ek = s.get("Ekz")
    kz = int(np.argmax(np.mean(np.array(ek, float)[q][:, 1:], axis=0)) + 1) if ek and ek[0] is not None else 0
    tq = np.array(s["torque"], float)
    name = os.path.basename(f)[:-5]
    print(f"{name:12s} {c.get('Re'):6.0f} {c.get('span'):8s} {c.get('Us'):4.1f} {c.get('Uo'):4.1f} {t[-1]:5.1f}  "
          f"{sig:7.3f} {win:>11s} {np.mean(ratio[q]):9.3e} {np.mean((Ew/E)[q]):9.3e} {kz:3d} "
          f"{np.mean(tq[t >= t[-1] / 2]):9.5f}  {r.get('status')}")
