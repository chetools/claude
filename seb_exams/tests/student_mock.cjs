// Student page test with a mocked Worker API. Run: node tests/student_mock.cjs [shots-dir]
const path = require("path"), fs = require("fs"), os = require("os");
const { execSync, spawn } = require("child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const ROOT = path.resolve(__dirname, "..");
const SHOTS = process.argv[2] || path.join(ROOT, "tests", "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const API = "https://seb-exams.carloscomail.workers.dev";
const PORT = 8766, BASE = `http://localhost:${PORT}/exam/`;
const ID = "mt-7k2p9x";
let failures = 0;
const check = (c, w) => { console.log((c ? "PASS " : "FAIL ") + w); if (!c) failures++; };

// scratch copy served as /exam/
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "stu-"));
fs.mkdirSync(path.join(scratch, "exam"));
for (const f of ["index.html", "done.html"]) fs.copyFileSync(path.join(ROOT, "student", f), path.join(scratch, "exam", f));

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const EXAM = {
  id: ID, title: "McCabe–Thiele distillation", intro: "Read **carefully**. Use $x_D$.", duration_minutes: 45,
  questions: [
    { id: "q1", type: "mc", points: 2, text: "Slope is $y = \\dfrac{R}{R+1}x$?\n\n$$E = mc^2$$", image: PNG, image_alt: "a tiny test image", shuffle_options: true,
      options: [{ id: "a", text: "yes $R/(R+1)$" }, { id: "b", text: "no" }, { id: "c", text: "maybe" }, { id: "d", text: "never" }] },
    { id: "q2", type: "mc", points: 1, text: "Fixed order?", shuffle_options: false, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
    { id: "q3", type: "fill", points: 2, text: "CMO assumes equal molar heats of [[1]] and the line is [[2]] for the [[3]].",
      blanks: [{ pattern: "_a__________" }, { pattern: "___-__ _" }, { pattern: "a_c" }] },
    { id: "q4", type: "fill", points: 1, text: "A long word: [[1]]", blanks: [{ pattern: "_______________ ________ ____" }] },
    { id: "q5", type: "open", points: 5, text: "Explain **why** reflux matters." },
  ],
};
function mockInfo(over) { return Object.assign({ title: EXAM.title, require_seb: true, duration_minutes: 45, opens_at: "2026-01-01T00:00:00Z", closes_at: "2027-01-01T00:00:00Z", status: "open", seb_link: "sebs://seb-exams.carloscomail.workers.dev/s/seb/" + ID + ".seb", seb_file_url: API + "/s/seb/" + ID + ".seb" }, over); }

async function setup(browser, { seb = false, width = 1280, clockTime = null, durationSec = null, failSubmit = 0, submitStatus = 200 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.errors = []; page.calls = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  const cors = { "access-control-allow-origin": `http://localhost:${PORT}`, "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS", "content-type": "application/json" };
  let fails = failSubmit; const T0 = clockTime ? Date.parse("2026-06-01T10:00:00Z") : Date.now(); const started = new Date(T0).toISOString();
  await page.route(API + "/**", async (r) => {
    const req = r.request(), u = new URL(req.url());
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    page.calls.push({ path: u.pathname, body });
    const send = (status, obj) => r.fulfill({ status, headers: cors, body: JSON.stringify(obj) });
    if (u.pathname === "/s/info") return send(u.searchParams.get("id") === ID ? 200 : 404, u.searchParams.get("id") === ID ? mockInfo(page.infoOver) : { error: "not found" });
    if (u.pathname === "/s/start") {
      if (page.startErr) return send(page.startErr, { error: "Mock start error" });
      const ends = new Date(T0 + (durationSec || 2700) * 1000).toISOString();
      return send(200, { exam: EXAM, started_at: started, ends_at: ends, server_now: new Date(clockTime ? T0 : Date.now()).toISOString() });
    }
    if (u.pathname === "/s/submit") {
      if (fails > 0) { fails--; return r.abort("failed"); }
      if (submitStatus !== 200) return send(submitStatus, { error: "You have already submitted this exam." });
      return send(200, { ok: true, receipt: "RC-TEST-1234" });
    }
    send(404, {});
  });
  if (seb) await page.addInitScript(() => { window.SafeExamBrowser = { security: { configKey: "", updateKeys(cb) { this.configKey = "ck-test"; cb(); } } }; });
  if (clockTime) await page.clock.install({ time: Date.parse("2026-06-01T10:00:00Z") });
  return page;
}
const enter = async (page, name = "Ada Lovelace", sid = "s123") => { await page.fill("#name", name); await page.fill("#sid", sid); await page.click("#startbtn"); await page.waitForSelector("#exam:not(.hidden)"); };
const blankLoc = (page, qid, bi) => page.locator(`[data-q="${qid}"] .blank`).nth(bi);
const inputs = (page, qid, bi) => blankLoc(page, qid, bi).locator("input.box");
const val = (page, qid, bi) => page.evaluate(([q, b]) => [...document.querySelectorAll(`[data-q="${q}"] .blank`)][b].value(), [qid, bi]);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: scratch, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  try {
    // ---- outside SEB: gate
    let page = await setup(browser);
    await page.goto(BASE + "?id=" + ID);
    await page.waitForSelector("#startform");
    check(await page.locator("#sebgate").isVisible(), "outside SEB: gate shown");
    check(await page.locator("#startbtn").isDisabled(), "outside SEB: Start disabled");
    check((await page.getAttribute("#seblink", "href")).startsWith("sebs://"), "outside SEB: sebs:// link");
    check((await page.getAttribute("#sebfile", "href")).endsWith(".seb"), "outside SEB: .seb download link");
    check(page.errors.length === 0, "no console errors on landing " + page.errors.join("|"));
    page.infoOver = null; await page.close();

    // not open
    page = await setup(browser, { seb: true }); page.infoOver = { status: "scheduled" };
    await page.goto(BASE + "?id=" + ID); await page.waitForSelector("#startform");
    check(await page.locator("#startbtn").isDisabled(), "scheduled exam: Start disabled"); await page.close();
    // unknown id
    page = await setup(browser); await page.goto(BASE + "?id=zz-nope"); await page.waitForSelector(".msg");
    check(/not found/i.test(await page.textContent("#msg")), "unknown id shows error"); await page.close();

    // ---- inside SEB: start
    page = await setup(browser, { seb: true });
    await page.goto(BASE + "?id=" + ID);
    await page.waitForSelector("#startform");
    check(await page.locator("#sebgate").isHidden(), "in SEB: gate hidden");
    check(await page.locator("#startbtn").isEnabled(), "in SEB: Start enabled");
    await enter(page);
    const startCall = page.calls.find((c) => c.path === "/s/start").body;
    check(startCall.exam_id === ID && startCall.student_id === "S123" && startCall.seb && startCall.seb.ck === "ck-test" && startCall.seb.url === BASE + "?id=" + ID, "start payload (id upper-cased, seb {ck,url})");
    check(await page.locator(".katex").count() >= 3, "KaTeX rendered");
    check(await page.locator('[data-q="q1"] img').getAttribute("alt") === "a tiny test image", "image alt");
    check(await page.locator('[data-q="q1"] img').getAttribute("src") === PNG, "image data URL");
    const order = await page.$$eval(".card.q", (e) => e.map((x) => x.dataset.q));
    check(order.indexOf("q1") < order.indexOf("q3") && order.indexOf("q3") < order.indexOf("q5"), "sections ordered mc, fill, open: " + order);
    check(await page.locator("text=Answer in words; equations and drawings are not needed.").count() === 1, "open note");
    const q2 = await page.$$eval('[data-q="q2"] .opt .lab', (e) => e.map((x) => x.textContent.trim()));
    check(q2.join() === "A,B", "shuffle_options false keeps order");

    // ---- boxes
    const b1 = inputs(page, "q3", 0);   // _a__________ : 11 inputs + clue
    check(await b1.count() === 11, "blank1: 11 input boxes");
    check(await blankLoc(page, "q3", 0).locator("span.clue").count() === 1, "blank1: 1 clue box");
    check((await blankLoc(page, "q3", 0).locator("span.clue").getAttribute("aria-label")).startsWith("Blank 1, letter 2 of 12"), "aria label on clue");
    check((await b1.nth(2).getAttribute("aria-label")) === "Blank 1, letter 4 of 12", "aria label on input");
    check(await b1.first().getAttribute("autocapitalize") === "off" && await b1.first().getAttribute("inputmode") === "text" && await b1.first().getAttribute("spellcheck") === "false", "mobile attributes");
    const focusLabel = () => page.evaluate(() => document.activeElement.getAttribute("aria-label"));
    await b1.first().click();
    await page.keyboard.type("v"); console.log("DBG1", await val(page, "q3", 0), await focusLabel());
    await page.keyboard.type("a");
    check(await val(page, "q3", 0) === "vaa_________", "typing skips clue box: " + await val(page, "q3", 0));
    check(await focusLabel() === "Blank 1, letter 4 of 12", "focus advanced past clue");
    await page.keyboard.press("Backspace");
    check(await val(page, "q3", 0) === "va__________" && await focusLabel() === "Blank 1, letter 3 of 12", "backspace on empty clears previous and moves back: " + await val(page, "q3", 0));
    await page.keyboard.type("x");
    check(await val(page, "q3", 0) === "vax_________", "retype: " + await val(page, "q3", 0));
    await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
    check(await focusLabel() === "Blank 1, letter 1 of 12", "arrow left moves (skips clue)");
    await page.keyboard.press("End");
    check(await focusLabel() === "Blank 1, letter 12 of 12", "End");
    await page.keyboard.press("Home");
    check(await focusLabel() === "Blank 1, letter 1 of 12", "Home");
    await page.keyboard.press("ArrowRight");
    check(await focusLabel() === "Blank 1, letter 3 of 12", "arrow right");
    await page.keyboard.type("!?-_ ");
    check(await val(page, "q3", 0) === "vax_________" && await focusLabel() === "Blank 1, letter 3 of 12", "non-alphanumeric keys ignored");
    const paste = (txt) => page.evaluate((t) => { const dt = new DataTransfer(); dt.setData("text", t); document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, txt);
    await b1.first().click(); await paste("vap-or isation!");
    check(await val(page, "q3", 0) === "vaaporisatio", "paste spreads over input boxes, ignores separators, 11 boxes full: " + await val(page, "q3", 0));
    await b1.nth(4).click(); await paste("QQ");
    check(await val(page, "q3", 0) === "vaaporQQatio", "paste from middle: " + await val(page, "q3", 0));
    await b1.first().click(); await paste("abc");
    check(await val(page, "q3", 0) === "vaabcrQQatio" && await focusLabel() === "Blank 1, letter 5 of 12", "short paste leaves rest, focus after it: " + await val(page, "q3", 0));
    for (let k = 0; k < 11; k++) { await b1.nth(k).click(); await page.keyboard.press("Delete"); }
    await b1.first().click(); await page.keyboard.type("vporizatio");
    await b1.nth(1).click(); await page.keyboard.type("a");
    // blank 2: ___-__ _  (words: 3, hyphen, 2 / 1)
    const b2 = inputs(page, "q3", 1);
    check(await b2.count() === 6, "blank2: 6 inputs");
    await b2.first().click();
    await page.keyboard.type("abcdef");
    check(await val(page, "q3", 1) === "abc-de f", "typing crosses hyphen and word gap: " + await val(page, "q3", 1));
    // blank 3: a_c, fully filled
    await inputs(page, "q3", 2).first().click(); await page.keyboard.type("Z9");
    check(await val(page, "q3", 2) === "aZc", "case kept as typed, one box: " + await val(page, "q3", 2));
    // typing in the middle goes to next EMPTY box
    await b2.nth(1).click(); await page.keyboard.type("Q");
    check(await val(page, "q3", 1) === "aQc-de f", "overwrite mid-word: " + await val(page, "q3", 1));
    // mobile-style: input event with multi chars (e.g. IME/autofill)
    await page.evaluate(() => { const el = document.querySelectorAll('[data-q="q4"] input.box')[0]; el.value = "hello"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    check((await val(page, "q4", 0)).startsWith("hello"), "multi-char input event spreads: " + await val(page, "q4", 0));
    // mobile backspace via beforeinput on empty box
    await page.evaluate(() => { document.querySelectorAll('[data-q="q4"] input.box')[6].focus(); });
    await page.evaluate(() => { const el = document.activeElement; el.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true })); });
    check((await val(page, "q4", 0)).startsWith("hello_") , "beforeinput backspace clears previous: " + await val(page, "q4", 0));

    // ---- mc + open + autosave
    await page.locator('[data-q="q1"] input[value="a"]').check();
    await page.locator('[data-q="q5"] textarea').fill("Because the liquid returns and enriches the vapour.");
    check((await page.textContent('[data-q="q5"] .count')) === "8 words", "word count");
    const key = "sebexam2:" + ID + ":S123";
    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    check(stored && stored.answers.q1 === "a" && Array.isArray(stored.answers.q3) && stored.answers.q3.length === 3, "autosave key sebexam2:<id>:<SID>");
    await page.reload();
    await page.waitForSelector("#exam:not(.hidden)");
    check((await val(page, "q3", 1)) === "aQc-de f", "reload resumes blanks: " + await val(page, "q3", 1));
    check(await page.locator('[data-q="q1"] input[value="a"]').isChecked(), "reload resumes mc");
    check((await page.inputValue('[data-q="q5"] textarea')).startsWith("Because"), "reload resumes open");
    check(page.calls.filter((c) => c.path === "/s/start").length === 2, "reload calls /s/start again");

    // ---- submit with confirm dialog, network failure then retry
    await page.close();
    page = await setup(browser, { seb: true, failSubmit: 1 });
    await page.goto(BASE + "?id=" + ID);
    await enter(page);
    await inputs(page, "q3", 0).first().click(); await page.keyboard.type("vaporization".replace("a", ""));
    await page.click("#submitbtn");
    const ctext = await page.textContent("#confirmtext");
    check(/Not answered: questions? .*\b/.test(ctext) && /partly/.test(ctext) , "confirm lists unanswered/partial: " + ctext);
    await page.click("#yes");
    await page.waitForSelector(".msg.err");
    check(/Cannot reach/.test(await page.textContent("#msg")), "network failure message");
    check(await page.locator("#exam").isVisible() && await page.locator("#submitbtn").isEnabled(), "answers kept, retry allowed");
    await page.locator('[data-q="q1"] input').first().check();
    await page.click("#submitbtn"); await page.click("#yes");
    await page.waitForSelector("#done:not(.hidden)");
    check(await page.textContent("#receipt") === "RC-TEST-1234", "receipt shown");
    check((await page.getAttribute("#quit", "href")) === "https://chetools.github.io/claude/seb_exams/exam/done.html", "quit link");
    const sub = page.calls.filter((c) => c.path === "/s/submit").pop().body;
    check(sub.exam_id === ID && sub.student_id === "S123" && sub.seb.ck === "ck-test", "submit envelope");
    check(typeof sub.answers.q1 === "string" && sub.answers.q1.length === 1, "mc answer = option id");
    check(Array.isArray(sub.answers.q3) && sub.answers.q3.length === 3 && sub.answers.q3[0].length === 12 && sub.answers.q3[0][1] === "a" && sub.answers.q3[1] === "___-__ _" && sub.answers.q3[2] === "a_c", "fill answers: full-length strings, '_' unfilled: " + JSON.stringify(sub.answers.q3));
    check(sub.answers.q4[0].length === 28 && sub.answers.q4[0][15] === " " , "fill q4 length 28 with gaps");
    check(sub.answers.q5 === "", "open answer string");
    await page.reload();
    await page.waitForSelector("#done:not(.hidden)");
    check(await page.textContent("#receipt") === "RC-TEST-1234", "reload after submit shows receipt");
    check(page.errors.length === 0, "no page errors " + page.errors.join("|"));
    await page.close();

    // duplicate submission error
    page = await setup(browser, { seb: true, submitStatus: 409 });
    await page.goto(BASE + "?id=" + ID); await enter(page);
    await page.click("#submitbtn"); await page.click("#yes");
    await page.waitForSelector(".msg.err");
    check(/already submitted/.test(await page.textContent("#msg")), "one-submission error shown"); await page.close();

    // ---- timer auto-submit
    page = await setup(browser, { seb: true, clockTime: true, durationSec: 120 });
    await page.goto(BASE + "?id=" + ID); await enter(page);
    check(/^2:00$|^1:5\d$/.test(await page.textContent("#timer")), "timer shows 2:00: " + await page.textContent("#timer"));
    check(await page.locator("#timer.low").count() === 1, "low-time style");
    await page.clock.fastForward(125000);
    await page.waitForSelector("#done:not(.hidden)", { timeout: 5000 });
    check(page.calls.some((c) => c.path === "/s/submit"), "auto-submit at time up");
    await page.close();

    // ---- screenshots / layout
    for (const w of [390, 2560]) {
      page = await setup(browser, { seb: true, width: w });
      await page.goto(BASE + "?id=" + ID); await page.screenshot({ path: path.join(SHOTS, `landing-${w}.png`) });
      await enter(page);
      await inputs(page, "q3", 0).first().click(); await page.keyboard.type("vporization");
      await inputs(page, "q4", 0).first().click(); await page.keyboard.type("abcdefghijklmnopqrstuvwxy");
      await page.locator('[data-q="q5"] textarea').fill("Some answer.");
      check(await noHScroll(page), `${w}px: no horizontal scroll`);
      const edges = await page.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
        return { h: r("header.top h1"), hw: r("header.top .wrap"), bw: r("main .wrap"), bar: r("#bar .wrap") }; });
      check(edges.hw[0] === edges.bw[0] && edges.hw[1] === edges.bw[1] && edges.bar[0] === edges.bw[0] && edges.bar[1] === edges.bw[1], `${w}px: header, bar and body share edges ` + JSON.stringify(edges));
      await page.screenshot({ path: path.join(SHOTS, `exam-${w}.png`), fullPage: true });
      await page.locator('[data-q="q3"]').screenshot({ path: path.join(SHOTS, `fill-${w}.png`) });
      await page.close();
    }
  } catch (e) { console.log("FAIL exception", e); failures++; }
  await browser.close(); srv.kill();
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(failures ? failures + " FAILURES" : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})();
