"""Published benchmark values and the comparison table of the page.

Only numbers read in the cited tables are listed here.  Our numbers come
from benchmarks/sa_results.json (Rust SA, written by solver/examples/bench)
and benchmarks/furman_results.json (written by run_furman() below); every
Rust network is re-evaluated with hen.evaluate before it is reported.

    python benchmarks.py furman     # LP + MILP on the Furman-Sahinidis set (minutes)
"""
import json
import os
import sys
import time

import hen

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.join(HERE, "..", "benchmarks")

CAB = "Caballero et al. (2021), Front. Chem. Eng. 3:733186, Supplementary Data Sheet 1"
HUB = "Huber et al. (2023), Energies 16:4732, Tables 1 and 3"

# TAC in $/yr as printed (k$/yr values multiplied by 1000).
PUBLISHED = {
    "H2C2 (Escobar & Trierweiler)": dict(
        source=CAB + ", Tables S3-S4", law="4000 + 500 A^0.83", emat=10,
        values=[("Escobar & Trierweiler (2013)", 361983), ("Chang et al. (2020a, b)", 360037),
                ("Caballero et al. (2021)", 352479)]),
    "H2C2 (Ahmad 1985)": dict(
        source=HUB, law="300 A^0.5", emat=1,
        values=[("Ahmad (1985)", 12870), ("Nielsen et al. (1996)", 12306),
                ("Khorasany & Fesanghary (2009)", 11895), ("Huber et al. (2023), base case", 11792)]),
    "H5C1 (Yee & Grossmann)": dict(
        source=CAB + ", Tables S9-S10", law="1200 A^0.6", emat=10,
        values=[("Isafiade & Fraser (2010)", 581900), ("Yee & Grossmann (1990)", 575595),
                ("Lewin et al. (1998)", 573205), ("Khorasany & Fesanghary (2009)", 572476),
                ("Pavão et al. (2016)", 571737), ("Fieg et al. (2009)", 571698),
                ("Huang et al. (2012)", 571657), ("Caballero et al. (2021)", 570974),
                ("Toffolo (2009)", 570930), ("Pavão et al. (2018)", 570387),
                ("Huang & Karimi (2014)", 570362)]),
    "H4C5 aromatics (Linnhoff & Ahmad)": dict(
        source=CAB + ", Tables S11-S12 (data also in " + HUB.split(",")[0] + ", Table 4)", law="2000 + 70 A",
        emat=1,
        values=[("Zhu et al. (1995)", 2980000), ("Yerramsetty & Murty (2008)", 2942000),
                ("Lewin et al. (1998)", 2936000), ("Bergamini et al. (2007)", 2935020),
                ("Peng & Cui (2015)", 2935000), ("Núñez-Serna & Zamora (2016)", 2932817),
                ("Linnhoff & Ahmad (1990)", 2930000), ("Pavão et al. (2017)", 2928629),
                ("Zhaoyi et al. (2013)", 2922585), ("Luo et al. (2009)", 2922298),
                ("Toffolo (2009)", 2920130), ("Pavão et al. (2017b)", 2919675),
                ("Pavão et al. (2018)", 2909906), ("Rathjens & Fieg (2020)", 2892924),
                ("Caballero et al. (2021)", 2891064)]),
    "H6C4 (Ahmad 1985)": dict(
        source=CAB + ", Tables S15-S16", law="8000 + 60 A", emat=1,
        values=[("Ahmad (1985)", 7074000), ("Ravagnani et al. (2005)", 5672821),
                ("Yerramsetty & Murty (2008)", 5666756), ("Khorasany & Fesanghary (2009)", 5662366),
                ("Zhaoyi et al. (2013)", 5645688), ("Huang et al. (2012)", 5617431),
                ("He & Cui (2013)", 5609271), ("Caballero et al. (2021)", 5606046),
                ("Peng & Cui (2015)", 5596079), ("Chen & Cui (2016)", 5593970),
                ("Zhang & Cui (2018)", 5589622), ("Xiao & Cui (2017)", 5589493),
                ("Chen et al. (2017)", 5588614), ("Bao et al. (2018)", 5587883)]),
    "H8C7 (Bjork & Pettersson)": dict(
        source=CAB + ", Tables S21-S22", law="8000 + 500 A^0.75", emat=1,
        values=[("Björk & Nordman (2005)", 1530063), ("Peng & Cui (2015)", 1527240),
                ("Pavão et al. (2017)", 1525394), ("Chen et al. (2017)", 1523735),
                ("Xiao & Cui (2017)", 1518968), ("Björk & Pettersson (2003)", 1513854),
                ("Xiao et al. (2019)", 1511552), ("Fieg et al. (2009)", 1510891),
                ("Pavão et al. (2017b)", 1507290), ("Rathjens & Fieg (2020)", 1501070),
                ("Chang et al. (2020b)", 1501004), ("Pavão et al. (2017c)", 1497325),
                ("Caballero et al. (2021)", 1492869)]),
    "H10C10 (Luo et al.)": dict(
        source=CAB + ", Tables S27-S28", law="8000 + 800 A^0.8", emat=1,
        values=[("Laukkanen & Fogelholm (2011)", 1811900), ("Pavão et al. (2017b)", 1763488),
                ("Zhang et al. (2016)", 1763488), ("Luo et al. (2009)", 1753271),
                ("Pavão et al. (2017)", 1725295), ("Xiao et al. (2019)", 1723299),
                ("Rathjens & Fieg (2020)", 1715088), ("Caballero et al. (2021)", 1680824)]),
    "H22C17 (Bjork & Pettersson)": dict(
        source=CAB + ", Tables S29-S30", law="8000 + 800 A^0.8", emat=1,
        values=[("Björk & Pettersson (2003)", 2073251), ("Escobar & Trierweiler (2013)", 2055421),
                ("Pettersson (2005)", 1997054), ("Björk & Pettersson (2003), 2nd", 1954417),
                ("Ernst et al. (2010)", 1943536), ("Xiao & Cui (2017)", 1939288),
                ("Zhang et al. (2016)", 1939149), ("Huang & Karimi (2014)", 1937377),
                ("Nemet et al. (2018)", 1928800), ("Xiao et al. (2019)", 1925783),
                ("Chang et al. (2020a)", 1912763), ("Pavão et al. (2017b)", 1900614),
                ("Caballero et al. (2021)", 1898275), ("Rathjens & Fieg (2020)", 1852913)]),
}
# Problems whose cited table states EMAT (H4C5: Huber et al. 2023, Table 4).
# For the others the cited table gives none and we use 1 K (flagged on the page).
EMAT_STATED = {"H2C2 (Escobar & Trierweiler)", "H5C1 (Yee & Grossmann)", "H2C2 (Ahmad 1985)",
               "H4C5 aromatics (Linnhoff & Ahmad)"}

