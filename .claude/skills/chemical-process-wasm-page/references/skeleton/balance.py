"""Balance model skeleton for a chemical process WASM page.

Replace the design basis and the relations with those of the process
being built, following Section 4 of the skill: the design basis is
the anchor, the default evaluation reproduces it, and the tests
assert its closure exactly. Every symbol is defined in the page's
breakdown text before first use, with SI units, under the same name.
"""
import numpy as np

# Design basis, as displayed on the sheet (sample values, labelled as
# such on the sheet and in the page text). Mass flow rates in kg/h.
DESIGN_BASIS = {
    "fresh_feed": 82_000.0,     # fresh feed mass flow rate, kg/h
    "product": 76_000.0,        # product mass flow rate, kg/h
    "recycle_ratio": 2.56,      # recycle / fresh feed, dimensionless
}


def evaluate(fresh_feed=None, recycle_ratio=None):
    """Evaluate the loop balance at one operating point.

    fresh_feed: fresh feed mass flow rate in kg/h (default: design
        basis value).
    recycle_ratio: recycle mass flow rate divided by fresh feed mass
        flow rate, dimensionless (default: design basis value).
    Returns a dict of mass flow rates in kg/h. Raises ValueError with
    a plain-language message for out-of-range inputs (the page shows
    the message; it never shows a traceback).
    """
    fresh = DESIGN_BASIS["fresh_feed"] if fresh_feed is None else float(fresh_feed)
    ratio = DESIGN_BASIS["recycle_ratio"] if recycle_ratio is None else float(recycle_ratio)
    if not (0.0 < fresh <= 1.0e7):
        raise ValueError("Fresh feed rate must be between 0 and 10,000,000 kg/h.")
    if not (0.0 <= ratio <= 20.0):
        raise ValueError("Recycle ratio must be between 0 and 20.")
    recycle = ratio * fresh            # recycle mass flow rate, kg/h
    converter_feed = fresh + recycle   # converter feed mass flow rate, kg/h
    return {
        "fresh_feed": fresh,
        "recycle": recycle,
        "converter_feed": converter_feed,
    }
