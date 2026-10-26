// Renders the model-ranking test card (web/probe.png) and its answer key (web/probe.json). Run by build.py.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");

const HTML = `<h2>Team Update 🚀</h2>
<p>Hi all, the <b>release is on Friday</b>. Please <i>double-check</i> the <s>old</s> new checklist ✅.</p>
<ul><li>Tests: <b>142 passed</b>, 3 skipped</li><li>Budget: $12,480.50 (↑ 4.2%)</li></ul>
<table border="1" cellpadding="5" style="border-collapse:collapse"><tr><th>Name</th><th>Role</th><th>Status</th></tr>
<tr><td>Ana</td><td>QA</td><td>✅ Done</td></tr><tr><td>Raj</td><td>Dev</td><td>⏳ In progress</td></tr></table>
<p style="font-size:13px">Invoice #A-20931 is due 2026-11-15; contact ops@example.com or call +1 (555) 013-2244 before 5 pm.</p>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 760, height: 300 } });
await page.setContent(`<html><body style="font-family:Arial;padding:20px;font-size:16px;background:#fff">${HTML}</body></html>`);
await page.screenshot({ path: path.join(WEB, "probe.png"), fullPage: true });
const expected = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim();
await browser.close();
const spec = {
  expected,
  bold: ["release is on Friday", "142 passed"],
  italic: ["double-check"],
  strike: ["old"],
  emoji: ["🚀", "✅", "⏳"],
  table: true,
};
fs.writeFileSync(path.join(WEB, "probe.json"), JSON.stringify(spec, null, 1) + "\n");
console.log("rendered probe.png, probe.json");
