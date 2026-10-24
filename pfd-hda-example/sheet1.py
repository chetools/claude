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
    D = 76                       # standard marker-bearing horizontal run
    S_T, S_HX, S_P, S_V1, S_V2, S_V3 = 0.5, 44 / 114, 44 / 114, 140 / 180, 0.6, 0.5
    S_C, S_LV, S_HR = 0.3, 0.45, 0.75
    yL = 100                     # top gas lane: FH, J2, C-201, stream 15
    yS = 285                     # spine height (pump discharge .. coil_in)
    yA = 150                     # stream 12 / 13 / 41 / 19 height

    # ---- left region: V-201 height clear of Y37 by 50..60 px
    yv = None
    for dl in (60, 55, 50):
        if Y37 - dl >= 160 and Y37 - dl <= yS - 26:
            yv = Y37 - dl; break
        if Y37 + dl <= yS - 26 and Y37 + dl >= 160:
            yv = Y37 + dl; break
    assert yv, "no V-201 height for Y37=%s" % Y37
    xo = 100                      # terminal outlet x
    xJ1 = 180
    P = {}
    P["FH"] = sh.place("FH", xo, yL, S_T, anchor="outlet")
    P["FT"] = sh.place("FT", xo, yv, S_T, anchor="outlet")
    P["IN38"] = sh.place("IN38", xo, Y37, S_T, anchor="outlet")
    xv = xJ1 + D
    P["V-201"] = sh.place("V-201", xv, yv, S_V1, anchor="inlet")
    bx, by = P["V-201"]["bottom"]
    xd = bx + 76 + 35.5
    P["P-201"] = sh.place("P-201", xd, yS, S_P, anchor="discharge")
    sx, sy = P["P-201"]["suction"]
    xJ3 = xd + 90
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
    x11 = P["E-202"]["right"][0] + 66
    y11 = 238
    P["V-202"] = sh.place("V-202", x11 + 66, y11, S_V2, anchor="side_3")
    xV2 = P["V-202"]["top"][0]
    yTop2 = P["V-202"]["top"][1]
    xJ4 = xV2 + D + 10
    J4 = sh.junction("J4", xJ4, yA)
    yBot2 = P["V-202"]["bottom"][1]
    yLV = round(yBot2 + 26)
    xLV = xV2 + D
    P["LV-201"] = sh.place("LV-201", xLV, yLV, S_LV, anchor="left")
    # PV-201 in the purge line (13 -> valve -> 41)
    L13 = 118
    P["PV-201"] = sh.place("PV-201", xJ4 + L13, yA, S_LV, anchor="left")
    pvl, pvr = P["PV-201"]["left"], P["PV-201"]["right"]
    xJ5 = pvr[0] + 90
    J5 = sh.junction("J5", xJ5, yA)
    # V-203 raised so that stream 20 reaches Y20 (needs >= 28 px drop)
    y17 = min(Y20 - 28 - (518 - 346) * S_V3, yLV)
    y17 = 10 * int(y17 // 10)
    if abs(y17 - yLV) < 40:
        y17 = yLV
    x17 = P["LV-201"]["right"][0] + 56
    xV3 = xJ5 - 70
    P["V-203"] = sh.place("V-203", xV3 - 29 + 0.0, y17, S_V3, anchor="side_3")
    xV3 = P["V-203"]["top"][0]
    x_v3l = P["V-203"]["side_3"][0]
    assert x_v3l - x17 >= 50, (x_v3l, x17)
    yTop3 = P["V-203"]["top"][1]
    xT = xJ5 + 80
    P["FG"] = sh.place("FG", xT, yA, 0.6, anchor="inlet_edge")
    P["OUT21"] = sh.place("OUT21", xT, Y20, 0.6, anchor="inlet_edge")
    print("xV3=%.0f xJ5=%.0f xT=%.0f" % (xV3, xJ5, xT))
    # compressor, flipped so that the suction faces the junction on its right
    xS = xJ4 - 175
    P["C-201"] = sh.place("C-201", xS, yL, S_C, flip=True, anchor="suction")
    cs, cd = P["C-201"]["suction"], P["C-201"]["discharge"]

    A = sh.arrow
    M = sh.marker

    def Mh(n, xa, xb, y, arrow=True, shift=0):
        """marker centred on the free part of a horizontal run xa -> xb (arrow occupies the last 16 px)."""
        sg = 1 if xb > xa else -1
        end = xb - sg * (16 if arrow else 0)
        M(n, (xa + end) / 2 + shift, y)

    # ---- streams
    p = P
    sh.stream(1, [p["FT"]["outlet"], J1], ("FT", "outlet"), ("J1", "j"))
    Mh(1, xo, J1[0] - 8, yv); A(J1[0] - 8, yv, "R")
    yI = Y37
    sh.stream(37, [p["IN38"]["outlet"], (xJ1, yI), J1], ("IN38", "outlet"), ("J1", "j"))
    Mh(37, xo, xJ1, yI, arrow=False, shift=-6)
    A(xJ1, yv + (14 if yI > yv else -14), "U" if yI > yv else "D")
    sh.stream(2, [J1, p["V-201"]["inlet"]], ("J1", "j"), ("V-201", "inlet"))
    Mh(2, xJ1, xv, yv, shift=4); A(*p["V-201"]["inlet"], "R")
    sh.stream(3, [p["V-201"]["bottom"], (bx, sy), p["P-201"]["suction"]], ("V-201", "bottom"), ("P-201", "suction"))
    Mh(3, bx, sx, sy); A(sx, sy, "R")
    sh.stream(4, [p["P-201"]["discharge"], J3], ("P-201", "discharge"), ("J3", "j"))
    Mh(4, xd, xJ3 - 8, yS); A(xJ3 - 8, yS, "R")
    sh.stream(5, [p["FH"]["outlet"], J2], ("FH", "outlet"), ("J2", "j"))
    Mh(5, 480, xJ2 - 8, yL); A(xJ2 - 8, yL, "R")
    y6 = 190
    sh.stream(6, [J2, (xJ2, y6), (xJ3, y6), J3], ("J2", "j"), ("J3", "j"))
    M(6, (xJ2 + xJ3) / 2, y6); A(xJ3, yS - 10, "D")
    sh.stream(7, [J3, p["E-201"]["left"]], ("J3", "j"), ("E-201", "left"))
    Mh(7, xJ3, p["E-201"]["left"][0], yS, shift=4); A(*p["E-201"]["left"], "R")
    sh.stream(8, [p["E-201"]["right"], p["H-201"]["coil_in"]], ("E-201", "right"), ("H-201", "coil_in"))
    Mh(8, p["E-201"]["right"][0], p["H-201"]["coil_in"][0], yS); A(*p["H-201"]["coil_in"], "R")
    sh.stream(9, [p["H-201"]["coil_out"], (xR, yS), p["R-201"]["top"]], ("H-201", "coil_out"), ("R-201", "top"))
    Mh(9, p["H-201"]["coil_out"][0], xR, yS, arrow=False, shift=-8); A(*p["R-201"]["top"], "D")
    sh.stream(10, [p["R-201"]["bottom"], (xR, yE), p["E-202"]["left"]], ("R-201", "bottom"), ("E-202", "left"))
    Mh(10, xR, p["E-202"]["left"][0], yE); A(*p["E-202"]["left"], "R")
    yv11 = P["V-202"]["side_3"][1]
    sh.stream(11, [p["E-202"]["right"], (x11, yE), (x11, yv11), p["V-202"]["side_3"]], ("E-202", "right"), ("V-202", "side_3"))
    Mh(11, p["E-202"]["right"][0], x11, yE, arrow=False); A(*p["V-202"]["side_3"], "R")
    sh.stream(12, [p["V-202"]["top"], (xV2, yA), J4], ("V-202", "top"), ("J4", "j"))
    Mh(12, xV2, xJ4 - 8, yA); A(xJ4 - 8, yA, "R")
    sh.stream(13, [J4, pvl], ("J4", "j"), ("PV-201", "left"))
    Mh(13, xJ4, pvl[0], yA, shift=8); A(*pvl, "R")
    sh.stream(41, [pvr, J5], ("PV-201", "right"), ("J5", "j"))
    Mh(41, pvr[0], xJ5 - 8, yA); A(xJ5 - 8, yA, "R")
    sh.stream(14, [J4, (xJ4, yL), cs], ("J4", "j"), ("C-201", "suction"))
    Mh(14, xJ4, cs[0], yL); A(cs[0], yL, "L")
    sh.stream(15, [cd, J2], ("C-201", "discharge"), ("J2", "j"))
    M(15, (cd[0] + xJ2) / 2 + 40, yL)
    A(xJ2 + 8, yL, "L")
    A(cd[0] - 250, yL, "L")
    sh.stream(16, [p["V-202"]["bottom"], (xV2, yLV), p["LV-201"]["left"]], ("V-202", "bottom"), ("LV-201", "left"))
    Mh(16, xV2, p["LV-201"]["left"][0], yLV); A(*p["LV-201"]["left"], "R")
    y17a = p["V-203"]["side_3"][1]
    if abs(y17a - yLV) < 1:
        sh.stream(17, [p["LV-201"]["right"], p["V-203"]["side_3"]], ("LV-201", "right"), ("V-203", "side_3"))
        Mh(17, p["LV-201"]["right"][0], x_v3l, yLV)
    else:
        sh.stream(17, [p["LV-201"]["right"], (x17, yLV), (x17, y17a), p["V-203"]["side_3"]], ("LV-201", "right"), ("V-203", "side_3"))
        Mh(17, p["LV-201"]["right"][0], x17, yLV, arrow=False)
    A(*p["V-203"]["side_3"], "R")
    y18 = round(yTop3 - 22)
    sh.stream(18, [p["V-203"]["top"], (xV3, y18), (xJ5, y18), J5], ("V-203", "top"), ("J5", "j"))
    M(18, (xV3 + xJ5) / 2, y18); A(xJ5, yA + 14, "U")
    sh.stream(19, [J5, p["FG"]["inlet_edge"]], ("J5", "j"), ("FG", "inlet_edge"))
    Mh(19, xJ5, xT, yA, shift=5); A(*p["FG"]["inlet_edge"], "R")
    sh.stream(20, [p["V-203"]["bottom"], (xV3, Y20), p["OUT21"]["inlet_edge"]], ("V-203", "bottom"), ("OUT21", "inlet_edge"))
    Mh(20, xV3, xT, Y20); A(*p["OUT21"]["inlet_edge"], "R")

    # ---- utilities (Annex A.6: steam at the bottom, cooling water at the top, fuel at 'fuel')
    sh.utility("E-201", "bottom", "D", "HP steam")
    sh.utility("E-202", "top", "U", "Cooling water")
    sh.utility("H-201", "fuel", "D", "Fuel gas")

    # ---- tags: exchangers above (E-202 below: its top carries the utility), pumps/compressor/valves below,
    #      vessels, reactor, heater to the right of the shell
    def xc(n):
        return (P[n]["left"][0] + P[n]["right"][0]) / 2
    sh.tag("E-201", xc("E-201"), yS - 22 - 24)
    sh.tag("E-202", xc("E-202"), yE + 22 + 22)
    sh.tag("P-201", (P["P-201"]["suction"][0] + P["P-201"]["discharge"][0]) / 2, yS + 70)
    sh.tag("C-201", (cs[0] + cd[0]) / 2, yL + 56)
    sh.tag("LV-201", xc("LV-201"), yLV + 28)
    sh.tag("PV-201", xc("PV-201") - 35, yA + 28)
    def right(n, x_right, y_top):
        sh.tag(n, x_right + 12, y_top + 16, anchor="start")
    right("V-201", P["V-201"]["outlet"][0], yv - 22)
    right("V-202", xV2 + 58 * S_V2, y11 - 96 * S_V2 + 45)
    right("V-203", xV3 + 58 * S_V3, y17a - 96 * S_V3)
    right("H-201", P["H-201"]["coil_out"][0], yS - 170 * S_HR + 8)
    right("R-201", xR + 58 * S_HR, yS + 34 + 8)

    # ---- terminal labels
    def tl(n, x, y, lines, anchor="start"):
        sh.terminal_label(n, x, y, anchor=anchor, lines=lines)
    tl("FH", xo - 42, yL + 24, ["Hydrogen make-up"])
    upper_is_37 = Y37 < yv
    lines37 = ["From PFD-202", "(toluene recycle)"]
    if upper_is_37:
        tl("IN38", xo - 42, Y37 - 33 if Y37 >= 190 else Y37 + 26, lines37)
    else:
        tl("IN38", xo - 42, Y37 + 28, lines37)
    tl("FT", xo - 42, yv + 28, ["Fresh toluene"])
    tl("FG", xT, yA - 16, ["Fuel gas"])
    tl("OUT21", xT - 10, Y20 - 33, ["To PFD-202", "(column feed)"], anchor="start")

    # ---- control loops
    def signal(pts):
        d = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in pts)
        sh.el_lines.append(f'<path class="signal" d="{d}" fill="none" stroke="{K.INK}" stroke-width="{K.W_THIN}" stroke-dasharray="6 4"/>')
    # LIC 201: bubble at the liquid-level height (flash_1 'right' port), measurement line horizontal from the shell
    lvx = xc("LV-201")
    lv_apex = yLV - (576 - 507) * S_LV
    lx, ly = P["V-202"]["right"]
    xb = lx + 58
    signal([(lx, ly), (xb - 17, ly)])
    sh.instrument(xb, ly, "LIC", "201", [(lvx, ly), (lvx, lv_apex)])
    # PIC 201: bubble above the PV-201 actuator, measurement line to stream 13 upstream of the valve
    pvx = xc("PV-201")
    pv_apex = yA - (576 - 507) * S_LV
    yb = 70
    xtap = xJ4 + 20
    signal([(pvx - 17, yb), (xtap, yb), (xtap, yA - 2)])
    sh.instrument(pvx, yb, "PIC", "201", [(pvx, pv_apex)])

    sh.stream_table()
    sh.title_block()
    sh.notes(1000, 700, ["Abbreviations",
                         "kmol/h: kilomoles per hour; kPa: kilopascals (absolute); °C: degrees Celsius",
                         "HP steam: high-pressure steam",
                         "LIC: level indicating controller; LV: level control valve",
                         "PIC: pressure indicating controller; PV: pressure control valve",
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
