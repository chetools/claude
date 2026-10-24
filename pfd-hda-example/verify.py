"""Independent verification of the HDA sheets under PFD-SPEC-001 Section 12.

Reads only the delivered SVG files, the frozen topology (topology.json) and
the symbol library; it does not import the layout scripts or pfdkit. The
edge list is re-derived from the drawn geometry (path end points matched to
library ports transformed by each symbol's matrix), balances are recomputed
from the DISPLAYED stream-table text, and label/symbol extents come from the
rendered page in headless Chromium.

usage: python verify.py out/PFD-201-r1.svg out/PFD-202-r1.svg  [--json report.json]
Exit status 1 on any hard failure.
"""
import json, math, pathlib, re, sys, itertools
import xml.etree.ElementTree as ET

import symbols_ext as LIB

HERE = pathlib.Path(__file__).parent
TOPO = json.loads((HERE / "topology.json").read_text())
NS = "{http://www.w3.org/2000/svg}"
PX_MM = 0.25
MIN_CLEAR = 40.0      # R5: clear spacing must EXCEED 10 mm (40 px)
JOG = 40.0            # R3: two bends closer than 4 M = 10 mm form a jog
APPROACH = 20.0       # R10: final straight >= 2 M = 5 mm
ATOMS = {"H2": (0, 2), "CH4": (1, 4), "B": (6, 6), "T": (7, 8), "D": (12, 10)}
EPS = 0.6

HORIZONTAL_PORT_WORDS = ("left", "right", "inlet", "outlet", "suction", "discharge", "side", "coil")
VERTICAL_PORT_WORDS = ("top", "bottom", "overhead", "bottoms", "fuel")


def native_axis(key, port):
    """Unit vector of the port's approach axis in native coordinates."""
    if port in ("top", "bottom", "overhead", "bottoms", "fuel"):
        return (0, 1)
    return (1, 0)


def parse_points(d):
    nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", d)]
    return list(zip(nums[0::2], nums[1::2]))


def load_svg(path):
    root = ET.parse(path).getroot()
    sheet = int(root.get("data-sheet"))
    nodes, streams, junctions, markers, cells, arrows = {}, [], {}, {}, {}, []
    for el in root.iter():
        tag = el.tag.replace(NS, "")
        if tag == "g" and el.get("data-node") and el.get("data-m"):
            m = tuple(float(v) for v in el.get("data-m").split())
            nodes[el.get("data-node")] = dict(key=el.get("data-key"), m=m)
        elif tag == "path" and el.get("data-stream"):
            streams.append(dict(n=int(el.get("data-stream")), pts=parse_points(el.get("d")),
                                w=float(el.get("stroke-width"))))
        elif tag == "circle" and el.get("data-junction"):
            junctions[el.get("data-junction")] = (float(el.get("cx")), float(el.get("cy")))
        elif tag == "g" and el.get("data-marker"):
            poly = el.find(NS + "polygon")
            pts = parse_points(poly.get("points"))
            cx = sum(p[0] for p in pts) / 4; cy = sum(p[1] for p in pts) / 4
            markers.setdefault(int(el.get("data-marker")), []).append((cx, cy))
        elif tag == "text" and el.get("data-cell"):
            n, k = el.get("data-cell").split("|")
            cells.setdefault(int(n), {})
            assert k not in cells[int(n)], f"duplicate table cell {n}|{k}"
            cells[int(n)][k] = el.text
        elif tag == "polygon" and el.get("class") == "arrow":
            arrows.append(parse_points(el.get("points")))
    return dict(sheet=sheet, nodes=nodes, streams=streams, junctions=junctions,
                markers=markers, cells=cells, arrows=arrows)


def tf(m, p):
    a, b, c, d, e, f = m
    return (a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f)


def port_table(S):
    """All sheet port positions: (node, port) -> (point, axis unit vector)."""
    out = {}
    for node, nd in S["nodes"].items():
        a, b, c, d, e, f = nd["m"]
        for port, p in LIB.get_ports(nd["key"]).items():
            ax = native_axis(nd["key"], port)
            v = (a * ax[0] + c * ax[1], b * ax[0] + d * ax[1])
            nv = math.hypot(*v)
            out[(node, port)] = (tf(nd["m"], p), (round(v[0] / nv), round(v[1] / nv)))
    for j, p in S["junctions"].items():
        out[(j, "j")] = (p, None)
    return out


