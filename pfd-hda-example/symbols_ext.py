"""Project-local PFD symbol extension (PFD-SPEC-001 requirement S5).

EXT_SYMBOLS has the same format as SYMBOLS in the base library; the four
functions below cover the base library plus the two additions.
Standard library only.  Run `python symbols_ext.py` to self-check ports
and (re)write the standalone SVG files.
"""
import math
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "skill", "process-flow-diagram-drawing", "symbols"))
sys.path.insert(0, os.path.join(_HERE, "skill", "process-flow-diagram-drawing", "symbols"))
import pfd_symbols as _base  # noqa: E402

SW = 5.0    # main stroke, native units (x 0.1 mm/unit = 0.5 mm)
SA = 2.5    # auxiliary stroke (0.25 mm)
SCALE = 0.1
BASIS = ("Project-local addition under PFD-SPEC-001 requirement S5; conventional form drawn after common "
         "ISO 10628-2-style PFD practice; NOT verified against the ISO 10628-2 geometry (standard not "
         "available to the author); verification status: Provisional.")

# ---------------- geometry constants: fixed-bed reactor ----------------
R_W, R_RX, R_RY = 116.0, 58.0, 29.0          # width, head semi-axes
R_CX = R_RX                                   # axis x
R_Y_SHELL0, R_Y_SHELL1 = R_RY, 268.0 - R_RY   # straight shell 29..239
R_H = 268.0
R_BED0 = R_Y_SHELL0 + 0.2 * (R_Y_SHELL1 - R_Y_SHELL0)   # 71
R_BED1 = R_Y_SHELL0 + 0.8 * (R_Y_SHELL1 - R_Y_SHELL0)   # 197
R_HATCH = 16.0


def _fmt(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def _hatch_lines(x0, x1, y0, y1, pitch):
    """45-degree lines (going up to the right) clipped to the rectangle."""
    out = []
    h = y1 - y0
    k = -h
    while k < x1 - x0:
        # line: y = y1 - (x - (x0 + k))  for x in [x0+k, x0+k+h]
        xa, xb = x0 + k, x0 + k + h
        pa, pb = (xa, y1), (xb, y0)
        # clip x to [x0, x1]
        if xa < x0:
            pa = (x0, y1 - (x0 - xa))
        if xb > x1:
            pb = (x1, y0 + (xb - x1))
        if pa[0] < pb[0]:
            out.append((pa, pb))
        k += pitch
    return out


def _reactor_svg():
    body = ("M0,%s A%s,%s 0 0 1 %s,%s L%s,%s A%s,%s 0 0 1 0,%s Z" % (
        _fmt(R_Y_SHELL0), _fmt(R_RX), _fmt(R_RY), _fmt(R_W), _fmt(R_Y_SHELL0),
        _fmt(R_W), _fmt(R_Y_SHELL1), _fmt(R_RX), _fmt(R_RY), _fmt(R_Y_SHELL1)))
    hatch = "".join('<line x1="%s" y1="%s" x2="%s" y2="%s"/>' % (
        _fmt(a[0]), _fmt(a[1]), _fmt(b[0]), _fmt(b[1]))
        for a, b in _hatch_lines(0, R_W, R_BED0, R_BED1, R_HATCH))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 132 284">\n'
            '<g fill="none" stroke="#111" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round">'
            '<path d="%s" fill="white"/>'
            '<g stroke-width="%s"><line x1="0" y1="%s" x2="%s" y2="%s"/><line x1="0" y1="%s" x2="%s" y2="%s"/>%s</g>'
            '</g>\n</svg>\n') % (SW, body, SA, _fmt(R_BED0), _fmt(R_W), _fmt(R_BED0),
                                _fmt(R_BED1), _fmt(R_W), _fmt(R_BED1), hatch)


# ---------------- geometry constants: fired heater ----------------
F_X0, F_X1 = 8.0, 108.0            # radiant box walls (100 wide)
F_CX = 58.0
F_Y_TOP, F_Y_BOX0, F_Y_BOX1 = 0.0, 98.0, 248.0   # stack top, box top, box floor (150 tall)
F_STACK_X0, F_STACK_X1, F_STACK_Y = 46.0, 70.0, 50.0   # stack width 24, hood meets stack at y=50
F_FUEL_Y = 268.0
F_YC = 170.0                       # coil port height
F_COLS = [24.0, 41.0, 58.0, 75.0, 92.0]
F_COIL_TOP, F_COIL_BOT = 115.0, 215.0
F_FLAMES = [(38.0, 22.0), (78.0, 22.0)]   # (centre x, height)
F_FLAME_HW = 10.0

F_OUTLINE = [(F_X0, F_Y_BOX1), (F_X0, F_Y_BOX0), (F_STACK_X0, F_STACK_Y), (F_STACK_X0, F_Y_TOP),
             (F_STACK_X1, F_Y_TOP), (F_STACK_X1, F_STACK_Y), (F_X1, F_Y_BOX0), (F_X1, F_Y_BOX1)]


def _coil():
    """Serpentine: in at wall, up col0, down col1, up col2, down col3, up col4 to coil height, out."""
    pts = [(F_X0, F_YC), (F_COLS[0], F_YC), (F_COLS[0], F_COIL_TOP)]
    for i in range(1, len(F_COLS) - 1):
        y_end = F_COIL_BOT if i % 2 else F_COIL_TOP
        pts += [(F_COLS[i], pts[-1][1]), (F_COLS[i], y_end)]
    pts += [(F_COLS[-1], pts[-1][1]), (F_COLS[-1], F_YC), (F_X1, F_YC)]
    return pts


