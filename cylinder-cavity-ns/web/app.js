// ===================================================================== app.js
// Page logic: sidebar inputs, the animation loop, metrics and charts, self-test.
const $ = (id) => document.getElementById(id);
const URLQ = new URLSearchParams(location.search);
const PLOT_CFG = { displaylogo: false, responsive: true };
const FONT = { family: '"Source Sans Pro",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif' };

const PRESETS = {
  'spin-lam': { Re: 50, Us: 1, Uo: 0, R: 0.1, ro: 0.2, N: 256 },
  'orbit-lam': { Re: 300, Us: 0, Uo: 1, R: 0.1, ro: 0.2, N: 256 },
  'orbit-shed': { Re: 3000, Us: 0, Uo: 1, R: 0.1, ro: 0.2, N: 256 },
  'spin-high': { Re: 5000, Us: 1, Uo: 0, R: 0.1, ro: 0.2, N: 512 },
  'turb': { Re: 10000, Us: -1, Uo: 1, R: 0.1, ro: 0.2, N: 512 },
};
const FIELD_NAMES = ['vorticity ω', 'speed |u|', 'pressure p', 'dye'];

// ---------------------------------------------------------------- helpers
const fmtG = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '–');
const fmtE = (x, d = 1) => (Number.isFinite(x) ? x.toExponential(d) : '–');
function showErr(msg) { $('err').hidden = !msg; $('err').textContent = msg || ''; }
function baseLayout(title, extra) {
  return Object.assign({ title: { text: title, font: { size: 15 } }, height: 250,
    margin: { l: 60, r: 20, t: 40, b: 42 }, legend: { orientation: 'h', x: 0, y: 1.12, font: { size: 12 } },
    font: FONT, xaxis: { title: { text: 't' } } }, extra || {});
}
function resolution(cellRe) {           // cell Reynolds number U h / nu
  if (cellRe < 2) return 'DNS, fully resolved';
  if (cellRe < 30) return 'DNS, large eddies resolved';
  return 'implicit LES (limiter acts as sub-grid model)';
}

// ---------------------------------------------------------------- tabs
document.querySelectorAll('.tabs').forEach((bar) => {
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    bar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.' + bar.dataset.panels).forEach((p) => { p.hidden = (p.id !== btn.dataset.tab); });
    setTimeout(() => {
      document.querySelectorAll('.js-plotly-plot').forEach((el) => { if (el.offsetParent !== null) Plotly.Plots.resize(el); });
      renderPendingPlots();
    }, 30);
  });
});
function renderPendingPlots() {
  // walkthrough plots render lazily: Plotly needs a visible container
  document.querySelectorAll('[data-wt-plot]:not([data-rendered])').forEach((el) => {
    if (el.offsetParent === null) return;
    const j = WT_PLOTS[el.getAttribute('data-wt-plot')];
    Plotly.newPlot(el, j.data, Object.assign({ height: 360, margin: { l: 60, r: 60, t: 50, b: 50 }, font: FONT }, j.layout), PLOT_CFG);
    el.setAttribute('data-rendered', '1');
  });
}

// ---------------------------------------------------------------- inputs
function readInputs() {
  return { Re: 10 ** +$('in-re').value, Us: +$('in-us').value, Uo: +$('in-uo').value,
    R: +$('in-r').value, ro: +$('in-ro').value, N: +$('in-n').value };
}
function showValues() {
  const q = readInputs();
  $('v-re').textContent = fmtG(q.Re, 3);
  $('v-us').textContent = q.Us.toFixed(2);
  $('v-uo').textContent = q.Uo.toFixed(2);
  $('v-r').textContent = q.R.toFixed(2);
  $('v-ro').textContent = q.ro.toFixed(2);
}
function setInputs(q) {
  $('in-re').value = Math.log10(q.Re);
  $('in-us').value = q.Us; $('in-uo').value = q.Uo; $('in-r').value = q.R; $('in-ro').value = q.ro;
  if (q.N) $('in-n').value = String(sim.kind === 'cpu' ? Math.min(q.N, 64) : q.N);
  showValues();
}

