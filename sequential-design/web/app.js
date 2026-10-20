'use strict';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- constants
const STRATS = [
  {key: 'random', label: 'Random', color: '#808495'},
  {key: 'lhs', label: 'One-shot LHS', color: '#9467bd'},
  {key: 'maxvar', label: 'Max variance', color: '#ff7f0e'},
  {key: 'imse', label: 'IMSE', color: '#2ca02c'},
];
const DEFAULTS = {1: {n0: 4, batch: 2, budget: 16}, 2: {n0: 8, batch: 4, budget: 40}};
const PLOT_CFG = {responsive: true, displaylogo: false};
const C = {red: '#ff4b4b', blue: '#1f77b4', dark: '#31333f', grey: '#808495'};
const FONT = '"Source Sans Pro",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

// ---------------------------------------------------------------- inputs
function readInputs() {
  const v = {
    truth: parseInt($('in-truth').value, 10), strategy: parseInt($('in-strategy').value, 10),
    noise: parseFloat($('in-noise').value), seed: parseFloat($('in-seed').value),
    n0: parseFloat($('in-n0').value), batch: parseFloat($('in-batch').value), budget: parseFloat($('in-budget').value),
  };
  v.d = TRUTHS[v.truth].d;
  return v;
}
function validate(v) {
  const isInt = (x) => Number.isInteger(x);
  if (!(v.noise >= 0 && v.noise <= 50)) return 'Noise must be between 0 and 50 %.';
  if (!(isInt(v.seed) && v.seed >= 0 && v.seed <= 1e9)) return 'The seed must be a whole number from 0 to 10⁹.';
  if (!(isInt(v.n0) && v.n0 >= 3 && v.n0 <= 30)) return 'Initial runs must be a whole number from 3 to 30.';
  if (!(isInt(v.batch) && v.batch >= 1 && v.batch <= 10)) return 'Batch size must be a whole number from 1 to 10.';
  if (!(isInt(v.budget) && v.budget >= v.n0 && v.budget <= 60)) return 'Budget must be a whole number from the initial runs to 60.';
  return null;
}
const cfgOf = (v, strategy, seed) => [v.truth, strategy, v.n0, v.batch, v.budget, v.noise, seed];
function setDefaultsFor(d) {
  const p = DEFAULTS[d];
  $('in-n0').value = p.n0; $('in-batch').value = p.batch; $('in-budget').value = p.budget;
}

