'use strict';
const $ = (id) => document.getElementById(id);
const core = makeCore(HEN_CONST);
const PLOT_CFG = {responsive: true, displaylogo: false};
const C = {red: '#d62728', blue: '#1f77b4', dark: '#31333f', grey: '#9aa0ab', orange: '#ff7f0e', green: '#2ca02c',
  purple: '#9467bd', light: '#eceef1'};
const FONT = '"Source Sans Pro",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

// ---------------------------------------------------------------- helpers
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const fmtG = (x, d = 4) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toLocaleString('en-US') : '–');
const money = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(3) + ' M$/yr' : (x / 1e3).toFixed(1) + ' k$/yr') : '–');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
function b64bytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function showErr(msg) { const e = $('err'); e.hidden = !msg; e.textContent = msg || ''; }
function setBar(id, f) { $(id).style.width = (100 * Math.max(0, Math.min(1, f))) + '%'; }
function baseLayout(title, extra) {
  return Object.assign({title: {text: title, font: {size: 15}}, height: 380, margin: {l: 62, r: 24, t: 56, b: 50},
    legend: {orientation: 'h', x: 0, y: -0.22}, font: {family: FONT}}, extra || {});
}
const sleep0 = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- WASM API (also stringified into workers)
function makeApi(w) {
  let bufs = {};
  const buf = (key, n) => { if (!bufs[key] || bufs[key].n < n) bufs[key] = {p: w.alloc(Math.max(n, 1)), n: Math.max(n, 1)}; return bufs[key].p; };
  const put = (key, a) => { const p = buf(key, a.length); new Float64Array(w.memory.buffer, p, a.length).set(a); return p; };
  const out = () => Array.from(new Float64Array(w.memory.buffer, w.out_ptr(), w.out_len()));
  let nH = 0, nC = 0;
  function parseResult(a, at) {
    const feasible = a[at] === 1, ok = a[at + 1] === 1, tac = a[at + 2], nfev = a[at + 3], nu = a[at + 4];
    const rest = a.length - at;
    const nm = Math.round((rest - 7 - 10 * nu - nC - nH) / 4);
    let p = at + 5;
    const x = a.slice(p, p + nm); p += nm;
    const units = [];
    for (let u = 0; u < nu; u++, p += 10) {
      const v = a.slice(p, p + 10);
      units.push({type: ['match', 'cooler', 'heater'][v[0]], i: v[1], j: v[2], k: v[3], q: v[4], A: v[5], cost: v[6], op: v[7], dT1: v[8], dT2: v[9]});
    }
    const resid = a[p]; p += 1;
    const n = a[p]; const matches = [];
    for (let m = 0; m < n; m++) matches.push([a[p + 1 + 3 * m], a[p + 2 + 3 * m], a[p + 3 + 3 * m]]);
    const b = p + 1 + 3 * n;
    const net = {matches, hu: a.slice(b, b + nC), cu: a.slice(b + nC, b + nC + nH)};
    return {feasible, ok, tac, nfev, x, units, resid, net};
  }
  const netFlat = (net) => { const v = [net.matches.length]; for (const [i, j, k] of net.matches) v.push(i, j, k); return v.concat(net.hu, net.cu); };
  const api = {
    setModel(flat) { nH = flat[0]; nC = flat[1]; w.set_model(put('model', flat), flat.length); },
    optimize(net, x0, maxIter = 200) {
      const f = netFlat(net);
      w.optimize(put('net', f), f.length, put('x0', x0 || []), x0 ? x0.length : 0, maxIter);
      return parseResult(out(), 0);
    },
    evaluate(net, x) {
      const f = netFlat(net); w.evaluate_net(put('net', f), f.length, put('x', x));
      const a = out(); const units = [];
      for (let u = 0; u < a[2]; u++) { const v = a.slice(3 + 10 * u, 13 + 10 * u); units.push({type: ['match', 'cooler', 'heater'][v[0]], i: v[1], j: v[2], k: v[3], q: v[4], A: v[5], cost: v[6], op: v[7]}); }
      return {ok: a[0] === 1, tac: a[1], units};
    },
    anneal(net, iters, seed, t0, t1, maxIter = 200) {
      const f = net ? netFlat(net) : [];
      w.run_anneal(put('net', f), f.length, iters, seed >>> 0, t0, t1, maxIter);
      const a = out(); const ntr = a[3]; const trace = [];
      for (let t = 0; t < ntr; t++) trace.push([a[4 + 2 * t], a[5 + 2 * t]]);
      const best = a[0] === 1 ? parseResult(a, 4 + 2 * ntr) : null;
      return {best, evals: a[1], nfev: a[2], trace};
    },
    targets() {
      w.targets(); const a = out(); let p = 0;
      const QH = a[p++], QC = a[p++], nT = a[p++]; const T = a.slice(p, p + nT); p += nT; const casc = a.slice(p, p + nT); p += nT;
      const nh = a[p++]; const Th = a.slice(p, p + nh); p += nh; const Hh = a.slice(p, p + nh); p += nh;
      const nc = a[p++]; const Tc = a.slice(p, p + nc); p += nc; const Hc = a.slice(p, p + nc);
      return {QH, QC, T, casc, Th, Hh, Tc, Hc};
    },
    benchOptimize(net, reps) { const f = netFlat(net); return w.bench_optimize(put('net', f), f.length, reps); },
    evalBatch(net, X, n) {
      const f = netFlat(net); w.eval_batch(put('net', f), f.length, put('X', X), n);
      return new Float64Array(w.memory.buffer, w.out_ptr(), w.out_len()).slice();
    },
  };
  return api;
}
/** warm start of a modified network: keep the loads of surviving matches (as hen.warm_start). */
function warmStart(oldNet, oldX, newNet, scale) {
  const prev = new Map(oldNet.matches.map((m, k) => [m.join(','), oldX[k]]));
  return newNet.matches.map((m, k) => (prev.has(m.join(',')) ? prev.get(m.join(',')) : 1e-4 * scale[k]));
}
function loadScale(M, net) { return net.matches.map(([i, j]) => Math.min(M.Qh[i], M.Qc[j])); }
/** Greedy stage placement / utility switching (mirror of hen.improve_placement). */
function improvePlacement(api, M, net, res, passes = 10, onPass) {
  const objective = (r, ref) => (r.ok ? r.tac + ref * 10 * r.resid : Infinity);
  const ref = Number.isFinite(res.tac) ? res.tac : 1e6;
  let best = res, bestObj = objective(res, ref);
  for (let p = 0; p < passes; p++) {
    let improved = false; const cands = [];
    best.net.matches.forEach(([i, j, k], m) => {
      for (let k2 = 0; k2 < M.K; k2++) {
        if (k2 === k || best.net.matches.some((t) => t[0] === i && t[1] === j && t[2] === k2)) continue;
        const mm = best.net.matches.map((t) => t.slice()); mm[m] = [i, j, k2];
        mm.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        cands.push({matches: mm, hu: best.net.hu.slice(), cu: best.net.cu.slice()});
      }
    });
    for (let i = 0; i < M.nH; i++) for (let u = -1; u < M.cool[i].length; u++) if (u !== best.net.cu[i]) {
      const cu = best.net.cu.slice(); cu[i] = u; cands.push({matches: best.net.matches.map((t) => t.slice()), hu: best.net.hu.slice(), cu});
    }
    for (let j = 0; j < M.nC; j++) for (let u = -1; u < M.heat[j].length; u++) if (u !== best.net.hu[j]) {
      const hu = best.net.hu.slice(); hu[j] = u; cands.push({matches: best.net.matches.map((t) => t.slice()), hu, cu: best.net.cu.slice()});
    }
    for (const cand of cands) {
      const x0 = warmStart(best.net, best.x, cand, loadScale(M, cand));
      const r = api.optimize(cand, x0);
      const o = objective(r, ref);
      if (o < bestObj - 1e-9 * Math.abs(bestObj)) { best = r; bestObj = o; improved = true; }
    }
    if (onPass) onPass(p, best);
    if (!improved) break;
  }
  return best;
}
function runJob(api, it) {
  if (it.flat) api.setModel(it.flat);
  if (it.fn === 'anneal') return api.anneal(it.net, it.iters, it.seed, it.t0, it.t1);
  if (it.fn === 'optimize') return api.optimize(it.net, it.x0);
  if (it.fn === 'improve') { const r = api.optimize(it.net, it.x0); return {first: r, best: improvePlacement(api, it.M, it.net, r)}; }
  if (it.fn === 'evalbatch') {
    const t0 = performance.now(); const tac = api.evalBatch(it.net, it.X, it.n);
    return {tac, ms: performance.now() - t0};
  }
  throw new Error('unknown job ' + it.fn);
}
const WORKER_SRC = `${makeApi.toString()}\n${warmStart.toString()}\n${loadScale.toString()}\n${improvePlacement.toString()}\n${runJob.toString()}
let api = null;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') { const inst = await WebAssembly.instantiate(m.module, {}); api = makeApi(inst.exports); postMessage({type: 'ready'}); return; }
  try { const t0 = performance.now(); const res = runJob(api, m.item); postMessage({type: 'done', id: m.id, res, ms: performance.now() - t0}); }
  catch (err) { postMessage({type: 'done', id: m.id, error: String(err && err.message || err)}); }
};`;