// ---------------------------------------------------------------- simulation state
const sim = {
  solver: null, kind: null, playing: true, busy: false, k: 4, msPerStep: null,
  hist: { t: [], E: [], Z: [], tq: [] }, probeBase: 0, lastStats: null, lastRate: null,
  crange: 1, statsAt: 0, chartsAt: 0, needReset: false,
};

function params() {
  const q = readInputs();
  if (q.ro + q.R > 0.45) { q.ro = Math.max(0, 0.45 - q.R); $('in-ro').value = q.ro; showValues(); }
  return makeParams(q);
}

function applyParams(reset) {
  const p = params();
  const old = sim.solver.p;
  sim.solver.configure(p, reset);
  if (reset || !old || old.N !== p.N) clearHistory(); else sim.probeBase = null;
  updateStaticMetrics();
}

function clearHistory() {
  sim.hist = { t: [], E: [], Z: [], tq: [] };
  sim.probeBase = 0; sim.lastStats = null; sim.lastRate = null;
  for (const id of ['chart-ez', 'chart-tq', 'chart-spec']) if ($(id).data) Plotly.purge($(id));
}

function updateStaticMetrics() {
  const p = sim.solver.p;
  $('m-re').textContent = fmtG(p.Re, 3);
  const cellRe = Math.max(Math.abs(p.Us), Math.abs(p.Uo)) * p.h / p.nu;
  $('m-re-sub').textContent = `cell Re ${fmtG(cellRe, 2)}: ${resolution(cellRe)}`;
  $('m-div-sub').textContent = `after 2 V-cycles · Δt = ${fmtE(p.dt, 2)}`;
}

// ---------------------------------------------------------------- display
function setLegend() {
  const f = +$('in-field').value, c = sim.crange;
  const stops = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const rgb = f === 0 || f === 2 ? CMAP.diverging(2 * t - 1) : f === 1 ? CMAP.sequential(t) : CMAP.dye(t);
    stops.push(`rgb(${rgb.map((x) => Math.round(255 * x)).join(',')}) ${100 * t}%`);
  }
  $('legend-bar').style.background = `linear-gradient(90deg, ${stops.join(',')})`;
  const lo = f === 0 || f === 2 ? -c : 0, hi = f === 3 ? 1 : c;
  $('leg-lo').textContent = fmtG(lo, 2);
  $('leg-hi').textContent = fmtG(hi, 2) + '  ' + FIELD_NAMES[f];
}
function setView() {
  const f = +$('in-field').value;
  if (!$('in-auto').checked) sim.crange = Math.max(+$('in-crange').value || 1e-6, 1e-6);
  if (f === 3) sim.crange = 1;
  sim.solver.field = f; sim.solver.crange = sim.crange;
  if (sim.solver.setView) sim.solver.setView(f, sim.crange);
  setLegend();
}
function autoRange(s) {
  const f = +$('in-field').value;
  let target = 1;
  if (f === 0) target = 3 * Math.sqrt(2 * s.Z);       // 3 x rms vorticity (box area = 1)
  else if (f === 1) target = s.maxspeed;
  else if (f === 2) target = 0.5 * s.maxp;
  if (!(target > 0)) return;
  const smooth = sim.crange > 0 && Number.isFinite(sim.crange) && !sim.crangeFresh;
  sim.crange = smooth ? 0.7 * sim.crange + 0.3 * target : target;
  sim.crangeFresh = false;
  $('in-crange').value = fmtG(sim.crange, 3);
}

function sizeCanvas() {
  const cv = $('view');
  const px = Math.round(Math.min(1024, cv.clientWidth * (window.devicePixelRatio || 1)));
  if (sim.kind === 'gpu' && px > 0 && cv.width !== px) { cv.width = cv.height = px; if (sim.solver.p) sim.solver.writeParams(); }
}

