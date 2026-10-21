// node diag_test.js : CC3.diag against numpy values from diag_gen.py (python/diagnostics.py). Tolerance 1e-12.
const fs = require('fs'), path = require('path');
const D = require(path.join(__dirname, '..', 'diagnostics.js'));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'diag_ref.json'), 'utf8'));
const TOL = 1e-12;
let worst = 0, fails = 0;
// relative difference: arrays are scaled by their own max |ref| (a tiny entry next to a big one is not a fair ratio)
function rel(a, b) {
  if (typeof b === 'number') return Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  let d = 0, m = 0;
  if (a.length !== b.length) return Infinity;
  for (let i = 0; i < b.length; i++) { d = Math.max(d, Math.abs(a[i] - b[i])); m = Math.max(m, Math.abs(b[i])); }
  return d / Math.max(m, 1e-300);
}
function check(cname, what, got, want) {
  const r = rel(got, want), ok = r <= TOL;
  worst = Math.max(worst, r); if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${cname.padEnd(40)} ${what.padEnd(10)} rel ${r.toExponential(2)}`);
}
for (const c of cases) {
  const U = c.f32 ? Float32Array.from(c.U) : Float64Array.from(c.U);
  if (c.f32) for (let i = 0; i < U.length; i++) if (U[i] !== c.U[i]) throw new Error('float32 case values must be exactly representable');
  const { N, Nz, h, Lz, span } = c;
  const fluid = c.fluid ? D.fluid_mask(c.p, c.s.phi !== undefined ? c.s.phi : c.p.omega_o * c.s.t) : null;
  if (c.fluid) { let bad = 0; for (let i = 0; i < c.fluid.length; i++) if (fluid[i] !== c.fluid[i]) bad++; check(c.name, 'mask', bad, 0 + 0.0); if (bad) fails++; }
  check(c.name, 'vorticity', D.vorticity(U, Nz, N, h, span), c.vort);
  check(c.name, 'Q', D.q_criterion(U, Nz, N, h, span), c.Q);
  check(c.name, 'energy', D.energy(U, Nz, N, h, Lz, fluid), c.E);
  check(c.name, 'enstrophy', D.enstrophy(U, Nz, N, h, Lz, span, fluid), c.Z);
  const sp = D.spanwise_energy(U, Nz, N, h, Lz, span, fluid);
  check(c.name, 'Ew', sp.Ew, c.Ew);
  check(c.name, 'E3d', sp.E3d, c.E3d);
  if (c.Ekz) {
    check(c.name, 'Ekz', sp.Ekz, c.Ekz);
    const sum = Array.from(sp.Ekz).reduce((a, b) => a + b, 0);
    check(c.name, 'Parseval', sum, c.E);                 // sum(Ekz) = fluid energy exactly
  } else if (sp.Ekz !== null) { fails++; console.log('FAIL Ekz should be null for walls'); }
  const [k, Ek] = D.spectrum_h(U, Nz, N, h, fluid);
  check(c.name, 'spec k', k, c.k);
  check(c.name, 'spectrum', Ek, c.Ek);
  const [, Ek2] = D.spectrum_h(U, Nz, N, h, fluid, { maxPlanes: Nz });
  check(c.name, 'maxPlanes', Ek2, c.Ek);
  check(c.name, 'spec sum=E', Array.from(Ek).reduce((a, b) => a + b, 0), c.E);   // per-plane rescale: sum E_k = fluid energy
  const s = D.summary(U, c.s, c.p);
  for (const key of ['E', 'Z', 'Ew', 'E3d', 'torque', 'maxdiv', 'maxspeed']) check(c.name, 'sum.' + key, s[key], c.summary[key]);
  const s0 = D.summary(U, { t: c.s.t, phi: c.s.phi }, c.p);
  if (!(Number.isNaN(s0.torque) && Number.isNaN(s0.maxdiv))) { fails++; console.log('FAIL missing torque/maxdiv must be NaN'); }
}
// the radix-2 FFT against the direct DFT (same function, non-power-of-2 path) on a pow2 length via a 2n padded check
{
  const n = 64, re = new Float64Array(n), im = new Float64Array(n), r2 = new Float64Array(n), i2 = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = r2[i] = Math.sin(i * 1.3) + (i % 5); 
  D.fft(re, im, n);
  let d = 0;
  for (let m = 0; m < n; m++) { let sr = 0, si = 0; for (let k = 0; k < n; k++) { const a = -2 * Math.PI * ((m * k) % n) / n; sr += r2[k] * Math.cos(a); si += r2[k] * Math.sin(a); } d = Math.max(d, Math.hypot(sr - re[m], si - im[m])); }
  console.log(`${d < 1e-11 ? 'ok  ' : 'FAIL'} radix-2 FFT vs direct sum, n=64, max abs diff ${d.toExponential(2)}`);
  if (d >= 1e-11) fails++;
}
console.log(`\nworst relative difference over all checks: ${worst.toExponential(2)}  (tolerance ${TOL})`);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
