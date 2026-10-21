// node web/tests/particles_test.mjs   (server: python3 -m http.server 8795 from the project root; page: app_make_page.py)
// Flow particles: CPU fallback and WebGPU (swiftshader). Checks: no console errors, trails change the picture in every
// view, the particle count and trail-length controls work, the tracer self-test rows pass, 390 px has no horizontal scroll.
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const BASE = 'http://localhost:8795/web/tests/app_test.html';
const SH = new URL('./shots/', import.meta.url).pathname;
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
async function open(q, w = 1280, h = 1000) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + q);
  return { page, errs, ctx };
}
const wait = (page, expr, ms = 120000) => page.waitForFunction(expr, null, { timeout: ms });
// pixels of panel w (GPU: the renderer's offscreen read-back; CPU: the canvas)
const pixels = (page, w) => page.evaluate(async (w) => {
  const s = CC3APP.sim;
  if (s.backend === 'gpu') { await CC3APP.drawPanels(); const im = await s.renderers[w].readPixels(); return Array.from(im.data.filter((_, i) => i % 4 === 0)); }
  await CC3APP.drawPanels(); const cv = s.canvases[w]; return Array.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.filter((_, i) => i % 4 === 0));
}, w);
const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 12) n++; return n; };
async function trailsVisible(page, w, label, min = 300) {     // pause, compare the same frame with and without the trails
  const on = await pixels(page, w);
  await page.evaluate((w) => { const s = CC3APP.sim; s._keep = s.tracers[w]; s.tracers[w] = null; if (s.renderers[w]) s.renderers[w].tracers = null; }, w);
  const off = await pixels(page, w);
  await page.evaluate((w) => { const s = CC3APP.sim; s.tracers[w] = s._keep; if (s.renderers[w]) s.renderers[w].tracers = s._keep; }, w);
  const n = changed(on, off);
  ok(n > min, `${label}: trails change ${n} pixels of panel ${w} (> ${min})`);
  return n;
}