// ---------------------------------------------------------------- spectrum
function fftPower(x) {
  const n = x.length, re = Float64Array.from(x), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = Math.cos(a * k), wi = Math.sin(a * k);
      const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi, xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
      re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
      re[i + k] += xr; im[i + k] += xi;
    }
  }
  return Array.from({ length: n / 2 }, (_, k) => re[k] * re[k] + im[k] * im[k]);
}
function probeSpectrum(s) {
  const p = sim.solver.p, every = p.probe_every;
  const count = s.nstep > 0 ? Math.floor((s.nstep - 1) / every) + 1 : 0;
  if (sim.probeBase === null) sim.probeBase = count;           // parameters changed: start afresh
  const avail = Math.min(count - sim.probeBase, 4096);
  if (avail < 64) return null;
  const L = 2 ** Math.floor(Math.log2(avail));
  const x = [];
  for (let k = count - L; k < count; k++) x.push(s.probe[2 * (k % 4096) + 1]);
  const m = x.reduce((a, b) => a + b, 0) / L;
  const w = x.map((v, k) => (v - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * k / (L - 1))));
  const P = fftPower(w), df = 1 / (L * every * p.dt);
  return { f: P.map((_, k) => k * df).slice(1), P: P.slice(1), T: L * every * p.dt };
}

// ---------------------------------------------------------------- metrics + charts
function onStats(s) {
  const now = performance.now(), p = sim.solver.p;
  if (sim.lastStats && s.nstep > sim.lastStats.nstep) {
    const rate = (s.nstep - sim.lastStats.nstep) / ((now - sim.lastStats.at) / 1000);
    sim.lastRate = sim.lastRate ? 0.6 * sim.lastRate + 0.4 * rate : rate;
  }
  sim.lastStats = { nstep: s.nstep, at: now };
  $('m-t').textContent = s.t.toFixed(2);
  const turns = [];
  if (p.omega_o) turns.push(`${(Math.abs(s.phi) / (2 * Math.PI)).toFixed(1)} orbits`);
  turns.push(`${s.nstep.toLocaleString()} steps`);
  $('m-t-sub').textContent = turns.join(' · ');
  const playing = sim.playing && !sim.busy;
  $('m-speed').textContent = playing && sim.lastRate ? `${fmtG(sim.lastRate, 3)} /s` : '–';
  $('m-speed-sub').textContent = playing && sim.lastRate
    ? `steps per second · ${fmtG(sim.lastRate * p.N * p.N / 1e6, 3)} M cell-steps/s` : 'paused';
  $('m-e').textContent = fmtG(s.E, 3);
  $('m-e-sub').textContent = `enstrophy Z = ${fmtG(s.Z, 3)} · torque ${fmtG(s.torque, 2)}`;
  $('m-div').textContent = fmtE(s.maxdiv, 1);
  if (!Number.isFinite(s.E)) showErr('The solution blew up (NaN). Restart, or lower the Reynolds number / raise the grid size.');
  const H = sim.hist;
  if (!H.t.length || s.t > H.t[H.t.length - 1]) {
    H.t.push(s.t); H.E.push(s.E); H.Z.push(s.Z); H.tq.push(s.torque);
    if (H.t.length > 3000) for (const k of Object.keys(H)) H[k] = H[k].filter((_, i) => i % 2 === 0);
  }
  if ($('in-auto').checked) { autoRange(s); setView(); }
  if (now - sim.chartsAt > 1000 && $('panel-app').offsetParent !== null) { sim.chartsAt = now; drawCharts(s); }
  $('view-cap').textContent = `${p.N}×${p.N} cells · ${FIELD_NAMES[+$('in-field').value]} · ` +
    `${sim.kind === 'gpu' ? 'WebGPU' : 'CPU fallback'} · ${sim.k} steps per frame`;
}