/** A pool of Web Workers, each with its own WASM instance. */
class Pool {
  constructor(module, n) {
    this.n = n; this.free = []; this.nextId = 1; this.pending = new Map(); this.queue = []; this.all = [];
    const url = URL.createObjectURL(new Blob([WORKER_SRC], {type: 'text/javascript'}));
    this.ready = Promise.all(Array.from({length: n}, () => new Promise((res) => {
      const w = new Worker(url); this.all.push(w);
      w.onmessage = (e) => {
        if (e.data.type === 'ready') { this.free.push(w); res(); return; }
        const job = this.pending.get(e.data.id); this.pending.delete(e.data.id); this.free.push(w);
        if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(e.data.res);
        this.pump();
      };
      w.postMessage({type: 'init', module});
    })));
  }
  pump() {
    while (this.free.length && this.queue.length) {
      const job = this.queue.shift();
      if (job.isStale && job.isStale()) { job.reject(new Error('stale')); continue; }
      const w = this.free.pop(); const id = this.nextId++;
      this.pending.set(id, job); w.postMessage({type: 'job', id, item: job.item});
    }
  }
  run(item, isStale) { return this.ready.then(() => new Promise((resolve, reject) => { this.queue.push({item, resolve, reject, isStale}); this.pump(); })); }
}

// ---------------------------------------------------------------- HiGHS in a worker
const HIGHS_WORKER = `${HIGHS_SRC}
const HIGHS_FACTORY = Module;
let highs = null;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') { highs = await HIGHS_FACTORY({wasmBinary: m.wasm}); postMessage({type: 'ready'}); return; }
  try { const t0 = performance.now(); const sol = highs.solve(m.text, m.options || {});
    postMessage({type: 'done', id: m.id, sol, ms: performance.now() - t0}); }
  catch (err) { postMessage({type: 'done', id: m.id, error: String(err && err.message || err)}); }
};`;
const hs = {worker: null, ready: null, id: 1, wait: new Map()};
function startHighs() {
  hs.worker = new Worker(URL.createObjectURL(new Blob([HIGHS_WORKER], {type: 'text/javascript'})));
  hs.ready = new Promise((res) => {
    hs.worker.onmessage = (e) => {
      if (e.data.type === 'ready') { res(); return; }
      const w = hs.wait.get(e.data.id); hs.wait.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error)); else w.resolve(e.data);
    };
  });
  hs.worker.postMessage({type: 'init', wasm: b64bytes(HIGHS_WASM_B64)});
}
async function highsSolve(text, options) {
  await hs.ready;
  return new Promise((resolve, reject) => { const id = hs.id++; hs.wait.set(id, {resolve, reject}); hs.worker.postMessage({type: 'solve', id, text, options}); });
}
async function solveLP(prob, allowed) {
  const f = core.transshipLP(prob, allowed, 'lp');
  const r = await highsSolve(f.text);
  return Object.assign(core.readLP(r.sol, f, prob), {ms: r.ms});
}
async function solveMILP(prob, allowed, QH, QC, weights, timeLimit) {
  const f = core.transshipLP(prob, allowed, 'milp', QH, QC, weights);
  const r = await highsSolve(f.text, {time_limit: timeLimit, mip_rel_gap: 0});
  return Object.assign(core.readLP(r.sol, f, prob), {ms: r.ms, gap: r.sol.Info ? r.sol.Info.mip_gap : null});
}

// ---------------------------------------------------------------- state
const CASES = Object.keys(HEN_CONST.ILLUSTRATIVE).concat(Object.keys(HEN_CONST.BENCHMARKS));
const PRICE_KEYS = ['fuel', 'elec', 'hours', 'co2', 'eta_boiler', 'eta_furnace', 'steam_water', 'cw_head', 'fan', 'cycles',
  'water', 'chem', 'cop_frac', 'T_cond', 'eta_pump'];
let api = null, pool = null, wasmModule = null;
const S = {inp: null, prob: null, M: null, gen: 0, matchCfg: null, lp: null, lpFree: null, milp: null,
  grid: null, seq: null, sa: null, best: {tac: Infinity, src: ''}, saRunning: false, saStop: false};
const isBench = (c) => c in HEN_CONST.BENCHMARKS;

function initInputs() {
  const sel = $('in-case');
  const og1 = document.createElement('optgroup'); og1.label = 'Illustrative (made up, not plant data)';
  const og2 = document.createElement('optgroup'); og2.label = 'Literature benchmarks';
  for (const c of CASES) { const o = document.createElement('option'); o.value = c; o.textContent = c; (isBench(c) ? og2 : og1).appendChild(o); }
  sel.appendChild(og1); sel.appendChild(og2);
  sel.value = core.DEFAULT_CASE;
  for (const k of PRICE_KEYS) $('pr-' + k).value = HEN_CONST.DEFAULT_PRICES[k];
  $('sa-chains').value = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4)));
  onCaseChange(true);
}
function onCaseChange(first) {
  const c = $('in-case').value, bench = isBench(c);
  const base = bench ? core.benchmark(c) : core.illustrative(c, null);
  $('in-emat').value = base.emat;
  $('in-stages').value = '';
  const paperOpt = $('in-law').querySelector('option[value=paper]');
  paperOpt.disabled = !bench;
  $('in-law').value = bench ? 'paper' : 'seider';
  $('price-box').querySelector('summary small').textContent = bench ? '(benchmarks use the paper’s prices)' : '(illustrative cases)';
  S.matchCfg = {forbid: base.forbid ? base.forbid.map((r) => r.slice()) : base.hot.map(() => base.cold.map(() => false)),
    mult: base.hot.map(() => base.cold.map(() => 1.0)), material: {}};
  S.grid = null; S.seq = null; S.sa = null; S.best = {tac: Infinity, src: ''};
  $('g-sug').textContent = '–'; $('g-sug-sub').textContent = ''; $('g-load-sug').disabled = true;
  $('seq-lp').innerHTML = $('seq-mi').innerHTML = $('seq-net').innerHTML = $('seq-units').innerHTML = '';
  $('sa-net').innerHTML = $('sa-units').innerHTML = ''; $('sa-status').textContent = '';
  try { Plotly.purge('chart-sa'); } catch (e) { /* not drawn yet */ }
  $('sa-iters').value = defaultIters(base);
  if (!first) schedule();
}
function defaultIters(p) { const n = p.hot.length + p.cold.length; return n <= 5 ? 1500 : n <= 9 ? 600 : n <= 15 ? 300 : n <= 20 ? 150 : 60; }
function readInputs() {
  const num = (id) => parseFloat($(id).value);
  const prices = {};
  for (const k of PRICE_KEYS) prices[k] = num('pr-' + k);
  const st = parseInt($('in-stages').value, 10);
  const inp = {case: $('in-case').value, emat: num('in-emat'), stages: Number.isFinite(st) && st > 0 ? st : null, prices,
    law: {kind: $('in-law').value, cepci: num('in-cepci'), rate: num('in-rate') / 100, years: num('in-years'),
      type: $('in-type').value, tube_ft: parseInt($('in-tube').value, 10), p_psig: num('in-psig'), p_barg: num('in-barg')},
    forbid: S.matchCfg.forbid, mult: S.matchCfg.mult, material: S.matchCfg.material};
  return inp;
}
function validate(inp) {
  if (!(inp.emat > 0)) return 'EMAT must be positive.';
  if (!(inp.law.cepci > 0) || !(inp.law.years >= 1) || !(inp.law.rate >= 0)) return 'Check CEPCI, interest rate and life.';
  for (const k of PRICE_KEYS) if (!Number.isFinite(inp.prices[k])) return `Utility price input "${k}" is not a number.`;
  if (inp.prices.cycles <= 1) return 'Cycles of concentration must exceed 1.';
  for (const r of inp.mult) for (const v of r) if (!(v > 0)) return 'Penalty factors must be positive.';
  return null;
}

