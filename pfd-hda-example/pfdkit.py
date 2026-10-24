"""Shared drawing kit for the HDA sheets PFD-201 and PFD-202 (PFD-SPEC-001).

Sheet geometry: A3 landscape, 420 mm x 297 mm, drawn at 4 px per mm, so
1 px = 0.25 mm at final size and the grid module M = 2.5 mm = 10 px.

Every symbol is a library glyph (symbols_ext: base library + two S5
additions) placed by an affine frame transform; every stream end is the
transformed library port (or a junction point, or a point on a column
shell side for the side entries of Annex A.9), asserted against the
frozen topology in topology.json. The SVG carries data attributes that the
independent verifier (verify.py) reads back:
  <g data-node=ID data-key=KEY data-m="a b c d e f">   symbol + its matrix
  <path data-stream=N data-src=ID:PORT data-dst=ID:PORT> stream polyline
  <circle data-junction=ID>                           junction dot
  <g data-marker=N>                                   stream number diamond
  <text data-cell="N|column">                         stream table cell
  class="lbl" on every free label (checked for overlaps)
"""
import html, json, math, pathlib, re

import symbols_ext as LIB

HERE = pathlib.Path(__file__).parent
TOPO = json.loads((HERE / "topology.json").read_text())
DATA = json.loads((HERE / "streams.json").read_text())

W, H = 1680, 1190                 # px; 4 px = 1 mm
PX_MM = 0.25
M = 10                            # grid module, px
INK = "#111111"
FONT = "Arial, Helvetica, sans-serif"
W_MAIN = 4.0                      # 1.0 mm main flow lines            (L1)
W_SYM = 2.0                       # 0.5 mm equipment symbols, utility lines
W_THIN = 1.0                      # 0.25 mm valves, instruments, auxiliary
T_TAG, T_SVC, T_DATA, T_SMALL = 13, 11, 11, 10   # 3.25 / 2.75 / 2.75 / 2.5 mm (L2)
FLOWSHEET_BOTTOM = 650            # flowsheet area is y < 650; stream table below
SHEETS = {1: ("PFD-201", "Reaction section"), 2: ("PFD-202", "Separation section")}
VALVE_KEYS = {"valve_1", "control_valve_1"}


