// Runs lbm_gpu_test.html in headless Chromium (swiftshader).  usage: node lbm_gpu_run.mjs [port] [query]
// needs: python -m http.server <port> running in the project directory (cylinder-cavity-3d)
import { createRequire } from "module";
import { execSync } from "child_process";
const require = createRequire(execSync("npm root -g").toString().trim() + "/");
const { chromium } = require("playwright");
const port = process.argv[2] || "8765", query = process.argv[3] || "";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true,
  args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan", "--no-sandbox"] });
const pg = await b.newPage();
const logs = [];
pg.on("console", m => logs.push(m.type() + ": " + m.text()));
pg.on("pageerror", e => logs.push("pageerror: " + e.message));
await pg.goto(`http://localhost:${port}/web/tests/lbm_gpu_test.html${query}`);
await pg.waitForFunction(() => window.RESULT, null, { timeout: 280000 });
const R = await pg.evaluate(() => window.RESULT);
console.log(JSON.stringify(R, (k, v) => (k === "rowsGpu" || k === "rowsCpu") ? undefined : v, 1));
for (const [name, rows] of [["GPU f32", R.rowsGpu], ["CPU f64", R.rowsCpu]]) {
  console.log("--- selftest rows,", name);
  for (const r of rows || []) console.log((r.pass ? "ok   " : "FAIL ") + r.name.padEnd(82) + r.reldiff.toExponential(2));
}
console.log("console:", logs.filter(l => !/^log: /.test(l)).join("\n") || "(clean)");
await b.close();
process.exit(R.errors.length ? 1 : 0);
