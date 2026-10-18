'use strict';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
const PLOT_CFG = {responsive: true, displaylogo: false};
const C = {red: '#ff4b4b', blue: '#1f77b4', dark: '#31333f', grey: '#808495', orange: '#ff7f0e',
  green: '#2ca02c', purple: '#9467bd'};
const DARCY = 9.869233e-13;
const K_GUESS = 10;            // Kozeny constant of random 2D disk beds (measured, Python step 9)

// Sidebar presets.  Lengths are in particle diameters d; D = cells per diameter.
const BASE = {layout: 'random', porosity: 0.65, gap: 0.15, spread: 0, seed: 3, walls: false, Lx: 20, Ly: 8,
  D: 24, tau: 1.0, coll: 'trt316', Re: 1, auto: true, Pe: 20, pulse: 0.5, dp: 3, nuSI: 1e-6, rhoSI: 1000};
const PRESETS = {
  random: BASE,
  dense: Object.assign({}, BASE, {porosity: 0.55, gap: 0.1, seed: 4}),
  loose: Object.assign({}, BASE, {porosity: 0.8, seed: 5}),
  poly: Object.assign({}, BASE, {spread: 0.45, seed: 6}),
  wall: Object.assign({}, BASE, {walls: true, Ly: 6, seed: 8}),
  square: Object.assign({}, BASE, {layout: 'square', porosity: 0.7}),
  staggered: Object.assign({}, BASE, {layout: 'staggered', porosity: 0.7}),
  channel: Object.assign({}, BASE, {layout: 'empty', walls: true, Lx: 16, Ly: 1, D: 32, Re: 1, Pe: 10}),
  big: Object.assign({}, BASE, {Lx: 40, Ly: 16, D: 32}),
};
const FIELDS = ['layout', 'porosity', 'gap', 'spread', 'seed', 'walls', 'Lx', 'Ly', 'D', 'tau', 'coll', 'Re', 'auto',
  'Pe', 'pulse', 'dp', 'nuSI', 'rhoSI'];
const BED_FIELDS = new Set(['layout', 'porosity', 'gap', 'spread', 'seed', 'walls', 'Lx', 'Ly', 'D']);
const MAGIC = {trt316: 3 / 16, trt14: 0.25, bgk: null};

// ---------------------------------------------------------------- small helpers
const fmt = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '–');
const SUP = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
/** 1.23×10⁻⁴ */
function fmtE(x, d = 2) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(d).split('e');
  return `${m}×10${String(parseInt(e, 10)).split('').map((c) => SUP[c]).join('')}`;
}
function showErr(msg) { const e = $('err'); e.hidden = !msg; e.textContent = msg || ''; }
function setBar(id, f) { $(id).style.width = (100 * Math.max(0, Math.min(1, f))) + '%'; }
function baseLayout(title, extra) {
  return Object.assign({title: {text: title, font: {size: 15}}, height: 380,
    margin: {l: 62, r: 24, t: 56, b: 50}, legend: {orientation: 'h', x: 0, y: -0.22},
    font: {family: '"Source Sans Pro",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'}}, extra || {});
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frameWait = () => new Promise((r) => requestAnimationFrame(() => r()));

function lgamma(x) {     // Lanczos approximation, x > 0
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ---------------------------------------------------------------- inputs
function readInputs() {
  const v = {};
  FIELDS.forEach((f) => {
    const el = $('in-' + f);
    v[f] = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' && isNaN(parseFloat(el.value)) ? el.value : parseFloat(el.value));
  });
  return v;
}
function setInputs(p) {
  FIELDS.forEach((f) => { const el = $('in-' + f); if (el.type === 'checkbox') el.checked = !!p[f]; else el.value = p[f]; });
}
function validate(v) {
  const bad = FIELDS.filter((f) => typeof v[f] === 'number' && !Number.isFinite(v[f]));
  if (bad.length) return 'Please enter a number for: ' + bad.join(', ');
  if (v.layout !== 'empty' && !(v.porosity > 0.3 && v.porosity < 0.97)) return 'Porosity must be between 0.3 and 0.97.';
  if (!(v.Lx >= 6)) return 'The domain must be at least 6 particle diameters long (two detectors sit 2 d from each end).';
  if (!(v.Ly >= 1)) return 'The domain must be at least 1 particle diameter high.';
  if (!(v.tau > 0.505 && v.tau <= 3)) return 'τ must be between 0.505 and 3.';
  if (!(v.Re > 0 && v.Re <= 200)) return 'Re must be between 0 and 200.';
  if (!(v.Pe > 0)) return 'Pe_m must be positive.';
  const n = Math.round(v.Lx * v.D) * (Math.round(v.Ly * v.D) + (v.walls ? 2 : 0));
  if (n > 8e6) return `The grid would have ${(n / 1e6).toFixed(1)} million cells; please stay below 8 million.`;
  return null;
}
const gridOf = (v) => ({nx: Math.round(v.Lx * v.D), ny: Math.round(v.Ly * v.D) + (v.walls ? 2 : 0)});

function buildBed(v) {
  const {nx, ny} = gridOf(v);
  const disks = placeDisks(nx, ny, v.porosity, v.D, v.layout, v.spread, v.gap * v.D, Math.round(v.seed), v.walls);
  return finishBed({nx, ny, D: v.D, walls: v.walls, layout: v.layout, disks});
}
function finishBed(b) {
  b.solid = rasterize(b.nx, b.ny, b.disks, b.walls);
  b.eps = porosityOf(b.solid, b.nx, b.ny, b.walls);
  b.a_s = specificSurface(b.disks);
  b.d = b.disks.length ? 4 / b.a_s : b.D;       // mean diameter (cells)
  b.nCross = b.nx * (b.walls ? b.ny - 2 : b.ny);
  b.det = [Math.round(2 * b.D), b.nx - Math.round(2 * b.D), b.nx - 1];
  if (b.det[1] <= b.det[0]) b.det = [Math.round(0.15 * b.nx), Math.round(0.85 * b.nx), b.nx - 1];
  return b;
}
/** Rough permeability (cells^2) before anything has been measured. */
function kGuess(b) {
  if (!b.disks.length) return b.walls ? ((b.ny - 2) ** 2 + 0.5) / 12 : 1e6;
  if (b.layout === 'square') return gebart(b.eps, b.d) * 0.95;
  return b.eps ** 3 / (K_GUESS * b.a_s * b.a_s * (1 - b.eps) ** 2);
}
const kozenyCarman = (eps, a_s, K) => eps ** 3 / (K * a_s * a_s * (1 - eps) ** 2);
const gebart = (eps, d) => 16 / (9 * Math.PI * Math.SQRT2) * (Math.sqrt(Math.PI / 4 / (1 - eps)) - 1) ** 2.5 * (d / 2) ** 2;
const sanganiAcrivos = (eps, d) => { const f = 1 - eps, a = d / 2; return a * a / (8 * f) * (-Math.log(f) - 1.476 + 2 * f - 1.774 * f * f + 4.076 * f ** 3); };

// ---------------------------------------------------------------- RTD analysis (lbm.rtd_moments etc.)
const trapz = (y, x) => { let s = 0; for (let i = 1; i < x.length; i++) s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]); return s; };
function tailFit(t, c, frac = 0.25) {
  const n = Math.max(5, Math.floor(frac * t.length));
  const tt = t.slice(-n), cc = c.slice(-n);
  if (cc.some((v) => v <= 0)) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const y = Math.log(cc[i]); sx += tt[i]; sy += y; sxx += tt[i] * tt[i]; sxy += tt[i] * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope < 0 ? -1 / slope : null;
}
function rtdMoments(t, c, pulse = 0, tail = true) {
  c = c.map((v) => Math.max(0, v));
  let m0 = trapz(c, t), m1 = trapz(c.map((v, i) => v * t[i]), t), m2 = trapz(c.map((v, i) => v * t[i] * t[i]), t);
  const lam = tail ? tailFit(t, c) : null;
  if (lam !== null) {
    const T = t[t.length - 1], CT = c[c.length - 1];
    m0 += CT * lam; m1 += CT * lam * (T + lam); m2 += CT * lam * (T * T + 2 * T * lam + 2 * lam * lam);
  }
  const mean = m1 / m0;
  return {E: c.map((v) => v / m0), mean: mean - 0.5 * pulse, variance: m2 / m0 - mean * mean - pulse * pulse / 12, lam};
}
function fitDispersion(a, b, dx) {
  const dt = b.mean - a.mean, dv = b.variance - a.variance, u = dx / dt, Pe = 2 * dt * dt / dv;
  return {u, Pe, DL: u * dx / Pe, N: dt * dt / dv, tau: dt, variance: dv};
}
const Edisp = (th, Pe) => { th = Math.max(th, 1e-12); return Math.sqrt(Pe / (4 * Math.PI * th)) * Math.exp(-Pe * (1 - th) ** 2 / (4 * th)); };
const Etanks = (th, N) => { th = Math.max(th, 1e-12); return Math.exp(N * Math.log(N) + (N - 1) * Math.log(th) - N * th - lgamma(N)); };