def identify(S, ports, p):
    hits = [k for k, (q, _) in ports.items() if abs(q[0] - p[0]) < EPS and abs(q[1] - p[1]) < EPS]
    if hits:
        return hits
    for node, nd in S["nodes"].items():          # column side entries (Annex A.9)
        if nd["key"] != "scds_1":
            continue
        xl, yt = tf(nd["m"], (530, 235)); xr, yb = tf(nd["m"], (590, 490))
        if yt < p[1] < yb:
            if abs(p[0] - xl) < EPS:
                return [(node, "side_left")]
            if abs(p[0] - xr) < EPS:
                return [(node, "side_right")]
    return []


def segs(pts):
    return list(zip(pts, pts[1:]))


def is_h(s):
    return abs(s[0][1] - s[1][1]) < 1e-6


def proper_cross(s1, s2):
    """Strict interior crossing of an H and a V segment."""
    h, v = (s1, s2) if is_h(s1) else (s2, s1)
    if is_h(v) or not is_h(h):
        return None
    x = v[0][0]; y = h[0][1]
    hx0, hx1 = sorted((h[0][0], h[1][0])); vy0, vy1 = sorted((v[0][1], v[1][1]))
    if hx0 + EPS < x < hx1 - EPS and vy0 + EPS < y < vy1 - EPS:
        return (x, y)
    return None


def touches_interior(p, s):
    """Point p lies on segment s, away from its end points."""
    (x0, y0), (x1, y1) = s
    if is_h(s):
        return abs(p[1] - y0) < EPS and min(x0, x1) + EPS < p[0] < max(x0, x1) - EPS
    return abs(p[0] - x0) < EPS and min(y0, y1) + EPS < p[1] < max(y0, y1) - EPS


