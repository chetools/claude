// node app_test.mjs  (server: python3 -m http.server 8795 from the project root)
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const BASE = 'http://localhost:8795/web/tests/app_test.html';
const SH = new URL('./shots/', import.meta.url).pathname;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--no-sandbox'] }).catch(async () =>
  chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] }));
async function open(q, w = 1280, h = 1000) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + q);
  return { page, errs, ctx };
}
const wait = (page, expr, ms = 60000) => page.waitForFunction(expr, null, { timeout: ms });

// ---- 1. CPU fallback, real solvers, LBM then FV
for (const method of ['lbm', 'fv']) {
  const { page, errs } = await open(`?cpu&preset=agree&method=${method}&N=32&Nz=4&Re=200`);
  await wait(page, 'CC3APP && CC3APP.sim.ready && CC3APP.sim.last && CC3APP.sim.last.t3 > 0.05');
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const s = CC3APP.sim; return { t2: s.s2.t, t3: s.s3.t, n: s.H.t.length, backend: s.backend,
    metrics: [...document.querySelectorAll('.metric')].map((m) => m.innerText.replace(/\n/g, ' | ')), warn: document.getElementById('warn').innerText,
    plots: ['plot-spanwise', 'plot-spectra', 'plot-history'].map((id) => document.getElementById(id).data.length), Lz: s.p3.Lz }; });
  console.log(method, JSON.stringify(st, null, 1));
  ok(st.backend === 'cpu', `${method}: cpu backend`);
  ok(Math.abs(st.t2 - st.t3) < 1e-9 * st.t3 + 1e-12, `${method}: lockstep t2=${st.t2} t3=${st.t3}`);
  ok(st.n >= 3, `${method}: history grows (${st.n})`);
  ok(st.plots.every((n) => n >= 2), `${method}: three plots drawn ${st.plots}`);
  // controls
  await page.click('#in-raw');
  await page.selectOption('#in-field', 'q'); await page.selectOption('#in-field', 'wz'); await page.selectOption('#mode3d', 'slice-xz');
  await page.click('#in-avg'); await page.click('#b-play');
  const n0 = await page.evaluate(() => CC3APP.sim.s3.nstep); await page.waitForTimeout(800);
  ok(n0 === await page.evaluate(() => CC3APP.sim.s3.nstep), `${method}: pause stops stepping`);
  await page.click('#b-play');
  await page.selectOption('#in-span', 'walls'); await wait(page, 'CC3APP.sim.p3.span === "walls" && CC3APP.sim.ready && CC3APP.sim.last');
  await page.waitForTimeout(1500);
  const nk = await page.evaluate(() => document.getElementById('plot-spanwise').data.length);
  ok(nk === 2, `${method}: walls -> only Ew and E3d in spanwise plot (${nk})`);
  await page.click('#b-reset'); await page.waitForTimeout(600);
  await page.screenshot({ path: SH + `app_cpu_${method}.png`, fullPage: true });
  ok(errs.length === 0, `${method}: no console errors ${errs.join(' / ')}`);
  await page.context().close();
}
// ---- 2. validation + selftest (CPU, real solvers vs numpy reference)
{
  const { page, errs } = await open('?cpu&selftest&N=16&Nz=2');
  await wait(page, 'window.SELFTEST_RESULT', 240000);
  const r = await page.evaluate(() => { const s = SELFTEST_RESULT; return { ok: s.ok, n: s.rows.length, worst: Math.max(...s.rows.map((x) => x.reldiff)), cross: s.cross && s.cross.out, err: s.error }; });
  console.log('selftest', JSON.stringify(r));
  ok(r.ok && r.n > 0, `selftest rows ${r.n} all pass, worst rel diff ${r.worst}`);
  ok(!!r.cross, 'cross-method comparison ran');
  await page.screenshot({ path: SH + 'app_selftest.png', fullPage: true });
  ok(errs.length === 0, 'selftest: no console errors ' + errs.join(' / '));
  await page.context().close();
}
// ---- 3. phone width, no horizontal scroll
{
  const { page, errs } = await open('?cpu&N=16&Nz=2&method=fv', 390, 900);
  await wait(page, 'CC3APP && CC3APP.sim.last && CC3APP.sim.H.t.length > 2'); await page.waitForTimeout(1200);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(sw[0] <= sw[1], `390 px: scrollWidth ${sw[0]} <= ${sw[1]}`);
  await page.screenshot({ path: SH + 'app_phone.png', fullPage: true });
  ok(errs.length === 0, 'phone: no console errors ' + errs.join(' / '));
  await page.context().close();
}
// ---- 4. GPU path (swiftshader) with the real GPU solvers and the mock renderer; ?blit; Save PNG
{
  const { page, errs } = await open('?blit&preset=agree&method=fv&N=32&Nz=4&Re=200');
  const g = await page.evaluate(async () => !!navigator.gpu && !!(await navigator.gpu.requestAdapter()));
  console.log('webgpu adapter available:', g);
  if (g) {
    await wait(page, 'window.CC3APP && (CC3APP.sim.last || document.getElementById("err").textContent)', 90000);
    const e = await page.evaluate(() => document.getElementById('err').textContent); if (e) console.log('ERR text:', e);
    await page.waitForTimeout(4000);
    const st = await page.evaluate(() => ({ b: CC3APP.sim.backend, n: CC3APP.sim.s3 && CC3APP.sim.s3.nstep, t2: CC3APP.sim.s2.t, t3: CC3APP.sim.s3.t, pill: document.getElementById('backend-pill').innerText }));
    console.log('gpu', JSON.stringify(st));
    ok(st.b === 'gpu' && st.n > 0, 'gpu backend stepping'); ok(Math.abs(st.t2 - st.t3) < 1e-6, 'gpu lockstep');
    for (const m of ['volume', 'isosurface', 'slice-yz']) { await page.selectOption('#mode3d', m); await page.selectOption('#mode2d', m); await page.waitForTimeout(1500); }
    await page.selectOption('#in-field', 'q'); await page.waitForTimeout(1500); await page.selectOption('#mode3d', 'isosurface'); await page.waitForTimeout(1500);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#b-png')]);
    await dl.saveAs(SH + 'app_save.png'); ok(true, 'Save PNG downloaded ' + dl.suggestedFilename());
    await page.screenshot({ path: SH + 'app_gpu.png', fullPage: true });
    const gv = await page.evaluate(async () => { const r = await CC3APP.runValidation({ cpu: false, gpu: true, cross: true });
      return { ok: r.ok, err: r.error, rows: r.rows.map((x) => [x.method, x.name, x.expected, x.got, x.reldiff, x.tol, x.pass]), cross: r.cross && r.cross.out }; });
    console.log('GPU SELFTEST', JSON.stringify(gv.rows.map((r) => [r[0], r[1].slice(-60), +r[4].toExponential(2), r[5], r[6]]), null, 0));
    console.log('GPU cross', JSON.stringify(gv.cross), gv.err || '');
    ok(gv.ok && gv.rows.length > 0, `GPU self-test rows ${gv.rows.length} pass=${gv.rows.filter((r) => r[6]).length}`);
    await page.screenshot({ path: SH + 'app_gpu_validation.png', fullPage: true });
  }
  ok(errs.length === 0, 'gpu: no console errors ' + errs.join(' / '));
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
