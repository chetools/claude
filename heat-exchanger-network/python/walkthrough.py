"""Step-by-step breakdown of the Python reference implementation.

CELLS is a list of {"title", "md", "code"} dicts.  The page shows each cell's
explanation (Markdown + LaTeX), its code, and the output produced by running
it: at build time with CPython, or live in the browser (Pyodide) with the
sidebar inputs.  Cells share one namespace, like a notebook.

Inside the cells, figure(traces, **layout) records a Plotly figure (plain
dicts, so no plotting library is needed) and hen is the reference module.
"""

CELLS = [
dict(title="The problem: streams, utilities, costs", md=r"""
`USER_INPUTS` holds the sidebar settings in the live run (it is empty at build time, which gives the
default case). `problem_from_inputs` turns them into one dictionary with
- the hot and cold **streams**: supply and target temperature, heat-capacity flow rate $F$ [kW/K],
  film coefficient $h$ [kW/(m² K)] and the materials each fluid tolerates;
- the **utilities**, each with a price in \$/(kW yr);
- the **forbidden matches** and the **cost law** for exchangers.

The duty of a stream is $Q = F\,|T_\text{in}-T_\text{out}|$.
""", code=r'''
import hen

prob = hen.problem_from_inputs(USER_INPUTS)
print(prob["name"], "  EMAT =", prob["emat"], "K")
for s in prob["hot"] + prob["cold"]:
    Q = s["F"] * abs(s["Tin"] - s["Tout"])
    print(f"  {s['name']:32s} {s['Tin']:6.1f} -> {s['Tout']:6.1f} C   F = {s['F']:7.2f} kW/K   Q = {Q:8.1f} kW")
for u in prob["hu"] + prob["cu"]:
    print(f"  {u['name']:32s} {u['Tin']:6.1f} -> {u['Tout']:6.1f} C   price = {u['cost']:7.2f} $/(kW yr)")
'''),

dict(title="Bottom-up utility prices", md=r"""
For the illustrative cases the utility prices are not typed in; they are built from energy prices
(sidebar, with sources and dates on the page) by `utility_price`:
- **steam**: fuel per GJ of condensing heat $=\dfrac{h_g - h_\text{fw}}{h_g - h_f}\,\dfrac{1}{\eta_\text{boiler}}$
  (the boiler also heats the feed water from 105 °C), plus water treatment;
- **fired heater / hot oil**: fuel $/\,\eta_\text{furnace}$;
- **cooling water**: pump and fan electricity plus make-up water and chemicals;
- **refrigeration**: electricity $/\,\text{COP}$, with COP a fraction of the Carnot value.

One kW over a year of $H$ operating hours is $3600H/10^6$ GJ. A carbon price adds
$c_{\text{CO}_2}\times$ (emission factor) to the fuel and electricity prices.
""", code=r'''
pr = dict(hen.DEFAULT_PRICES, **USER_INPUTS.get("prices", {}))
print(f"{pr['hours']:.0f} h/yr -> 1 kW-yr = {pr['hours'] * 3600 / 1e6:.1f} GJ")
for kind, Tin, Tout in [("steam", 165, 165), ("steam", 250, 250), ("furnace", 320, 280),
                        ("cw", 25, 35), ("seawater", 20, 30), ("refrig", -20, -20)]:
    c, how = hen.utility_price(kind, Tin, Tout, pr)
    print(f"  {kind:9s} {Tin:5.0f} C  {c:8.2f} $/(kW yr)   ({how})")
'''),

dict(title="Exchanger cost and the material of construction", md=r"""
Both fluids touch the tubes, so the tube material must suit both; the shell only touches the
shell-side fluid. `material_pairs` lists the shell/tube pairs of Seider et al. that fit, and
`cheapest_pair` picks the cheapest one. An HF stream (Monel only) and seawater (titanium or brass)
share no tube material, so that pair cannot be matched at all.

With the Seider law the bare-module cost of one exchanger is
$$C_{BM} = C_B(A)\,\big(F_{BM} + F_L F_P F_M(A) - 1\big),\qquad F_M = a + (A/100\ \text{ft}^2)^b,$$
scaled by $\text{CEPCI}/567$ and annualised by the capital recovery factor.
""", code=r'''
law = prob["law"]
print("cost law:", law["kind"])
for fluids in [(["Monel"], hen.MATERIALS), (["Monel"], ["Ti", "brass"]), (["SS", "Monel"], hen.MATERIALS)]:
    pairs = hen.material_pairs(*fluids, hen.LAW_SEIDER)
    print(f"  {str(fluids[0]):20s} with {str(fluids[1])[:28]:30s} -> {pairs}")
A = [20, 50, 100, 200, 500, 1000]
traces = []
for pair in [("CS", "CS"), ("CS", "SS"), ("CS", "Monel"), ("CS", "Ti"), ("Ti", "Ti")]:
    kind, p = hen.law_params(hen.seider_law(), pair, 1.0)
    traces.append(dict(x=A, y=[hen.unit_cost(kind, p, a)[0] for a in A], name="/".join(pair), mode="lines+markers"))
figure(traces, title="Annualised exchanger cost (Seider, CEPCI placeholder 800)",
       xaxis=dict(title="area [m2]", type="log"), yaxis=dict(title="$/yr", type="log"))
'''),

dict(title="Which matches are allowed", md=r"""
`hen.Model` "compiles" the problem: for every hot/cold pair it decides whether the match is allowed
(not forbidden, a common material exists, and the hot inlet is hotter than the cold inlet by more than
EMAT), its overall coefficient $1/U = 1/h_\text{hot} + 1/h_\text{cold}$, and its cost parameters. It also
lists the utilities that can serve each stream at its target temperature.
""", code=r'''
model = hen.Model(prob)
for i, hs in enumerate(prob["hot"]):
    for j, cs in enumerate(prob["cold"]):
        what = "allowed, " + "/".join(model.pair_pc[i][j]) if model.allowed[i][j] else model.reason[i][j]
        print(f"  {hs['name'][:22]:22s} x {cs['name'][:24]:24s} {what}")
print("coolers per hot stream :", [[prob["cu"][o["u"]]["name"] for o in c] for c in model.cool])
print("heaters per cold stream:", [[prob["hu"][o["u"]]["name"] for o in h] for h in model.heat])
'''),

dict(title="Targets: problem table and composite curves", md=r"""
Shift the cold temperatures up by EMAT and cut the range into intervals at every supply and target
temperature. In each interval the hot streams release $\sum F\,\Delta T$ and the cold streams need
$\sum F\,\Delta T$; cascading the surplus downwards (`problem_table`) gives the smallest hot utility
$Q_{H,\min}$ that keeps every flow non-negative. The pinch is where the cascade touches zero.
This ignores forbidden matches; the LP of the next step does not.
""", code=r'''
pt = hen.problem_table(prob)
print(f"QH,min = {pt['QH']:.1f} kW   QC,min = {pt['QC']:.1f} kW   pinch (hot scale) = {pt['pinch']}")

def composite(streams):
    T = sorted({s["Tin"] for s in streams} | {s["Tout"] for s in streams})
    H = [0.0]
    for lo, hi in zip(T, T[1:]):
        H.append(H[-1] + sum(s["F"] for s in streams if min(s["Tin"], s["Tout"]) <= lo and max(s["Tin"], s["Tout"]) >= hi) * (hi - lo))
    return T, H

Th, Hh = composite(prob["hot"])
Tc, Hc = composite(prob["cold"])
figure([dict(x=Hh, y=Th, name="hot composite", line=dict(color="#d62728")),
        dict(x=[h + pt["QC"] for h in Hc], y=Tc, name="cold composite (shifted by QC,min)", line=dict(color="#1f77b4"))],
       title="Composite curves", xaxis=dict(title="H [kW]"), yaxis=dict(title="T [C]"))
'''),

dict(title="Step 1 of the sequential method: LP utility targets with forbidden matches", md=r"""
The **expanded transshipment model** (Papoulias & Grossmann 1983) keeps track of *who* gives heat to
*whom*: $q_{ijk}$ is heat from hot $i$ to cold $j$ in interval $k$, and $R_{ik}$ is heat hot $i$ carries
down to the next interval. For every hot $i$ and interval $k$, and every cold $j$:
$$R_{ik} - R_{i,k-1} + \sum_j q_{ijk} = Q^H_{ik},\qquad \sum_i q_{ijk} = Q^C_{jk}.$$
A forbidden match simply has no $q_{ijk}$. Minimising $\sum_u c_u Q_u$ over the utility loads gives
the utility target **with** the restrictions; without them it equals the problem table.
""", code=r'''
lp = hen.lp_targets(prob, model.allowed)
free = hen.lp_targets(prob, [[True] * model.nC for _ in range(model.nH)])
print(f"with the restrictions   : {lp['cost']:12.1f} $/yr   QH = {[round(v, 1) for v in lp['QH']]}  QC = {[round(v, 1) for v in lp['QC']]}")
print(f"without the restrictions: {free['cost']:12.1f} $/yr   QH = {[round(v, 1) for v in free['QH']]}  QC = {[round(v, 1) for v in free['QC']]}")
print(f"energy penalty of the forbidden matches: {lp['cost'] - free['cost']:.1f} $/yr")
'''),

dict(title="Step 2: MILP for the fewest matches", md=r"""
With the utility loads fixed at their targets, binaries $y_{ij}$ say whether hot $i$ and cold $j$
exchange any heat, and $\sum_k q_{ijk} \le U_{ij}\,y_{ij}$ with $U_{ij} = \min(Q_i, Q_j)$.
Minimising $\sum w_{ij} y_{ij}$ ($w=1$: count the units) gives the minimum number of matches and
their loads (`milp_matches`, HiGHS through scipy). Utilities count as streams here.
""", code=r'''
mi = hen.milp_matches(prob, lp["QH"], lp["QC"], allowed_pc=model.allowed, time_limit=30)
names_h = [s["name"].split()[0] for s in prob["hot"]] + [u["name"] for u in prob["hu"]]
names_c = [s["name"].split()[0] for s in prob["cold"]] + [u["name"] for u in prob["cu"]]
print(f"{mi['n']} matches (optimal: {mi['optimal']})")
for m in sorted(mi["matches"], key=lambda m: -m["Tmean"]):
    print(f"  {names_h[m['hot']][:24]:24s} -> {names_c[m['cold']][:24]:24s} {m['load']:9.1f} kW   around {m['Tmean']:6.1f} C")
'''),

dict(title="The stage-wise network: temperatures, areas and TAC", md=r"""
The network model is the stage-wise superstructure of Yee & Grossmann (1990) with **isothermal
mixing**: in stage $k$ a stream may be split over several exchangers, and all branches leave at the
stage temperature. With loads $q$ the temperatures follow from energy balances,
$$t_{i,k+1} = t_{i,k} - \frac{\sum_j q_{ijk}}{F_i},\qquad t_{j,k} = t_{j,k+1} + \frac{\sum_i q_{ijk}}{F_j},$$
the utilities take what is left at the stream ends, and each exchanger needs
$A = q/(U\,\Delta T_\text{lm})$ with both approach temperatures $\ge$ EMAT.
TAC = annualised capital of every unit + utility cost.
""", code=r'''
seq_model, net, x0 = hen.network_from_matches(prob, mi)
print("stages:", seq_model.K, " matches (hot, cold, stage):", net["matches"])
ev = hen.evaluate(seq_model, net, x0)
print("at the MILP loads: feasible =", ev["ok"], "  TAC =", f"{ev['tac']:.0f} $/yr" if ev["ok"] else "-")
'''),

dict(title="The gradient, checked against finite differences", md=r"""
The NLP needs $\partial\,\text{TAC}/\partial q$. Every load changes the temperatures downstream of
it, so `evaluate` collects the sensitivities to every stage temperature first and `_backprop` sends
them back through the temperature recurrences in reverse order (an adjoint). Here it is compared
with central differences.
""", code=r'''
xs = hen.start_point(seq_model, net, 0.05)
e0 = hen.evaluate(seq_model, net, xs, 1e-3, 10.0, 1e5, want_grad=True)
for m in range(min(4, len(xs))):
    h = 1e-5 * xs[m]
    xp, xm = list(xs), list(xs)
    xp[m] += h
    xm[m] -= h
    fd = (hen.evaluate(seq_model, net, xp, 1e-3, 10.0, 1e5)["phi"] - hen.evaluate(seq_model, net, xm, 1e-3, 10.0, 1e5)["phi"]) / (2 * h)
    print(f"  load {m}: adjoint {e0['grad'][m]: .10e}   finite difference {fd: .10e}")
'''),

dict(title="Step 3: NLP for the loads (log barrier + L-BFGS)", md=r"""
For a fixed topology the loads are found by minimising
$$\varphi(q) = \frac{\text{TAC}(q)}{s} - \tau\sum_c \ln(\text{slack}_c) + \mu\sum_s r_s^2 ,$$
where the slacks are the loads, the approach temperatures minus EMAT and the utility loads (all
*linear* in $q$), and $r_s$ is the utility load of a stream whose utility is switched off.
$\tau$ falls from $10^{-3}$ to $10^{-9}$ and $\mu$ rises; each level is an L-BFGS run whose steps never
leave the region where every slack is positive. `improve_placement` then tries moving single matches
to other stages and switching utilities.
""", code=r'''
import time
t0 = time.perf_counter()
r = hen.optimize_loads(seq_model, net, x0)
seq = hen.improve_placement(seq_model, net, r)
print(f"NLP at the MILP topology : TAC = {r['tac']:.0f} $/yr  (feasible {r['feasible']})")
print(f"after stage placement    : TAC = {seq['tac']:.0f} $/yr  ({time.perf_counter() - t0:.1f} s)")
for u in seq["units"]:
    print(f"  {u['type']:7s} q = {u['q']:8.1f} kW   A = {u['A']:7.1f} m2   capital {u['cost']:9.0f} $/yr")
'''),

dict(title="Simulated annealing over the topology", md=r"""
`anneal` searches the superstructure itself: each move adds a match, removes one, moves one to another
stage, or changes a utility. Every candidate gets its own optimal loads (previous step, warm-started),
and is accepted with the Metropolis rule $P = \min(1, e^{-\Delta/T})$ while $T$ falls geometrically.
Forbidden and material-incompatible pairs are never proposed. A short run in Python; the page runs
long ones in Rust, several chains in parallel.
""", code=r'''
sa_model = hen.Model(prob)
t0 = time.perf_counter()
trace = []
res = hen.anneal(sa_model, 150, seed=1, log=lambda it, tac: trace.append((it, tac)))
best = res["best"]
print(f"150 SA moves in {time.perf_counter() - t0:.1f} s, {res['nfev']} NLP function evaluations")
print(f"best TAC = {best['tac']:.0f} $/yr, matches (hot, cold, stage): {best['net']['matches']}")
print(f"sequential result for comparison: {seq['tac']:.0f} $/yr")
figure([dict(x=[t[0] for t in trace], y=[t[1] for t in trace], mode="lines+markers", line=dict(shape="hv"))],
       title="Best TAC found so far", xaxis=dict(title="SA move"), yaxis=dict(title="TAC [$/yr]"))
'''),
]
