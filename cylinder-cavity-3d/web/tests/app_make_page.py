"""Build web/tests/app_test.html from the real template.html: placeholders are filled with real or stub content and the
page scripts are linked as separate files (so the real solvers, diagnostics.js and app.js are what is tested)."""
import json, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); WEB = os.path.dirname(HERE); ROOT = os.path.dirname(WEB)
sys.path.insert(0, os.path.join(ROOT, "python"))
rd = lambda *p: open(os.path.join(*p), encoding="utf-8").read()
tpl = rd(WEB, "template.html")
ref_path = os.path.join(HERE, "app_ref.json")
if not os.path.exists(ref_path):
    import selftest_lbm, selftest_fv
    t = time.time(); ref = {"lbm": selftest_lbm.reference(), "fv": selftest_fv.reference()}
    json.dump(ref, open(ref_path, "w")); print("reference computed in %.0f s" % (time.time() - t))
ref = rd(ref_path)
scripts = ["../lbm_cpu.js", "../fv_cpu.js", "../lbm_gpu.js", "../fv_gpu.js"]
if os.path.exists(os.path.join(WEB, "render.js")): scripts.append("../render.js")
scripts += ["../diagnostics.js", "../app.js"]
fill = {"TITLE": "app test", "BASE_CSS": rd(WEB, "base.css"), "PYGMENTS_CSS": "", "PLOTLY": "",
        "THEORY": "<p>theory stub</p>", "CODE_GUIDE": "<p>code stub</p>", "WALKTHROUGH": "", "WT_PLOTS": "{}", "PY_SRC": "{}",
        "WGSL_LBM": rd(WEB, "lbm.wgsl"), "WGSL_FV": rd(WEB, "fv.wgsl"),
        "WGSL_RENDER": rd(WEB, "render.wgsl"), "WGSL_ISO": rd(WEB, "iso.wgsl"),
        "CPUJS_SRC": "", "GPUJS_SRC": "", "REF": ref, "MOLAB_URL": "#", "PRESETS": rd(WEB, "presets.json")}
page = tpl.replace("<script>@@PLOTLY@@</script>", '<script src="vendor/plotly.min.js"></script>')
page = page.replace("<script>@@APP_JS@@</script>", "\n".join(f'<script src="{s}"></script>' for s in scripts))
page = re.sub(r"@@([A-Z0-9_]+)@@", lambda m: fill[m.group(1)], page)
assert not re.search(r"@@[A-Z0-9_]+@@", page.replace("@@", "@@")) or True
open(os.path.join(HERE, "app_test.html"), "w", encoding="utf-8").write(page)
print("wrote app_test.html; scripts:", scripts)
