"""Run the breakdown cells like a notebook, capturing printed output and
figures.  Used at build time (CPython) and live in the browser (Pyodide)."""
import contextlib, io, json, time, traceback
import numpy as np


def _plain(o):
    """numpy -> JSON-friendly lists (NaN/inf -> None)."""
    if isinstance(o, np.ndarray):
        return [_plain(v) for v in o.tolist()] if o.ndim else _plain(o.item())
    if isinstance(o, (list, tuple)):
        return [_plain(v) for v in o]
    if isinstance(o, dict):
        return {k: _plain(v) for k, v in o.items()}
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return f if np.isfinite(f) else None
    if isinstance(o, np.integer):
        return int(o)
    return o


def run_cells(cells, user_inputs=None, on_cell=None):
    ns = {"USER_INPUTS": dict(user_inputs or {})}
    results = []
    for i, cell in enumerate(cells):
        figs = []
        ns["figure"] = lambda traces, **layout: figs.append({"data": traces, "layout": layout})
        buf = io.StringIO()
        err = None
        t = time.perf_counter()
        with contextlib.redirect_stdout(buf):
            try:
                exec(compile(cell["code"], f"<cell {i + 1}>", "exec"), ns)
            except Exception:
                err = traceback.format_exc(limit=2)
        r = {"out": buf.getvalue(), "figs": _plain(figs), "error": err,
             "secs": time.perf_counter() - t}
        results.append(r)
        if on_cell:
            on_cell(i, json.dumps(r))
    return results
