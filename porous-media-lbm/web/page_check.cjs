// Drives the built page in Chromium: scripted clicks and inputs, metric read-outs,
// screenshots, and a list of console errors at the end.
//
//   xvfb-run -a node web/page_check.cjs dist/porous-media-lbm-standalone.html OUTDIR [options] STEP...
//
// Options: --cpu (no WebGPU, exercises the JavaScript fallback), --headless (no xvfb needed, but a
// WebGPU canvas cannot present there; fine with --cpu), --width=N (viewport, default 1400),
// --notebook=PATH (served as walkthrough_molab.py).
// Steps (run in order):
//   wait:MS          wait, then print the metric cards
//   click:ID:MS      click #ID, then wait
//   set:ID:VALUE     set an input/select and fire its input/change event
//   preset:NAME      choose a sidebar preset
//   tab:NAME         click the tab button data-tab=NAME, then a full-page screenshot NAME.png
//   snap:NAME        viewport screenshot NAME.png
//   text:ID          print the text of #ID
// Example: tracer pulse on the CPU fallback
//   xvfb-run -a node web/page_check.cjs dist/porous-media-lbm-standalone.html /tmp/shots --cpu \
//     wait:20000 click:btn-inject:60000 tab:sub-rtd text:rtd-table
// Needs playwright (PW env var may point to its package directory) and the Chromium in /opt/pw-browsers.
'use strict';
const fs = require('fs');
const path = require('path');
const {chromium} = require(process.env.PW || 'playwright');

const argv = process.argv.slice(2);
const opts = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v === undefined ? true : v];
}));
const [pagePath, outDir, ...steps] = argv.filter((a) => !a.startsWith('--'));
if (!pagePath || !outDir) { console.error('usage: node page_check.cjs PAGE.html OUTDIR [options] STEP...'); process.exit(2); }
fs.mkdirSync(outDir, {recursive: true});
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GPU_FLAGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'];
const METRICS = ['m-eps', 'm-re', 'm-k', 'm-dp', 'm-dl', 'm-mlups', 'conv', 'bed-info', 'backend-pill', 'py-pill', 'err', 'gpu-warn'];

(async () => {
  const browser = await chromium.launch({headless: !!opts.headless, executablePath: fs.existsSync(exe) ? exe : undefined,
    args: opts.cpu ? [] : GPU_FLAGS});
  const page = await browser.newPage({viewport: {width: +(opts.width || 1400), height: 1000}});
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('error: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  // WebGPU needs a secure context: serve from an https origin
  const html = fs.readFileSync(pagePath, 'utf8');
  await page.route('https://site.local/', (r) => r.fulfill({contentType: 'text/html', body: html}));
  if (opts.notebook) {
    const nb = fs.readFileSync(opts.notebook, 'utf8');
    await page.route('https://site.local/walkthrough_molab.py', (r) => r.fulfill({contentType: 'text/plain', body: nb}));
  }
  await page.goto('https://site.local/');
  const shot = (name, fullPage = false) => page.screenshot({path: path.join(outDir, name + '.png'), fullPage});
  const metrics = () => page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id), sub = document.getElementById(id + '-sub');
    return id + ': ' + (el.hidden ? '(hidden)' : el.textContent.trim().replace(/\s+/g, ' ')) + (sub ? ' | ' + sub.textContent : '');
  }).join('\n'), METRICS);
  for (const s of steps) {
    const [cmd, a, b] = s.split(':');
    if (cmd === 'wait') { await page.waitForTimeout(+a); console.log(await metrics()); }
    else if (cmd === 'click') { await page.click('#' + a); await page.waitForTimeout(+(b || 500)); }
    else if (cmd === 'set') {
      await page.evaluate(([id, val]) => {
        const el = document.getElementById(id);
        if (el.type === 'checkbox') el.checked = val === 'true'; else el.value = val;
        el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input'));
      }, [a, s.slice(cmd.length + a.length + 2)]);
      await page.waitForTimeout(800);
    } else if (cmd === 'preset') { await page.selectOption('#in-preset', a); await page.waitForTimeout(500); }
    else if (cmd === 'tab') { await page.click(`button[data-tab="${a}"]`); await page.waitForTimeout(1500); await shot(a, true); }
    else if (cmd === 'snap') await shot(a);
    else if (cmd === 'text') console.log(a, '=>', await page.evaluate((id) => document.getElementById(id).innerText, a));
    else throw new Error('unknown step ' + s);
  }
  console.log('--- console errors ---\n' + (errs.join('\n') || '(none)'));
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