// ---------------------------------------------------------------- tabs
document.querySelectorAll('.tabs').forEach((bar) => {
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]'); if (!btn) return;
    bar.querySelectorAll('button').forEach((b) => b.classList.remove('active')); btn.classList.add('active');
    document.querySelectorAll('.' + bar.dataset.panels).forEach((p) => { p.hidden = (p.id !== btn.dataset.tab); });
    setTimeout(() => { relayoutVisible(); renderPendingPlots(); onVisible(); }, 30);
  });
});
const visible = (id) => $(id) && $(id).offsetParent !== null;
function relayoutVisible() { document.querySelectorAll('.js-plotly-plot').forEach((el) => { if (el.offsetParent !== null) Plotly.Plots.resize(el); }); }
function renderPendingPlots() {
  document.querySelectorAll('[data-wt-plot]:not([data-rendered])').forEach((el) => {
    if (el.offsetParent === null) return;
    const j = WT_PLOTS[el.getAttribute('data-wt-plot')]; if (!j) return;
    Plotly.newPlot(el, j.data, Object.assign({height: 360, margin: {l: 60, r: 30, t: 50, b: 50}, font: {family: FONT}}, j.layout), PLOT_CFG);
    el.setAttribute('data-rendered', '1');
  });
}
function onVisible() {
  if (visible('sub-seq') && !S.seq) runSequential();
  if (visible('sub-grid') && S.grid) drawGrid();
}

// ---------------------------------------------------------------- recompute
let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 250); }
function recompute() {
  if (!api) return;
  const inp = readInputs(); const msg = validate(inp);
  if (msg) { showErr(msg); return; }
  showErr(null);
  let prob, M;
  try { prob = core.problemFromInputs(inp); M = core.compileModel(prob); } catch (e) { showErr(e.message); return; }
  S.inp = inp; S.prob = prob; S.M = M; S.gen++;
  $('annual-out').textContent = `${fmt(core.capitalRecoveryFactor(inp.law.rate, inp.law.years), 4)} /yr`;
  $('case-note').textContent = isBench(inp.case) ? 'Literature benchmark: data and costs as published (see Benchmarks).' : 'Illustrative case: made-up data that show the effects, not plant data.';
  $('case-desc').textContent = prob.description || '';
  api.setModel(M.flat);
  renderTables(); renderMatchMatrix(); drawTargets();
  S.seq = null; S.sa = null;
  S.best = {tac: Infinity, src: ''};
  updateBest();
  runTargetsLP(S.gen);
  if (!S.grid || S.grid.nH !== M.nH || S.grid.nC !== M.nC || S.grid.K !== M.K) S.grid = {net: emptyNet(M), x: [], res: null, nH: M.nH, nC: M.nC, K: M.K, sel: null};
  gridOptimize(false);
  if (visible('sub-seq')) runSequential();
}
function emptyNet(M) { return {matches: [], hu: M.heat.map((h) => (h.length ? 0 : -1)), cu: M.cool.map((c) => (c.length ? 0 : -1))}; }
function updateBest(tac, src) {
  if (Number.isFinite(tac) && tac < S.best.tac) S.best = {tac, src};
  $('m-tac').textContent = money(S.best.tac);
  $('m-tac-sub').textContent = S.best.src ? 'from: ' + S.best.src : 'run step 3, the grid or the optimizer';
}

// ---------------------------------------------------------------- tables
function renderTables() {
  const p = S.prob, M = S.M;
  const mats = (s) => (s.mat ? s.mat.join(', ') : 'any');
  let h = '<table class="data"><tr><th>Stream</th><th>T<sub>in</sub> [&deg;C]</th><th>T<sub>out</sub> [&deg;C]</th><th>F [kW/K]</th><th>h [kW/(m&sup2;K)]</th><th>Q [kW]</th><th class="l">materials</th></tr>';
  p.hot.forEach((s, i) => { h += `<tr><td style="color:${C.red}">${esc(s.name)}</td><td>${s.Tin}</td><td>${s.Tout}</td><td>${s.F}</td><td>${s.h}</td><td>${fmtG(M.Qh[i], 5)}</td><td class="l">${mats(s)}</td></tr>`; });
  p.cold.forEach((s, j) => { h += `<tr><td style="color:${C.blue}">${esc(s.name)}</td><td>${s.Tin}</td><td>${s.Tout}</td><td>${s.F}</td><td>${s.h}</td><td>${fmtG(M.Qc[j], 5)}</td><td class="l">${mats(s)}</td></tr>`; });
  $('tbl-streams').innerHTML = h + '</table>';
  const pr = Object.assign({}, HEN_CONST.DEFAULT_PRICES, S.inp.prices);
  let u = '<table class="data"><tr><th>Utility</th><th>T<sub>in</sub> [&deg;C]</th><th>T<sub>out</sub> [&deg;C]</th><th>h</th><th>price [$/(kW yr)]</th><th class="l">how the price is obtained</th></tr>';
  for (const x of p.hu.concat(p.cu)) {
    const how = x.kind ? core.utilityPrice(x.kind, x.Tin, x.Tout, pr)[1] : 'as published';
    u += `<tr><td>${esc(x.name)}</td><td>${x.Tin}</td><td>${x.Tout}</td><td>${x.h}</td><td>${fmt(x.cost, 2)}</td><td class="l">${esc(how)}</td></tr>`;
  }
  $('tbl-utils').innerHTML = u + '</table>';
}
function renderMatchMatrix() {
  const p = S.prob, M = S.M, cfg = S.matchCfg, kind = {power: 0, seider: 1, turton: 2}[p.law.kind];
  let h = '<table class="data mm"><tr><th></th>' + p.cold.map((c) => `<th class="l" style="color:${C.blue}">${esc(c.name.split(' ')[0])}</th>`).join('') + '</tr>';
  p.hot.forEach((hsx, i) => {
    h += `<tr><td style="color:${C.red}"><b>${esc(hsx.name.split(' ')[0])}</b></td>`;
    p.cold.forEach((csx, j) => {
      const pairs = core.materialPairs(hsx.mat || HEN_CONST.MATERIALS, csx.mat || HEN_CONST.MATERIALS, kind);
      const key = `${i},${j}`, forb = cfg.forbid[i][j];
      const cur = forb ? 'forbid' : (key in cfg.material ? cfg.material[key].join('/') : 'auto');
      let opts = `<option value="auto">auto${M.pair[i][j] && !forb && !(key in cfg.material) ? ' (' + M.pair[i][j].join('/') + ')' : ''}</option>`;
      for (const pr of pairs) opts += `<option value="${pr.join('/')}">${pr.join('/')}</option>`;
      opts += '<option value="forbid">forbidden</option>';
      const why = M.allowed[i][j] ? '' : `<div class="m-sub">${esc(M.reason[i][j])}</div>`;
      h += `<td class="${M.allowed[i][j] ? '' : 'forb'}"><select data-mm="${key}">${opts.replace(`value="${cur}"`, `value="${cur}" selected`)}</select>
        &times;<input data-mult="${key}" type="number" step="0.1" min="0.1" value="${cfg.mult[i][j]}">${why}</td>`;
    });
    h += '</tr>';
  });
  $('tbl-matches').innerHTML = h + '</table>';
  $('tbl-matches').querySelectorAll('select[data-mm]').forEach((el) => el.addEventListener('change', () => {
    const [i, j] = el.dataset.mm.split(',').map(Number), key = el.dataset.mm;
    cfg.forbid[i][j] = el.value === 'forbid';
    delete cfg.material[key];
    if (el.value !== 'forbid' && el.value !== 'auto') cfg.material[key] = el.value.split('/');
    S.grid = null; schedule();
  }));
  $('tbl-matches').querySelectorAll('input[data-mult]').forEach((el) => el.addEventListener('change', () => {
    const [i, j] = el.dataset.mult.split(',').map(Number); cfg.mult[i][j] = parseFloat(el.value); schedule();
  }));
}
$('mm-reset').addEventListener('click', () => { onCaseChange(false); });

