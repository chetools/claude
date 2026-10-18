// ===================================================================== cpu.js
// Parameters (shared by both back ends) and the CPU fallback solver: the same
// algorithm as python/ns2d.py and shaders.wgsl, in plain JavaScript (float64).

function makeParams(inp) {
  const N = inp.N, h = 1 / N;
  let ro = inp.ro, Uo = inp.Uo;
  if (ro < 0.02) { ro = 0; Uo = 0; }                 // a centred cylinder cannot orbit
  const Us = inp.Us, R = inp.R, Re = inp.Re;
  const Uref = Math.max(Math.abs(Us), Math.abs(Uo)) || 1;
  const nu = Uref * 2 * R / Re;
  const Omega = Us / R;
  const omega_o = ro > 0 ? Uo / ro : 0;
  const Umax = Math.abs(Us) + Math.abs(omega_o) * (ro + R);
  const dt = 1 / (Umax / (0.3 * h) + nu / (0.05 * h * h));     // both limits, combined
  const probe_every = Math.max(1, Math.round(0.01 / dt));        // probe sampled every ~0.01 time units
  return { N, h, Re, R, ro, Us, Uo, nu, Omega, omega_o, dt, eps: h, vcycles: 2, nu1: 2, nu2: 2,
    ncoarse: 40, probe_every, probe_i: N / 2, probe_j: Math.round(0.13 * N) };
}

const CMAP = {
  diverging(t) {
    const lo = [0.23, 0.30, 0.75], mid = [0.97, 0.97, 0.97], hi = [0.71, 0.016, 0.15];
    const [a, b, s] = t < 0 ? [mid, lo, -t] : [mid, hi, t];
    return [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * s);
  },
  sequential(t) {
    const c = [[0.267, 0.005, 0.329], [0.230, 0.322, 0.546], [0.128, 0.567, 0.551], [0.369, 0.789, 0.383], [0.993, 0.906, 0.144]];
    const s = Math.min(Math.max(t, 0), 1) * 4, k = Math.min(Math.floor(s), 3), f = s - k;
    return [0, 1, 2].map(m => c[k][m] + (c[k + 1][m] - c[k][m]) * f);
  },
  dye(t) {
    const a = [0.12, 0.16, 0.35], b = [0.98, 0.75, 0.25], s = Math.min(Math.max(t, 0), 1);
    return [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * s);
  },
};
function colourOf(field, s, crange) {
  if (field === 0 || field === 2) return CMAP.diverging(Math.max(-1, Math.min(1, s / crange)));
  if (field === 1) return CMAP.sequential(s / crange);
  return CMAP.dye(s);
}

const minmod = (a, b) => (a * b <= 0 ? 0 : Math.sign(a) * Math.min(Math.abs(a), Math.abs(b)));
const faceValue = (am, a, b, bp, vel) =>
  (vel >= 0 ? a + 0.5 * minmod(a - am, b - a) : b + 0.5 * minmod(b - bp, a - b));

class CpuSolver {
  constructor(canvas) {
    this.kind = 'cpu';
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.field = 0; this.crange = 1;
  }

  configure(p, reset) {
    const old = this.p;
    this.p = p;
    if (reset || !old || old.N !== p.N) this.reset();
  }

  reset() {
    const N = this.p.N;
    const F = n => new Float64Array(n);
    Object.assign(this, {
      u: F(N * (N + 1)), v: F(N * (N + 1)), us: F(N * (N + 1)), vs: F(N * (N + 1)),
      ru: F(N * (N + 1)), rv: F(N * (N + 1)), q: F(N * N), rhs: F(N * N), dye: F(N * N),
      scalar: F(N * N), probe: F(8192), t: 0, phi: 0, spin: 0, dt_prev: 0, nstep: 0,
    });
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.dye[j * N + i] = Math.floor(j * 8 / N) % 2;
    this.levels = [];
    for (let n = N; n >= 4; n /= 2) {
      const lv = n === N ? { x: this.q, b: this.rhs } : { x: F(n * n), b: F(n * n) };
      lv.n = n; lv.h2 = (1 / n) ** 2; lv.r = F(n * n);
      this.levels.push(lv);
    }
  }

