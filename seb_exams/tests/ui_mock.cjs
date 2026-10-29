// UI test of the teacher app against a mocked API (no backend needed).
// Run: node tests/ui_mock.cjs   (serves worker/public on port 8791, screenshots to $SHOTS or /tmp/ui_mock_shots)
const { execSync, spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const PUB = path.join(__dirname, '..', 'worker', 'public');
const SHOTS = process.env.SHOTS || '/tmp/ui_mock_shots';
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8791, BASE = `http://localhost:${PORT}`;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#cde"/><text x="20" y="55">fig</text></svg>';
const content = {
  format: 'seb-exam/1', title: 'McCabe–Thiele distillation', duration_minutes: 45, intro: 'Answer **all** questions. Use $x_D$ where needed.',
  questions: [
    { id: 'rect-line', type: 'mc', points: 2, text: 'Which is the rectifying line?\n\n$$y = \\dfrac{R}{R+1}x + \\dfrac{x_D}{R+1}$$', image: 'stages.svg', image_alt: 'stages', shuffle_options: true,
      options: [{ text: '$y = \\dfrac{R}{R+1}x$', correct: true }, { text: 'something else', correct: false }, { text: 'a third', correct: false }] },
    { id: 'q2', type: 'fill', points: 2, text: 'CMO assumes equal molar heats of [[1]] and [[2]] for the two species.', blanks: [{ answer: 'vaporization', variants: ['vaporisation'], clue: '_a__________' }, { answer: 'heat-flow' }] },
    { id: 'q3', type: 'open', points: 5, text: 'Explain why the **feed line** matters. Calculate nothing.', model_answer: 'It fixes the intersection of operating lines.' },
  ],
};
const exam = { id: 'mt-7k2p9x', title: content.title, content, images: [{ name: 'stages.svg', mime: 'image/svg+xml', size: SVG.length }], owner_email: 'me@x.org', teachers: ['co@x.org'],
  require_seb: 1, opens_at: null, closes_at: null, has_quit_password: false, extra_config_keys: [], config_key: 'ab'.repeat(32),
  seb_link: 'sebs://seb-exams.example/s/seb/mt-7k2p9x.seb', student_url: 'https://chetools.github.io/claude/seb_exams/exam/?id=mt-7k2p9x', submissions_count: 2, regraded_at: null };
const results = { questions: content.questions, submissions: [
  { id: 1, name: 'Ada Lovelace', student_id: 'S100', started_at: '2026-10-01T10:00:00Z', submitted_at: '2026-10-01T10:40:00Z', late: 0, minutes_used: 40,
    answers: { 'rect-line': 'a', q2: ['vaporization', 'heat-flow'], q3: 'The feed line sets q.\nLong text '.repeat(20) }, detail: { 'rect-line': { ok: true, points: 2 }, q2: { ok: true, points: 2 } },
    auto_score: 4, auto_max: 4, manual: {}, manual_max: 5, total: 4, receipt: 'ABCD-1234', seb_check: 'ok' },
  { id: 2, name: 'Bob "Quote", Jr', student_id: 'S200', started_at: '2026-10-01T10:00:00Z', submitted_at: '2026-10-01T11:00:00Z', late: 1, minutes_used: 60,
    answers: { 'rect-line': 'b', q2: ['x', 'y'], q3: '=HYPERLINK("evil")' }, detail: { 'rect-line': { ok: false, points: 0 }, q2: { ok: false, points: 0 } },
    auto_score: 0, auto_max: 4, manual: { q3: { points: 3, comment: 'ok' } }, manual_max: 5, total: 3, receipt: 'WXYZ-9999', seb_check: 'ok' } ] };
const GUIDE = '# AI guide\n\nIntro text.\n\n<!-- PROMPT START -->\nYou are an exam writer. Produce exam.yaml.\n<!-- PROMPT END -->\n\n## Format\n\nMore $x^2$.\n';

let signedIn = true, manualPuts = [], me = { email: 'me@x.org', name: 'Me', is_admin: true };
async function mock(page) {
  await page.route(/\/(api|auth|docs|s)\//, async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, m = req.method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/auth/request') return json({ ok: true });
    if (p === '/auth/logout') { signedIn = false; return json({ ok: true }); }
    if (p === '/docs/AI_EXAM_GUIDE.md') return route.fulfill({ contentType: 'text/markdown', body: GUIDE });
    if (p === '/docs/example-exam.zip') return route.fulfill({ contentType: 'application/zip', body: 'PK' });
    if (!p.startsWith('/api/')) return route.continue();
    if (!signedIn) return json({ error: 'Not signed in' }, 401);
    if (req.headers()['x-requested-with'] !== 'seb-exams') return json({ error: 'csrf' }, 403);
    if (p === '/api/me') return json(me);
    if (p === '/api/exams' && m === 'GET') return json([{ id: exam.id, title: exam.title, owner_email: 'me@x.org', opens_at: null, closes_at: null, status: 'draft', submissions: 2, questions: 3, updated_at: '2026-10-01T00:00:00Z' },
      { id: 'zz-111111', title: 'Shared exam', owner_email: 'other@x.org', opens_at: '2026-10-01T08:00:00Z', closes_at: '2030-01-01T00:00:00Z', status: 'open', submissions: 0, questions: 1, updated_at: '' }]);
    if (p === '/api/exams/import') { const b = JSON.parse(req.postData()); if (/BAD/.test(b.yaml)) return json({ errors: ['Question 1 (mc): server says no.'], warnings: [] }, 422); return json({ id: exam.id, warnings: [] }); }
    if (p === `/api/exams/${exam.id}`) return json(exam);
    if (p.endsWith('/images/stages.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: SVG });
    if (p.endsWith('/results')) return json(results);
    if (p.endsWith('/export')) return json({ yaml: 'format: seb-exam/1\n', images: { 'stages.svg': Buffer.from(SVG).toString('base64') } });
    if (p.endsWith('/content')) return json({ warnings: [] });
    if (p.endsWith('/settings') || p.endsWith('/open-now') || p.endsWith('/close-now')) return json({ ok: true });
    if (p.endsWith('/manual')) { manualPuts.push(JSON.parse(req.postData())); return json({ ok: true }); }
    if (p === '/api/teachers') return json([{ email: 'me@x.org', name: 'Me', is_admin: 1, active: 1 }, { email: 'co@x.org', name: 'Co', is_admin: 0, active: 1 }]);
    return json({ error: 'unmocked ' + m + ' ' + p }, 404);
  });
}

const checks = [];
const check = (ok, what) => { checks.push([ok, what]); console.log((ok ? 'PASS ' : 'FAIL ') + what); };

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUB, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    for (const [w, hgt] of [[390, 844], [2560, 1300]]) {
      signedIn = true; manualPuts = [];
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, acceptDownloads: true });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|422)/.test(m.text())) errs.push('console: ' + m.text()); });
      page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'My title' : undefined));
      await mock(page);
      const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: true }); };
      const noScroll = async (name) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(o <= 0, `${w}px ${name}: no horizontal page scroll (${o})`); };
      const aligned = async (name) => {
        const r = await page.evaluate(() => { const a = document.querySelector('#head').getBoundingClientRect(), b = document.querySelector('#app').getBoundingClientRect(); return [a.left, a.right, b.left, b.right]; });
        check(Math.abs(r[0] - r[2]) < 1 && Math.abs(r[1] - r[3]) < 1, `${w}px ${name}: header/body edges aligned ${r.map(Math.round)}`);
      };
      const go = async (hash, name, wait) => { await page.goto(`${BASE}/#${hash}`); await page.reload(); await page.waitForSelector(wait || '#app .card, #app .msg', { timeout: 8000 }); await page.waitForTimeout(300); await shot(name); await noScroll(name); await aligned(name); };

      // login
      signedIn = false; await go('/login', 'login', '#login-email');
      await page.fill('#login-email', 'me@x.org'); await page.click('text=Email me a sign-in link');
      await page.waitForSelector('text=If this address belongs to a teacher, a sign-in link is on its way. It is valid for 15 minutes.');
      check(true, `${w}px login message shown`);
      signedIn = true;
      // unauthenticated redirect
      signedIn = false; await page.goto(`${BASE}/#/`); await page.reload(); await page.waitForSelector('#login-email'); check(true, `${w}px 401 -> sign-in`); signedIn = true;

      await go('/', 'dashboard', 'table.exams');
      // import with bad zip content
      const mkZip = async (yaml) => Buffer.from(await page.evaluate((y) => Array.from(window.fflate.zipSync({ 'exam/exam.yaml': window.fflate.strToU8(y) })), yaml));
      const good = 'format: seb-exam/1\ntitle: T\nduration_minutes: 10\nquestions:\n  - type: open\n    points: 1\n    text: Explain it.\n';
      await page.setInputFiles('input[type=file]', { name: 'bad.zip', mimeType: 'application/zip', buffer: await mkZip('format: seb-exam/9\ntitle: [') });
      await page.waitForSelector('.problems');
      check(await page.isVisible('text=Copy errors'), `${w}px import shows local errors with Copy errors`); await shot('import-errors'); await noScroll('import-errors');
      await page.setInputFiles('input[type=file]', { name: 'srv.zip', mimeType: 'application/zip', buffer: await mkZip(good.replace('Explain it.', 'Explain it. BAD')) });
      await page.waitForSelector('text=server says no');
      check(true, `${w}px server errors shown verbatim`);
      await page.setInputFiles('input[type=file]', { name: 'ok.zip', mimeType: 'application/zip', buffer: await mkZip(good) });
      await page.waitForURL(/#\/exam\/mt-7k2p9x\/questions/);
      check(true, `${w}px import good zip navigates to exam`);

      await go('/exam/mt-7k2p9x/questions', 'questions', '.q');
      check(await page.isVisible('.opt.correct'), `${w}px correct option highlighted`);
      check((await page.locator('.q .boxes .bx.ans').count()) > 5, `${w}px blank answers shown in boxes`);
      check(await page.evaluate(() => { const i = document.querySelector('.q img'); return i && i.complete && i.naturalWidth > 0; }), `${w}px image loaded`);
      check(await page.isVisible('.katex'), `${w}px math rendered`);
      check(await page.isVisible('.msg.warn'), `${w}px open-question warning shown`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export zip')]);
      check(/mccabe-thiele-distillation\.zip$/.test(dl.suggestedFilename()), `${w}px export zip name ${dl.suggestedFilename()}`);

      await go('/exam/mt-7k2p9x/edit', 'edit', '.qedit');
      check((await page.locator('.qedit').count()) === 3, `${w}px editor has 3 question cards`);
      check(await page.isVisible('.qedit .preview .katex'), `${w}px editor live preview renders math`);
      await page.locator('.blankedit input').first().fill('vaporizatiox');
      await page.waitForTimeout(300);
      check((await page.locator('.blankedit .bprev .bx').count()) > 3, `${w}px blank box preview updates`);
      await page.click('text=+ Multiple choice'); await shot('edit-added');
      check(await page.isVisible('.msg.err'), `${w}px validation errors shown for empty new question`);
      check(await page.isDisabled('.savebar button'), `${w}px save disabled while errors`);
      await page.locator('.qedit').last().locator('button:has-text("Delete")').click();
      await page.waitForTimeout(300);
      check(await page.isEnabled('.savebar button'), `${w}px save enabled after fix`);
      let put = null; page.once('request', () => {}); page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith('/content')) put = r.postDataJSON(); });
      await page.click('.savebar button'); await page.waitForSelector('text=Saved');
      check(put && put.content.questions.length === 3 && put.content.questions[1].blanks[0].answer === 'vaporizatiox', `${w}px save PUTs content`);
      await noScroll('edit-after');

      await go('/exam/mt-7k2p9x/settings', 'settings', '.linkrow');
      check(await page.isVisible('text=sebs://seb-exams.example'), `${w}px sebs link shown`);

      await go('/exam/mt-7k2p9x/results', 'results', 'table.results');
      await page.fill('table.results tbody tr:first-child input.num', '4');
      await page.press('table.results tbody tr:first-child input.num', 'Tab');
      await page.waitForTimeout(400);
      check(manualPuts.length === 1 && manualPuts[0].qid === 'q3' && manualPuts[0].points === 4, `${w}px manual points PUT ${JSON.stringify(manualPuts[0])}`);
      check(await page.isVisible('text=8 / 9'), `${w}px total updated to 8 / 9`);
      const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download CSV')]);
      const csv = fs.readFileSync(await csvDl.path(), 'utf8');
      check(csv.charCodeAt(0) === 0xfeff && csv.includes('"Bob ""Quote"", Jr"') && csv.includes('\'=HYPERLINK'), `${w}px CSV BOM + quoting`);
      if (w === 390) { const sc = await page.evaluate(() => { const t = document.querySelector('#restable'); return t.scrollWidth > t.clientWidth; }); check(sc, 'table scrolls inside its own box at 390'); }

      await go('/admin', 'admin', 'table');
      await go('/ai', 'ai', '.guide');
      check(await page.isVisible('text=Download example exam'), `${w}px example link shown`);
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
      await page.click('text=Copy prompt'); await page.waitForTimeout(300);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
      check(clip === null || clip === 'You are an exam writer. Produce exam.yaml.', `${w}px prompt copied between markers (${clip === null ? 'clipboard unreadable' : 'read back'})`);
      check(!(await page.content()).includes('PROMPT START'), `${w}px markers not shown`);

      // non-admin hides Teachers link
      me = { ...me, is_admin: false }; await go('/', 'dashboard-nonadmin', 'table.exams'); check(!(await page.isVisible('nav >> text=Teachers')), `${w}px no Teachers link for non-admin`); me.is_admin = true;
      check(errs.length === 0, `${w}px no console/page errors ${JSON.stringify(errs.slice(0, 3))}`);
      await ctx.close();
    }
  } finally { await browser.close(); srv.kill(); }
  const bad = checks.filter((c) => !c[0]).length;
  console.log(bad ? `${bad} FAILED` : 'ALL PASSED'); process.exit(bad ? 1 : 0);
})();
