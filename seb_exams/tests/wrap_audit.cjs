// Layout audit of the teacher app on desktop widths: counts short items (buttons, labels, table cells, badges,
// tabs, toolbar controls) that wrap onto two or more lines, and the longest paragraph line in characters.
// Runs the real Worker locally (wrangler dev --local, DEV=1) with a practice exam for realistic content.
//   node tests/wrap_audit.cjs [shots-dir] [--strict]
// --strict: exit 1 if any short item wraps at 1280 px or wider, or a paragraph line exceeds 80 characters.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execSync, execFileSync } = require("child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const ROOT = path.resolve(__dirname, "..");
const W = path.join(ROOT, "worker");
const WR = path.join(ROOT, ".buildtools/node_modules/.bin/wrangler");
const APP = "http://localhost:8787";
const SHOTS = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(os.tmpdir(), "seb_wrap_shots");
const STRICT = process.argv.includes("--strict");
const WIDTHS = [1280, 1440, 1920];
const env = { ...process.env, NODE_EXTRA_CA_CERTS: "/root/.ccr/ca-bundle.crt" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => JSON.parse(execFileSync(WR, ["d1", "execute", "seb-exams", "--local", "--json", "--command", q],
  { cwd: W, env, stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;

// In the page: short items on more than one line, and the widest paragraph in characters.
function measure() {
  const SHORT = "button, label, th, td, .badge, .tabs a, .sv-ctl, .gr-check, dt, dd, .linkrow .k, summary, .gr-progress, .gr-sumitem, .crumb, .bartitle";
  const SKIP = ".md, .gr-answer, .sv-md, textarea, .open, .gr-qtext, .model, .sv-answer, .sv-open";
  // visible text boxes of an element (KaTeX's hidden MathML copy excluded)
  const boxes = (el) => {
    const out = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest(".katex-mathml")) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.width > 0 && b.height > 0) out.push(b);
    }
    return out;
  };
  // rows of text: boxes that overlap vertically are on the same row (flex items at different baselines included)
  const lines = (el) => {
    let n = 0, bottom = -Infinity;
    for (const b of boxes(el).sort((x, y) => x.top - y.top)) {
      if (b.top >= bottom - 1) { n++; bottom = b.bottom; } else bottom = Math.max(bottom, b.bottom);
    }
    return n;
  };
  const wrapped = [];
  for (const el of document.querySelectorAll(SHORT)) {
    if (el.closest(SKIP) || el.offsetParent === null) continue;
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (!t || t.length > 60 || el.querySelector("input[type=text], textarea, select, table")) continue;
    if (lines(el) > 1) wrapped.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}: "${t.slice(0, 40)}"`);
  }
  // near misses: text on two lines that would fit on one with up to 30 % more width (prose excluded)
  const near = [];
  const textWidth = (el) => boxes(el).reduce((w, b) => w + b.width, 0);
  for (const el of document.querySelectorAll("p, .hint, li, h2, h3, label, .msg, dd, td, th, summary, button, .linkrow .v, .sv-qexc")) {
    if (el.closest(SKIP) || el.offsetParent === null || el.querySelector("p, li, table, textarea, input[type=text]")) continue;
    if (lines(el) !== 2) continue;
    const cs = getComputedStyle(el), inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (inner > 0 && textWidth(el) <= 1.3 * inner) near.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}: "${el.textContent.replace(/\s+/g, " ").trim().slice(0, 50)}"`);
  }
  let maxChars = 0, where = "";
  for (const el of document.querySelectorAll(".md p, .gr-answer, .sv-md p, .model p")) {
    if (el.offsetParent === null || el.textContent.trim().length < 120) continue;
    const probe = document.createElement("span"); probe.textContent = "abcdefghijklmnopqrstuvwxyz"; probe.style.cssText = "visibility:hidden;position:absolute;white-space:nowrap";
    el.append(probe); const avg = probe.getBoundingClientRect().width / 26; probe.remove();
    const cs = getComputedStyle(el), inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const c = Math.round(inner / avg);
    if (c > maxChars) { maxChars = c; where = el.textContent.trim().slice(0, 30); }
  }
  return { wrapped, near, maxChars, where };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  execFileSync("node", [path.join(ROOT, "tools/bundle_public.mjs")], { stdio: "ignore" });
  fs.writeFileSync(path.join(W, ".dev.vars"), `ADMIN_EMAIL=admin@example.com\nMAIL_SECRET=x\nDEV=1\nAPP_ORIGIN=${APP}\n`);
  fs.rmSync(path.join(W, ".wrangler/state/v3/d1"), { recursive: true, force: true });
  execFileSync(WR, ["d1", "execute", "seb-exams", "--local", "--file", "schema.sql"], { cwd: W, env, stdio: "ignore" });
  const dev = spawn(WR, ["dev", "--local", "--port", "8787"], { cwd: W, env, detached: true, stdio: "ignore" });
  const stop = () => { try { process.kill(-dev.pid, "SIGTERM"); } catch (e) { /* gone */ } };
  process.on("exit", stop);
  for (let i = 0; i < 90; i++) { try { await fetch(APP + "/s/info?id=x"); break; } catch (e) { await sleep(1000); } }
  const browser = await chromium.launch();
  let bad = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(APP + "/#/login");
    await page.fill("#login-email", "admin@example.com");
    await page.click("text=Email me a sign-in link");
    await page.waitForSelector("text=a sign-in link is on its way");
    const body = sql("SELECT body FROM outbox ORDER BY id DESC LIMIT 1")[0].body;
    await page.goto(body.match(/https?:\/\/\S+?\/auth\/verify\?token=[A-Za-z0-9_-]+/)[0]);
    await page.click("button");
    await page.waitForSelector("#bar:not(.hidden)");
    await page.locator('#bar button:has-text("Practice")').click();
    await page.waitForURL(/#\/exam\/[^/]+\/questions/);
    const id = page.url().match(/#\/exam\/([^/]+)\//)[1];
    const pages = [["dashboard", "#/"], ["questions", `#/exam/${id}/questions`], ["edit", `#/exam/${id}/edit`],
      ["grade", `#/exam/${id}/grade`], ["submissions", `#/exam/${id}/submissions`], ["viewer", `#/exam/${id}/submissions`, ".sv-viewall"],
      ["settings", `#/exam/${id}/settings`], ["results", `#/exam/${id}/results`], ["admin", "#/admin"], ["ai", "#/ai"]];
    const total = {}, nearTotal = {};
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 1000 });
      for (const [name, hash, click] of pages) {
        await page.goto(APP + "/" + hash); await page.reload();
        await page.waitForSelector("#app > *:not(.hint)", { timeout: 15000 }); await sleep(700);
        if (click) { await page.click(click); await sleep(500); }
        const m = await page.evaluate(measure);
        total[w] = (total[w] || 0) + m.wrapped.length;
        nearTotal[w] = (nearTotal[w] || 0) + m.near.length;
        console.log(`${w} ${name.padEnd(11)} wrapped ${String(m.wrapped.length).padStart(2)}  near-miss ${String(m.near.length).padStart(2)}  longest paragraph ${m.maxChars || "-"} ch` +
          [...m.wrapped.slice(0, 5), ...m.near.slice(0, 5).map((x) => "near " + x)].map((x) => "\n      " + x).join(""));
        if (m.wrapped.length || m.near.length || m.maxChars > 80) bad++;
        await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`) });
      }
    }
    console.log("TOTAL wrapped short items: " + WIDTHS.map((w) => `${w}px ${total[w]}`).join(", "));
    console.log("TOTAL near-miss lines:     " + WIDTHS.map((w) => `${w}px ${nearTotal[w]}`).join(", "));
  } finally { await browser.close(); stop(); }
  process.exit(STRICT && bad ? 1 : 0);
})();