def check_sheet(S, fails, info):
    sh = S["sheet"]
    tag = f"[sheet {sh}]"
    ports = port_table(S)
    expected = {tuple(e) for e in TOPO["sheet_edges"][str(sh)]}
    # ---------------- A1/A2 topology from geometry
    derived = set()
    for st in S["streams"]:
        pts = st["pts"]
        for s in segs(pts):
            if (abs(s[0][0] - s[1][0]) > 1e-6) == (abs(s[0][1] - s[1][1]) > 1e-6):
                fails.append(f"{tag} R1 stream {st['n']}: non-orthogonal or zero-length segment {s}")
        a = identify(S, ports, pts[0]); b = identify(S, ports, pts[-1])
        if len(a) != 1 or len(b) != 1:
            fails.append(f"{tag} A1 stream {st['n']}: end points not on exactly one port: {a} / {b}")
            continue
        derived.add((st["n"], a[0][0], a[0][1], b[0][0], b[0][1]))
        st["src"], st["dst"] = a[0], b[0]
    if derived != expected:
        for e in sorted(expected - derived):
            fails.append(f"{tag} A1 missing edge {e}")
        for e in sorted(derived - expected):
            fails.append(f"{tag} A1 extra/misconnected edge {e}")
    info["edges_compared"] = len(expected)
    # junction dots exactly at drawn junctions, none elsewhere
    jn = {e[1] for e in expected if e[2] == "j"} | {e[3] for e in expected if e[4] == "j"}
    if set(S["junctions"]) != jn:
        fails.append(f"{tag} R7 junction dots {sorted(S['junctions'])} != junction nodes {sorted(jn)}")
    for j, p in S["junctions"].items():
        deg = sum(1 for st in S["streams"] for q in (st["pts"][0], st["pts"][-1]) if math.dist(p, q) < EPS)
        if deg < 3:
            fails.append(f"{tag} R7 junction {j} joins only {deg} stream ends")
    # ---------------- R10 port approach + R8 inlet arrows
    for st in S["streams"]:
        if "src" not in st:
            continue
        for end, node_port, seg in (("start", st["src"], (st["pts"][0], st["pts"][1])),
                                    ("end", st["dst"], (st["pts"][-1], st["pts"][-2]))):
            if node_port[1] == "j":
                continue
            L = math.dist(*seg)
            ax = ports.get(node_port, (None, (1, 0)))[1] if not node_port[1].startswith("side_") else (1, 0)
            seg_ax = (0, 1) if not is_h(seg) else (1, 0)
            if abs(ax[0]) != seg_ax[0] or abs(ax[1]) != seg_ax[1]:
                fails.append(f"{tag} R10 stream {st['n']} {end}: meets {node_port} off the port axis")
            if L < APPROACH - 1e-6:
                fails.append(f"{tag} R10 stream {st['n']} {end}: final straight {L:.0f} px < {APPROACH:.0f} px")
        # arrowhead on the last segment pointing toward the destination
        (x1, y1), (x2, y2) = st["pts"][-2], st["pts"][-1]
        dirv = ((x2 > x1) - (x2 < x1), (y2 > y1) - (y2 < y1))
        ok = False
        for ar in S["arrows"]:
            tip = ar[0]; base = ((ar[1][0] + ar[2][0]) / 2, (ar[1][1] + ar[2][1]) / 2)
            v = (tip[0] - base[0], tip[1] - base[1]); nv = math.hypot(*v)
            if nv == 0:
                continue
            if (round(v[0] / nv), round(v[1] / nv)) == dirv and touches_interior(tip, ((x1, y1), (x2, y2))) or \
               (round(v[0] / nv), round(v[1] / nv)) == dirv and math.dist(tip, (x2, y2)) < 1.5:
                ok = True
        if not ok and st["dst"][1] != "j":
            fails.append(f"{tag} R8 stream {st['n']}: no arrowhead on its final segment toward {st['dst']}")
    # ---------------- quality scores
    allseg = [(st["n"], s, st["w"]) for st in S["streams"] for s in segs(st["pts"])]
    crossings = []
    for (n1, s1, _), (n2, s2, _) in itertools.combinations(allseg, 2):
        if n1 == n2:
            continue
        p = proper_cross(s1, s2)
        if p:
            crossings.append((n1, n2, p))
    for st in S["streams"]:       # an end point landing mid-segment of another stream (undotted tee)
        for q in (st["pts"][0], st["pts"][-1]):
            for n2, s2, _ in allseg:
                if n2 != st["n"] and touches_interior(q, s2) and not any(math.dist(q, j) < EPS for j in S["junctions"].values()):
                    fails.append(f"{tag} R7 stream {st['n']} ends on stream {n2} without a junction")
    bends = {}
    for st in S["streams"]:
        b = len(st["pts"]) - 2
        bends[st["n"]] = bends.get(st["n"], 0) + b
        inner = segs(st["pts"])[1:-1]
        for s in inner:
            if math.dist(*s) < JOG:
                fails.append(f"{tag} R3 stream {st['n']}: jog (segment of {math.dist(*s):.0f} px between two bends)")
    bmax = max(bends.values())
    if bmax > 2:
        fails.append(f"{tag} R3 bmax = {bmax} > 2 ({ {n: b for n, b in bends.items() if b > 2} })")
    # parallel clear spacing
    smin, smin_pair = 1e9, None
    for (n1, s1, w1), (n2, s2, w2) in itertools.combinations(allseg, 2):
        if n1 == n2 or is_h(s1) != is_h(s2):
            continue
        shared = any(math.dist(p, q) < EPS for p in s1 for q in s2)
        if shared:
            continue
        k = 0 if is_h(s1) else 1   # along-axis coordinate index
        a0, a1 = sorted((s1[0][k], s1[1][k])); b0, b1 = sorted((s2[0][k], s2[1][k]))
        if min(a1, b1) - max(a0, b0) <= EPS:
            continue
        gap = abs(s1[0][1 - k] - s2[0][1 - k]) - (w1 + w2) / 2
        if gap < smin:
            smin, smin_pair = gap, (n1, n2)
        if gap <= MIN_CLEAR:
            fails.append(f"{tag} R5 streams {n1} and {n2}: parallel clear spacing {gap:.0f} px = {gap * PX_MM:.1f} mm, not more than 10 mm")
    Lt = sum(math.dist(*s) for _, s, _ in allseg)
    # ---------------- A4 identity
    nums = {e[0] for e in expected}
    if set(S["markers"]) != nums:
        fails.append(f"{tag} A4 markers {sorted(set(S['markers']) ^ nums)} differ from the sheet's streams")
    if set(S["cells"]) != nums:
        fails.append(f"{tag} A4 table rows {sorted(set(S['cells']) ^ nums)} differ from the sheet's streams")
    for n, plist in S["markers"].items():
        for p in plist:
            on = [s for st in S["streams"] if st["n"] == n for s in segs(st["pts"]) if is_h(s) and touches_interior(p, s)]
            if not on:
                fails.append(f"{tag} L4 marker {n} at {p} is not on a horizontal segment of stream {n}")
    info.update(Nc=len(crossings), crossings=crossings, Nb=sum(bends.values()), bmax=bmax,
                bends={n: bends[n] for n in sorted(bends)}, Lt_mm=round(Lt * PX_MM), smin_mm=round(smin * PX_MM, 1),
                smin_pair=smin_pair)
    return ports