function drawCharts(s) {
  const H = sim.hist;
  sim.rev = (sim.rev || 0) + 1;            // the arrays are appended in place: tell Plotly.react they changed
  const base = (title, extra) => Object.assign(baseLayout(title, extra), { datarevision: sim.rev });
  Plotly.react('chart-ez', [
    { x: H.t, y: H.E, name: 'kinetic energy E', line: { color: '#ff4b4b' } },
    { x: H.t, y: H.Z, name: 'enstrophy Z', yaxis: 'y2', line: { color: '#3b4cc0' } }],
  base('Energy and enstrophy', { yaxis: { title: { text: 'E' } },
    yaxis2: { title: { text: 'Z' }, overlaying: 'y', side: 'right' }, margin: { l: 60, r: 60, t: 40, b: 42 } }), PLOT_CFG);
  // skip the first 5% of the run (start-up spike) so the torque axis shows the developed flow
  const k0 = Math.max(0, H.t.findIndex((t) => t > 0.05 * H.t[H.t.length - 1]));
  Plotly.react('chart-tq', [{ x: H.t.slice(k0), y: H.tq.slice(k0), name: 'torque', line: { color: '#31333f' } }],
    base('Torque of the fluid on the cylinder', { yaxis: { title: { text: 'torque' } }, showlegend: false }), PLOT_CFG);
  const sp = probeSpectrum(s), p = sim.solver.p;
  if (sp) {
    const shapes = [];
    const marks = [];
    if (p.omega_o) marks.push(['orbit', Math.abs(p.omega_o) / (2 * Math.PI)]);
    if (p.Omega) marks.push(['spin', Math.abs(p.Omega) / (2 * Math.PI)]);
    for (const [, f] of marks) shapes.push({ type: 'line', x0: f, x1: f, yref: 'paper', y0: 0, y1: 1, line: { dash: 'dot', color: '#808495', width: 1 } });
    const fmax = Math.min(sp.f[sp.f.length - 1], Math.max(10, 6 * Math.max(0, ...marks.map((m) => m[1]))));
    Plotly.react('chart-spec', [{ x: sp.f, y: sp.P, name: 'v at the probe', line: { color: '#1a7f37' } }],
      base(`Probe spectrum (last ${sp.T.toFixed(1)} time units)`, { shapes, showlegend: false,
        annotations: marks.map(([n, f]) => ({ x: f, y: 1, yref: 'paper', text: n, showarrow: false, yanchor: 'bottom', font: { size: 11, color: '#808495' } })),
        xaxis: { title: { text: 'frequency' }, range: [0, fmax] }, yaxis: { type: 'log', title: { text: 'power' } } }), PLOT_CFG);
  }
}

// ---------------------------------------------------------------- the loop
async function frame() {
  requestAnimationFrame(frame);
  const S = sim.solver;
  if (!S || sim.busy || (S.lost && sim.kind === 'gpu')) {
    if (S && S.lost && !sim.lostShown) { sim.lostShown = true; showErr('The GPU device was lost. Reload the page.'); }
    return;
  }
  let tau = 0;                                     // simulated time covered this frame (moves the particles)
  if (sim.playing && !sim.stepping) {
    const fixed = +$('in-spf').value;
    if (sim.kind === 'gpu') {
      sim.k = fixed || sim.k;
      sim.stepping = true;
      const t0 = performance.now(), k = sim.k;
      S.step(k);
      tau = k * S.p.dt;
      S.device.queue.onSubmittedWorkDone().then(() => {
        const ms = (performance.now() - t0) / k;
        sim.msPerStep = sim.msPerStep ? 0.8 * sim.msPerStep + 0.2 * ms : ms;
        if (!fixed) sim.k = Math.max(1, Math.min(500, Math.round(14 / sim.msPerStep)));
        sim.stepping = false;
      });
    } else {
      const t0 = performance.now();
      sim.k = fixed || sim.k;
      S.step(sim.k);
      tau = sim.k * S.p.dt;
      const ms = (performance.now() - t0) / sim.k;
      if (!fixed) sim.k = Math.max(1, Math.min(50, Math.round(25 / ms)));
    }
  }
  S.render(tau);
  const now = performance.now();
  if (now - sim.statsAt > 250) {
    sim.statsAt = now;
    const s = await S.readStats();
    if (s && S === sim.solver) onStats(s);
  }
}

