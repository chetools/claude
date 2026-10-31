// Grade tab test against a mocked API. Run: node tests/grade_mock.cjs  (screenshots to $SHOTS or scratch dir)
// Serves a scratch copy of worker/public (exam.js patched to know the grade tab if not yet there) on a free port.
const { execSync, spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const { chromium } = require(`${execSync('npm root -g').toString().trim()}/playwright`);
const SRC = path.join(__dirname, '..', 'worker', 'public');
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'grade_shots_'));
fs.mkdirSync(SHOTS, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'grade_pub_'));
fs.cpSync(SRC, TMP, { recursive: true });
const examJs = path.join(TMP, 'js', 'exam.js');
let ej = fs.readFileSync(examJs, 'utf8');
if (!/\['grade'/.test(ej)) fs.writeFileSync(examJs, ej.replace("['settings', 'Settings']", "['grade', 'Grade'], ['settings', 'Settings']"));
const EID = 'mt-7k2p9x', BASE_HASH = `#/exam/${EID}/grade`;

const LONG = 'The feed line fixes the intersection of the two operating lines, and its slope depends on the thermal condition q of the feed. '.repeat(6);
const questions = [
  { id: 'a', type: 'mc', points: 2, text: 'Pick one', options: [{ text: 'x', correct: true }, { text: 'y' }] },
  { id: 'o1', type: 'open', points: 5, text: 'Explain why the **feed line** matters, using $q$.', model_answer: 'SECRET MODEL ANSWER' },
  { id: 'o2', type: 'open', points: 3, text: 'Define the minimum reflux ratio.', model_answer: 'SECRET2' },
];
const mkSub = (id, name, o1, o2, manual) => ({ id, name, student_id: 'S' + id, answers: { a: 'a', o1, o2 }, manual: manual || {}, detail: {}, auto_score: 2, auto_max: 2, submitted_at: '2026-10-01T10:00:00Z' });
const mkSubs = () => [
  mkSub(11, 'Ada Lovelace', LONG, 'Rmin is the reflux at which infinite stages are needed.', { o1: { points: 4, comment: 'good' } }),
  mkSub(12, 'Bob Brown', 'Short answer\nwith a line break.', 'The smallest R.', { o1: { points: 2.5, comment: '' } }),
  mkSub(13, 'Cleo Chen', LONG + '\n\nSecond paragraph.', ''),
  mkSub(14, 'Dev Dutta', 'q-line slope = q/(q-1)', 'pinch point on the equilibrium curve', { o2: { points: 3, comment: '' } }),
  mkSub(15, 'Eli Evans', '', 'Rmin'),
  mkSub(16, 'Fay Fox', 'Thermal condition of feed.', 'At Rmin the operating line touches the equilibrium curve.'),
];
let subs, puts, mode; // mode: 'ok' | 'abort' | 'r422'
async function mock(page) {
  await page.route(/\/api\//, async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/me') return json({ email: 'me@x.org', name: 'Me', is_admin: true });
    if (p === `/api/exams/${EID}`) return json({ id: EID, title: 'McCabe', content: { title: 'McCabe', questions, duration_minutes: 30 }, images: [], teachers: [] });
    if (p.endsWith('/results')) return json({ questions, submissions: subs });
    const m = p.match(/\/api\/submissions\/(\d+)\/manual$/);
    if (m && req.method() === 'PUT') {
      const b = JSON.parse(req.postData());
      if (mode === 'abort') return route.abort('connectionfailed');
      puts.push({ id: Number(m[1]), ...b });
      if (mode === 'r422' || (b.points != null && (b.points * 2) % 1 !== 0)) return json({ error: 'points must be a multiple of 0.5' }, 422);
      const s = subs.find((x) => x.id === Number(m[1])); s.manual[b.qid] = { points: b.points, comment: b.comment };
      return json({ ok: true });
    }
    return json({ error: 'unmocked ' + p }, 404);
  });
}
const checks = [];
const check = (ok, what) => { checks.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + what); };
const labels = (page) => page.$$eval('.gr-card .gr-who strong', (e) => e.map((x) => x.textContent));