// ---- 1. CPU fallback (slices)
{
  const { page, errs } = await open('?cpu&preset=agree&method=fv&N=32&Nz=16&Re=200');
  await wait(page, 'CC3APP && CC3APP.sim.ready && CC3APP.sim.last && CC3APP.sim.s3.t > 0.3 && CC3APP.sim.tracers[3] && CC3APP.sim.tracers[3].frame > 8');
  const st = await page.evaluate(() => ({ n: +document.getElementById('in-part').value, T: CC3APP.sim.tracers[3].trailTime, keep2: CC3APP.sim.tracers[2].draw.keep, keep3: CC3APP.sim.tracers[3].draw.keep, f: CC3APP.sim.tracers[3].frame, sref: CC3APP.sim.sref }));
  console.log('cpu', JSON.stringify(st));
  ok(st.n === 8000 && Math.abs(st.T - 0.05 * Math.sqrt(20)) < 1e-12, 'cpu: default 8000 particles, trail time 0.05*sqrt(20)');
  ok(Math.abs(st.keep2 - 0.5) < 1e-12 && st.keep3 === 1, `cpu xy slices, N = 32, Nz = 16 (slab = half the span): the 2D panel draws 1/2 (${st.keep2}), the 3D panel all (${st.keep3})`);
  ok(await page.evaluate(() => [...document.querySelectorAll('#canvas2d')].length === 1 && !document.getElementById('trail-bar').hidden), 'cpu: speed colour bar shown');
  await page.click('#b-play');
  for (const m of ['slice-xy', 'slice-xz', 'slice-yz']) {
    await page.selectOption('#mode3d', m); await page.selectOption('#mode2d', m);
    const min = m === 'slice-xy' ? 300 : 30;
    await trailsVisible(page, 3, `cpu ${m}`, min); await trailsVisible(page, 2, `cpu ${m}`, min);
  }
  await page.selectOption('#mode3d', 'slice-xy'); await page.selectOption('#mode2d', 'slice-xy');
  await page.click('#b-play'); await page.waitForTimeout(2500);
  await page.screenshot({ path: SH + 'particles_cpu.png', fullPage: false });
  await page.selectOption('#in-part', '0'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => CC3APP.sim.tracers[3] === null), 'cpu: off removes the tracers');
  await page.selectOption('#in-part', '3000'); await page.waitForTimeout(800);
  ok(await page.evaluate(() => CC3APP.sim.tracers[3].np === 3000), 'cpu: 3000 particles');
  await page.fill('#in-trail', '1'); await page.dispatchEvent('#in-trail', 'input');
  ok(await page.evaluate(() => CC3APP.sim.tracers[3].trailTime === 1), 'cpu: trail length 1 -> 1 time unit');
  const v = await page.evaluate(async () => { const r = await CC3APP.runValidation({ cpu: true });
    return r.rows.filter((x) => x.method === 'particles').map((x) => [x.name, x.got, x.tol, x.pass]); });
  v.forEach((r) => console.log('  ', r[3] ? 'pass' : 'FAIL', r[1], r[0]));
  ok(v.length === 6 && v.every((r) => r[3]), `cpu: ${v.length} particle self-test rows pass`);
  ok(errs.length === 0, 'cpu: no console errors ' + errs.join(' / '));
  await page.context().close();
}
// ---- 2. WebGPU (swiftshader): every view, self-test, Save PNG
{
  const { page, errs } = await open('?blit&preset=agree&method=lbm&N=32&Nz=8&Re=200');
  const g = await page.evaluate(async () => !!navigator.gpu && !!(await navigator.gpu.requestAdapter()));
  ok(g, 'webgpu adapter available');
  if (g) {
    await wait(page, 'CC3APP && CC3APP.sim.ready && CC3APP.sim.backend === "gpu" && CC3APP.sim.tracers[3] && CC3APP.sim.tracers[3].frame > 8 && CC3APP.sim.s3.t > 0.3');
    await page.click('#b-play');
    for (const m of ['slice-xy', 'slice-xz', 'slice-yz', 'volume', 'isosurface']) {
      await page.selectOption('#mode3d', m); await page.selectOption('#mode2d', m);
      const min = m === 'slice-xz' || m === 'slice-yz' ? 30 : 300;
      await trailsVisible(page, 3, `gpu ${m}`, min); await trailsVisible(page, 2, `gpu ${m}`, min);
      await page.waitForTimeout(300);
      await page.screenshot({ path: SH + `particles_gpu_${m}.png`, clip: { x: 300, y: 250, width: 980, height: 600 } });
    }
    const v = await page.evaluate(async () => { const r = await CC3APP.runValidation({ gpu: true });
      return { rows: r.rows.filter((x) => x.method === 'particles').map((x) => [x.name, x.got, x.tol, x.pass]), err: r.error }; });
    v.rows.forEach((r) => console.log('  ', r[3] ? 'pass' : 'FAIL', r[1], r[0]));
    if (v.err) console.log(v.err);
    ok(v.rows.length === 6 && v.rows.every((r) => r[3]), `gpu: ${v.rows.length} particle self-test rows pass`);
    await page.selectOption('#in-part', '50000'); await page.click('#b-play'); await page.waitForTimeout(4000);
    ok(await page.evaluate(() => CC3APP.sim.tracers[3].np === 50000 && CC3APP.sim.tracers[3].frame > 1), 'gpu: 50000 particles run');
  }
  ok(errs.length === 0, 'gpu: no console errors ' + errs.join(' / '));
  await page.context().close();
}
// ---- 3. phone width
{
  const { page, errs } = await open('?cpu&N=16&Nz=2&method=fv', 390, 900);
  await wait(page, 'CC3APP && CC3APP.sim.last && CC3APP.sim.H.t.length > 2'); await page.waitForTimeout(1200);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  ok(sw[0] <= sw[1], `390 px: scrollWidth ${sw[0]} <= ${sw[1]}`);
  await page.screenshot({ path: SH + 'particles_phone.png', fullPage: false });
  ok(errs.length === 0, 'phone: no console errors ' + errs.join(' / '));
  await page.context().close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
