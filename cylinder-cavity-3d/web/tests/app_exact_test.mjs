// real build, ?selftest on CPU and swiftshader GPU: node app_exact_test.mjs
import { createRequire } from 'module'; import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const SH = new URL('./shots/', import.meta.url).pathname;
const U = 'http://localhost:8795/dist/cylinder-cavity-3d-standalone.html';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--no-sandbox'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
for (const [name, q, w, h] of [['cpu', '?cpu&selftest&N=16&Nz=2', 1280, 1000], ['gpu', '?selftest&blit&N=32&Nz=4&method=fv', 1280, 1000], ['cpu390', '?cpu&selftest&N=16&Nz=2', 390, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(U + q);
  await p.waitForFunction('window.SELFTEST_RESULT', null, { timeout: 900000 });
  const r = await p.evaluate(() => { const s = SELFTEST_RESULT; return { ok: s.ok, err: s.error, n: s.rows.length, bad: s.rows.filter((x) => !x.pass).length, exact: (s.exact || []).map((e) => ({ m: e.method, b: e.backend, t: e.t, steps: e.steps, tol: e.tol, pp: e.parityPass,
    rows: e.rows.map((x) => ({ q: x.q, got: x.got, np: x.numpy, ex: x.exact, par: x.parity, errEx: x.errExact, npErr: x.numpyErrExact, pass: x.pass })) })),
    cross: s.cross && s.cross.out, sw: [document.documentElement.scrollWidth, innerWidth] }; });
  console.log(name, JSON.stringify(r, null, 1));
  ok(r.ok && r.n > 0 && !r.err, `${name}: selftest ok (${r.n} rows, ${r.bad} failing)`);
  ok(r.exact.length === (name === 'gpu' ? 4 : 2), `${name}: exact cases ${r.exact.length}`);
  ok(r.sw[0] <= r.sw[1], `${name}: no horizontal scroll`); ok(errs.length === 0, `${name}: console errors ${errs.join(' / ')}`);
  await p.locator('#val-exact-table').scrollIntoViewIfNeeded();
  await p.screenshot({ path: SH + `exact_${name}.png`, fullPage: true }); await p.close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