// ---------------------------------------------------------------- state
let gpuDev = null;           // {device, adapter, name} or null
let backend = 'cpu';
let sim = null, canvas = null;
let bed = null;
let S = null;                // run state
let playing = true;
let simBusy = false;         // GPU work in flight
let sweepRunning = false;
let lastV = null;

function newRunState(v) {
  const nu = viscosity(v.tau);
  const Ut = v.Re * nu / bed.d;
  const g = nu * Ut / kGuess(bed);
  return {v, nu, g, Ut, magic: MAGIC[v.coll], kHist: [], lastK: null, converged: false, adjustments: 0,
    lastAdjustAt: 0, Us: NaN, k: NaN, maxU: 0, mass: NaN, mass0: NaN, clock: 0,
    tracer: null, rtd: null, stepsPerFrame: backend === 'gpu' ? 20 : 2, rate: {t: performance.now(), clock: 0, mlups: NaN},
    frozen: false};
}
function applyParams() {
  const [wp, wm] = trtRates(S.v.tau, S.magic);
  const p = {wp, wm, gx: S.g, gy: 0, cIn: 1, det: bed.det};
  if (S.tracer) { const [twp, twm] = tracerRates(S.tracer.Dm); p.twp = twp; p.twm = twm; }
  sim.setParams(p);
}

// ---------------------------------------------------------------- simulator set-up
function makeCanvas() {
  const old = $('lbm-canvas');
  const c = document.createElement('canvas');
  c.id = 'lbm-canvas'; c.className = 'lbm-canvas';
  old.replaceWith(c);
  c.addEventListener('pointerdown', onCanvasPointer);
  c.addEventListener('pointermove', (e) => { if (e.buttons) onCanvasPointer(e); });
  return c;
}
function createSim(b, withCanvas = true) {
  if (backend === 'gpu') return new GpuLbm(gpuDev, b.nx, b.ny, b.solid, withCanvas ? canvas : null);
  return new CpuLbm(b.nx, b.ny, b.solid);
}
function rebuild(keepBed = false) {
  const v = readInputs();
  const msg = validate(v);
  showErr(msg);
  if (msg) return;
  if (!keepBed) bed = buildBed(v);
  if (sim) sim.destroy();
  canvas = makeCanvas();
  sim = createSim(bed);
  S = newRunState(v);
  applyParams();
  lastV = v;
  $('cv-wrap').style.aspectRatio = `${bed.nx} / ${bed.ny}`;
  updateBedInfo();
  resetCharts();
  renderMetrics();
}
/** Inputs that do not change the bed: keep the flow, change parameters. */
function retune() {
  const v = readInputs();
  const msg = validate(v);
  showErr(msg);
  if (msg) return;
  const nu = viscosity(v.tau);
  const kNow = Number.isFinite(S.k) && S.k > 0 ? S.k : kGuess(bed);
  S.v = v; S.nu = nu; S.magic = MAGIC[v.coll]; S.Ut = v.Re * nu / bed.d;
  S.g = nu * S.Ut / kNow;
  S.converged = false; S.adjustments = 0; S.lastAdjustAt = S.clock;
  applyParams();
  renderMetrics();
}
function updateBedInfo() {
  const n = bed.nx * bed.ny;
  $('bed-info').innerHTML = `Grid ${bed.nx} × ${bed.ny} = ${(n / 1e3).toFixed(0)}k cells · ${bed.disks.length} particles ·
    ε = ${bed.eps.toFixed(3)} · detectors at x = ${bed.det[0]}, ${bed.det[1]} and the outlet`;
}

// ---------------------------------------------------------------- animation loop
// Each frame advances the simulation by a number of steps that adapts so one
// frame of work takes about 14 ms (GPU) or 25 ms (CPU), then draws it.
async function loop() {
  if (sim && playing && !sweepRunning && !simBusy) {
    const spf = Math.max(1, Math.round(S.stepsPerFrame));
    const t0 = performance.now();
    if (backend === 'gpu') {
      simBusy = true;
      sim.step(spf, {flow: !S.frozen});
      sim.finish().then(() => {
        const dt = performance.now() - t0;
        S.stepsPerFrame = Math.min(2000, Math.max(1, S.stepsPerFrame * Math.min(1.5, Math.max(0.5, 14 / Math.max(dt, 1)))));
        simBusy = false;
      });
    } else {
      sim.step(spf, {flow: !S.frozen});
      const dt = performance.now() - t0;
      S.stepsPerFrame = Math.min(200, Math.max(1, S.stepsPerFrame * Math.min(1.5, Math.max(0.5, 25 / Math.max(dt, 1)))));
    }
  }
  if (sim && !sweepRunning) {
    sim.render(canvas, viewMode(), viewScale());
    pollStats();
  }
  requestAnimationFrame(loop);
}
const viewMode = () => ({speed: 0, vort: 1, tracer: 2, pressure: 3})[$('view-mode').value];
function viewScale() {
  const m = parseFloat($('view-scale').value) || 1;
  const u = S && S.maxU > 0 ? S.maxU : 1e-6;
  switch (viewMode()) {
    case 0: return u / m;
    case 1: return u / (0.25 * bed.d) / m;
    case 2: return (S.tracer && S.tracer.cmax > 0 ? Math.min(1, 1.5 * S.tracer.cmax) : 1) / m;
    default: return S.g * bed.d * 2 / m + 1e-12;
  }
}

let statsPending = false, lastStatsAt = 0;
function pollStats() {
  const now = performance.now();
  if (statsPending || now - lastStatsAt < 90) return;
  statsPending = true; lastStatsAt = now;
  const mySim = sim;
  mySim.stats().then((st) => { statsPending = false; if (st && mySim === sim) onStats(st); })
    .catch((e) => { statsPending = false; if (mySim === sim) console.error(e); });   // a replaced simulator may abort its read-back
}

function onStats(st) {
  S.clock = st.clock;
  S.Us = st.sumUx / bed.nCross;
  S.k = S.nu * S.Us / S.g;
  S.maxU = st.maxU;
  S.mass = st.mass / Math.max(1, countFluid());
  // throughput
  const now = performance.now();
  if (now - S.rate.t > 1000) {
    const cells = bed.nx * bed.ny;
    S.rate.mlups = (st.clock - S.rate.clock) * cells / ((now - S.rate.t) / 1000) / 1e6;
    S.rate.t = now; S.rate.clock = st.clock;
  }
  // permeability history and convergence (relative change over about half a viscous time)
  const window = Math.max(200, Math.round(0.5 * bed.d * bed.d / S.nu));
  if (!S.kHist.length || st.clock - S.kHist[S.kHist.length - 1][0] >= Math.max(20, window / 20)) {
    S.kHist.push([st.clock, S.k / (bed.d * bed.d)]);
    if (S.kHist.length > 4000) S.kHist.splice(0, 2000);
  }
  const old = S.kHist.find((q) => q[0] >= st.clock - window);
  if (old && st.clock - old[0] >= 0.8 * window && st.clock - S.lastAdjustAt > window) {
    const rel = Math.abs(S.k / (bed.d * bed.d) / old[1] - 1);
    S.converged = rel < 2e-4;
  } else S.converged = false;
  // hold the Reynolds number: rescale the force once the flow has settled
  const Re = S.Us * bed.d / S.nu;
  if (S.v.auto && S.converged && Math.abs(Re / S.v.Re - 1) > 0.02 && S.adjustments < 12 && !S.tracer) {
    S.g *= S.v.Re / Re;
    S.adjustments++; S.lastAdjustAt = st.clock; S.converged = false;
    applyParams();
  }
  // tracer detectors
  if (S.tracer) onTracerStats(st);
  renderMetrics();
  scheduleCharts();
}
let fluidCount = null;
function countFluid() {
  if (fluidCount && fluidCount.bed === bed && fluidCount.n === bed.solid.length) return fluidCount.k;
  let k = 0; for (const s of bed.solid) if (!s) k++;
  fluidCount = {bed, n: bed.solid.length, k};
  return k;
}

