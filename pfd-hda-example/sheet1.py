"""Sheet 1 (PFD-201, reaction section) of the HDA plant.
usage: python3 sheet1.py [--out PATH] [--y20 N] [--y37 N]
Reads continuations.json (R9 heights of streams 20 and 37) unless overridden."""
import json, pathlib, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import symbols_ext as LIB
import pfdkit as K
from pfdkit import Sheet



def build(out, Y20=None, Y37=None):
    cont = json.loads((HERE / "continuations.json").read_text())
    Y20 = int(cont["20"]) if Y20 is None else Y20
    Y37 = int(cont["37"]) if Y37 is None else Y37
    sh = Sheet(1)
    D = 80                       # standard marker-bearing horizontal run
    S_T, S_HX, S_P, S_V1, S_V2, S_V3 = 0.5, 44 / 114, 44 / 114, 140 / 180, 0.6, 0.5
    S_C, S_LV, S_HR = 0.3, 0.45, 0.75
    yL = 106                     # top gas lane: FH, J2, C-201, stream 15
    yS = 285                     # spine height (pump discharge .. coil_in)
    yA = 150                     # stream 12 / 13 / 19 height

    # ---- left region: V-201 height clear of Y37 by 50..60 px
    yv = None
    for dl in (60, 55, 50):
        if Y37 - dl >= 160 and Y37 - dl <= yS - 26:
            yv = Y37 - dl; break
        if Y37 + dl <= yS - 26 and Y37 + dl >= 160:
            yv = Y37 + dl; break
    assert yv, "no V-201 height for Y37=%s" % Y37
    xo = 100                      # terminal outlet x
    xJ1 = 175
    P = {}
    P["FH"] = sh.place("FH", xo, yL, S_T, anchor="outlet")
    P["FT"] = sh.place("FT", xo, yv, S_T, anchor="outlet")
    P["IN38"] = sh.place("IN38", xo, Y37, S_T, anchor="outlet")
    xv = xJ1 + D
    P["V-201"] = sh.place("V-201", xv, yv, S_V1, anchor="inlet")
    bx, by = P["V-201"]["bottom"]
    xd = bx + 80 + 35.5 * 1.0   # pump suction 80 right of the bottom port
    P["P-201"] = sh.place("P-201", xd, yS, S_P, anchor="discharge")
    sx, sy = P["P-201"]["suction"]
    xJ3 = xd + 100
    J1 = sh.junction("J1", xJ1, yv)
    J3 = sh.junction("J3", xJ3, yS)
    xJ2 = xJ3 + 100
    J2 = sh.junction("J2", xJ2, yL)
    P["E-201"] = sh.place("E-201", xJ3 + D, yS, S_HX, anchor="left")
    P["H-201"] = sh.place("H-201", P["E-201"]["right"][0] + D, yS, S_HR, anchor="coil_in")
    xR = P["H-201"]["coil_out"][0] + D
    P["R-201"] = sh.place("R-201", xR, yS + 34, S_HR, anchor="top")
    yE = round(P["R-201"]["bottom"][1] + 28)
    P["E-202"] = sh.place("E-202", xR + D, yE, S_HX, anchor="left")
    x11 = P["E-202"]["right"][0] + 70
    y11 = 238
    P["V-202"] = sh.place("V-202", x11 + 70, y11, S_V2, anchor="side_3")
    xV2 = P["V-202"]["top"][0]
    yTop2 = P["V-202"]["top"][1]
    xJ4 = xV2 + D + 10
    J4 = sh.junction("J4", xJ4, yA)
    yBot2 = P["V-202"]["bottom"][1]
    yLV = round(yBot2 + 26)
    xLV = xV2 + D
    P["LV-201"] = sh.place("LV-201", xLV, yLV, S_LV, anchor="left")
    # V-203 raised so that stream 20 reaches Y20 (needs >= 28 px drop)
    y17 = min(Y20 - 28 - (518 - 346) * S_V3, yLV)
    y17 = 10 * int(y17 // 10)
    if abs(y17 - yLV) < 40:
        y17 = yLV
    x17 = P["LV-201"]["right"][0] + 60
    x_v3l = x17 + 60
    P["V-203"] = sh.place("V-203", x_v3l, y17, S_V3, anchor="side_3")
    xV3 = P["V-203"]["top"][0]
    yTop3 = P["V-203"]["top"][1]
    xJ5 = xV3 - 80
    J5 = sh.junction("J5", xJ5, yA)
    xT = 1590
    P["FG"] = sh.place("FG", xT, yA, 0.6, anchor="inlet_edge")
    P["OUT21"] = sh.place("OUT21", xT, Y20, 0.6, anchor="inlet_edge")
    # compressor, flipped so that the suction faces the junction on its right
    xS = xJ4 - 175
    P["C-201"] = sh.place("C-201", xS, yL, S_C, flip=True, anchor="suction")
    cs, cd = P["C-201"]["suction"], P["C-201"]["discharge"]

    A = sh.arrow
    M = sh.marker

    # ---- streams
    p = P
    sh.stream(1, [p["FT"]["outlet"], J1], ("FT", "outlet"), ("J1", "j"))
    M(1, 128, yv); A(J1[0] - 8, yv, "R")
    yI = Y37
    sh.stream(37, [p["IN38"]["outlet"], (xJ1, yI), J1], ("IN38", "outlet"), ("J1", "j"))
    M(37, 135, yI)
    A(xJ1, yv + (14 if yI > yv else -14) , "U" if yI > yv else "D")
    sh.stream(2, [J1, p["V-201"]["inlet"]], ("J1", "j"), ("V-201", "inlet"))
    M(2, xJ1 + 38, yv); A(*p["V-201"]["inlet"], "R")
    sh.stream(3, [p["V-201"]["bottom"], (bx, sy), p["P-201"]["suction"]], ("V-201", "bottom"), ("P-201", "suction"))
    M(3, bx + 38, sy); A(sx, sy, "R")
    sh.stream(4, [p["P-201"]["discharge"], J3], ("P-201", "discharge"), ("J3", "j"))
    M(4, xd + 38, yS); A(xJ3 - 8, yS, "R")
    sh.stream(5, [p["FH"]["outlet"], J2], ("FH", "outlet"), ("J2", "j"))
    M(5, 590, yL); A(xJ2 - 8, yL, "R")
    y6 = 190
    sh.stream(6, [J2, (xJ2, y6), (xJ3, y6), J3], ("J2", "j"), ("J3", "j"))
    M(6, (xJ2 + xJ3) / 2, y6); A(xJ3, yS - 10, "D")
    sh.stream(7, [J3, p["E-201"]["left"]], ("J3", "j"), ("E-201", "left"))
    M(7, xJ3 + 36, yS); A(*p["E-201"]["left"], "R")
    sh.stream(8, [p["E-201"]["right"], p["H-201"]["coil_in"]], ("E-201", "right"), ("H-201", "coil_in"))
    M(8, (p["E-201"]["right"][0] + p["H-201"]["coil_in"][0]) / 2 - 8, yS); A(*p["H-201"]["coil_in"], "R")
    sh.stream(9, [p["H-201"]["coil_out"], (xR, yS), p["R-201"]["top"]], ("H-201", "coil_out"), ("R-201", "top"))
    M(9, p["H-201"]["coil_out"][0] + 36, yS); A(*p["R-201"]["top"], "D")
    sh.stream(10, [p["R-201"]["bottom"], (xR, yE), p["E-202"]["left"]], ("R-201", "bottom"), ("E-202", "left"))
    M(10, xR + 38, yE); A(*p["E-202"]["left"], "R")
    yv11 = P["V-202"]["side_3"][1]
    sh.stream(11, [p["E-202"]["right"], (x11, yE), (x11, yv11), p["V-202"]["side_3"]], ("E-202", "right"), ("V-202", "side_3"))
    M(11, p["E-202"]["right"][0] + 35, yE); A(*p["V-202"]["side_3"], "R")
    sh.stream(12, [p["V-202"]["top"], (xV2, yA), J4], ("V-202", "top"), ("J4", "j"))
    M(12, xV2 + 35, yA); A(xJ4 - 8, yA, "R")
    sh.stream(13, [J4, J5], ("J4", "j"), ("J5", "j"))
    M(13, (xJ4 + xJ5) / 2, yA); A(xJ5 - 8, yA, "R")
    sh.stream(14, [J4, (xJ4, yL), cs], ("J4", "j"), ("C-201", "suction"))
    M(14, (xJ4 + cs[0]) / 2 + 20, yL); A(cs[0], yL, "L")
    sh.stream(15, [cd, J2], ("C-201", "discharge"), ("J2", "j"))
    M(15, (cd[0] + xJ2) / 2, yL); A(xJ2 + 8 + 16, yL, "L") if False else None
    A(xJ2 + 8, yL, "L")
    A(cd[0] - 300, yL, "L")
    sh.stream(16, [p["V-202"]["bottom"], (xV2, yLV), p["LV-201"]["left"]], ("V-202", "bottom"), ("LV-201", "left"))
    M(16, xV2 + 38, yLV); A(*p["LV-201"]["left"], "R")
    y17a = p["V-203"]["side_3"][1]
    if abs(y17a - yLV) < 1:
        sh.stream(17, [p["LV-201"]["right"], p["V-203"]["side_3"]], ("LV-201", "right"), ("V-203", "side_3"))
        M(17, p["LV-201"]["right"][0] + 38, yLV)
    else:
        sh.stream(17, [p["LV-201"]["right"], (x17, yLV), (x17, y17a), p["V-203"]["side_3"]], ("LV-201", "right"), ("V-203", "side_3"))
        M(17, p["LV-201"]["right"][0] + 30, yLV)
    A(*p["V-203"]["side_3"], "R")
    y18 = round(yTop3 - 22)
    sh.stream(18, [p["V-203"]["top"], (xV3, y18), (xJ5, y18), J5], ("V-203", "top"), ("J5", "j"))
    M(18, (xV3 + xJ5) / 2, y18); A(xJ5, yA + 14, "U")
    sh.stream(19, [J5, p["FG"]["inlet_edge"]], ("J5", "j"), ("FG", "inlet_edge"))
    M(19, (xJ5 + xT) / 2 - 20, yA); A(*p["FG"]["inlet_edge"], "R")
    sh.stream(20, [p["V-203"]["bottom"], (xV3, Y20), p["OUT21"]["inlet_edge"]], ("V-203", "bottom"), ("OUT21", "inlet_edge"))
    M(20, xV3 + 40, Y20); A(*p["OUT21"]["inlet_edge"], "R")

    # ---- utilities
    sh.utility("E-201", "bottom", "D", "HP steam")
    sh.utility("E-202", "bottom", "D", "Cooling water")
    sh.utility("H-201", "fuel", "D", "Fuel gas")

    # ---- tags: exchangers above; pumps/compressor/valve below; vessels, reactor, heater right of the shell
    def above(n, w=22, dy=24):
        x, y = P[n]["left"][0] + (P[n]["right"][0] - P[n]["left"][0]) / 2, P[n]["left"][1]
        sh.tag(n, x, y - w - dy)
    above("E-201"); above("E-202")
    def below(n, port_x, y):
        sh.tag(n, port_x, y)
    pm = sh.nodes["P-201"]["m"]
    sh.tag("P-201", (P["P-201"]["suction"][0] + P["P-201"]["discharge"][0]) / 2, yS + 70)
    sh.tag("C-201", (cs[0] + cd[0]) / 2, yL + 56)
    sh.tag("LV-201", (P["LV-201"]["left"][0] + P["LV-201"]["right"][0]) / 2, yLV + 28)
    def right(n, key, x_right, y_top):
        sh.tag(n, x_right + 12, y_top + 16, anchor="start")
    right("V-201", "", P["V-201"]["outlet"][0], yv - 22)
    right("V-202", "", x11 + 70 + 116 * S_V2, y11 - 96 * S_V2 + 0)
    right("V-203", "", x_v3l + 116 * S_V3, y17a - 96 * S_V3 + 0)
    hx = P["H-201"]["coil_out"][0]
    right("H-201", "", hx, yS - 170 * S_HR + 8)
    right("R-201", "", xR + 58 * S_HR, yS + 34 + 8)

    # ---- terminal labels
    def tl(n, x, y, lines, anchor="start"):
        sh.terminal_label(n, x, y, anchor=anchor, lines=lines)
    tl("FH", xo - 42, yL + 24, ["Hydrogen make-up"])
    upper_is_37 = Y37 < yv
    lines37 = ["From PFD-202", "(toluene recycle)"]
    if upper_is_37:
        if Y37 >= 190:
            tl("IN38", xo - 42, Y37 - 33, lines37)
        else:
            tl("IN38", xo - 42, Y37 + 26, lines37)
    else:
        tl("IN38", xo - 42, Y37 + 28, lines37)
    tl("FT", xo - 42, yv - 16 if upper_is_37 else yv + 28, ["Fresh toluene"]) if False else None
    if upper_is_37:
        tl("FT", xo - 42, yv + 28, ["Fresh toluene"])
    else:
        tl("FT", xo - 42, yv + 28 if Y37 - yv > 55 else yv + 28, ["Fresh toluene"])
    tl("FG", xT, yA - 16, ["Fuel gas"])
    tl("OUT21", xT - 10, Y20 - 33, ["To PFD-202", "(column feed)"], anchor="start")

    # ---- level control loop
    lvx = (P["LV-201"]["left"][0] + P["LV-201"]["right"][0]) / 2
    lvtop = yLV - (576 - 485) * S_LV       # frame top (bubble placed relative to it)
    dome = yLV - (576 - 507) * S_LV        # actuator dome apex: arc A23,25 from y = 532
    sh.instrument(lvx, lvtop - 62, "LIC", "201", [(lvx, dome)])
    # level measurement: dashed signal line from the V-202 shell to the LIC bubble
    yb = lvtop - 62
    xw = P["V-202"]["right"][0]
    sh.el_lines.append(f'<path class="signal" d="M {xw:.2f} {yb:.2f} L {lvx - 17:.2f} {yb:.2f}" fill="none" '
                       f'stroke="{K.INK}" stroke-width="{K.W_THIN}" stroke-dasharray="6 4"/>')

    sh.stream_table()
    sh.title_block()
    sh.notes(1000, 700, ["Abbreviations",
                         "kmol/h: kilomoles per hour; kPa: kilopascals (absolute); °C: degrees Celsius",
                         "HP steam: high-pressure steam",
                         "LIC: level indicating controller; LV: level control valve",
                         "Mixed: vapour-liquid mixture",
                         "Stream numbers in diamonds; continuation streams keep their number on both sheets"])
    sh.save(out)
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    g = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    out = g("--out", str(HERE / "out" / "PFD-201-draft.svg"))
    pathlib.Path(out).parent.mkdir(exist_ok=True)
    build(out, int(g("--y20")) if g("--y20") else None, int(g("--y37")) if g("--y37") else None)
    print("wrote", out)
