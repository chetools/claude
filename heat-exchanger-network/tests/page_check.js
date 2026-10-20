// Drive the built page like a user (Playwright + preinstalled Chromium).
//   python -m http.server 8765 --directory dist &   node tests/page_check.js [url] [outdir]
// Checks: no page/console errors, every tab renders, LP/MILP cards fill, grid
// clicks work, step 1-3 and the optimizer run, a live Python run works,
// no horizontal scroll at 390 px.  Screenshots go to outdir.
const {chromium} = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const url = process.argv[2] || 'http://localhost:8765/heat-exchanger-network-standalone.html';
const out = process.argv[3] || '/tmp/hen-shots';
require('fs').mkdirSync(out, {recursive: true});
const proxy = process.env.HTTPS_PROXY ? {server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1'} : undefined;

(async () => {
  const browser = await chromium.launch({proxy, args: ['--ignore-certificate-errors']});
  const errors = [];
  const ctx = await browser.newContext({viewport: {width: 1400, height: 1000}, ignoreHTTPSErrors: true});
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const t0 = Date.now();
  await page.goto(url, {waitUntil: 'load'});
  await page.waitForFunction(() => document.getElementById('m-lp').textContent.includes('$/yr'), null, {timeout: 60000});
  await page.waitForFunction(() => /\d/.test(document.getElementById('m-mi').textContent), null, {timeout: 60000});
  console.log('cards:', await page.$eval('.metrics', (e) => e.innerText.replace(/\s+/g, ' ')), `(${Date.now() - t0} ms)`);
  await page.screenshot({path: `${out}/01-app.png`, fullPage: true});
  // sequential
  await page.click('[data-tab="sub-seq"]');
  await page.waitForFunction(() => document.getElementById('seq-status').textContent === 'Done.', null, {timeout: 120000});
  console.log('seq:', await page.$eval('#seq-units p', (e) => e.innerText));
  await page.screenshot({path: `${out}/02-seq.png`, fullPage: true});
  // grid: hot H1 stage 1 then cold C1 stage 1
  await page.click('[data-tab="sub-grid"]');
  await page.waitForSelector('#g-net svg');
  const seg = async (s) => page.$eval(`[data-seg="${s}"]`, (el) => el.dispatchEvent(new MouseEvent('click', {bubbles: true})));
  await seg('h,0,0'); await seg('c,0,0');
  await page.waitForTimeout(300);
  console.log('grid after 1 match:', await page.$eval('#g-tac', (e) => e.textContent), await page.$eval('#g-tac-sub', (e) => e.textContent));
  await seg('h,1,1'); await seg('c,0,1');
  await page.waitForTimeout(300);
  console.log('grid after 2 matches:', await page.$eval('#g-tac', (e) => e.textContent));
  // forbidden partner greyed: select H2 (hydrocarbon) and look for dashed C2
  await seg('h,1,0');
  const dashed = await page.$$eval('#g-net line[stroke-dasharray]', (l) => l.length);
  console.log('greyed cold streams with H2 selected:', dashed);
  await page.screenshot({path: `${out}/03-grid.png`, fullPage: true});
  // optimizer (short)
  await page.click('[data-tab="sub-sa"]');
  await page.fill('#sa-iters', '80'); await page.fill('#sa-epochs', '2');
  await page.click('#sa-go');
  await page.waitForFunction(() => /Best TAC|No feasible|Failed/.test(document.getElementById('sa-status').textContent), null, {timeout: 120000});
  console.log('SA:', await page.$eval('#sa-status', (e) => e.textContent));
  await page.screenshot({path: `${out}/04-sa.png`, fullPage: true});
  // every top tab and sub tab
  for (const tab of ['panel-theory', 'panel-python', 'panel-rust', 'panel-compare', 'panel-perf', 'panel-bench']) {
    await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(400);
    const subs = await page.$$eval(`#${tab} .tabs button`, (b) => b.map((x) => x.dataset.tab));
    for (const s of subs) { await page.click(`[data-tab="${s}"]`); await page.waitForTimeout(250); }
    if (subs.length) await page.click(`[data-tab="${subs[0]}"]`);
    await page.screenshot({path: `${out}/05-${tab}.png`, fullPage: false});
  }
  // Python live run + comparison
  await page.click('[data-tab="panel-python"]');
  await page.waitForFunction(() => !document.getElementById('wt-live').disabled, null, {timeout: 240000});
  await page.click('#wt-live');
  await page.waitForFunction(() => /re-ran live|failed/.test(document.getElementById('wt-status').textContent), null, {timeout: 300000});
  console.log('walkthrough:', await page.$eval('#wt-status', (e) => e.textContent));
  const cellErr = await page.$$eval('.wt-out pre.err', (e) => e.map((x) => x.textContent.slice(0, 200)));
  if (cellErr.length) errors.push('walkthrough cell errors: ' + cellErr.join(' | '));
  await page.click('[data-tab="panel-compare"]'); await page.click('#cmp-go');
  await page.waitForFunction(() => /Done|Failed/.test(document.getElementById('cmp-status').textContent), null, {timeout: 300000});
  console.log('compare:', await page.$eval('#cmp-status', (e) => e.textContent),
    'verdicts:', await page.$$eval('#cmp-out td.pass, #cmp-out td.fail', (t) => t.map((x) => x.textContent).join(',')));
  await page.screenshot({path: `${out}/06-compare.png`, fullPage: true});
  // benchmark "Show"
  await page.click('[data-tab="panel-bench"]');
  await page.click('[data-bench="0"]');
  await page.waitForTimeout(800);
  console.log('benchmark 0 in grid:', await page.$eval('#g-tac', (e) => e.textContent), await page.$eval('#g-status', (e) => e.textContent));
  await page.screenshot({path: `${out}/07-bench-grid.png`, fullPage: true});
  // phone width
  const phone = await browser.newPage({viewport: {width: 390, height: 844}});
  phone.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
  await phone.goto(url, {waitUntil: 'load'});
  await phone.waitForTimeout(3000);
  for (const tab of ['panel-app', 'panel-theory', 'panel-python', 'panel-bench']) {
    await phone.click(`[data-tab="${tab}"]`); await phone.waitForTimeout(300);
    const sw = await phone.evaluate(() => [document.documentElement.scrollWidth, document.body.scrollWidth]);
    console.log('phone', tab, 'scrollWidth', sw);
    if (Math.max(...sw) > 392) errors.push(`horizontal scroll at 390 px on ${tab}: ${sw}`);
  }
  await phone.click('[data-tab="panel-app"]');
  await phone.screenshot({path: `${out}/08-phone.png`, fullPage: false});
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page or console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