// ---------------------------------------------------------------- tracer
function injectPulse() {
  if (!sim) return;
  if (!(S.Us > 0)) { showErr('Let the flow develop first (press Play).'); return; }
  const uInt = S.Us / bed.eps;
  const Dm = uInt * bed.d / S.v.Pe;
  const pulse = Math.max(2, Math.round(S.v.pulse * bed.d / uInt));
  const warn = [];
  if (Dm < 0.002) warn.push(`D_m = ${fmt(Dm)} lattice units is very small: raise Re-to-Pe ratio, τ, or lower Pe_m, or the tracer may oscillate`);
  if (S.maxU > 0.25) warn.push('the peak velocity is high for the tracer lattice (|u| > 0.25)');
  showErr(warn.length ? 'Note: ' + warn.join('; ') + '.' : '');
  S.tracer = {Dm, pulse, uInt, t0: S.clock, t: [], c: [[], [], []], cmax: 0, done: false, frozenSet: false};
  sim.inject(pulse);
  applyParams();
  S.rtd = null;
  $('rtd-status').textContent = `Pulse injected: ${pulse} steps wide, D_m = ${fmt(Dm)} (Pe_m = ${S.v.Pe}).`;
}
function onTracerStats(st) {
  const T = S.tracer;
  const t = st.clock - (st.clock >= T.t0 ? T.t0 : st.clock);
  if (T.t.length && t <= T.t[T.t.length - 1]) return;
  T.t.push(t);
  st.det.forEach((d, j) => { const c = d[1] !== 0 ? d[0] / d[1] : 0; T.c[j].push(c); T.cmax = Math.max(T.cmax, c); });
  // finished once the second detector's signal has come and gone
  const c2 = T.c[1], peak = Math.max(...c2);
  const tPeak = T.t[c2.indexOf(peak)];
  if (!T.done && peak > 1e-4 && c2[c2.length - 1] < 0.01 * peak && t > 2 * tPeak) { T.done = true; analyseRTD(); }
  else if (!T.done && T.t.length % 20 === 0 && peak > 0 && c2[c2.length - 1] < 0.2 * peak && t > 1.5 * tPeak) analyseRTD(true);
}
function analyseRTD(partial = false) {
  const T = S.tracer;
  if (!T || T.t.length < 20) return;
  const a = rtdMoments(T.t, T.c[0], T.pulse), b = rtdMoments(T.t, T.c[1], T.pulse);
  const fit = fitDispersion(a, b, bed.det[1] - bed.det[0]);
  S.rtd = {a, b, fit, partial, Dm: T.Dm, Pe_m: S.v.Pe, uInt: T.uInt};
  $('rtd-status').textContent = partial ? 'Provisional analysis (the tail is still passing the second detector)…'
    : 'Pulse has passed both detectors: final analysis below.';
  renderRTD();
}

// ---------------------------------------------------------------- metrics
function renderMetrics() {
  if (!S) return;
  const d = bed.d, Re = S.Us * d / S.nu;
  $('m-eps').textContent = bed.eps.toFixed(3);
  $('m-eps-sub').innerHTML = bed.disks.length ? `${bed.disks.length} particles, a<sub>s</sub>d = ${fmt(bed.a_s * d)}` : 'no particles';
  $('m-re').textContent = fmt(Re, 3);
  $('m-re-sub').innerHTML = `target ${S.v.Re} · Mach |u|<sub>max</sub>/c<sub>s</sub> = ${fmt(S.maxU * Math.sqrt(3), 2)}`;
  const kd2 = S.k / (d * d);
  $('m-k').textContent = fmt(kd2, 4);
  const kSI = kd2 * (S.v.dp * 1e-3) ** 2;
  let sub = `k = ${fmtE(kSI)} m² (${fmt(kSI / DARCY, 3)} D) for d<sub>p</sub> = ${S.v.dp} mm`;
  if (bed.disks.length && Number.isFinite(S.k) && S.k > 0) sub += ` · Kozeny K = ${fmt(bed.eps ** 3 / (S.k * bed.a_s ** 2 * (1 - bed.eps) ** 2), 3)}`;
  else if (!bed.disks.length && bed.walls) sub += ` · exact (h² + ½)/12: ${fmt(((bed.ny - 2) ** 2 + 0.5) / 12 / (d * d), 4)}`;
  $('m-k-sub').innerHTML = sub;
  // pressure gradient in SI: dp/dx = rho g_lattice dx/dt^2, dt = nu_lat dx^2 / nu_SI
  const dx = S.v.dp * 1e-3 / d, dt = S.nu * dx * dx / S.v.nuSI;
  const gradSI = S.v.rhoSI * S.g * dx / (dt * dt);
  const USI = S.Us * dx / dt;
  const ergun = 150 * S.v.rhoSI * S.v.nuSI * USI * (1 - bed.eps) ** 2 / (bed.eps ** 3 * (S.v.dp * 1e-3) ** 2)
    + 1.75 * S.v.rhoSI * USI * USI * (1 - bed.eps) / (bed.eps ** 3 * S.v.dp * 1e-3);
  $('m-dp').textContent = fmt(gradSI, 3) + ' Pa/m';
  $('m-dp-sub').innerHTML = `at U = ${fmt(USI * 1e3, 3)} mm/s · Ergun (spheres, same ε): ${fmt(ergun, 3)} Pa/m`;
  if (S.rtd) {
    $('m-dl').textContent = fmt(S.rtd.fit.DL / S.rtd.Dm, 3);
    $('m-dl-sub').innerHTML = `Pe = ${fmt(S.rtd.fit.Pe, 3)}, N = ${fmt(S.rtd.fit.N, 3)} tanks${S.rtd.partial ? ' (provisional)' : ''}`;
  } else {
    $('m-dl').textContent = '–';
    $('m-dl-sub').textContent = S.tracer ? 'pulse on its way…' : 'inject a tracer pulse';
  }
  $('m-mlups').textContent = playing && Number.isFinite(S.rate.mlups) ? fmt(S.rate.mlups, 3) : '–';
  $('m-mlups-sub').textContent = `${backend === 'gpu' ? 'WebGPU' : 'CPU (JavaScript)'} · step ${S.clock.toLocaleString()}`;
  $('conv').textContent = S.converged ? 'steady' : (S.adjustments && S.v.auto ? `adjusting force to hold Re (${S.adjustments})` : 'developing');
  $('conv').className = 'pill ' + (S.converged ? 'ready' : 'busy');
}

