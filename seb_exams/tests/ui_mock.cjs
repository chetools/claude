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

// grade.js / submissions.js / css belong to other agents; stub them when they do not exist yet.
const STUB = { 'js/grade.js': 'export async function render(b){ b.append(Object.assign(document.createElement("div"),{textContent:"grade stub",style:"height:3000px"})); }',
  'js/submissions.js': 'export async function render(b){ b.append(Object.assign(document.createElement("div"),{textContent:"submissions stub",style:"height:3000px"})); }',
  'css/grade.css': '', 'css/submissions.css': '' };
let signedIn = true, importCalls = [], manualPuts = [], me = { email: 'me@x.org', name: 'Me', is_admin: true };
async function mock(page) {
  for (const [f, body] of Object.entries(STUB)) {
    if (fs.existsSync(path.join(PUB, f))) continue;
    await page.route('**/' + f, (route) => route.fulfill({ contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body }));
  }
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
    if (p === '/api/exams/import') {
      const b = JSON.parse(req.postData()); importCalls.push({ dry: !!b.dry_run, replace: b.replace_id || null, images: Object.keys(b.images || {}) });
      if (/BAD/.test(b.yaml)) return json({ errors: ['Question 1 (mc): server says no.'], warnings: [] }, 422);
      if (b.replace_id && /OPEN/.test(b.yaml)) return json({ error: 'The exam is open; close it before replacing its content.' }, 423);
      if (b.dry_run) return json({ ok: true, exam: content, warnings: ['Question 3 (open): server-side warning.'],
        summary: b.replace_id ? { added: ['q3'], removed: ['q2'], changed: ['rect-line', 'q3'], key_changed: ['rect-line'], regrade_count: 2, manual_grades_dropped: 1 } : null });
      return json({ id: exam.id, warnings: [] });
    }
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
    for (const [w, hgt] of [[390, 844], [1280, 800], [2560, 1300]]) {
      signedIn = true; manualPuts = []; importCalls = [];
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, acceptDownloads: true });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/status of (401|422)/.test(m.text())) errs.push('console: ' + m.text()); });
      const dialogs = []; let dialogAnswer = true;
      page.on('dialog', (d) => { dialogs.push(d.message()); if (dialogAnswer) d.accept(d.type() === 'prompt' ? 'My title' : undefined); else d.dismiss(); });
      await mock(page);
      const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: true }); };
      const noScroll = async (name) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(o <= 0, `${w}px ${name}: no horizontal page scroll (${o})`); };
      const aligned = async (name) => {
        const r = await page.evaluate(() => { const a = document.querySelector('#head').getBoundingClientRect(), b = document.querySelector('#app').getBoundingClientRect(); return [a.left, a.right, b.left, b.right]; });
        check(Math.abs(r[0] - r[2]) < 1 && Math.abs(r[1] - r[3]) < 1, `${w}px ${name}: header/body edges aligned ${r.map(Math.round)}`);
      };
      const barVisible = async (name) => {
        await page.evaluate(() => { const d = document.createElement('div'); d.id = 'spacer'; d.style.height = '3000px'; document.getElementById('app').append(d); window.scrollTo(0, document.documentElement.scrollHeight); });
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => { const b = document.getElementById('bar').getBoundingClientRect(); const sy = window.scrollY;
          const inner = document.getElementById('barin').getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
          return { top: b.top, h: b.height, sy, barh: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--barh')), l: inner.left - app.left, r: inner.right - app.right,
            hit: document.elementFromPoint(b.left + 5, b.top + b.height / 2).closest('#bar') !== null }; });
        check(r.sy > 100 && r.top === 0 && r.h > 20 && r.hit, `${w}px ${name}: bar stays at top after scrolling (scrollY ${Math.round(r.sy)}, top ${r.top}, h ${Math.round(r.h)})`);
        check(Math.abs(r.barh - r.h) <= 1, `${w}px ${name}: --barh ${r.barh} == bar height ${r.h}`);
        check(Math.abs(r.l) < 1 && Math.abs(r.r) < 1, `${w}px ${name}: bar content aligned with body column (${Math.round(r.l)}, ${Math.round(r.r)})`);
        await page.evaluate(() => { document.getElementById('spacer').remove(); window.scrollTo(0, 0); });
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
      await barVisible('dashboard');
      const mkZip = async (yaml, withImg) => Buffer.from(await page.evaluate(([y, img]) => { const f = { 'exam/exam.yaml': window.fflate.strToU8(y) }; if (img) f['exam/stages.svg'] = window.fflate.strToU8(img); return Array.from(window.fflate.zipSync(f)); }, [yaml, withImg ? SVG : null]));
      const good = 'format: seb-exam/1\ntitle: T\nduration_minutes: 10\nquestions:\n  - type: open\n    points: 1\n    text: Explain it.\n';
      const pick = async (btnText, name, yaml, img) => {
        const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`#bar button:has-text("${btnText}")`)]);
        await fc.setFiles({ name, mimeType: 'application/zip', buffer: await mkZip(yaml, img) });
      };
      await pick('Import', 'bad.zip', 'format: seb-exam/9\ntitle: [');
      await page.waitForSelector('.problems');
      check(await page.isVisible('text=Copy errors') && await page.isVisible('text=Preview – not saved'), `${w}px import shows local errors with Copy errors in the preview shell`);
      check(await page.isDisabled('#bar button:has-text("Approve and save")'), `${w}px approve disabled while errors`);
      check(importCalls.length === 0, `${w}px nothing sent to the server for a locally invalid zip`);
      await shot('import-errors'); await noScroll('import-errors');
      const chooseFile = async (name, yaml, img) => {
        const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#bar button:has-text("Choose another zip")')]);
        await fc.setFiles({ name, mimeType: 'application/zip', buffer: await mkZip(yaml, img) });
      };
      await chooseFile('srv.zip', good.replace('Explain it.', 'Explain it. BAD'));
      await page.waitForSelector('text=server says no');
      check(importCalls.length === 1 && importCalls[0].dry === true, `${w}px server errors shown verbatim after a dry run`);
      check(await page.isDisabled('#bar button:has-text("Approve and save")'), `${w}px approve disabled on server errors`);
      await chooseFile('ok.zip', good, true);
      await page.waitForSelector('#app .q');
      check(await page.isVisible('text=Preview – not saved') && await page.isVisible('#bar button:has-text("Approve and save")') && await page.isEnabled('#bar button:has-text("Approve and save")'), `${w}px preview with banner and enabled Approve`);
      check(await page.isVisible('text=server-side warning'), `${w}px server warnings shown in preview`);
      check(await page.evaluate(() => { const i = document.querySelector('#app .q img'); return i && i.src.startsWith('data:image/svg+xml') && i.complete && i.naturalWidth > 0; }), `${w}px preview image rendered from the zip as data URL`);
      check(await page.isVisible('#app .opt.correct') && await page.isVisible('#app .katex'), `${w}px preview looks like the Questions tab (answers marked, math)`);
      check(importCalls.length === 2 && importCalls[1].dry && importCalls[1].images.includes('stages.svg'), `${w}px preview did a dry run with the image only (no save yet)`);
      await shot('import-preview'); await noScroll('import-preview'); await aligned('import-preview'); await barVisible('import-preview');
      // leaving an unapproved preview asks for confirmation
      dialogs.length = 0; dialogAnswer = false;
      await page.evaluate(() => { location.hash = '#/ai'; }); await page.waitForTimeout(400);
      check(dialogs.length === 1 && /preview/i.test(dialogs[0]) && (await page.evaluate(() => location.hash)) === '#/' && await page.isVisible('#bar button:has-text("Approve and save")'), `${w}px navigating away from preview asks, and stays when refused (${dialogs[0]})`);
      dialogAnswer = true;
      check(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), `${w}px beforeunload guard active during preview`);
      await page.click('#bar button:has-text("Cancel")');
      await page.waitForSelector('table.exams');
      check(await page.isVisible('#bar button:has-text("Import")') && !(await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })), `${w}px Cancel returns to the dashboard and clears the guard`);
      await pick('Import', 'ok.zip', good, true);
      await page.waitForSelector('#bar button:has-text("Approve and save")');
      await page.click('#bar button:has-text("Approve and save")');
      await page.waitForURL(/#\/exam\/mt-7k2p9x\/questions/);
      check(importCalls.length === 4 && !importCalls[3].dry && !importCalls[3].replace, `${w}px approve sends the real import, then opens the Questions tab`);
      await page.waitForSelector('#app .q');

      await go('/exam/mt-7k2p9x/questions', 'questions', '.q');
      check(await page.isVisible('.opt.correct'), `${w}px correct option highlighted`);
      check((await page.locator('.q .boxes .bx.ans').count()) > 5, `${w}px blank answers shown in boxes`);
      check(await page.evaluate(() => { const i = document.querySelector('.q img'); return i && i.complete && i.naturalWidth > 0; }), `${w}px image loaded`);
      check(await page.isVisible('.katex'), `${w}px math rendered`);
      check(await page.isVisible('.msg.warn'), `${w}px open-question warning shown`);
      await barVisible('questions');
      check((await page.locator('#bar .tabs a').allTextContents()).join(',') === 'Questions,Edit,Grade,Submissions,Settings,Results', `${w}px tabs in the bar`);
      check(await page.isVisible('#bar .badge') && await page.isVisible('#bar .bartitle'), `${w}px title and status badge in the bar`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bar button:has-text("Export")')]);
      check(/mccabe-thiele-distillation\.zip$/.test(dl.suggestedFilename()), `${w}px export zip name ${dl.suggestedFilename()}`);
      // replace preview with change summary
      importCalls = [];
      await pick('Replace', 'new.zip', good, true);
      await page.waitForSelector('.chg');
      check(importCalls.length === 1 && importCalls[0].dry && importCalls[0].replace === 'mt-7k2p9x', `${w}px replace dry run carries replace_id`);
      const sumText = await page.locator('#app .chg').first().evaluate((e) => e.parentElement.innerText);
      check(/Added \(1\)[\s\S]*Q3 \(q3\)/.test(sumText) && /Removed[\s\S]*Q2 \(q2\)/.test(sumText) && /Changed \(2\)[\s\S]*Q1 \(rect-line\)/.test(sumText) && /Answer key or points changed \(1\)/.test(sumText)
        && /Re-grades 2 submissions/.test(sumText) && /1 essay grade will be dropped/.test(sumText), `${w}px change summary lists numbers+ids, re-grade and dropped grades`);
      check(await page.isVisible('#bar button:has-text("Approve and replace")') && await page.isVisible('#bar button:has-text("Choose another zip")'), `${w}px bar shows Approve and replace / Cancel / Choose another zip`);
      await shot('replace-preview'); await noScroll('replace-preview'); await barVisible('replace-preview');
      await page.click('#bar button:has-text("Cancel")'); await page.waitForSelector('#bar button:has-text("Replace")');
      check(!(await page.isVisible('text=Preview – not saved')), `${w}px Cancel leaves the preview`);
      // 423: exam is open
      await pick('Replace', 'open.zip', good.replace('Explain it.', 'Explain it. OPEN'), false);
      await page.waitForSelector('text=close it before replacing');
      check(!(await page.locator('#bar button:has-text("Approve")').count()) && await page.isVisible('#bar button:has-text("Cancel")'), `${w}px 423 shows the server message and no approve`);
      await shot('replace-423'); await noScroll('replace-423');
      await page.click('#bar button:has-text("Cancel")'); await page.waitForSelector('#bar button:has-text("Replace")');
      // approve replace
      await pick('Replace', 'new.zip', good, true); await page.waitForSelector('#bar button:has-text("Approve and replace")');
      importCalls = [];
      await page.click('#bar button:has-text("Approve and replace")'); await page.waitForSelector('#bar button:has-text("Export")'); await page.waitForTimeout(400);
      check(importCalls.length === 1 && !importCalls[0].dry && importCalls[0].replace === 'mt-7k2p9x' && !(await page.isVisible('text=Preview – not saved')), `${w}px approve replace sends the real import and returns to the Questions tab`);

      await go('/exam/mt-7k2p9x/edit', 'edit', '.qedit');
      check((await page.locator('.qedit').count()) === 3, `${w}px editor has 3 question cards`);
      check(await page.isVisible('.qedit .preview .katex'), `${w}px editor live preview renders math`);
      check(!(await page.isVisible('#bar button:has-text("Save")')) && !(await page.locator('#app').innerText()).includes('Replace from zip'), `${w}px Save/Discard hidden until changed; no Replace card in the Edit tab`);
      await page.locator('.blankedit input').first().fill('vaporizatiox');
      await page.waitForTimeout(300);
      check((await page.locator('.blankedit .bprev .bx').count()) > 3, `${w}px blank box preview updates`);
      await page.click('text=+ Multiple choice'); await shot('edit-added');
      check(await page.isVisible('.msg.err'), `${w}px validation errors shown for empty new question`);
      check(await page.isDisabled('#bar button:has-text("Save")') && await page.isVisible('#bar button:has-text("Discard")') && await page.isVisible('#bar button:has-text("error")'), `${w}px save disabled while errors, Discard and error count in bar`);
      await barVisible('edit-dirty');
      await page.locator('.qedit').last().locator('button:has-text("Delete")').click();
      await page.waitForTimeout(300);
      check(await page.isEnabled('#bar button:has-text("Save")'), `${w}px save enabled after fix`);
      let put = null; page.once('request', () => {}); page.on('request', (r) => { if (r.method() === 'PUT' && r.url().endsWith('/content')) put = r.postDataJSON(); });
      await page.click('#bar button:has-text("Save")'); await page.waitForSelector('#bar >> text=Saved');
      check(!(await page.isVisible('#bar button:has-text("Discard")')), `${w}px Save/Discard disappear after saving`);
      check(put && put.content.questions.length === 3 && put.content.questions[1].blanks[0].answer === 'vaporizatiox', `${w}px save PUTs content`);
      await noScroll('edit-after'); await barVisible('edit');
      // discard reloads the saved content
      await page.locator('.blankedit input').first().fill('changed again'); await page.waitForTimeout(200);
      await page.click('#bar button:has-text("Discard")'); await page.waitForSelector('.qedit'); await page.waitForTimeout(300);
      check((await page.locator('.blankedit input').first().inputValue()) === 'vaporization' && !(await page.isVisible('#bar button:has-text("Save")')), `${w}px Discard reloads content and hides Save/Discard`);

      await go('/exam/mt-7k2p9x/settings', 'settings', '.linkrow');
      check(await page.isVisible('text=sebs://seb-exams.example'), `${w}px sebs link shown`);
      await barVisible('settings');
      for (const t of ['grade', 'submissions']) { await go('/exam/mt-7k2p9x/' + t, t, '#app .tabbody > *'); await barVisible(t); }

      await go('/exam/mt-7k2p9x/results', 'results', 'table.results');
      await page.fill('table.results tbody tr:first-child input.num', '4');
      await page.press('table.results tbody tr:first-child input.num', 'Tab');
      await page.waitForTimeout(400);
      check(manualPuts.length === 1 && manualPuts[0].qid === 'q3' && manualPuts[0].points === 4, `${w}px manual points PUT ${JSON.stringify(manualPuts[0])}`);
      check(await page.isVisible('text=8 / 9'), `${w}px total updated to 8 / 9`);
      const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('text=Download CSV')]);
      const csv = fs.readFileSync(await csvDl.path(), 'utf8');
      check(csv.charCodeAt(0) === 0xfeff && csv.includes('"Bob ""Quote"", Jr"') && csv.includes('\'=HYPERLINK'), `${w}px CSV BOM + quoting`);
      await barVisible('results');
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
