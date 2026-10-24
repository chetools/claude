"""PFD-202 Separation section: layout script (uses pfdkit; topology frozen)."""
import json, pathlib, sys
import pfdkit as K
from pfdkit import Sheet

HERE = pathlib.Path(__file__).parent
CONT = json.loads((HERE / "continuations.json").read_text())
Y20, Y37 = CONT["20"], CONT["37"]

s = Sheet(2)
S_HX, S_PUMP, S_TERM = 44 / 112, 44 / 114, 0.6
UTIL = 34
X_TERM = 1575


def hseg(n, pts, x):
    """marker on the horizontal segment of pts containing x (y from that segment)"""
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if abs(y1 - y2) < 1e-6 and min(x1, x2) < x < max(x1, x2):
            s.marker(n, x, y1)
            return
    raise AssertionError(f"no horizontal segment at x={x} on stream {n}")


def flow(n, pts, src, dst, marker_x, arrow=True, arrow_dir=None):
    """draw stream; arrowhead at the end of the last segment (tip at the point)"""
    s.stream(n, pts, src, dst)
    hseg(n, pts, marker_x)
    if arrow:
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        d = arrow_dir or ("R" if x2 > x1 else "L" if x2 < x1 else "D" if y2 > y1 else "U")
        s.arrow(x2, y2, d)


# ------------------------------------------------------------ placement
IN21 = s.place("IN21", 100, Y20, 0.6, anchor="outlet")
E203 = s.place("E-203", 230, Y20, S_HX, anchor="left")

# ---- benzene column T-201 (scale 1.0)
S1, CX1, YT1 = 1.0, 430, 210
T1 = s.place("T-201", CX1 - 30 * S1, YT1, S1)
col1_l, col1_r = CX1 - 30 * S1, CX1 + 30 * S1
CY4 = 160
E204 = s.place("E-204", 510, CY4, S_HX, anchor="left")
V204 = s.place("V-204", E204["right"][0] + 80, CY4, 140 / 180, anchor="inlet")
YS1 = 232
P202 = s.place("P-202", V204["bottom"][0] + 100, YS1, S_PUMP, anchor="suction")
Y28 = round(P202["discharge"][1], 1)
XJ6 = round(P202["discharge"][0] + 95)
s.junction("J6", XJ6, Y28)
Y27 = 310
CY5 = 565
E205 = s.place("E-205", 520, CY5, S_HX, anchor="left")
YBU1, YF2 = 488, 470
LE = s.place("LE", X_TERM, CY4, S_TERM, anchor="inlet_edge")
BZ = s.place("BZ", X_TERM, Y28, S_TERM, anchor="inlet_edge")

# ---- toluene column T-202 (scale 0.66)
S2, CX2, CY6 = 0.66, XJ6 + 55, 282
YT2 = CY6 + 45
T2 = s.place("T-202", CX2 - 30 * S2, YT2, S2)
col2_l, col2_r = CX2 - 30 * S2, CX2 + 30 * S2
E206 = s.place("E-206", CX2 + 90, CY6, S_HX, anchor="left")
V205 = s.place("V-205", E206["right"][0] + 80, CY6, 0.6, anchor="inlet")
P203 = s.place("P-203", V205["bottom"][0] + 100, Y37 + 22, S_PUMP, anchor="suction")
assert abs(P203["discharge"][1] - Y37) < 0.6
XJ7 = round(P203["discharge"][0] + 95)
s.junction("J7", XJ7, Y37)
Y36 = 405
YBOT2 = T2["bottoms"][1]
CY7 = round(YBOT2 + 35)
E207 = s.place("E-207", CX2 + 90, CY7, S_HX, anchor="left")
YBU2, YF2b = 495, 470
OUT38 = s.place("OUT38", X_TERM, Y37, S_TERM, anchor="inlet_edge")
DP = s.place("DP", X_TERM, CY7, S_TERM, anchor="inlet_edge")

# ------------------------------------------------------------ streams
A = lambda n, nd, pt: (nd, pt)
# feed
flow(20, [IN21["outlet"], E203["left"]], ("IN21", "outlet"), ("E-203", "left"), 155)
y21 = Y20
side1 = s.column_side("T-201", "left", y21)
flow(21, [E203["right"], side1], ("E-203", "right"), ("T-201", "side_left"), 330)
# T-201 overhead train
p22 = [T1["overhead"], (CX1, CY4), E204["left"]]
flow(22, p22, ("T-201", "overhead"), ("E-204", "left"), 470)
flow(23, [E204["right"], V204["inlet"]], ("E-204", "right"), ("V-204", "inlet"),
     (E204["right"][0] + V204["inlet"][0]) / 2 - 4)