// ---------------------------------------------------------------- targets (Rust) and LP (HiGHS)
function drawTargets() {
  const t = api.targets(), dT = S.prob.emat;
  Plotly.react('chart-cc', [
    {x: t.Hh, y: t.Th, name: 'hot composite', mode: 'lines', line: {color: C.red, width: 2.5}},
    {x: t.Hc.map((h) => h + t.QC), y: t.Tc, name: 'cold composite (shifted by Q<sub>C,min</sub>)', mode: 'lines', line: {color: C.blue, width: 2.5}},
  ], baseLayout('Composite curves (Rust)', {xaxis: {title: 'H [kW]'}, yaxis: {title: 'T [°C]'}}), PLOT_CFG);
  Plotly.react('chart-gcc', [{x: t.casc, y: t.T.map((T) => T - dT / 2), mode: 'lines', line: {color: C.purple, width: 2.5}, name: 'grand composite'}],
    baseLayout('Grand composite curve (problem table, Rust)', {xaxis: {title: 'net heat flow [kW]'}, yaxis: {title: 'shifted T [°C] (hot − EMAT/2)'}, showlegend: false}), PLOT_CFG);
  S.pt = t;
}
async function runTargetsLP(gen) {
  const p = S.prob, M = S.M;
  $('m-lp').textContent = '…'; $('m-pen').textContent = '…'; $('m-mi').textContent = '…';
  try {
    const free = M.allowed.map((r) => r.map(() => true));
    const [lp, lf] = await Promise.all([solveLP(p, M.allowed), solveLP(p, free)]);
    if (gen !== S.gen) return;
    S.lp = lp; S.lpFree = lf;
    if (lp.status !== 'Optimal') { $('m-lp').textContent = 'infeasible'; $('m-lp-sub').textContent = lp.status; $('m-pen').textContent = '–'; return; }
    $('m-lp').textContent = money(lp.objective);
    $('m-lp-sub').textContent = `QH ${fmtG(lp.QH.reduce((a, b) => a + b, 0), 5)} kW, QC ${fmtG(lp.QC.reduce((a, b) => a + b, 0), 5)} kW (HiGHS, ${fmt(lp.ms, 0)} ms)`;
    const pen = lp.objective - lf.objective;
    $('m-pen').textContent = money(pen);
    $('m-pen-sub').textContent = Math.abs(pen) < 1e-6 * (1 + lf.objective) ? 'the forbidden / incompatible pairs cost no energy here' : `unrestricted target ${money(lf.objective)}`;
    $('targets-note').innerHTML = `Problem table (no restrictions): Q<sub>H,min</sub> = ${fmtG(S.pt.QH, 5)} kW, Q<sub>C,min</sub> = ${fmtG(S.pt.QC, 5)} kW.
      The LP with the restrictions (forbidden and material-incompatible pairs removed) needs ${fmtG(lp.QH.reduce((a, b) => a + b, 0), 5)} kW of hot utility.`;
    const mi = await solveMILP(p, M.allowed, lp.QH, lp.QC, null, 10);
    if (gen !== S.gen) return;
    S.milpCard = mi;
    $('m-mi').textContent = mi.status === 'Optimal' ? String(mi.matches.length) : (mi.matches.length ? '≤ ' + mi.matches.length : '–');
    $('m-mi-sub').textContent = mi.status === 'Optimal' ? 'units incl. utilities (proven optimal)' : `best found in 10 s (${mi.status})`;
  } catch (e) { if (gen === S.gen) { $('m-lp').textContent = 'error'; $('m-lp-sub').textContent = e.message; } }
}

// ---------------------------------------------------------------- network drawing (SVG)
function streamTemps(M, prob, net, x) {
  const K = M.K, th = prob.hot.map((s) => { const a = new Array(K + 1).fill(s.Tin); return a; });
  const tc = prob.cold.map((s) => new Array(K + 1).fill(s.Tin));
  const dh = prob.hot.map(() => new Array(K).fill(0)), dc = prob.cold.map(() => new Array(K).fill(0));
  net.matches.forEach(([i, j, k], m) => { dh[i][k] += x[m] || 0; dc[j][k] += x[m] || 0; });
  prob.hot.forEach((s, i) => { for (let k = 0; k < K; k++) th[i][k + 1] = th[i][k] - dh[i][k] / s.F; });
  prob.cold.forEach((s, j) => { tc[j][K] = s.Tin; for (let k = K - 1; k >= 0; k--) tc[j][k] = tc[j][k + 1] + dc[j][k] / s.F; });
  return {th, tc};
}
function drawNet(box, prob, M, net, res, opt = {}) {
  const K = M.K, nH = M.nH, nC = M.nC;
  const left = 150, stageW = Math.max(110, 34 * Math.max(1, ...Array.from({length: K}, (_, k) => net.matches.filter((m) => m[2] === k).length + 1)));
  const W = left + K * stageW + 120, rowH = 30, top = 40, gap = 26;
  const yH = (i) => top + i * rowH, yC = (j) => top + nH * rowH + gap + j * rowH;
  const H = yC(nC - 1) + 50;
  const x = res ? res.x : net.matches.map(() => 0);
  const T = streamTemps(M, prob, net, x);
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}' font-size="11">`;
  for (let k = 0; k < K; k++) {
    const x0 = left + k * stageW;
    s += `<rect x="${x0}" y="${top - 26}" width="${stageW}" height="${H - top}" fill="${k % 2 ? '#fafbfc' : '#fff'}"/>`;
    s += `<text x="${x0 + stageW / 2}" y="${top - 14}" text-anchor="middle" fill="${C.grey}">stage ${k + 1}</text>`;
  }
  const sel = opt.sel;
  const hotSel = sel ? sel.i : -1;
  prob.hot.forEach((h, i) => {
    const y = yH(i);
    s += `<text x="4" y="${y + 4}" fill="${C.red}">${esc(h.name.split(' ')[0])} ${h.Tin}&rarr;${h.Tout}</text>`;
    s += `<line x1="${left - 10}" y1="${y}" x2="${left + K * stageW + 40}" y2="${y}" stroke="${C.red}" stroke-width="3"/>`;
    s += `<polygon points="${left + K * stageW + 40},${y - 5} ${left + K * stageW + 50},${y} ${left + K * stageW + 40},${y + 5}" fill="${C.red}"/>`;
    for (let k = 0; k < K; k++) {
      const x0 = left + k * stageW, active = sel && sel.i === i && sel.k === k;
      if (opt.interactive) s += `<line class="seg" data-seg="h,${i},${k}" x1="${x0 + 4}" y1="${y}" x2="${x0 + stageW - 4}" y2="${y}" stroke="${active ? C.orange : 'transparent'}" stroke-width="${active ? 8 : 12}" stroke-opacity="${active ? 0.6 : 0}"/>`;
      if (k > 0 && res) s += `<text x="${x0}" y="${y - 5}" text-anchor="middle" fill="${C.grey}" font-size="9">${fmt(T.th[i][k], 0)}</text>`;
    }
    const cu = net.cu[i], cx = left + K * stageW + 20;
    if (M.cool[i].length || cu >= 0) {
      const on = cu >= 0, ut = on ? prob.cu[M.cool[i][cu].u] : null;
      const uq = res ? res.units.find((u) => u.type === 'cooler' && u.i === i) : null;
      s += `<circle class="match" data-util="c,${i}" cx="${cx}" cy="${y}" r="8" fill="${on ? C.blue : '#fff'}" stroke="${C.blue}" stroke-width="2"><title>${on ? esc(ut.name) : 'no cooler'} (click to change)</title></circle>`;
      s += `<text x="${cx}" y="${y + 4}" text-anchor="middle" fill="${on ? '#fff' : C.blue}" font-size="9" pointer-events="none">C</text>`;
      if (uq && uq.q > 1e-6) s += `<text x="${cx + 12}" y="${y - 6}" fill="${C.dark}" font-size="9">${fmt(uq.q, 0)}</text>`;
    }
  });
  prob.cold.forEach((c, j) => {
    const y = yC(j);
    let grey = false;
    if (hotSel >= 0) grey = !M.allowed[hotSel][j];
    const col = grey ? C.grey : C.blue;
    s += `<text x="4" y="${y + 4}" fill="${col}">${esc(c.name.split(' ')[0])} ${c.Tout}&larr;${c.Tin}</text>`;
    s += `<line x1="${left - 30}" y1="${y}" x2="${left + K * stageW + 10}" y2="${y}" stroke="${col}" stroke-width="3" ${grey ? 'stroke-dasharray="5,4"' : ''}/>`;
    s += `<polygon points="${left - 30},${y - 5} ${left - 40},${y} ${left - 30},${y + 5}" fill="${col}"/>`;
    for (let k = 0; k < K; k++) {
      const x0 = left + k * stageW;
      if (opt.interactive && !grey) s += `<line class="seg" data-seg="c,${j},${k}" x1="${x0 + 4}" y1="${y}" x2="${x0 + stageW - 4}" y2="${y}" stroke="transparent" stroke-width="12"/>`;
      if (grey && opt.interactive) s += `<title>${esc(M.reason[hotSel][j])}</title>`;
      if (k > 0 && res) s += `<text x="${x0}" y="${y + 13}" text-anchor="middle" fill="${C.grey}" font-size="9">${fmt(T.tc[j][k], 0)}</text>`;
    }
    const hu = net.hu[j], cx = left - 20;
    if (M.heat[j].length || hu >= 0) {
      const on = hu >= 0, ut = on ? prob.hu[M.heat[j][hu].u] : null;
      const uq = res ? res.units.find((u) => u.type === 'heater' && u.j === j) : null;
      s += `<circle class="match" data-util="h,${j}" cx="${cx}" cy="${y}" r="8" fill="${on ? C.red : '#fff'}" stroke="${C.red}" stroke-width="2"><title>${on ? esc(ut.name) : 'no heater'} (click to change)</title></circle>`;
      s += `<text x="${cx}" y="${y + 4}" text-anchor="middle" fill="${on ? '#fff' : C.red}" font-size="9" pointer-events="none">H</text>`;
      if (uq && uq.q > 1e-6) s += `<text x="${cx - 12}" y="${y - 8}" text-anchor="end" fill="${C.dark}" font-size="9">${fmt(uq.q, 0)}</text>`;
    }
  });
  const slots = {};
  net.matches.forEach(([i, j, k], m) => {
    const n = net.matches.filter((t) => t[2] === k).length;
    slots[k] = (slots[k] || 0) + 1;
    const xm = left + k * stageW + slots[k] * stageW / (n + 1);
    const u = res ? res.units.find((v) => v.type === 'match' && v.i === i && v.j === j && v.k === k) : null;
    const tiny = res && (!u || u.q < 1e-3 * Math.min(M.Qh[i], M.Qc[j]));
    const col = tiny ? C.grey : C.dark;
    s += `<g class="match" data-match="${m}"><title>H${i + 1}–C${j + 1}, stage ${k + 1}${u ? `: ${fmt(u.q, 1)} kW, ${fmt(u.A, 1)} m²` : ''} (click to remove)</title>`;
    s += `<line x1="${xm}" y1="${yH(i)}" x2="${xm}" y2="${yC(j)}" stroke="${col}" stroke-width="2"/>`;
    s += `<circle cx="${xm}" cy="${yH(i)}" r="6" fill="#fff" stroke="${col}" stroke-width="2"/><circle cx="${xm}" cy="${yC(j)}" r="6" fill="#fff" stroke="${col}" stroke-width="2"/>`;
    if (u) s += `<text x="${xm + 4}" y="${(yH(i) + yC(j)) / 2}" fill="${C.dark}" font-size="9">${fmt(u.q, 0)}</text><text x="${xm + 4}" y="${(yH(i) + yC(j)) / 2 + 10}" fill="${C.grey}" font-size="9">${fmt(u.A, 1)} m²</text>`;
    s += '</g>';
  });
  s += '</svg>';
  box.innerHTML = s;
  if (opt.interactive) {
    box.querySelectorAll('[data-seg]').forEach((el) => el.addEventListener('click', () => opt.onSeg(...el.dataset.seg.split(','))));
    box.querySelectorAll('[data-match]').forEach((el) => el.addEventListener('click', () => opt.onMatch(+el.dataset.match)));
    box.querySelectorAll('[data-util]').forEach((el) => el.addEventListener('click', () => opt.onUtil(...el.dataset.util.split(','))));
  }
}
function unitsTable(prob, M, res) {
  if (!res) return '';
  const name = (u) => (u.type === 'match' ? `${prob.hot[u.i].name.split(' ')[0]} – ${prob.cold[u.j].name.split(' ')[0]} (stage ${u.k + 1})`
    : u.type === 'cooler' ? `cooler on ${prob.hot[u.i].name.split(' ')[0]}: ${prob.cu[u.j].name}` : `heater on ${prob.cold[u.j].name.split(' ')[0]}: ${prob.hu[u.i].name}`);
  const mat = (u) => {
    if (u.type === 'match') return M.pair[u.i][u.j] ? M.pair[u.i][u.j].join('/') : '';
    const o = u.type === 'cooler' ? M.cool[u.i].find((v) => v.u === u.j) : M.heat[u.j].find((v) => v.u === u.i);
    return o && o.pair ? o.pair.join('/') : '';
  };
  let cap = 0, op = 0, area = 0;
  let h = '<table class="data"><tr><th>Unit</th><th>load [kW]</th><th>area [m&sup2;]</th><th>&Delta;T ends [K]</th><th class="l">shell/tube</th><th>capital [$/yr]</th><th>utility [$/yr]</th></tr>';
  for (const u of res.units) {
    if (u.type !== 'match' && u.q < 1e-6) continue;
    cap += u.cost; op += u.op; area += u.A;
    h += `<tr><td>${esc(name(u))}</td><td>${fmt(u.q, 1)}</td><td>${fmt(u.A, 2)}</td><td>${fmt(u.dT1, 1)} / ${fmt(u.dT2, 1)}</td><td class="l">${mat(u)}</td><td>${fmtG(u.cost, 5)}</td><td>${u.op ? fmtG(u.op, 5) : ''}</td></tr>`;
  }
  h += `<tr><th>Total</th><th></th><th>${fmt(area, 1)}</th><th></th><th></th><th>${fmtG(cap, 6)}</th><th>${fmtG(op, 6)}</th></tr></table>`;
  h += `<p class="caption">TAC = ${fmtG(res.tac, 7)} $/yr${res.feasible ? '' : ' — <b>does not meet every target</b> (a stream without utility misses its target temperature)'}.
    Units with zero load still pay their fixed cost when switched on.</p>`;
  return h;
}

