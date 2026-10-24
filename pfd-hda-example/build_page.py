"""Build dist/index.html (the gh-pages page) from the delivered sheets and the
verification report. Fails on any unfilled @@PLACEHOLDER@@.

usage: python build_page.py   (expects out/PFD-20x-r1.* and out/verify-report.json)
"""
import html, json, pathlib, re, shutil

HERE = pathlib.Path(__file__).parent
OUT, DIST = HERE / "out", HERE / "dist"
REV = "r1"
TOPO = json.loads((HERE / "topology.json").read_text())
REP = json.loads((OUT / "verify-report.json").read_text())
ANNEX = {"feed_1": "A.1", "product_1": "A.2", "pump_1": "A.3", "compressor_1": "A.4",
         "heat_exchanger_1": "A.6", "flash_1": "A.7", "vessel_1": "A.8", "scds_1": "A.9",
         "control_valve_1": "A.12", "fired_heater_x": "S5 addition (provisional)",
         "packed_reactor_x": "S5 addition (provisional)"}

TEMPLATE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HDA process flow diagram</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#5a5a5a;--rule:#d8d8d8;--accent:#1f4e8c}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#16181b;--fg:#e8e8e8;--muted:#a8adb3;--rule:#3a3f45;--accent:#8db4ff}}
:root[data-theme="dark"]{--bg:#16181b;--fg:#e8e8e8;--muted:#a8adb3;--rule:#3a3f45;--accent:#8db4ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.col{max-width:1180px;margin:0 auto;padding:0 16px}
header.col{padding-top:28px}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 8px}
h2{font-size:1.2rem;margin:34px 0 10px}
p{margin:0 0 12px}
.muted{color:var(--muted)}
figure{margin:18px 0 6px}
figure img{display:block;width:100%;height:auto;background:#fff;border:1px solid var(--rule)}
figcaption{font-size:.92rem;color:var(--muted);margin-top:6px}
a{color:var(--accent)}
.tbl{overflow-x:auto}
table{border-collapse:collapse;font-size:.92rem;margin:8px 0 14px;min-width:100%}
th,td{border-bottom:1px solid var(--rule);padding:5px 10px;text-align:left;vertical-align:top}
th{font-weight:600}
td.num{text-align:right;white-space:nowrap}
ul{margin:0 0 12px;padding-left:22px}
footer.col{padding-bottom:40px;font-size:.88rem;color:var(--muted)}
</style></head>
<body>
<header class="col">
<h1>Toluene hydrodealkylation (HDA) plant: process flow diagram</h1>
<p class="muted">Two A3 sheets drawn with the process-flow-diagram-drawing skill under specification PFD-SPEC-001 v2.0, and checked by an independent verifier. Stream values are sample values from a simple component-balance model, not a converged simulation.</p>
</header>
<main class="col">
<h2 id="sheet1">Sheet 1: PFD-201, reaction section</h2>
<figure><a href="@@S1@@.svg"><img src="@@S1@@.svg" alt="Process flow diagram PFD-201, HDA reaction section"></a>
<figcaption>Download: <a href="@@S1@@.pdf">PDF (A3)</a> · <a href="@@S1@@.svg">SVG</a> · <a href="@@S1@@.png">PNG</a></figcaption></figure>
<h2 id="sheet2">Sheet 2: PFD-202, separation section</h2>
<figure><a href="@@S2@@.svg"><img src="@@S2@@.svg" alt="Process flow diagram PFD-202, HDA separation section"></a>
<figcaption>Download: <a href="@@S2@@.pdf">PDF (A3)</a> · <a href="@@S2@@.svg">SVG</a> · <a href="@@S2@@.png">PNG</a></figcaption></figure>

<h2 id="record">Compliance record</h2>
<p>Measured from the drawing geometry by <code>verify.py</code> (PFD-SPEC-001 section 12). Crossings N<sub>c</sub>, total bends N<sub>b</sub>, most bends on one stream b<sub>max</sub>, total routed length L<sub>t</sub> at final size, smallest clear spacing between parallel lines s<sub>min</sub> (limit: more than 10 mm).</p>
<div class="tbl"><table>
<tr><th>Sheet</th><th>N<sub>c</sub></th><th>N<sub>b</sub></th><th>b<sub>max</sub></th><th>L<sub>t</sub> (mm)</th><th>s<sub>min</sub> (mm)</th><th>Hard failures</th></tr>
@@SCORES@@
</table></div>
<p>Hard-failure checks run on both sheets: topology (edge list re-derived from the drawn line end points and compared with the frozen topology), port axis and final straight, junction dots, arrowheads at inlets, jogs, parallel spacing, stream numbers against stream-table rows, label overlaps and line transits on the rendered page, and all @@NBAL@@ unit balances plus the overall carbon and hydrogen balance recomputed from the displayed table values.</p>

<h2 id="symbols">Symbol variants</h2>
<div class="tbl"><table>
<tr><th>Item</th><th>Service</th><th>Annex A entry</th><th>Library key</th></tr>
@@SYMBOLS@@
</table></div>
<p>H-201 and R-201 have no Annex A entry. They are drawn with project-local symbols added under requirement S5, in a conventional form. These two symbols have not been checked against ISO 10628-2. The library marks <code>vessel_1</code> (V-201, V-204, V-205) as Conditional in its own verification record.</p>

<h2 id="basis">Basis of the stream values</h2>
<ul>
@@BASIS@@
</ul>
<p>The model runs twice: once in floating point and once in integer tenths of kmol/h, where every split is rounded and its last outlet is taken by difference. Every displayed balance therefore closes exactly. The two runs differ by at most @@DEV@@ kmol/h on any stream and component. Temperatures and pressures are nominal sample values and were not computed.</p>
</main>
<footer class="col"><p>Source: <a href="https://github.com/chetools/claude/tree/master/pfd-hda-example">chetools/claude, pfd-hda-example</a>. Revision 1, 2026-10-24.</p></footer>
</body></html>
"""

BASIS = [
    "Fresh toluene 100.0 kmol/h. Hydrogen make-up is 95 mol% H<sub>2</sub> and 5 mol% CH<sub>4</sub>, sized so that H<sub>2</sub>/toluene = 5 at the reactor inlet.",
    "Reactions T + H<sub>2</sub> → B + CH<sub>4</sub>, with toluene conversion per pass 0.75, and 2 B → D + H<sub>2</sub>, with extent 0.005 × the first extent.",
    "Purge: 25 % of the high-pressure separator vapour. The separators use fixed fractions of each component to the vapour.",
    "Columns: fixed recoveries to the distillate. Reflux ratio 1.2 (T-201) and 0.8 (T-202). Boil-up total equals the overhead vapour total, with composition proportional to relative volatility × bottoms composition.",
]


def main():
    import model
    Sf, _ = model.run(model.Arith(False)); St, _ = model.run(model.Arith(True))
    dev = max(abs(Sf[n][c] - St[n][c]) for n in Sf for c in model.C)
    rows = []
    for k in ("sheet 1", "sheet 2"):
        v = REP[k]
        nfail = sum(1 for f in REP["hard_failures"] if f.startswith(f"[{k}]"))
        rows.append(f'<tr><td>{"PFD-201" if k.endswith("1") else "PFD-202"}</td><td class="num">{v["Nc"]}</td>'
                    f'<td class="num">{v["Nb"]}</td><td class="num">{v["bmax"]}</td><td class="num">{v["Lt_mm"]}</td>'
                    f'<td class="num">{v["smin_mm"]}</td><td class="num">{nfail}</td></tr>')
    assert not REP["hard_failures"], REP["hard_failures"]
    sym = []
    for node, m in TOPO["nodes"].items():
        if m["kind"] == "equip":
            sym.append(f'<tr><td>{html.escape(m["tag"])}</td><td>{html.escape(m["service"])}</td>'
                       f'<td>{ANNEX[m["key"]]}</td><td><code>{m["key"]}</code></td></tr>')
    fill = {"S1": f"PFD-201-{REV}", "S2": f"PFD-202-{REV}", "SCORES": "\n".join(rows),
            "SYMBOLS": "\n".join(sym), "BASIS": "\n".join(f"<li>{b}</li>" for b in BASIS),
            "NBAL": str(len(REP["balances_checked"]) - 1), "DEV": f"{dev:.2f}"}
    page = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: fill[m.group(1)], TEMPLATE)
    left = re.findall(r"@@[A-Z0-9_]+@@", page)
    assert not left, left
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(page)
    for s in ("PFD-201", "PFD-202"):
        for ext in ("svg", "pdf", "png"):
            shutil.copy(OUT / f"{s}-{REV}.{ext}", DIST / f"{s}-{REV}.{ext}")
    print("page written:", DIST / "index.html")


if __name__ == "__main__":
    main()
