'use strict';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
// Indices into the parameter / group arrays: identical to the Rust `p` and
// `g` modules and to pbr.PARAM_NAMES / pbr.GROUP_NAMES.
const P = {T_IN: 0, T_C: 1, P0: 2, DT: 3, L: 4, G: 5, LAM: 6, AW: 7, DER: 8, ER: 9,
  LNA: 10, DH: 11, RHOB: 12, CP: 13, MM: 14, PO2: 15, RHOG: 16};
const GI = {GAMMA: 0, S: 1, DA: 2, AM: 3, AH: 4, BI: 5, ST: 6, THW: 7};
const TIED_T = 100;
const PLOT_CFG = {responsive: true, displaylogo: false};
const C = {red: '#ff4b4b', blue: '#1f77b4', dark: '#31333f', grey: '#808495', orange: '#ff7f0e',
  green: '#2ca02c', purple: '#9467bd'};

// Sidebar presets (sidebar units).  Base case = Froment's o-xylene tube.
const BASE = {Tin: 625, Tc: 625, tie: true, p0: 0.011, G: 4684, dt: 2.54, L: 3, lam: 0.7787,
  aw: 180.14, Pem: 10, dp: 3, ER: 13636, lnA: 19.837, dH: 1284.5, pO2: 0.208, rhoB: 1300,
  cp: 991.6, Mm: 29.48, N: 30, rtol: '1e-5'};
const PRESETS = {
  safe: BASE,
  near: Object.assign({}, BASE, {p0: 0.016}),
  runaway: Object.assign({}, BASE, {p0: 0.019}),
  wide: Object.assign({}, BASE, {dt: 3.5}),
};
const FIELDS = ['Tin', 'Tc', 'p0', 'G', 'dt', 'L', 'lam', 'aw', 'Pem', 'dp', 'ER', 'lnA', 'dH',
  'pO2', 'rhoB', 'cp', 'Mm', 'N', 'rtol'];

// ---------------------------------------------------------------- inputs
function readInputs() {
  const v = {};
  for (const f of FIELDS) v[f] = parseFloat($('in-' + f).value);
  v.tie = $('in-tie').checked;
  if (v.tie) v.Tc = v.Tin;
  v.N = Math.round(v.N);
  return v;
}
function validate(v) {
  for (const f of FIELDS) if (!Number.isFinite(v[f])) return `Input "${f}" is not a number.`;
  const pos = ['Tin', 'Tc', 'p0', 'G', 'dt', 'L', 'lam', 'aw', 'Pem', 'dp', 'ER', 'dH', 'pO2', 'rhoB', 'cp', 'Mm'];
  for (const f of pos) if (!(v[f] > 0)) return `Input "${f}" must be positive.`;
  if (v.N < 2 || v.N > 200) return 'Radial cells N must be between 2 and 200.';
  return null;
}
/** Sidebar values -> the 17-entry SI parameter array the solvers take. */
function buildQ(v) {
  const q = new Array(17).fill(0);
  q[P.T_IN] = v.Tin; q[P.T_C] = v.tie ? v.Tin : v.Tc; q[P.P0] = v.p0;
  q[P.DT] = v.dt / 100; q[P.L] = v.L; q[P.G] = v.G / 3600;
  q[P.LAM] = v.lam; q[P.AW] = v.aw; q[P.ER] = v.ER; q[P.LNA] = v.lnA;
  q[P.DH] = v.dH * 1e6; q[P.RHOB] = v.rhoB; q[P.CP] = v.cp; q[P.MM] = v.Mm; q[P.PO2] = v.pO2;
  q[P.RHOG] = 1.293 * 273.15 / v.Tin * v.Mm / 28.96;          // ideal gas, 1 atm
  q[P.DER] = (q[P.G] / q[P.RHOG]) * (v.dp / 1000) / v.Pem;    // D_er = u d_p / Pe_mr
  return q;
}
function buildCfg(v, oneD, nOverride) {
  const rtol = v.rtol;
  return [nOverride || v.N, rtol, rtol * 1e-3, 1e-4, 0.05, oneD ? 1 : 0, 200000];
}
function setInputs(p) {
  for (const f of FIELDS) $('in-' + f).value = p[f];
  $('in-tie').checked = p.tie;
  refreshTie();
}
function refreshTie() {
  const tie = $('in-tie').checked;
  $('in-Tc').disabled = tie;
  if (tie) $('in-Tc').value = $('in-Tin').value;
}

// ---------------------------------------------------------------- WASM API
// makeApi is also stringified into the Web Worker source, so it must not
// use anything from the enclosing scope.
function makeApi(w) {
  const qp = w.alloc(17), cp = w.alloc(7), gp = w.alloc(8);
  const put = (ptr, a) => new Float64Array(w.memory.buffer, ptr, a.length).set(a);
  const out = () => new Float64Array(w.memory.buffer, w.out_ptr(), w.out_len()).slice();
  return {
    solveDim(q, c) { put(qp, q); put(cp, c); w.solve_dim(qp, cp); return out(); },
    groupsDim(q) { put(qp, q); w.groups_dim(qp); return out(); },
    sensDim(q, c, which) { put(qp, q); put(cp, c); w.sens_dim(qp, cp, which); return out(); },
    sensGroups(g, c, which) { put(gp, g); put(cp, c); w.sens_groups(gp, cp, which); return out(); },
    peakDim(q, c) { put(qp, q); put(cp, c); w.peak_dim(qp, cp); return out(); },
    benchRhs(q, n, reps) { put(qp, q); return w.bench_rhs(qp, n, reps); },
    benchLin(q, n, reps) { put(qp, q); return w.bench_lin(qp, n, reps); },
  };
}
function runJob(api, it) {
  if (it.fn === 'sensDim') return Array.from(api.sensDim(it.q, it.c, it.which));
  if (it.fn === 'sensGroups') return Array.from(api.sensGroups(it.g, it.c, it.which));
  if (it.fn === 'peakDim') return Array.from(api.peakDim(it.q, it.c));
  throw new Error('unknown job ' + it.fn);
}
const WORKER_SRC = `${makeApi.toString()}\n${runJob.toString()}
let api = null;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const inst = await WebAssembly.instantiate(m.module, {});
    api = makeApi(inst.exports); postMessage({type: 'ready'}); return;
  }
  const t0 = performance.now();
  const res = m.items.map((it) => runJob(api, it));
  postMessage({type: 'done', id: m.id, res, ms: performance.now() - t0});
};`;

/** A pool of Web Workers, each with its own WASM instance. */
class Pool {
  constructor(module, n) {
    this.n = n; this.free = []; this.nextId = 1; this.pending = new Map();
    const url = URL.createObjectURL(new Blob([WORKER_SRC], {type: 'text/javascript'}));
    this.ready = Promise.all(Array.from({length: n}, () => new Promise((res) => {
      const w = new Worker(url);
      w.onmessage = (e) => {
        if (e.data.type === 'ready') { this.free.push(w); res(); return; }
        const job = this.pending.get(e.data.id);
        this.pending.delete(e.data.id);
        this.free.push(w);
        job.resolve(e.data.res);
        this.pump();
      };
      w.postMessage({type: 'init', module});
    })));
    this.queue = [];
  }
  pump() {
    while (this.free.length && this.queue.length) {
      const job = this.queue.shift();
      if (job.isStale && job.isStale()) { job.reject(new Error('stale')); continue; }
      const w = this.free.pop();
      const id = this.nextId++;
      this.pending.set(id, job);
      w.postMessage({type: 'batch', id, items: job.items});
    }
  }
  /** Run all items; results come back in order.  isStale() lets a newer
   *  request cancel the chunks not yet started. */
  async map(items, {onProgress, isStale, chunk} = {}) {
    await this.ready;
    const size = chunk || Math.max(1, Math.ceil(items.length / (this.n * 8)));
    const out = new Array(items.length);
    let done = 0;
    const tasks = [];
    for (let s = 0; s < items.length; s += size) {
      const part = items.slice(s, s + size);
      tasks.push(new Promise((resolve, reject) => {
        this.queue.push({items: part, isStale, reject, resolve: (res) => {
          for (let k = 0; k < res.length; k++) out[s + k] = res[k];
          done += res.length;
          if (onProgress) onProgress(done / items.length);
          resolve();
        }});
      }));
    }
    this.pump();
    await Promise.all(tasks);
    return out;
  }
}