  // ---------------------------------------------------------------- ghosts
  U(i, j) {
    const n = this.p.N; let s = 1;
    if (i < 0) { i = -i; s = -s; }
    if (i > n) { i = 2 * n - i; s = -s; }
    if (j < 0) { j = -1 - j; s = -s; }
    if (j > n - 1) { j = 2 * n - 1 - j; s = -s; }
    return s * this.u[j * (n + 1) + i];
  }
  V(i, j) {
    const n = this.p.N; let s = 1;
    if (i < 0) { i = -1 - i; s = -s; }
    if (i > n - 1) { i = 2 * n - 1 - i; s = -s; }
    if (j < 0) { j = -j; s = -s; }
    if (j > n) { j = 2 * n - j; s = -s; }
    return s * this.v[j * n + i];
  }
  D(i, j) {
    const n = this.p.N;
    if (i < 0) i = -1 - i;
    if (i > n - 1) i = 2 * n - 1 - i;
    if (j < 0) j = -1 - j;
    if (j > n - 1) j = 2 * n - 1 - j;
    return this.dye[j * n + i];
  }

  rhsU(i, j) {
    const U = (a, b) => this.U(a, b), V = (a, b) => this.V(a, b), { h, nu } = this.p;
    const c = U(i, j);
    const ue = 0.5 * (c + U(i + 1, j)), uw = 0.5 * (U(i - 1, j) + c);
    const vn = 0.5 * (V(i - 1, j + 1) + V(i, j + 1)), vs = 0.5 * (V(i - 1, j) + V(i, j));
    const fe = ue * faceValue(U(i - 1, j), c, U(i + 1, j), U(i + 2, j), ue);
    const fw = uw * faceValue(U(i - 2, j), U(i - 1, j), c, U(i + 1, j), uw);
    const fn = vn * faceValue(U(i, j - 1), c, U(i, j + 1), U(i, j + 2), vn);
    const fs = vs * faceValue(U(i, j - 2), U(i, j - 1), c, U(i, j + 1), vs);
    const lap = U(i + 1, j) + U(i - 1, j) + U(i, j + 1) + U(i, j - 1) - 4 * c;
    return -(fe - fw + fn - fs) / h + nu * lap / (h * h);
  }
  rhsV(i, j) {
    const U = (a, b) => this.U(a, b), V = (a, b) => this.V(a, b), { h, nu } = this.p;
    const c = V(i, j);
    const ue = 0.5 * (U(i + 1, j - 1) + U(i + 1, j)), uw = 0.5 * (U(i, j - 1) + U(i, j));
    const vn = 0.5 * (c + V(i, j + 1)), vs = 0.5 * (V(i, j - 1) + c);
    const fe = ue * faceValue(V(i - 1, j), c, V(i + 1, j), V(i + 2, j), ue);
    const fw = uw * faceValue(V(i - 2, j), V(i - 1, j), c, V(i + 1, j), uw);
    const fn = vn * faceValue(V(i, j - 1), c, V(i, j + 1), V(i, j + 2), vn);
    const fs = vs * faceValue(V(i, j - 2), V(i, j - 1), c, V(i, j + 1), vs);
    const lap = V(i + 1, j) + V(i - 1, j) + V(i, j + 1) + V(i, j - 1) - 4 * c;
    return -(fe - fw + fn - fs) / h + nu * lap / (h * h);
  }

  body(x, y, phi) {
    const p = this.p, cx = 0.5 + p.ro * Math.cos(phi), cy = 0.5 + p.ro * Math.sin(phi);
    const dx = x - cx, dy = y - cy;
    const chi = 0.5 * (1 - Math.tanh((Math.hypot(dx, dy) - p.R) / p.eps));
    return [chi, -p.omega_o * (cy - 0.5) - p.Omega * dy, p.omega_o * (cx - 0.5) + p.Omega * dx];
  }

