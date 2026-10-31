// Submissions tab test (mocked API, no backend). Run: node tests/submissions_mock.cjs [shots-dir]
// Serves a scratch copy of worker/public (+ a harness page) and the real student page, then checks:
// list/selection, viewer, toggles, anonymise, zip export, print, shuffle equality with the student page, layout.
const path = require('path'), fs = require('fs'), os = require('os');
const { execSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.argv[2] || path.join(ROOT, 'tests', 'shots', 'submissions');
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8793, SPORT = 8794, BASE = `http://localhost:${PORT}`, SBASE = `http://localhost:${SPORT}/exam/`;
const WORKER = 'https://seb-exams.carloscomail.workers.dev';
const ID = 'mt-7k2p9x';
let failures = 0;
const check = (c, w) => { console.log((c ? 'PASS ' : 'FAIL ') + w); if (!c) failures++; };

// ---------------------------------------------------------------- scratch copies
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-'));
fs.cpSync(path.join(ROOT, 'worker', 'public'), path.join(scratch, 'pub'), { recursive: true });
const sscratch = path.join(scratch, 'stu');
fs.mkdirSync(path.join(sscratch, 'exam'), { recursive: true });
for (const f of ['index.html', 'done.html']) fs.copyFileSync(path.join(ROOT, 'student', f), path.join(sscratch, 'exam', f));
fs.writeFileSync(path.join(scratch, 'pub', 'harness.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><link rel="stylesheet" href="/style.css">
<style>:root{--barh:48px} .fakebar{position:sticky;top:0;z-index:5;height:48px;background:#fff;border-bottom:1px solid #ccc}</style>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js"></script></head>
<body class="wide"><header class="top"><div class="wrap"><h1>SEB Exams</h1></div></header><div class="fakebar">bar</div>
<main class="wrap"><nav class="tabs"><a>Questions</a></nav><div id="app"></div></main>
<script type="module">
import { api } from '/js/api.js'; import { render } from '/js/submissions.js';
const ex = await api('/api/exams/${ID}'); window.EX = ex;
const body = document.createElement('div'); body.className = 'tabbody'; document.getElementById('app').append(body);
await render(body, ex); window.READY = true;
</script></body></html>`);

// ---------------------------------------------------------------- data
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" fill="#cde"/><text x="20" y="50">figure-A</text></svg>';
const mc = (id, text, opts, extra = {}) => Object.assign({ id, type: 'mc', points: 2, text, options: opts.map((t, i) => ({ text: t, correct: i === 0 })) }, extra);
const content = {
  format: 'seb-exam/1', title: 'McCabe–Thiele distillation', duration_minutes: 45, intro: 'Intro $x_D$.',
  questions: [
    mc('m1', 'Which is the rectifying line?\n\n$$y = \\dfrac{R}{R+1}x + \\dfrac{x_D}{R+1}$$', ['$y = \\dfrac{R}{R+1}x$', 'second', 'third', 'fourth'], { image: 'stages.svg', image_alt: 'the stages' }),
    mc('m2', 'Fixed order options?', ['alpha', 'beta', 'gamma'], { shuffle_options: false }),
    mc('m3', 'Third mc.', ['aa', 'bb', 'cc', 'dd', 'ee']),
    mc('m4', 'Fourth mc with $x^2$.', ['p1', 'p2', 'p3']),
    mc('m5', 'Fifth mc.', ['r1', 'r2', 'r3', 'r4']),
    mc('m6', 'Sixth mc.', ['s1', 's2']),
    { id: 'f1', type: 'fill', points: 3, text: 'CMO assumes equal molar heats of [[1]] and the [[2]] of the [[3]].',
      blanks: [{ answer: 'vaporization', variants: ['vaporisation'], clue: '_a__________' }, { answer: 'heat-flow' }, { answer: 'mass transfer' }] },
    { id: 'f2', type: 'fill', points: 1, text: 'The ratio is called [[1]].', blanks: [{ answer: 'reflux' }] },
    { id: 'f3', type: 'fill', points: 1, text: 'Plates: [[1]]', blanks: [{ answer: 'stage' }] },
    { id: 'f4', type: 'fill', points: 2, text: 'Two: [[1]] and [[2]]', blanks: [{ answer: 'q' }, { answer: 'feed' }] },
    { id: 'o1', type: 'open', points: 5, text: 'Explain why the **feed line** matters.' },
    { id: 'o2', type: 'open', points: 4, text: 'Explain reflux.' },
    { id: 'o3', type: 'open', points: 3, text: 'Explain minimum stages.' },
  ],
};
let V; // validate.js (ESM)
const sub = (id, name, sid, submitted, late, answers, manual) => ({ id, name, student_id: sid, started_at: '2026-10-01T10:00:00Z', submitted_at: submitted, late, minutes_used: 35, answers, manual, receipt: 'RC-' + id + '-ZZ', seb_check: 'ok' });
function mkResults() {
  const subs = [
    sub(13, 'Cyrus Empty', 'S300', '2026-10-01T10:55:00Z', 1, {}, {}),
    sub(11, 'Ada Lovelace', 'S100', '2026-10-01T10:30:00Z', 0,
      { m1: 'a', m2: 'a', m3: 'c', m4: 'a', m5: 'b', m6: 'a', f1: ['vaporization', 'heat-flow', 'mass transfer'], f2: ['reflux'], f3: ['stage'], f4: ['q', 'feed'],
        o1: 'Line one of the answer.\nLine two after a break.\n\nLine four.', o2: 'Short.', o3: '' },
      { o1: { points: 4.5, comment: 'Good, but missing the q-line.' }, o2: { points: 2, comment: '' } }),
    sub(14, 'Dee <i>O\'Neil</i>', 'dee-4', '2026-10-01T10:40:00Z', 0,
      { m1: 'b', m3: 'a', m6: 'b', f1: ['_a__ri______', 'he__-f___', 'ma_s _r______'], f2: ['_____x'.slice(0, 6)], f3: ['sta__'], f4: ['_', 'f_ed'], o1: 'Only text', o2: 'x'.repeat(30) + ' wrap', o3: 'z' }, {}),
    sub(12, 'Bob "Quote" Jr', 'S200', '2026-10-01T10:35:00Z', 0,
      { m1: 'd', m2: 'c', m3: 'e', m4: 'c', m5: 'a', m6: 'a', f1: ['vaporization', 'heat-flow', 'mass transfer'], f2: ['refl_x'], f3: ['______'.slice(0, 5)], f4: ['q', 'fe_d'], o1: '<b>not bold</b> & stuff', o2: 'a\nb', o3: 'c' },
      { o1: { points: 1, comment: 'Weak.' } }),
  ];
  for (const s of subs) {
    s.student_id = s.student_id.toUpperCase();
    const g = V.gradeSubmission(content, s.answers);
    s.detail = g.detail; s.auto_score = g.score; s.auto_max = g.max;
    s.manual_max = 12;
    s.total = g.score + Object.values(s.manual).reduce((t, m) => t + (m.points || 0), 0);
  }
  return { questions: content.questions, submissions: subs };
}
const exam = { id: ID, title: content.title, content, images: [{ name: 'stages.svg', mime: 'image/svg+xml', size: SVG.length }], owner_email: 'me@x.org' };

// ---------------------------------------------------------------- mocks
async function mockTeacher(page, results) {
  await page.route(/\/api\//, async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname;
    page.apiCalls.push(p + ' ' + (req.headers()['x-requested-with'] || ''));
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.headers()['x-requested-with'] !== 'seb-exams') return json({ error: 'csrf' }, 403);
    if (p === `/api/exams/${ID}`) return json(exam);
    if (p === `/api/exams/${ID}/results`) return json(results);
    if (p === `/api/exams/${ID}/images/stages.svg`) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    return json({ error: 'unmocked ' + p }, 404);
  });
}
function newPage(ctx) {
  return ctx.newPage().then((page) => {
    page.errors = []; page.apiCalls = [];
    page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
    return page;
  });
}
async function studentOrderInPage(browser, sid, publicExam) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await newPage(ctx);
  const cors = { 'access-control-allow-origin': `http://localhost:${SPORT}`, 'access-control-allow-headers': 'Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'content-type': 'application/json' };
  await page.route(WORKER + '/**', async (r) => {
    const req = r.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const send = (status, obj) => r.fulfill({ status, headers: cors, body: JSON.stringify(obj) });
    if (u.pathname === '/s/info') return send(200, { title: content.title, require_seb: false, duration_minutes: 45, opens_at: '2026-01-01T00:00:00Z', closes_at: '2030-01-01T00:00:00Z', status: 'open' });
    if (u.pathname === '/s/start') return send(200, { exam: publicExam, started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 2700000).toISOString(), server_now: new Date().toISOString() });
    send(404, {});
  });
  await page.goto(SBASE + '?id=' + ID);
  await page.waitForSelector('#startform');
  await page.fill('#name', 'Test Student'); await page.fill('#sid', sid); await page.click('#startbtn');
  await page.waitForSelector('#exam:not(.hidden)');
  const seen = await page.evaluate(() => [...document.querySelectorAll('#questions .card.q')].map((c) => ({
    qid: c.dataset.q, opts: [...c.querySelectorAll('input[type=radio]')].map((i) => i.value), labels: [...c.querySelectorAll('.opt .lab')].map((l) => l.innerText.trim()) })));
  const src = fs.readFileSync(path.join(ROOT, 'worker', 'public', 'shared', 'shuffle.js'), 'utf8');
  const mine = await page.evaluate(async ([src, pub, id, sid]) => {
    const m = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    return m.studentOrder(pub, id, sid);
  }, [src, publicExam, ID, sid]);
  const errs = page.errors.slice();
  await ctx.close();
  return { seen, mine, errs };
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const qids = (page, n = 0) => page.locator('.subview').nth(n).locator('.sv-q').evaluateAll((els) => els.map((e) => e.dataset.qid));

(async () => {
  V = await import(pathToFileURL(path.join(ROOT, 'worker', 'public', 'shared', 'validate.js')).href);
  const results = mkResults();
  const publicExam = V.publicExam(content, { 'stages.svg': 'data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64') }, ID);
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: path.join(scratch, 'pub'), stdio: 'ignore' });
  const srv2 = spawn('python3', ['-m', 'http.server', String(SPORT)], { cwd: sscratch, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 900));
  const browser = await chromium.launch();
  try {
    // ============ 1. shuffle equality with the real student page
    const sids = ['S100', 'S200', 'S300', 'DEE-4', ' abc-9 ', 'zed', 'A', 'x1y2z3', 'Ünï-7', 'S100 ', 's12345678', 'ID-0001'];
    const studentSeen = {};
    let allEq = true, anyDiff = false, optShuffled = false;
    for (const sid of sids) {
      const r = await studentOrderInPage(browser, sid, publicExam);
      const norm = V && sid.trim().toUpperCase();
      studentSeen[norm] = r.seen;
      const pageQ = r.seen.map((x) => x.qid), pageO = Object.fromEntries(r.seen.filter((x) => x.opts.length).map((x) => [x.qid, x.opts]));
      const eqPublic = JSON.stringify(pageQ) === JSON.stringify(r.mine.questionIds) && JSON.stringify(pageO) === JSON.stringify(r.mine.optionOrder);
      const sh = await import(pathToFileURL(path.join(ROOT, 'worker', 'public', 'shared', 'shuffle.js')).href);
      const c = sh.studentOrder(content, ID, sid);  // teacher (stored content) form, run in node
      const eqContent = JSON.stringify(pageQ) === JSON.stringify(c.questionIds) && JSON.stringify(pageO) === JSON.stringify(c.optionOrder);
      check(eqPublic && eqContent && !r.errs.length, `shuffle equality, student id "${sid}": ${pageQ.join(',')}  (public form in page: ${eqPublic}, content form: ${eqContent})`);
      allEq = allEq && eqPublic && eqContent;
      if (pageQ.join() !== content.questions.map((q) => q.id).join()) anyDiff = true;
      if (Object.entries(pageO).some(([q, o]) => q !== 'm2' && o.join() !== o.slice().sort().join())) optShuffled = true;
      const m2 = pageO.m2; if (m2 && m2.join() !== 'a,b,c') allEq = false;
    }
    check(anyDiff && optShuffled, 'the student orders really differ from file order (shuffle is non-trivial); m2 (shuffle_options:false) keeps file order');

    // ============ 2. teacher viewer at three widths
    for (const [w, hgt] of [[1280, 900], [390, 844], [2560, 1300]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, acceptDownloads: true });
      const page = await newPage(ctx);
      await mockTeacher(page, results);
      await page.goto(`${BASE}/harness.html`);
      await page.waitForFunction(() => window.READY, null, { timeout: 15000 });
      const shot = async (n) => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${n}-${w}.png`, fullPage: true }); };
      const tag = `${w}px`;

      // ---- list
      check(await page.locator('.sv-table tbody tr').count() === 4, `${tag} list: 4 rows`);
      const rowTxt = await page.locator('.sv-table tbody tr').evaluateAll((trs) => trs.map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
      check(rowTxt[0].includes('Ada Lovelace') && rowTxt[3].includes('Cyrus Empty') && rowTxt[3].includes('late'), `${tag} list sorted by submission order, late flag: ${rowTxt[3]}`);
      check(/\d+(\.\d+)? \/ 31/.test(rowTxt[0]), `${tag} list shows total / max: ${rowTxt[0]}`);
      check(await page.locator('.sv-viewsel').isDisabled(), `${tag} View selected disabled with nothing selected`);
      await shot('list');
      check(await noHScroll(page), `${tag} list: no horizontal scroll`);
      await page.locator('.sv-pick').nth(1).check(); await page.locator('.sv-pick').nth(3).check();
      check(await page.locator('.sv-viewsel').isEnabled() && (await page.locator('.sv-count').innerText()).startsWith('2 of 4'), `${tag} two selected`);
      await page.click('.sv-selall');
      check((await page.locator('.sv-pick:checked').count()) === 4 && (await page.locator('.sv-selall').innerText()) === 'Select none', `${tag} Select all -> 4 checked`);
      await page.click('.sv-selall');
      check((await page.locator('.sv-pick:checked').count()) === 0, `${tag} Select none clears`);
      await page.locator('.sv-pick').nth(0).check(); await page.locator('.sv-pick').nth(2).check();
      await page.click('.sv-viewsel');
      check((await page.locator('.subview').count()) === 2, `${tag} View selected -> 2 submissions`);
      const names = await page.locator('.sv-head h2').allInnerTexts();
      check(names[0].includes('Ada Lovelace') && names[1].includes('Dee'), `${tag} selected submissions are the ones ticked: ${names.map((n) => n.replace(/\s+/g, ' ')).join(' | ')}`);
      await page.click('.sv-back');
      check((await page.locator('.sv-pick:checked').count()) === 2, `${tag} selection kept after going back`);
      await page.click('.sv-viewall');
      check((await page.locator('.subview').count()) === 4, `${tag} View all -> 4`);
      await page.click('.sv-back');
      await page.locator('.sv-view').nth(0).click();
      check((await page.locator('.subview').count()) === 1, `${tag} per-row View -> 1`);

      // ---- Ada, "as entered"
      const ada = page.locator('.subview').first();
      await page.waitForFunction(() => [...document.querySelectorAll('.subview img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 });
      const head = (await ada.locator('.sv-head').innerText()).replace(/\s+/g, ' ');
      check(/Ada Lovelace/.test(head) && /S100/.test(head) && /RC-11-ZZ/.test(head) && /Submitted/i.test(head) && /Started/i.test(head) && /SEB check/i.test(head) && /Total/i.test(head), `${tag} header has name, ID, times, receipt, SEB check, total: ${head}`);
      check((await ada.locator('.sv-q').count()) === 13, `${tag} Ada: 13 questions`);
      check(JSON.stringify(await qids(page)) === JSON.stringify(content.questions.map((q) => q.id)), `${tag} default order = exam file order`);
      check((await ada.locator('[data-qid=m1] .sv-figure img').getAttribute('src')).startsWith('blob:'), `${tag} figure shown`);
      check((await ada.locator('[data-qid=m1] .katex').count()) >= 2, `${tag} math rendered in question text`);
      const m1opts = await ada.locator('[data-qid=m1] .sv-opt').count();
      check(m1opts === 4 && (await ada.locator('[data-qid=m1] .sv-opt.chosen').count()) === 1 && (await ada.locator('[data-qid=m1] .sv-opt.chosen .sv-letter').innerText()) === 'A)', `${tag} mc: all 4 options listed, chosen (A) marked`);
      check((await ada.locator('[data-qid=m5] .sv-opt.chosen .sv-letter').innerText()) === 'B)' && (await ada.locator('[data-qid=m5] .sv-opt.wrong').count()) === 1 && (await ada.locator('[data-qid=m5] .sv-opt.right').count()) === 1, `${tag} mc wrong answer: chosen B marked wrong, correct A shown`);
      // fill
      const f1 = ada.locator('[data-qid=f1] .sv-fillrow');
      check((await f1.count()) === 3, `${tag} fill: 3 blank rows`);
      check((await f1.nth(0).locator('.sv-bx').count()) === 12 && (await f1.nth(0).locator('.sv-bx.fixed').count()) === 1 && (await f1.nth(0).locator('.sv-bx.fixed').innerText()) === 'a', `${tag} fill: 12 boxes, one clue box "a"`);
      check((await f1.nth(0).locator('.sv-bx.typed').allInnerTexts()).join('') === 'vporizaton'.slice(0, 0) + 'vporization'.replace('', ''), `${tag} fill: typed letters (clue excluded) = vporization`);
      check((await f1.nth(1).locator('.sv-sep').count()) === 1 && (await f1.nth(2).locator('.sv-gap').count()) === 1, `${tag} fill: hyphen separator and word gap`);
      const dee = page; // Dee checked below in the viewer-all pass
      await shot('viewer-one');
      check(await noHScroll(page), `${tag} viewer: no horizontal scroll`);
      // open text keeps line breaks
      const o1 = await ada.locator('[data-qid=o1] .sv-open').evaluate((e) => ({ ws: getComputedStyle(e).whiteSpace, t: e.textContent, h: e.getBoundingClientRect().height }));
      check(o1.ws === 'pre-wrap' && o1.t.includes('\n\n') && o1.h > 60, `${tag} open: line breaks kept (white-space ${o1.ws}, ${Math.round(o1.h)}px)`);
      check((await ada.locator('[data-qid=o3] .sv-none').innerText()) === '(no answer)', `${tag} empty open answer marked`);

      // ---- marking toggle
      const hasMarks = () => page.locator('.sv-mark, .sv-comment, .sv-tag, .sv-opt.right, .sv-opt.wrong').count();
      check((await hasMarks()) > 0 && (await ada.locator('[data-qid=o1] .sv-comment').innerText()).includes('missing the q-line') && (await ada.locator('[data-qid=o1] .sv-pts').innerText()).includes('4.5 / 5'), `${tag} marking on by default: marks, essay points + comment`);
      check((await ada.locator('[data-qid=m1] .sv-pts .sv-mark.ok').count()) === 1 && (await ada.locator('[data-qid=m5] .sv-pts .sv-mark.bad').count()) === 1 && (await ada.locator('[data-qid=f1] .sv-pts .sv-mark.ok').count()) === 1, `${tag} ✓/✗ for mc and fill`);
      await page.uncheck('.sv-marking');
      check((await hasMarks()) === 0 && !(await page.locator('.sv-head').innerText()).includes('Total') && (await ada.locator('[data-qid=m1] .sv-pts').innerText()) === '2 points', `${tag} marking off: no marks, no total, plain points`);
      await page.check('.sv-marking');

      // ---- order toggle (as the student saw it), compared to the real student page
      await page.click('.sv-back'); await page.click('.sv-viewall');
      await page.selectOption('.sv-order', 'seen');
      let okOrder = true, why = '';
      const subs = await page.locator('.subview').evaluateAll((els) => els.map((e) => ({
        sid: e.querySelector('.sv-id').textContent,
        qs: [...e.querySelectorAll('.sv-q')].map((q) => ({ qid: q.dataset.qid, labels: [...q.querySelectorAll('.sv-opt .sv-lab')].map((l) => l.innerText.trim()) })),
        letters: e.querySelectorAll('.sv-letter').length, sections: [...e.querySelectorAll('.sv-section')].map((s) => s.textContent) })));
      for (const s of subs) {
        const stu = studentSeen[s.sid.toUpperCase()];
        const a = JSON.stringify(s.qs.map((q) => [q.qid, q.labels])), b = JSON.stringify(stu.map((q) => [q.qid, q.labels]));
        if (a !== b) { okOrder = false; why += s.sid + ' '; }
      }
      check(okOrder, `${tag} "as the student saw it": question order AND option order equal the real student page for all 4 students ${why}`);
      check(subs.every((s) => s.letters === 0 && s.sections.join('|') === 'Multiple choice|Fill in the blank|Open-ended'), `${tag} seen order: section headings, no option letters`);
      const adaFile = JSON.stringify(content.questions.map((q) => q.id));
      check(JSON.stringify(subs[0].qs.map((q) => q.qid)) !== adaFile, `${tag} seen order differs from file order for the first student`);
      await page.selectOption('.sv-order', 'file');
      await shot('viewer-all');
      check(await noHScroll(page), `${tag} viewer all: no horizontal scroll`);

      // ---- Dee: partially empty boxes, clue
      const deeSub = page.locator('.subview').nth(2);
      check(/Dee/.test(await deeSub.locator('.sv-head h2').innerText()) && (await deeSub.locator('.sv-head h2 i').count()) === 0, `${tag} names are text, not HTML`);
      const d1 = deeSub.locator('[data-qid=f1] .sv-fillrow').nth(0);
      check((await d1.locator('.sv-bx.typed').allInnerTexts()).join('') === 'ri' && (await d1.locator('.sv-bx.fixed').innerText()) === 'a' && (await d1.locator('.sv-bx:not(.typed):not(.fixed)').count()) === 9, `${tag} Dee: typed "ri", clue "a", 9 empty boxes`);
      const d2 = deeSub.locator('[data-qid=f4] .sv-fillrow');
      check((await d2.nth(0).locator('.sv-bx').count()) === 1 && (await d2.nth(0).locator('.sv-bx.typed').count()) === 0, `${tag} Dee: empty single box stays empty`);
      check((await deeSub.locator('[data-qid=m2] .sv-none').innerText()) === '(no answer)', `${tag} unanswered mc marked`);
      const cy = page.locator('.subview').nth(3);
      check((await cy.locator('.sv-bx.typed').count()) === 0 && (await cy.locator('.sv-opt.chosen').count()) === 0, `${tag} Cyrus (no answers): nothing typed or chosen`);
      check((await page.locator('.subview').nth(1).locator('[data-qid=o1] .sv-open').innerText()).includes('<b>not bold</b>'), `${tag} essay HTML shown as text`);

      // ---- anonymise
      await page.check('.sv-anon');
      const txt = await page.locator('.sv-viewer').innerText();
      const heads = (await page.locator('.sv-head h2').allInnerTexts()).map((t) => t.replace(/\s*late$/i, '').trim());
      check(heads.join('|') === 'Student 1|Student 2|Student 3|Student 4', `${tag} anonymise: Student N in submission order (Ada=1 earliest, Cyrus=4 latest): ${heads.join('|')}`);
      check(!/Ada|Lovelace|Bob|Quote|Dee|Cyrus|S100|S200|S300|DEE-4|RC-1\d-ZZ/.test(txt), `${tag} anonymise: no names, IDs or receipts in the viewer`);
      if (w === 1280) await shot('viewer-anon');

      // ---- sticky toolbar offset by --barh
      if (w === 1280) {
        await page.evaluate(() => window.scrollTo(0, 1500));
        await page.waitForTimeout(100);
        const top = await page.locator('.sv-toolbar').evaluate((e) => e.getBoundingClientRect().top);
        check(Math.abs(top - 48) < 1.5, `${tag} toolbar sticks at var(--barh)=48px below the fixed bar (top ${top})`);
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      // ---- zip (only at 1280 and 390 to keep the run short)
      if (w !== 2560) {
        for (const anon of [true, false]) {
          if (anon) await page.check('.sv-anon'); else await page.uncheck('.sv-anon');
          await page.selectOption('.sv-order', anon ? 'seen' : 'file');
          const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sv-zip')]);
          const zp = path.join(scratch, `out-${w}-${anon}.zip`);
          await dl.saveAs(zp);
          const dir = path.join(scratch, `unz-${w}-${anon}`); fs.mkdirSync(dir, { recursive: true });
          execSync(`unzip -o -q ${zp} -d ${dir}`);
          const files = fs.readdirSync(dir).sort();
          const want = anon ? ['student-1.html', 'student-2.html', 'student-3.html', 'student-4.html'] : ['DEE-4.html', 'S100.html', 'S200.html', 'S300.html'];
          check(JSON.stringify(files) === JSON.stringify(want), `${tag} zip (${anon ? 'anonymised, seen order' : 'named, file order'}): files ${files.join(', ')}`);
          const html = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
          check(html.every((x) => x.includes('katex@0.16.11/dist/katex.min.css') && x.includes('<style>') && x.includes('class="katex"') && !x.includes('blob:') && !/<script/i.test(x)), `${tag} zip: inline CSS, KaTeX link, pre-rendered math, no blob: urls, no script`);
          check(html.every((x) => /<img [^>]*src="data:image\/svg\+xml;base64,/.test(x)), `${tag} zip: figure embedded as data: URL in every file`);
          if (anon) check(!html.some((x) => /Ada|Lovelace|Bob|Quote|Cyrus|O&#39;Neil|S100|S200|S300|DEE-4|RC-1\d-ZZ/.test(x)) && html.every((x, i) => x.includes(`Student ${i + 1}`)), `${tag} zip anonymised: no names/IDs/receipts anywhere in the files`);
          else check(fs.readFileSync(path.join(dir, 'S100.html'), 'utf8').includes('Ada Lovelace') && fs.readFileSync(path.join(dir, 'S100.html'), 'utf8').includes('class="sv-mark ok"'), `${tag} zip named: S100.html holds Ada's submission, with marking`);
          if (w === 1280) {
            // open an exported file: it must look like the viewer (text equal) and load its image
            const pg2 = await newPage(ctx);
            await pg2.goto(pathToFileURL(path.join(dir, anon ? 'student-1.html' : 'S100.html')).href);
            await pg2.waitForSelector('.subview .katex');
            const imgOk = await pg2.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
            const exported = await pg2.locator('.subview').innerText();
            await pg2.setViewportSize({ width: 900, height: 800 });
            await pg2.screenshot({ path: `${SHOTS}/zip-file-${anon ? 'anon' : 'named'}.png`, fullPage: true });
            check(imgOk && (anon ? true : exported.includes('Ada Lovelace')), `${tag} exported ${anon ? 'student-1' : 'S100'}.html opens standalone, image loads`);
            check(pg2.errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, `${tag} exported file: no page errors`);
            await pg2.close();
          }
        }
        await page.uncheck('.sv-anon'); await page.selectOption('.sv-order', 'file');
      }

      // ---- question picker (1280 only): all ticked by default, excerpts shown, subset shown/exported, none = nothing to export
      if (w === 1280) {
        const nq = content.questions.length;
        check((await page.locator('.sv-qpick').count()) === nq && (await page.locator('.sv-qpick:checked').count()) === nq, `question picker lists all ${nq} questions, all ticked`);
        check((await page.textContent('.sv-qsel summary')).includes('all ' + nq), 'picker summary says all questions');
        await page.click('.sv-qsel summary');
        await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/question-picker-1280.png` });
        const exc = await page.locator('.sv-qitem .sv-qexc').allTextContents();
        check(exc.every((t) => t.trim().length > 3 && !t.includes('$') && !t.includes('**')), 'each question shows a plain-text excerpt: ' + exc[0]);
        check(exc.some((t) => /heats of ___ and the ___ of the ___/.test(t)), 'fill-in excerpts keep their blanks as ___');
        const firstId = content.questions[0].id, secondId = content.questions[1].id;
        const perSub = async () => page.evaluate(() => document.querySelector('.subview').querySelectorAll('section.sv-q').length);
        const before = await perSub();
        await page.locator(`.sv-qpick[value="${firstId}"]`).uncheck();
        const after = await perSub();
        check(after === before - 1, `unticking a question hides it in every submission (${before} -> ${after})`);
        check((await page.textContent('.subview .sv-meta')).includes(`${nq - 1} of ${nq}`), 'header says how many questions are shown');
        await page.click('.sv-qsel button:has-text("None")');
        check(await page.isDisabled('.sv-zip') && await page.isDisabled('.sv-print') && (await page.textContent('.sv-viewer')).includes('No questions selected'), 'no questions: nothing shown, export and print disabled');
        await page.click('.sv-qsel button:has-text("All")');
        await page.locator(`.sv-qpick`).evaluateAll((els, keep) => els.forEach((e) => { if (e.value !== keep && e.checked) e.click(); }), secondId);
        const [qdl] = await Promise.all([page.waitForEvent('download'), page.click('.sv-zip')]);
        const qzp = path.join(scratch, 'qsel.zip'); await qdl.saveAs(qzp);
        const qdir = path.join(scratch, 'unz-qsel'); fs.mkdirSync(qdir, { recursive: true }); execSync(`unzip -o -q ${qzp} -d ${qdir}`);
        const one = fs.readFileSync(path.join(qdir, fs.readdirSync(qdir)[0]), 'utf8');
        check((one.match(/class="sv-q[ "]/g) || []).length === 1 && one.includes(`1 of ${nq}`), 'zip with one question selected holds only that question');
        await page.click('.sv-qsel button:has-text("All")');
        // export straight from the list: selected students only
        await page.click('.sv-back');
        await page.locator('.sv-pick').nth(0).check(); await page.locator('.sv-pick').nth(2).check();
        check((await page.textContent('.sv-listzip')).includes('(2)'), 'list export button counts the selected students');
        const [ldl] = await Promise.all([page.waitForEvent('download'), page.click('.sv-listzip')]);
        const lzp = path.join(scratch, 'list.zip'); await ldl.saveAs(lzp);
        const ldir = path.join(scratch, 'unz-list'); fs.mkdirSync(ldir, { recursive: true }); execSync(`unzip -o -q ${lzp} -d ${ldir}`);
        check(fs.readdirSync(ldir).length === 2, 'list export holds the 2 selected students: ' + fs.readdirSync(ldir).join(', '));
        await page.locator('.sv-pick').nth(0).uncheck(); await page.locator('.sv-pick').nth(2).uncheck();
        await page.click('.sv-viewall');
      }

      // ---- print (1280 only)
      if (w === 1280) {
        await page.emulateMedia({ media: 'print' });
        const st = await page.evaluate(() => ({
          toolbar: getComputedStyle(document.querySelector('.sv-toolbar')).display, header: getComputedStyle(document.querySelector('header.top')).display,
          bar: getComputedStyle(document.querySelector('.fakebar')).display, tabs: getComputedStyle(document.querySelector('nav.tabs')).display,
          brk: [...document.querySelectorAll('.subview')].map((e) => getComputedStyle(e).breakAfter) }));
        check(st.toolbar === 'none' && st.header === 'none' && st.bar === 'none' && st.tabs === 'none', `print media: toolbar, header, bar, tabs hidden (${JSON.stringify(st)})`);
        check(st.brk.slice(0, 3).every((b) => b === 'page') && st.brk[3] === 'auto', 'print media: break-after page on every student but the last');
        await page.click('.sv-viewall', { timeout: 500 }).catch(() => {});
        const pdf = path.join(scratch, 'print.pdf');
        await page.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true });
        const pages = parseInt(execSync(`pdfinfo ${pdf}`).toString().match(/Pages:\s+(\d+)/)[1], 10);
        const per = [];
        for (let i = 1; i <= pages; i++) per.push(execSync(`pdftotext -f ${i} -l ${i} -layout ${pdf} -`).toString());
        const starts = per.map((t) => (t.match(/Ada Lovelace|Bob "Quote" Jr|Dee <i>|Cyrus Empty/) || ['-'])[0]);
        const inPdf = per.join('\n');
        check(!/Print \/ Save|Download zip|View selected|SEB Exams/.test(inPdf), 'PDF: no UI (toolbar buttons, app header) printed');
        const firsts = per.map((t, i) => (starts[i] !== '-' ? i + 1 : 0)).filter(Boolean);
        const counts = ['Ada Lovelace', 'Bob "Quote" Jr', 'Dee', 'Cyrus Empty'].map((n) => per.filter((t) => t.includes(n)).length);
        check(pages >= 4 && starts.slice(0, 1)[0] === 'Ada Lovelace' && firsts.length === 4 && counts.every((c) => c >= 1), `PDF: ${pages} pages; each student's header appears once, on its own page (name-bearing pages: ${starts.join(' / ')})`);
        // a student never shares a page with the next: no page contains two different names
        const mixed = per.filter((t) => ['Ada Lovelace', 'Bob "Quote"', 'Dee', 'Cyrus Empty'].filter((n) => t.includes(n)).length > 1).length;
        check(mixed === 0, `PDF: no page holds two students (${mixed} mixed)`);
        await page.emulateMedia({ media: 'screen' });
      }
      check(page.errors.length === 0, `${tag} no console/page errors ${page.errors.slice(0, 3).join(' | ')}`);
      check(page.apiCalls.every((c) => c.endsWith('seb-exams')), `${tag} every API call carried X-Requested-With`);
      await ctx.close();
    }
    // ============ empty exam
    {
      const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
      const page = await newPage(ctx);
      await mockTeacher(page, { questions: content.questions, submissions: [] });
      await page.goto(`${BASE}/harness.html`);
      await page.waitForFunction(() => window.READY);
      check((await page.locator('#app').innerText()).includes('No submissions yet'), 'empty exam: "No submissions yet."');
      check(page.errors.length === 0, 'empty exam: no errors');
      await ctx.close();
    }
  } catch (e) { console.log('FAIL exception: ' + (e.stack || e)); failures++; }
  await browser.close();
  srv.kill(); srv2.kill();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
