// End-to-end test of the built page with Playwright + preinstalled Chromium.
// Needs `python3 -m http.server 8765` running in image-to-text/ and network access to openrouter.ai.
// OpenRouter calls are forwarded from Node (TLS verified, through the environment's proxy):
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/e2e.mjs
// The page must be built with the local Worker: `python3 build.py http://localhost:8787`, Worker running (see worker.test.mjs).
// Set OPENROUTER_API_KEY to use a real key; otherwise a dummy key is sent (the container proxy injects one).
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { execSync } = require("child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
fs.mkdirSync(OUT, { recursive: true });
const URL_ = "http://localhost:8765/dist/image-to-text-standalone.html";
const KEY = process.env.OPENROUTER_API_KEY || "sk-or-test-dummy";
const failures = [];
let cdnBytes = 0;
let firstProbes = 0;
const RANKING = process.env.RANKING_URL || "http://localhost:8787";
const check = (cond, msg) => { console.log((cond ? "ok   " : "FAIL ") + msg); if (!cond) failures.push(msg); };

// Fixture document: rendered to PNG on every run, so it can never go stale.
const FIXTURE_HTML = `<html><body style="font-family:Arial;width:760px;padding:24px;font-size:17px">
<h1>Quarterly Garden Report</h1>
<p>The tomatoes did <b>very well</b> this season, but the <i>basil</i> needs more sun.</p>
<ul><li>Water every morning<ul><li>Use the blue can</li></ul></li><li>Weed on Fridays</li></ul>
<ol><li>Buy compost</li><li>Plant garlic</li></ol>
<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Plant</th><th>Yield (kg)</th></tr>
<tr><td>Tomato</td><td>14</td></tr><tr><td>Basil</td><td>2</td></tr></table>
<pre style="background:#eee;padding:8px">water(plants, litres=3)</pre></body></html>`;
const EXPECTED_PLAIN = `Quarterly Garden Report

The tomatoes did very well this season, but the basil needs more sun.

• Water every morning
  ◦ Use the blue can
• Weed on Fridays

1. Buy compost
2. Plant garlic

Plant | Yield (kg)
Tomato | 14
Basil | 2

water(plants, litres=3)`;

function cer(a, b) { // character error rate via Levenshtein on whitespace-normalised text
  a = a.replace(/\s+/g, " ").trim(); b = b.replace(/\s+/g, " ").trim();
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] / Math.max(1, b.length);
}

const browser = await chromium.launch();
const fixturePng = path.join(OUT, "fixture.png");
{
  const p = await browser.newPage({ viewport: { width: 820, height: 600 } });
  await p.setContent(FIXTURE_HTML);
  await p.screenshot({ path: fixturePng, fullPage: true });
  await p.close();
}

async function newPage(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:8765" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  // The browser logs every non-2xx fetch; refused (403) and rate-limited (429) models are expected and handled.
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: .*status of (403|429)/.test(m.text())) errors.push("console: " + m.text()); });
  const calls = [];
  const probePng = "data:image/png;base64," + fs.readFileSync(path.join(HERE, "../web/probe.png")).toString("base64");
  let reads = 0;
  // Page and worker traffic to OpenRouter and jsDelivr is forwarded from Node (the browser here has no direct network).
  await ctx.route(/^https:\/\/(openrouter\.ai|cdn\.jsdelivr\.net)\//, async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = req.postData();
    if (body) {
      const j = JSON.parse(body);
      const probe = j.messages[0].content[1].image_url.url === probePng;
      calls.push((probe ? "probe:" : "read:") + (j.models || [j.model]).join(","));
      if (!probe && opts.fail429 && reads++ === 0) return route.fulfill({ status: 429, headers: cors, contentType: "application/json", body: JSON.stringify({ error: { code: 429, message: "rate limited (simulated)" } }) });
    }
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (req.headers()["authorization"]) headers.authorization = req.headers()["authorization"];
    const r = await fetch(req.url(), { method: req.method(), headers, body: body || undefined });
    const buf = Buffer.from(await r.arrayBuffer());
    if (/jsdelivr/.test(req.url())) cdnBytes += buf.length;
    return route.fulfill({ status: r.status, headers: { ...cors, "content-type": r.headers.get("content-type") || "application/octet-stream" }, body: buf });
  });
  await page.goto(URL_ + (opts.query || ""));
  return { ctx, page, errors, calls };
}

// 1. self-test
{
  const { ctx, page, errors } = await newPage(1280, { query: "?selftest" });
  await page.waitForFunction(() => window.SELFTEST, null, { timeout: 30000 });
  const st = await page.evaluate(() => window.SELFTEST);
  check(st.pass, "?selftest passes (" + st.models.length + " free vision models; top: " + st.models[0] + ")");
  check(errors.length === 0, "selftest page: no errors " + errors.join(" | "));
  await ctx.close();
}

// 2. real OCR of the fixture, then copy buttons
async function ocrRun(label, opts) {
  const { ctx, page, errors, calls } = await newPage(1280, opts);
  await page.fill("#key", KEY);
  await page.setInputFiles("#file", fixturePng);
  await page.waitForSelector("#run:not([disabled])");
  await page.click("#run");
  await page.waitForFunction(() => /status (ok|err)/.test(document.getElementById("status").className), null, { timeout: 600000 });
  const st = await page.textContent("#status");
  const used = await page.textContent("#modelUsed");
  const res = await page.evaluate(() => ({
    md: document.getElementById("md").value,
    discord: document.getElementById("out-discord").textContent,
    plain: document.getElementById("out-imessage").textContent,
    html: document.getElementById("out-gmail").innerHTML,
  }));
  const scores = await page.evaluate(() => localStorage.getItem("itt.scores"));
  console.log(`\n[${label}] ${st} | ${used} | calls: ${JSON.stringify(calls)}\n  scores: ${scores}`);
  return { ctx, page, errors, calls, st, used, res };
}