// ---------------------------------------------------------------- charts
let chartTimer = null;
function scheduleCharts() {
  if (chartTimer) return;
  chartTimer = setTimeout(() => { chartTimer = null; renderLiveCharts(); }, 500);
}
function resetCharts() {
  ['chart-k', 'chart-det'].forEach((id) => { const el = $(id); if (el && el.data) Plotly.purge(el); });
  renderLiveCharts();
}
function renderLiveCharts() {
  if (!S || !visible('chart-k')) return;
  const d = bed.d;
  const traces = [{x: S.kHist.map((q) => q[0]), y: S.kHist.map((q) => q[1]), mode: 'lines', name: 'LBM (live)', line: {color: C.red, width: 2}}];
  if (bed.disks.length) {
    const x = S.kHist.length ? [S.kHist[0][0], S.kHist[S.kHist.length - 1][0]] : [0, 1];
    traces.push({x, y: x.map(() => kozenyCarman(bed.eps, bed.a_s, 150 / 36) / (d * d)), mode: 'lines', name: 'Kozeny–Carman, K = 4.17 (3D value)', line: {dash: 'dot', color: C.grey}});
    if (bed.layout === 'square') traces.push({x, y: x.map(() => gebart(bed.eps, d) / (d * d)), mode: 'lines', name: 'Gebart (square array)', line: {dash: 'dash', color: C.blue}});
  } else if (bed.walls) {
    const x = S.kHist.length ? [S.kHist[0][0], S.kHist[S.kHist.length - 1][0]] : [0, 1];
    // h^2/12 averaged over cell centres (midpoint rule) is (h^2 + 1/2)/12
    traces.push({x, y: x.map(() => ((bed.ny - 2) ** 2 + 0.5) / 12 / (d * d)), mode: 'lines', name: 'exact, (h² + ½)/12 on the lattice', line: {dash: 'dash', color: C.dark}});
  }
  Plotly.react('chart-k', traces, baseLayout('Permeability k/d² as the flow develops', {xaxis: {title: 'time step'}, yaxis: {title: 'k / d²', rangemode: 'tozero'}}), PLOT_CFG);
  const T = S.tracer;
  const dt = [];
  if (T) {
    const tau = (bed.det[1] - bed.det[0]) / T.uInt;
    ['detector 1 (x = 2d)', 'detector 2 (x = L − 2d)', 'outlet'].forEach((name, j) => {
      dt.push({x: T.t.map((t) => t / tau), y: T.c[j], mode: 'lines', name, line: {width: j === 2 ? 1 : 2, dash: j === 2 ? 'dot' : 'solid'}});
    });
  }
  Plotly.react('chart-det', dt, baseLayout('Cup-mixing tracer concentration at the detectors', {
    xaxis: {title: 'time / (Δx / u)  (interstitial passage time between detectors)'}, yaxis: {title: 'c / c_pulse'},
    annotations: T ? [] : [{text: 'Press “Inject tracer pulse” once the flow is steady', showarrow: false, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5}]}), PLOT_CFG);
}
const visible = (id) => $(id) && $(id).offsetParent !== null;

