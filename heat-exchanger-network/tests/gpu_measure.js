// WebGPU batch measurement on the built page (headed Chromium under xvfb with
// SwiftShader, or a real GPU): loads a benchmark network, presses Measure and
// writes benchmarks/gpu_measurement.json.
//   xvfb-run -a node tests/gpu_measure.js http://localhost:8765/heat-exchanger-network-standalone.html
const {chromium} = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const url = process.argv[2] || 'http://localhost:8765/heat-exchanger-network-standalone.html';
const bench = Number(process.argv[3] || 4);       // row of the Benchmarks table
(async () => {
  const browser = await chromium.launch({headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan',
    '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface']});
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, {waitUntil: 'load'});
  await page.waitForFunction(() => document.getElementById('m-lp').textContent.includes('$/yr'), null, {timeout: 60000});
  await page.click('[data-tab="panel-bench"]');
  await page.click(`[data-bench="${bench}"]`);
  await page.waitForTimeout(1500);
  await page.click('[data-tab="panel-perf"]');
  await page.selectOption('#gpu-n', '65536');
  await page.click('#gpu-go');
  await page.waitForFunction(() => window.GPU_LAST || /Failed|No WebGPU|not available/.test(document.getElementById('gpu-status').textContent), null, {timeout: 600000});
  const r = await page.evaluate(() => window.GPU_LAST || {error: document.getElementById('gpu-status').textContent});
  console.log(JSON.stringify(r), errs);
  if (r.error) process.exit(1);
  const rec = Object.assign({}, r, {where: `headless-style Chromium ${browser.version()} with SwiftShader (software WebGPU), ${os.cpus().length}-core build container`, date: new Date().toISOString().slice(0, 10)});
  fs.writeFileSync(path.join(__dirname, '..', 'benchmarks', 'gpu_measurement.json'), JSON.stringify(rec, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });
