// Runs the WebGPU solver in headless Chromium (SwiftShader) and compares it with
// the CPU solver on the same bed.  Usage: node web/gpu_check.cjs
// Needs playwright (PW env var may point to its package directory).
'use strict';
const fs = require('fs');
const path = require('path');
const {chromium} = require(process.env.PW || 'playwright');

const W = __dirname;
const read = (f) => fs.readFileSync(path.join(W, f), 'utf8');
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: fs.existsSync(exe) ? exe : undefined,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader',
      '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface']});
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  await page.route('https://check.local/', (r) => r.fulfill({contentType: 'text/html', body: '<!doctype html><title>check</title>'}));
  await page.goto('https://check.local/');
  await page.addScriptTag({content: `const LBM_WGSL = ${JSON.stringify(read('lbm.wgsl'))};
const RENDER_WGSL = ${JSON.stringify(read('render.wgsl'))};`});
  for (const f of ['bed.js', 'cpu.js', 'gpu.js']) await page.addScriptTag({content: read(f)});
  const r = await page.evaluate(async () => {
    const nx = 96, ny = 48, D = 12;
    const solid = rasterize(nx, ny, placeDisks(nx, ny, 0.65, D, 'random', 0, 2, 5));
    const dev = await GpuLbm.device();
    dev.device.pushErrorScope('validation');
    const gpu = new GpuLbm(dev, nx, ny, solid, null);
    const cpu = new CpuLbm(nx, ny, solid);
    const [wp, wm] = trtRates(0.9), [twp, twm] = tracerRates(0.03);
    const prm = {wp, wm, gx: 2e-5, gy: 0, twp, twm, cIn: 1, det: [10, 48, 90]};
    gpu.setParams(prm); cpu.setParams(prm);
    gpu.step(400, {tracer: false}); cpu.step(400, {tracer: false});
    gpu.inject(20); cpu.inject(20);
    gpu.step(300); cpu.step(300);
    const err = await dev.device.popErrorScope();
    const a = await gpu.readFields(), b = cpu.fields;
    let du = 0, umax = 0, dc = 0;
    for (let k = 0; k < nx * ny; k++) {
      du = Math.max(du, Math.abs(a[4 * k] - b[4 * k]), Math.abs(a[4 * k + 1] - b[4 * k + 1]));
      umax = Math.max(umax, Math.abs(b[4 * k]));
      dc = Math.max(dc, Math.abs(a[4 * k + 3] - b[4 * k + 3]));
    }
    const sg = await gpu.stats(), sc = await cpu.stats();
    return {err: err && err.message, name: dev.name, du, umax, dc, sumUx: [sg.sumUx, sc.sumUx], det: [sg.det, sc.det],
      clock: [sg.clock, sc.clock], mass: [sg.mass, sc.mass], maxC: [sg.maxC, sc.maxC]};
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
  const ok = !r.err && r.du < 1e-5 * r.umax && r.dc < 1e-5 && r.clock[0] === r.clock[1]
    && r.maxC[0] > 0 && Math.abs(r.maxC[0] - r.maxC[1]) < 1e-5;
  console.log(ok ? 'GPU CHECK PASSED' : 'GPU CHECK FAILED');
  process.exit(ok ? 0 : 1);
})();
