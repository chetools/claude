"""Page interface of the HDA balance model: one function that turns the four
reader inputs into the complete set of numbers shown on the App panel.

The same function runs at build time (the precomputed design-basis run shown
on load) and live in the browser (Pyodide), so the two cannot differ.
Pure Python; the numbers come from balance.evaluate and balance.sweep.

Symbols (molar flows in kilomole per hour, kmol/h):
  F     fresh toluene feed rate, kmol/h
  X     toluene conversion per pass in the reactor, dimensionless
  beta  purge fraction of the high-pressure separator vapour, dimensionless
  r     hydrogen-to-toluene molar ratio at the reactor inlet, dimensionless
"""
import balance

# Streams listed in the key-stream table: (stream number, label on the sheets).
KEY_STREAMS = [
    (1, "Fresh toluene"),
    (5, "Hydrogen make-up"),
    (9, "Reactor inlet"),
    (13, "Purge"),
    (15, "Recycle gas"),
    (28, "Benzene product"),
    (37, "Toluene recycle"),
    (40, "Diphenyl (heavy ends)"),
]
N_SWEEP = 12   # points of the purge sweep
N_CONV = 14    # points of the conversion sweep


def _grid(var, n):
    """n equally spaced values over the full range of input var (rounded to 1e-6)."""
    lo, hi = balance.RANGES[var][0], balance.RANGES[var][1]
    return [round(lo + (hi - lo) * i / (n - 1), 6) for i in range(n)]


def payload(F, X, beta, r):
    """Metrics, key-stream table and the two sweeps at the inputs given.
    Raises ValueError (plain-language message) for invalid inputs."""
    v = balance.check_inputs(F, X, beta, r)
    run = balance.evaluate(**v)
    metrics = {
        "benzene_product": run["benzene_product"],    # kmol/h, stream 28 benzene
        "yield": run["yield"],                        # mol benzene per mol fresh toluene
        "makeup_h2": run["makeup_h2"],                # kmol/h, stream 5 hydrogen
        "h2_utilisation": run["h2_efficiency"],       # H2 consumed / H2 make-up
        "purge": run["purge"],                        # kmol/h, stream 13 total
        "recycle_gas_ch4": run["recycle_gas_ch4"],    # mole fraction methane, stream 15
        "toluene_recycle": run["toluene_recycle"],    # kmol/h, stream 37 toluene
    }
    table = []
    for n, label in KEY_STREAMS:
        s = run["streams"][n]
        table.append({"stream": n, "label": label,
                      "flows": {c: s[c] for c in balance.C},
                      "total": sum(s.values())})
    betas = _grid("beta", N_SWEEP)
    sw_a = balance.sweep("beta", betas, F=v["F"], X=v["X"], r=v["r"])
    xs = _grid("X", N_CONV)
    sw_b = balance.sweep("X", xs, F=v["F"], beta=v["beta"], r=v["r"])
    return {
        "inputs": v,
        "metrics": metrics,
        "table": table,
        "sweep_beta": {"beta": betas,
                       "makeup_h2": [e["makeup_h2"] for e in sw_a],
                       "recycle_gas": [e["recycle_gas"] for e in sw_a],
                       "now": {"beta": v["beta"], "makeup_h2": run["makeup_h2"],
                               "recycle_gas": run["recycle_gas"]}},
        "sweep_X": {"X": xs,
                    "toluene_recycle": [e["toluene_recycle"] for e in sw_b],
                    "reactor_toluene": [e["reactor_toluene"] for e in sw_b],
                    "now": {"X": v["X"], "toluene_recycle": run["toluene_recycle"],
                            "reactor_toluene": run["reactor_toluene"]}},
    }