# Caballero et al. (2021) Table S10 (H5C1): hot utility [kW] and total area [m2] ("---" = not given)
H5C1_PUBLISHED_QH_AREA = [("Isafiade & Fraser (2010)", 3687.0, 233), ("Yee & Grossmann (1990)", 3530.0, 296),
                          ("Lewin et al. (1998)", 3620.0, 213), ("Khorasany & Fesanghary (2009)", 3567.0, None),
                          ("Pavão et al. (2016)", 3556.0, 262), ("Fieg et al. (2009)", 3559.0, None),
                          ("Luo et al. (2009)", 3559.0, None), ("Huang et al. (2012)", 3559.0, 258),
                          ("Caballero et al. (2021)", 3588.9, 256.2), ("Toffolo (2009)", 3560.0, None),
                          ("Pavão et al. (2018)", 3570.0, 268), ("Huang & Karimi (2014)", 3571.0, 266)]

VARIANTS = {   # extra rows run by solver/examples/bench (see make_bench_inputs.py)
    "H5C1 (Yee & Grossmann) @EMAT 5": ("H5C1 (Yee & Grossmann)", 5.0, None),
    "H5C1 (Yee & Grossmann) @U=1": ("H5C1 (Yee & Grossmann)", 10.0, 2.0),
    "H5C1 (Yee & Grossmann) @U=1, EMAT 1": ("H5C1 (Yee & Grossmann)", 1.0, 2.0),
}


def problem_for(name):
    base, emat, h = VARIANTS.get(name, (name, None, None))
    p = hen.benchmark(base)
    if emat is not None:
        p["emat"] = emat
    if h is not None:
        for s in p["hot"] + p["cold"] + p["hu"] + p["cu"]:
            s["h"] = h
    return base, p


def sa_table():
    """Rows: our SA result, re-evaluated in Python, against the literature."""
    rows = []
    path = os.path.join(BENCH, "sa_results.json")
    if not os.path.exists(path):
        return rows
    for r in json.load(open(path)):
        base, p = problem_for(r["problem"])
        model = hen.Model(p)
        net = dict(matches=[tuple(t) for t in r["net"]["matches"]], hu=r["net"]["hu"], cu=r["net"]["cu"])
        ev = hen.evaluate(model, net, r["x"])
        resid = max([0.0] + [abs(v) for v in hen.residuals(model, net, r["x"])])
        units = [u for u in ev["units"] if u["q"] > 1e-6 * max(model.Qh + model.Qc)]
        QH = sum(u["q"] for u in units if u["type"] == "heater")
        QC = sum(u["q"] for u in units if u["type"] == "cooler")
        pub = PUBLISHED[base]
        best = min(pub["values"], key=lambda v: v[1])
        dts = [min(u["dT1"], u["dT2"]) for u in units]
        stage_use = {}
        for (i, j, k) in net["matches"]:
            stage_use.setdefault(("H", i, k), []).append(j)
            stage_use.setdefault(("C", j, k), []).append(i)
        splits = sorted(f"{'H' if s == 'H' else 'C'}{a + 1} in stage {k + 1}" for (s, a, k), v in stage_use.items() if len(v) > 1)
        rows.append(dict(problem=r["problem"], base=base, variant=r["problem"] != base, tac_rust=r["tac"],
                         dTmin=min(dts) if dts else None, splits=splits,
                         tac_py=ev["tac"], ok=ev["ok"], resid=resid, units=len(units), QH=QH, QC=QC,
                         area=sum(u["A"] for u in units), stages=model.K, emat=p["emat"],
                         chains=r["seeds"], iters=r["iters"], epochs=r.get("epochs", 1), seconds=r["seconds"],
                         evals=r["evals"], all_tac=r["all_tac"], best_pub=best, n_pub=len(pub["values"]),
                         worst_pub=max(pub["values"], key=lambda v: v[1]), source=pub["source"], law=pub["law"],
                         net=r["net"], x=r["x"]))
    return rows


