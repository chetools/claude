// End-to-end test of the built exam page + Worker + D1, run locally:
//   build.py; deploy.py --local; set the local exam's page_url to http://localhost:8765/<id>/;
//   wrangler dev --local --port 8787 (worker/, TEACHER_PASSWORD=local-test-pw in .dev.vars);
//   python -m http.server 8765 (dist/);  node tests/e2e.cjs [shots-dir]
// SEB is simulated through its JavaScript API: window.SafeExamBrowser.security.configKey =
// SHA256(page URL without fragment + Config Key), exactly what SEB exposes.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const ROOT = path.resolve(__dirname, "..");
const PAGE = "http://localhost:8765/mccabe-thiele/";
const RESULTS = "http://localhost:8765/results/";
const LOCAL_API = "http://localhost:8787";
const REAL_API = "https://seb-exams.carloscomail.workers.dev";
const PW = "local-test-pw";
const SHOTS = process.argv[2] || path.join(ROOT, "tests", "shots");
const key = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/mccabe-thiele/key.json")));
const CK = key.config_keys[0];
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const run = Date.now().toString(36).toUpperCase();

let failures = 0;
function check(cond, what) {
  console.log((cond ? "PASS " : "FAIL ") + what);
  if (!cond) failures++;
}

async function newPage(browser, { seb = null, width = 1280 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 40[139]/.test(m.text())) page.errors.push(m.text()); });
  await page.route(REAL_API + "/**", async (r) => {  // send API calls to the local Worker
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "http://localhost:8765", "access-control-allow-headers": "Content-Type, Authorization",
      "access-control-allow-methods": "GET, POST, OPTIONS" } });
    r.fulfill({ response: await r.fetch({ url: r.request().url().replace(REAL_API, LOCAL_API) }) });
  });
  if (seb) {
    // configKey is computed in the page from its own URL, like SEB does
    await page.addInitScript(({ ck }) => {
      window.__sebKey = ck;
      window.SafeExamBrowser = { version: "test", security: { configKey: "", updateKeys(cb) {
        const url = location.href.split("#")[0];
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(url + window.__sebKey)).then((h) => {
          this.configKey = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
          cb();
        });
      } } };
    }, { ck: seb });
  }
  return page;
}

const correct = { "mc-rectifying": "a", "mc-qline": "a", "mc-stages": "a" };

async function answerAll(page, good) {
  for (const [q, opt] of Object.entries(correct)) {
    await page.locator(`[data-q="${q}"] input[value="${good ? opt : "b"}"]`).check();
  }
  await page.locator('[data-q="fill-cmo"] input.blank').fill(good ? "Vaporisation" : "fusion");
  await page.locator('[data-q="fill-total-reflux"] input.blank').fill(good ? " Diagonal " : "axis");
  await page.locator('[data-q="open-rmin"] textarea').fill("Pinch at the q-line; R_min = 0.15/0.25 = 0.6, \"quoted\", with a comma.");
  await page.locator('[data-q="open-stripping"] textarea').fill("L x = V y + B xB\nso y = (L/V) x - (B/V) xB");
}

async function start(page, name, sid) {
  await page.goto(PAGE);
  await page.fill("#name", name);
  await page.fill("#sid", sid);
  await page.click("#startbtn");
}