  // ---------------------------------------------------------------- multigrid
  smooth(lv, colour) {
    const { n, x, b, h2 } = lv;
    for (let j = 0; j < n; j++) for (let i = (j + colour) % 2; i < n; i += 2) {
      let s = 0, c = 0;
      if (i > 0) { s += x[j * n + i - 1]; c++; }
      if (i < n - 1) { s += x[j * n + i + 1]; c++; }
      if (j > 0) { s += x[(j - 1) * n + i]; c++; }
      if (j < n - 1) { s += x[(j + 1) * n + i]; c++; }
      x[j * n + i] = (s - h2 * b[j * n + i]) / c;
    }
  }
  vcycle(l) {
    const lv = this.levels[l], p = this.p, { n, x, b, r, h2 } = lv;
    if (l === this.levels.length - 1) {
      for (let k = 0; k < p.ncoarse; k++) { this.smooth(lv, 0); this.smooth(lv, 1); }
      let m = 0;
      for (let k = 0; k < n * n; k++) m += x[k];
      m /= n * n;
      for (let k = 0; k < n * n; k++) x[k] -= m;
      return;
    }
    for (let k = 0; k < p.nu1; k++) { this.smooth(lv, 0); this.smooth(lv, 1); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      if (i > 0) { s += x[j * n + i - 1]; c++; }
      if (i < n - 1) { s += x[j * n + i + 1]; c++; }
      if (j > 0) { s += x[(j - 1) * n + i]; c++; }
      if (j < n - 1) { s += x[(j + 1) * n + i]; c++; }
      r[j * n + i] = b[j * n + i] - (s - c * x[j * n + i]) / h2;
    }
    const cv = this.levels[l + 1], nc = n / 2;
    for (let J = 0; J < nc; J++) for (let I = 0; I < nc; I++) {
      const k = 2 * J * n + 2 * I;
      cv.b[J * nc + I] = 0.25 * (r[k] + r[k + 1] + r[k + n] + r[k + n + 1]);
      cv.x[J * nc + I] = 0;
    }
    this.vcycle(l + 1);
    const xc = cv.x;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const I = i >> 1, J = j >> 1;
      const I2 = Math.min(Math.max(I + (i % 2 === 0 ? -1 : 1), 0), nc - 1);
      const J2 = Math.min(Math.max(J + (j % 2 === 0 ? -1 : 1), 0), nc - 1);
      const a = 0.75 * xc[J * nc + I] + 0.25 * xc[J2 * nc + I];
      const c = 0.75 * xc[J * nc + I2] + 0.25 * xc[J2 * nc + I2];
      x[j * n + i] += 0.75 * a + 0.25 * c;
    }
    for (let k = 0; k < p.nu2; k++) { this.smooth(lv, 0); this.smooth(lv, 1); }
  }

  // ---------------------------------------------------------------- one time step
  stepOnce() {
    const p = this.p, n = p.N, h = p.h, dt = p.dt;
    const { u, v, us, vs, ru, rv, q, rhs } = this;
    let a = 1, b = 0;
    if (this.dt_prev > 0) { const r = dt / this.dt_prev; a = 1 + 0.5 * r; b = -0.5 * r; }
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) {
      const k = j * (n + 1) + i, R = this.rhsU(i, j);
      us[k] = u[k] + dt * (a * R + b * ru[k]); ru[k] = R;
    }
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, R = this.rhsV(i, j);
      vs[k] = v[k] + dt * (a * R + b * rv[k]); rv[k] = R;
    }
    const phi = this.phi + p.omega_o * dt;                 // penalise at the new time level
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) {
      const k = j * (n + 1) + i, bd = this.body(i * h, (j + 0.5) * h, phi);
      u[k] = us[k] + bd[0] * (bd[1] - us[k]);
    }
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, bd = this.body((i + 0.5) * h, j * h, phi);
      v[k] = vs[k] + bd[0] * (bd[2] - vs[k]);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      rhs[j * n + i] = (u[k + 1] - u[k] + v[(j + 1) * n + i] - v[j * n + i]) / h;
    }
    for (let c = 0; c < p.vcycles; c++) this.vcycle(0);
    for (let j = 0; j < n; j++) for (let i = 1; i < n; i++) u[j * (n + 1) + i] -= (q[j * n + i] - q[j * n + i - 1]) / h;
    for (let j = 1; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] -= (q[j * n + i] - q[(j - 1) * n + i]) / h;
    // dye
    const out = new Float64Array(n * n);
    const fx = (i, j) => { const w = u[j * (n + 1) + i]; return w * faceValue(this.D(i - 2, j), this.D(i - 1, j), this.D(i, j), this.D(i + 1, j), w); };
    const fy = (i, j) => { const w = v[j * n + i]; return w * faceValue(this.D(i, j - 2), this.D(i, j - 1), this.D(i, j), this.D(i, j + 1), w); };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      out[j * n + i] = this.dye[j * n + i] - dt / h * (fx(i + 1, j) - fx(i, j) + fy(i, j + 1) - fy(i, j));
    this.dye = out;
    // probe, then advance the clock
    if (this.nstep % p.probe_every === 0) {
      const slot = Math.floor(this.nstep / p.probe_every) % 4096, i = p.probe_i, j = p.probe_j;
      this.probe[2 * slot] = 0.5 * (u[j * (n + 1) + i] + u[j * (n + 1) + i + 1]);
      this.probe[2 * slot + 1] = 0.5 * (v[j * n + i] + v[(j + 1) * n + i]);
    }
    this.t += dt; this.phi = phi; this.spin += p.Omega * dt; this.dt_prev = dt; this.nstep++;
  }

  step(k) { for (let s = 0; s < k; s++) this.stepOnce(); }

  // ---------------------------------------------------------------- diagnostics
  cornerVort(i, j) { return (this.V(i, j) - this.V(i - 1, j) - this.U(i, j) + this.U(i, j - 1)) / this.p.h; }
  cellVort(i, j) {
    return 0.25 * (this.cornerVort(i, j) + this.cornerVort(i + 1, j) + this.cornerVort(i, j + 1) + this.cornerVort(i + 1, j + 1));
  }

  async readStats() {
    const p = this.p, n = p.N, h = p.h, { u, v, us, vs, q } = this;
    const cx = 0.5 + p.ro * Math.cos(this.phi), cy = 0.5 + p.ro * Math.sin(this.phi);
    let E = 0, Z = 0, tq = 0, maxdiv = 0, maxspeed = 0, maxvort = 0, maxp = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * (n + 1) + i;
      const uc = 0.5 * (u[k] + u[k + 1]), vc = 0.5 * (v[j * n + i] + v[(j + 1) * n + i]);
      const w = this.cellVort(i, j);
      E += 0.5 * (uc * uc + vc * vc) * h * h;
      Z += 0.5 * w * w * h * h;
      if (i >= 1) { const y = (j + 0.5) * h, b = this.body(i * h, y, this.phi); tq -= (y - cy) * b[0] * (b[1] - us[k]) / p.dt * h * h; }
      if (j >= 1) { const x = (i + 0.5) * h, b = this.body(x, j * h, this.phi); tq += (x - cx) * b[0] * (b[2] - vs[j * n + i]) / p.dt * h * h; }
      maxdiv = Math.max(maxdiv, Math.abs(u[k + 1] - u[k] + v[(j + 1) * n + i] - v[j * n + i]) / h);
      maxspeed = Math.max(maxspeed, Math.hypot(uc, vc));
      maxvort = Math.max(maxvort, Math.abs(w));
      maxp = Math.max(maxp, Math.abs(q[j * n + i]) / p.dt);
    }
    return { t: this.t, phi: this.phi, nstep: this.nstep, E, Z, torque: -tq, maxdiv, maxspeed, maxvort, maxp,
      probe: this.probe };
  }

  async readUV64() { return { u: this.u, v: this.v }; }

  resetDye() {
    const n = this.p.N;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.dye[j * n + i] = Math.floor(j * 8 / n) % 2;
  }

  render() {
    if (!this.ctx) return;
    const p = this.p, n = p.N, cv = this.canvas, ctx = this.ctx;
    if (!this.img || this.img.width !== n) {
      this.off = document.createElement('canvas');
      this.off.width = this.off.height = n;
      this.img = this.off.getContext('2d').createImageData(n, n);
    }
    const d = this.img.data;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s;
      if (this.field === 0) s = this.cellVort(i, j);
      else if (this.field === 1) {
        const k = j * (n + 1) + i;
        s = Math.hypot(0.5 * (this.u[k] + this.u[k + 1]), 0.5 * (this.v[j * n + i] + this.v[(j + 1) * n + i]));
      } else if (this.field === 2) s = this.q[j * n + i] / p.dt;
      else s = this.dye[j * n + i];
      const c = colourOf(this.field, s, this.crange), o = 4 * ((n - 1 - j) * n + i);
      d[o] = 255 * c[0]; d[o + 1] = 255 * c[1]; d[o + 2] = 255 * c[2]; d[o + 3] = 255;
    }
    this.off.getContext('2d').putImageData(this.img, 0, 0);
    const W = cv.width;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.off, 0, 0, W, W);
    const cx = (0.5 + p.ro * Math.cos(this.phi)) * W, cy = (1 - 0.5 - p.ro * Math.sin(this.phi)) * W, R = p.R * W;
    ctx.fillStyle = 'rgba(140,145,158,0.8)';
    ctx.strokeStyle = '#31333f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(this.spin), cy - R * Math.sin(this.spin)); ctx.stroke();
    const px = (p.probe_i + 0.5) * p.h * W, py = (1 - (p.probe_j + 0.5) * p.h) * W;   // the velocity probe
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py + 5); ctx.moveTo(px - 5, py + 5); ctx.lineTo(px + 5, py - 5); ctx.stroke();
  }
}