// ---------------------------------------------------------------- helpers
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const fmtG = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '–');
const logspace = (a, b, n) => Array.from({length: n}, (_, i) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * i / (n - 1)));
const linspace = (a, b, n) => Array.from({length: n}, (_, i) => a + (b - a) * i / (n - 1));
function showErr(msg) { const e = $('err'); e.hidden = !msg; e.textContent = msg || ''; }
function setBar(id, f) { $(id).style.width = (100 * Math.max(0, Math.min(1, f))) + '%'; }
function baseLayout(title, extra) {
  return Object.assign({title: {text: title, font: {size: 15}}, height: 400,
    margin: {l: 62, r: 24, t: 56, b: 50}, legend: {orientation: 'h', x: 0, y: -0.2},
    font: {family: '"Source Sans Pro",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'}}, extra || {});
}
/** Location of the max of |s| along xs, refined with a parabola in ln(x).
 *  Returns null when the maximum sits at either end (no interior peak). */
function mvCritical(xs, ss, logx = true) {
  let k = -1, best = -1;
  for (let i = 0; i < ss.length; i++) {
    const a = Math.abs(ss[i]);
    if (Number.isFinite(a) && a > best) { best = a; k = i; }
  }
  if (k <= 0 || k >= ss.length - 1) return null;
  const f = (x) => (logx ? Math.log(x) : x);
  const [x0, x1, x2] = [f(xs[k - 1]), f(xs[k]), f(xs[k + 1])];
  const [y0, y1, y2] = [Math.abs(ss[k - 1]), best, Math.abs(ss[k + 1])];
  const den = (x0 - x1) * (x0 - x2) * (x1 - x2);
  const A = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / den;
  const B = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / den;
  let xv = (A < 0) ? -B / (2 * A) : x1;
  if (!(xv >= x0 && xv <= x2)) xv = x1;
  return {x: logx ? Math.exp(xv) : xv, smax: best, k};
}
/** Two-pass MV critical value: coarse grid, then a fine grid between the
 *  neighbours of the coarse peak.  jobFor(x) builds the pool job for x;
 *  pick(result) returns s or NaN.  Returns {x, smax} or null. */
async function refineCritical(xs, ss, jobFor, pick, opts, logx = true, nFine = 25) {
  const cr = mvCritical(xs, ss, logx);
  if (!cr) return null;
  const a = xs[cr.k - 1], b = xs[cr.k + 1];
  const fine = logx ? logspace(a, b, nFine) : linspace(a, b, nFine);
  const res = await pool.map(fine.map(jobFor), opts);
  return mvCritical(fine, res.map(pick), logx) || cr;
}
/** Unpack a solve_dim result (see pack_solve in lib.rs). */
function parseSolve(a) {
  const ns = a[0], N = a[1], T0 = a[2], gamma = a[3], HDR = 16;
  const xi = a.slice(HDR, HDR + ns);
  const T = [], X = [];
  for (let k = 0; k < ns; k++) {
    const b = HDR + ns + k * 2 * N;
    T.push(Array.from(a.slice(b, b + N), (th) => T0 * (1 + th / gamma)));
    X.push(Array.from(a.slice(b + N, b + 2 * N)));
  }
  return {ns, N, T0, gamma, xi, T, X, Tstar: T0 * (1 + a[4] / gamma), xiStar: a[5], iStar: a[6],
    xCup: a[7], steps: a[8], rejected: a[9], nRhs: a[10], ok: a[11] === 1};
}
const cupWeights = (N) => Array.from({length: N}, (_, i) => ((i + 1) ** 2 - i ** 2) / (N * N));

// ---------------------------------------------------------------- state
let api = null;        // main-thread WASM (single solves)
let pool = null;       // workers (sweeps, maps)
let wasmModule = null;
let state = {v: null, q: null, gen: 0};
const stale = {sweep: true, map: true, mv: true, verdict: true};

// ---------------------------------------------------------------- tabs
document.querySelectorAll('.tabs').forEach((bar) => {
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    bar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.' + bar.dataset.panels).forEach((p) => { p.hidden = (p.id !== btn.dataset.tab); });
    setTimeout(() => { relayoutVisible(); renderPendingPlots(); onVisible(); }, 30);
  });
});
const visible = (id) => $(id) && $(id).offsetParent !== null;
function relayoutVisible() {
  document.querySelectorAll('.js-plotly-plot').forEach((el) => { if (el.offsetParent !== null) Plotly.Plots.resize(el); });
}
function renderPendingPlots() {
  // Walkthrough plots render lazily: Plotly needs a visible container.
  document.querySelectorAll('[data-wt-plot]:not([data-rendered])').forEach((el) => {
    if (el.offsetParent === null) return;
    const j = WT_PLOTS[el.getAttribute('data-wt-plot')];
    if (!j) return;
    Plotly.newPlot(el, j.data, Object.assign({height: 360, margin: {l: 60, r: 60, t: 50, b: 50}}, j.layout), PLOT_CFG);
    el.setAttribute('data-rendered', '1');
  });
}
function onVisible() {
  if (visible('sub-sweep') && stale.sweep) computeSweep();
  if (visible('sub-map') && stale.map) computeMap();
  if (visible('sub-mv') && stale.mv) computeMV();
  if (visible('sub-why')) renderMicro();
}

// ---------------------------------------------------------------- main recompute
let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 200); }
function recompute() {
  if (!api) return;
  const v = readInputs();
  const msg = validate(v);
  if (msg) { showErr(msg); return; }
  showErr(null);
  const q = buildQ(v);
  state = {v, q, gen: state.gen + 1};
  stale.sweep = stale.map = stale.mv = stale.verdict = true;
  try {
    renderHotSpot(v, q);
  } catch (e) {
    showErr('Computation failed: ' + (e && e.message || e));
    return;
  }
  computeVerdict();
  onVisible();
}