// ---------------------------------------------------------------- grid diagram
function gridOptimize(redraw = true) {
  const g = S.grid, M = S.M;
  const x0 = g.res ? warmStart(g.res.net, g.res.x, g.net, loadScale(M, g.net)) : null;
  const t0 = performance.now();
  g.res = api.optimize(g.net, x0);
  g.ms = performance.now() - t0;
  if (g.res.feasible) updateBest(g.res.tac, 'your grid');
  showGridStats();
  if (redraw || visible('sub-grid')) drawGrid();
}
function showGridStats() {
  const r = S.grid.res;
  if (!r) return;
  const cap = r.units.reduce((a, u) => a + u.cost, 0), op = r.units.reduce((a, u) => a + u.op, 0);
  $('g-tac').textContent = money(r.tac);
  $('g-tac-sub').textContent = `${r.feasible ? 'meets every target' : 'misses a target (switch a utility on)'} · NLP ${fmt(S.grid.ms, 0)} ms`;
  $('g-split').textContent = `${fmt(100 * cap / r.tac, 0)} % / ${fmt(100 * op / r.tac, 0)} %`;
  $('g-split-sub').textContent = `${money(cap)} capital, ${money(op)} utilities`;
}
function drawGrid() {
  const g = S.grid, M = S.M;
  drawNet($('g-net'), S.prob, M, g.net, g.res, {interactive: true, sel: g.sel,
    onSeg: (side, a, k) => {
      a = +a; k = +k;
      if (side === 'h') { g.sel = (g.sel && g.sel.i === a && g.sel.k === k) ? null : {i: a, k}; drawGrid(); $('g-status').textContent = g.sel ? `Selected ${S.prob.hot[a].name.split(' ')[0]} in stage ${k + 1}: now click a cold stream in that stage.` : ''; return; }
      if (!g.sel) { $('g-status').textContent = 'Click a hot stream first.'; return; }
      if (g.sel.k !== k) { $('g-status').textContent = `Pick the cold stream in stage ${g.sel.k + 1}.`; return; }
      const i = g.sel.i, j = a;
      if (!M.allowed[i][j]) { $('g-status').textContent = `Not allowed: ${M.reason[i][j]}.`; return; }
      if (g.net.matches.some((t) => t[0] === i && t[1] === j && t[2] === k)) { $('g-status').textContent = 'That match is already there.'; return; }
      g.net.matches.push([i, j, k]); g.net.matches.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
      g.sel = null; $('g-status').textContent = '';
      gridOptimize();
    },
    onMatch: (m) => { g.net.matches.splice(m, 1); gridOptimize(); },
    onUtil: (side, a) => {
      a = +a;
      if (side === 'c') { const n = M.cool[a].length; g.net.cu[a] = g.net.cu[a] + 1 >= n ? -1 : g.net.cu[a] + 1; }
      else { const n = M.heat[a].length; g.net.hu[a] = g.net.hu[a] + 1 >= n ? -1 : g.net.hu[a] + 1; }
      gridOptimize();
    }});
  $('g-units').innerHTML = unitsTable(S.prob, M, g.res);
}
$('g-clear').addEventListener('click', () => { S.grid = {net: emptyNet(S.M), x: [], res: null, nH: S.M.nH, nC: S.M.nC, K: S.M.K, sel: null}; gridOptimize(); });
function loadIntoGrid(net) {
  const M = S.M;
  if (net.matches.some((m) => m[2] >= M.K)) { showErr('That network has more stages than the current setting; set Stages K accordingly.'); return false; }
  S.grid = {net: {matches: net.matches.map((t) => t.slice()), hu: net.hu.slice(), cu: net.cu.slice()}, x: [], res: null, nH: M.nH, nC: M.nC, K: M.K, sel: null};
  gridOptimize(); return true;
}
$('g-suggest').addEventListener('click', async () => {
  $('g-status').textContent = 'Running the optimizer (see the Optimizer tab for its settings)…';
  await runSA();
  if (S.sa && S.sa.best) {
    $('g-sug').textContent = money(S.sa.best.tac); $('g-sug-sub').textContent = `${S.sa.best.units.filter((u) => u.type === 'match').length} process matches`;
    $('g-load-sug').disabled = false; $('g-status').textContent = 'Suggestion ready.';
  }
});
$('g-load-sug').addEventListener('click', () => { if (S.sa && S.sa.best) loadIntoGrid(S.sa.best.net); });

