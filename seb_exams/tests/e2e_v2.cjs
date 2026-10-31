// End-to-end test of the whole system on this machine: Worker + D1 (wrangler dev --local, DEV=1), the teacher
// app served by the Worker, and the student page served as /exam/ by a static server. Real browser, real API;
// only Safe Exam Browser is simulated, through its JavaScript API (configKey = SHA256(page URL + Config Key)).
//   node tests/e2e_v2.cjs [shots-dir] [exam.zip]
// The default exam is examples/example-exam.zip; pass private/mccabe-thiele.zip to test the real exam.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execSync, execFileSync } = require("child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const ROOT = path.resolve(__dirname, "..");
const W = path.join(ROOT, "worker");
const WR = path.join(ROOT, ".buildtools/node_modules/.bin/wrangler");
const APP = "http://localhost:8787";
const REAL_API = "https://seb-exams.carloscomail.workers.dev";
const STUDENT = "http://localhost:8765/exam/";
const SHOTS = process.argv[2] || path.join(os.tmpdir(), "seb_e2e_shots");
const ZIP = path.resolve(process.argv[3] || path.join(ROOT, "examples/example-exam.zip"));
const ADMIN = "admin@example.com", TEACHER_B = "bee@example.com";
const env = { ...process.env, NODE_EXTRA_CA_CERTS: "/root/.ccr/ca-bundle.crt" };

let failures = 0;
const check = (cond, what) => { console.log((cond ? "PASS " : "FAIL ") + what); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => JSON.parse(execFileSync(WR, ["d1", "execute", "seb-exams", "--local", "--json", "--command", q],
  { cwd: W, env, stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;

async function waitFor(url) {
  for (let i = 0; i < 90; i++) { try { await fetch(url); return; } catch (e) { await sleep(1000); } }
  throw new Error("server did not start: " + url);
}

// ------------------------------------------------------------ teacher helpers
async function teacherPage(browser, email, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(APP + "/#/login");
  await page.fill("#login-email", email);
  await page.click("text=Email me a sign-in link");
  await page.waitForSelector("text=a sign-in link is on its way");
  const body = sql(`SELECT body FROM outbox WHERE to_email='${email}' ORDER BY id DESC LIMIT 1`)[0].body;
  const link = body.match(/https?:\/\/\S+?\/auth\/verify\?token=[A-Za-z0-9_-]+/)[0];
  await page.goto(link);
  await page.click("button");
  await page.waitForSelector("#bar:not(.hidden)");
  return page;
}

async function api(page, method, p, body) {
  return page.evaluate(async ([m, p, b]) => {
    const r = await fetch(p, { method: m, headers: { "X-Requested-With": "seb-exams", "Content-Type": "application/json" },
      body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [method, p, body]);
}

// Click the bar button whose label starts with `label` and answer the file chooser with `file`.
async function pickZip(page, label, file) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
    page.locator(`#bar button:has-text("${label}")`).first().click()]);
  await chooser.setFiles(file);
}

// ------------------------------------------------------------ student helpers
async function studentPage(browser, { ck = null, width = 1280 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 4\d\d/.test(m.text())) page.errors.push(m.text()); });
  await page.route(REAL_API + "/**", async (r) => {  // the student page talks to the real Worker URL; send it here
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "http://localhost:8765", "access-control-allow-headers": "Content-Type",
      "access-control-allow-methods": "GET, POST, OPTIONS" } });
    r.fulfill({ response: await r.fetch({ url: r.request().url().replace(REAL_API, APP) }) });
  });
  if (ck) {
    await page.addInitScript((key) => {
      window.SafeExamBrowser = { version: "test", security: { configKey: "", updateKeys(cb) {
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(location.href.split("#")[0] + key)).then((h) => {
          this.configKey = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); cb(); });
      } } };
    }, ck);
  }
  return page;
}

async function startExam(page, id, name, sid) {
  await page.goto(STUDENT + "?id=" + id);
  await page.fill("#name", name);
  await page.fill("#sid", sid);
  await page.click("#startbtn");
}

