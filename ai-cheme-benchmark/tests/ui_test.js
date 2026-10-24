// Usage: python -m http.server 8765 (from the project dir), then: node tests/ui_test.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/dist/ai-cheme-benchmark-standalone.html';
const SHOTS = path.join(__dirname, 'screens');
let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  for (const [label, w, h] of [['desktop', 1280, 900], ['phone', 390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !/katex|fonts|net::ERR/i.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(BASE + '?selftest', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => window.SELFTEST);
    ok(st && st.pass, `${label}: ?selftest passes (${st && st.details.length} checks)`);
    if (st && !st.pass) console.log(JSON.stringify(st.details.filter(d => !d.pass), null, 1));
    ok(await page.evaluate(() => window.PWNED === undefined), `${label}: hostile model text not executed`);
    const noHscroll = async (tag) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${label}: no horizontal scroll (${tag}) scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`);
    for (const tab of ['panel-results', 'panel-problems', 'panel-method', 'panel-code']) {
      await page.click(`button[data-tab=${tab}]`);
      await page.waitForTimeout(500);
      const visible = await page.evaluate(t => !document.getElementById(t).hidden, tab);
      ok(visible, `${label}: tab ${tab} visible`);
      if (tab === 'panel-results') {
        const n = await page.evaluate(() => document.querySelectorAll('#panel-results .js-plotly-plot').length);
        ok(n === 4, `${label}: 4 plotly charts (${n})`);
        ok(await page.evaluate(() => document.querySelectorAll('#model-table tbody tr').length === window.DATA.models.length), `${label}: one table row per model`);
      }
      if (tab === 'panel-problems') {
        ok(await page.evaluate(() => document.querySelectorAll('#toc-prob a').length === window.DATA.problems.length), `${label}: one problem TOC entry per problem`);
        ok(await page.evaluate(() => document.querySelectorAll('.prob details.resp').length === new Set(window.DATA.responses.map(r => r.model + '/' + r.problem)).size), `${label}: one response block per model and problem`);
        ok(await page.evaluate(() => document.querySelectorAll('.prob .katex').length > 0), `${label}: math rendered`);
      }
      if (tab === 'panel-code') {
        ok(await page.evaluate(() => document.querySelectorAll('#toc-code a').length >= 14), `${label}: code TOC entries`);
        ok(await page.evaluate(() => document.body.innerText.includes('The MoLab notebook is editable; run all cells once after opening')), `${label}: MoLab caption`);
        ok(await page.evaluate(() => /molab\.marimo\.io\/github\/chetools\/claude\/blob\/gh-pages\/ai-cheme-benchmark\/solutions_molab\.py/.test(document.querySelector('#panel-code a.primary').href)), `${label}: MoLab link`);
      }
      if (tab === 'panel-method') ok(await page.evaluate(() => document.querySelectorAll('#toc-meth a').length === document.querySelectorAll('#panel-method h2').length && document.querySelectorAll('#toc-meth a').length >= 8), `${label}: methodology TOC lists every section`);
      await noHscroll(tab);
      await page.screenshot({ path: path.join(SHOTS, `${label}-${tab}.png`), fullPage: false });
    }
    // filter: untick a topic, check metrics and selftest on the filtered state
    await page.click('button[data-tab=panel-results]');
    await page.evaluate(() => { document.querySelector('input[data-group=topic]').click(); });
    await page.waitForTimeout(500);
    const prob = await page.evaluate(() => document.querySelectorAll('#metrics .m-value')[2].textContent);
    ok(+prob < 12 && +prob > 0, `${label}: topic filter reduces problems to ${prob}`);
    await page.screenshot({ path: path.join(SHOTS, `${label}-filtered.png`), fullPage: true });
    ok(errors.length === 0, `${label}: no console/page errors ${errors.join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `${failures} FAILURES` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
