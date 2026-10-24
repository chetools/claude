"""Walkthrough cells skeleton (the single source for the Code panel
walkthrough and both notebook variants; see Sections 3 and 7 of the
skill). One transformation per cell; each cell is a dict with a title,
a Markdown explanation (md), and code. Inside the code, figure(traces,
**layout) records a Plotly figure as plain dicts, and USER_INPUTS holds
the page's input values (empty at build time). Every symbol is defined
in the md text before first use, with SI units.
"""

CELLS = [
    dict(
        title="Design basis",
        md="""The symbol $\\dot{m}_{fresh}$ denotes the fresh feed mass
flow rate (in kg/h). The design basis of the sheet is loaded and the
overall closure is asserted before any derived quantity is formed.""",
        code="""import balance

basis = balance.DESIGN_BASIS
result = balance.evaluate()
assert abs(result["converter_feed"] - (basis["fresh_feed"] * (1.0 + basis["recycle_ratio"]))) < 1e-6
print("design basis loaded; converter feed =", result["converter_feed"], "kg/h")""",
    ),
    dict(
        title="Recycle relation",
        md="""The recycle ratio $R$ (dimensionless) is the recycle mass
flow rate divided by the fresh feed mass flow rate. The converter feed
rate is the sum of the fresh feed and recycle rates.""",
        code="""import plotly.graph_objects as go

ratios = [0.0, 1.0, 2.0, 2.56, 4.0]
feeds = [balance.evaluate(recycle_ratio=r)["converter_feed"] for r in ratios]
figure([go.Scatter(x=ratios, y=feeds, mode="lines+markers", name="Converter feed")],
       xaxis_title="R", yaxis_title="kg/h")""",
    ),
]