{
  const r = await ocrRun("ocr");
  check(/Done/.test(r.st), "OCR succeeded: " + r.st);
  fs.writeFileSync(path.join(OUT, "ocr.md"), r.res.md);
  fs.writeFileSync(path.join(OUT, "ocr.discord.txt"), r.res.discord);
  fs.writeFileSync(path.join(OUT, "ocr.plain.txt"), r.res.plain);
  const e = cer(r.res.plain, EXPECTED_PLAIN);
  console.log("character error rate (plain vs expected): " + (100 * e).toFixed(1) + "%");
  check(e < 0.1, "plain text CER < 10%");
  check(r.calls.some((c) => c.startsWith("probe:")), "free models were tested on the sample card first");
  firstProbes = r.calls.filter((c) => c.startsWith("probe:")).length;
  await new Promise((res) => setTimeout(res, 1500)); // reports are fire-and-forget
  const rank = await (await fetch(RANKING + "/ranking")).json();
  const reported = rank.models.filter((m) => r.calls.includes("probe:" + m.model));
  console.log("shared ranking: " + JSON.stringify(reported.map((m) => [m.model, m.median, m.tests, m.refused])));
  check(reported.some((m) => m.tests > 0), "test-card answers reached the shared ranking");
  console.log("jsDelivr download for Tesseract (first use): " + (cdnBytes / 1e6).toFixed(1) + " MB");
  check(/<h1/.test(r.res.html) && /<strong>very well<\/strong>/.test(r.res.html) && /<em>basil<\/em>/.test(r.res.html), "Gmail HTML has heading, bold, italic");
  check(/<table/.test(r.res.html) && /<ol/.test(r.res.html) && /<ul/.test(r.res.html) && /<code/.test(r.res.html), "Gmail HTML has table, lists, code (block or inline: the one-line block is read either way)");
  check(/\*\*very well\*\*/.test(r.res.discord) && /```/.test(r.res.discord), "Discord text keeps bold and code blocks");

  if (!/Done/.test(r.st)) { await browser.close(); console.log("\nOCR failed; skipping the remaining checks"); process.exit(1); }
  await r.page.click('.tab[data-tab="gmail"]');
  await r.page.click('.copy[data-out="gmail"]');
  await r.page.waitForFunction(() => /Copied/.test(document.querySelector('.copy[data-out="gmail"]').textContent));
  const clip = await r.page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const it = items[0];
    return { types: it.types, html: await (await it.getType("text/html")).text(), plain: await (await it.getType("text/plain")).text() };
  });
  check(clip.types.includes("text/html") && /<strong>/.test(clip.html) && /style="/.test(clip.html), "Gmail copy puts styled HTML on the clipboard");
  check(clip.plain.includes("Quarterly"), "Gmail copy also has a plain-text flavour");
  await r.page.click('.tab[data-tab="discord"]');
  await r.page.click('.copy[data-out="discord"]');
  await r.page.waitForFunction(() => /Copied/.test(document.querySelector('.copy[data-out="discord"]').textContent));
  check((await r.page.evaluate(() => navigator.clipboard.readText())) === r.res.discord, "Discord copy matches shown text");
  await r.page.click('.tab[data-tab="imessage"]');
  await r.page.click('.copy[data-out="imessage"]');
  await r.page.waitForFunction(() => /Copied/.test(document.querySelector('.copy[data-out="imessage"]').textContent));
  check((await r.page.evaluate(() => navigator.clipboard.readText())) === r.res.plain, "iMessage copy matches shown text");
  await r.page.screenshot({ path: path.join(OUT, "ocr-1280.png"), fullPage: true });
  check(r.errors.length === 0, "OCR page: no errors " + r.errors.join(" | "));
  await r.ctx.close();
}

// 3. failover: first request answered with 429
{
  const r = await ocrRun("failover", { fail429: true });
  check(r.calls.filter((c) => c.startsWith("read:")).length >= 2 && /Done/.test(r.st), "after a 429 the next model batch is tried and succeeds");
  const probes = r.calls.filter((c) => c.startsWith("probe:")).length;
  check(probes < firstProbes, `a new visitor skips models already in the shared ranking (${probes} vs ${firstProbes} tests)`);
  await r.ctx.close();
}

// 4. layout at phone and wide-monitor widths
for (const w of [390, 2560]) {
  const { ctx, page, errors } = await newPage(w);
  await page.setInputFiles("#file", fixturePng);
  await page.fill("#md", fs.readFileSync(path.join(OUT, "ocr.md"), "utf8"));
  await page.dispatchEvent("#md", "input");
  for (const tab of ["discord", "imessage", "gmail"]) await page.click(`.tab[data-tab="${tab}"]`);
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      h: [r("header").left, r("header").right], b: [r(".card").left, r(".card").right] };
  });
  if (w === 390) check(m.sw <= m.cw, `390 px: no horizontal scroll (${m.sw} <= ${m.cw})`);
  else check(Math.abs(m.h[0] - m.b[0]) < 1 && Math.abs(m.h[1] - m.b[1]) < 1, `2560 px: header and body share edges (${m.h} vs ${m.b})`);
  await page.screenshot({ path: path.join(OUT, `layout-${w}.png`), fullPage: true });
  check(errors.length === 0, `${w} px: no errors ` + errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : "\nall e2e checks passed");
process.exit(failures.length ? 1 : 0);