def balances(sheets, fails, info):
    """A5 from displayed table text, in integer tenths."""
    tab = {}
    for S in sheets:
        for n, row in S["cells"].items():
            vals = {c: int(round(float(row[c]) * 10)) for c in ATOMS}
            tot = int(round(float(row["total"]) * 10))
            if sum(vals.values()) != tot:
                fails.append(f"A5 stream {n}: displayed total {tot / 10} != sum of components {sum(vals.values()) / 10}")
            if n in tab and tab[n] != vals:
                fails.append(f"A5/R9 stream {n}: values differ between sheets")
            tab[n] = vals
    E = {int(k): dict(v) for k, v in TOPO["edges"].items()}
    for k, c in TOPO["continuations"].items():   # join a continued stream across sheets
        ends = [c["sheet1"], c["sheet2"]]
        E[int(k)]["src"] = next(e[0] for e in ends if not e[0].startswith("IN"))
        E[int(k)]["dst"] = next(e[2] for e in ends if not e[2].startswith("OUT"))
    units = sorted({e["src"] for e in E.values()} | {e["dst"] for e in E.values()})
    checked = []
    for u in units:
        if TOPO["nodes"][u]["kind"] == "terminal":
            continue
        ins = [n for n, e in E.items() if e["dst"] == u]
        outs = [n for n, e in E.items() if e["src"] == u]
        missing = [n for n in ins + outs if n not in tab]
        if missing:
            fails.append(f"A4/A5 {u}: balance not checkable, stream-table rows missing for {missing}")
            continue
        if u == "R-201":
            for i, el in enumerate(("C", "H")):
                a = sum(tab[n][c] * ATOMS[c][i] for n in ins for c in ATOMS)
                b = sum(tab[n][c] * ATOMS[c][i] for n in outs for c in ATOMS)
                if a != b:
                    fails.append(f"A5 R-201 {el}-atom balance {a / 10} != {b / 10}")
            a = sum(sum(tab[n].values()) for n in ins); b = sum(sum(tab[n].values()) for n in outs)
            if a != b:
                fails.append(f"A5 R-201 total moles {a / 10} != {b / 10} (both reactions conserve moles)")
        else:
            for c in ATOMS:
                a = sum(tab[n][c] for n in ins); b = sum(tab[n][c] for n in outs)
                if a != b:
                    fails.append(f"A5 {u} {c}: in {a / 10} != out {b / 10}")
        checked.append(u)
    if any(n not in tab for n in E):
        info["balances_checked"] = checked
        return
    feeds = [n for n, e in E.items() if TOPO["nodes"][e["src"]]["kind"] == "terminal" and not e["src"].startswith("IN")]
    prods = [n for n, e in E.items() if TOPO["nodes"][e["dst"]]["kind"] == "terminal" and not e["dst"].startswith("OUT")]
    for i, el in enumerate(("C", "H")):
        a = sum(tab[n][c] * ATOMS[c][i] for n in feeds for c in ATOMS)
        b = sum(tab[n][c] * ATOMS[c][i] for n in prods for c in ATOMS)
        if a != b:
            fails.append(f"A5 overall {el}-atom balance {a / 10} != {b / 10}")
    info["balances_checked"] = checked + ["overall (C and H atoms)"]
    info["overall"] = dict(feeds=feeds, products=prods)