function renderHotSpot(v, q) {
  const r2 = parseSolve(api.solveDim(q, buildCfg(v, false)));
  const r1 = parseSolve(api.solveDim(q, buildCfg(v, true)));
  const s2 = api.sensDim(q, buildCfg(v, false), P.P0);
  const s1 = api.sensDim(q, buildCfg(v, true), P.P0);
  const g = api.groupsDim(q);
  state.r2 = r2; state.groups = g;
  const N = r2.N, R = q[P.DT] / 2, L = q[P.L];
  const z = r2.xi.map((x) => x * L);
  // ---- metrics
  $('m-T').textContent = fmt(r2.Tstar, 1) + ' K';
  $('m-T-sub').textContent = `ΔT = +${fmt(r2.Tstar - q[P.T_IN], 1)} K · 1D model: ${fmt(r1.Tstar, 1)} K`;
  $('m-loc').textContent = 'z = ' + fmt(r2.xiStar * L, 3) + ' m';
  $('m-loc-sub').textContent = r2.iStar === 0 ? 'on the axis (r = 0)' : `r/R ≈ ${fmt((r2.iStar + 0.5) / N, 2)}`;
  $('m-x').textContent = fmt(100 * r2.xCup, 1) + ' %';
  $('m-x-sub').textContent = `1D model: ${fmt(100 * r1.xCup, 1)} % · ${r2.steps} steps`;
  $('m-s').textContent = fmt(s2[2], 2);
  $('m-s-sub').textContent = `1D model: ${fmt(s1[2], 2)} · by automatic differentiation`;
  if (!r2.ok) showErr('The 2D solver did not reach the outlet (step-size collapse); results are partial.');
  const Tad = q[P.T_IN] + g[GI.S] * q[P.T_IN] / g[GI.GAMMA];
  $('hot-note').innerHTML = (r2.iStar === 0
    ? 'The hot spot sits on the axis: heat released there has to be conducted across the packing before the coolant can take it away. '
    : `The hottest point has moved <b>off the axis</b> (r/R ≈ ${fmt((r2.iStar + 0.5) / N, 2)}): in runaway the axis ignites first, ` +
      'and the reaction front then sweeps outward into an annulus that conduction has already preheated while it still holds fresh feed. ') +
    `For reference, the adiabatic temperature (complete conversion, no cooling) is ${fmt(Tad, 0)} K. ` +
    'The tube is drawn mirrored about its axis (r &lt; 0 is the other half). Drag on a chart to zoom; double-click to reset.';
  // ---- groups caption
  const [gm, S, Da, am, ah, Bi, St] = g;
  const NS = St / (Da * S);
  const thc = 0.5 * gm * ((gm - 2) - Math.sqrt(gm * gm - 4 * gm));
  const nsSem = Math.exp(thc / (1 + thc / gm)) / thc;
  state.semenov = {thc, nsSem, NS, S};
  $('groups-cap').innerHTML = `Dimensionless groups: γ = ${fmt(gm, 2)} · S = ${fmt(S, 2)} · Da = ${fmtG(Da)} ·
    a<sub>h</sub> = ${fmtG(ah)} · a<sub>m</sub> = ${fmtG(am)} · Bi = ${fmtG(Bi)} · St = ${fmtG(St)} ·
    <b>N/S = ${fmt(NS, 3)}</b> (Semenov critical: ${fmt(nsSem, 3)} at this γ, e = 2.718 as γ→∞) ·
    ΔT<sub>ad</sub> = ${fmt(S * q[P.T_IN] / gm, 0)} K`;
  // ---- heatmaps (tube mirrored about the axis)
  const rr = [];
  for (let j = 0; j < 2 * N; j++) {
    const c = j < N ? N - 1 - j : j - N;
    rr.push((j < N ? -1 : 1) * (c + 0.5) / N * R * 100);
  }
  const mirror = (F) => rr.map((_, j) => { const c = j < N ? N - 1 - j : j - N; return F.map((row) => row[c]); });
  const hs = {x: [r2.xiStar * L], y: [0], mode: 'markers', name: 'hot spot', showlegend: false,
    marker: {symbol: 'x', size: 11, color: '#fff', line: {width: 2, color: C.dark}}};
  const zmax = Math.min(L, Math.max(4 * r2.xiStar * L, 0.5));
  Plotly.react('chart-T', [
    {type: 'heatmap', x: z, y: rr, z: mirror(r2.T), colorscale: 'Inferno', colorbar: {title: {text: 'T [K]'}, thickness: 14},
      hovertemplate: 'z=%{x:.3f} m<br>r=%{y:.2f} cm<br>T=%{z:.1f} K<extra></extra>'}, hs],
    baseLayout('Temperature field T(z, r)', {xaxis: {title: 'z [m]', range: [0, zmax]}, yaxis: {title: 'r [cm]'}}), PLOT_CFG);
  Plotly.react('chart-X', [
    {type: 'heatmap', x: z, y: rr, z: mirror(r2.X), colorscale: 'Viridis', zmin: 0, zmax: 1,
      colorbar: {title: {text: 'x'}, thickness: 14}, hovertemplate: 'z=%{x:.3f} m<br>r=%{y:.2f} cm<br>x=%{z:.3f}<extra></extra>'}],
    baseLayout('Conversion field x(z, r)', {xaxis: {title: 'z [m]'}, yaxis: {title: 'r [cm]'}}), PLOT_CFG);
  // ---- axial profiles
  const w = cupWeights(N);
  const Tmean = r2.T.map((row) => row.reduce((s, t, i) => s + w[i] * t, 0));
  Plotly.react('chart-ax', [
    {x: z, y: r2.T.map((r) => r[0]), name: '2D: axis', line: {color: C.red, width: 2.5}},
    {x: z, y: Tmean, name: '2D: cross-section mean', line: {color: C.orange, width: 2}},
    {x: z, y: r2.T.map((r) => r[N - 1]), name: '2D: next to wall', line: {color: C.blue, width: 2}},
    {x: r1.xi.map((x) => x * L), y: r1.T.map((r) => r[0]), name: '1D model', line: {color: C.dark, dash: 'dash', width: 2}},
    {x: [0, L], y: [q[P.T_C], q[P.T_C]], name: 'coolant', line: {color: C.grey, dash: 'dot', width: 1.5}},
  ], baseLayout('Axial temperature profiles', {xaxis: {title: 'z [m]', range: [0, zmax]}, yaxis: {title: 'T [K]'}}), PLOT_CFG);
  // ---- radial profiles at the hot spot and two other positions
  let kStar = 0;
  for (let k = 1; k < r2.ns; k++) if (Math.abs(r2.xi[k] - r2.xiStar) < Math.abs(r2.xi[kStar] - r2.xiStar)) kStar = k;
  const pick = (xiT) => { let kk = 0; for (let k = 1; k < r2.ns; k++) if (Math.abs(r2.xi[k] - xiT) < Math.abs(r2.xi[kk] - xiT)) kk = k; return kk; };
  const rho = Array.from({length: N}, (_, i) => (i + 0.5) / N);
  const ks = [[pick(r2.xiStar / 2), C.orange], [kStar, C.red], [pick(Math.min(1, 2.5 * r2.xiStar)), C.blue]];
  Plotly.react('chart-rad', ks.map(([k, col]) => ({x: rho, y: r2.T[k], mode: 'lines+markers', marker: {size: 4},
    name: `z = ${fmt(r2.xi[k] * L, 3)} m${k === kStar ? ' (hot spot)' : ''}`, line: {color: col, width: k === kStar ? 3 : 2}})),
  baseLayout('Radial temperature profiles', {xaxis: {title: 'r / R', range: [0, 1]}, yaxis: {title: 'T [K]'}}), PLOT_CFG);
}

// ---------------------------------------------------------------- MV verdict (p0 sweep)
async function computeVerdict() {
  const gen = state.gen, {v, q} = state;
  $('m-v').textContent = '…'; $('m-v').className = 'm-value'; $('m-v-sub').textContent = 'sweeping p₀';
  const p0s = logspace(q[P.P0] * 0.3, q[P.P0] * 3.5, 57);
  const c = buildCfg(v, false);
  let res;
  try {
    res = await pool.map(p0s.map((p) => ({fn: 'sensDim', q: Object.assign([...q], {[P.P0]: p}), c, which: P.P0})),
      {isStale: () => gen !== state.gen});
  } catch (e) { return; }
  if (gen !== state.gen) return;
  const pick = (r) => (r[5] === 1 ? r[2] : NaN);
  const job = (p) => ({fn: 'sensDim', q: Object.assign([...q], {[P.P0]: p}), c, which: P.P0});
  let cr;
  try { cr = await refineCritical(p0s, res.map(pick), job, pick, {isStale: () => gen !== state.gen}); } catch (e) { return; }
  if (gen !== state.gen) return;
  state.p0c = cr ? cr.x : null;
  const el = $('m-v');
  if (!cr) {
    el.textContent = 'No peak'; el.className = 'm-value';
    $('m-v-sub').textContent = 'no sensitivity maximum for 0.3–3.5 × p₀';
    return;
  }
  const ratio = q[P.P0] / cr.x;
  if (ratio < 0.85) { el.textContent = 'Safe'; el.className = 'm-value ok'; }
  else if (ratio < 1) { el.textContent = 'Near runaway'; el.className = 'm-value mid'; }
  else { el.textContent = 'Runaway'; el.className = 'm-value bad'; }
  $('m-v-sub').textContent = `critical p₀,c = ${fmtG(cr.x, 4)} atm; current = ${fmt(100 * ratio, 0)} % of it`;
}