// ---------------------------------------------------------------- WASM API
// makeApi is also stringified into the Web Worker source, so it must not
// use anything from the enclosing scope.
function makeApi(w) {
  const cp = w.alloc(7);
  const put = (ptr, a) => new Float64Array(w.memory.buffer, ptr, a.length).set(a);
  const out = () => new Float64Array(w.memory.buffer, w.out_ptr(), w.out_len()).slice();
  return {
    session(c) { put(cp, c); w.session(cp); return out(); },
    curve(c) { put(cp, c); w.curve(cp); return out(); },
  };
}
function runJob(api, it) {
  if (it.fn === 'session') return api.session(it.c);
  if (it.fn === 'curve') return Array.from(api.curve(it.c));
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
  const res = m.items.map((it) => runJob(api, it));
  postMessage({type: 'done', id: m.id, res});
};`;

/** A pool of Web Workers, each with its own WASM instance. */
class Pool {
  constructor(module, n) {
    this.n = n; this.free = []; this.nextId = 1; this.pending = new Map(); this.queue = [];
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
  /** Run all items (one per worker message); results come back in order.
   *  isStale() lets a newer request cancel the items not yet started. */
  async map(items, {onProgress, isStale} = {}) {
    await this.ready;
    const out = new Array(items.length);
    let done = 0;
    const tasks = items.map((it, k) => new Promise((resolve, reject) => {
      this.queue.push({items: [it], isStale, reject, resolve: (res) => {
        out[k] = res[0];
        done += 1;
        if (onProgress) onProgress(done / items.length);
        resolve();
      }});
    }));
    this.pump();
    await Promise.all(tasks);
    return out;
  }
}

// ---------------------------------------------------------------- helpers
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const fmtG = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '–');
const pct = (x) => (Number.isFinite(x) ? (100 * x < 10 ? (100 * x).toFixed(2) : (100 * x).toFixed(1)) + ' %' : '–');
function showErr(msg) { const e = $('err'); e.hidden = !msg; e.textContent = msg || ''; }
function setBar(id, f) { $(id).style.width = (100 * Math.max(0, Math.min(1, f))) + '%'; }
function layout(title, extra) {
  return Object.assign({title: {text: title, font: {size: 15}}, height: 380,
    margin: {l: 62, r: 24, t: 52, b: 50}, legend: {orientation: 'h', x: 0, y: -0.22},
    font: {family: FONT}}, extra || {});
}
const quantile = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

/** Unpack a session() result (layout documented at `session` in lib.rs). */
function parseSession(a) {
  let p = 0;
  const take = (k) => { const s = Array.from(a.slice(p, p + k)); p += k; return s; };
  const d = a[p++], M = a[p++], R = a[p++];
  const fg = take(M);
  const rounds = [];
  for (let r = 0; r < R; r++) {
    const n = a[p++];
    const rec = {n, nrmse: a[p++], est: a[p++], sf: a[p++], sn: a[p++]};
    rec.ell = take(d); rec.x = take(n * d); rec.y = take(n); rec.mean = take(M); rec.sd = take(M);
    const nn = a[p++]; rec.next = take(nn * d);
    const ns = a[p++]; rec.scores = take(ns);
    rounds.push(rec);
  }
  if (p !== a.length) throw new Error('session layout mismatch');
  return {d, M, fg, rounds};
}
/** Grid in scaled units (same as sdl.grid): 201 points, or 31 x 31 with x1 fastest. */
function gridAxes(d) {
  if (d === 1) return {g1: Array.from({length: 201}, (_, i) => i / 200)};
  return {g1: Array.from({length: 31}, (_, i) => i / 30)};
}
const phys = (T, i, u) => T.xs[i][1] + (T.xs[i][2] - T.xs[i][1]) * u;
const reshape31 = (v) => Array.from({length: 31}, (_, j) => v.slice(31 * j, 31 * j + 31));

// ---------------------------------------------------------------- state
let api = null;        // main-thread WASM
let pool = null;       // workers
let wasmModule = null;
const S = {v: null, sess: null, k: 0, gen: 0, cmpStale: true, playing: null};

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
    Plotly.newPlot(el, j.data, Object.assign({height: 380, margin: {l: 60, r: 30, t: 50, b: 50}, font: {family: FONT}}, j.layout), PLOT_CFG);
    el.setAttribute('data-rendered', '1');
  });
}
function onVisible() {
  if (visible('sub-cmp') && S.cmpStale) runCompare();
  if (visible('sub-step') && S.sess) renderRound();
}

// ---------------------------------------------------------------- session (Rust)
let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(recompute, 150); }
async function recompute() {
  if (!pool) return;
  const v = readInputs();
  const msg = validate(v);
  if (msg) { showErr(msg); return; }
  showErr(null);
  const gen = ++S.gen;
  S.cmpStale = true;
  let res;
  try {
    [res] = await pool.map([{fn: 'session', c: cfgOf(v, v.strategy, v.seed)}], {isStale: () => gen !== S.gen});
  } catch (e) {
    if (e.message !== 'stale') showErr('Computation failed: ' + e.message);
    return;
  }
  if (gen !== S.gen) return;
  const prevK = S.sess && S.v && S.v.truth === v.truth ? S.k : 0;
  S.v = v;
  S.sess = parseSession(res);
  S.k = Math.min(prevK, S.sess.rounds.length - 1);
  $('st-round').max = S.sess.rounds.length - 1;
  renderRound();
  onVisible();
}

function setRound(k) {
  if (!S.sess) return;
  S.k = Math.max(0, Math.min(S.sess.rounds.length - 1, k));
  renderRound();
}

function renderRound() {
  const {v, sess, k} = S;
  const T = TRUTHS[v.truth];
  const R = sess.rounds.length;
  const r = sess.rounds[k];
  const last = k === R - 1;
  const strat = STRATS[v.strategy];
  const fstd = Math.sqrt(sess.fg.reduce((s, x) => s + x * x, 0) / sess.M - (sess.fg.reduce((s, x) => s + x, 0) / sess.M) ** 2);
  const sigma = v.noise / 100 * fstd;
  // ---- controls and metrics
  $('st-round').value = k;
  $('st-label').textContent = `Round ${k + 1} of ${R}`;
  $('st-prev').disabled = $('st-first').disabled = k === 0;
  $('st-next').disabled = last;
  $('m-n').textContent = `${r.n} of ${v.budget}`;
  $('m-n-sub').textContent = k === 0 ? 'initial design (maximin LHS)' : `after ${k} batch${k > 1 ? 'es' : ''}`;
  $('m-err').textContent = pct(r.nrmse);
  $('m-est').textContent = pct(r.est);
  $('m-ell').textContent = r.ell.map((l) => fmtG(l, 2)).join(', ');
  $('m-ell-sub').textContent = `scaled units · noise σₙ = ${fmtG(r.sn, 2)} (true ${fmtG(sigma, 2)})`;
  const nNext = r.next.length / v.d;
  $('st-cap').textContent = last ? 'Budget used: this is the final model.' :
    (v.strategy === 1 ? `Next: a fresh one-shot LHS of ${nNext} runs replaces this design (red rings).` :
      `Next batch (red rings): ${nNext} run${nNext > 1 ? 's' : ''} chosen by ${strat.label}.`);
  // ---- charts
  const X = (i) => Array.from({length: r.n}, (_, j) => phys(T, i, r.x[j * v.d + i]));
  const NX = (i) => Array.from({length: nNext}, (_, j) => phys(T, i, r.next[j * v.d + i]));
  const runsMk = {color: C.dark, size: 9, line: {color: 'white', width: 1}};
  const nextMk = {color: 'rgba(0,0,0,0)', size: 14, line: {color: C.red, width: 2.5}};
  const xt = T.xs[0][0];
  if (v.d === 1) {
    const g = gridAxes(1).g1.map((u) => phys(T, 0, u));
    const up = r.mean.map((m, j) => m + 2 * r.sd[j]), lo = r.mean.map((m, j) => m - 2 * r.sd[j]);
    const interp = (xs) => xs.map((x) => { // GP mean at the next points, for placing the markers
      const t = (x - g[0]) / (g[200] - g[0]) * 200, i = Math.min(199, Math.max(0, Math.floor(t)));
      return r.mean[i] + (r.mean[i + 1] - r.mean[i]) * (t - i);
    });
    $('ch-truth').hidden = $('ch-sd').hidden = $('ch-err').hidden = true;
    $('ch-model').classList.add('wide');
    Plotly.react('ch-model', [
      {x: g.concat([...g].reverse()), y: up.concat([...lo].reverse()), fill: 'toself', fillcolor: 'rgba(31,119,180,0.17)',
        line: {width: 0}, name: 'model ± 2 sd', hoverinfo: 'skip'},
      {x: g, y: sess.fg, name: 'hidden truth', line: {color: C.grey, dash: 'dash', width: 2}},
      {x: g, y: r.mean, name: 'model (GP mean)', line: {color: C.blue, width: 2.5}},
      {x: X(0), y: r.y, mode: 'markers', name: 'runs', marker: runsMk},
      ...(nNext ? [{x: NX(0), y: interp(NX(0)), mode: 'markers', name: 'next', marker: nextMk}] : []),
    ], layout(`Model after ${r.n} runs`, {xaxis: {title: xt}, yaxis: {title: T.ylab}}), PLOT_CFG);
    renderScore1D(T, r, g, NX(0), last);
  } else {
    const g1 = gridAxes(2).g1, gx = g1.map((u) => phys(T, 0, u)), gy = g1.map((u) => phys(T, 1, u));
    const zmin = Math.min(...sess.fg), zmax = Math.max(...sess.fg);
    const hm = (z, cs, extra) => Object.assign({type: 'heatmap', x: gx, y: gy, z: reshape31(z), colorscale: cs,
      zsmooth: 'best', colorbar: {thickness: 12, len: 0.9}}, extra || {});
    const runs = {x: X(0), y: X(1), mode: 'markers', name: 'runs', marker: runsMk};
    const next = nNext ? [{x: NX(0), y: NX(1), mode: 'markers', name: 'next', marker: nextMk}] : [];
    const ax = {xaxis: {title: xt}, yaxis: {title: T.xs[1][0]}, legend: {orientation: 'h', x: 0, y: -0.25}};
    $('ch-truth').hidden = $('ch-sd').hidden = $('ch-err').hidden = false;
    $('ch-model').classList.remove('wide');
    Plotly.react('ch-truth', [hm(sess.fg, 'Viridis', {zmin, zmax, name: 'truth'}), runs],
      layout('Hidden truth ' + (T.ylab === 'f' ? 'f' : `(${T.ylab})`), ax), PLOT_CFG);
    Plotly.react('ch-model', [hm(r.mean, 'Viridis', {zmin, zmax, name: 'model'}), runs, ...next],
      layout(`Model (GP mean) after ${r.n} runs`, ax), PLOT_CFG);
    Plotly.react('ch-sd', [hm(r.sd, 'Blues', {zmin: 0, reversescale: true, name: 'sd'}), runs, ...next],
      layout('Model uncertainty (predictive sd)', ax), PLOT_CFG);
    Plotly.react('ch-err', [hm(r.mean.map((m, j) => Math.abs(m - sess.fg[j])), 'Reds', {zmin: 0, name: '|error|'}), runs],
      layout('True error |model − truth|', ax), PLOT_CFG);
    renderScore2D(T, r, gx, gy, NX(0), NX(1), last, ax);
  }
  renderCurve(k);
  Plotly.Plots.resize('ch-model');   // its width changes between the 1-D and 2-D layouts
  // ---- note
  const notes = {
    0: 'Random: each new run is drawn uniformly over the input range. It ignores the model and the runs so far.',
    1: 'One-shot LHS: no learning between batches. At each total N the design is a fresh maximin Latin hypercube of N runs, the design you would have planned had your budget been N.',
    2: 'Max variance: each new run goes where the model is least certain (largest predictive variance). After each pick, the variance is updated as if that run had been made, so the batch spreads out.',
    3: 'IMSE: each new run goes where it most reduces the model\'s variance averaged over the whole grid. After each pick, the covariance is updated as if that run had been made.',
  };
  $('st-note').textContent = notes[v.strategy] + ' Use Back / Run next batch, or drag the slider.';
}

function scoreTitle(v) { return v.strategy === 2 ? 'Score: predictive variance' : 'Score: drop in average variance'; }
function renderScore1D(T, r, g, nx, last) {
  const v = S.v;
  $('ch-score').hidden = false;
  if (!r.scores.length) {
    Plotly.react('ch-score', [], layout(last ? 'Selection score' : `${STRATS[v.strategy].label}: no score`, {
      xaxis: {visible: false}, yaxis: {visible: false},
      annotations: [{text: last ? 'Budget used.' : 'This strategy does not use the model<br>to choose the next runs.',
        showarrow: false, font: {size: 15, color: C.grey}, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5}]}), PLOT_CFG);
    return;
  }
  const mx = Math.max(...r.scores);
  Plotly.react('ch-score', [
    {x: g, y: r.scores.map((s) => s / mx), name: 'score of the first pick', line: {color: STRATS[v.strategy].color, width: 2.5}},
    {x: nx, y: nx.map(() => 0), mode: 'markers+text', text: nx.map((_, i) => String(i + 1)), textposition: 'top center',
      name: 'batch (order picked)', marker: {color: C.red, size: 10, symbol: 'triangle-up'}},
  ], layout(scoreTitle(v) + ' (scaled to max 1)', {xaxis: {title: T.xs[0][0]}, yaxis: {title: 'score / max', range: [-0.08, 1.12]}}), PLOT_CFG);
}
function renderScore2D(T, r, gx, gy, nx, ny, last, ax) {
  const v = S.v;
  if (!r.scores.length) {
    Plotly.react('ch-score', [], layout(last ? 'Selection score' : `${STRATS[v.strategy].label}: no score`, {
      xaxis: {visible: false}, yaxis: {visible: false},
      annotations: [{text: last ? 'Budget used.' : 'This strategy does not use the model<br>to choose the next runs.',
        showarrow: false, font: {size: 15, color: C.grey}, xref: 'paper', yref: 'paper', x: 0.5, y: 0.5}]}), PLOT_CFG);
    return;
  }
  const mx = Math.max(...r.scores);
  Plotly.react('ch-score', [
    {type: 'heatmap', x: gx, y: gy, z: reshape31(r.scores.map((s) => s / mx)), colorscale: 'Greens', reversescale: true, zmin: 0, zmax: 1,
      zsmooth: 'best', colorbar: {thickness: 12, len: 0.9}, name: 'score'},
    {x: nx, y: ny, mode: 'markers+text', text: nx.map((_, i) => String(i + 1)), textposition: 'top center',
      textfont: {color: C.red, size: 14}, name: 'batch (order picked)', marker: {color: C.red, size: 11, symbol: 'x'}},
  ], layout(scoreTitle(v) + ' (first pick, max 1)', ax), PLOT_CFG);
}
function renderCurve(k) {
  const rs = S.sess.rounds;
  const n = rs.map((r) => r.n);
  Plotly.react('ch-curve', [
    {x: n, y: rs.map((r) => r.nrmse), name: 'true error', mode: 'lines+markers', line: {color: C.dark}},
    {x: n, y: rs.map((r) => r.est), name: "model's estimate", mode: 'lines+markers', line: {color: C.blue, dash: 'dot'}},
    {x: [rs[k].n], y: [rs[k].nrmse], mode: 'markers', name: 'this round', marker: {color: C.red, size: 13}, showlegend: false},
  ], layout(`Learning curve (${STRATS[S.v.strategy].label}, seed ${S.v.seed})`, {xaxis: {title: 'runs'},
    yaxis: {title: 'nRMSE', type: 'log'}}), PLOT_CFG);
}

// ---------------------------------------------------------------- step controls
$('st-first').addEventListener('click', () => { stopPlay(); setRound(0); });
$('st-prev').addEventListener('click', () => { stopPlay(); setRound(S.k - 1); });
$('st-next').addEventListener('click', () => { stopPlay(); setRound(S.k + 1); });
$('st-round').addEventListener('input', (e) => { stopPlay(); setRound(parseInt(e.target.value, 10)); });
function stopPlay() { if (S.playing) { clearInterval(S.playing); S.playing = null; $('st-play').textContent = 'Play'; } }
$('st-play').addEventListener('click', () => {
  if (S.playing) { stopPlay(); return; }
  if (S.k >= S.sess.rounds.length - 1) setRound(0);
  $('st-play').textContent = 'Pause';
  S.playing = setInterval(() => {
    if (S.k >= S.sess.rounds.length - 1) { stopPlay(); return; }
    setRound(S.k + 1);
  }, 900);
});

// ---------------------------------------------------------------- compare strategies
async function runCompare() {
  const v = readInputs();
  if (validate(v)) return;
  const nSeeds = Math.round(parseFloat($('cmp-seeds').value));
  if (!(nSeeds >= 3 && nSeeds <= 200)) { $('cmp-status').textContent = 'Repetitions must be from 3 to 200.'; return; }
  S.cmpStale = false;
  const gen = S.gen;
  const items = [];
  STRATS.forEach((_, s) => { for (let seed = 1; seed <= nSeeds; seed++) items.push({fn: 'curve', c: cfgOf(v, s, seed)}); });
  $('cmp-run').disabled = true;
  $('cmp-status').textContent = `Running ${items.length} sessions on ${pool.n} workers…`;
  setBar('cmp-bar', 0);
  const t0 = performance.now();
  let res;
  try {
    res = await pool.map(items, {onProgress: (f) => setBar('cmp-bar', f), isStale: () => gen !== S.gen});
  } catch (e) {
    $('cmp-run').disabled = false;
    if (e.message === 'stale') { S.cmpStale = true; if (visible('sub-cmp')) runCompare(); }
    return;
  }
  $('cmp-run').disabled = false;
  const secs = (performance.now() - t0) / 1000;
  const traces = [], rows = [];
  let ns = null;
  STRATS.forEach((st, s) => {
    const curves = res.slice(s * nSeeds, (s + 1) * nSeeds).map((a) => {
      const R = a[0];
      return {n: Array.from({length: R}, (_, i) => a[1 + 3 * i]), e: Array.from({length: R}, (_, i) => a[2 + 3 * i])};
    });
    ns = curves[0].n;
    const at = (q) => ns.map((_, i) => quantile(curves.map((c) => c.e[i]), q));
    const med = at(0.5), q1 = at(0.25), q3 = at(0.75);
    const rgba = st.color + '30';
    traces.push({x: ns, y: q3, mode: 'lines', line: {width: 0}, showlegend: false, hoverinfo: 'skip', legendgroup: st.key});
    traces.push({x: ns, y: q1, mode: 'lines', line: {width: 0}, fill: 'tonexty', fillcolor: rgba, showlegend: false,
      hoverinfo: 'skip', legendgroup: st.key});
    traces.push({x: ns, y: med, mode: 'lines+markers', name: st.label, line: {color: st.color, width: 2.5}, legendgroup: st.key});
    rows.push({label: st.label, med: med[med.length - 1], q1: q1[q1.length - 1], q3: q3[q3.length - 1]});
  });
  const T = TRUTHS[v.truth];
  Plotly.react('ch-cmp', traces, layout(`${T.name}: true error vs runs, median over ${nSeeds} seeds`,
    {height: 460, xaxis: {title: 'runs'}, yaxis: {title: 'nRMSE (log scale)', type: 'log'}}), PLOT_CFG);
  $('cmp-cap').textContent = `Lines: median over seeds 1–${nSeeds}; bands: 25th to 75th percentile. Each seed changes the initial design, ` +
    `the noise and the random picks; all four strategies share the initial design for a given seed. ` +
    `Inputs: ${v.n0} initial runs, batches of ${v.batch}, budget ${v.budget}, noise ${v.noise} %.`;
  $('cmp-table').innerHTML = `<table class="data"><tr><th>Strategy</th><th>median nRMSE at ${ns[ns.length - 1]} runs</th>
    <th>25th percentile</th><th>75th percentile</th></tr>` +
    rows.map((r) => `<tr><td>${r.label}</td><td>${pct(r.med)}</td><td>${pct(r.q1)}</td><td>${pct(r.q3)}</td></tr>`).join('') + '</table>';
  $('cmp-status').textContent = `${items.length} sessions in ${fmt(secs, 1)} s (Rust, ${pool.n} workers).`;
}
$('cmp-run').addEventListener('click', runCompare);
$('cmp-seeds').addEventListener('change', () => { S.cmpStale = true; });

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
      py.runPython("import sys; sys.path.insert(0, '.'); import json, time, numpy as np, sdl, runner");
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
const PY_STATUS = ['wt-status', 'rp-status', 'race-status'];
const PY_BUTTONS = ['wt-live', 'rp-go', 'race-go'];
const py = {worker: null, ready: false, id: 1, waiting: new Map(), onCell: null};
function setPill(cls, text) { const p = $('py-pill'); p.className = 'pill ' + cls; p.textContent = 'Python: ' + text; }
function startPython() {
  if (py.worker) return;
  setPill('busy', 'loading…');
  PY_STATUS.forEach((id) => { $(id).textContent = 'Loading Python (Pyodide and numpy, about 10 MB)…'; });
  py.worker = new Worker(URL.createObjectURL(new Blob([PY_WORKER_SRC], {type: 'text/javascript'})));
  py.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'status') { setPill('busy', m.msg.charAt(0).toLowerCase() + m.msg.slice(1)); }
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
const pyInputs = (v) => ({truth: TRUTHS[v.truth].id, strategy: STRATS[v.strategy].key, n0: v.n0, batch: v.batch,
  budget: v.budget, noise_pct: v.noise, seed: v.seed});

// ---------------------------------------------------------------- walkthrough live run
$('wt-live').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  $('wt-live').disabled = true;
  const t0 = performance.now();
  py.onCell = (i, r) => {
    renderCellOutput(i, r, true);
    $('wt-status').textContent = `Ran step ${i + 1} of ${WT_CELLS.length}…`;
  };
  $('wt-status').textContent = 'Running in your browser…';
  try {
    await pyCall('runner.run_cells(json.loads(ARGS["cells"]), ARGS["inputs"], on_cell=ON_CELL); "1"',
      {cells: JSON.stringify(WT_CELLS), inputs: pyInputs(v)});
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
      Plotly.newPlot(d, f.data, Object.assign({height: 380, margin: {l: 60, r: 30, t: 50, b: 50}, font: {family: FONT}}, f.layout), PLOT_CFG);
    });
  }
  const meta = $('wt-meta-' + i);
  if (meta) meta.textContent = (live ? 'Ran live in your browser' : 'Ran at build time (CPython)') + ` in ${fmt(r.secs, 2)} s.`;
}

// ---------------------------------------------------------------- Rust vs Python
const PY_SESSION = `
a = ARGS
t = time.perf_counter()
rounds = sdl.run_session(a["truth"], a["strategy"], a["n0"], a["batch"], a["budget"], a["noise_pct"], a["seed"], keep=True)
secs = time.perf_counter() - t
json.dumps(dict(secs=secs, rounds=[dict(n=r["n"], nrmse=r["nrmse"], est=r["est"], ell=r["ell"], nll=r["nll"],
    next=[] if r["next"] is None else r["next"].ravel().tolist()) for r in rounds]))