async function submit(page) {
  await page.click("#submitbtn");
  await page.click("#yes");
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // 1. outside SEB: the start button is locked and the API refuses
  let p = await newPage(browser);
  await p.goto(PAGE);
  check(await p.isVisible("#sebgate"), "outside SEB the page asks for Safe Exam Browser");
  check(await p.isDisabled("#startbtn"), "outside SEB the start button is disabled");
  check((await p.getAttribute("#seblink", "href")).startsWith("sebs://"), "sebs:// link present");
  const r403 = await p.evaluate(async (api) => (await fetch(api + "/submit", { method: "POST", body: JSON.stringify({ exam_id: "mccabe-thiele", name: "a", student_id: "b" }) })).status, REAL_API);
  check(r403 === 403, "direct submission without SEB is rejected (403)");
  const html = await p.content();
  check(!/vaporization|diagonal|model_answer|"correct"/i.test(html), "no answers in the page source");
  await p.context().close();

  // 2. SEB with the wrong configuration: refused at start
  p = await newPage(browser, { seb: sha("other config") });
  await start(p, "Wrong Config", "W-" + run);
  await p.waitForSelector("#msg .msg.err");
  check(/different configuration/.test(await p.textContent("#msg")), "wrong SEB Config Key is refused at start");
  await p.context().close();

  // 3. a full exam in SEB: answer, reload (autosave), submit, receipt
  const sidGood = "S-" + run;
  p = await newPage(browser, { seb: CK });
  await start(p, "Ada Student", sidGood);
  await p.waitForSelector("#exam:not(.hidden)");
  const timer0 = await p.textContent("#timer");
  check(/^4[45]:\d\d$/.test(timer0), "timer starts at 45 min (" + timer0 + ")");
  await answerAll(p, true);
  check(/7 of 7 answered/.test(await p.textContent("#answered")), "answered counter");
  await p.waitForTimeout(600);
  await p.reload();
  await p.waitForSelector("#exam:not(.hidden)");
  check(await p.locator('[data-q="fill-cmo"] input.blank').inputValue() === "Vaporisation", "answers survive a reload");
  check(await p.locator('[data-q="mc-qline"] input[value="a"]').isChecked(), "MC choice survives a reload");
  check(/Hint: the second letter of the missing word is “a”/.test(await p.textContent('[data-q="fill-cmo"]')), "second-letter hint shown");
  await p.screenshot({ path: path.join(SHOTS, "exam-1280.png"), fullPage: true });
  await submit(p);
  await p.waitForSelector("#done:not(.hidden)");
  const receipt = await p.textContent("#receipt");
  check(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(receipt), "receipt shown (" + receipt + ")");
  check(await p.getAttribute("#quit", "href") === "https://chetools.github.io/claude/seb_exams/mccabe-thiele/done.html", "quit link is the SEB quitURL");
  await p.reload();
  check(await p.isVisible("#done"), "after reload the page still shows the receipt");
  check(p.errors.length === 0, "no page errors: " + p.errors.join(" | "));
  await p.context().close();

  // 4. same student ID again (new computer): refused
  p = await newPage(browser, { seb: CK });
  await start(p, "Ada Again", sidGood.toLowerCase());
  await p.waitForSelector("#exam:not(.hidden)");
  await answerAll(p, false);
  await submit(p);
  await p.waitForSelector("#msg .msg.err");
  check(/already submitted/.test(await p.textContent("#msg")), "second submission with the same ID is refused");
  await p.context().close();

  // 5. wrong answers, then the timer runs out: automatic submission
  const sidBad = "T-" + run;
  p = await newPage(browser, { seb: CK });
  await p.clock.install();
  await start(p, "Bo Timeout", sidBad);
  await p.waitForSelector("#exam:not(.hidden)");
  await answerAll(p, false);
  await p.clock.fastForward("45:05");
  await p.waitForSelector("#done:not(.hidden)", { timeout: 15000 });
  check(true, "exam submits itself when the time is up");
  await p.context().close();

  // 6. results page
  p = await newPage(browser);
  await p.goto(RESULTS);
  await p.fill("#pw", "wrong");
  await p.click("#login button");
  await p.waitForSelector("#msg .msg.err");
  check(/Wrong password/.test(await p.textContent("#msg")), "results page rejects a wrong password");
  await p.fill("#pw", PW);
  await p.click("#login button");
  await p.waitForSelector("#tablewrap:not(.hidden)");
  const rowGood = p.locator("#table tbody tr", { hasText: sidGood });
  const rowBad = p.locator("#table tbody tr", { hasText: sidBad });
  check(/10 \/ 10 \(\+10 manual\)/.test(await rowGood.textContent()), "full marks for the correct answers");
  check(/0 \/ 10/.test(await rowBad.textContent()), "zero for the wrong answers");
  check((await rowGood.textContent()).includes(receipt), "receipt matches the database");
  check((await rowGood.textContent()).includes("js-api"), "SEB check recorded");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#csv")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  check(csv.includes(sidGood) && csv.includes('"Pinch at the q-line; R_min = 0.15/0.25 = 0.6, ""quoted"", with a comma."'), "CSV export quotes open answers");
  check(csv.split("\r\n").length >= 3, "CSV has a header and rows");
  check(p.errors.length === 0, "no results-page errors: " + p.errors.join(" | "));
  await p.screenshot({ path: path.join(SHOTS, "results-1280.png"), fullPage: true });
  await p.context().close();

  // 7. layout at phone and wide-monitor widths
  for (const width of [390, 2560]) {
    for (const [url, name] of [[PAGE, "exam"], [RESULTS, "results"]]) {
      p = await newPage(browser, { seb: CK, width });
      await p.goto(url);
      if (name === "exam") {
        await p.fill("#name", "Layout Check");
        await p.fill("#sid", "L-" + run + "-" + width);
        await p.click("#startbtn");
        await p.waitForSelector("#exam:not(.hidden)");
      } else {
        await p.fill("#pw", PW);
        await p.click("#login button");
        await p.waitForSelector("#tablewrap:not(.hidden)");
      }
      const m = await p.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
                 h: r("header .wrap"), b: r("main .wrap") };
      });
      check(m.sw <= m.cw, `${name} @${width}: no horizontal scroll (${m.sw} <= ${m.cw})`);
      check(Math.abs(m.h.left - m.b.left) < 1 && Math.abs(m.h.right - m.b.right) < 1, `${name} @${width}: header and body share edges`);
      check(p.errors.length === 0, `${name} @${width}: no errors ` + p.errors.join(" | "));
      await p.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: width === 390 });
      await p.context().close();
    }
  }
  await browser.close();
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})();