// Answer every question from the teacher's view of the exam: right answers when good, wrong ones otherwise.
async function answerAll(page, content, good) {
  for (const q of content.questions) {
    const card = page.locator(`[data-q="${q.id}"]`);
    if (q.type === "mc") {
      const i = q.options.findIndex((o) => o.correct);
      await card.locator(`input[value="${String.fromCharCode(97 + (good ? i : (i + 1) % q.options.length))}"]`).check();
    } else if (q.type === "fill") {
      for (let b = 0; b < q.blanks.length; b++) {
        const bl = q.blanks[b];
        const word = good ? (bl.variants && bl.variants[0]) || bl.answer : bl.answer.replace(/[A-Za-z0-9]/g, "x");
        const pat = bl.clue || bl.answer.replace(/[A-Za-z0-9]/g, "_");
        const typed = [...word].filter((c, k) => pat[k] === "_").join("");
        await card.locator(".blank").nth(b).locator("input.box").first().click();
        await page.keyboard.type(good ? typed.toUpperCase() : typed);
      }
    } else {
      await card.locator("textarea").fill(good ? "Because the vapour pressure rises, \"quoted\", with a comma." : "No idea.");
    }
  }
}

async function submit(page) {
  await page.click("#submitbtn2");
  await page.click("#yes");
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  // fresh local database and servers
  execFileSync("node", [path.join(ROOT, "tools/bundle_public.mjs")], { stdio: "inherit" });
  fs.writeFileSync(path.join(W, ".dev.vars"), `ADMIN_EMAIL=${ADMIN}\nMAIL_SECRET=x\nDEV=1\nAPP_ORIGIN=${APP}\n`);
  fs.rmSync(path.join(W, ".wrangler/state/v3/d1"), { recursive: true, force: true });
  execFileSync(WR, ["d1", "execute", "seb-exams", "--local", "--file", "schema.sql"], { cwd: W, env, stdio: "ignore" });
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "seb_site_"));
  fs.cpSync(path.join(ROOT, "student"), path.join(site, "exam"), { recursive: true });
  const dev = spawn(WR, ["dev", "--local", "--port", "8787"], { cwd: W, env, detached: true, stdio: "ignore" });
  const web = spawn("python3", ["-m", "http.server", "8765"], { cwd: site, detached: true, stdio: "ignore" });
  const stop = () => { for (const p of [dev, web]) { try { process.kill(-p.pid, "SIGTERM"); } catch (e) { /* gone */ } } };
  process.on("exit", stop);
  await waitFor(APP + "/s/info?id=none");
  await waitFor(STUDENT);
  const browser = await chromium.launch();
  try {
    // ---------------------------------------------------------- teacher: sign in, import, view
    const T = await teacherPage(browser, ADMIN);
    check(true, "admin signs in with the emailed link");
    await pickZip(T, "Import", ZIP);
    await T.waitForSelector("text=Preview – not saved", { timeout: 15000 });
    check((await (await api(T, "GET", "/api/exams")).data).length === 0, "an uploaded zip is not saved before approval");
    await T.click("button:has-text('Approve and save')");
    await T.waitForURL(/#\/exam\/[a-z]{2}-[a-z0-9]+\/questions/, { timeout: 15000 });
    const id = T.url().match(/#\/exam\/([^/]+)\//)[1];
    check(/^[a-z]{2}-[a-z0-9]{6}$/.test(id), "import creates a random exam id " + id);
    await T.waitForSelector(".q");
    const ex = (await api(T, "GET", `/api/exams/${id}`)).data;
    const content = ex.content;
    check(await T.locator(".opt.correct").count() === content.questions.filter((q) => q.type === "mc").length,
      "Questions tab marks every correct option");
    check(await T.evaluate(() => [...document.querySelectorAll(".q img")].every((i) => i.complete && i.naturalWidth > 0)), "images load in the teacher view");
    await T.screenshot({ path: path.join(SHOTS, "teacher-questions-1280.png"), fullPage: true });

    // nothing about the exam is public before it opens
    const info = await (await fetch(`${APP}/s/info?id=${id}`)).json();
    check(info.status === "draft" && !JSON.stringify(info).includes(content.questions[0].text.slice(0, 20)), "/s/info gives no questions; exam is a draft");

    // ---------------------------------------------------------- settings: open now
    await T.goto(`${APP}/#/exam/${id}/settings`);
    await T.waitForSelector(".linkrow");
    await T.click("text=Open now");
    await T.waitForSelector("text=Exam opened.");
    check((await api(T, "GET", `/api/exams/${id}`)).data.opens_at !== null, "Open now sets the opening time");
    const CK = (await api(T, "GET", `/api/exams/${id}`)).data.config_key;
    const seb = await (await fetch(`${APP}/s/seb/${id}.seb`)).text();
    check(seb.includes(`<string>https://chetools.github.io/claude/seb_exams/exam/?id=${id}</string>`), ".seb file starts the student page for this exam");

    // ---------------------------------------------------------- students
    let S = await studentPage(browser);
    await S.goto(STUDENT + "?id=" + id);
    await S.waitForSelector("#sebgate:not(.hidden)");
    check(await S.isDisabled("#startbtn"), "outside SEB: Start is disabled");
    const html = await S.content();
    check(!html.includes(content.questions[0].text.slice(0, 30)), "outside SEB: no question text in the page");
    await S.context().close();

    S = await studentPage(browser, { ck: "0".repeat(64) });
    await startExam(S, id, "Wrong Key", "W-1");
    await S.waitForSelector("#msg .msg");
    check(/configuration|Safe Exam Browser/i.test(await S.textContent("#msg")), "wrong SEB Config Key is refused");
    await S.context().close();

    S = await studentPage(browser, { ck: CK });
    await startExam(S, id, "Ada Good", "s-good");
    await S.waitForSelector("#exam:not(.hidden)");
    await answerAll(S, content, true);
    await S.waitForTimeout(800);
    await S.reload();
    await S.waitForSelector("#exam:not(.hidden)");
    const firstFill = content.questions.find((q) => q.type === "fill");
    if (firstFill) {
      const v = await S.evaluate((qid) => document.querySelector(`[data-q="${qid}"] .blank`).value(), firstFill.id);
      check(!v.includes("_"), "fill answers survive a reload: " + v);
    }
    await S.screenshot({ path: path.join(SHOTS, "student-exam-1280.png"), fullPage: true });
    await submit(S);
    await S.waitForSelector("#done:not(.hidden)");
    const receipt = (await S.textContent("#receipt")).trim();
    check(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(receipt), "receipt " + receipt);
    check(S.errors.length === 0, "student page: no errors " + S.errors.join(" | "));
    await S.context().close();

    S = await studentPage(browser, { ck: CK });
    await startExam(S, id, "Ada Again", "S-GOOD");
    await S.waitForSelector("#msg .msg");
    check(/already/i.test(await S.textContent("#msg")), "same student ID cannot start again after submitting");
    await S.context().close();

    S = await studentPage(browser, { ck: CK });
    await S.clock.install();
    await startExam(S, id, "Bo Late", "s-time");
    await S.waitForSelector("#exam:not(.hidden)");
    await answerAll(S, content, false);
    await S.clock.fastForward(content.duration_minutes * 60000 + 5000);
    await S.waitForSelector("#done:not(.hidden)", { timeout: 20000 });
    check(true, "exam submits itself when the time is up");
    await S.context().close();

    // ---------------------------------------------------------- results and grading
    await T.goto(`${APP}/#/exam/${id}/results`);
    await T.waitForSelector("table.results");
    const res = (await api(T, "GET", `/api/exams/${id}/results`)).data;
    const good = res.submissions.find((s) => s.student_id === "S-GOOD");
    const bad = res.submissions.find((s) => s.student_id === "S-TIME");
    check(good && good.auto_score === good.auto_max && good.auto_max > 0, `correct answers get full automatic marks (${good && good.auto_score}/${good && good.auto_max})`);
    check(bad && bad.auto_score === 0, "wrong answers get zero");
    check(good.receipt === receipt, "receipt matches the database");
    const openQ = content.questions.find((q) => q.type === "open");
    if (openQ) {
      const row = T.locator("table.results tbody tr", { hasText: "S-GOOD" });
      await row.locator("input.num").first().fill(String(openQ.points));
      await row.locator("input.num").first().press("Tab");
      await T.waitForTimeout(800);
      const after = (await api(T, "GET", `/api/exams/${id}/results`)).data.submissions.find((s) => s.student_id === "S-GOOD");
      check(after.manual[openQ.id] && after.manual[openQ.id].points === openQ.points, "manual grade of an open answer is saved");
    }
    const [csvDl] = await Promise.all([T.waitForEvent("download"), T.click("text=Download CSV")]);
    const csv = fs.readFileSync(await csvDl.path(), "utf8");
    check(csv.includes("S-GOOD") && csv.includes('"Because the vapour pressure rises, ""quoted"", with a comma."'), "CSV export with quoted open answers");
    await T.screenshot({ path: path.join(SHOTS, "teacher-results-1280.png"), fullPage: true });

    // ---------------------------------------------------------- re-grade after an answer-key change
    const mc = content.questions.find((q) => q.type === "mc");
    const changed = JSON.parse(JSON.stringify(content));
    const cq = changed.questions.find((q) => q.id === mc.id);
    const ci = cq.options.findIndex((o) => o.correct);
    cq.options.forEach((o, k) => { o.correct = k === (ci + 1) % cq.options.length; });
    check((await api(T, "PUT", `/api/exams/${id}/content`, { content: changed })).status === 423, "questions cannot be changed while the exam is open");
    await api(T, "POST", `/api/exams/${id}/close-now`);
    const put = await api(T, "PUT", `/api/exams/${id}/content`, { content: changed });
    check(put.status === 200, "content update accepted once closed");
    const re = (await api(T, "GET", `/api/exams/${id}/results`)).data.submissions;
    check(re.find((s) => s.student_id === "S-GOOD").auto_score === good.auto_score - mc.points &&
          re.find((s) => s.student_id === "S-TIME").auto_score === mc.points, "changing the key re-grades stored submissions");
    await api(T, "PUT", `/api/exams/${id}/content`, { content });

    // ---------------------------------------------------------- replace from zip: preview with change summary, approve
    await T.goto(`${APP}/#/exam/${id}/questions`);
    await T.waitForSelector(".q");
    await pickZip(T, "Replace", ZIP);
    await T.waitForSelector("text=Preview – not saved", { timeout: 15000 });
    check(await T.isVisible("button:has-text('Approve and replace')"), "replace shows a preview with Approve and replace");
    await T.click("button:has-text('Approve and replace')");
    await T.waitForSelector(".q:not(.preview)", { timeout: 15000 });
    check((await api(T, "GET", `/api/exams/${id}/results`)).data.submissions.length >= 2, "replacing keeps the submissions");

    // ---------------------------------------------------------- Grade tab (real backend)
    if (openQ) {
      await T.goto(`${APP}/#/exam/${id}/grade`);
      await T.waitForSelector(".gr-toolbar");
      const ungraded = await T.locator("input.gin").count();
      check(ungraded >= 1, `Grade tab lists ungraded essays only (${ungraded} input(s))`);
      check(!(await T.textContent("#app")).includes("Ada Good"), "Grade tab is anonymous by default");
      await T.locator("input.gin").first().fill("2.3");
      await T.locator("input.gin").first().press("Enter");
      await T.waitForTimeout(600);
      let rs = (await api(T, "GET", `/api/exams/${id}/results`)).data.submissions.find((x) => x.student_id === "S-TIME");
      check(!(rs.manual[openQ.id] && rs.manual[openQ.id].points === 2.3), "a grade that is not a multiple of 0.5 is not saved");
      await T.locator("input.gin").first().fill("1.5");
      await T.locator("input.gin").first().press("Enter");
      await T.waitForTimeout(800);
      rs = (await api(T, "GET", `/api/exams/${id}/results`)).data.submissions.find((x) => x.student_id === "S-TIME");
      check(rs.manual[openQ.id] && rs.manual[openQ.id].points === 1.5, "Grade tab saves 1.5 points to the database");
      await T.evaluate(() => window.scrollTo(0, 400));
      await T.waitForTimeout(300);
      await T.screenshot({ path: path.join(SHOTS, "teacher-grade-1280.png") });  // viewport: full-page shots misplace sticky bars
    }

    // ---------------------------------------------------------- Submissions tab (real backend)
    await T.goto(`${APP}/#/exam/${id}/submissions`);
    await T.waitForSelector(".sv-viewall");
    await T.click(".sv-viewall");
    await T.waitForSelector(".subview");
    const nsub = (await api(T, "GET", `/api/exams/${id}/results`)).data.submissions.length;
    check(await T.locator(".subview").count() === nsub, `View all shows every submission (${nsub})`);
    check((await T.textContent("#app")).includes("Because the vapour pressure rises"), "essay text shown as entered");
    const [zdl] = await Promise.all([T.waitForEvent("download"), T.click(".sv-zip")]);
    const zbuf = fs.readFileSync(await zdl.path());
    check(zbuf.slice(0, 2).toString() === "PK" && zbuf.includes(Buffer.from("S-GOOD.html")), "zip export has one HTML file per student");
    await T.screenshot({ path: path.join(SHOTS, "teacher-submissions-1280.png"), fullPage: true });
    await api(T, "POST", `/api/exams/${id}/open-now`);

    // ---------------------------------------------------------- export -> import round trip
    const exp = (await api(T, "GET", `/api/exams/${id}/export`)).data;
    const imp = await api(T, "POST", "/api/exams/import", exp);
    check(imp.status === 200, "exported exam imports again");
    const back = (await api(T, "GET", `/api/exams/${imp.data.id}`)).data.content;
    check(JSON.stringify(back.questions) === JSON.stringify(content.questions), "round trip keeps every question identical");

    // ---------------------------------------------------------- second teacher and access control
    await T.goto(`${APP}/#/admin`);
    await T.waitForSelector("table");
    const addCard = T.locator(".card", { hasText: "Add a teacher" });
    await addCard.locator("input").nth(0).fill(TEACHER_B);
    await addCard.locator("input").nth(1).fill("Bee Teacher");
    await addCard.locator("button:has-text('Add')").click();
    await T.waitForSelector(`text=${TEACHER_B}`);
    const B = await teacherPage(browser, TEACHER_B);
    check((await api(B, "GET", `/api/exams/${id}`)).status === 403, "another teacher cannot open the exam");
    check((await api(B, "GET", `/api/exams/${id}/results`)).status === 403, "...nor its results");
    check(!(await B.content()).includes(id), "...nor see it on the dashboard");
    await api(T, "POST", `/api/exams/${id}/teachers`, { email: TEACHER_B });
    check((await api(B, "GET", `/api/exams/${id}/results`)).status === 200, "a co-teacher added by the owner can see results");
    check((await api(B, "GET", "/api/teachers")).status === 403, "a non-admin cannot manage teachers");
    check(T.errors.length === 0 && B.errors.length === 0, "teacher app: no errors " + [...T.errors, ...B.errors].join(" | "));

    // ---------------------------------------------------------- practice exam
    await T.goto(`${APP}/#/`);
    await T.waitForSelector("#bar:not(.hidden)");
    await T.locator('#bar button:has-text("Practice")').click();
    await T.waitForURL(/#\/exam\/[a-z]{2}-[a-z0-9]+\/questions/, { timeout: 15000 });
    const pid = T.url().match(/#\/exam\/([^/]+)\//)[1];
    const pex = (await api(T, "GET", `/api/exams/${pid}`)).data;
    const pres = (await api(T, "GET", `/api/exams/${pid}/results`)).data;
    const popen = pres.questions.filter((q) => q.type === "open").map((q) => q.id);
    const graded = pres.submissions.filter((s) => popen.some((q) => s.manual[q] && s.manual[q].points !== null)).length;
    const scores = pres.submissions.map((s) => s.auto_score);
    check(pex.practice === true && /^Practice – /.test(pex.content.title), "Practice exam button creates a practice copy");
    check(pres.submissions.length === 12 && pres.submissions.filter((s) => s.late).length === 1, "practice exam has 12 made-up submissions, one late");
    check(graded >= 3 && graded < 12, `some practice essays are graded, some are left to grade (${graded}/12)`);
    check(Math.max(...scores) > Math.min(...scores), `practice students range in quality (scores ${Math.min(...scores)}..${Math.max(...scores)})`);
    check((await (await fetch(`${APP}/s/info?id=${pid}`)).json()).status === "closed", "practice exam is closed, so no student can sit it by accident");
    await T.goto(`${APP}/#/`);
    await T.waitForSelector("table.exams");
    check(await T.locator("table.exams .badge.practice").count() === 1, "dashboard marks the practice exam");
    await T.goto(`${APP}/#/exam/${pid}/grade`);
    await T.waitForSelector(".gr-toolbar");
    check(await T.locator("input.gin").count() > 0, "practice essays can be graded on the Grade tab");

    // ---------------------------------------------------------- layout at phone and wide-monitor widths
    for (const width of [390, 2560]) {
      const P = await teacherPage(browser, ADMIN, width);
      for (const tab of ["questions", "edit", "grade", "submissions", "settings", "results"]) {
        await P.goto(`${APP}/#/exam/${id}/${tab}`);
        await P.reload();
        await P.waitForSelector("#app .card, #app table, #app .gr-toolbar, #app .subview, #app .sv-viewall", { timeout: 10000 });
        await P.waitForTimeout(500);
        await P.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await P.waitForTimeout(200);
        const m = await P.evaluate(() => { const a = document.querySelector("#head").getBoundingClientRect(), b = document.querySelector("#app").getBoundingClientRect();
          const bar = document.querySelector("#bar"); const bt = bar ? bar.getBoundingClientRect().top : -1;
          const natural = document.querySelector("header.top").getBoundingClientRect().bottom + window.scrollY;  // bar's unstuck position
          return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, d: Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right)),
                   bt: window.scrollY >= natural ? bt : bt === natural - window.scrollY ? 0 : bt }; });
        check(m.sw <= m.cw && m.d < 1, `teacher ${tab} @${width}: no horizontal scroll, header aligned (${m.sw}/${m.cw}, ${m.d.toFixed(1)})`);
        check(m.bt === 0, `teacher ${tab} @${width}: bar stays in view, at the top once scrolled past (top ${m.bt})`);
        await P.screenshot({ path: path.join(SHOTS, `teacher-${tab}-${width}.png`), fullPage: width === 390 });
      }
      check(P.errors.length === 0, `teacher app @${width}: no errors ` + P.errors.join(" | "));
      await P.context().close();
      const Q = await studentPage(browser, { ck: CK, width });
      await startExam(Q, id, "Layout Check", `L-${width}`);
      await Q.waitForSelector("#exam:not(.hidden)");
      const m = await Q.evaluate(() => { const a = document.querySelector("header .wrap").getBoundingClientRect(), b = document.querySelector("main .wrap").getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, d: Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right)) }; });
      check(m.sw <= m.cw && m.d < 1, `student exam @${width}: no horizontal scroll, header aligned (${m.sw}/${m.cw}, ${m.d.toFixed(1)})`);
      if (m.sw > m.cw) console.log("  overflowing:", await Q.evaluate(() => [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 6)
        .map((e) => e.tagName + "." + e.className + " " + Math.round(e.getBoundingClientRect().right)).join(", ")));
      await Q.screenshot({ path: path.join(SHOTS, `student-exam-${width}.png`), fullPage: width === 390 });
      await Q.context().close();
    }
  } catch (e) {
    console.log("FAIL exception: " + (e.stack || e));
    failures++;
  } finally {
    await browser.close();
    stop();
    fs.rmSync(site, { recursive: true, force: true });
  }
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})();