def _fmt(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def esc(s):
    return html.escape(str(s))


class Sheet:
    def __init__(self, sheet_no):
        self.no = sheet_no
        self.dwg, self.section = SHEETS[sheet_no]
        self.el_lines, self.el_sym, self.el_top = [], [], []
        self.nodes = {}           # id -> dict(key, m, ports)
        self.junctions = {}       # id -> (x, y)
        self.streams = {}         # n -> list of polylines
        self.markers = set()
        self.expected = {(n, a, ap, b, bp) for n, a, ap, b, bp in
                         (tuple(e) for e in TOPO["sheet_edges"][str(sheet_no)])}

    # ---------------------------------------------------------------- symbols
    def place(self, node, x, y, scale, rot=0, flip=False, anchor="frame"):
        """Place the library symbol of `node` with the top-left corner of its
        (transformed) frame at (x, y), or - with anchor='<port name>' - with
        that port at (x, y). scale = px per native unit. rot in 0/90/180/270
        (clockwise), flip mirrors left-right before rotation. Returns the
        dict of sheet port coordinates."""
        meta = TOPO["nodes"][node]
        assert self.no in meta["sheets"], f"{node} is not on sheet {self.no}"
        key = meta["key"]
        fx1, fy1, fx2, fy2 = LIB.get_frame(key)
        fw, fh = fx2 - fx1, fy2 - fy1

        def local(px, py):            # native -> unit-frame coords after flip+rot
            u, v = px - fx1, py - fy1
            if flip:
                u = fw - u
            if rot == 0:
                return u, v
            if rot == 90:
                return fh - v, u
            if rot == 180:
                return fw - u, fh - v
            if rot == 270:
                return v, fw - u
            raise ValueError(rot)
        # affine matrix from three points
        o = local(0, 0); ex = local(1, 0); ey = local(0, 1)
        a, b = (ex[0] - o[0]) * scale, (ex[1] - o[1]) * scale
        c, d = (ey[0] - o[0]) * scale, (ey[1] - o[1]) * scale
        e, f = o[0] * scale, o[1] * scale
        if anchor != "frame":
            px, py = LIB.get_ports(key)[anchor]
            x, y = x - (a * px + c * py + e), y - (b * px + d * py + f)
        e, f = e + x, f + y
        m = (a, b, c, d, e, f)
        tr = lambda px, py: (a * px + c * py + e, b * px + d * py + f)
        ports = {k: tr(*p) for k, p in LIB.get_ports(key).items()}
        # stroke widths: rescale so that the main outline is 0.5 mm at final size
        # (0.25 mm for valves), keeping the library's internal weight ratios
        svg = LIB.get_svg(key)
        inner = svg[svg.index(">") + 1: svg.rindex("</svg>")].strip()
        base_w = float(re.search(r'stroke-width="([\d.]+)"', inner).group(1))
        target = (W_THIN if key in VALVE_KEYS else W_SYM) / scale
        k = target / base_w
        inner = re.sub(r'stroke-width="([\d.]+)"', lambda mm: f'stroke-width="{_fmt(float(mm.group(1)) * k)}"', inner)
        extra = ""
        if key == "scds_1":
            # The library's overhead/bottoms ports lie 20 and 15 native units
            # beyond the head apexes; a nozzle stub at main-line weight joins
            # port and outline so the stream is visibly connected.
            sw = _fmt(W_MAIN / scale)
            extra = (f'<line x1="560" y1="200" x2="560" y2="220" stroke-width="{sw}" stroke-linecap="butt"/>'
                     f'<line x1="560" y1="505" x2="560" y2="520" stroke-width="{sw}" stroke-linecap="butt"/>')
            extra = f'<g stroke="{INK}">{extra}</g>'
        self.el_sym.append(f'<g data-node="{esc(node)}" data-key="{key}" '
                           f'data-m="{" ".join(f"{v:.6f}" for v in m)}" transform="matrix({" ".join(f"{v:.6f}" for v in m)})">'
                           f'{inner}{extra}</g>')
        self.nodes[node] = dict(key=key, m=m, ports=ports, scale=scale, rot=rot, flip=flip)
        return ports

    def column_side(self, node, side, y):
        """Point on the shell of a column (scds_1, unrotated) at sheet height y:
        side 'left' (feed entries) or 'right' (reflux / boil-up entries)."""
        n = self.nodes[node]
        a, b, c, d, e, f = n["m"]
        assert n["key"] == "scds_1" and n["rot"] == 0 and not n["flip"]
        x = a * (530 if side == "left" else 590) + e
        ytop, ybot = d * 235 + f, d * 490 + f
        assert ytop + 10 <= y <= ybot - 10, f"side entry at y={y} outside the shell ({ytop:.0f}-{ybot:.0f})"
        return (x, y)

    def junction(self, node, x, y):
        assert TOPO["nodes"][node]["kind"] == "junction"
        self.junctions[node] = (x, y)
        return (x, y)

    # ---------------------------------------------------------------- streams
    def _endpoint(self, node, port):
        if port == "j":
            return self.junctions[node]
        if port.startswith("side_") and TOPO["nodes"][node]["key"] == "scds_1":
            return None               # checked by the verifier (on the shell side)
        return self.nodes[node]["ports"][port]

    def stream(self, n, pts, src, dst, width=W_MAIN):
        """Draw one polyline of stream n from src=(node, port) to dst=(node, port).
        Orthogonal only; ends asserted on the topology ports."""
        pts = [(float(x), float(y)) for x, y in pts]
        key = (n, src[0], src[1], dst[0], dst[1])
        assert key in self.expected, f"stream {key} not in the frozen topology for sheet {self.no}"
        for p, (node, port) in ((pts[0], src), (pts[-1], dst)):
            q = self._endpoint(node, port)
            if q is not None:
                assert abs(p[0] - q[0]) < 0.6 and abs(p[1] - q[1]) < 0.6, \
                    f"stream {n}: end {p} is not on port {node}:{port} at {q}"
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            assert (abs(x1 - x2) < 1e-6) != (abs(y1 - y2) < 1e-6), f"stream {n}: non-orthogonal or null segment"
        self.streams.setdefault(n, []).append(pts)
        d = "M " + " L ".join(f"{_fmt(x)} {_fmt(y)}" for x, y in pts)
        self.el_lines.append(f'<path data-stream="{n}" data-src="{esc(src[0])}:{src[1]}" '
                             f'data-dst="{esc(dst[0])}:{dst[1]}" d="{d}" fill="none" stroke="{INK}" '
                             f'stroke-width="{_fmt(width)}" stroke-linejoin="miter" stroke-linecap="butt"/>')

    def arrow(self, x, y, direction, size=1.0):
        """Filled arrowhead whose TIP is at (x, y), pointing R, L, U or D."""
        L, h = 16 * size, 6.5 * size
        dx, dy = {"R": (1, 0), "L": (-1, 0), "D": (0, 1), "U": (0, -1)}[direction]
        bx, by = x - dx * L, y - dy * L
        pts = [(x, y), (bx - dy * h, by + dx * h), (bx + dy * h, by - dx * h)]
        self.el_top.append(f'<polygon class="arrow" points="{" ".join(f"{_fmt(px)},{_fmt(py)}" for px, py in pts)}" fill="{INK}"/>')

    def marker(self, n, x, y):
        """Stream number in a diamond, centred on a horizontal segment (L4)."""
        self.markers.add(n)
        w, h = 19 if n < 10 else 22, 13
        self.el_top.append(f'<g data-marker="{n}"><polygon points="{_fmt(x - w)},{_fmt(y)} {_fmt(x)},{_fmt(y - h)} '
                           f'{_fmt(x + w)},{_fmt(y)} {_fmt(x)},{_fmt(y + h)}" fill="white" stroke="{INK}" stroke-width="{W_SYM}"/>'
                           f'<text x="{_fmt(x)}" y="{_fmt(y + 4)}" font-family="{FONT}" font-size="{T_DATA}" font-weight="bold" '
                           f'text-anchor="middle" fill="{INK}">{n}</text></g>')

    def dots(self):
        for node, (x, y) in self.junctions.items():
            self.el_top.append(f'<circle data-junction="{node}" cx="{_fmt(x)}" cy="{_fmt(y)}" r="6" fill="{INK}"/>')

    # ---------------------------------------------------------------- text
    def text(self, x, y, s, size=T_SVC, bold=False, anchor="start", cls="lbl", extra=""):
        b = ' font-weight="bold"' if bold else ""
        c = f' class="{cls}"' if cls else ""
        self.el_top.append(f'<text{c}{extra} x="{_fmt(x)}" y="{_fmt(y)}" font-family="{FONT}" font-size="{size}"{b} '
                           f'text-anchor="{anchor}" fill="{INK}">{esc(s)}</text>')

    def tag(self, node, x, y, anchor="middle"):
        """Equipment designation (bold) with the service name on the line below."""
        meta = TOPO["nodes"][node]
        self.text(x, y, meta["tag"], size=T_TAG, bold=True, anchor=anchor, extra=f' data-tag="{esc(node)}"')
        self.text(x, y + 14, meta["service"], size=T_SVC, anchor=anchor)

    def terminal_label(self, node, x, y, anchor="start", lines=None):
        lines = lines or [TOPO["nodes"][node]["service"]]
        for i, s in enumerate(lines):
            self.text(x, y + 13 * i, s, size=T_SVC, bold=(i == 0), anchor=anchor)

    def utility(self, node, port, direction, label, length=40, inward=True):
        """Energy-carrier stub (0.5 mm) at a utility port, pointing away from
        the symbol by `direction` (U/D/L/R); arrow toward the symbol if inward.
        The label (for example 'HP steam') is placed beyond the stub's free end."""
        x, y = self.nodes[node]["ports"][port]
        dx, dy = {"R": (1, 0), "L": (-1, 0), "D": (0, 1), "U": (0, -1)}[direction]
        x2, y2 = x + dx * length, y + dy * length
        self.el_lines.append(f'<line class="utility" data-node="{esc(node)}" data-port="{port}" data-label="{esc(label)}" x1="{_fmt(x)}" y1="{_fmt(y)}" '
                             f'x2="{_fmt(x2)}" y2="{_fmt(y2)}" stroke="{INK}" stroke-width="{W_SYM}"/>')
        if inward:
            self.arrow(x + dx * 2, y + dy * 2, {"R": "L", "L": "R", "U": "D", "D": "U"}[direction], size=0.75)
        else:
            self.arrow(x2, y2, direction, size=0.75)
        # label beyond the free end of the stub, on the stub's axis
        if direction == "D":
            self.text(x2, y2 + 13, label, size=T_SMALL, anchor="middle")
        elif direction == "U":
            self.text(x2, y2 - 5, label, size=T_SMALL, anchor="middle")
        elif direction == "R":
            self.text(x2 + 5, y2 + 4, label, size=T_SMALL, anchor="start")
        else:
            self.text(x2 - 5, y2 + 4, label, size=T_SMALL, anchor="end")
        return (x2, y2)

    def instrument(self, x, y, letters, number, to, dashed=True):
        """ISA-5.1 instrument bubble, control-room mounted (circle with a
        horizontal bar; function letters above, loop number below), with a
        dashed electrical signal line along the points `to`."""
        r = 17
        pts = [(x, y)] + list(to)
        d = "M " + " L ".join(f"{_fmt(px)} {_fmt(py)}" for px, py in pts)
        da = ' stroke-dasharray="6 4"' if dashed else ""
        self.el_lines.append(f'<path class="signal" d="{d}" fill="none" stroke="{INK}" stroke-width="{W_THIN}"{da}/>')
        self.el_sym.append(f'<g class="instrument"><circle cx="{_fmt(x)}" cy="{_fmt(y)}" r="{r}" fill="white" stroke="{INK}" stroke-width="{W_THIN}"/>'
                           f'<line x1="{_fmt(x - r)}" y1="{_fmt(y)}" x2="{_fmt(x + r)}" y2="{_fmt(y)}" stroke="{INK}" stroke-width="{W_THIN}"/>'
                           f'<text x="{_fmt(x)}" y="{_fmt(y - 4)}" font-family="{FONT}" font-size="{T_SMALL}" font-weight="bold" text-anchor="middle" fill="{INK}">{esc(letters)}</text>'
                           f'<text x="{_fmt(x)}" y="{_fmt(y + 10)}" font-family="{FONT}" font-size="{T_SMALL}" text-anchor="middle" fill="{INK}">{esc(number)}</text></g>')

    # ---------------------------------------------------------------- tables
    def stream_table(self, x=60, y=690):
        nums = sorted({e[0] for e in TOPO["sheet_edges"][str(self.no)]})
        cols = [("Stream", 52), ("Phase", 62), ("Temperature (°C)", 104), ("Pressure (kPa)", 92),
                ("Total (kmol/h)", 92)] + [(f"{DATA['names'][c]} (kmol/h)", 96) for c in DATA["components"]]
        rowh, headh = 19, 24
        tw = sum(w for _, w in cols)
        out = []
        out.append(f'<text x="{x}" y="{y - 10}" font-family="{FONT}" font-size="12" font-weight="bold" fill="{INK}">'
                   f'Stream table: sample values (flows from a simple component-balance model; temperatures and pressures nominal, not computed)</text>')
        th = headh + rowh * len(nums)
        out.append(f'<rect x="{x}" y="{y}" width="{tw}" height="{th}" fill="none" stroke="{INK}" stroke-width="1.4"/>')
        out.append(f'<line x1="{x}" y1="{y + headh}" x2="{x + tw}" y2="{y + headh}" stroke="{INK}" stroke-width="1"/>')
        cx = x
        for name, w in cols:
            out.append(f'<text x="{cx + w / 2}" y="{y + 16}" font-family="{FONT}" font-size="{T_SMALL}" font-weight="bold" text-anchor="middle" fill="{INK}">{esc(name)}</text>')
            cx += w
            if cx < x + tw:
                out.append(f'<line x1="{cx}" y1="{y}" x2="{cx}" y2="{y + th}" stroke="{INK}" stroke-width="0.6"/>')
        for i, n in enumerate(nums):
            yy = y + headh + rowh * i
            if i:
                out.append(f'<line x1="{x}" y1="{yy}" x2="{x + tw}" y2="{yy}" stroke="{INK}" stroke-width="0.4"/>')
            s = DATA["streams"][str(n)]
            vals = [str(n), s["phase"], str(s["T"]), str(s["P"]), f'{s["total"]:.1f}'] + \
                   [f'{s["flows"][c]:.1f}' for c in DATA["components"]]
            keys = ["stream", "phase", "temp", "press", "total"] + DATA["components"]
            cx = x
            for (name, w), v, k in zip(cols, vals, keys):
                out.append(f'<text data-cell="{n}|{k}" x="{cx + w / 2}" y="{yy + 14}" font-family="{FONT}" font-size="{T_DATA}"'
                           f'{" font-weight=\"bold\"" if k == "stream" else ""} text-anchor="middle" fill="{INK}">{esc(v)}</text>')
                cx += w
        self.el_top.append(f'<g class="table">{"".join(out)}</g>')
        return (x, y, x + tw, y + th)

    def title_block(self, x=1190, y=1030, w=452, h=124):
        other = SHEETS[2 if self.no == 1 else 1][0]
        o = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="white" stroke="{INK}" stroke-width="1.6"/>']
        for yy in (y + 34, y + 62, y + 92):
            o.append(f'<line x1="{x}" y1="{yy}" x2="{x + w}" y2="{yy}" stroke="{INK}" stroke-width="0.8"/>')
        o.append(f'<line x1="{x + w / 2}" y1="{y + 92}" x2="{x + w / 2}" y2="{y + h}" stroke="{INK}" stroke-width="0.8"/>')
        t = lambda xx, yy, s, sz=11, b=False: o.append(
            f'<text x="{xx}" y="{yy}" font-family="{FONT}" font-size="{sz}"{" font-weight=\"bold\"" if b else ""} fill="{INK}">{esc(s)}</text>')
        t(x + 12, y + 23, f"Toluene hydrodealkylation (HDA) plant — {self.dwg}", 13, True)
        t(x + 12, y + 53, f"{self.section}  |  continued on {other}")
        t(x + 12, y + 82, "Sample process flow diagram; stream values are sample values")
        t(x + 12, y + 113, "Originator: Claude Code  |  2026-10-24", 10)
        t(x + w / 2 + 12, y + 113, f"Revision 1  |  Sheet {self.no} of 2", 10)
        self.el_top.append(f'<g class="titleblock">{"".join(o)}</g>')

    def notes(self, x, y, lines):
        o = []
        for i, s in enumerate(lines):
            o.append(f'<text x="{x}" y="{y + 14 * i}" font-family="{FONT}" font-size="{T_SMALL}"{" font-weight=\"bold\"" if i == 0 else ""} fill="{INK}">{esc(s)}</text>')
        self.el_top.append(f'<g class="notes">{"".join(o)}</g>')

    # ---------------------------------------------------------------- output
    def save(self, path):
        missing = {e[0] for e in self.expected} - set(self.streams)
        assert not missing, f"streams not drawn on sheet {self.no}: {sorted(missing)}"
        nomark = {e[0] for e in self.expected} - self.markers
        assert not nomark, f"streams without a number marker: {sorted(nomark)}"
        needed = {e[1] for e in self.expected} | {e[3] for e in self.expected}
        absent = {n for n in needed if n not in self.nodes and n not in self.junctions}
        assert not absent, f"nodes not placed: {sorted(absent)}"
        self.dots()
        head = [f'<rect x="0" y="0" width="{W}" height="{H}" fill="white"/>',
                f'<rect x="18" y="18" width="{W - 36}" height="{H - 36}" fill="none" stroke="{INK}" stroke-width="2.4"/>',
                f'<text class="lbl" x="60" y="58" font-family="{FONT}" font-size="22" font-weight="bold" fill="{INK}">PROCESS FLOW DIAGRAM — {self.dwg}</text>',
                f'<text class="lbl" x="60" y="80" font-family="{FONT}" font-size="13" fill="{INK}">Toluene hydrodealkylation to benzene  |  {self.section}  |  Sheet {self.no} of 2</text>']
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
               f'data-sheet="{self.no}">\n' + "\n".join(head + self.el_lines + self.el_sym + self.el_top) + "\n</svg>\n")
        assert "@@" not in svg and "None" not in svg
        pathlib.Path(path).write_text(svg)
        return path
