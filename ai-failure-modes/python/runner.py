"""Run walkthrough.SETUP and walkthrough.CELLS like a notebook, capturing printed output and figures."""
import contextlib
import io
import time
import traceback

import cases
import walkthrough


def run_cells(inputs=None):
    """Execute the cells in one namespace; returns [{"out", "figs", "error", "secs"}] per cell."""
    ns = {"cases": cases, "INPUTS": {k: dict(v) for k, v in walkthrough.INPUTS.items()}}
    for k, v in (inputs or {}).items():
        ns["INPUTS"][k].update(v)
    figs = []
    ns["figure"] = lambda traces, **layout: figs.append({"data": traces, "layout": layout})
    exec(compile(walkthrough.SETUP, "<setup>", "exec"), ns)
    results = []
    for i, cell in enumerate(walkthrough.CELLS):
        figs.clear()
        buf = io.StringIO()
        err = None
        t = time.perf_counter()
        with contextlib.redirect_stdout(buf):
            try:
                exec(compile(cell["code"], f"<cell {i + 1}>", "exec"), ns)
            except Exception:
                err = traceback.format_exc(limit=2)
        results.append({"out": buf.getvalue(), "figs": list(figs), "error": err, "secs": time.perf_counter() - t})
    return results
