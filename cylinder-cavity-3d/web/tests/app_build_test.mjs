// real build: node app_build_test.mjs   (serves dist/ via python -m http.server 8795 from project root)
import { createRequire } from 'module'; import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const SH = new URL('./shots/', import.meta.url).pathname;
const U = 'http://localhost:8795/dist/cylinder-cavity-3d-standalone.html';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
for (const [name, q, w, h] of [['gpu', '?blit&N=32&Nz=8&preset=transition&Re=300', 1280, 1000], ['cpu390', '?cpu&N=16&Nz=2&method=fv', 390, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(U + q);
  await p.waitForFunction('window.CC3APP && CC3APP.sim.last && CC3APP.sim.H.t.length > 3', null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  for (const t of ['Theory', 'Code', 'App']) { await p.click(`.tabs button:text-is("${t}")`); await p.waitForTimeout(300); }
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({ sw: [document.documentElement.scrollWidth, innerWidth], err: document.getElementById('err').textContent,
    metrics: [...document.querySelectorAll('.metric')].map((m) => m.innerText.replace(/\n/g, ' | ')), t: CC3APP.sim.s3.t, b: CC3APP.sim.backend }));
  console.log(name, JSON.stringify(info, null, 1));
  ok(info.sw[0] <= info.sw[1], name + ': no horizontal scroll'); ok(!info.err, name + ': no #err'); ok(errs.length === 0, name + ': console errors ' + errs.join(' / '));
  await p.screenshot({ path: SH + `build_${name}.png`, fullPage: true }); await p.close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