// ---------------------------------------------------------------- controls
function wire() {
  $('in-preset').addEventListener('change', () => {
    const pr = PRESETS[$('in-preset').value];
    if (!pr) return;
    setInputs(pr);
    applyParams(true);
  });
  for (const id of ['in-re', 'in-us', 'in-uo', 'in-r', 'in-ro']) {
    $(id).addEventListener('input', () => { $('in-preset').value = 'custom'; showValues(); });
    $(id).addEventListener('change', () => applyParams(false));
  }
  $('in-n').addEventListener('change', () => applyParams(true));
  // a manual range set for one field is meaningless for another: go back to auto on every switch
  $('in-field').addEventListener('change', () => { $('in-auto').checked = true; sim.crangeFresh = true; setView(); });
  $('in-auto').addEventListener('change', setView);
  $('in-part').addEventListener('change', setParticles);
  $('in-trail').addEventListener('input', setParticles);
  $('in-crange').addEventListener('change', () => { $('in-auto').checked = false; setView(); });
  $('b-play').addEventListener('click', () => {
    sim.playing = !sim.playing;
    $('b-play').textContent = sim.playing ? 'Pause' : 'Play';
  });
  $('b-reset').addEventListener('click', () => applyParams(true));
  $('b-dye').addEventListener('click', () => sim.solver.resetDye());
  $('b-png').addEventListener('click', savePng);
  $('val-go').addEventListener('click', runValidation);
  window.addEventListener('resize', sizeCanvas);
}

function setParticles() {
  const fade = 10 ** (-0.5 - 1.5 * +$('in-trail').value);     // ink lost per frame: 0.32 (short) .. 0.01 (long)
  sim.solver.setParticles(+$('in-part').value, fade);
}

async function savePng() {
  let cv = $('view');
  if (sim.kind === 'gpu') {
    const img = await sim.solver.snapshot();
    cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').putImageData(img, 0, 0);
  }
  cv.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `cylinder-Re${Math.round(sim.solver.p.Re)}-t${(sim.hist.t.at(-1) || 0).toFixed(2)}.png`;
    a.click();
  });
}

// ---------------------------------------------------------------- validation
const fromB64 = (s) => new Float64Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);

function compare(uv, ref) {
  let d = 0, m = 0;
  for (const k of ['u', 'v']) for (let i = 0; i < ref[k].length; i++) {
    d = Math.max(d, Math.abs(uv[k][i] - ref[k][i])); m = Math.max(m, Math.abs(ref[k][i]));
  }
  return d / m;
}

