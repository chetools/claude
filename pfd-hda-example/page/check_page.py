"""Browser check of the built page (Playwright, headless Chromium).

Serves dist/ with python -m http.server on port 8766 (killed by PID afterwards),
then asserts: no page/console errors; every tab renders; fragment navigation;
sticky tab bar at both widths; no horizontal scroll at 390 px; header/body edges
at 2560 px; KaTeX; live run with stale note; ?selftest; screenshots in shots/.
Usage: python check_page.py [dist-file-name]
"""
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
DIST = HERE / "dist"
SHOTS = HERE / "shots"
PORT = 8766
NAME = sys.argv[1] if len(sys.argv) > 1 else "hda-plant-v1.html"
BASE = f"http://localhost:{PORT}/{NAME}"
FAILS, OKS = [], []


def check(cond, msg):
    (OKS if cond else FAILS).append(msg)
    print(("PASS  " if cond else "FAIL  ") + msg, flush=True)


def new_page(browser, width, height, errors):
    ctx = browser.new_context(viewport={"width": width, "height": height})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text} {m.location.get('url', '')}")
            if m.type == "error" and "favicon" not in m.location.get("url", "") else None)
    page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}")
            if r.status >= 400 and "favicon" not in r.url else None)
    return page


def tab(page, name):
    page.click(f"#tabbtn-{name}")
    page.wait_for_timeout(300)


def run_width(browser, width, height, tag, errors):
    page = new_page(browser, width, height, errors)
    page.goto(BASE)
    page.wait_for_selector("#chart-purge .main-svg", timeout=30000)
    page.wait_for_selector("#chart-conv .main-svg", timeout=30000)
    page.wait_for_timeout(800)
    check(page.locator("#cards .card").count() == 7, f"[{tag}] seven metric cards rendered")
    # horizontal scroll with App charts rendered
    sw = page.evaluate("document.documentElement.scrollWidth")
    check(sw == width, f"[{tag}] App panel scrollWidth {sw} == viewport {width}")
    page.screenshot(path=str(SHOTS / f"{tag}-app-top.png"))
    page.screenshot(path=str(SHOTS / f"{tag}-app-full.png"), full_page=True)
    for name in ("theory", "code"):
        tab(page, name)
        vis = page.evaluate(f"getComputedStyle(document.getElementById('panel-{name}')).display")
        check(vis != "none", f"[{tag}] {name} panel renders")
        sw = page.evaluate("document.documentElement.scrollWidth")
        check(sw == width, f"[{tag}] {name} panel scrollWidth {sw} == viewport {width}")
        page.screenshot(path=str(SHOTS / f"{tag}-{name}-full.png"), full_page=True)
    # walkthrough sub-tab
    page.click("#subtab-walkthrough")
    page.wait_for_timeout(800)
    n = page.locator("#code-walkthrough .js-plotly-plot").count()
    check(n == 2, f"[{tag}] walkthrough shows {n} Plotly figures")
    sw = page.evaluate("document.documentElement.scrollWidth")
    check(sw == width, f"[{tag}] walkthrough scrollWidth {sw} == viewport {width}")
    page.screenshot(path=str(SHOTS / f"{tag}-code-walkthrough-full.png"), full_page=True)
    page.click("#subtab-listings")
    # sticky tab bar after scrolling, per panel
    for name in ("app", "theory", "code"):
        tab(page, name)
        page.evaluate("window.scrollTo(0, 1500)")
        page.wait_for_timeout(300)
        y = page.evaluate("window.scrollY")
        top = page.evaluate("document.querySelector('nav.tabs').getBoundingClientRect().top")
        check(y >= 1000 and abs(top) <= 1, f"[{tag}] sticky tab bar top={top:.1f} after scrollY={y:.0f} on {name}")
    # clicking another tab while scrolled switches panels
    page.evaluate("window.scrollTo(0, 1500)")
    page.click("#tabbtn-theory")
    page.wait_for_timeout(300)
    check(page.evaluate("document.getElementById('panel-theory').classList.contains('active')"),
          f"[{tag}] clicking Theory while scrolled switches panel")
    # fragment navigation to a mid-theory section
    page.goto(BASE + "#theory-reactor")
    page.wait_for_timeout(600)
    act = page.evaluate("document.getElementById('panel-theory').classList.contains('active')")
    top = page.evaluate("document.getElementById('theory-reactor').getBoundingClientRect().top")
    check(act and 0 <= top < 200, f"[{tag}] #theory-reactor opens Theory with the section at top={top:.0f}px")
    page.screenshot(path=str(SHOTS / f"{tag}-fragment-theory-reactor.png"))
    page.goto(BASE + "#code-walkthrough-step-3")
    page.wait_for_timeout(800)
    top = page.evaluate("document.getElementById('code-walkthrough-step-3').getBoundingClientRect().top")
    check(page.evaluate("document.getElementById('panel-code').classList.contains('active')") and 0 <= top < 200,
          f"[{tag}] #code-walkthrough-step-3 opens Code/Walkthrough at top={top:.0f}px")
    # equipment index link
    page.goto(BASE + "#app")
    page.wait_for_timeout(400)
    page.click("#panel-app a[href='#theory-fired-heater']")
    page.wait_for_timeout(600)
    check(page.evaluate("location.hash") == "#theory-fired-heater"
          and page.evaluate("document.getElementById('panel-theory').classList.contains('active')"),
          f"[{tag}] equipment index link opens the Theory section")
    if tag == "desktop":
        tab(page, "theory")
        page.evaluate("window.scrollTo(0,0)")
        math = page.locator("#panel-theory .katex").count()
        check(math >= 3, f"[{tag}] KaTeX present in Theory ({math} elements)")
        txt = page.evaluate("document.body.innerText")
        check("$\\" not in txt, f"[{tag}] no raw '$\\' in visible text")
        for k in range(1, 8):
            el = page.locator(f"#fig-t{k}")
            el.scroll_into_view_if_needed()
            el.screenshot(path=str(SHOTS / f"figT{k}.png"))
        check(page.locator("figure.subdiagram").count() == 7, f"[{tag}] seven Fig. T crops")
    page.context.close()