function renderRTD() {
  const R = S && S.rtd;
  if (!R || !visible('chart-E')) return;
  const T = S.tracer, m = R.b.mean;
  const th = T.t.map((t) => t / m);
  const thf = Array.from({length: 300}, (_, i) => 0.01 + i * (Math.max(...th) - 0.01) / 299);
  const Pe2 = 2 * m * m / R.b.variance, N2 = m * m / R.b.variance;
  Plotly.react('chart-E', [
    {x: th, y: R.b.E.map((e) => e * m), name: 'LBM, detector 2', line: {color: C.red, width: 3}},
    {x: thf, y: thf.map((x) => Edisp(x, Pe2)), name: `axial dispersion, Pe = ${fmt(Pe2, 3)}`, line: {dash: 'dash', color: C.blue}},
    {x: thf, y: thf.map((x) => Etanks(x, N2)), name: `tanks in series, N = ${fmt(N2, 3)}`, line: {dash: 'dot', color: C.green}},
  ], baseLayout('E(θ) at detector 2 and two models with the same variance', {xaxis: {title: 'θ = t / mean', range: [0, Math.min(3, Math.max(...th))]},
    yaxis: {title: 'E(θ)'}}), PLOT_CFG);
  const F = []; let acc = 0;
  const E = R.b.E;
  for (let i = 0; i < E.length; i++) { if (i) acc += 0.5 * (E[i] + E[i - 1]) * (T.t[i] - T.t[i - 1]); F.push(acc); }
  Plotly.react('chart-F', [{x: th, y: F, name: 'F(θ)', line: {color: C.red, width: 3}},
    {x: [1, 1], y: [0, 1], mode: 'lines', name: 'plug flow', line: {color: C.grey, dash: 'dot'}}],
  baseLayout('Cumulative distribution F(θ)', {xaxis: {title: 'θ', range: [0, Math.min(3, Math.max(...th))]}, yaxis: {title: 'F', range: [0, 1.05]}}), PLOT_CFG);
  const f = R.fit;
  const rows = [['', 'detector 1', 'detector 2', 'difference'],
    ['mean time [steps]', fmt(R.a.mean, 5), fmt(R.b.mean, 5), fmt(f.tau, 5)],
    ['variance [steps²]', fmt(R.a.variance, 4), fmt(R.b.variance, 4), fmt(f.variance, 4)],
    ['tail decay λ [steps]', R.a.lam ? fmt(R.a.lam, 3) : '–', R.b.lam ? fmt(R.b.lam, 3) : '–', '']];
  let html = '<table class="data">' + rows.map((r, i) => '<tr>' + r.map((c) => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('') + '</tr>').join('') + '</table>';
  html += `<table class="data"><tr><th>Result</th><th>value</th></tr>
    <tr><td>interstitial velocity from the moments, Δx/Δt̄</td><td>${fmt(f.u, 4)} (U<sub>s</sub>/ε = ${fmt(R.uInt, 4)})</td></tr>
    <tr><td>Péclet number Pe = uΔx/D<sub>L</sub> = 2Δt̄²/Δσ²</td><td>${fmt(f.Pe, 4)}</td></tr>
    <tr><td>tanks in series N = Δt̄²/Δσ²</td><td>${fmt(f.N, 4)}</td></tr>
    <tr><td>axial dispersion coefficient D<sub>L</sub> / D<sub>m</sub></td><td>${fmt(f.DL / R.Dm, 4)}</td></tr>
    <tr><td>particle Péclet u d / D<sub>L</sub></td><td>${fmt(f.u * bed.d / f.DL, 4)}</td></tr>`;
  if (!bed.disks.length && bed.walls) {
    const h = bed.ny - 2, U = f.u;
    const ta = R.Dm * (1 + (U * h / R.Dm) ** 2 / 210);
    html += `<tr><td>Taylor–Aris D<sub>eff</sub>/D<sub>m</sub> = 1 + Pe<sub>h</sub>²/210</td><td>${fmt(ta / R.Dm, 4)}</td></tr>`;
  }
  html += '</table>';
  $('rtd-table').innerHTML = html;
}

// ---------------------------------------------------------------- canvas editing
function onCanvasPointer(e) {
  const mode = $('edit-mode').value;
  if (mode === 'off' || !bed) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * bed.nx, y = (1 - (e.clientY - r.top) / r.height) * bed.ny;
  if (mode === 'add') {
    const dd = bed.D;
    if (bed.disks.some(([cx, cy, d]) => Math.hypot(cx - x, cy - y) < 0.5 * (d + dd) * 0.6)) return;
    bed.disks.push([x, y, dd]);
  } else {
    const i = bed.disks.findIndex(([cx, cy, d]) => {
      let dx = x - cx, dy = y - cy;
      if (dx > bed.nx / 2) dx -= bed.nx; else if (dx < -bed.nx / 2) dx += bed.nx;
      if (!bed.walls) { if (dy > bed.ny / 2) dy -= bed.ny; else if (dy < -bed.ny / 2) dy += bed.ny; }
      return dx * dx + dy * dy < (0.5 * d) ** 2;
    });
    if (i < 0) return;
    bed.disks.splice(i, 1);
  }
  finishBed(bed);
  fluidCount = null;
  sim.setSolid(bed.solid);
  if (S.tracer) { S.tracer = null; S.rtd = null; sim.resetTracer(); }
  S.converged = false; S.lastAdjustAt = S.clock;
  $('in-preset').value = 'custom';
  updateBedInfo();
}

// ---------------------------------------------------------------- sweeps (run off-screen on a second simulator)
/** March until k stops changing.  Returns {k, Us, steps, converged}. */
async function converge(s, b, nu, g, opt) {
  const window = Math.max(300, Math.round(0.6 * b.d * b.d / nu));
  const chunk = s.kind === 'gpu' ? Math.max(100, Math.min(2000, Math.round(window / 4))) : Math.max(20, Math.round(window / 8));
  let hist = [], steps = 0;
  while (steps < opt.maxSteps) {
    if (opt.cancel()) return null;
    s.step(chunk, {tracer: false});
    steps += chunk;
    if (s.kind === 'gpu') await s.finish(); else await sleep(0);
    const st = await s.stats();
    if (!st) continue;
    const Us = st.sumUx / b.nCross, k = nu * Us / g;
    if (!Number.isFinite(k)) return {k: NaN, Us: NaN, steps, converged: false, unstable: true};
    hist.push([steps, k, Us]);
    opt.progress(steps / opt.maxSteps);
    const old = hist.find((q) => q[0] >= steps - window);
    if (old && steps - old[0] >= 0.75 * window && Math.abs(k / old[1] - 1) < opt.tol) return {k, Us, steps, converged: true};
  }
  const tail = hist.slice(-4);
  return {k: tail.reduce((a, q) => a + q[1], 0) / tail.length, Us: tail.reduce((a, q) => a + q[2], 0) / tail.length, steps, converged: false};
}
let sweepCancel = false;
async function runSweep(kind) {
  if (sweepRunning) { sweepCancel = true; return; }
  const v = readInputs();
  const msg = validate(v);
  if (msg) { showErr(msg); return; }
  const btn = $(kind === 'eps' ? 'sw-eps-go' : 'sw-re-go'), other = $(kind === 'eps' ? 'sw-re-go' : 'sw-eps-go');
  const status = $(kind === 'eps' ? 'sw-eps-status' : 'sw-re-status'), bar = kind === 'eps' ? 'sw-eps-bar' : 'sw-re-bar';
  const n = bed.nx * bed.ny;
  if (backend === 'cpu' && n > 60000) { status.textContent = `Without WebGPU this would take very long on ${(n / 1e3).toFixed(0)}k cells; reduce the grid (D or the domain) first.`; return; }
  sweepRunning = true; sweepCancel = false;
  btn.textContent = 'Stop'; other.disabled = true;
  const pts = [], jammed = [], unstable = [];
  let ReCap = null;
  try {
    if (kind === 'eps') {
      const list = (v.layout === 'random' ? [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9] : [0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9])
        .filter((e) => v.layout !== 'empty');
      if (!list.length) throw new Error('choose a layout with particles');
      for (let i = 0; i < list.length; i++) {
        const b = buildBed(Object.assign({}, v, {porosity: list[i]}));
        if (pts.some((q) => Math.abs(q.eps - b.eps) < 0.005)) {        // random packing jammed: same bed again
          jammed.push(list[i]);
          continue;
        }
        status.textContent = `Bed ${i + 1} of ${list.length}: target ε = ${list[i]}, achieved ${b.eps.toFixed(3)}…`;
        const tau = 1.5, nu = viscosity(tau), U = 0.05 * nu / b.d;            // Re = 0.05: creeping flow
        const g = nu * U / kGuess(b);
        const s = createSim(b, false);
        const [wp, wm] = trtRates(tau, MAGIC[v.coll]);
        s.setParams({wp, wm, gx: g, gy: 0, det: b.det});
        const r = await converge(s, b, nu, g, {maxSteps: 60000, tol: 5e-5, cancel: () => sweepCancel,
          progress: (f) => setBar(bar, (i + f) / list.length)});
        s.destroy();
        if (!r) break;
        pts.push({eps: b.eps, kd2: r.k / (b.d * b.d), a_s_d: b.a_s * b.d, d: b.d, conv: r.converged, n: b.disks.length});
        renderEpsSweep(pts, v.layout);
      }
    } else {
      if (v.layout === 'empty') throw new Error('choose a layout with particles');
      const b = bed;
      // the lattice velocity must stay small (~0.03) and tau not too close to 1/2: Re_max = 0.03 d / nu_min
      const nuMin = 0.008, ReMax = 0.03 * b.d / nuMin;
      const list = [0.1, 0.5, 2, 5, 10, 20, 40, 70, 120].filter((r) => r <= ReMax);
      let kDarcy = null;
      ReCap = ReMax;
      for (let i = 0; i < list.length; i++) {
        // keep |u| <= ~0.04 by lowering the viscosity at high Re (TRT: k does not depend on tau)
        const nu = Math.min(viscosity(1.5), Math.max(nuMin, 0.005 * b.d / list[i]));
        const tau = 3 * nu + 0.5, U = list[i] * nu / b.d;
        let g = nu * U / (kDarcy || kGuess(b));
        if (kDarcy) g *= 1 + 0.012 * list[i] / (1 - b.eps);                 // rough inertial head start
        status.textContent = `Point ${i + 1} of ${list.length}: Re target ${list[i]}, τ = ${tau.toFixed(3)}…`;
        const s = createSim(b, false);
        const [wp, wm] = trtRates(tau, MAGIC[v.coll]);
        s.setParams({wp, wm, gx: g, gy: 0, det: b.det});
        const r = await converge(s, b, nu, g, {maxSteps: 80000, tol: 2e-4, cancel: () => sweepCancel,
          progress: (f) => setBar(bar, (i + f) / list.length)});
        s.destroy();
        if (!r) break;
        if (r.unstable) { unstable.push(list[i]); continue; }
        if (!kDarcy) kDarcy = r.k;
        const Re = r.Us * b.d / nu, ReM = Re / (1 - b.eps);
        const fric = g * b.d * b.eps ** 3 / (r.Us * r.Us * (1 - b.eps));
        pts.push({Re, ReM, fric, k: r.k, conv: r.converged, tau});
        renderReSweep(pts, b);
      }
    }
    status.textContent = sweepCancel ? 'Stopped.' : `Done: ${pts.length} points.` + (jammed.length ? ` Targets ${jammed.join(', ')}
      skipped: random addition jams at ε ≈ ${fmt(Math.min(...pts.map((q) => q.eps)), 3)} with this gap (lower the gap to pack denser).` : '')
      + (ReCap ? ` Re is limited to ${fmt(ReCap, 2)} at D = ${bed.D} cells per diameter (more cells allow higher Re).` : '')
      + (unstable.length ? ` Unstable (dropped) at Re = ${unstable.join(', ')}.` : '');
  } catch (e) {
    status.textContent = 'Sweep failed: ' + e.message;
  } finally {
    sweepRunning = false; btn.textContent = kind === 'eps' ? 'Run porosity sweep' : 'Run Reynolds sweep';
    other.disabled = false; setBar(bar, pts.length ? 1 : 0);
  }
}
function renderEpsSweep(pts, layout) {
  // least-squares Kozeny constant: k = eps^3 / (K a_s^2 (1-eps)^2)
  const Ks = pts.map((p) => p.eps ** 3 / (p.kd2 * p.a_s_d ** 2 * (1 - p.eps) ** 2));
  const Kfit = Math.exp(Ks.reduce((a, k) => a + Math.log(k), 0) / Ks.length);
  const a_s_d = pts[0].a_s_d;
  const e0 = Math.max(0.3, Math.min(...pts.map((p) => p.eps)) - 0.05), e1 = Math.min(0.97, Math.max(...pts.map((p) => p.eps)) + 0.04);
  const e = Array.from({length: 60}, (_, i) => e0 + i * (e1 - e0) / 59);
  const tr = [{x: pts.map((p) => p.eps), y: pts.map((p) => p.kd2), mode: 'markers', name: 'LBM', marker: {size: 10, color: C.red},
    text: pts.map((p) => `${p.n} particles${p.conv ? '' : ' (not fully converged)'}`)},
  {x: e, y: e.map((x) => kozenyCarman(x, a_s_d, Kfit)), mode: 'lines', name: `Kozeny–Carman, fitted K = ${fmt(Kfit, 3)}`, line: {color: C.dark}},
  {x: e, y: e.map((x) => kozenyCarman(x, a_s_d, 150 / 36)), mode: 'lines', name: 'Kozeny–Carman, K = 4.17 (Ergun, spheres)', line: {dash: 'dot', color: C.grey}}];
  if (layout === 'square') {
    const ee = e.filter((x) => x > 1 - Math.PI / 4 + 0.005);
    tr.push({x: ee, y: ee.map((x) => gebart(x, 1)), mode: 'lines', name: 'Gebart (dense square array)', line: {dash: 'dash', color: C.blue}});
    const ed = e.filter((x) => x > 0.6);
    tr.push({x: ed, y: ed.map((x) => sanganiAcrivos(x, 1)), mode: 'lines', name: 'Sangani–Acrivos (dilute)', line: {dash: 'dashdot', color: C.purple}});
  }
  Plotly.react('chart-eps', tr, baseLayout('Permeability vs porosity', {xaxis: {title: 'porosity ε'}, yaxis: {title: 'k / d²', type: 'log'}}), PLOT_CFG);
  $('sw-eps-note').innerHTML = `Least-squares (in log k) Kozeny constant over ${pts.length} beds: <b>K = ${fmt(Kfit, 3)}</b>
    (individual beds: ${Ks.map((k) => fmt(k, 3)).join(', ')}). A constant K would put every point on the black line.`;
}
function renderReSweep(pts, b) {
  // fit f = A / Re' + B by linear least squares in (1/Re', 1)
  let A = NaN, B = NaN;
  if (pts.length >= 2) {
    let sxx = 0, sx = 0, sy = 0, sxy = 0;
    // weights 1/f^2: relative errors, so the low-Re points do not dominate
    pts.forEach((p) => { const x = 1 / p.ReM, w = 1 / (p.fric * p.fric); sxx += w * x * x; sx += w * x; sy += w * p.fric; sxy += w * x * p.fric; });
    const sw = pts.reduce((a, p) => a + 1 / (p.fric * p.fric), 0);
    A = (sw * sxy - sx * sy) / (sw * sxx - sx * sx); B = (sy - A * sx) / sw;
  }
  const R = Array.from({length: 80}, (_, i) => Math.pow(10, -1.5 + i * 4 / 79));
  const tr = [{x: pts.map((p) => p.ReM), y: pts.map((p) => p.fric), mode: 'markers', name: 'LBM', marker: {size: 10, color: C.red},
    text: pts.map((p) => `τ = ${p.tau.toFixed(3)}${p.conv ? '' : ' (time-averaged, not steady)'}`)},
  {x: R, y: R.map((r) => 150 / r + 1.75), mode: 'lines', name: 'Ergun (spheres): 150/Re′ + 1.75', line: {dash: 'dot', color: C.grey}}];
  if (Number.isFinite(A)) tr.push({x: R, y: R.map((r) => A / r + B), mode: 'lines', name: `fit: ${fmt(A, 3)}/Re′ + ${fmt(B, 3)}`, line: {color: C.dark}});
  Plotly.react('chart-re', tr, baseLayout('Friction factor vs modified Reynolds number', {xaxis: {title: 'Re′ = ρUd / (μ(1−ε))', type: 'log'},
    yaxis: {title: 'f′ = (−dp/dx) d ε³ / (ρU²(1−ε))', type: 'log'}}), PLOT_CFG);
  if (Number.isFinite(A)) {
    $('sw-re-note').innerHTML = `Fitted <b>A = ${fmt(A, 3)}</b> (Ergun 150 for spheres; for disks A = 16 K, i.e. K = ${fmt(A / 16, 3)})
      and <b>B = ${fmt(B, 3)}</b> (Ergun 1.75). The viscous term dominates while Re′ ≲ 10; above that, inertia (form drag and recirculation behind the
      particles) adds the Burke–Plummer term, and the curve flattens.`;
  }
}

// ---------------------------------------------------------------- Python (Pyodide) bridge
const PY_WORKER_SRC = `
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
let py = null;
onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      postMessage({type: 'status', msg: 'Loading the Python runtime…'});
      py = await loadPyodide();
      postMessage({type: 'status', msg: 'Loading numpy…'});
      await py.loadPackage(['numpy']);
      for (const [name, src] of Object.entries(m.files)) py.FS.writeFile(name, src);
      py.globals.set('ON_CELL', (i, s) => postMessage({type: 'cell', i, s}));
      py.runPython("import sys; sys.path.insert(0, '.'); import json, time, numpy as np, lbm, runner");
      postMessage({type: 'ready', version: py.version});
    } else if (m.type === 'call') {
      py.globals.set('ARGS', py.toPy(m.args));
      const out = py.runPython(m.code);
      postMessage({type: 'result', id: m.id, json: out});
    }
  } catch (err) {
    postMessage({type: 'error', id: m.id, msg: String(err && err.message || err)});
  }
};`;
const py = {worker: null, ready: false, id: 1, waiting: new Map(), onCell: null};
const PY_STATUS = ['wt-status', 'cmp-status', 'race-status'];
const PY_BUTTONS = ['wt-live', 'cmp-go'];
function setPill(cls, text) { const p = $('py-pill'); p.className = 'pill ' + cls; p.textContent = 'Python: ' + text; }
function startPython() {
  if (py.worker) return;
  setPill('busy', 'loading…');
  PY_STATUS.forEach((id) => { $(id).textContent = 'Loading Python (Pyodide and numpy, about 15 MB)…'; });
  py.worker = new Worker(URL.createObjectURL(new Blob([PY_WORKER_SRC], {type: 'text/javascript'})));
  py.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') setPill('busy', m.msg.charAt(0).toLowerCase() + m.msg.slice(1));
    else if (m.type === 'ready') {
      py.ready = true; setPill('ready', 'ready (Pyodide ' + m.version + ')');
      PY_BUTTONS.forEach((id) => { $(id).disabled = false; });
      PY_STATUS.forEach((id) => { $(id).textContent = 'Python is ready.'; });
    } else if (m.type === 'cell') { if (py.onCell) py.onCell(m.i, JSON.parse(m.s)); }
    else if (m.type === 'result' || m.type === 'error') {
      const w = py.waiting.get(m.id); py.waiting.delete(m.id);
      if (!w) {
        if (m.type === 'error') { setPill('fail', 'failed to load'); PY_STATUS.forEach((id) => { $(id).textContent = 'Python failed to load: ' + m.msg; }); }
        return;
      }
      if (m.type === 'error') w.reject(new Error(m.msg)); else w.resolve(JSON.parse(m.json));
    }
  };
  py.worker.onerror = (e) => { setPill('fail', 'failed'); PY_STATUS.forEach((id) => { $(id).textContent = 'Python worker error: ' + (e.message || e); }); };
  py.worker.postMessage({type: 'init', files: PY_FILES});
}
function pyCall(code, args) {
  return new Promise((resolve, reject) => {
    const id = py.id++;
    py.waiting.set(id, {resolve, reject});
    py.worker.postMessage({type: 'call', id, code, args});
  });
}