async function runValidation() {
  const btn = $('val-go'), status = $('val-status');
  btn.disabled = true;
  const wasPlaying = sim.playing;
  sim.busy = true;
  const result = { ok: true };
  try {
    const ref = { u: fromB64(REF.u), v: fromB64(REF.v) }, p = makeParams(REF.inp), K = REF.steps;
    status.textContent = 'JavaScript CPU solver…';
    await new Promise((r) => setTimeout(r, 20));
    const c = new CpuSolver(null);
    c.configure(p, true);
    let t0 = performance.now();
    c.step(K);
    const cpuMs = (performance.now() - t0) / K;
    const cs = await c.readStats(), cerr = compare(await c.readUV64(), ref);
    const velErr = (a) => Math.max(...a.map((x, i) => Math.abs(x - REF.vel[i]))) / Math.max(...REF.vel.map(Math.abs));
    const cverr = velErr(await c.sampleVelocity(REF.pts));
    let gs = null, gerr = NaN, gpuMs = NaN, gverr = NaN;
    if (sim.kind === 'gpu') {
      status.textContent = 'WebGPU solver…';
      const g = await GpuSolver.create(null, COMPUTE_WGSL, RENDER_WGSL, sim.solver.device);
      g.configure(p, true);
      g.step(1); await g.finish();                      // compile + warm up, then restart
      g.reset();
      t0 = performance.now();
      g.step(K); await g.finish();
      gpuMs = (performance.now() - t0) / K;
      gs = await g.readStats();
      gerr = compare(await g.readUV(), ref);
      gverr = velErr(await g.sampleVelocity(REF.pts));
      g.destroy();
    }
    const R = REF.stats;
    const row = (name, key, d) => `<tr><td>${name}</td><td>${fmtG(R[key], d)}</td><td>${fmtG(cs[key], d)}</td>` +
      `<td>${gs ? fmtG(gs[key], d) : '–'}</td></tr>`;
    const cpuOk = cerr < 1e-10, gpuOk = !gs || gerr < 5e-3;
    const cvOk = cverr < 1e-10, gvOk = !gs || gverr < 5e-3;
    result.ok = cpuOk && gpuOk && cvOk && gvOk;
    Object.assign(result, { cpuErr: cerr, gpuErr: gerr, cpuVelErr: cverr, gpuVelErr: gverr, cpuMs, gpuMs, cs, gs });
    const verdict = (ok, e) => `<td class="${ok ? 'pass' : 'fail'}">${fmtE(e, 1)} ${ok ? 'pass' : 'FAIL'}</td>`;
    $('val-table').innerHTML = `<h3>Self-test: ${p.N}×${p.N}, Re ${REF.inp.Re}, ${K} steps (t = ${REF.t.toFixed(4)})</h3>
      <table class="data"><tr><th></th><th>numpy (f64, build time)</th><th>JavaScript CPU (f64)</th><th>WebGPU (f32)</th></tr>
      ${row('kinetic energy E', 'E', 10)}${row('enstrophy Z', 'Z', 10)}${row('torque', 'torque', 8)}
      ${row('max |div u|', 'maxdiv', 4)}${row('max speed', 'maxspeed', 8)}
      <tr><td>max |u − u<sub>numpy</sub>| / max |u|</td><td>0</td><td class="${cpuOk ? 'pass' : 'fail'}">${fmtE(cerr, 1)} ${cpuOk ? 'pass' : 'FAIL'}</td>
        <td class="${gs ? (gpuOk ? 'pass' : 'fail') : ''}">${gs ? `${fmtE(gerr, 1)} ${gpuOk ? 'pass' : 'FAIL'}` : 'no WebGPU'}</td></tr>
      <tr><td>particle velocity at 64 points (interpolated), max error / max |u|</td><td>0</td>${verdict(cvOk, cverr)}
        ${gs ? verdict(gvOk, gverr) : '<td>no WebGPU</td>'}</tr>
      <tr><td>time per step</td><td>${REF.numpy_ms.toFixed(1)} ms (build machine)</td><td>${cpuMs.toFixed(1)} ms</td>
        <td>${gs ? gpuMs.toFixed(2) + ' ms' : '–'}</td></tr></table>
      <p class="caption">Pass criteria: 10<sup>−10</sup> for the double-precision CPU port, 5·10<sup>−3</sup> for
      single-precision WebGPU. At this small grid the GPU is limited by the ~140 dispatches per step, not by arithmetic;
      the benchmark below shows how it scales.</p>`;
    // throughput
    const rows = [];
    const bench = async (kind, N, K) => {
      status.textContent = `benchmark: ${kind} ${N}×${N}…`;
      await new Promise((r) => setTimeout(r, 20));
      const bp = makeParams({ N, Re: 1000, R: 0.1, ro: 0.2, Us: 1, Uo: 1 });
      let ms;
      if (kind === 'WebGPU') {
        const g = await GpuSolver.create(null, COMPUTE_WGSL, RENDER_WGSL, sim.solver.device);
        g.configure(bp, true);
        g.step(5); await g.finish();
        const t = performance.now();
        g.step(K); await g.finish();
        ms = (performance.now() - t) / K;
        g.destroy();
      } else {
        const c2 = new CpuSolver(null);
        c2.configure(bp, true);
        const t = performance.now();
        c2.step(K);
        ms = (performance.now() - t) / K;
      }
      rows.push(`<tr><td>${kind}</td><td>${N}×${N}</td><td>${ms < 1 ? ms.toFixed(3) : ms.toFixed(1)} ms</td>` +
        `<td>${fmtG(1000 / ms, 3)}</td><td>${fmtG(N * N / ms / 1e3, 3)}</td></tr>`);
      return ms;
    };
    const benchTable = () => {
      $('val-bench').innerHTML = `<h3>Throughput on this machine</h3><table class="data"><tr><th>solver</th><th>grid</th>
        <th>time per step</th><th>steps / s</th><th>M cell-steps / s</th></tr>${rows.join('')}</table>
        <p class="caption">Each step is one Adams–Bashforth step with two multigrid V-cycles. Cell-steps per second measure
        throughput independent of grid size.</p>`;
    };
    await bench('JavaScript CPU', 64, 10); benchTable();
    await bench('JavaScript CPU', 128, 3); benchTable();
    if (sim.kind === 'gpu') {
      for (const [N, K] of [[128, 100], [256, 50], [512, 20]]) { await bench('WebGPU', N, K); benchTable(); }
    }
    status.textContent = result.ok ? 'done: all checks passed' : 'done: a check FAILED';
  } catch (e) {
    result.ok = false; result.error = String(e);
    status.textContent = 'error: ' + e;
  } finally {
    sim.busy = false;
    sim.playing = wasPlaying;
    btn.disabled = false;
    window.SELFTEST = result;
  }
}