(async () => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn('python3', ['-m', 'http.server', String(port)], { cwd: TMP, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const BASE = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const newPage = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: false });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/status of (422)|ERR_FAILED|ERR_INTERNET|net::/.test(m.text())) errs.push('console: ' + m.text()); });
    await mock(page);
    return { ctx, page, errs };
  };
  const open = async (page, wait = '.gr-card, .gr-done') => { await page.goto(BASE + '/' + BASE_HASH); try { await page.waitForSelector(wait, { timeout: 15000 }); } catch (e) { console.log('PAGE TEXT:', (await page.locator('body').innerText()).slice(0, 400)); throw e; } await page.waitForTimeout(300); };
  const noScroll = async (page, w, name) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(o <= 0, `${w}px ${name}: no horizontal scroll (${o})`); };
  try {
    // ---------------------------------------------------------------- desktop 1280
    subs = mkSubs(); puts = []; mode = 'ok';
    let { ctx, page, errs } = await newPage(1280, 900);
    await open(page);
    const names0 = await labels(page);
    check(names0.every((n) => /^Student \d$/.test(n)), 'anonymous by default: ' + names0.slice(0, 4).join(', '));
    check(!(await page.content()).includes('SECRET'), 'no model answer in page');
    check(!(await page.content()).includes('Ada Lovelace'), 'no real names in DOM when anonymous');
    // order stable & seeded: reload gives same mapping answer->label
    const sig = () => page.$$eval('.gr-card', (c) => c.map((x) => x.querySelector('.gr-who strong').textContent + '=' + x.querySelector('.gr-answer').textContent.slice(0, 12)));
    const sigA = await sig(); await page.reload(); await page.waitForSelector('.gr-card'); const sigB = await sig();
    check(JSON.stringify(sigA) === JSON.stringify(sigB), 'student order stable across reloads');
    // filter default: ungraded only
    const q1cards = await page.locator('section[aria-label="Question 2"] .gr-card').count(); // exam question numbering: o1 is Q2
    check(q1cards === 4, `Ungraded filter: Q2(o1) shows 4 of 6 cards (${q1cards})`);
    check((await page.locator('section[aria-label="Question 2"] .gr-progress').textContent()).trim() === '2 of 6 graded', 'progress 2 of 6 graded');
    check((await page.locator('section[aria-label="Question 3"] .gr-progress').textContent()).trim() === '1 of 6 graded', 'progress Q3 1 of 6 graded');
    // answer shown in full with pre-wrap
    const ws = await page.locator('.gr-answer').first().evaluate((e) => getComputedStyle(e).whiteSpace);
    check(ws === 'pre-wrap', 'answer white-space pre-wrap');
    // validation: 2.3 not saved
    const first = page.locator('section[aria-label="Question 2"] input.gin').first();
    await first.fill('2.3'); await first.press('Enter');
    check(await first.evaluate((e) => e.classList.contains('invalid')), 'invalid 2.3 flagged inline');
    check((await page.locator('.gr-err:not(:empty)').count()) === 1 && puts.length === 0, 'invalid value not saved (no PUT)');
    await first.fill('9'); await first.press('Enter');
    check(await first.evaluate((e) => e.classList.contains('invalid')) && puts.length === 0, '9 > max flagged, not saved');
    // valid: 3.5 + Enter -> saves, focuses next
    await first.fill('3.5'); await first.press('Enter');
    await page.waitForTimeout(300);
    check(puts.length === 1 && puts[0].points === 3.5 && puts[0].qid === 'o1' && puts[0].comment === '', 'Enter saves {qid, points 3.5, comment}: ' + JSON.stringify(puts[0]));
    const focusedIsNext = await page.evaluate(() => { const a = [...document.querySelectorAll('input.gin')]; return a.indexOf(document.activeElement) === 1; });
    check(focusedIsNext, 'Enter focused the next grade input');
    check((await page.locator('section[aria-label="Question 2"] .gr-card').count()) === 4, 'graded card stays visible under filter');
    check((await page.locator('section[aria-label="Question 2"] .gr-progress').textContent()).trim() === '3 of 6 graded', 'progress updated live to 3 of 6');
    // comment save
    const com = page.locator('section[aria-label="Question 2"] input.gcom').first();
    await com.fill('Needs the q-line'); await com.press('Enter'); await page.waitForTimeout(300);
    check(puts.length === 2 && puts[1].points === 3.5 && puts[1].comment === 'Needs the q-line', 'comment save payload ' + JSON.stringify(puts[1]));
    // blur save via change (second input)
    const second = page.locator('input.gin').nth(1);
    await second.fill('0'); await second.press('Tab'); await page.waitForTimeout(300);
    check(puts.length === 3 && puts[2].points === 0, 'blur/change saves 0');
    check((await page.locator('.gr-status.ok', { hasText: 'Saved ✓' }).count()) >= 2, 'Saved ✓ shown');
    await page.screenshot({ path: `${SHOTS}/desktop-1280.png`, fullPage: true });
    await noScroll(page, 1280, 'grade desktop');
    // toggle filter off -> all 6 shown; on again -> graded ones dropped
    await page.getByLabel('Ungraded only').uncheck();
    check((await page.locator('section[aria-label="Question 2"] .gr-card').count()) === 6, 'filter off shows all 6');
    await page.getByLabel('Ungraded only').check();
    check((await page.locator('section[aria-label="Question 2"] .gr-card').count()) === 2, 'filter re-applied after toggle: 2 ungraded left in Q2 (got ' + await page.locator('section[aria-label="Question 2"] .gr-card').count() + ')');
    // names
    await page.getByLabel('Show names').check();
    const nm = await labels(page);
    check(nm.some((n) => n.includes('Lovelace') || n.includes('Brown') || n.includes('Chen')), 'names shown: ' + nm.slice(0, 2).join(' | '));
    await page.reload(); await page.waitForSelector('.gr-card');
    check(await page.getByLabel('Show names').isChecked(), 'names toggle remembered across reload');
    await page.getByLabel('Show names').uncheck();
    // grouping by student
    await page.getByRole('button', { name: 'Student', exact: true }).click();
    const secs = await page.locator('section.gr-group').count();
    check(secs >= 4 && (await page.locator('section.gr-group').first().locator('.gr-card').count()) >= 1, 'group by student renders sections: ' + secs);
    await page.reload(); await page.waitForSelector('.gr-card');
    check((await page.locator('.gr-segbtn.on').textContent()) === 'Student', 'grouping remembered');
    await page.getByRole('button', { name: 'Question', exact: true }).click();
    check(errs.length === 0, 'no console errors (desktop 1280) ' + errs.join(';'));
    // validation error from server (422): mock a 0.5 violation passes client, so use r422 mode
    mode = 'r422';
    const inp = page.locator('input.gin').nth(2);
    await inp.fill('1'); await inp.press('Enter'); await page.waitForTimeout(400);
    check(await page.locator('.gr-status.bad').count() === 1 && (await page.locator('.gr-status.bad').textContent()).includes('multiple of 0.5'), 'server 422 shown inline');
    check((await inp.inputValue()) !== '' , 'input kept for editing after server reject');
    mode = 'ok';
    await ctx.close();

    // ---------------------------------------------------------------- offline queue (desktop)
    subs = mkSubs(); puts = []; mode = 'abort';
    ({ ctx, page, errs } = await newPage(1280, 900));
    await open(page);
    await page.clock.install();
    await page.reload(); await page.waitForSelector('.gr-card');
    const g0 = page.locator('input.gin').first();
    await g0.fill('2'); await g0.press('Enter'); await page.waitForTimeout(300);
    check(await page.locator('.gr-pending').isVisible() && (await page.locator('.gr-pending').textContent()).startsWith('1 unsaved'), 'pending badge shows 1 after network failure');
    const q = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `sebgrade:${EID}:queue`);
    check(Array.isArray(q) && q.length === 1 && q[0].points === 2, 'queued in localStorage sebgrade:<id>:queue');
    check((await page.locator('.gr-status.warn').count()) === 1, 'row shows will-retry status');
    // UI still responsive: edit another
    const g1 = page.locator('input.gin').nth(1);
    await g1.fill('1.5'); await g1.press('Enter'); await page.waitForTimeout(300);
    check((await page.locator('.gr-pending').textContent()).startsWith('2 unsaved'), 'second grade queued, UI responsive');
    mode = 'ok';
    await page.clock.fastForward(10500); await page.waitForTimeout(600);
    check(puts.length === 2 && !(await page.locator('.gr-pending').isVisible()), 'retry after 10 s sent both, badge gone');
    check((await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), `sebgrade:${EID}:queue`)).length === 0, 'queue emptied');
    // online event
    mode = 'abort';
    const g2 = page.locator('input.gin').nth(2); await g2.fill('1'); await g2.press('Enter'); await page.waitForTimeout(300);
    mode = 'ok'; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.waitForTimeout(500);
    check(!(await page.locator('.gr-pending').isVisible()) && puts.length === 3, 'online event flushes queue');
    // persisted queue survives reload
    mode = 'abort';
    const g3 = page.locator('input.gin').nth(3); await g3.fill('2.5'); await g3.press('Enter'); await page.waitForTimeout(300);
    await page.reload(); await page.waitForSelector('.gr-card'); await page.waitForTimeout(300);
    check((await page.locator('.gr-pending').textContent()).startsWith('1 unsaved'), 'queue restored after reload');
    check(errs.length === 0, 'no console errors (offline) ' + errs.join(';'));
    await ctx.close();

    // ---------------------------------------------------------------- 2560
    subs = mkSubs(); puts = []; mode = 'ok';
    ({ ctx, page, errs } = await newPage(2560, 1300));
    await open(page);
    await page.getByLabel('Ungraded only').uncheck();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/desktop-2560.png`, fullPage: false });
    await noScroll(page, 2560, 'grade desktop');
    const ans = await page.locator('.gr-answer').first().boundingBox();
    check(ans.width < 800, 'answer line length bounded at 2560 (' + Math.round(ans.width) + 'px)');
    check(errs.length === 0, 'no console errors (2560) ' + errs.join(';'));
    await ctx.close();

    // ---------------------------------------------------------------- mobile 390
    subs = mkSubs(); puts = []; mode = 'ok';
    ({ ctx, page, errs } = await newPage(390, 844));
    await open(page);
    await page.screenshot({ path: `${SHOTS}/mobile-390.png`, fullPage: true });
    await noScroll(page, 390, 'grade phone');
    check(await page.locator('.gr-card.mob').count() === 1, 'phone shows one card');
    const pos = () => page.locator('.gr-pos').textContent();
    const who = () => page.locator('.gr-card.mob .gr-who').textContent();
    const p0 = await pos(); const w0 = await who();
    check(/^Answer 1 of \d+$/.test(p0), 'position text: ' + p0);
    // buttons
    await page.getByLabel('Next answer').click();
    const w1 = await who();
    check(w1 !== w0 && /Q2/.test(w1) && /^Answer 2 of/.test(await pos()), 'next button: next student same question (' + w1 + ')');
    await page.getByLabel('Previous answer').click();
    check((await who()) === w0, 'previous button returns');
    // slider: save on release
    const slider = page.locator('.gr-slider');
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + 14, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 5 });
    check(puts.length === 0, 'slider drag does not save before release');
    await page.mouse.up(); await page.waitForTimeout(300);
    check(puts.length === 1 && puts[0].qid === 'o1' && puts[0].points % 0.5 === 0 && puts[0].points > 0, 'slider saves on release: ' + JSON.stringify(puts[0]));
    check((await page.locator('.gr-big .v').textContent()) === String(puts[0].points), 'big value shows ' + puts[0].points);
    check((await page.locator('.gr-status').textContent()).includes('Saved ✓'), 'Saved ✓ on phone');
    check((await who()) === w0, 'dragging slider did not swipe');
    // swipe via dispatched pointer events
    const swipe = (dx, dy, sel) => page.evaluate(([dx, dy, sel]) => {
      const el = document.querySelector(sel || '.gr-card.mob .gr-answer'); const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 30);
      const mk = (t, cx, cy) => new PointerEvent(t, { bubbles: true, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true });
      el.dispatchEvent(mk('pointerdown', x, y)); el.dispatchEvent(mk('pointermove', x + dx / 2, y + dy / 2)); el.dispatchEvent(mk('pointerup', x + dx, y + dy));
    }, [dx, dy, sel]);
    await swipe(-90, 5); await page.waitForTimeout(150);
    const w2 = await who();
    check(w2 !== w0, 'swipe left -> next card (' + w2 + ')');
    await swipe(90, 5); await page.waitForTimeout(150);
    check((await who()) === w0, 'swipe right -> previous card');
    await swipe(-30, 0); await page.waitForTimeout(100);
    check((await who()) === w0, 'short swipe (30px) ignored');
    await swipe(-90, 120); await page.waitForTimeout(100);
    check((await who()) === w0, 'mostly vertical move ignored');
    await swipe(-120, 0, '.gr-slider'); await page.waitForTimeout(100);
    check((await who()) === w0, 'swipe started on slider ignored');
    await swipe(-120, 0, '.gr-comment'); await page.waitForTimeout(100);
    check((await who()) === w0, 'swipe started on textarea ignored');
    // comment save on phone
    await page.fill('.gr-comment', 'nice'); await page.locator('.gr-comment').blur(); await page.waitForTimeout(300);
    check(puts.length === 2 && puts[1].comment === 'nice' && puts[1].points === puts[0].points, 'comment saved with current points ' + JSON.stringify(puts[1]));
    // graded card stays under filter after navigating away and back
    await page.getByLabel('Next answer').click(); await page.getByLabel('Previous answer').click();
    check((await who()) === w0, 'graded card stays visible under filter');
    // question picker
    await page.selectOption('.gr-picker', 'o2'); await page.waitForTimeout(200);
    check(/Q3/.test(await who()), 'picker jumps to Q3 (' + await who() + ')');
    check((await page.locator('.gr-picker option:checked').textContent()).includes('of 6 graded'), 'picker shows progress');
    // order toggle: next question same student
    await page.getByRole('button', { name: 'Next question' }).click();
    await page.getByLabel('Ungraded only').uncheck();
    await page.selectOption('.gr-picker', 'o1'); await page.waitForTimeout(200);
    const wa = await who();
    await page.getByLabel('Next answer').click();
    const wb = await who();
    check(/Q2/.test(wa) && /Q3/.test(wb) && wa.split('Q')[0] === wb.split('Q')[0], 'next-question order keeps same student: ' + wa + ' -> ' + wb);
    await page.getByLabel('Next answer').click();
    check((await who()).split('Q')[0] !== wb.split('Q')[0], 'then moves to next student');
    await page.reload(); await page.waitForSelector('.gr-card.mob');
    check((await page.locator('.gr-segbtn.on').textContent()) === 'Next question', 'phone order remembered');
    // swipe-driven resize to desktop
    await page.setViewportSize({ width: 1000, height: 800 }); await page.waitForTimeout(400);
    check((await page.locator('.gr-card:not(.mob)').count()) > 0 && (await page.locator('.gr-card.mob').count()) === 0, 'resize to desktop re-lays out');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
    check((await page.locator('.gr-card.mob').count()) === 1, 'resize back to phone re-lays out');
    // offline slider
    mode = 'abort';
    const sl = page.locator('.gr-slider'); await sl.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
    check((await page.locator('.gr-pending').isVisible()), 'phone: offline slider (keyboard) queued, badge visible');
    check(errs.length === 0, 'no console errors (phone) ' + errs.join(';'));
    await ctx.close();

    // ---------------------------------------------------------------- no open questions
    const saved = questions.splice(1, 2);
    ({ ctx, page, errs } = await newPage(1280, 800));
    await page.goto(BASE + '/' + BASE_HASH); await page.waitForSelector('.msg.ok', { timeout: 10000 });
    check((await page.locator('.msg.ok').textContent()).includes('no open questions'), 'friendly message without open questions');
    questions.push(...saved); await ctx.close();
  } catch (e) { console.log('FAIL exception: ' + e.stack); checks.push(false); }
  await browser.close(); srv.kill();
  console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed; screenshots in ${SHOTS}`);
  process.exit(checks.every(Boolean) ? 0 : 1);
})();