// ---------------------------------------------------------------- walkthrough live run
function walkthroughInputs(v) {
  const D = Math.min(10, Math.max(5, Math.sqrt(20000 / (v.Lx * v.Ly))));
  return {Lx_d: v.Lx, Ly_d: v.Ly, D: Math.round(D * 10) / 10, porosity: v.porosity, gap_d: v.gap, spread: v.spread,
    seed: Math.round(v.seed), layout: v.layout, walls: v.walls, tau: v.tau, Pe_m: v.Pe, d_p_mm: v.dp, nu_SI: v.nuSI};
}
$('wt-live').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  const inputs = walkthroughInputs(v);
  $('wt-live').disabled = true;
  const t0 = performance.now();
  py.onCell = (i, r) => { renderCellOutput(i, r, true); $('wt-status').textContent = `Ran step ${i + 1} of ${WT_CELLS.length}…`; };
  $('wt-status').textContent = `Running in your browser with D = ${inputs.D} cells per diameter…`;
  try {
    await pyCall('runner.run_cells(json.loads(ARGS["cells"]), ARGS["inputs"], on_cell=ON_CELL); "1"', {cells: JSON.stringify(WT_CELLS), inputs});
    $('wt-status').textContent = `All ${WT_CELLS.length} steps re-ran live in ${fmt((performance.now() - t0) / 1000, 3)} s with your inputs (D = ${inputs.D}).`;
  } catch (e) { $('wt-status').textContent = 'Live run failed: ' + e.message; }
  $('wt-live').disabled = false;
});
function renderCellOutput(i, r, live) {
  const out = $('wt-out-' + i);
  if (out) {
    out.innerHTML = '';
    if (r.out) { const pre = document.createElement('pre'); pre.textContent = r.out; out.appendChild(pre); }
    if (r.error) { const pre = document.createElement('pre'); pre.className = 'err'; pre.textContent = r.error; out.appendChild(pre); }
  }
  const box = $('wt-plots-' + i);
  if (box) {
    box.innerHTML = '';
    r.figs.forEach((f) => {
      const d = document.createElement('div'); d.className = 'wt-plot'; box.appendChild(d);
      Plotly.newPlot(d, f.data, Object.assign({height: 360, margin: {l: 60, r: 60, t: 50, b: 50}}, f.layout), PLOT_CFG);
    });
  }
  const meta = $('wt-meta-' + i);
  if (meta) meta.textContent = (live ? 'Ran live in your browser' : 'Ran at build time') + ` in ${fmt(r.secs, 2)} s.`;
}
function renderCellMeta(i) {
  const meta = $('wt-meta-' + i);
  if (meta && WT_CELLS[i].secs !== undefined) meta.textContent = `Ran at build time (CPython) in ${fmt(WT_CELLS[i].secs, 2)} s.`;
}
function renderPendingPlots() {
  document.querySelectorAll('[data-wt-plot]:not([data-rendered])').forEach((el) => {
    if (el.offsetParent === null) return;
    const j = WT_PLOTS[el.getAttribute('data-wt-plot')];
    if (!j) return;
    Plotly.newPlot(el, j.data, Object.assign({height: 360, margin: {l: 60, r: 60, t: 50, b: 50}}, j.layout), PLOT_CFG);
    el.setAttribute('data-rendered', '1');
  });
}

