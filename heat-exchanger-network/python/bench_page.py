"""The Benchmarks tab: tables built from our computed results only
(benchmarks/sa_results.json, benchmarks/furman_results.json and
benchmarks/gpu_measurement.json), with the published values of benchmarks.py.
Fails if a result file is missing, so the page never shows stale blanks."""
import html
import json
import os

import benchmarks as B
import hen

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.join(HERE, "..", "benchmarks")


def _need(name):
    path = os.path.join(BENCH, name)
    if not os.path.exists(path):
        raise RuntimeError(f"missing {path}: run the benchmark scripts first (see benchmarks.py)")
    return json.load(open(path))


def money(x):
    return f"{x:,.0f}"


def html_and_nets(md):
    rows = B.sa_table()
    if not rows:
        raise RuntimeError("benchmarks/sa_results.json is missing or empty")
    furman = _need("furman_results.json")
    nets = []
    e = html.escape
    out = [md(r"""
### Our results against the literature

**What was run.** The Rust optimizer of this page (simulated annealing over the stage-wise superstructure with isothermal
mixing, utilities at the stream ends, $K = \max(N_H, N_C)$ stages), natively on a 4-core build machine: 4 chains, 4 epochs
(every epoch after the first restarts all chains from the best network), the number of moves per chain per epoch given in
the table. Every network was then **re-evaluated by the Python reference** (`hen.evaluate`); the column "Python check" is the
relative difference of the two TACs. Published values are quoted from the cited tables (TAC only; some of those tables have
utility loads that do not close the energy balance, so we do not quote them). "Show" opens our network in the grid diagram,
where the page re-optimises its loads in your browser.
""")]
    t = ['<div class="tablewrap"><table class="data"><tr><th>Problem</th><th>EMAT [K]</th><th>our TAC [$/yr]</th>'
         '<th>Python check</th><th>units</th><th>Q<sub>H</sub> / Q<sub>C</sub> [kW]</th><th>best published [$/yr]</th>'
         '<th>ours vs best</th><th>published range (n)</th><th>run</th><th></th></tr>']
    for r in rows:
        if r["variant"]:
            continue
        d = (r["tac_py"] - r["best_pub"][1]) / r["best_pub"][1]
        chk = abs(r["tac_py"] - r["tac_rust"]) / r["tac_rust"]
        stated = "" if r["base"] in B.EMAT_STATED else "*"
        k = len(nets)
        nets.append(dict(problem=r["base"], net=r["net"], stages=r["stages"], tac=r["tac_py"]))
        t.append(f'<tr><td class="l">{e(r["problem"])}<div class="m-sub">{e(r["law"])}</div></td><td>{r["emat"]:g}{stated}</td>'
                 f'<td><b>{money(r["tac_py"])}</b></td><td>{chk:.0e}</td><td>{r["units"]}</td>'
                 f'<td>{r["QH"]:,.0f} / {r["QC"]:,.0f}</td><td>{money(r["best_pub"][1])}<div class="m-sub">{e(r["best_pub"][0])}</div></td>'
                 f'<td class="{"pass" if d <= 0 else ""}">{100 * d:+.2f} %</td>'
                 f'<td>{money(r["best_pub"][1])} &ndash; {money(r["worst_pub"][1])} ({r["n_pub"]})</td>'
                 f'<td>{r["chains"]}&times;{r["epochs"]}&times;{r["iters"]}<div class="m-sub">{r["seconds"]:.0f} s</div></td>'
                 f'<td><button class="btn small" data-bench="{k}">Show</button></td></tr>')
    t.append('</table></div><p class="caption">* EMAT not stated in the cited table; 1 K used. Data and cost sources: ' +
             "; ".join(sorted({f'{e(r["base"])}: {e(r["source"])}' for r in rows if not r["variant"]})) + ".</p>")
    out.append("".join(t))

    # published network re-evaluated
    law = hen.power_law(4000, 500, 0.83)
    U = [dict(q=1864.1, Th_in=270, Th_out=166.44, Tc_in=160, Tc_out=215.38, h_hot=.5, h_cold=.5),
         dict(q=635.9, Th_in=220, Th_out=191.09, Tc_in=160, Tc_out=198.91, h_hot=.5, h_cold=.5),
         dict(q=2455.7, Th_in=191.09, Th_out=79.47, Tc_in=50, Tc_out=179.64, h_hot=.5, h_cold=.5),
         dict(q=115.9, Th_in=166.44, Th_out=160, Tc_in=50, Tc_out=159.61, h_hot=.5, h_cold=.5),
         dict(q=428.4, Th_in=79.47, Th_out=60, Tc_in=15, Tc_out=20, h_hot=.5, h_cold=1.0, op=20),
         dict(q=628.4, Th_in=250, Th_out=250, Tc_in=178.58, Tc_out=210, h_hot=1.0, h_cold=.5, op=200)]
    pub = hen.units_tac(U, law)
    r_ahmad = next(r for r in rows if r["problem"] == "H2C2 (Ahmad 1985)")
    h5 = {r["problem"]: r for r in rows if r["base"] == "H5C1 (Yee & Grossmann)"}
    p5 = hen.benchmark("H5C1 (Yee & Grossmann)")
    qmin = {}
    for em in (10, 5, 1):
        p5["emat"] = em
        qmin[em] = hen.problem_table(p5)["QH"]
    p5["emat"] = 10
    pubq = B.H5C1_PUBLISHED_QH_AREA
    below = [v for v in pubq if v[1] < qmin[10] - 1e-6]
    areas = [v[2] for v in pubq if v[2] is not None]
    qmax = max(v[1] for v in pubq)
    at = {q: B.area_target(p5, q)[0] for q in (3530, qmin[10], qmax)}
    ah = r_ahmad
    ah_split = ("it splits " + ", ".join(ah["splits"])) if ah["splits"] else "it has no stream splits"
    big = [r for r in rows if not r["variant"] and r["base"] in ("H4C5 aromatics (Linnhoff & Ahmad)", "H6C4 (Ahmad 1985)",
                                                                  "H8C7 (Bjork & Pettersson)", "H10C10 (Luo et al.)",
                                                                  "H22C17 (Bjork & Pettersson)")]
    inside = [r for r in big if r["best_pub"][1] <= r["tac_py"] <= r["worst_pub"][1]]
    above_best = [r for r in big if r["tac_py"] > r["best_pub"][1]]
    big_txt = (f"{len(inside)} of these {len(big)} lie inside the published range and {len(above_best)} above the best published value, "
               f"by the percentages in the table.")
    out.append(md(rf"""
#### Notes, problem by problem

**H2C2 (Escobar & Trierweiler).** Our TAC, {money(next(r for r in rows if r["problem"] == "H2C2 (Escobar & Trierweiler)")["tac_py"])} \$/yr,
matches the value Chang et al. (2020a, b) report, 360,037 \$/yr (5 units); their papers are titled *Globally optimal
synthesis of heat exchanger networks*, i.e. it is reported as the global optimum of the stage-wise model. Caballero et al.'s
lower 352,479 \$/yr network splits C2 with non-isothermal mixing (branch outlets 215.38 and 198.91 °C), which our model
does not allow. Re-evaluating their network from the loads and temperatures printed in their Figure S2 gives
**{money(pub["tac"])} \$/yr and {pub["area"]:.2f} m²** (printed: 352,479 \$/yr and 1017.0 m²; loads are printed to 0.1 kW),
which confirms the cost law and conventions (exact LMTD, utility exchangers costed with the same law).

**H2C2 (Ahmad 1985).** Our network costs less than every published value we found. It was re-checked from its terminal
temperatures: energy balances close, the smallest approach is {ah["dTmin"]:.2f} K against EMAT 1 K, and {ah_split}. We have
not reproduced the published networks, so we cannot say why they cost more. Huber et al. state that their model is a
piecewise-linear MILP, and that the networks of Ahmad, Nielsen et al. and Khorasany & Fesanghary have no stream splits.

**H5C1 (Yee & Grossmann).** Not reproduced with the data as tabulated. Two computed facts show that most published solutions
cannot use these data:
- At the tabulated EMAT of 10 K the problem table gives $Q_{{H,\min}}$ = {qmin[10]:,.0f} kW, yet {len(below)} of the {len(pubq)}
  solutions in Caballero et al.'s Table S10 use {min(v[1] for v in below):,.0f}–{max(v[1] for v in below):,.0f} kW of hot utility.
  Yee & Grossmann's 3,530 kW equals $Q_{{H,\min}}$ at EMAT 5 K ({qmin[5]:,.0f} kW).
- With every film coefficient 0.5 kW/(m²K) (U = 0.25), the vertical-heat-transfer area target (the smallest total area any
  counter-current network can have when all coefficients are equal) is {at[3530]:,.0f} m² at 3,530 kW, {at[qmin[10]]:,.0f} m² at
  {qmin[10]:,.0f} kW and still {at[qmax]:,.0f} m² at {qmax:,.0f} kW, the largest published hot-utility load. The total areas
  given in the same table are {min(areas):,.0f}–{max(areas):,.0f} m².

The published numbers fit U ≈ 1 kW/(m²K), i.e. h = 2: with that, our optimizer gives
{money(h5["H5C1 (Yee & Grossmann) @U=1, EMAT 1"]["tac_py"])} \$/yr at EMAT 1 K and
{money(h5["H5C1 (Yee & Grossmann) @U=1"]["tac_py"])} \$/yr at EMAT 10 K, against Yee & Grossmann's 575,595 \$/yr and the best
published 570,362 \$/yr. This is our inference from the numbers above; we have not seen the original paper's data. With the
data as tabulated our result is {money(h5["H5C1 (Yee & Grossmann)"]["tac_py"])} \$/yr (EMAT 10 K) and
{money(h5["H5C1 (Yee & Grossmann) @EMAT 5"]["tac_py"])} \$/yr (EMAT 5 K).

**Larger problems (H4C5, H6C4, H8C7, H10C10, H22C17).** {big_txt} Likely reasons, not verified: several of the best published
results use richer superstructures than ours, as their titles say (Huang et al. 2012, *stagewise superstructure with
non-isothermal mixing*; Pavão et al. 2018a, *substages, sub-splits and cross flows*; Pavão et al. 2018b, *new options for heaters
and coolers placement*), and our searches are short (see the run column) compared with dedicated studies.
"""))

    # Furman-Sahinidis LP + MILP
    t = [md(r"""
#### LP targets and minimum matches: the Furman–Sahinidis test set

The 26 instances digitised by Letsios, Kouyialis & Misener (2018; data and results in their public repository, Apache-2.0)
from Furman & Sahinidis (2004). Ours: the transshipment LP and MILP of steps 1–2 with scipy's HiGHS, 60 s time limit per MILP.
Theirs: the utility cost of their transshipment LP and the minimum number of matches found by CPLEX and Gurobi (transshipment
model, 30 min limit; a gap means not proven optimal).
"""), '<div class="tablewrap"><table class="data"><tr><th>instance</th><th>streams (H/C)</th><th>our LP cost</th><th>published LP cost</th>'
          '<th>our matches</th><th>published matches</th><th></th></tr>']
    n_same = n_cnt = 0
    for f in furman:
        if not f["lp_ok"]:
            t.append(f'<tr><td>{f["name"]}</td><td>{f["n_hot"]}/{f["n_cold"]}</td><td>infeasible</td><td>{f["pub_cost"]:.6g}</td>'
                     f'<td>&ndash;</td><td>{f["pub_n"]}</td><td class="fail">see note</td></tr>')
            continue
        same_cost = abs(f["cost"] - f["pub_cost"]) <= 1e-9 * max(1.0, abs(f["pub_cost"]))
        same_n = f["n"] == f["pub_n"]
        n_same += same_cost
        n_cnt += same_n
        mark = "pass" if same_cost and same_n else "fail"
        t.append(f'<tr><td>{f["name"]}</td><td>{f["n_hot"]}/{f["n_cold"]}</td><td>{f["cost"]:.6g}</td><td>{f["pub_cost"]:.6g}</td>'
                 f'<td>{f["n"]}{"" if f["optimal"] else " (time limit)"}</td><td>{f["pub_n"]}{" (gap " + f["pub_gap"] + ")" if f["pub_gap"] else ""}</td>'
                 f'<td class="{mark}">{"same" if mark == "pass" else "differs"}</td></tr>')
    t.append("</table></div>")
    bad = [f for f in furman if not f["lp_ok"]]
    diff = [f for f in furman if f["lp_ok"] and f["n"] != f["pub_n"]]
    note = (f"LP utility cost identical (to 1e-9) in {n_same} of {len(furman) - len(bad)} feasible instances; same number of "
            f"matches in {n_cnt}. ")
    if bad:
        note += ("22sp-ph: our LP is infeasible: hot stream HS9 must be cooled to 8 °C while the only cold utility is at 20–21 °C "
                 "(ΔTmin 10 K). The published preprocessing places interval boundaries only at inlet temperatures, so heat below "
                 "the lowest boundary (30 °C) is dropped (lib/problem_classes/transportation_model.py). ")
    for f in diff:
        note += (f"{f['name']}: HiGHS found {f['n']} matches within the time limit"
                 f"{' and did not prove optimality' if not f['optimal'] else ''}; CPLEX and Gurobi found {f['pub_n']}. ")
        if f["name"] == "37sp-yfyv":
            note += "A separate run with a 600 s limit also stopped at 37 matches. "
    t.append(f'<p class="caption">{e(note)}</p>')
    out.append("".join(t))
    return "\n".join(out), nets


def gpu_note(allow_missing=False):
    path = os.path.join(BENCH, "gpu_measurement.json")
    if not os.path.exists(path):
        if allow_missing:
            return '<p class="caption">(build measurement pending)</p>'
        raise RuntimeError(f"missing {path}: run tests/gpu_measure.js on a first-pass build")
    g = json.load(open(path))
    return (f'<p class="caption"><b>Measured while building this page</b> ({html.escape(g["where"])}): {g["n"]:,} load vectors of a '
            f'{g["nm"]}-match network ({html.escape(g["problem"])}): WebGPU {g["gpu_ms"]:.1f} ms, CPU workers ({g["workers"]}) '
            f'{g["cpu_ms"]:.1f} ms, ratio {g["gpu_ms"] / g["cpu_ms"]:.2f}; same feasibility verdict for {g["agree"]:,} of {g["n"]:,}, '
            f'largest relative TAC difference {g["maxrel"]:.1e}. A software GPU says little about a real one: press Measure to '
            f'time yours. The annealing does not use the GPU.</p>')