`;
$('rp-go').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  $('rp-go').disabled = true;
  $('rp-status').textContent = 'Python is running the session…';
  let d;
  try { d = await pyCall(PY_SESSION, pyInputs(v)); } catch (e) {
    $('rp-status').textContent = 'Python failed: ' + e.message; $('rp-go').disabled = false; return;
  }
  const t = performance.now();
  const rs = parseSession(api.session(cfgOf(v, v.strategy, v.seed)));
  const tRs = (performance.now() - t) / 1000;
  // Same rule as test_rust_matches_python: compare tightly unless a length scale sits on its bound
  // (flat likelihood: compare the likelihood instead). For the adaptive strategies the next runs
  // depend on the fit, so rounds after the first flat fit are not compared.
  const lnLo = Math.log(0.02), lnHi = Math.log(5);
  let firstFlat = -1, worst = 0, okRounds = 0, compared = 0;
  const rows = rs.rounds.map((r, i) => {
    const p = d.rounds[i];
    const rel = Math.abs(r.nrmse - p.nrmse) / r.nrmse;
    const same = r.next.length === p.next.length && r.next.every((x, j) => Math.abs(x - p.next[j]) < 1e-12);
    const cells = `<tr><td>${i + 1}</td><td>${r.n}</td><td>${fmt(r.nrmse, 8)}</td><td>${fmt(p.nrmse, 8)}</td>` +
      `<td>${rel.toExponential(1)}</td><td>${same ? 'yes' : 'no'}</td>`;
    if (firstFlat >= 0 && v.strategy >= 2) return cells + '<td>not compared (after a flat fit)</td></tr>';
    const flat = r.ell.some((l) => Math.abs(Math.log(l) - lnLo) < 1e-3 || Math.abs(Math.log(l) - lnHi) < 1e-3);
    compared++;
    if (flat) {
      if (firstFlat < 0) firstFlat = i;
      const dn = Math.abs(r.nll - p.nll), ok = dn < 1e-5 * Math.max(1, Math.abs(r.nll));
      if (ok) okRounds++;
      return cells + `<td class="${ok ? 'pass' : 'fail'}">ℓ on its bound: |ΔNLL| = ${dn.toExponential(1)}</td></tr>`;
    }
    const ok = rel < 1e-5 && same;
    if (ok) { okRounds++; worst = Math.max(worst, rel); }
    return cells + `<td class="${ok ? 'pass' : 'fail'}">${ok ? 'pass' : 'differs'}</td></tr>`;
  });
  $('rp-table').innerHTML = `<table class="data"><tr><th>Round</th><th>runs</th><th>nRMSE Rust</th><th>nRMSE Python</th>
    <th>relative difference</th><th>same next runs</th><th>check</th></tr>${rows.join('')}</table>`;
  $('rp-summary').innerHTML = `<p><b>${okRounds} of ${compared}</b> compared rounds pass (relative nRMSE difference ≤ 10⁻⁵ and identical
    next runs, or equal likelihood where a length scale is on its bound). Largest relative difference on the regular rounds:
    ${worst.toExponential(1)}. ${firstFlat >= 0 ? `Round ${firstFlat + 1} is the first with a length scale on its bound.` : 'No fit ended on a bound.'}
    Python took ${fmt(d.secs, 2)} s, Rust ${fmt(1000 * tRs, 0)} ms.</p>`;
  Plotly.react('ch-rp', [
    {x: rs.rounds.map((r) => r.n), y: rs.rounds.map((r) => r.nrmse), name: 'Rust', mode: 'lines+markers', line: {color: C.red, width: 6}},
    {x: d.rounds.map((r) => r.n), y: d.rounds.map((r) => r.nrmse), name: 'Python', mode: 'lines+markers', line: {color: C.dark, width: 2}},
  ], layout('Learning curve: Rust and Python overlaid', {xaxis: {title: 'runs'}, yaxis: {title: 'nRMSE', type: 'log'}}), PLOT_CFG);
  $('rp-status').textContent = 'Done.';
  $('rp-go').disabled = false;
});

// ---------------------------------------------------------------- performance race
const PY_RACE = `
a = ARGS
def one(seed):
    return sdl.run_session(a["truth"], a["strategy"], a["n0"], a["batch"], a["budget"], a["noise_pct"], seed, keep=False)[-1]["nrmse"]