def rendered_checks(path, S, fails, info):
    """Label overlaps, transits and sheet-area checks on the rendered SVG."""
    from playwright.sync_api import sync_playwright
    js = r"""() => {
      const R = e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const q = s => Array.from(document.querySelectorAll(s));
      return {
        symbols: q('g[data-node]').map(e => [e.getAttribute('data-node'), R(e)]),
        labels: q('text.lbl').map(e => [e.textContent, R(e)]),
        markers: q('g[data-marker]').map(e => [e.getAttribute('data-marker'), R(e)]),
        instruments: q('g.instrument').map(e => ['instrument', R(e)]),
        blocks: q('g.table, g.titleblock, g.notes').map(e => [e.getAttribute('class'), R(e)]),
        arrows: q('polygon.arrow').map(e => R(e)),
        utilities: q('line.utility').map(e => [e.getAttribute('data-node'), [+e.getAttribute('x1'), +e.getAttribute('y1'), +e.getAttribute('x2'), +e.getAttribute('y2')]]),
        signals: q('path.signal').map(e => e.getAttribute('d')),
      };
    }"""
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        pg = br.new_page(viewport={"width": 1680, "height": 1190})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(pathlib.Path(path).resolve().as_uri())
        g = pg.evaluate(js)
        br.close()
    if errs:
        fails.append(f"console errors: {errs}")
    tag = f"[sheet {S['sheet']}]"

    def ov(a, b, pad=1.0):
        return a[0] < b[2] + pad and b[0] < a[2] + pad and a[1] < b[3] + pad and b[1] < a[3] + pad

    def seg_box(s, w):
        (x0, y0), (x1, y1) = s
        return [min(x0, x1) - w / 2, min(y0, y1) - w / 2, max(x0, x1) + w / 2, max(y0, y1) + w / 2]

    def shrink(b, k):
        return [b[0] + k, b[1] + k, b[2] - k, b[3] - k]
    labels = [("label", t, b) for t, b in g["labels"]] + [("marker", m, b) for m, b in g["markers"]] + \
             [("instrument", t, b) for t, b in g["instruments"]]
    syms = {n: b for n, b in g["symbols"]}
    lines = [(st["n"], s, st["w"]) for st in S["streams"] for s in segs(st["pts"])]
    for u, (x1, y1, x2, y2) in g["utilities"]:
        lines.append((f"utility {u}", ((x1, y1), (x2, y2)), 2.0))
    for d in g["signals"]:
        for s in segs(parse_points(d)):
            lines.append(("signal", s, 1.0))
    # label vs label
    for (k1, t1, b1), (k2, t2, b2) in itertools.combinations(labels, 2):
        if ov(b1, b2):
            fails.append(f"{tag} L3 overlap: {k1} '{t1}' and {k2} '{t2}'")
    # label vs lines (a marker sits on its own stream by design)
    for k, t, b in labels:
        for n, s, w in lines:
            if k == "marker" and str(n) == str(t):
                continue
            if k == "instrument" and n == "signal":
                continue
            if ov(b, seg_box(s, w), pad=0.5):
                fails.append(f"{tag} L3 {k} '{t}' overlaps line of {n}")
        for n, sb in syms.items():
            if ov(b, shrink(sb, 1), pad=0.5):
                fails.append(f"{tag} L3 {k} '{t}' overlaps symbol {n}")
        for a in g["arrows"]:
            if k != "marker" and ov(b, a, pad=0.5):
                fails.append(f"{tag} L3 {k} '{t}' overlaps an arrowhead")
        for kb, bb in g["blocks"]:
            if ov(b, bb):
                fails.append(f"{tag} D4 {k} '{t}' overlaps {kb}")
    # marker vs arrowheads and bends: clear of arrows
    for m, b in g["markers"]:
        for a in g["arrows"]:
            if ov(b, a, pad=1.0):
                fails.append(f"{tag} L4 marker {m} touches an arrowhead")
    # R4 transit: stream segments through symbols other than their own end nodes
    for st in S["streams"]:
        ends = {st.get("src", (None,))[0], st.get("dst", (None,))[0]}
        for s in segs(st["pts"]):
            for n, sb in syms.items():
                if n in ends:
                    continue
                if ov(seg_box(s, 0), shrink(sb, 2), pad=0):
                    fails.append(f"{tag} R4 stream {st['n']} transits symbol {n}")
            for kb, bb in g["blocks"]:
                if ov(seg_box(s, st["w"]), bb, pad=0):
                    fails.append(f"{tag} R4 stream {st['n']} transits the {kb}")
    # symbols vs symbols, and vs blocks
    for (n1, b1), (n2, b2) in itertools.combinations(syms.items(), 2):
        if ov(shrink(b1, 1), shrink(b2, 1), pad=0):
            fails.append(f"{tag} symbols {n1} and {n2} overlap")
    for n, b in syms.items():
        for kb, bb in g["blocks"]:
            if ov(b, bb):
                fails.append(f"{tag} D4 symbol {n} overlaps {kb}")
        if not (20 < b[0] and b[2] < 1660 and 20 < b[1] and b[3] < 1170):
            fails.append(f"{tag} symbol {n} outside the frame")
    for (k1, b1), (k2, b2) in itertools.combinations(g["blocks"], 2):
        if ov(b1, b2):
            fails.append(f"{tag} D4 {k1} overlaps {k2}")
    info["rendered_items"] = dict(labels=len(g["labels"]), markers=len(g["markers"]), symbols=len(syms))