def run_furman(time_limit=60.0):
    """Our LP utility cost and MILP minimum matches on the 26 Furman-Sahinidis
    instances, with the values published by Letsios et al. (2018)."""
    D = os.path.join(BENCH, "furman")
    cost = {l.split()[0]: float(l.split("=")[1]) for l in open(os.path.join(D, "published_lp_cost.txt"))}
    mm = {}
    for l in open(os.path.join(D, "published_min_matches.txt")):
        if not l.startswith("#"):
            w = l.split()
            mm[w[0]] = (int(w[1].split("=")[1]), w[3].split("=")[1] if "gap=" in w[3] else "")
    out = []
    for name in sorted(cost, key=lambda n: (int(n.split("sp")[0]), n)):
        p = hen.load_furman(os.path.join(D, name + ".dat"))
        free = [[True] * len(p["cold"]) for _ in p["hot"]]
        t = time.time()
        lp = hen.lp_targets(p, free)
        row = dict(name=name, n_hot=len(p["hot"]), n_cold=len(p["cold"]), pub_cost=cost[name], pub_n=mm[name][0],
                   pub_gap=mm[name][1])
        if not lp["ok"]:
            row.update(lp_ok=False, msg=lp["msg"])
        else:
            mi = hen.milp_matches(p, lp["QH"], lp["QC"], allowed_pc=free, time_limit=time_limit)
            row.update(lp_ok=True, cost=lp["cost"], n=mi["n"], optimal=mi["optimal"], secs=time.time() - t)
        out.append(row)
        print(row, flush=True)
    json.dump(out, open(os.path.join(BENCH, "furman_results.json"), "w"), indent=1)
    return out


if __name__ == "__main__":
    if sys.argv[1:] == ["furman"]:
        run_furman()


# ------------------------------------------------------------------ area target
def balanced_composites(p, QH):
    """Balanced hot and cold composite curves (H from the cold end), with
    one hot and one cold utility added as streams (isothermal ones get a
    0.01 K span)."""
    dQ = sum(s["F"] * (s["Tout"] - s["Tin"]) for s in p["cold"]) - sum(s["F"] * (s["Tin"] - s["Tout"]) for s in p["hot"])
    QC = QH - dQ
    hu, cu = p["hu"][0], p["cu"][0]
    hot = [(s["Tin"], s["Tout"], s["F"]) for s in p["hot"]]
    cold = [(s["Tin"], s["Tout"], s["F"]) for s in p["cold"]]
    a, b = hu["Tin"], (hu["Tout"] if hu["Tout"] < hu["Tin"] else hu["Tin"] - 0.01)
    hot.append((a, b, QH / (a - b)))
    a, b = cu["Tin"], (cu["Tout"] if cu["Tout"] > cu["Tin"] else cu["Tin"] + 0.01)
    cold.append((a, b, QC / (b - a)))

    def curve(ss):
        T = sorted({x for s in ss for x in s[:2]})
        H = [0.0]
        for lo, hi in zip(T, T[1:]):
            H.append(H[-1] + sum(f for (t1, t2, f) in ss if min(t1, t2) <= lo and max(t1, t2) >= hi) * (hi - lo))
        return T, H

    return curve(hot), curve(cold), QC


def _at(H, T, h):
    for k in range(len(H) - 1):
        if H[k] <= h <= H[k + 1]:
            return T[k] + (T[k + 1] - T[k]) * (h - H[k]) / max(H[k + 1] - H[k], 1e-300)
    return T[-1]


def area_target(p, QH):
    """Vertical-heat-transfer ("Bath") area of the balanced composites.  With
    equal film coefficients on every stream and utility (as in H5C1) this is
    the smallest total area any counter-current network can have."""
    (Th, Hh), (Tc, Hc), QC = balanced_composites(p, QH)
    hs = sorted(set(Hh) | set(Hc))
    U = hen.overall_U(p["hot"][0]["h"], p["cold"][0]["h"])
    A, dmin = 0.0, float("inf")
    for h0, h1 in zip(hs, hs[1:]):
        if h1 - h0 < 1e-9:
            continue
        e = 1e-9 * (h1 - h0)          # one-sided limits: the curves jump at isothermal utilities
        d0 = _at(Hh, Th, h0 + e) - _at(Hc, Tc, h0 + e)
        d1 = _at(Hh, Th, h1 - e) - _at(Hc, Tc, h1 - e)
        dmin = min(dmin, d0, d1)
        A += (h1 - h0) / (U * hen.lmtd(d0, d1)[0])
    return A, dmin