// ---------------------------------------------------------------- start
async function main() {
  wire();
  const forceCpu = URLQ.has('cpu');
  try {
    if (forceCpu) throw new Error('CPU solver requested (?cpu)');
    const solver = await GpuSolver.create($('view'), COMPUTE_WGSL, RENDER_WGSL, null, URLQ.has('blit'));
    sim.solver = solver; sim.kind = 'gpu';
    const info = GpuSolver.adapterInfo || {};
    $('backend-pill').textContent = `WebGPU${info.vendor ? ' · ' + info.vendor : ''}${info.architecture ? ' ' + info.architecture : ''}`;
    $('backend-pill').className = 'pill ready';
  } catch (e) {
    sim.solver = new CpuSolver($('view')); sim.kind = 'cpu';
    $('backend-pill').textContent = 'CPU fallback (JavaScript)';
    $('backend-pill').className = 'pill busy';
    $('warn').hidden = false;
    $('warn').innerHTML = forceCpu ? 'Running the JavaScript CPU solver, as requested (<code>?cpu</code>).'
      : `WebGPU is not available here (${String(e.message || e)}), so a JavaScript port of the same solver runs on the CPU,
      at 64×64 and a few steps per frame. For the GPU version use a recent Chrome or Edge (version 113 or later),
      Safari 26, or Firefox 141 or later on Windows.`;
    [...$('in-n').options].forEach((o) => { if (+o.value > 128) o.disabled = true; });
  }
  if (PRESETS[URLQ.get('preset')]) $('in-preset').value = URLQ.get('preset');     // shareable links
  const pr = Object.assign({}, PRESETS[$('in-preset').value]);
  if (URLQ.get('N') && [...$('in-n').options].some((o) => o.value === URLQ.get('N') && !o.disabled)) pr.N = +URLQ.get('N');
  if (URLQ.has('field')) $('in-field').value = URLQ.get('field');
  setInputs(pr);
  if (sim.kind === 'cpu') {
    $('in-part').innerHTML = '<option value="0">off</option><option value="1500">1 500</option><option value="3000" selected>3 000</option>';
  }
  sizeCanvas();
  setParticles();
  applyParams(true);
  setView();
  requestAnimationFrame(frame);
  if (URLQ.has('selftest')) runValidation();
}
main().catch((e) => showErr('Start-up failed: ' + (e.stack || e)));