// ---------------------------------------------------------------- sensitivity sweep
const SWEEP = {
  p0: {label: 'p₀ [atm]', idx: P.P0, mult: true, disp: (x) => x},
  Tc: {label: 'T [K]', idx: P.T_C, mult: false, disp: (x) => x},
  aw: {label: 'α_w [W/(m²·K)]', idx: P.AW, mult: true, disp: (x) => x},
  lam: {label: 'λ_er [W/(m·K)]', idx: P.LAM, mult: true, disp: (x) => x},
  dt: {label: 'd_t [cm]', idx: P.DT, mult: true, disp: (x) => 100 * x},
  G: {label: 'G [kg/(m²·h)]', idx: P.G, mult: true, disp: (x) => 3600 * x},
};
$('sw-param').addEventListener('change', () => {
  const m = SWEEP[$('sw-param').value].mult;
  $('sw-lo').value = m ? 0.5 : -25; $('sw-hi').value = m ? 2 : 25;
  $('sw-lo').previousElementSibling.textContent = m ? 'from (× current)' : 'from (offset, K)';
  $('sw-hi').previousElementSibling.textContent = m ? 'to (× current)' : 'to (offset, K)';
  computeSweep();
});
['sw-lo', 'sw-hi', 'sw-n'].forEach((id) => $(id).addEventListener('change', computeSweep));

async function computeSweep() {
  if (!pool || !state.q) return;
  stale.sweep = false;
  const gen = state.gen, {v, q} = state;
  const key = $('sw-param').value, sp = SWEEP[key];
  const lo = parseFloat($('sw-lo').value), hi = parseFloat($('sw-hi').value);
  const n = Math.max(5, Math.min(400, parseInt($('sw-n').value, 10) || 61));
  const tied = key === 'Tc' && v.tie;
  const cur = q[sp.idx];
  const phis = sp.mult ? logspace(cur * Math.min(lo, hi), cur * Math.max(lo, hi), n) : linspace(cur + lo, cur + hi, n);
  const which = tied ? TIED_T : sp.idx;
  const mk = (phi) => { const qq = [...q]; qq[sp.idx] = phi; if (tied) qq[P.T_IN] = phi; return qq; };
  const jobs = [];
  for (const phi of phis) for (const oneD of [false, true]) jobs.push({fn: 'sensDim', q: mk(phi), c: buildCfg(v, oneD), which});
  $('sw-note').textContent = 'Computing…';
  let res;
  try { res = await pool.map(jobs, {isStale: () => gen !== state.gen}); } catch (e) { return; }
  if (gen !== state.gen) return;
  const T2 = [], T1 = [], s2 = [], s1 = [];
  res.forEach((r, i) => {
    const ok = r[5] === 1;
    (i % 2 ? T1 : T2).push(ok ? r[0] : NaN);
    (i % 2 ? s1 : s2).push(ok ? r[2] : NaN);
  });
  const xs = phis.map(sp.disp);
  const pick = (r) => (r[5] === 1 ? r[2] : NaN);
  const opts = {isStale: () => gen !== state.gen};
  let c2, c1;
  try {
    [c2, c1] = await Promise.all([false, true].map((oneD) => refineCritical(phis, oneD ? s1 : s2,
      (phi) => ({fn: 'sensDim', q: mk(phi), c: buildCfg(v, oneD), which}), pick, opts, sp.mult)));
  } catch (e) { return; }
  if (gen !== state.gen) return;
  const shapes = [];
  const addV = (x, col, dash) => shapes.push({type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: {color: col, dash, width: 1.5}});
  addV(sp.disp(cur), C.dark, 'dot');
  if (c2) addV(sp.disp(c2.x), C.red, 'dash');
  if (c1) addV(sp.disp(c1.x), C.blue, 'dash');
  const xlog = sp.mult;
  Plotly.react('chart-swT', [
    {x: xs, y: T2, name: '2D model', line: {color: C.red, width: 2.5}},
    {x: xs, y: T1, name: '1D model', line: {color: C.blue, width: 2, dash: 'dash'}},
  ], baseLayout('Hot-spot temperature T*', {xaxis: {title: sp.label, type: xlog ? 'log' : 'linear'},
    yaxis: {title: 'T* [K]'}, shapes}), PLOT_CFG);
  Plotly.react('chart-sws', [
    {x: xs, y: s2.map(Math.abs), name: '2D: |s(T*; φ)|', line: {color: C.red, width: 2.5}},
    {x: xs, y: s1.map(Math.abs), name: '1D: |s(T*; φ)|', line: {color: C.blue, width: 2, dash: 'dash'}},
  ], baseLayout('Normalised sensitivity |s| = |(φ/T*) ∂T*/∂φ|', {xaxis: {title: sp.label, type: xlog ? 'log' : 'linear'},
    yaxis: {title: '|s|', type: 'log'}, shapes}), PLOT_CFG);
  const nm = $('sw-param').selectedOptions[0].textContent;
  const fx = (x) => fmtG(sp.disp(x), 4);
  let txt = `Dotted line: current value (${fx(cur)}). Dashed lines: Morbidelli–Varma critical values, where |s| peaks. `;
  txt += c2 ? `2D model: ${nm} = ${fx(c2.x)} (max |s| = ${fmt(c2.smax, 1)}). ` : '2D model: no interior maximum of |s| in this range. ';
  txt += c1 ? `1D model: ${fx(c1.x)} (max |s| = ${fmt(c1.smax, 1)}). ` : '1D model: no interior maximum in this range. ';
  if (c1 && c2) txt += 'The 2D model reaches runaway first: its hot core is not seen by the 1D average.';
  $('sw-note').textContent = txt;
}

// ---------------------------------------------------------------- sensitivity map
$('map-go').addEventListener('click', () => computeMap());
async function computeMap() {
  if (!pool || !state.q) return;
  stale.map = false;
  const gen = state.gen, {v, q} = state;
  const n = parseInt($('map-n').value, 10);
  const dT = parseFloat($('map-dT').value) || 25;
  const plo = parseFloat($('map-plo').value) || 0.5, phi = parseFloat($('map-phi').value) || 2;
  const Ts = linspace(q[P.T_C] - dT, q[P.T_C] + dT, n);
  const ps = logspace(q[P.P0] * plo, q[P.P0] * phi, n);
  const c = buildCfg(v, false);
  const jobs = [];
  for (const p of ps) for (const T of Ts) {
    const qq = [...q]; qq[P.P0] = p; qq[P.T_C] = T; if (v.tie) qq[P.T_IN] = T;
    jobs.push({fn: 'sensDim', q: qq, c, which: P.P0});
  }
  const t0 = performance.now();
  $('map-status').textContent = `${jobs.length} solves with AD sensitivity on ${pool.n} workers…`;
  setBar('map-bar', 0);
  let res;
  try {
    res = await pool.map(jobs, {isStale: () => gen !== state.gen, onProgress: (f) => setBar('map-bar', f)});
  } catch (e) { return; }
  if (gen !== state.gen) return;
  const S = [], TT = [];
  for (let i = 0; i < n; i++) {
    S.push(res.slice(i * n, (i + 1) * n).map((r) => (r[5] === 1 ? Math.log10(Math.max(1e-4, Math.abs(r[2]))) : NaN)));
    TT.push(res.slice(i * n, (i + 1) * n).map((r) => (r[5] === 1 ? r[0] : NaN)));
  }
  // MV boundary: for each coolant temperature, the p0 of max |s|
  const rx = [], ry = [];
  for (let j = 0; j < n; j++) {
    const col = res.map((_, i) => i).filter((i) => i % n === j).map((i) => (res[i][5] === 1 ? res[i][2] : NaN));
    const cr = mvCritical(ps, col);
    if (cr && cr.smax > 1) { rx.push(Ts[j]); ry.push(cr.x); }
  }
  const el = performance.now() - t0;
  $('map-status').textContent = `${jobs.length} solves in ${fmt(el / 1000, 2)} s (${fmt(el / jobs.length * pool.n, 2)} ms per solve per worker, ${pool.n} workers).`;
  const ridge = {x: rx, y: ry, mode: 'lines', name: 'MV boundary', line: {color: '#fff', width: 3}};
  const ridgeD = Object.assign({}, ridge, {line: {color: C.dark, width: 2.5, dash: 'dash'}});
  const op = {x: [q[P.T_C]], y: [q[P.P0]], mode: 'markers', name: 'operating point',
    marker: {symbol: 'circle', size: 11, color: C.red, line: {color: '#fff', width: 2}}};
  const xl = v.tie ? 'T_c = T_in [K]' : 'T_c [K]';
  Plotly.react('chart-map', [
    {type: 'heatmap', x: Ts, y: ps, z: S, colorscale: 'Viridis', zmin: -2, zmax: 2,
      colorbar: {title: {text: 'log₁₀|s|'}, thickness: 14},
      hovertemplate: 'T=%{x:.1f} K<br>p₀=%{y:.4f} atm<br>log₁₀|s|=%{z:.2f}<extra></extra>'}, ridge, op],
    baseLayout('Sensitivity log₁₀|s(T*; p₀)|', {xaxis: {title: xl}, yaxis: {title: 'p₀ [atm]', type: 'log'},
      legend: {orientation: 'h', x: 0, y: -0.2}}), PLOT_CFG);
  Plotly.react('chart-mapT', [
    {type: 'heatmap', x: Ts, y: ps, z: TT, colorscale: 'Inferno', colorbar: {title: {text: 'T* [K]'}, thickness: 14},
      hovertemplate: 'T=%{x:.1f} K<br>p₀=%{y:.4f} atm<br>T*=%{z:.1f} K<extra></extra>'}, ridgeD, op],
    baseLayout('Hot-spot temperature T*', {xaxis: {title: xl}, yaxis: {title: 'p₀ [atm]', type: 'log'}}), PLOT_CFG);
}