// ---------------------------------------------------------------- sequential synthesis
async function runSequential() {
  if (!S.prob) return;
  const gen = S.gen, p = S.prob, M = S.M;
  S.seq = {running: true};
  $('seq-status').textContent = 'Step 1: LP…'; $('seq-go').disabled = true; $('seq-to-grid').disabled = true;
  try {
    const lp = await solveLP(p, M.allowed);
    if (gen !== S.gen) return;
    if (lp.status !== 'Optimal') { $('seq-lp').innerHTML = `<p class="err">LP: ${esc(lp.status)}</p>`; $('seq-status').textContent = ''; return; }
    const uname = (k, side) => esc((side === 'h' ? p.hu : p.cu)[k].name);
    $('seq-lp').innerHTML = `<p>Minimum utility cost <b>${money(lp.objective)}</b> with the restrictions (HiGHS, ${fmt(lp.ms, 0)} ms):
      ${lp.QH.map((q, k) => `${uname(k, 'h')} ${fmtG(q, 5)} kW`).join(', ')}; ${lp.QC.map((q, k) => `${uname(k, 'c')} ${fmtG(q, 5)} kW`).join(', ')}.</p>`;
    $('seq-status').textContent = 'Step 2: MILP…';
    let weights = null;
    if ($('mi-weight').value === 'cost') {
      weights = {};
      M.allowed.forEach((r, i) => r.forEach((ok, j) => { if (ok) weights[`${i},${j}`] = core.unitCost(M.kind[i][j], M.par[i][j], 100)[0] / core.unitCost(M.kind[i][j], core.lawParams(p.law, ['CS', 'CS'], 1)[1], 100)[0]; }));
    }
    const tl = Math.max(1, parseFloat($('mi-time').value) || 20);
    const mi = await solveMILP(p, M.allowed, lp.QH, lp.QC, weights, tl);
    if (gen !== S.gen) return;
    if (!mi.matches.length) { $('seq-mi').innerHTML = `<p class="err">MILP: ${esc(mi.status)}</p>`; $('seq-status').textContent = ''; return; }
    const nh = (a) => (a < M.nH ? p.hot[a].name.split(' ')[0] : p.hu[a - M.nH].name), nc = (b) => (b < M.nC ? p.cold[b].name.split(' ')[0] : p.cu[b - M.nC].name);
    $('seq-mi').innerHTML = `<p><b>${mi.matches.length} matches</b> (${mi.status === 'Optimal' ? 'proven optimal' : esc(mi.status) + ', best found'}, ${fmt(mi.ms / 1000, 1)} s):</p>
      <table class="data"><tr><th class="l">hot</th><th class="l">cold</th><th>load [kW]</th><th>mean T [&deg;C]</th></tr>${mi.matches.slice().sort((a, b) => b.Tmean - a.Tmean)
      .map((m) => `<tr><td class="l">${esc(nh(m.hot))}</td><td class="l">${esc(nc(m.cold))}</td><td>${fmt(m.load, 1)}</td><td>${fmt(m.Tmean, 1)}</td></tr>`).join('')}</table>`;
    $('seq-status').textContent = 'Step 3: NLP and stage placement (Rust, in a worker)…';
    const sq = core.networkFromMatches(p, mi);
    const M2 = {K: sq.model.K, nH: sq.model.nH, nC: sq.model.nC, Qh: sq.model.Qh, Qc: sq.model.Qc,
      cool: sq.model.cool.map((c) => c.map(() => 0)), heat: sq.model.heat.map((c) => c.map(() => 0))};
    const t0 = performance.now();
    const r = await pool.run({fn: 'improve', flat: sq.model.flat, net: sq.net, x0: sq.x0, M: M2});
    if (gen !== S.gen) return;
    S.seq = {model: sq.model, prob: sq.prob, res: r.best, first: r.first};
    drawNet($('seq-net'), sq.prob, sq.model, r.best.net, r.best, {});
    $('seq-units').innerHTML = `<p>NLP at the MILP topology: TAC ${money(r.first.tac)}${r.first.feasible ? '' : ' (misses a target)'}; after stage placement: <b>${money(r.best.tac)}</b>
      (${fmt((performance.now() - t0) / 1000, 1)} s, ${sq.model.K} stages).</p>` + unitsTable(sq.prob, sq.model, r.best);
    if (r.best.feasible) updateBest(r.best.tac, 'sequential (step 3)');
    $('seq-to-grid').disabled = false;
    $('seq-status').textContent = 'Done.';
  } catch (e) { $('seq-status').textContent = 'Failed: ' + e.message; }
  finally { $('seq-go').disabled = false; }
}
$('seq-go').addEventListener('click', runSequential);
$('seq-to-grid').addEventListener('click', () => {
  if (!S.seq || !S.seq.res) return;
  const net = S.seq.res.net, K = S.seq.model.K;      // recompute() clears S.seq
  $('in-stages').value = K; recompute();
  if (loadIntoGrid(net)) document.querySelector('[data-tab="sub-grid"]').click();
});

// ---------------------------------------------------------------- optimizer (SA in workers)
async function runSA() {
  if (S.saRunning) return;
  const gen = S.gen, M = S.M;
  const chains = Math.max(1, Math.min(32, parseInt($('sa-chains').value, 10) || 4));
  const iters = Math.max(10, parseInt($('sa-iters').value, 10) || 300);
  const epochs = Math.max(1, Math.min(50, parseInt($('sa-epochs').value, 10) || 4));
  const seed0 = parseInt($('sa-seed').value, 10) || 1;
  S.saRunning = true; S.saStop = false; $('sa-go').disabled = true; $('sa-stop').disabled = false; $('g-suggest').disabled = true;
  if (!pool || pool.n < chains) { pool = new Pool(wasmModule, chains); }
  const traces = Array.from({length: chains}, (_, c) => ({x: [], y: [], mode: 'lines', line: {shape: 'hv', width: 1.2}, name: `chain ${c + 1}`, opacity: 0.7}));
  const bestTrace = {x: [], y: [], mode: 'lines+markers', line: {shape: 'hv', color: C.dark, width: 2.5}, name: 'best so far'};
  let best = null, moves = 0;
  const t0 = performance.now();
  setBar('sa-bar', 0);
  try {
    for (let ep = 0; ep < epochs && !S.saStop; ep++) {
      $('sa-status').textContent = `Epoch ${ep + 1}/${epochs}: ${chains} chains × ${iters} moves…`;
      const start = best ? best.net : null;
      const jobs = Array.from({length: chains}, (_, c) => pool.run({fn: 'anneal', flat: M.flat, net: start, iters, seed: seed0 + c + 1000 * ep,
        t0: ep === 0 ? 0.05 : 0.01, t1: 1e-4}, () => gen !== S.gen || S.saStop));
      const res = await Promise.allSettled(jobs);
      if (gen !== S.gen) return;
      res.forEach((r, c) => {
        if (r.status !== 'fulfilled' || !r.value.best) return;
        for (const [it, tac] of r.value.trace) { traces[c].x.push(moves + it); traces[c].y.push(tac); }
        if (!best || r.value.best.tac < best.tac) best = r.value.best;
      });
      moves += iters;
      if (best) { bestTrace.x.push(moves); bestTrace.y.push(best.tac); }
      setBar('sa-bar', (ep + 1) / epochs);
      Plotly.react('chart-sa', traces.concat([bestTrace]), baseLayout('Annealing: best TAC of each chain', {xaxis: {title: 'SA moves (per chain)'}, yaxis: {title: 'TAC [$/yr]'}}), PLOT_CFG);
      if (best) {
        S.sa = {best};
        drawNet($('sa-net'), S.prob, M, best.net, best, {});
        $('sa-units').innerHTML = unitsTable(S.prob, M, best);
        updateBest(best.tac, 'optimizer');
      }
    }
    $('sa-status').textContent = best ? `Best TAC ${money(best.tac)} after ${epochs} epochs × ${chains} chains × ${iters} moves in ${fmt((performance.now() - t0) / 1000, 1)} s.` : 'No feasible network found.';
    $('sa-to-grid').disabled = !best;
  } catch (e) { $('sa-status').textContent = 'Failed: ' + e.message; }
  finally { S.saRunning = false; $('sa-go').disabled = false; $('sa-stop').disabled = true; $('g-suggest').disabled = false; }
}
$('sa-go').addEventListener('click', runSA);
$('sa-stop').addEventListener('click', () => { S.saStop = true; $('sa-status').textContent = 'Stopping after the current epoch…'; });
$('sa-to-grid').addEventListener('click', () => { if (S.sa && loadIntoGrid(S.sa.best.net)) document.querySelector('[data-tab="sub-grid"]').click(); });