flow(24, [V204["outlet"], LE["inlet_edge"]], ("V-204", "outlet"), ("LE", "inlet_edge"), 1000)
xb = V204["bottom"][0]
p25 = [V204["bottom"], (xb, YS1), P202["suction"]]
flow(25, p25, ("V-204", "bottom"), ("P-202", "suction"), xb + 36)
p26 = [P202["discharge"], (XJ6, Y28)]
s.stream(26, p26, ("P-202", "discharge"), ("J6", "j"))
hseg(26, p26, P202["discharge"][0] + 38)
s.arrow(XJ6 - 10, Y28, "R")
side1r = s.column_side("T-201", "right", Y27)
p27 = [(XJ6, Y28), (XJ6, Y27), side1r]
flow(27, p27, ("J6", "j"), ("T-201", "side_right"), 700)
flow(28, [(XJ6, Y28), BZ["inlet_edge"]], ("J6", "j"), ("BZ", "inlet_edge"), 1250)
# T-201 base
p29 = [T1["bottoms"], (CX1, CY5), E205["left"]]
flow(29, p29, ("T-201", "bottoms"), ("E-205", "left"), 475)
xt5 = E205["top"][0]
p30 = [E205["top"], (xt5, YBU1), s.column_side("T-201", "right", YBU1)]
flow(30, p30, ("E-205", "top"), ("T-201", "side_right"), xt5 - 34)
XV = 620
side2 = s.column_side("T-202", "left", YF2b)
p31 = [E205["right"], (XV, CY5), (XV, YF2b), side2]
flow(31, p31, ("E-205", "right"), ("T-202", "side_left"), 780)
# T-202 overhead train
p32 = [T2["overhead"], (CX2, CY6), E206["left"]]
flow(32, p32, ("T-202", "overhead"), ("E-206", "left"), CX2 + 42)
flow(33, [E206["right"], V205["inlet"]], ("E-206", "right"), ("V-205", "inlet"),
     (E206["right"][0] + V205["inlet"][0]) / 2 - 4)
xb2 = V205["bottom"][0]
p34 = [V205["bottom"], (xb2, Y37 + 22), P203["suction"]]
flow(34, p34, ("V-205", "bottom"), ("P-203", "suction"), xb2 + 36)
p35 = [P203["discharge"], (XJ7, Y37)]
s.stream(35, p35, ("P-203", "discharge"), ("J7", "j"))
hseg(35, p35, P203["discharge"][0] + 38)
s.arrow(XJ7 - 10, Y37, "R")
side2r = s.column_side("T-202", "right", Y36)
flow(36, [(XJ7, Y37), (XJ7, Y36), side2r], ("J7", "j"), ("T-202", "side_right"), 1200)
flow(37, [(XJ7, Y37), OUT38["inlet_edge"]], ("J7", "j"), ("OUT38", "inlet_edge"), (XJ7 + X_TERM) / 2)
# T-202 base
p38 = [T2["bottoms"], (CX2, CY7), E207["left"]]
flow(38, p38, ("T-202", "bottoms"), ("E-207", "left"), CX2 + 45)
xt7 = E207["top"][0]
p39 = [E207["top"], (xt7, YBU2), s.column_side("T-202", "right", YBU2)]
flow(39, p39, ("E-207", "top"), ("T-202", "side_right"), xt7 - 34)
flow(40, [E207["right"], DP["inlet_edge"]], ("E-207", "right"), ("DP", "inlet_edge"), 1300)

# ------------------------------------------------------------ utilities
s.utility("E-203", "bottom", "D", "LP steam", UTIL)
s.utility("E-204", "top", "U", "Cooling water", 22)
s.utility("E-205", "bottom", "D", "MP steam", UTIL)
s.utility("E-206", "top", "U", "Cooling water", 22)
s.utility("E-207", "bottom", "D", "HP steam", UTIL)

# ------------------------------------------------------------ tags (one convention per family)
P = {"E-203": E203, "E-204": E204, "E-205": E205, "E-206": E206, "E-207": E207}
for n, p in P.items():                # exchangers: lower right of the symbol
    s.tag(n, p["bottom"][0] + 14, p["bottom"][1] + 14, anchor="start")
for n, p, sc in (("V-204", V204, 140 / 180), ("V-205", V205, 0.6)):   # vessels: above, centred
    cx = p["bottom"][0]
    s.tag(n, cx, p["inlet"][1] - 30 * sc - 20, anchor="middle")
for n, p in (("P-202", P202), ("P-203", P203)):                      # pumps: below, centred
    cx = p["suction"][0] + 22.4
    s.tag(n, cx, p["suction"][1] + 24 + 18, anchor="middle")
for n, p, yt in (("T-201", T1, YT1), ("T-202", T2, YT2)):            # columns: left, near the top
    s.tag(n, p["overhead"][0] - 30 * (S1 if n == "T-201" else S2) - 14, yt + 50, anchor="end")
# terminals
s.terminal_label("IN21", 58, Y20 + 12 + 13, anchor="start")
for n, y in (("LE", CY4), ("BZ", Y28), ("OUT38", Y37), ("DP", CY7)):
    s.terminal_label(n, X_TERM + 54, (y - 12 - 8) if n == "LE" else (y + 12 + 13), anchor="end",
                     lines=["To PFD-201", "(toluene recycle)"] if n == "OUT38" else None)

s.stream_table()
s.title_block()
s.notes(1000, 710, ["Abbreviations",
        "kmol/h: kilomoles per hour; kPa: kilopascals (absolute); °C: degrees Celsius",
        "HP / MP / LP steam: high- / medium- / low-pressure steam",
        "Mixed: vapour-liquid mixture",
        "Stream numbers in diamonds; continuation streams keep their number on both sheets"])
s.save(HERE / "out" / "PFD-202-draft.svg")
print("saved")
