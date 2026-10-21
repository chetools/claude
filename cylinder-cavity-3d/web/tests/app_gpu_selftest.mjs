// GPU self-test rows on swiftshader: node app_gpu_selftest.mjs [url]
import { createRequire } from 'module'; import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } }); const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e))); p.on('crash', () => console.log('PAGE CRASH'));
await p.goto(process.argv[2] || 'http://localhost:8795/web/tests/app_test.html?blit&preset=agree&method=fv&N=32&Nz=4&Re=200');
await p.waitForFunction('window.CC3APP && CC3APP.sim.ready', null, { timeout: 90000 });
await p.click('#b-play');
const r = await p.evaluate(async () => { const r = await CC3APP.runValidation({ cpu: false, gpu: true, cross: true });
  return { ok: r.ok, err: r.error, rows: r.rows.map((x) => [x.method, x.name, x.expected, x.got, x.reldiff, x.tol, x.pass]), cross: r.cross && r.cross.out }; });
for (const x of r.rows) console.log(x[0], x[1].slice(0, 90), 'rel', x[4].toExponential(2), 'tol', x[5], x[6] ? 'pass' : 'FAIL');
console.log('ok', r.ok, 'err', r.err || '', 'cross', JSON.stringify(r.cross));
await p.screenshot({ path: new URL('./shots/app_gpu_validation.png', import.meta.url).pathname, fullPage: true });
console.log('console errors:', errs.length, errs.join(' / '));
await b.close();
