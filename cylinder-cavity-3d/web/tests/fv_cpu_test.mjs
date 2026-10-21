// Node test of web/fv_cpu.js against the numpy reference (python/selftest_fv.py).
//   python3 python/selftest_fv.py web/tests/fv_reference.json     (writes the reference)
//   node web/tests/fv_cpu_test.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const fv = require(path.join(here, "..", "fv_cpu.js"));
const ref = JSON.parse(readFileSync(path.join(here, "fv_reference.json"), "utf8"));

const TOL = 1e-12;
let fails = 0;
const check = (name, val, tol) => {
  const ok = val <= tol;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${val.toExponential(2)} (tol ${tol.toExponential(0)})`);
};

// ---- makeParams: same keys and numbers as fv3d.make_params
for (const cs of ref.cases) {
  const p = fv.makeParams(cs.inp);
  const keys = Object.keys(cs.params).sort().join(), got = Object.keys(p).sort().join();
  if (keys !== got) { fails++; console.log("FAIL param keys differ:", keys, "vs", got); }
  let worst = 0;
  for (const k of Object.keys(cs.params)) {
    const a = cs.params[k], b = p[k];
    if (typeof a === "number") worst = Math.max(worst, a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), 1e-300));
    else if (a !== b) { fails++; console.log("FAIL param", k, a, b); }
  }
  check(`makeParams [${cs.name}] worst relative difference`, worst, 1e-15);
}

// ---- cases against numpy
for (const cs of ref.cases) {
  const p = fv.makeParams(cs.inp);
  const s = new fv.CpuSolver(p);
  const t0 = performance.now();
  s.step(cs.steps);
  const ms = performance.now() - t0;
  const vel = s.velocity(), nc = p.Nz * p.N * p.N, o = cs.outputs;
  console.log(`-- ${cs.name}: ${cs.steps} steps in ${ms.toFixed(0)} ms`);
  check("torque", Math.abs(s.torque() - o.torque) / Math.abs(o.torque), TOL);
  check("E", Math.abs(s.energy() - o.E) / Math.abs(o.E), TOL);
  let sq = 0; for (const x of vel) sq += x * x;
  check("checksum", Math.abs(sq - o.checksum) / o.checksum, TOL);
  let worst = 0, worstScaled = 0, vmax = Math.max(...o.samples.map(r => Math.abs(r[4])));
  for (const [c, k, j, i, val] of o.samples) {
    const g = vel[c * nc + (k * p.N + j) * p.N + i];
    worst = Math.max(worst, Math.abs(g - val) / Math.max(Math.abs(val), 1e-3 * vmax));
    worstScaled = Math.max(worstScaled, Math.abs(g - val) / vmax);
  }
  check(`${o.samples.length} velocity samples, per-value relative (floor 1e-3 max|sample|)`, worst, TOL);
  check(`${o.samples.length} velocity samples, relative to max|sample|`, worstScaled, TOL);
}

// ---- the library self-test (what the page's Validation tab runs)
const rows = await fv.selftest(p => new fv.CpuSolver(p), ref);
const bad = rows.filter(r => !r.pass);
console.log(`selftest(): ${rows.length} rows, ${bad.length} failing, worst reldiff ${Math.max(...rows.map(r => r.reldiff)).toExponential(2)}`);
if (bad.length) { fails += bad.length; console.log(bad); }

// ---- spanwise-uniformity requirement (SPEC): seed = 0, uniform start, default settings, 50 steps.
// Planes must be identical (default 2 V-cycles).  Equality with the Nz = 1 run holds only when both
// Poisson solves are converged (the 3D V-cycle is z-coarsened, the 2D one is not): use 16 cycles there.
for (const Nz of [4, 8]) {
  for (const [vc, tolOne] of [[2, null], [16, 1e-12]]) {
    const inp = { N: 16, Nz, span: "periodic", Re: 100, Us: 1, Uo: 0.5, ro: 0.2, seed: 0, vcycles: vc };
    const p = fv.makeParams(inp), s = new fv.CpuSolver(p), p1 = fv.makeParams({ ...inp, Nz: 1 }), s1 = new fv.CpuSolver(p1);
    s.step(50); s1.step(50);
    const U = s.velocity(), U1 = s1.velocity(), nc = Nz * 256;
    let dz = 0, scale = 0, d1 = 0;
    for (let c = 0; c < 3; c++) for (let k = 0; k < Nz; k++) for (let n = 0; n < 256; n++) {
      const a = U[c * nc + k * 256 + n];
      dz = Math.max(dz, Math.abs(a - U[c * nc + n]));
      d1 = Math.max(d1, Math.abs(a - U1[c * 256 + n]));
      scale = Math.max(scale, Math.abs(a));
    }
    check(`z-uniform (periodic, Nz=${Nz}, ${vc} V-cycles, seed=0, 50 steps): plane-to-plane difference / max|u|`, dz / scale, 1e-12);
    if (tolOne) {
      check(`  ... difference to the Nz=1 run / max|u|`, d1 / scale, tolOne);
      check(`  ... torque vs Nz=1 (relative)`, Math.abs(s.torque() - s1.torque()) / Math.abs(s1.torque()), 1e-10);
    } else console.log(`info  2 V-cycles: difference to the Nz=1 run / max|u| = ${(d1 / scale).toExponential(2)} (Poisson-solver error, not checked)`);
  }
}

console.log(fails ? `\n${fails} FAILURES` : "\nall fv_cpu checks passed");
process.exit(fails ? 1 : 0);