// ---------------------------------------------------------------- inputs → recompute
document.querySelectorAll('.sidebar input, .sidebar select').forEach((el) => {
  if (el.id === 'in-case') return;
  el.addEventListener('change', () => { if (el.id === 'in-stages') S.grid = null; schedule(); });
});
$('in-case').addEventListener('change', () => onCaseChange(false));

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
      py.runPython("import sys; sys.path.insert(0, '.'); import json, time, hen, runner");
      postMessage({type: 'ready', version: py.version});
    } else if (m.type === 'call') {
      py.globals.set('ARGS', py.toPy(m.args));
      const out = py.runPython(m.code);
      postMessage({type: 'result', id: m.id, json: out});
    }
  } catch (err) { postMessage({type: 'error', id: m.id, msg: String(err && err.message || err)}); }
};`;
const py = {worker: null, ready: false, id: 1, waiting: new Map(), onCell: null};
const PY_STATUS = ['wt-status', 'cmp-status', 'race-status'], PY_BTNS = ['wt-live', 'cmp-go', 'race-go'];
function setPill(cls, text) { const p = $('py-pill'); p.className = 'pill ' + cls; p.textContent = 'Python: ' + text; }
function startPython() {
  if (py.worker) return;
  setPill('busy', 'loading…');
  PY_STATUS.forEach((id) => { $(id).textContent = 'Loading Python (Pyodide, numpy, scipy ≈ 20 MB)…'; });
  py.worker = new Worker(URL.createObjectURL(new Blob([PY_WORKER_SRC], {type: 'text/javascript'})));
  py.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') setPill('busy', m.msg.charAt(0).toLowerCase() + m.msg.slice(1));
    else if (m.type === 'ready') {
      py.ready = true; setPill('ready', 'ready (Pyodide ' + m.version + ')');
      PY_BTNS.forEach((id) => { $(id).disabled = false; }); PY_STATUS.forEach((id) => { $(id).textContent = 'Python is ready.'; });
    } else if (m.type === 'cell') { if (py.onCell) py.onCell(m.i, JSON.parse(m.s)); }
    else if (m.type === 'result' || m.type === 'error') {
      const w = py.waiting.get(m.id); py.waiting.delete(m.id);
      if (!w) { if (m.type === 'error') { setPill('fail', 'failed to load'); PY_STATUS.forEach((id) => { $(id).textContent = 'Python failed to load: ' + m.msg; }); } return; }
      if (m.type === 'error') w.reject(new Error(m.msg)); else w.resolve(JSON.parse(m.json));
    }
  };
  py.worker.postMessage({type: 'init', files: PY_FILES});
}
function pyCall(code, args) {
  return new Promise((resolve, reject) => { const id = py.id++; py.waiting.set(id, {resolve, reject}); py.worker.postMessage({type: 'call', id, code, args}); });
}
const pyInputs = () => JSON.parse(JSON.stringify(S.inp));

// ---------------------------------------------------------------- walkthrough live run
$('wt-live').addEventListener('click', async () => {
  if (!S.inp) return;
  $('wt-live').disabled = true;
  const t0 = performance.now();
  py.onCell = (i, r) => { renderCellOutput(i, r, true); $('wt-status').textContent = `Ran step ${i + 1} of ${WT_CELLS.length}…`; };
  $('wt-status').textContent = 'Running in your browser…';
  try {
    await pyCall('runner.run_cells(json.loads(ARGS["cells"]), json.loads(ARGS["inputs"]), on_cell=ON_CELL); "1"',
      {cells: JSON.stringify(WT_CELLS), inputs: JSON.stringify(pyInputs())});
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
    r.figs.forEach((f) => { const d = document.createElement('div'); d.className = 'wt-plot'; box.appendChild(d);
      Plotly.newPlot(d, f.data, Object.assign({height: 360, margin: {l: 60, r: 30, t: 50, b: 50}, font: {family: FONT}}, f.layout), PLOT_CFG); });
  }
  const meta = $('wt-meta-' + i);
  if (meta) meta.textContent = (live ? 'Ran live in your browser' : 'Ran at build time') + ` in ${fmt(r.secs, 2)} s.`;
}

// ---------------------------------------------------------------- Rust vs Python
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const verdict = (ok) => `<td class="${ok ? 'pass' : 'fail'}">${ok ? 'agree' : 'differ'}</td>`;
$('cmp-go').addEventListener('click', async () => {
  if (!S.inp) return;
  $('cmp-go').disabled = true; $('cmp-status').textContent = 'Running…';
  const p = S.prob, M = S.M;
  try {
    // 1. LP and MILP
    const lp = await solveLP(p, M.allowed);
    const mi = await solveMILP(p, M.allowed, lp.QH, lp.QC, null, 20);
    $('cmp-status').textContent = 'Python: LP and MILP…';
    const pl = await pyCall(`
p = hen.problem_from_inputs(json.loads(ARGS["inputs"])); m = hen.Model(p)
t = time.perf_counter(); lp = hen.lp_targets(p, m.allowed); t1 = time.perf_counter() - t
t = time.perf_counter(); mi = hen.milp_matches(p, lp["QH"], lp["QC"], allowed_pc=m.allowed, time_limit=20); t2 = time.perf_counter() - t
json.dumps(dict(lp=lp["cost"], QH=lp["QH"], QC=lp["QC"], n=mi.get("n"), opt=mi.get("optimal"), t1=t1, t2=t2))`, {inputs: JSON.stringify(pyInputs())});
    let h = `<h3>1. LP utility target and MILP minimum matches</h3><table class="data"><tr><th>quantity</th><th>HiGHS-js (page)</th><th>scipy HiGHS (Python)</th><th>rel. difference</th><th>tolerance</th><th></th></tr>`;
    const qh = lp.QH.reduce((a, b) => a + b, 0), pqh = pl.QH.reduce((a, b) => a + b, 0);
    h += `<tr><td>utility cost [$/yr]</td><td>${fmtG(lp.objective, 10)}</td><td>${fmtG(pl.lp, 10)}</td><td>${rel(lp.objective, pl.lp).toExponential(1)}</td><td>1e-9</td>${verdict(rel(lp.objective, pl.lp) < 1e-9 || Math.abs(lp.objective - pl.lp) < 1e-6)}</tr>`;
    h += `<tr><td>total hot utility [kW]</td><td>${fmtG(qh, 10)}</td><td>${fmtG(pqh, 10)}</td><td>${rel(qh, pqh || 1).toExponential(1)}</td><td>1e-9</td>${verdict(Math.abs(qh - pqh) < 1e-6 * (1 + pqh))}</tr>`;
    h += `<tr><td>number of matches</td><td>${mi.matches.length} (${mi.status})</td><td>${pl.n} (${pl.opt ? 'Optimal' : 'not proven'})</td><td></td><td>equal if both optimal</td>${verdict(mi.matches.length === pl.n || mi.status !== 'Optimal' || !pl.opt)}</tr></table>`;
    // 2. the NLP on the current grid network (or the optimizer's)
    const net = (S.sa && S.sa.best) ? S.sa.best.net : S.grid.net;
    const src = (S.sa && S.sa.best) ? 'the optimizer\'s best network' : 'your grid network';
    const rr = api.optimize(net, null);
    $('cmp-status').textContent = 'Python: NLP…';
    const pn = await pyCall(`