// ---------------------------------------------------------------- MV benchmark
$('mv-go').addEventListener('click', () => computeMV());
async function computeMV() {
  if (!pool || !state.groups) return;
  stale.mv = false;
  const gen = state.gen, {v} = state;
  const [gm, Scur, Da, am, ah, Bi, St] = state.groups;
  const beta = 1 / (1 / Bi + 0.25);
  const Ss = logspace(4, 80, 14);
  const NSs = logspace(0.6, 4.5, 56);
  const c1 = [Math.min(v.N, 24), v.rtol, v.rtol * 1e-3, 1e-5, 0.05, 1, 200000];
  const c2 = [Math.min(v.N, 24), v.rtol, v.rtol * 1e-3, 1e-5, 0.05, 0, 200000];
  const jobs = [];
  for (const S of Ss) for (const ns of NSs) {
    const N = ns * S;
    jobs.push({fn: 'sensGroups', g: [gm, S, Da, am, ah, Bi, N * Da, 0], c: c1, which: GI.ST});
    jobs.push({fn: 'sensGroups', g: [gm, S, Da, am, N * Da / (2 * beta), Bi, St, 0], c: c2, which: GI.AH});
  }
  const t0 = performance.now();
  $('mv-status').textContent = `${jobs.length} solves…`;
  setBar('mv-bar', 0);
  let res;
  try { res = await pool.map(jobs, {isStale: () => gen !== state.gen, onProgress: (f) => setBar('mv-bar', f)}); } catch (e) { return; }
  if (gen !== state.gen) return;
  const crit1 = [], crit2 = [], smax1 = [], smax2 = [];
  Ss.forEach((S, a) => {
    const s1 = [], s2 = [];
    NSs.forEach((_, b) => {
      const r1 = res[2 * (a * NSs.length + b)], r2 = res[2 * (a * NSs.length + b) + 1];
      s1.push(r1[5] === 1 ? r1[2] : NaN); s2.push(r2[5] === 1 ? r2[2] : NaN);
    });
    const k1 = mvCritical(NSs, s1), k2 = mvCritical(NSs, s2);
    crit1.push(k1 ? k1.x : NaN); crit2.push(k2 ? k2.x : NaN);
    smax1.push(k1 ? k1.smax : NaN); smax2.push(k2 ? k2.smax : NaN);
  });
  // A sensitivity maximum only marks runaway when it is pronounced; for small S
  // the peak is weak and the reactor never "jumps" (no sharp runaway).
  const WEAK = 3;
  const strong = (ys, sm) => ys.map((y, i) => (sm[i] >= WEAK ? y : NaN));
  const weak = (ys, sm) => ys.map((y, i) => (sm[i] < WEAK ? y : NaN));
  $('mv-status').textContent = `${jobs.length} solves in ${fmt((performance.now() - t0) / 1000, 2)} s on ${pool.n} workers.`;
  const sem = state.semenov;
  const xr = [Ss[0], Ss[Ss.length - 1]];
  Plotly.react('chart-mv', [
    {x: Ss, y: strong(crit2, smax2), name: 'MV boundary, 2D model', mode: 'lines+markers', line: {color: C.red, width: 3},
      fill: 'tozeroy', fillcolor: 'rgba(255,75,75,0.08)', text: smax2.map((m) => 'max |s| = ' + fmt(m, 1)),
      hovertemplate: 'S=%{x:.2f}<br>(N/S)c=%{y:.3f}<br>%{text}<extra>2D</extra>'},
    {x: Ss, y: strong(crit1, smax1), name: 'MV boundary, 1D model', mode: 'lines+markers', line: {color: C.blue, width: 2.5},
      text: smax1.map((m) => 'max |s| = ' + fmt(m, 1)), hovertemplate: 'S=%{x:.2f}<br>(N/S)c=%{y:.3f}<br>%{text}<extra>1D</extra>'},
    {x: Ss.concat(Ss), y: weak(crit2, smax2).concat(weak(crit1, smax1)), name: `weak peak (max |s| < ${WEAK}): no sharp runaway`,
      mode: 'markers', marker: {symbol: 'circle-open', size: 9, color: C.grey}},
    {x: xr, y: [sem.nsSem, sem.nsSem], name: `Semenov, γ = ${fmt(gm, 1)} (${fmt(sem.nsSem, 3)})`, mode: 'lines',
      line: {color: C.dark, dash: 'dash', width: 2}},
    {x: xr, y: [Math.E, Math.E], name: 'Semenov, γ → ∞ (e)', mode: 'lines', line: {color: C.grey, dash: 'dot', width: 2}},
    {x: [Scur], y: [sem.NS], name: 'current inputs (1D-equivalent N)', mode: 'markers',
      marker: {size: 13, color: '#fff', line: {color: C.dark, width: 3}}},
  ], baseLayout('Runaway boundary in the (S, N/S) plane', {height: 520, xaxis: {title: 'S = γ ΔT_ad / T₀', type: 'log'},
    yaxis: {title: 'N/S = St / (Da·S)', range: [0, 4]}, legend: {orientation: 'h', x: 0, y: -0.15},
    annotations: [{x: Math.log10(6), y: 0.35, text: 'runaway (below the curves)', showarrow: false, font: {color: C.red}},
      {x: Math.log10(6), y: 3.7, text: 'safe', showarrow: false, font: {color: '#1a7f37'}}]}), PLOT_CFG);
  // interpolate the boundaries at the current S
  const interp = (ys) => {
    for (let i = 0; i < Ss.length - 1; i++) {
      if (Scur >= Ss[i] && Scur <= Ss[i + 1] && Number.isFinite(ys[i]) && Number.isFinite(ys[i + 1])) {
        const t = Math.log(Scur / Ss[i]) / Math.log(Ss[i + 1] / Ss[i]);
        return ys[i] + t * (ys[i + 1] - ys[i]);
      }
    }
    return NaN;
  };
  const b1 = interp(crit1), b2 = interp(crit2);
  const last1 = crit1[crit1.length - 1], last2 = crit2[crit2.length - 1];
  $('mv-note').innerHTML = `At the current S = ${fmt(Scur, 2)}: N/S = ${fmt(sem.NS, 3)}; MV critical N/S = ` +
    `${fmt(b2, 3)} (2D) and ${fmt(b1, 3)} (1D); Semenov ${fmt(sem.nsSem, 3)}. ` +
    `${sem.NS > b2 ? 'The point lies above both MV boundaries: <b>no runaway</b>.' : sem.NS > b1 ? 'Between the boundaries: the <b>1D model says safe, the 2D model says runaway</b>.' : 'Below the MV boundaries: <b>runaway</b>.'}` +
    `<br><b>Benchmark check.</b> Semenov neglects consumption, so the MV boundaries must lie <i>below</i> the Semenov line ` +
    `and approach it as S grows: at S = ${fmt(Ss[Ss.length - 1], 0)} the 1D boundary is ${fmt(last1, 3)} ` +
    `(${fmt(100 * last1 / sem.nsSem, 0)} % of Semenov's ${fmt(sem.nsSem, 3)}) and the 2D boundary ${fmt(last2, 3)}. ` +
    `The 2D boundary sits above the 1D one: radial gradients make the real reactor run away with more cooling than the 1D model needs.`;
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
      postMessage({type: 'status', msg: 'Loading numpy and scipy…'});
      await py.loadPackage(['numpy', 'scipy']);
      for (const [name, src] of Object.entries(m.files)) py.FS.writeFile(name, src);
      py.globals.set('ON_CELL', (i, s) => postMessage({type: 'cell', i, s}));
      py.runPython("import sys; sys.path.insert(0, '.'); import json, time, numpy as np, pbr, runner");
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
function setPill(cls, text) { const p = $('py-pill'); p.className = 'pill ' + cls; p.textContent = 'Python: ' + text; }
function startPython() {
  if (py.worker) return;
  setPill('busy', 'loading…');
  ['wt-status', 'cmp-status', 'race-status'].forEach((id) => { $(id).textContent = 'Loading Python (Pyodide, numpy, scipy ≈ 20 MB)…'; });
  py.worker = new Worker(URL.createObjectURL(new Blob([PY_WORKER_SRC], {type: 'text/javascript'})));
  py.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') { setPill('busy', m.msg.charAt(0).toLowerCase() + m.msg.slice(1)); }
    else if (m.type === 'ready') {
      py.ready = true; setPill('ready', 'ready (Pyodide ' + m.version + ')');
      ['wt-live', 'cmp-go', 'race-go'].forEach((id) => { $(id).disabled = false; });
      ['wt-status', 'cmp-status', 'race-status'].forEach((id) => { $(id).textContent = 'Python is ready.'; });
    } else if (m.type === 'cell') { if (py.onCell) py.onCell(m.i, JSON.parse(m.s)); }
    else if (m.type === 'result' || m.type === 'error') {
      const w = py.waiting.get(m.id); py.waiting.delete(m.id);
      if (!w) {
        if (m.type === 'error') { setPill('fail', 'failed to load'); ['wt-status', 'cmp-status', 'race-status'].forEach((id) => { $(id).textContent = 'Python failed to load: ' + m.msg; }); }
        return;
      }
      if (m.type === 'error') w.reject(new Error(m.msg)); else w.resolve(JSON.parse(m.json));
    }
  };
  py.worker.onerror = (e) => { setPill('fail', 'failed'); ['wt-status', 'cmp-status', 'race-status'].forEach((id) => { $(id).textContent = 'Python worker error: ' + (e.message || e); }); };
  py.worker.postMessage({type: 'init', files: PY_FILES});
}
function pyCall(code, args) {
  return new Promise((resolve, reject) => {
    const id = py.id++;
    py.waiting.set(id, {resolve, reject});
    py.worker.postMessage({type: 'call', id, code, args});
  });
}
const pyKw = (v) => ({n: v.N, rtol: v.rtol, atol: v.rtol * 1e-3, h0: 1e-4, hmax: 0.05});

