// Run the Performance-tab race on the built page and print the result cards.
//   node tests/race.js URL [case]
const {chromium} = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const url = process.argv[2] || 'http://localhost:8765/heat-exchanger-network-standalone.html';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, {waitUntil: 'load'});
  await p.waitForFunction(() => document.getElementById('m-lp').textContent.includes('$/yr'), null, {timeout: 60000});
  if (process.argv[3]) { await p.selectOption('#in-case', process.argv[3]); await p.waitForTimeout(2000); }
  await p.click('[data-tab="panel-perf"]');
  await p.waitForFunction(() => !document.getElementById('race-go').disabled, null, {timeout: 300000});
  await p.click('#race-go');
  await p.waitForFunction(() => /Done|Failed/.test(document.getElementById('race-status').textContent), null, {timeout: 600000});
  console.log(await p.$eval('#race-status', (e) => e.textContent));
  console.log(await p.$eval('#race-metrics', (e) => e.innerText.replace(/\n+/g, ' | ')), errs);
  await b.close();
})();