COIL = _coil()


def _heater_svg():
    outline = "M" + " L".join("%s,%s" % (_fmt(x), _fmt(y)) for x, y in F_OUTLINE) + " Z"
    coil = " ".join("%s,%s" % (_fmt(x), _fmt(y)) for x, y in COIL)
    flames = "".join('<polygon points="%s,%s %s,%s %s,%s"/>' % (
        _fmt(cx - F_FLAME_HW), _fmt(F_Y_BOX1), _fmt(cx), _fmt(F_Y_BOX1 - h),
        _fmt(cx + F_FLAME_HW), _fmt(F_Y_BOX1)) for cx, h in F_FLAMES)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 116 284">\n'
            '<g fill="none" stroke="#111" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round">'
            '<path d="%s" fill="white"/>'
            '<line x1="%s" y1="%s" x2="%s" y2="%s"/>'
            '<g stroke-width="%s"><polyline points="%s"/>%s</g>'
            '</g>\n</svg>\n') % (SW, outline, _fmt(F_CX), _fmt(F_Y_BOX1), _fmt(F_CX), _fmt(F_FUEL_Y),
                                SA, coil, flames)


EXT_SYMBOLS = {
    'fired_heater_x': {
        'file': 'fired_heater_x.svg',
        'name': 'Fired heater (process furnace)',
        'svg': _heater_svg(),
        'ports': {'coil_in': [F_X0, F_YC], 'coil_out': [F_X1, F_YC], 'fuel': [F_CX, F_FUEL_Y]},
        'frame': [F_X0, F_Y_TOP, F_X1, F_FUEL_Y],
        'scale_mm_per_unit': SCALE,
        'basis': BASIS,
    },
    'packed_reactor_x': {
        'file': 'packed_reactor_x.svg',
        'name': 'Fixed-bed (packed) catalytic reactor',
        'svg': _reactor_svg(),
        'ports': {'top': [R_CX, 0.0], 'bottom': [R_CX, R_H]},
        'frame': [0, 0, R_W, R_H],
        'scale_mm_per_unit': SCALE,
        'basis': BASIS,
    },
}

_ALL = dict(_base.SYMBOLS)
_ALL.update(EXT_SYMBOLS)


def list_symbols():
    return sorted(_ALL)


def get_svg(key):
    return _ALL[key]["svg"]


def get_ports(key):
    return _ALL[key]["ports"]


def get_frame(key):
    return _ALL[key]["frame"]


# ---------------- analytic port check ----------------
def _dist_seg(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _dist_ellipse_arc(p, cx, cy, rx, ry, upper):
    """Distance to the upper/lower half-ellipse by dense analytic sampling."""
    best = 1e9
    for i in range(0, 3601):
        t = math.pi * i / 3600
        x = cx - rx * math.cos(t)
        y = cy - ry * math.sin(t) if upper else cy + ry * math.sin(t)
        best = min(best, math.hypot(p[0] - x, p[1] - y))
    return best


def check_ports(tol=0.5):
    # heater: polygon outline + fuel stub + coil
    segs = list(zip(F_OUTLINE, F_OUTLINE[1:] + F_OUTLINE[:1]))
    segs.append(((F_CX, F_Y_BOX1), (F_CX, F_FUEL_Y)))
    segs += list(zip(COIL, COIL[1:]))
    for name, p in EXT_SYMBOLS['fired_heater_x']['ports'].items():
        d = min(_dist_seg(p, a, b) for a, b in segs)
        assert d <= tol, "fired_heater_x port %s is %.3f off the outline" % (name, d)
    pi, po = (EXT_SYMBOLS['fired_heater_x']['ports'][k] for k in ('coil_in', 'coil_out'))
    assert pi[1] == po[1], "coil_in and coil_out heights differ"
    assert tuple(COIL[0]) == tuple(pi) and tuple(COIL[-1]) == tuple(po), "coil must start/end at the ports"
    assert (F_Y_BOX1 - F_Y_BOX0) > (F_X1 - F_X0), "radiant box must be taller than wide"
    # reactor: shell lines + two half-ellipses
    for name, p in EXT_SYMBOLS['packed_reactor_x']['ports'].items():
        d = min(_dist_ellipse_arc(p, R_CX, R_Y_SHELL0, R_RX, R_RY, True),
                _dist_ellipse_arc(p, R_CX, R_Y_SHELL1, R_RX, R_RY, False),
                _dist_seg(p, (0, R_Y_SHELL0), (0, R_Y_SHELL1)),
                _dist_seg(p, (R_W, R_Y_SHELL0), (R_W, R_Y_SHELL1)))
        assert d <= tol, "packed_reactor_x port %s is %.3f off the outline" % (name, d)
    assert abs(EXT_SYMBOLS['packed_reactor_x']['ports']['top'][0] - R_W / 2) < 1e-9
    return True


def write_files(outdir=None):
    outdir = outdir or os.path.join(_HERE, "symbols_ext")
    os.makedirs(outdir, exist_ok=True)
    for k, s in EXT_SYMBOLS.items():
        with open(os.path.join(outdir, s['file']), "w") as f:
            f.write(s['svg'])


if __name__ == "__main__":
    check_ports()
    write_files()
    print("check_ports OK;", len(list_symbols()), "symbols;", "files written")