def main(argv):
    paths = [a for a in argv if a.endswith(".svg")]
    out_json = argv[argv.index("--json") + 1] if "--json" in argv else None
    fails, report = [], {}
    sheets = []
    for p in paths:
        S = load_svg(p)
        info = {}
        check_sheet(S, fails, info)
        rendered_checks(p, S, fails, info)
        report[f"sheet {S['sheet']}"] = info
        sheets.append(S)
    if len(sheets) == 2:
        balances(sheets, fails, report)
        # R9: continuation heights equal on both sheets
        for n, c in TOPO["continuations"].items():
            ys = []
            for S in sheets:
                for st in S["streams"]:
                    if st["n"] == int(n):
                        term = [p for p in (st["pts"][0], st["pts"][-1])]
                        ys.append(term)
            info_y = {}
            for S in sheets:
                ports = port_table(S)
                for (node, port), (pt, _) in ports.items():
                    if node in (c["sheet1"][0], c["sheet1"][2], c["sheet2"][0], c["sheet2"][2]) and node.startswith(("IN", "OUT")):
                        info_y[node] = pt[1]
            if len(set(round(v, 1) for v in info_y.values())) != 1:
                fails.append(f"R9 stream {n}: continuation heights differ {info_y}")
    report["hard_failures"] = fails
    for k, v in report.items():
        if k.startswith("sheet"):
            print(f"{k}: Nc={v['Nc']} Nb={v['Nb']} bmax={v['bmax']} Lt={v['Lt_mm']} mm smin={v['smin_mm']} mm "
                  f"(pair {v['smin_pair']}); edges compared {v['edges_compared']}; {v['rendered_items']}")
            for c in v["crossings"]:
                print("   crossing:", c)
    if "balances_checked" in report:
        print("balances closed on displayed values:", ", ".join(report["balances_checked"]) if not any(f.startswith("A5") for f in fails) else "SEE FAILURES")
    print(f"HARD FAILURES: {len(fails)}")
    for f in fails:
        print("  -", f)
    if out_json:
        pathlib.Path(out_json).write_text(json.dumps(report, indent=1, default=str))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