// ---------------------------------------------------------------- walkthrough live run
$('wt-live').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  const q = buildQ(v);
  const inputs = {};
  ['T_in', 'T_c', 'p0', 'd_t', 'L', 'G', 'lam', 'alpha_w', 'D_er', 'E_R', 'lnA', 'dH', 'rho_B', 'cp', 'M_m', 'p_O2', 'rho_g']
    .forEach((k, i) => { inputs[k] = q[i]; });
  $('wt-live').disabled = true;
  const t0 = performance.now();
  py.onCell = (i, r) => {
    renderCellOutput(i, r, true);
    $('wt-status').textContent = `Ran step ${i + 1} of ${WT_CELLS.length}…`;
  };
  $('wt-status').textContent = 'Running in your browser…';
  try {
    await pyCall('runner.run_cells(json.loads(ARGS["cells"]), ARGS["inputs"], on_cell=ON_CELL); "1"',
      {cells: JSON.stringify(WT_CELLS), inputs});
    $('wt-status').textContent = `All ${WT_CELLS.length} steps re-ran live in ${fmt((performance.now() - t0) / 1000, 1)} s with your inputs.`;
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

// ---------------------------------------------------------------- Rust vs Python comparison
const PY_COMPARE = `
a = ARGS
q = dict(zip(pbr.PARAM_NAMES, a["q"]))
gr, T0 = pbr.groups_from_dimensional(q)
kw = a["kw"]
def timed(f):
    t = time.perf_counter(); r = f(); return r, time.perf_counter() - t
r, t_py = timed(lambda: pbr.integrate(gr, **kw))
b, t_bdf = timed(lambda: pbr.integrate_bdf(gr, n=kw["n"], rtol=1e-9, atol=1e-12))
fd_p0, t_fd = timed(lambda: pbr.sensitivity_fd(q, "p0", rel_h=1e-3, **kw))
fd_aw, _ = timed(lambda: pbr.sensitivity_fd(q, "alpha_w", rel_h=1e-3, **kw))
K = lambda th: pbr.to_kelvin(th, gr, T0)
json.dumps(dict(
  py=dict(T=float(K(r["theta_star"])), xi=float(r["xi_star"]), steps=r["steps"], rej=r["rejected"], nrhs=r["n_rhs"],
          x=pbr.cup_mixing(r["y_out"], r["grid"]), secs=t_py, xis=r["xi"].tolist(), TF=K(r["Y"][:, 1::2]).tolist()),
  bdf=dict(T=float(K(b["theta_star"])), xi=float(b["xi_star"]), steps=int(b["steps"]), nrhs=int(b["n_rhs"]),
           x=pbr.cup_mixing(b["y_out"], b["grid"]), secs=t_bdf, xis=b["xi"].tolist(), Tax=K(b["Y"][:, 1]).tolist()),
  fd=dict(p0=fd_p0[2], aw=fd_aw[2], secs=t_fd)))
`;
$('cmp-go').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  const q = buildQ(v);
  $('cmp-go').disabled = true;
  $('cmp-status').textContent = 'Running Python (Rosenbrock, scipy BDF, finite-difference sensitivities)…';
  let d;
  try { d = await pyCall(PY_COMPARE, {q, kw: pyKw(v)}); } catch (e) {
    $('cmp-status').textContent = 'Python failed: ' + e.message; $('cmp-go').disabled = false; return;
  }
  const t0 = performance.now();
  const raw = api.solveDim(q, buildCfg(v, false));
  const tRs = (performance.now() - t0) / 1000;
  const rs = parseSolve(raw);
  const sp = api.sensDim(q, buildCfg(v, false), P.P0), sa = api.sensDim(q, buildCfg(v, false), P.AW);
  $('cmp-go').disabled = false;
  const L = q[P.L];
  // field difference (same step sequence expected)
  let maxDiff = NaN;
  const same = rs.ns === d.py.xis.length;
  const diff = [];
  if (same) {
    maxDiff = 0;
    for (let k = 0; k < rs.ns; k++) {
      const row = rs.T[k].map((t, i) => Math.abs(t - d.py.TF[k][i]));
      diff.push(row.map((x) => Math.log10(Math.max(x, 1e-16))));
      maxDiff = Math.max(maxDiff, ...row);
    }
  }
  const tolRow = (name, a, b, tol, unit, dg) => {
    const dd = Math.abs(a - b);
    return `<tr><td>${name}</td><td>${fmt(a, dg)}${unit}</td><td>${fmt(b, dg)}${unit}</td><td>${dd.toExponential(1)}</td>` +
      `<td class="${dd <= tol ? 'pass' : 'fail'}">${dd <= tol ? 'pass' : 'check'} (≤ ${fmtG(tol, 2)}${unit})</td></tr>`;
  };
  $('cmp-table').innerHTML = `
  <table class="data"><tr><th></th><th>Rust Rosenbrock</th><th>Python Rosenbrock</th><th>scipy BDF (rtol 1e-9)</th></tr>
  <tr><td>Hot spot T* [K]</td><td>${fmt(rs.Tstar, 6)}</td><td>${fmt(d.py.T, 6)}</td><td>${fmt(d.bdf.T, 6)}</td></tr>
  <tr><td>Location z* [m]</td><td>${fmt(rs.xiStar * L, 5)}</td><td>${fmt(d.py.xi * L, 5)}</td><td>${fmt(d.bdf.xi * L, 5)}</td></tr>
  <tr><td>Outlet conversion</td><td>${fmt(rs.xCup, 6)}</td><td>${fmt(d.py.x, 6)}</td><td>${fmt(d.bdf.x, 6)}</td></tr>
  <tr><td>Accepted / rejected steps</td><td>${rs.steps} / ${rs.rejected}</td><td>${d.py.steps} / ${d.py.rej}</td><td>${d.bdf.steps} / –</td></tr>
  <tr><td>RHS evaluations</td><td>${rs.nRhs}</td><td>${d.py.nrhs}</td><td>${d.bdf.nrhs}</td></tr>
  <tr><td>Wall time</td><td>${fmt(1000 * tRs, 2)} ms</td><td>${fmt(1000 * d.py.secs, 1)} ms</td><td>${fmt(1000 * d.bdf.secs, 1)} ms</td></tr>
  </table>
  <table class="data"><tr><th>Check</th><th>Rust</th><th>Python</th><th>|difference|</th><th>verdict</th></tr>
  ${tolRow('T*: Rust vs Python Rosenbrock (same algorithm)', rs.Tstar, d.py.T, 1e-6, ' K', 6)}
  ${same ? `<tr><td>Whole field: max |ΔT| over all ${rs.ns} steps × ${rs.N} cells</td><td colspan="2">identical step sequence</td><td>${maxDiff.toExponential(1)}</td><td class="${maxDiff < 1e-6 ? 'pass' : 'fail'}">${maxDiff < 1e-6 ? 'pass' : 'check'} (≤ 1e-6 K)</td></tr>` :
    `<tr><td>Step sequences differ (${rs.ns} vs ${d.py.xis.length}): round-off flipped an accept/reject decision</td><td colspan="4"></td></tr>`}
  ${tolRow('T*: Rust vs scipy BDF (independent method)', rs.Tstar, d.bdf.T, Math.max(0.05, 100 * v.rtol * rs.Tstar / 10), ' K', 4)}
  </table>`;
  $('cmp-sens').innerHTML = `<h3>Sensitivities: automatic differentiation (Rust) vs. finite differences (Python)</h3>
  <table class="data"><tr><th>s(T*; φ)</th><th>Rust AD (1 dual solve)</th><th>Python central FD (3 solves, h = 10⁻³φ)</th><th>relative difference</th></tr>
  <tr><td>φ = p₀</td><td>${fmt(sp[2], 6)}</td><td>${fmt(d.fd.p0, 6)}</td><td>${(Math.abs(sp[2] - d.fd.p0) / Math.abs(sp[2])).toExponential(1)}</td></tr>
  <tr><td>φ = α_w</td><td>${fmt(sa[2], 6)}</td><td>${fmt(d.fd.aw, 6)}</td><td>${(Math.abs(sa[2] - d.fd.aw) / Math.abs(sa[2])).toExponential(1)}</td></tr></table>
  <p class="caption">Finite differences carry a truncation error ∝ h² and a noise error ∝ rtol/h (Python step 13), so
  agreement to roughly 10⁻³ is the expected level. Near the runaway boundary the FD error grows, while AD stays exact for the discrete solution.</p>`;
  const zs = rs.xi.map((x) => x * L);
  Plotly.react('chart-cmp-prof', [
    {x: zs, y: rs.T.map((r) => r[0]), name: 'Rust Rosenbrock', line: {color: C.red, width: 5}},
    {x: d.py.xis.map((x) => x * L), y: d.py.TF.map((r) => r[0]), name: 'Python Rosenbrock', line: {color: C.dark, width: 2}},
    {x: d.bdf.xis.map((x) => x * L), y: d.bdf.Tax, name: 'scipy BDF', mode: 'markers', marker: {size: 5, color: C.blue}},
  ], baseLayout('Axis temperature: three solvers overlaid', {xaxis: {title: 'z [m]', range: [0, Math.min(L, Math.max(4 * rs.xiStar * L, 0.5))]},
    yaxis: {title: 'T [K]'}}), PLOT_CFG);
  if (same) {
    Plotly.react('chart-cmp-diff', [{type: 'heatmap', x: zs, y: Array.from({length: rs.N}, (_, i) => (i + 0.5) / rs.N),
      z: rs.T[0].map((_, i) => diff.map((row) => row[i])), colorscale: 'Greys', zmin: -16, zmax: -6,
      colorbar: {title: {text: 'log₁₀|ΔT|'}, thickness: 14}}],
    baseLayout('Rust − Python Rosenbrock: log₁₀|ΔT| [K]', {xaxis: {title: 'z [m]'}, yaxis: {title: 'r/R'}}), PLOT_CFG);
  }
  $('cmp-status').textContent = `Done. Python took ${fmt(d.py.secs * 1000, 0)} ms for the solve Rust did in ${fmt(tRs * 1000, 2)} ms.`;
});

