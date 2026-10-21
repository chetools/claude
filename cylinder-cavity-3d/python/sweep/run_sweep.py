#!/usr/bin/env python
"""Run a list of 3D LBM cases in sequence with lbm_fast; resumable; one result file per case.

    python run_sweep.py cases.json                 run in the foreground
    python run_sweep.py cases.json --background    detach (nohup-style), log to results/sweep.out
    python run_sweep.py cases.json --list          show cases and whether they are done
    options: --out DIR (default ./results)  --threads N  --volume (save the full final velocity)
             --retry-failed (re-run cases that ended "diverged"/"timeout")

cases.json is either a list of cases or {"defaults": {...}, "cases": [{...}, ...]}.  A case holds
  N, Nz, Re, Us, Uo, ro, span ("periodic"|"walls"), seed, t_end           (t_end required)
and optionally R, u_lb, collision ("reg" default | "bgk" | "mrt"), mass_fix, every_t (series spacing,
default 0.05 time units), n_snap (snapshots, default 4), volume (bool), max_wall (seconds), name.
Unknown keys are an error (so typos fail loudly).

Per case, in DIR:  <name>.json  (params, series, timing, status)   written last = "done" marker
                   <name>.npz   snapshots (wz_xy, w_xz, t_snap)
                   <name>_u.npy full final velocity float32, only if volume is requested
Progress: DIR/progress.log (one line per case start / every ~30 s / end).
"""
import argparse
import json
import os
import subprocess
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

PARAM_KEYS = {"N", "Nz", "Re", "Us", "Uo", "ro", "span", "seed", "R", "u_lb", "collision"}
RUN_KEYS = {"t_end", "every_t", "n_snap", "volume", "max_wall", "name", "mass_fix"}


def case_name(c):
    if c.get("name"):
        return c["name"]
    g = lambda k, d: c.get(k, d)                                    # noqa: E731
    n = (f"N{g('N', 64)}_Nz{g('Nz', 1)}_Re{g('Re', 200):g}_Us{g('Us', 1.0):g}_Uo{g('Uo', 0.0):g}"
         f"_ro{g('ro', 0.2):g}_{g('span', 'periodic')}_seed{g('seed', 1e-3):g}")
    if g("collision", "reg") != "reg":
        n += "_" + c["collision"]
    return n


def load_cases(path):
    cfg = json.load(open(path))
    if isinstance(cfg, list):
        cfg = {"cases": cfg}
    base = cfg.get("defaults", {})
    cases = []
    for c in cfg["cases"]:
        d = {**base, **c}
        bad = set(d) - PARAM_KEYS - RUN_KEYS
        if bad:
            raise SystemExit(f"unknown key(s) {sorted(bad)} in case {c}")
        if "t_end" not in d:
            raise SystemExit(f"case without t_end: {c}")
        cases.append(d)
    names = [case_name(c) for c in cases]
    if len(set(names)) != len(names):
        raise SystemExit("duplicate case names; give the cases distinct parameters or a 'name'")
    return cases, names


def is_done(out, name, retry_failed):
    fn = os.path.join(out, name + ".json")
    if not os.path.exists(fn):
        return False
    try:
        st = json.load(open(fn))["status"]
    except Exception:                                               # unreadable: run again
        return False
    return st == "finished" or (st != "finished" and not retry_failed)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config")
    ap.add_argument("--out", default=os.path.join(HERE, "results"))
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--volume", action="store_true")
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--background", action="store_true")
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    cases, names = load_cases(a.config)
    if a.list:
        for c, n in zip(cases, names):
            print(("done    " if is_done(out, n, a.retry_failed) else "pending ") + n)
        return
    if a.background:
        args = [x for x in sys.argv[1:] if x != "--background"]
        logf = open(os.path.join(out, "sweep.out"), "a")
        pr = subprocess.Popen([sys.executable, os.path.abspath(__file__)] + args, stdout=logf,
                              stderr=logf, stdin=subprocess.DEVNULL, start_new_session=True)
        print(f"started pid {pr.pid}; progress: {out}/progress.log, stdout/stderr: {out}/sweep.out")
        return

    import numba
    if a.threads:
        numba.set_num_threads(a.threads)
    import lbm3d
    import lbm_fast

    logfile = open(os.path.join(out, "progress.log"), "a")

    def log(msg):
        line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
        print(line, flush=True)
        logfile.write(line + "\n")
        logfile.flush()

    log(f"sweep start: {len(cases)} cases, {numba.get_num_threads()} threads, out={out}")
    for idx, (c, name) in enumerate(zip(cases, names), 1):
        if is_done(out, name, a.retry_failed):
            log(f"[{idx}/{len(cases)}] skip {name} (done)")
            continue
        pk = {k: v for k, v in c.items() if k in PARAM_KEYS}
        try:
            p = lbm3d.make_params(**pk)
            if "mass_fix" in c:
                p["mass_fix"] = bool(c["mass_fix"])
            last = [time.time()]

            def progress(row, info, name=name, idx=idx):
                if time.time() - last[0] > 30:
                    last[0] = time.time()
                    log(f"[{idx}/{len(cases)}] {name} t={row['t']:.3f}/{c['t_end']} "
                        f"step {info['step']}/{info['nsteps']} wall {info['wall']:.0f}s "
                        f"E={row['E']:.4g} Ew={row['Ew']:.3g}")

            log(f"[{idx}/{len(cases)}] start {name}: dt={p['dt']:.3e} nsteps~{c['t_end'] / p['dt']:.0f}")
            _, res = lbm_fast.run_fast(p, c["t_end"], c.get("every_t", 0.05), os.path.join(out, name),
                                       n_snap=c.get("n_snap", 4),
                                       save_volume=bool(c.get("volume", a.volume)),
                                       progress=progress, max_wall=c.get("max_wall"))
            tm = res["timing"]
            log(f"[{idx}/{len(cases)}] {res['status']} {name}: t={res['t_final']:.3f} wall {tm['wall_s']:.0f}s "
                f"({tm['wall_per_time_unit']:.1f} s per time unit, {tm['mlups']:.1f} MLUPS, "
                f"diagnostics {tm['diag_s']:.1f}s)")
        except Exception:
            log(f"[{idx}/{len(cases)}] ERROR in {name}:\n" + traceback.format_exc())
    log("sweep end")


if __name__ == "__main__":
    main()