// ---------------------------------------------------------------- GPU vs Python cross-check
const PY_COMPARE = `
a = ARGS
solid, disks = lbm.make_bed(a["nx"], a["ny"], a["porosity"], a["D"], layout=a["layout"], spread=a["spread"],
                            gap=a["gap"], seed=a["seed"], walls=a["walls"])
wp, wm = lbm.trt_rates(a["tau"], a["magic"])
f = lbm.init_flow(solid)
t = time.perf_counter()
for _ in range(a["steps"]):
    f, rho, ux, uy = lbm.flow_step(f, solid, wp, wm, a["g"])
t_flow = time.perf_counter() - t
twp, twm = lbm.tracer_rates(a["Dm"])
g = lbm.init_tracer(solid)
t = time.perf_counter()
for n in range(a["tsteps"]):
    g, c = lbm.tracer_step(g, solid, ux, uy, twp, twm, 1.0 if n < a["pulse"] else 0.0)
t_tr = time.perf_counter() - t
json.dumps(dict(solid=solid.astype(int).ravel().tolist(), ux=ux.ravel().tolist(), uy=uy.ravel().tolist(),
                c=c.ravel().tolist(), k=lbm.permeability(ux, lbm.viscosity(a["tau"]), a["g"], a["walls"]),
                mass=float(rho[~solid].mean()), t_flow=t_flow, t_tr=t_tr))
`;
$('cmp-go').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  const D = Math.min(10, Math.sqrt(12000 / (v.Lx * v.Ly)));
  const vv = Object.assign({}, v, {D});
  const b = buildBed(vv);
  const nu = viscosity(v.tau), magic = MAGIC[v.coll];
  const g = nu * (0.5 * nu / b.d) / kGuess(b);                          // Re = 0.5
  const uInt = 0.04, Dm = uInt * b.d / v.Pe;
  const args = {nx: b.nx, ny: b.ny, porosity: v.porosity, D, layout: v.layout, spread: v.spread, gap: v.gap * D,
    seed: Math.round(v.seed), walls: v.walls, tau: v.tau, magic, g, steps: 600, Dm, tsteps: 400, pulse: 20};
  $('cmp-go').disabled = true;
  $('cmp-status').textContent = `Running lbm.py in Python on a ${b.nx} × ${b.ny} grid (${args.steps} flow steps + ${args.tsteps} tracer steps)…`;
  let p;
  try { p = await pyCall(PY_COMPARE, args); } catch (e) { $('cmp-status').textContent = 'Python failed: ' + e.message; $('cmp-go').disabled = false; return; }
  const s = createSim(b, false);
  const [wp, wm] = trtRates(v.tau, magic), [twp, twm] = tracerRates(Dm);
  s.setParams({wp, wm, gx: g, gy: 0, twp, twm, cIn: 1, det: b.det});
  const t0 = performance.now();
  s.step(args.steps, {tracer: false});
  s.inject(args.pulse);
  s.step(args.tsteps, {flow: false});
  const F = await s.readFields();
  const tJs = (performance.now() - t0) / 1000;
  s.destroy();
  $('cmp-go').disabled = false;
  let same = 0, du = 0, umax = 0, dc = 0, cmax = 0, sumUx = 0;
  const diff = [];
  for (let j = 0; j < b.ny; j++) {
    const row = [];
    for (let i = 0; i < b.nx; i++) {
      const k = j * b.nx + i;
      if (p.solid[k] === b.solid[k]) same++;
      const e = Math.hypot(F[4 * k] - p.ux[k], F[4 * k + 1] - p.uy[k]);
      du = Math.max(du, e); umax = Math.max(umax, Math.hypot(p.ux[k], p.uy[k]));
      dc = Math.max(dc, Math.abs(F[4 * k + 3] - p.c[k])); cmax = Math.max(cmax, p.c[k]);
      sumUx += F[4 * k];
      row.push(b.solid[k] ? null : e);
    }
    diff.push(row);
  }
  const kGpu = nu * sumUx / b.nCross / g;
  const who = backend === 'gpu' ? 'WebGPU' : 'JavaScript (no WebGPU here)';
  $('cmp-table').innerHTML = `<table class="data"><tr><th>Check</th><th>${who}</th><th>Python (numpy, float64)</th><th>agreement</th></tr>
    <tr><td>solid mask (${b.disks.length} particles, same seed)</td><td colspan="2">${same} of ${b.nx * b.ny} cells identical</td>
      <td class="${same === b.nx * b.ny ? 'pass' : 'fail'}">${same === b.nx * b.ny ? 'identical' : 'differs'}</td></tr>
    <tr><td>permeability k/d² after ${args.steps} steps</td><td>${fmt(kGpu / (b.d * b.d), 7)}</td><td>${fmt(p.k / (b.d * b.d), 7)}</td>
      <td class="${Math.abs(kGpu / p.k - 1) < 1e-4 ? 'pass' : 'fail'}">${fmtE(Math.abs(kGpu / p.k - 1))} relative</td></tr>
    <tr><td>velocity field, max |Δu| / max |u|</td><td colspan="2">max |u| = ${fmtE(umax)}</td>
      <td class="${du / umax < 1e-4 ? 'pass' : 'fail'}">${fmtE(du / umax)}</td></tr>
    <tr><td>tracer field, max |Δc| / max c</td><td colspan="2">max c = ${fmt(cmax, 3)}</td>
      <td class="${dc / cmax < 1e-4 ? 'pass' : 'fail'}">${fmtE(dc / Math.max(cmax, 1e-30))}</td></tr>
    <tr><td>run time</td><td>${fmt(tJs, 3)} s</td><td>${fmt(p.t_flow + p.t_tr, 3)} s</td><td></td></tr></table>`;
  Plotly.react('chart-cmp', [{z: diff, type: 'heatmap', colorscale: 'Viridis', colorbar: {title: '|Δu|'}}],
    baseLayout('Difference in velocity, GPU (float32) − Python (float64)', {height: 340, xaxis: {title: 'x [cells]', constrain: 'domain'},
      yaxis: {title: 'y', scaleanchor: 'x'}}), PLOT_CFG);
  $('cmp-status').textContent = `Compared on a ${b.nx} × ${b.ny} grid (D = ${fmt(D, 3)}, Re ≈ 0.5, tracer Pe_m = ${v.Pe}).`;
});