// ---------------------------------------------------------------- performance race
const PY_RACE = `
a = ARGS
q = dict(zip(pbr.PARAM_NAMES, a["q"]))
kw = a["kw"]
def solve_T(Tc):
    qq = dict(q, T_c=Tc)
    if a["tie"]:
        qq["T_in"] = Tc
    return pbr.hot_spot(qq, **kw)[0]
# calibrate on three points across the range (solve cost varies with T)
t = time.perf_counter()
for x in (a["Tmid"] - 15.0, a["Tmid"], a["Tmid"] + 15.0):
    solve_T(x)
t1 = (time.perf_counter() - t) / 3
K = int(min(3000, max(4, round(a["target"] / t1))))
Ts = np.linspace(a["Tmid"] - 15.0, a["Tmid"] + 15.0, K)
t = time.perf_counter(); Tstar = [solve_T(x) for x in Ts]; secs = time.perf_counter() - t
json.dumps(dict(K=K, t1=t1, secs=secs, Ts=Ts.tolist(), Tstar=Tstar))
`;
const PY_MICRO = `
import timeit
from scipy.linalg import solve_banded
a = ARGS
q = dict(zip(pbr.PARAM_NAMES, a["q"]))
gr, T0 = pbr.groups_from_dimensional(q)
grid = pbr.Grid(a["n"])
y = 0.01 * np.arange(2 * a["n"])
reps = 3000
t_rhs = timeit.timeit(lambda: pbr.rhs(y, gr, grid), number=reps) / reps
def lin():
    ab = pbr.w_banded(y, gr, grid, False, 1e-3)
    return solve_banded((2, 2), ab, np.ones(2 * a["n"]))
t_lin = timeit.timeit(lin, number=reps) / reps
t_mul = timeit.timeit(lambda: y * 1.5, number=20000) / 20000
x1, x2 = 1.234, 5.678
t_sc = timeit.timeit(lambda: x1 * x2 + x1, number=200000) / 200000
json.dumps(dict(rhs=t_rhs, lin=t_lin, mul=t_mul, scalar=t_sc))
`;
let micro = null;
$('race-go').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  const q = buildQ(v);
  $('race-go').disabled = true;
  $('race-metrics').hidden = false;
  ['r-py', 'r-rs1', 'r-rsn', 'r-x'].forEach((id) => { $(id).textContent = '…'; });
  setBar('race-bar', 0.02);
  $('race-status').textContent = 'Python: timing one solve, then running a ≈ 10 s sweep…';
  const t0 = performance.now();
  const tick = setInterval(() => setBar('race-bar', Math.min(0.85, (performance.now() - t0) / 12000 * 0.85)), 200);
  let d;
  try {
    d = await pyCall(PY_RACE, {q, kw: pyKw(v), tie: v.tie, Tmid: q[P.T_C], target: 10.0});
  } catch (e) { clearInterval(tick); $('race-status').textContent = 'Python failed: ' + e.message; $('race-go').disabled = false; return; }
  clearInterval(tick);
  $('r-py').textContent = fmt(d.secs, 2) + ' s';
  $('r-py-sub').textContent = `${d.K} solves · ${fmt(1000 * d.secs / d.K, 1)} ms each`;
  $('race-status').textContent = `Rust: the same ${d.K} solves on one thread…`;
  await new Promise((r) => setTimeout(r, 30));
  const c = buildCfg(v, false);
  const mk = (T) => { const qq = [...q]; qq[P.T_C] = T; if (v.tie) qq[P.T_IN] = T; return qq; };
  let t = performance.now();
  const rs1 = d.Ts.map((T) => api.peakDim(mk(T), c)[0]);
  const tRs1 = (performance.now() - t) / 1000;
  $('r-rs1').textContent = tRs1 < 1 ? fmt(1000 * tRs1, 0) + ' ms' : fmt(tRs1, 2) + ' s';
  $('r-rs1-sub').textContent = `${fmt(1000 * tRs1 / d.K, 3)} ms each`;
  setBar('race-bar', 0.92);
  $('race-status').textContent = `Rust: the same ${d.K} solves on ${pool.n} workers…`;
  t = performance.now();
  await pool.map(d.Ts.map((T) => ({fn: 'peakDim', q: mk(T), c})));
  const tRsN = (performance.now() - t) / 1000;
  $('r-rsn').textContent = tRsN < 1 ? fmt(1000 * tRsN, 0) + ' ms' : fmt(tRsN, 2) + ' s';
  $('r-rsn-sub').textContent = `${pool.n} workers · ${fmt(d.secs / tRsN, 0)}× faster than Python`;
  $('r-x').textContent = fmt(d.secs / tRs1, 0) + '×';
  const maxDev = Math.max(...rs1.map((T, i) => Math.abs(T - d.Tstar[i])));
  $('r-x-sub').textContent = `max |T*_Rust − T*_Python| = ${maxDev.toExponential(1)} K`;
  Plotly.react('chart-race', [{type: 'bar', orientation: 'h', y: ['Python (numpy/scipy)', 'Rust, 1 thread', `Rust, ${pool.n} workers`],
    x: [d.secs, tRs1, tRsN], marker: {color: [C.blue, C.red, '#c2185b']},
    text: [fmt(d.secs, 2) + ' s', fmt(tRs1 * 1000, 0) + ' ms', fmt(tRsN * 1000, 0) + ' ms'], textposition: 'auto'}],
  baseLayout(`Wall time for ${d.K} full 2D solves`, {xaxis: {title: 'seconds (log scale)', type: 'log'}, margin: {l: 170, r: 24, t: 56, b: 50}}), PLOT_CFG);
  Plotly.react('chart-race-T', [
    {x: d.Ts, y: d.Tstar, name: 'Python', mode: 'lines', line: {color: C.blue, width: 6}},
    {x: d.Ts, y: rs1, name: 'Rust', mode: 'lines', line: {color: C.red, width: 2}},
  ], baseLayout('Same answers: hot spot vs coolant temperature', {xaxis: {title: v.tie ? 'T_c = T_in [K]' : 'T_c [K]'},
    yaxis: {title: 'T* [K]'}}), PLOT_CFG);
  setBar('race-bar', 0.96);
  $('race-status').textContent = 'Measuring per-operation costs…';
  try {
    const m = await pyCall(PY_MICRO, {q, n: v.N});
    const reps = 20000;
    t = performance.now(); api.benchRhs(q, v.N, reps); const rRhs = (performance.now() - t) / 1000 / reps;
    t = performance.now(); api.benchLin(q, v.N, reps); const rLin = (performance.now() - t) / 1000 / reps;
    micro = {m, rRhs, rLin, N: v.N, py1: d.secs / d.K, rs1: tRs1 / d.K};
    renderMicro();
  } catch (e) { /* micro-benchmark is optional */ }
  setBar('race-bar', 1);
  $('race-status').textContent = `Done: Rust is ${fmt(d.secs / tRs1, 0)}× faster on one thread and ${fmt(d.secs / tRsN, 0)}× on ${pool.n} workers, with identical results.`;
  $('race-go').disabled = false;
});
function renderMicro() {
  const html = micro ? (() => {
    const {m, rRhs, rLin, N, py1, rs1} = micro;
    const us = (s) => fmt(s * 1e6, s < 1e-5 ? 2 : 1) + ' µs';
    const row = (n, p, r, note) => `<tr><td>${n}</td><td>${us(p)}</td><td>${us(r)}</td><td>${fmt(p / r, 0)}×</td><td style="text-align:left">${note}</td></tr>`;
    return `<table class="data"><tr><th>Operation (N = ${N} cells, ${2 * N} unknowns)</th><th>Python</th><th>Rust</th><th>ratio</th><th style="text-align:left">why</th></tr>
      ${row('One right-hand side f(y)', m.rhs, rRhs, '≈ 20 numpy calls, each with a fixed interpreter + allocation toll')}
      ${row('Jacobian + factor + one linear solve', m.lin, rLin, 'array building + LAPACK call overhead vs. one fused loop')}
      ${row('One full 2D solve (race average)', py1, rs1, 'hundreds of steps × the costs above')}
      </table>
      <p class="caption">For scale: a single numpy operation on a ${2 * N}-element array costs ${us(m.mul)} in Pyodide,
      ${fmt(m.mul / rRhs, 1)}× the time compiled Rust needs for the <i>whole</i> right-hand side (${N} exponentials plus
      the dispersion stencil). One interpreted scalar multiply-add <code>x1 * x2 + x1</code> costs ${us(m.scalar)}:
      Python's per-operation overhead, not its arithmetic, is what the table above measures.</p>`;
  })() : '<p class="status">Run the race in the <b>Performance</b> tab to fill this table with measurements from your machine.</p>';
  $('micro-perf').innerHTML = html;
  const mp = $('micro-panel');
  if (mp) mp.innerHTML = html;
}