p = hen.problem_from_inputs(json.loads(ARGS["inputs"])); m = hen.Model(p)
net = json.loads(ARGS["net"]); net["matches"] = [tuple(int(v) for v in t) for t in net["matches"]]
net["hu"] = [int(v) for v in net["hu"]]; net["cu"] = [int(v) for v in net["cu"]]
t = time.perf_counter(); r = hen.optimize_loads(m, net); t1 = time.perf_counter() - t
ev = hen.evaluate(m, net, json.loads(ARGS["x"]))
json.dumps(dict(tac=r["tac"], x=r["x"], feas=r["feasible"], t=t1, tac_at=ev["tac"] if ev["ok"] else None))`,
    {inputs: JSON.stringify(pyInputs()), net: JSON.stringify(net), x: JSON.stringify(rr.x)});
    h += `<h3>2. Optimal loads of ${src} (${net.matches.length} matches)</h3><table class="data"><tr><th>quantity</th><th>Rust (WebAssembly)</th><th>Python</th><th>rel. difference</th><th>tolerance</th><th></th></tr>`;
    h += `<tr><td>TAC at the same loads [$/yr]</td><td>${fmtG(rr.tac, 12)}</td><td>${fmtG(pn.tac_at, 12)}</td><td>${rel(rr.tac, pn.tac_at).toExponential(1)}</td><td>1e-12</td>${verdict(rel(rr.tac, pn.tac_at) < 1e-12)}</tr>`;
    h += `<tr><td>optimised TAC [$/yr]</td><td>${fmtG(rr.tac, 10)}</td><td>${fmtG(pn.tac, 10)}</td><td>${rel(rr.tac, pn.tac).toExponential(1)}</td><td>1e-6</td>${verdict(rel(rr.tac, pn.tac) < 1e-6)}</tr>`;
    rr.x.forEach((v, k) => { h += `<tr><td>load of match ${k + 1} [kW]</td><td>${fmtG(v, 8)}</td><td>${fmtG(pn.x[k], 8)}</td><td>${rel(v, pn.x[k]).toExponential(1)}</td><td>1e-4</td>${verdict(Math.abs(v - pn.x[k]) <= 1e-4 * Math.max(Math.abs(pn.x[k]), 1e-3 * Math.min(M.Qh[net.matches[k][0]], M.Qc[net.matches[k][1]])))}</tr>`; });
    h += `<tr><td>time</td><td>${fmt(S.grid.ms, 1)} ms (last grid solve)</td><td>${fmt(pn.t * 1000, 0)} ms</td><td></td><td></td><td></td></tr></table>`;
    h += `<p class="caption">Same algorithm in both: the TAC at given loads agrees to round-off. Optimised loads agree to the solver's own accuracy, because ln/exp/pow
      round differently in the two math libraries and the iterates drift apart by tiny amounts.</p>`;
    // 3. a short annealing run, same seed
    const iters = Math.min(60, defaultIters(p));
    $('cmp-status').textContent = `Python: ${iters} annealing moves…`;
    const ra = api.anneal(null, iters, 7, 0.05, 1e-4);
    const pa = await pyCall(`
p = hen.problem_from_inputs(json.loads(ARGS["inputs"])); m = hen.Model(p)
t = time.perf_counter(); r = hen.anneal(m, int(ARGS["iters"]), 7); t1 = time.perf_counter() - t
json.dumps(dict(tac=r["best"]["tac"] if r["best"] else None, t=t1))`, {inputs: JSON.stringify(pyInputs()), iters});
    h += `<h3>3. Simulated annealing, ${iters} moves, seed 7</h3><table class="data"><tr><th>quantity</th><th>Rust</th><th>Python</th><th>rel. difference</th><th>tolerance</th><th></th></tr>`;
    const rat = ra.best ? ra.best.tac : NaN;
    h += `<tr><td>best TAC [$/yr]</td><td>${fmtG(rat, 10)}</td><td>${fmtG(pa.tac, 10)}</td><td>${rel(rat, pa.tac).toExponential(1)}</td><td>1e-6</td>${verdict(rel(rat, pa.tac) < 1e-6)}</tr></table>
      <p class="caption">Both use the same 32-bit generator (mulberry32) and draw one random number per move, so they make the same moves while the
      objective values agree; a near-tie decided differently after round-off would make the runs part ways.</p>`;
    $('cmp-out').innerHTML = h; $('cmp-status').textContent = 'Done.';
  } catch (e) { $('cmp-status').textContent = 'Failed: ' + e.message; }
  $('cmp-go').disabled = false;
});

// ---------------------------------------------------------------- performance race
$('race-go').addEventListener('click', async () => {
  if (!S.inp) return;
  $('race-go').disabled = true; setBar('race-bar', 0);
  try {
    $('race-status').textContent = 'Calibrating Python (short runs, two seeds)…';
    const cal = await pyCall(`
p = hen.problem_from_inputs(json.loads(ARGS["inputs"])); m = hen.Model(p)
ts = []
for s in (3, 4):
    t = time.perf_counter(); hen.anneal(m, 12, s); ts.append(time.perf_counter() - t)
json.dumps(ts)`, {inputs: JSON.stringify(pyInputs())});
    const per = (cal[0] + cal[1]) / 24;
    const K = Math.max(10, Math.round(10 / per));
    setBar('race-bar', 0.1);
    $('race-status').textContent = `Python: ${K} moves (≈ ${fmt(K * per, 0)} s)…`;
    const pr = await pyCall(`
p = hen.problem_from_inputs(json.loads(ARGS["inputs"])); m = hen.Model(p)
t = time.perf_counter(); r = hen.anneal(m, int(ARGS["K"]), 11); dt = time.perf_counter() - t
json.dumps(dict(t=dt, tac=r["best"]["tac"] if r["best"] else None))`, {inputs: JSON.stringify(pyInputs()), K});
    setBar('race-bar', 0.6);
    $('race-status').textContent = 'Rust, one thread…';
    await sleep0();
    let t0 = performance.now(); const r1 = api.anneal(null, K, 11, 0.05, 1e-4); const t1 = (performance.now() - t0) / 1000;
    const nw = Math.max(1, parseInt($('sa-chains').value, 10) || 4);
    if (!pool || pool.n < nw) pool = new Pool(wasmModule, nw);
    await pool.ready;
    $('race-status').textContent = `Rust, ${nw} workers × ${K} moves…`;
    t0 = performance.now();
    await Promise.all(Array.from({length: nw}, (_, c) => pool.run({fn: 'anneal', flat: S.M.flat, net: null, iters: K, seed: 11 + c, t0: 0.05, t1: 1e-4})));
    const tn = (performance.now() - t0) / 1000;
    setBar('race-bar', 1);
    $('race-metrics').hidden = false;
    $('r-py').textContent = fmt(pr.t, 2) + ' s'; $('r-py-sub').textContent = `${K} moves, best ${money(pr.tac)}`;
    $('r-rs1').textContent = fmt(t1, 3) + ' s'; $('r-rs1-sub').textContent = `same ${K} moves, best ${money(r1.best ? r1.best.tac : NaN)}`;
    $('r-rsn').textContent = fmt(tn, 3) + ' s'; $('r-rsn-sub').textContent = `${nw} × ${K} moves = ${fmt(nw * K / tn, 0)} moves/s`;
    $('r-x').textContent = fmt(pr.t / t1, 0) + '×'; $('r-x-sub').textContent = `throughput with ${nw} workers: ${fmt(nw * pr.t / tn, 0)}× Python`;
    $('race-status').textContent = 'Done. Same seed: the two best TACs should agree (see Rust vs Python).';
  } catch (e) { $('race-status').textContent = 'Failed: ' + e.message; }
  $('race-go').disabled = false;
});

// ---------------------------------------------------------------- WebGPU batch measurement
$('gpu-go').addEventListener('click', () => gpuMeasure().catch((e) => { $('gpu-status').textContent = 'Failed: ' + e.message; }));

// ---------------------------------------------------------------- benchmarks: open a published-comparison network
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-bench]'); if (!b) return;
  const r = BENCH_NETS[+b.dataset.bench];
  $('in-case').value = r.problem; onCaseChange(true);
  $('in-stages').value = r.stages; recompute();
  if (loadIntoGrid(r.net)) {
    document.querySelector('[data-tab="panel-app"]').click(); document.querySelector('[data-tab="sub-grid"]').click();
    $('g-status').textContent = `Benchmark network from the Benchmarks table; the page re-optimised its loads: compare with ${money(r.tac)}.`;
  }
});

// ---------------------------------------------------------------- boot
(async () => {
  try {
    wasmModule = await WebAssembly.compile(b64bytes(WASM_B64));
    const inst = await WebAssembly.instantiate(wasmModule, {});
    api = makeApi(inst.exports);
    startHighs();
    pool = new Pool(wasmModule, Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4)));
    initInputs();
    recompute();
    setTimeout(startPython, 1500);
  } catch (e) { const f = $('fatal'); f.hidden = false; f.textContent = 'Could not start: ' + e.message; console.error(e); }
})();
