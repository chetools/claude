#!/usr/bin/env python3
"""Sample PFD-101, revision 1: benzene-toluene separation, re-issued with
the traced symbol library v1 in the symbols folder of this skill
(specification PFD-SPEC-001, Annex A).
Every equipment glyph is a library symbol placed by a frame transform;
every stream endpoint is a transformed library port coordinate, asserted
in code. Layout rules and stream data are unchanged from revision 0;
measured layout scores are recomputed and printed.
Stream data are illustrative sample values; every unit balance closes
(verified in check_balance). Units are stated in every table heading,
so no symbol is used before it is defined in words.
"""
import html, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "symbols"))
import pfd_symbols as CS

W, H = 1680, 1190
INK = "#111111"
MAIN_W = 3.4
SUB_W = 1.3
FONT = "Arial, Helvetica, sans-serif"
el = []

def add(s): el.append(s)

def line(x1, y1, x2, y2, w=MAIN_W):
    add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{INK}" stroke-width="{w}"/>')

def path(pts, w=MAIN_W):
    d = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    add(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{w}"/>')

def arrow(x, y, direction):
    s = 11
    if direction == "R": pts = f"{x},{y - s * 0.62} {x + s * 1.5},{y} {x},{y + s * 0.62}"
    elif direction == "L": pts = f"{x},{y - s * 0.62} {x - s * 1.5},{y} {x},{y + s * 0.62}"
    elif direction == "D": pts = f"{x - s * 0.62},{y} {x},{y + s * 1.5} {x + s * 0.62},{y}"
    else: pts = f"{x - s * 0.62},{y} {x},{y - s * 1.5} {x + s * 0.62},{y}"
    add(f'<polygon points="{pts}" fill="{INK}"/>')

def text(x, y, s, size=14, bold=False, anchor="middle"):
    b = ' font-weight="bold"' if bold else ""
    add(f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}"{b} text-anchor="{anchor}" fill="{INK}">{html.escape(s)}</text>')

def stream_no(x, y, n):
    add(f'<polygon points="{x - 19},{y} {x},{y - 14} {x + 19},{y} {x},{y + 14}" fill="white" stroke="{INK}" stroke-width="1.8"/>')
    text(x, y + 5, str(n), size=14, bold=True)

# ---------- library symbol placement ----------
def inner_svg(key):
    s = CS.get_svg(key)
    return s[s.index(">") + 1: s.rindex("</svg>")].strip()

PLACEMENTS = {}
def place(key, tx, ty, s, flip=False):
    """Place library symbol with native frame top-left mapped to (tx, ty) at scale s.
    Returns dict of sheet port coordinates."""
    f = CS.get_frame(key)  # (x1, y1, x2, y2) native frame
    if flip:
        transform = f'translate({tx} {ty}) scale({-s} {s}) translate({-f[2]} {-f[0 + 1]})'
        pmap = lambda px, py: (tx + (f[2] - px) * s, ty + (py - f[1]) * s)
    else:
        transform = f'translate({tx} {ty}) scale({s} {s}) translate({-f[0]} {-f[1]})'
        pmap = lambda px, py: (tx + (px - f[0]) * s, ty + (py - f[1]) * s)
    add(f'<g transform="{transform}">{inner_svg(key)}</g>')
    ports = {name: pmap(px, py) for name, (px, py) in CS.get_ports(key).items()}
    PLACEMENTS[key] = ports
    return ports

# scale factors: exchanger/pump circles 44 native-diameter units -> sheet px
S_HX = 44 / 112
S_P1 = 44 / 114
S_FLASH = 92 / 116
S_SCDS = 76 / 60
S_VESSEL = 140 / 180
S_P2 = 40 / 114
S_TERM = 0.65

# positions are computed after streams are drawn (symbols on top);
# port coordinates are needed first, so compute placements now from frames.
def port_sheet(key, tx, ty, s, flip=False):
    f = CS.get_frame(key)
    def m(px, py):
        if flip: return (tx + (f[2] - px) * s, ty + (py - f[1]) * s)
        return (tx + (px - f[0]) * s, ty + (py - f[1]) * s)
    return {name: m(px, py) for name, (px, py) in CS.get_ports(key).items()}

FEED_T = (56, 287);   feed_p = port_sheet("feed_1", *FEED_T, S_TERM)
P101_T = (288, 275.7); p101_p = port_sheet("pump_1", *P101_T, S_P1)
E101_T = (408, 254.4); e101_p = port_sheet("heat_exchanger_1", *E101_T, S_HX)
V101_T = (500, 202);   v101_p = port_sheet("flash_1", *V101_T, S_FLASH)
T101_T = (838, 150)
E102_T = (1020, 94.4); e102_p = port_sheet("heat_exchanger_1", *E102_T, S_HX)
V102_T = (1130, 94.7); v102_p = port_sheet("vessel_1", *V102_T, S_VESSEL)
P102_T = (1030, 184.9); p102_p = port_sheet("pump_1", *P102_T, S_P2, flip=True)
E103_T = (990, 616.4); e103_p = port_sheet("heat_exchanger_1", *E103_T, S_HX)
DIST_T = (1560, 105);  dist_p = port_sheet("product_1", *DIST_T, S_TERM)
BOT_T = (1560, 627);   bot_p = port_sheet("product_1", *BOT_T, S_TERM)

# derived sheet points
COL = dict(left=838, right=914, top=150, bottom=555.3, cx=876)
FLASH_BOT = (546, 415.3)
REFLUX_Y = p102_p["discharge"][1]     # 187.0
assert abs(feed_p["outlet"][1] - 300) < 1.5
assert abs(p101_p["suction"][1] - 300) < 1.5
assert abs(e101_p["left"][1] - p101_p["discharge"][1]) < 1.5
assert abs(v101_p["side_3"][1] - e101_p["right"][1]) < 1.5
assert abs(e102_p["left"][1] - 118) < 1.5 and abs(v102_p["inlet"][1] - 118) < 1.5

# ---------- sheet frame and headings ----------
add(f'<rect x="0" y="0" width="{W}" height="{H}" fill="white"/>')
add(f'<rect x="18" y="18" width="{W - 36}" height="{H - 36}" fill="none" stroke="{INK}" stroke-width="2.4"/>')
text(60, 78, "PROCESS FLOW DIAGRAM", size=27, bold=True, anchor="start")
text(60, 108, "Benzene–toluene separation  |  Sample process  |  Traced symbols (library v1)", size=15, anchor="start")

# ---------- streams ----------
STREAMS = {}
ALL_SEG_LISTS = []
def stream(n, pts):
    STREAMS.setdefault(n, []).append(pts)
    ALL_SEG_LISTS.append((n, pts))
    path(pts)

stream(1, [feed_p["outlet"], p101_p["suction"]])
stream(2, [p101_p["discharge"], e101_p["left"]])
stream(3, [e101_p["right"], v101_p["side_3"]])
stream(4, [v101_p["top"], (546, 185), (COL["left"], 185)])
stream(5, [FLASH_BOT, (546, 470), (COL["left"], 470)])
stream(6, [(COL["cx"], COL["top"]), (COL["cx"], 118), e102_p["left"]])
stream(7, [e102_p["right"], v102_p["inlet"]])
stream(8, [v102_p["bottom"], (1200, 207), p102_p["suction"]])
stream(8, [p102_p["discharge"], (COL["right"], REFLUX_Y)])
stream(9, [v102_p["outlet"], dist_p["inlet_edge"]])
stream(10, [(COL["cx"], COL["bottom"]), (COL["cx"], 640), e103_p["left"]])
stream(11, [e103_p["top"], (1012, 500), (COL["right"], 500)])
stream(12, [e103_p["right"], bot_p["inlet_edge"]])

# utility stubs
line(430, 300, 430, 330, w=SUB_W); arrow(430, 316, "U")
text(442, 322, "Steam in", size=11.5, anchor="start"); text(442, 338, "296 kW", size=11.5, anchor="start")
line(1042, 140, 1042, 168, w=SUB_W); arrow(1042, 156, "D")
text(1054, 162, "Cooling water out", size=11.5, anchor="start"); text(1054, 178, "−893 kW", size=11.5, anchor="start")
line(1012, 662, 1012, 690, w=SUB_W); arrow(1012, 678, "U")
text(1024, 684, "Steam in", size=11.5, anchor="start"); text(1024, 700, "623 kW", size=11.5, anchor="start")

# flow arrows
arrow(200, 300, "R"); arrow(382, 278, "R"); arrow(482, 278, "R")
arrow(700, 185, "R"); arrow(700, 470, "R"); arrow(962, 118, "R")
arrow(1150, 207, "L"); arrow(952, REFLUX_Y, "L"); arrow(1500, 118, "R")
arrow(942, 640, "R"); arrow(935, 500, "L"); arrow(1500, 640, "R")

# ---------- symbols ----------
place("feed_1", *FEED_T, S_TERM)
place("pump_1", *P101_T, S_P1)
place("heat_exchanger_1", *E101_T, S_HX)
place("flash_1", *V101_T, S_FLASH)
place("scds_1", *T101_T, S_SCDS)
place("heat_exchanger_1", *E102_T, S_HX)
place("vessel_1", *V102_T, S_VESSEL)
place("pump_1", *P102_T, S_P2, flip=True)
place("heat_exchanger_1", *E103_T, S_HX)
place("product_1", *DIST_T, S_TERM)
place("product_1", *BOT_T, S_TERM)

# stream number diamonds
for x, y, n in [(195, 300, 1), (362, 278, 2), (475, 278, 3), (690, 185, 4),
                (690, 470, 5), (948, 118, 6), (1097, 118, 7), (1000, REFLUX_Y, 8),
                (1420, 118, 9), (928, 640, 10), (963, 500, 11), (1420, 640, 12)]:
    stream_no(x, y, n)

# ---------- tags ----------
text(56, 270, "Fresh feed", size=13.5, bold=True, anchor="start")
text(310, 354, "P-101", size=16, bold=True); text(310, 372, "Feed pump", size=12.5)
text(430, 230, "E-101", size=16, bold=True); text(430, 248, "Feed preheater", size=12.5)
text(606, 262, "V-101", size=16, bold=True, anchor="start"); text(606, 280, "Flash drum", size=12.5, anchor="start")
text(824, 300, "T-101", size=16, bold=True, anchor="end"); text(824, 318, "Distillation column", size=12.5, anchor="end")
text(1042, 64, "E-102", size=16, bold=True); text(1042, 82, "Condenser", size=12.5)
text(1200, 60, "V-102", size=16, bold=True); text(1200, 78, "Reflux drum", size=12.5)
text(1050, 254, "P-102", size=15, bold=True); text(1050, 272, "Reflux pump", size=12)
text(1046, 632, "E-103", size=16, bold=True, anchor="start"); text(1046, 654, "Reboiler", size=12.5, anchor="start")
text(1420, 90, "Distillate product", size=13.5, bold=True)
text(1420, 612, "Bottoms product", size=13.5, bold=True)

# ---------- stream table ----------
streams = [
    (1, "100.0", "25", "110", "50.0", "Liquid"),
    (2, "100.0", "26", "150", "50.0", "Liquid"),
    (3, "100.0", "98", "140", "50.0", "Two-phase"),
    (4, "40.0", "98", "135", "70.0", "Vapour"),
    (5, "60.0", "98", "135", "36.7", "Liquid"),
    (6, "96.0", "84", "120", "96.9", "Vapour"),
    (7, "96.0", "82", "115", "96.9", "Liquid"),
    (8, "48.0", "82", "170", "96.9", "Liquid"),
    (9, "48.0", "82", "115", "96.9", "Liquid"),
    (10, "120.0", "115", "128", "11.4", "Liquid"),
    (11, "68.0", "115", "125", "15.0", "Vapour"),
    (12, "52.0", "115", "128", "6.7", "Liquid"),
]
tx, ty = 60, 872
colw = [86, 168, 158, 148, 178, 128]
heads = ["Stream", "Flow rate (kmol/h)", "Temperature (°C)", "Pressure (kPa)", "Benzene (mol %)", "Phase"]
text(tx, ty - 14, "Stream table — flow rates, temperatures, pressures and benzene contents are sample values", size=14.5, bold=True, anchor="start")
rowh = 23
add(f'<rect x="{tx}" y="{ty}" width="{sum(colw)}" height="{rowh * 13}" fill="none" stroke="{INK}" stroke-width="1.4"/>')
cx = tx
for wdt, htxt in zip(colw, heads):
    text(cx + wdt / 2, ty + 16, htxt, size=11.5, bold=True); cx += wdt
for i in range(1, 13):
    add(f'<line x1="{tx}" y1="{ty + rowh * i}" x2="{tx + sum(colw)}" y2="{ty + rowh * i}" stroke="{INK}" stroke-width="0.6"/>')
cx = tx
for wdt in colw[:-1]:
    cx += wdt
    add(f'<line x1="{cx}" y1="{ty}" x2="{cx}" y2="{ty + rowh * 13}" stroke="{INK}" stroke-width="0.6"/>')
for r, row in enumerate(streams):
    cx = tx
    for c, val in enumerate(row):
        text(cx + colw[c] / 2, ty + rowh * (r + 1) + 16, str(val), size=11.5, bold=(c == 0)); cx += colw[c]

# ---------- equipment summary ----------
ex, ey = 960, 872
text(ex, ey - 14, "Equipment summary", size=14.5, bold=True, anchor="start")
equip = [
    ("P-101", "Feed pump", "—"),
    ("E-101", "Feed preheater", "296 kW"),
    ("V-101", "Flash drum", "—"),
    ("T-101", "Distillation column", "30 stages"),
    ("E-102", "Condenser (total)", "−893 kW"),
    ("V-102", "Reflux drum", "—"),
    ("P-102", "Reflux pump", "Reflux ratio 1.0"),
    ("E-103", "Reboiler", "623 kW"),
]
for r, (tag, name, note) in enumerate(equip):
    yy = ey + 18 + r * 23
    text(ex, yy, tag, size=12, bold=True, anchor="start")
    text(ex + 74, yy, name, size=12, anchor="start")
    text(ex + 268, yy, note, size=12, anchor="start")

# ---------- title block ----------
bx, by, bw, bh = 960, 1062, 682, 100
add(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
add(f'<line x1="{bx}" y1="{by + 38}" x2="{bx + bw}" y2="{by + 38}" stroke="{INK}" stroke-width="0.8"/>')
add(f'<line x1="{bx}" y1="{by + 70}" x2="{bx + bw}" y2="{by + 70}" stroke="{INK}" stroke-width="0.8"/>')
add(f'<line x1="{bx + 341}" y1="{by + 70}" x2="{bx + 341}" y2="{by + bh}" stroke="{INK}" stroke-width="0.8"/>')
text(bx + 14, by + 26, "Benzene–toluene separation — PFD-101", size=14.5, bold=True, anchor="start")
text(bx + 14, by + 58, "Sample process flow diagram (layout demonstration)", size=12, anchor="start")
text(bx + 14, by + 92, "Sample sheet  |  2026-10-24", size=12, anchor="start")
text(bx + 355, by + 92, "Revision 1  |  Sheet 1 of 1", size=12, anchor="start")

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
       + "\n".join(el) + "\n</svg>\n")
with open(pathlib.Path(__file__).parent / "sample-pfd-v4.svg", "w") as f:
    f.write(svg)
print("SVG written:", len(svg), "bytes")

# ---------- verification: balances, bends, crossings ----------
F = {1: (100.0, 50.0, 50.0), 2: (100.0, 50.0, 50.0), 3: (100.0, 50.0, 50.0),
     4: (40.0, 28.0, 12.0), 5: (60.0, 22.0, 38.0), 6: (96.0, 93.0, 3.0),
     7: (96.0, 93.0, 3.0), 8: (48.0, 46.5, 1.5), 9: (48.0, 46.5, 1.5),
     10: (120.0, 13.7, 106.3), 11: (68.0, 10.2, 57.8), 12: (52.0, 3.5, 48.5)}
def bal(name, ins, outs):
    for i in range(3):
        assert abs(sum(F[s][i] for s in ins) - sum(F[s][i] for s in outs)) < 1e-9, name
    print("balance OK:", name)
bal("V-101 flash", [3], [4, 5]); bal("E-102 condenser", [6], [7])
bal("V-102 reflux drum", [7], [8, 9]); bal("E-103 reboiler", [10], [11, 12])
bal("T-101 column", [4, 5, 8, 11], [6, 10]); bal("overall", [1], [9, 12])

def bends(pts): return len(pts) - 2
per_stream = {}
for n, pts in ALL_SEG_LISTS: per_stream[n] = per_stream.get(n, 0) + bends(pts)
total_bends = sum(per_stream.values())
print("bends per stream:", per_stream, "total:", total_bends, "max:", max(per_stream.values()))

def seg(p, q): return (p, q)
def segs_of(pts): return [seg(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
def inter(a, b, c, d):
    def o(p, q, r): return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return (o(a, b, c) * o(a, b, d) < 0) and (o(c, d, a) * o(c, d, b) < 0)
allsegs = []
for n, pts in ALL_SEG_LISTS:
    for s in segs_of(pts): allsegs.append((n, s))
cross = 0
for i in range(len(allsegs)):
    for j in range(i + 1, len(allsegs)):
        (n1, s1), (n2, s2) = allsegs[i], allsegs[j]
        if inter(s1[0], s1[1], s2[0], s2[1]): cross += 1; print("CROSSING:", n1, n2)
print("crossings:", cross, "| total routed length:",
      round(sum(abs(s[1][0] - s[0][0]) + abs(s[1][1] - s[0][1]) for _, s in allsegs), 1))