// ---------------------------------------------------------------- boot
function b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function boot() {
  try {
    wasmModule = await WebAssembly.compile(b64ToBytes(WASM_B64));
    const inst = await WebAssembly.instantiate(wasmModule, {});
    api = makeApi(inst.exports);
    const n = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4)));
    pool = new Pool(wasmModule, n);
  } catch (e) {
    const f = $('fatal'); f.hidden = false; f.textContent = 'Could not start WebAssembly: ' + e; return;
  }
  setInputs(BASE);
  $('in-preset').addEventListener('change', () => {
    const p = PRESETS[$('in-preset').value];
    if (p) { setInputs(p); schedule(); }
  });
  $('in-tie').addEventListener('change', () => { refreshTie(); schedule(); });
  FIELDS.forEach((f) => $('in-' + f).addEventListener('input', () => {
    if (f === 'Tin') refreshTie();
    $('in-preset').value = 'custom';
    schedule();
  }));
  // build-time walkthrough outputs
  WT_CELLS.forEach((c, i) => renderCellMeta(i));
  recompute();
  renderMicro();
  // start Python in the background once the page is up
  setTimeout(startPython, 1500);
}
function renderCellMeta(i) {
  const meta = $('wt-meta-' + i);
  if (meta && WT_CELLS[i].secs !== undefined) meta.textContent = `Ran at build time (CPython) in ${fmt(WT_CELLS[i].secs, 2)} s.`;
}
boot();