// ---------------------------------------------------------------- performance race
$('race-go').addEventListener('click', async () => {
  if (!sim) return;
  const wasPlaying = playing; playing = false;
  $('race-go').disabled = true;
  const b = bed, cells = b.nx * b.ny, res = {};
  const bar = (f) => setBar('race-bar', f);
  try {
    // GPU (or the active backend) and the JavaScript CPU path, same bed and parameters
    const timeIt = async (s, budget) => {
      const [wp, wm] = trtRates(S.v.tau, S.magic), [twp, twm] = tracerRates(0.02);
      s.setParams({wp, wm, gx: S.g, gy: 0, twp, twm, cIn: 1, det: b.det});
      let steps = 0, chunk = s.kind === 'gpu' ? 50 : 1;
      s.step(chunk); if (s.kind === 'gpu') await s.finish();
      const t0 = performance.now();
      while (performance.now() - t0 < budget) {
        if (s.kind === 'gpu') { s.step(chunk); steps += chunk; await s.finish(); chunk = Math.min(4000, chunk * 2); }
        else {                                   // CPU: step for ~30 ms, then let the page breathe
          const t1 = performance.now();
          while (performance.now() - t1 < 30) { s.step(1); steps++; }
          await sleep(0);
        }
      }
      return steps * cells / ((performance.now() - t0) / 1000) / 1e6;
    };
    if (backend === 'gpu') {
      $('race-status').textContent = 'WebGPU…';
      const s = createSim(b, false); res.gpu = await timeIt(s, 2500); s.destroy();
    }
    bar(0.33);
    $('race-status').textContent = 'JavaScript on the CPU (one core)…';
    await frameWait();
    { const s = new CpuLbm(b.nx, b.ny, b.solid); res.cpu = await timeIt(s, 2500); }
    bar(0.66);
    if (py.ready) {
      $('race-status').textContent = 'Python (numpy, in Pyodide)…';
      const r = await pyCall(`
a = ARGS
solid = np.array(a["solid"], dtype=bool).reshape(a["ny"], a["nx"])
wp, wm = lbm.trt_rates(a["tau"])
twp, twm = lbm.tracer_rates(0.02)
f = lbm.init_flow(solid); gg = lbm.init_tracer(solid)
f, rho, ux, uy = lbm.flow_step(f, solid, wp, wm, a["g"])
n, t0 = 0, time.perf_counter()
while time.perf_counter() - t0 < 2.5:
    f, rho, ux, uy = lbm.flow_step(f, solid, wp, wm, a["g"])
    gg, c = lbm.tracer_step(gg, solid, ux, uy, twp, twm, 0.0)
    n += 1
json.dumps(dict(n=n, secs=time.perf_counter() - t0))`, {solid: Array.from(b.solid), nx: b.nx, ny: b.ny, tau: S.v.tau, g: S.g});
      res.py = r.n * cells / r.secs / 1e6;
    }
    bar(1);
    renderRace(res, cells);
    $('race-status').textContent = `Done (grid ${b.nx} × ${b.ny}, flow + tracer per step).`;
  } catch (e) { $('race-status').textContent = 'Race failed: ' + e.message; }
  $('race-go').disabled = false;
  playing = wasPlaying; setPlayLabel();
});
function renderRace(res, cells) {
  $('race-metrics').hidden = false;
  const show = (id, x) => { $(id).textContent = Number.isFinite(x) ? fmt(x, 3) + ' MLUPS' : 'n/a'; };
  show('r-gpu', res.gpu); show('r-cpu', res.cpu); show('r-py', res.py);
  $('r-gpu-sub').textContent = Number.isFinite(res.gpu) ? `${fmt(res.gpu * 1e6 / cells, 4)} steps/s on this grid` : 'WebGPU not available here';
  $('r-cpu-sub').textContent = `${fmt(res.cpu * 1e6 / cells, 3)} steps/s`;
  $('r-py-sub').textContent = Number.isFinite(res.py) ? `${fmt(res.py * 1e6 / cells, 3)} steps/s` : 'Python not loaded yet';
  const best = res.gpu || res.cpu;
  $('r-x').textContent = Number.isFinite(res.gpu) ? '×' + fmt(res.gpu / res.cpu, 3) : '–';
  $('r-x-sub').textContent = Number.isFinite(res.py) ? `×${fmt(best / res.py, 3)} vs numpy` : '';
  const names = [], vals = [];
  if (Number.isFinite(res.gpu)) { names.push('WebGPU'); vals.push(res.gpu); }
  names.push('JavaScript, 1 core'); vals.push(res.cpu);
  if (Number.isFinite(res.py)) { names.push('Python numpy (Pyodide)'); vals.push(res.py); }
  Plotly.react('chart-race', [{type: 'bar', x: names, y: vals, marker: {color: [C.red, C.blue, C.orange].slice(0, names.length)},
    text: vals.map((x) => fmt(x, 3)), textposition: 'outside'}],
  baseLayout('Million lattice updates per second (flow + tracer)', {yaxis: {type: 'log', title: 'MLUPS'}}), PLOT_CFG);
  // memory traffic per cell and step, see "Why the GPU is fast"
  const bytes = (9 + 9 + 9 + 4) * 4 + (5 + 5 + 5 + 4) * 4;
  $('race-bw').innerHTML = Number.isFinite(res.gpu) ? `At about ${bytes} bytes of memory traffic per cell and step (flow + tracer),
    ${fmt(res.gpu, 3)} MLUPS means the GPU moves roughly <b>${fmt(res.gpu * 1e6 * bytes / 1e9, 3)} GB/s</b>. LBM is limited by memory bandwidth,
    not arithmetic: compare this with your GPU's peak bandwidth.` : '';
}

// ---------------------------------------------------------------- UI wiring
function setPlayLabel() { $('btn-play').textContent = playing ? 'Pause' : 'Play'; }
document.querySelectorAll('.tabs').forEach((bar) => {
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    bar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.' + bar.dataset.panels).forEach((p) => { p.hidden = (p.id !== btn.dataset.tab); });
    setTimeout(() => {
      document.querySelectorAll('.js-plotly-plot').forEach((el) => { if (el.offsetParent !== null) Plotly.Plots.resize(el); });
      renderPendingPlots(); renderLiveCharts(); renderRTD();
    }, 30);
  });
});

async function boot() {
  try { gpuDev = await GpuLbm.device(); backend = 'gpu'; } catch (e) {
    gpuDev = null; backend = 'cpu';
    $('gpu-warn').hidden = false;
    $('gpu-warn').innerHTML = `<b>WebGPU is not available in this browser</b> (${e.message}). The page falls back to plain JavaScript on one
      CPU core, which is roughly 50–500 times slower; the grid has been reduced. WebGPU is on by default in recent Chrome, Edge and Safari,
      and in Firefox 141+ on Windows.`;
  }
  $('backend-pill').textContent = backend === 'gpu' ? 'WebGPU: ' + gpuDev.name : 'CPU fallback';
  $('backend-pill').className = 'pill ' + (backend === 'gpu' ? 'ready' : 'busy');
  if (gpuDev) gpuDev.device.lost.then((info) => { const f = $('fatal'); f.hidden = false; f.textContent = 'The GPU device was lost: ' + info.message + ' Reload the page.'; });
  setInputs(backend === 'gpu' ? BASE : Object.assign({}, BASE, {D: 10, Lx: 16, Ly: 6, tau: 0.8}));
  $('in-preset').addEventListener('change', () => {
    const p = PRESETS[$('in-preset').value];
    if (!p) return;
    setInputs(backend === 'gpu' ? p : Object.assign({}, p, {D: Math.min(p.D, 12)}));
    rebuild();
  });
  let retuneTimer = null;
  FIELDS.forEach((f) => $('in-' + f).addEventListener(f === 'walls' || f === 'auto' || $('in-' + f).tagName === 'SELECT' ? 'change' : 'input', () => {
    $('in-preset').value = 'custom';
    clearTimeout(retuneTimer);
    retuneTimer = setTimeout(() => (BED_FIELDS.has(f) ? rebuild() : retune()), 350);
  }));
  $('btn-play').addEventListener('click', () => { playing = !playing; setPlayLabel(); });
  $('btn-reset').addEventListener('click', () => rebuild(true));
  $('btn-seed').addEventListener('click', () => { $('in-seed').value = Math.round(parseFloat($('in-seed').value) || 0) + 1; $('in-preset').value = 'custom'; rebuild(); });
  $('btn-inject').addEventListener('click', injectPulse);
  $('btn-freeze').addEventListener('change', () => { if (S) S.frozen = $('btn-freeze').checked; });
  $('sw-eps-go').addEventListener('click', () => runSweep('eps'));
  $('sw-re-go').addEventListener('click', () => runSweep('re'));
  WT_CELLS.forEach((c, i) => renderCellMeta(i));
  rebuild();
  setPlayLabel();
  requestAnimationFrame(loop);
  setTimeout(startPython, 2500);
}
boot().catch((e) => { const f = $('fatal'); f.hidden = false; f.textContent = 'Could not start: ' + (e && e.message || e); console.error(e); });
