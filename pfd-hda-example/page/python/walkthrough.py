"""Walkthrough cells of the Code panel: the single source of the static
Walkthrough sub-tab and of the MoLab notebook (see make_molab.py).

One transformation per cell; every cell ends in a displayed intermediate.
Inside the code, figure(traces, **layout) records a Plotly figure as plain
dictionaries. Symbols are defined in the md text before first use.
"""

CELLS = [
    dict(
        title="Inputs and design basis",
        md="""The model has four inputs. $F$ is the fresh toluene feed rate (kmol/h,
kilomole per hour); $X$ is the toluene conversion per pass in the reactor
(dimensionless, moles converted per mole fed to the reactor); $\\beta$ is the
purge fraction, the share of the high-pressure separator vapour sent to the
purge (dimensionless); $r$ is the hydrogen-to-toluene molar ratio at the reactor
inlet (dimensionless). The values below are plain assignments: edit a value and
re-run. The design basis of the sheets is $F = 100$ kmol/h, $X = 0.75$,
$\\beta = 0.25$, $r = 5$. The function `check_inputs` returns the inputs as
floating-point numbers or raises an error stating the permitted range.""",
        code="""F = 100.0      # fresh toluene feed rate, kmol/h
X = 0.75       # toluene conversion per pass, dimensionless
beta = 0.25    # purge fraction, dimensionless
r = 5.0        # H2 / toluene molar ratio at the reactor inlet, dimensionless

import balance

design_basis = dict(balance.BASIS)
print("design basis of the sheets:", design_basis)
inputs = balance.check_inputs(F, X, beta, r)
print("validated inputs:", inputs)""",
    ),
    dict(
        title="One pass through the flowsheet from zero tear values",
        md="""The flowsheet contains two recycles. Cutting them gives eleven unknown
numbers, the tear variables: the five component flows of the toluene recycle
(stream 37, kmol/h), the five component flows of the recycle gas (stream 15,
kmol/h), and the make-up gas rate $F_H$ (stream 5, kmol/h). One pass computes
every stream from assumed tear values and returns the tear values that the
flowsheet then produces, together with the ratio residual
$\\rho = r\\,n_{T,9} - n_{H_2,9}$ (kmol/h), where $n_{T,9}$ and $n_{H_2,9}$ are the
toluene and hydrogen flows of the reactor inlet (stream 9). The flowsheet closes
when the produced tear values equal the assumed ones and $\\rho = 0$. Starting
from zero tear values, it does not close.""",
        code="""tear_zero = {c: 0.0 for c in balance.C}
pass0 = balance._pass(inputs, tear_zero, tear_zero, 0.0)
streams_pass0, produced_37, produced_15, rho_pass0, extents_pass0 = pass0

print("assumed toluene recycle and recycle gas: all zero; make-up gas rate 0")
print("produced toluene recycle (stream 37):", {c: round(v, 3) for c, v in produced_37.items()})
print("produced recycle gas (stream 15):", {c: round(v, 3) for c, v in produced_15.items()})
print("ratio residual rho = r*nT9 - nH2_9 =", round(rho_pass0, 3), "kmol/h")
gap_pass0 = max(max(produced_37.values()), max(produced_15.values()), abs(rho_pass0))
print("largest mismatch:", round(gap_pass0, 3), "kmol/h -> the balance does not close")""",
    ),
    dict(
        title="Affine tear residual and the 11 x 11 linear solve",
        md="""Every unit relation of the model is linear in the flows it receives, so
the residual vector $\\mathbf{f}(\\mathbf{u})$ of the eleven tear equations
(produced minus assumed tear values, and $\\rho$) is affine in the tear vector
$\\mathbf{u}$ (eleven numbers, kmol/h):
$\\mathbf{f}(\\mathbf{u}) = \\mathbf{f}_0 + \\mathbf{J}\\,\\mathbf{u}$.
Here $\\mathbf{f}_0$ is the residual at $\\mathbf{u} = \\mathbf{0}$ and column $j$ of
the $11 \\times 11$ matrix $\\mathbf{J}$ is the residual change when $u_j$ is set to 1.
The steady state is the solution of $\\mathbf{J}\\,\\mathbf{u}^\\ast = -\\mathbf{f}_0$.
The cell builds $\\mathbf{J}$ column by column, tests the affine form at an
arbitrary point, solves, and compares with the model's own solver.""",
        code="""import numpy as np

def tear_residual(u):
    return np.array(balance._residual(inputs, list(u)))

f0 = tear_residual(np.zeros(11))
jacobian = np.column_stack([tear_residual(np.eye(11)[j]) - f0 for j in range(11)])

u_probe = np.arange(11) * 0.7
affine_error = np.max(np.abs(tear_residual(u_probe) - (f0 + jacobian @ u_probe)))
print("affine test, max |f(u) - (f0 + J u)| =", float(affine_error))

u_star = np.linalg.solve(jacobian, -f0)
print("make-up gas rate F_H =", round(u_star[10], 4), "kmol/h")
print("toluene recycle flows (kmol/h):", {c: float(round(v, 4)) + 0.0 for c, v in zip(balance.C, u_star[:5])})
print("recycle gas flows (kmol/h):", {c: float(round(v, 4)) + 0.0 for c, v in zip(balance.C, u_star[5:10])})
print("residual at the solution, max |f(u*)| =", float(np.max(np.abs(tear_residual(u_star)))))""",
    ),
    dict(
        title="Closure check: atom balances and successive substitution",
        md="""Two independent checks of the solution. First, the overall atom balances:
the carbon (C) and hydrogen (H) atom flows (kmol/h) entering with the fresh
toluene and the make-up gas (streams 1 and 5) must equal those leaving in the
fuel gas (streams 19 and 24), the benzene product (28) and the diphenyl (40).
Atoms per molecule: $\\mathrm{H_2}$ (0 C, 2 H), $\\mathrm{CH_4}$ (1 C, 4 H), benzene (6 C, 6 H),
toluene (7 C, 8 H), diphenyl (12 C, 10 H). Second, successive substitution
(repeated passes from the previous tear values) must give the same streams as the
linear solve.""",
        code="""solution_linear, extents_linear = balance.solve(F, X, beta, r)
solution_iter, extents_iter = balance.solve_iter(F, X, beta, r)

atoms_per_molecule = {"H2": (0, 2), "CH4": (1, 4), "B": (6, 6), "T": (7, 8), "D": (12, 10)}
streams_in, streams_out = (1, 5), (19, 24, 28, 40)
for k, element in enumerate(["C", "H"]):
    atoms_in = sum(solution_linear[n][c] * atoms_per_molecule[c][k] for n in streams_in for c in balance.C)
    atoms_out = sum(solution_linear[n][c] * atoms_per_molecule[c][k] for n in streams_out for c in balance.C)
    print(element, "atoms in:", round(atoms_in, 6), " out:", round(atoms_out, 6), " difference:", atoms_in - atoms_out)

gap_methods = max(abs(solution_linear[n][c] - solution_iter[n][c]) for n in balance.STREAMS for c in balance.C)
print("largest difference over all streams and components, linear solve vs successive substitution:", gap_methods, "kmol/h")""",
    ),
    dict(
        title="Design-basis anchor",
        md="""The sheets display flows rounded to 0.1 kmol/h. The anchor run repeats the
calculation in integer tenths of kmol/h, every split rounded and its last outlet
taken by difference, so that each balance closes exactly on the displayed
numbers. Its result must reproduce the stream values recorded in
`DESIGN_ANCHOR` (the values printed on the sheets); the cell fails with an
assertion error if any value differs.""",
        code="""anchor_streams, anchor_extents = balance.solve_iter(100.0, 0.75, 0.25, 5.0, exact=True)
anchor_checked = 0
for stream_no, components in balance.DESIGN_ANCHOR.items():
    for comp, shown in components.items():
        assert round(anchor_streams[stream_no][comp], 1) == shown, (stream_no, comp)
        anchor_checked += 1
print("design-basis values reproduced exactly:", anchor_checked)
print("benzene product (stream 28), kmol/h:", anchor_streams[28]["B"])
print("toluene recycle (stream 37), kmol/h:", anchor_streams[37]["T"])
print("float solution minus integer-tenths run, largest difference:",
      max(abs(solution_linear[n][c] - anchor_streams[n][c]) for n in balance.STREAMS for c in balance.C), "kmol/h")""",
    ),
    dict(
        title="Purge trade-off sweep",
        md="""Varying the purge fraction $\\beta$ at fixed $F$, $X$ and $r$ changes the
balance of the recycle loop. The make-up hydrogen rate (kmol/h, stream 5) and the
recycle gas flow (kmol/h, stream 15, the sum of its five component flows) are
computed at twelve values of $\\beta$. The figure shows both flows against $\\beta$
over the permitted range.""",
        code="""betas = [round(0.05 + 0.05 * i, 2) for i in range(12)]
purge_runs = balance.sweep("beta", betas, F=F, X=X, r=r)
makeup_h2 = [e["makeup_h2"] for e in purge_runs]
recycle_gas = [e["recycle_gas"] for e in purge_runs]
print("beta        :", betas)
print("make-up H2  :", [round(v, 1) for v in makeup_h2])
print("recycle gas :", [round(v, 1) for v in recycle_gas])
figure([dict(type="scatter", x=betas, y=makeup_h2, mode="lines+markers", name="make-up H2",
             line=dict(color="#0072B2", dash="solid"), marker=dict(symbol="circle", color="#0072B2")),
        dict(type="scatter", x=betas, y=recycle_gas, mode="lines+markers", name="recycle gas",
             line=dict(color="#D55E00", dash="dash"), marker=dict(symbol="square", color="#D55E00"))],
       xaxis=dict(title="beta"), yaxis=dict(title="flow, kmol/h"),
       legend=dict(orientation="h", x=0, y=-0.25))""",
    ),
    dict(
        title="Conversion sweep",
        md="""Varying the conversion per pass $X$ at fixed $F$, $\\beta$ and $r$ shows the
second trade-off: at low conversion most of the toluene fed to the reactor
leaves unconverted and is recycled (stream 37, kmol/h), so the toluene flow through
the reactor (stream 9, kmol/h) is large. The figure shows the toluene recycle and
the reactor toluene flow against $X$.""",
        code="""conversions = [round(0.30 + 0.05 * i, 2) for i in range(14)]
conv_runs = balance.sweep("X", conversions, F=F, beta=beta, r=r)
toluene_recycle = [e["toluene_recycle"] for e in conv_runs]
reactor_toluene = [e["reactor_toluene"] for e in conv_runs]
print("X                :", conversions)
print("toluene recycle  :", [round(v, 1) for v in toluene_recycle])
print("reactor toluene  :", [round(v, 1) for v in reactor_toluene])
figure([dict(type="scatter", x=conversions, y=toluene_recycle, mode="lines+markers", name="toluene recycle",
             line=dict(color="#0072B2", dash="solid"), marker=dict(symbol="circle", color="#0072B2")),
        dict(type="scatter", x=conversions, y=reactor_toluene, mode="lines+markers", name="reactor toluene",
             line=dict(color="#D55E00", dash="dash"), marker=dict(symbol="square", color="#D55E00"))],
       xaxis=dict(title="X"), yaxis=dict(title="flow, kmol/h"),
       legend=dict(orientation="h", x=0, y=-0.25))""",
    ),
]