def width_edges(browser, errors):
    page = new_page(browser, 2560, 1200, errors)
    page.goto(BASE)
    page.wait_for_selector("#chart-purge .main-svg", timeout=30000)
    r = page.evaluate("""() => { const q = s => document.querySelector(s).getBoundingClientRect();
        const h = q('header'), t = q('nav.tabs'), p = q('#panel-app');
        const hh = q('header h1'), st = q('#bootstatus'), bb = q('#bootbar');
        return {h:[h.left,h.right], t:[t.left,t.right], p:[p.left,p.right], bar:[bb.left,bb.right], h1:hh.left, st:st.left}; }""")
    ok = (abs(r["h"][0] - r["p"][0]) <= 1 and abs(r["h"][1] - r["p"][1]) <= 1
          and abs(r["h"][0] - r["t"][0]) <= 1 and abs(r["h"][1] - r["t"][1]) <= 1
          and abs(r["bar"][0] - r["p"][0]) <= 1 and abs(r["bar"][1] - r["p"][1]) <= 1)
    check(ok, f"[2560] header, progress bar, tab bar and body share edges {r}")
    page.screenshot(path=str(SHOTS / "wide-2560-app-top.png"))
    page.context.close()


def live(browser, errors):
    page = new_page(browser, 1440, 900, errors)
    t0 = time.time()
    page.goto(BASE + "?selftest")
    check(page.locator("#in-F").is_disabled(), "[live] controls disabled before the runtime boots")
    page.wait_for_function("window.SELFTEST !== undefined", timeout=240000)
    st = page.evaluate("window.SELFTEST")
    check(st.get("pass") is True and st["n"] > 100 and st["max_rel_diff"] <= 1e-9,
          f"[live] ?selftest {st} after {time.time() - t0:.0f} s")
    check(not page.locator("#btn-run").is_disabled(), "[live] Run enabled after boot")
    before = page.inner_text("#cards")
    page.fill("#in-X", "0.6")
    check(page.locator("#stale-note").is_visible(), "[live] stale note appears after editing X")
    page.click("#btn-run")
    page.wait_for_function("document.getElementById('out-note').textContent.indexOf('live Python run') >= 0", timeout=60000)
    after = page.inner_text("#cards")
    check(after != before, "[live] metric cards change after Run with X = 0.6")
    check(not page.locator("#stale-note").is_visible(), "[live] stale note clears after Run")
    page.wait_for_timeout(500)
    page.screenshot(path=str(SHOTS / "desktop-app-after-live-run.png"), full_page=True)
    # chart marker follows the run
    x_now = page.evaluate("document.getElementById('chart-conv').data[2].x[0]")
    check(abs(x_now - 0.6) < 1e-12, f"[live] conversion chart marks X = {x_now}")
    # invalid input
    page.fill("#in-F", "5")
    page.click("#btn-run")
    page.wait_for_function("document.getElementById('run-error').style.display === 'block'", timeout=30000)
    msg = page.inner_text("#run-error")
    check("must lie between" in msg and "Traceback" not in msg, f"[live] invalid input message: {msg!r}")
    check(page.locator("#stale-note").is_visible(), "[live] stale note stays after a rejected run")
    page.screenshot(path=str(SHOTS / "desktop-app-invalid.png"))
    page.context.close()


def main():
    SHOTS.mkdir(exist_ok=True)
    assert (DIST / NAME).exists(), f"{DIST / NAME} missing"
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--directory", str(DIST)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    errors = []
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
            run_width(browser, 1440, 900, "desktop", errors)
            run_width(browser, 390, 844, "phone", errors)
            width_edges(browser, errors)
            live(browser, errors)
            browser.close()
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except subprocess.TimeoutExpired:
            srv.kill()
    check(not errors, f"no page errors or console errors ({len(errors)}): {errors[:5]}")
    print(f"\n{len(OKS)} passed, {len(FAILS)} failed")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
