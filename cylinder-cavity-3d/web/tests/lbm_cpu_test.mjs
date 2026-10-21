// Node parity test: lbm_cpu.js (float64) vs the numpy reference values.
// usage: node lbm_cpu_test.mjs [ref.json]   (default: runs python/selftest_lbm.py to get the reference)
import { createRequire } from "module";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const lbm = require(path.join(here, "..", "lbm_cpu.js"));
let ref;
if (process.argv[2]) ref = JSON.parse(readFileSync(process.argv[2], "utf8"));
else {
  const py = path.join(here, "..", "..", "python", "selftest_lbm.py");
  const out = path.join(process.env.TMPDIR || "/tmp", "lbm_ref_" + process.pid + ".json");
  execFileSync("python", [py, out], { stdio: "ignore" });
  ref = JSON.parse(readFileSync(out, "utf8"));
}
// makeParams keys / numbers against python
const p = lbm.makeParams(ref.cases[0].inp);
console.log("makeParams: N=%d Nz=%d dt=%s tau=%s nu_lb=%s", p.N, p.Nz, p.dt, p.tau, p.nu_lb);
let pbad = 0, pmax = 0;
for (const pc of ref.param_checks || []) {
  const q = lbm.makeParams(pc.inp);
  for (const [k, v] of Object.entries(pc.params)) {
    const r = Math.abs(q[k] - v) / Math.max(Math.abs(v), 1e-300);
    pmax = Math.max(pmax, r);
    if (!(r <= 1e-14) && !(q[k] === v)) { pbad++; console.log("PARAM MISMATCH", JSON.stringify(pc.inp), k, q[k], v); }
  }
}
console.log("makeParams vs python:", (ref.param_checks || []).length, "input sets, max rel diff", pmax.toExponential(2), pbad ? "FAILED" : "ok");
const rows = await lbm.selftest(async (pp) => new lbm.CpuSolver(pp), ref);
let bad = 0, worst = 0;
for (const r of rows) {
  console.log((r.pass ? "ok   " : "FAIL ") + r.name.padEnd(80) + " rel " + r.reldiff.toExponential(2));
  if (!r.pass) bad++;
  worst = Math.max(worst, r.reldiff);
}
console.log("max relative difference over", rows.length, "rows:", worst.toExponential(2), bad ? "FAILED" : "PASSED");
process.exit(bad || pbad ? 1 : 0);