t = time.perf_counter()
for s in (1001, 1002, 1003):      # calibration seeds (cost varies with the data)
    one(s)
t1 = (time.perf_counter() - t) / 3
K = int(min(2000, max(2, round(a["target"] / t1))))
t = time.perf_counter(); errs = [one(s) for s in range(1, K + 1)]; secs = time.perf_counter() - t
json.dumps(dict(K=K, t1=t1, secs=secs, errs=errs))
`;
$('race-go').addEventListener('click', async () => {
  const v = readInputs();
  if (validate(v)) { showErr(validate(v)); return; }
  $('race-go').disabled = true;
  $('race-metrics').hidden = false;
  ['r-py', 'r-rs1', 'r-rsn', 'r-x'].forEach((id) => { $(id).textContent = '…'; });
  setBar('race-bar', 0.02);
  $('race-status').textContent = 'Python: timing three sessions, then running ≈ 10 s of sessions…';
  const t0 = performance.now();
  const tick = setInterval(() => setBar('race-bar', Math.min(0.85, (performance.now() - t0) / 12000 * 0.85)), 200);
  let d;
  try { d = await pyCall(PY_RACE, Object.assign(pyInputs(v), {target: 10.0})); } catch (e) {
    clearInterval(tick); $('race-status').textContent = 'Python failed: ' + e.message; $('race-go').disabled = false; return;
  }
  clearInterval(tick);
  $('r-py').textContent = fmt(d.secs, 2) + ' s';
  $('r-py-sub').textContent = `${d.K} sessions · ${fmt(1000 * d.secs / d.K, 0)} ms each`;
  $('race-status').textContent = `Rust: the same ${d.K} sessions on one thread…`;
  await new Promise((r) => setTimeout(r, 30));
  const seeds = Array.from({length: d.K}, (_, i) => i + 1);
  const finalErr = (a) => a[2 + 3 * (a[0] - 1)];
  let t = performance.now();
  const rs1 = seeds.map((s) => finalErr(api.curve(cfgOf(v, v.strategy, s))));
  const tRs1 = (performance.now() - t) / 1000;
  const ms = (x) => (x < 1 ? fmt(1000 * x, 0) + ' ms' : fmt(x, 2) + ' s');
  $('r-rs1').textContent = ms(tRs1);
  $('r-rs1-sub').textContent = `${fmt(1000 * tRs1 / d.K, 1)} ms each`;
  setBar('race-bar', 0.92);
  $('race-status').textContent = `Rust: the same ${d.K} sessions on ${pool.n} workers…`;
  t = performance.now();
  await pool.map(seeds.map((s) => ({fn: 'curve', c: cfgOf(v, v.strategy, s)})));
  const tRsN = (performance.now() - t) / 1000;
  $('r-rsn').textContent = ms(tRsN);
  $('r-rsn-sub').textContent = `${pool.n} workers · ${fmt(d.secs / tRsN, 0)}× faster than Python`;
  $('r-x').textContent = fmt(d.secs / tRs1, 0) + '×';
  const agree = rs1.filter((e, i) => Math.abs(e - d.errs[i]) <= 1e-5 * e).length;
  $('r-x-sub').textContent = `final nRMSE equal (≤ 10⁻⁵ relative) in ${agree} of ${d.K} sessions`;
  Plotly.react('ch-race', [{type: 'bar', orientation: 'h', y: ['Python (numpy)', 'Rust, 1 thread', `Rust, ${pool.n} workers`],
    x: [d.secs, tRs1, tRsN], marker: {color: [C.blue, C.red, '#c2185b']},
    text: [fmt(d.secs, 2) + ' s', ms(tRs1), ms(tRsN)], textposition: 'auto'}],
  layout(`Wall time for ${d.K} sessions`, {xaxis: {title: 'seconds (log scale)', type: 'log'}, margin: {l: 130, r: 24, t: 52, b: 50}}), PLOT_CFG);
  Plotly.react('ch-race-err', [
    {x: d.errs, y: rs1, mode: 'markers', name: 'sessions', marker: {color: C.red, size: 7}},
    {x: [Math.min(...d.errs), Math.max(...d.errs)], y: [Math.min(...d.errs), Math.max(...d.errs)], mode: 'lines',
      name: 'equal', line: {color: C.grey, dash: 'dash'}},
  ], layout('Same answers: final nRMSE, Rust vs Python', {xaxis: {title: 'Python', type: 'log'}, yaxis: {title: 'Rust', type: 'log'}}), PLOT_CFG);
  setBar('race-bar', 1);
  $('race-status').textContent = `Done: Rust is ${fmt(d.secs / tRs1, 0)}× faster on one thread and ${fmt(d.secs / tRsN, 0)}× on ${pool.n} workers.`;
  $('race-go').disabled = false;
});

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
  setDefaultsFor(TRUTHS[parseInt($('in-truth').value, 10)].d);
  let lastD = TRUTHS[parseInt($('in-truth').value, 10)].d;
  $('in-truth').addEventListener('change', () => {
    const d = TRUTHS[parseInt($('in-truth').value, 10)].d;
    if (d !== lastD) { setDefaultsFor(d); lastD = d; }
    stopPlay(); schedule();
  });
  ['in-strategy', 'in-noise', 'in-seed', 'in-n0', 'in-batch', 'in-budget'].forEach((id) =>
    $(id).addEventListener('input', () => { stopPlay(); schedule(); }));
  WT_CELLS.forEach((c, i) => {
    const meta = $('wt-meta-' + i);
    if (meta) meta.textContent = `Ran at build time (CPython) in ${fmt(c.secs, 2)} s.`;
  });
  window.addEventListener('resize', () => setTimeout(relayoutVisible, 50));
  await recompute();
  setTimeout(startPython, 1500);
}
boot();
