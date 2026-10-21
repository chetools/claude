// Headless Chromium + swiftshader runner for fv_gpu_test.html.
//   (cd <project dir> && python3 -m http.server 8765 &)   then   node web/tests/fv_gpu_run.mjs [port]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { chromium } = require(execSync("npm root -g").toString().trim() + "/playwright");
const port = process.argv[2] || "8765";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--no-sandbox"] });
const page = await b.newPage();
const errs = [];
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", e => errs.push(String(e)));
await page.goto(`http://localhost:${port}/web/tests/fv_gpu_test.html`);
await page.waitForFunction(() => window.RESULT && (window.RESULT.done || window.RESULT.error), null, { timeout: 540000 });
const R = await page.evaluate(() => window.RESULT);
await b.close();
console.log(JSON.stringify(R, null, 1));
if (errs.length) console.log("console errors:", errs);
process.exit(R.error || errs.length ? 1 : 0);
