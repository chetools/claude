// ===================================================================== app.js
// Page logic for the 3D-vs-2D page: sidebar, two solvers side by side, renderers, metric cards, plots, validation.
//
// Interfaces used (SPEC.md, "Web runtime"):
//   CC3.<m>.makeParams(inp), new CC3.<m>.CpuSolver(p), await CC3.<m>.createGpuSolver(device, p), CC3.<m>.selftest(factory, ref)
//   solver: params, t, nstep, step(n), readVelocity(), updateVelocity() + velocityBuffer (gpu), velocity() (cpu),
//           torque() / readTorque(), maxdiv() (fv), mass() (lbm), destroy()
//   CC3.diag.* (diagnostics.js)
// Renderer: web/render.js (see the block "renderer adapter" below).
(function () {
  'use strict';
  const CC3 = globalThis.CC3;
  const $ = (id) => document.getElementById(id);
  const URLQ = new URLSearchParams(location.search);
  const PLOT_CFG = { displaylogo: false, responsive: true };
  const FONT = { family: '"Source Sans Pro",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif' };
  const C2 = '#3b4cc0', C3 = '#ff4b4b';                      // 2D = blue, 3D = red, everywhere
  const FIELDS = {
    omega: { label: '|ω| vorticity magnitude', short: '|ω|', sym: false },
    wz: { label: 'ω_z (spanwise vorticity)', short: 'ω_z', sym: true },
    q: { label: 'Q (vortex cores: Q > 0)', short: 'Q', sym: true },
    speed: { label: 'speed |u|', short: '|u|', sym: false },
    w: { label: 'w (spanwise velocity)', short: 'w', sym: true },
  };
  const MODES = ['slice-xy', 'slice-xz', 'slice-yz', 'volume', 'isosurface'];
  const GRID = { gpu: { N: [32, 64, 128, 256], Nz: [2, 4, 8, 16, 32, 64, 128] }, cpu: { N: [16, 32, 64], Nz: [2, 4, 8, 16] } };
  const CPU_MAX_CELLS = 32768;                                // N*N*Nz limit of the JavaScript fallback
  const PRESETS = globalThis.PRESETS || {};

  const fmtG = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '–');
  const fmtE = (x, d = 2) => (Number.isFinite(x) ? x.toExponential(d) : '–');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function showErr(msg) { $('err').hidden = !msg; $('err').textContent = msg || ''; }
  function showWarn(html) { $('warn').hidden = !html; $('warn').innerHTML = html || ''; }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ------------------------------------------------------------------ state
  const sim = {
    backend: 'cpu', adapter: null, device: null, forcedCpu: false,
    s2: null, s3: null, p2: null, p3: null, inp: null,
    playing: true, busy: false, pendingRebuild: false, ready: false, dirty: true, diagNow: false,
    autoN: 4, msStep: null, diagMs: 20, lastDiagAt: 0, lastPlotAt: 0, rev: 0, histSel: 'torque', histBound: false,
    H: null, SP: [], range: null, crangeFresh: true, mass0: { 2: null, 3: null }, last: null,
        renderers: {}, detach: {}, canvases: {}, notes: [],
  };
  function newHistory() {
    return { t: [], E2: [], E3: [], Z2: [], Z3: [], T2: [], T3: [], Ew: [], E3d: [], Ekz: [[], [], [], []] };
  }

  // ------------------------------------------------------------------ sidebar + cards
  const slider = (id, label, min, max, step, val) =>
    `<div class="field"><label for="${id}">${label} <span class="val" id="v-${id.slice(3)}"></span></label>` +
    `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
  const select = (id, label, opts, extra = '') =>
    `<div class="field"><label for="${id}">${label}</label><select id="${id}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>${extra}</div>`;

  function buildUI() {
    $('controls').innerHTML = `
      <div class="side-h">Case</div>
      ${select('in-preset', 'Preset', [['custom', 'custom'], ...Object.keys(PRESETS).map((k) => [k, PRESETS[k].label || k])])}
      <div class="side-cap" id="preset-desc"></div>
      <div class="side-h">Physics</div>
      ${select('in-method', 'Method', [['lbm', 'lattice Boltzmann (D3Q19)'], ['fv', 'finite volume (MAC)']])}
      ${select('in-span', 'Span (3D run)', [['periodic', 'periodic in z'], ['walls', 'end walls (no-slip)']])}
      ${slider('in-re', 'Reynolds number Re', 1, 4.3, 0.01, 2)}
      ${slider('in-us', 'Spin speed U<sub>s</sub>', -2, 2, 0.05, 1)}
      ${slider('in-uo', 'Orbit speed U<sub>o</sub>', -2, 2, 0.05, 0)}
      ${slider('in-ro', 'Orbit radius r<sub>o</sub>', 0, 0.35, 0.01, 0.2)}
      ${slider('in-r', 'Cylinder radius R', 0.03, 0.2, 0.01, 0.1)}
      <div class="side-h">Grid and seed</div>
      <div class="row2">${select('in-n', 'N (cells per side)', [])}${select('in-nz', 'N<sub>z</sub> (3D run)', [])}</div>
      <div class="side-cap" id="cap-lz"></div>
      <div class="field"><label for="in-seed">Seed amplitude (units of U<sub>ref</sub>)</label>
        <input type="number" id="in-seed" value="0.001" min="0" step="any"></div>
      <div class="side-cap">Changing any input above restarts both runs from rest.</div>
      <div class="side-h">Display</div>
      ${select('in-field', 'Field', Object.keys(FIELDS).map((k) => [k, FIELDS[k].label]))}
      ${slider('in-slice', 'Slice position', 0, 1, 0.01, 0.5)}
      ${select('in-spf', 'Steps per frame', [[0, 'auto'], [1, '1'], [2, '2'], [5, '5'], [10, '10'], [20, '20'], [50, '50'], [100, '100']])}
      <div class="field check"><input type="checkbox" id="in-raw"><label for="in-raw">show raw torque samples</label></div>
      <div class="field check"><input type="checkbox" id="in-avg"><label for="in-avg">average spectra over the last</label></div>
      <div class="field"><input type="number" id="in-avgw" value="1" min="0.05" step="0.25"><div class="side-cap">time units</div></div>
      <div class="btns"><button class="btn primary" id="b-play">Pause</button><button class="btn" id="b-reset">Reset</button>
        <button class="btn" id="b-png">Save PNG</button></div>`;
    const cards = [['t', 'time t'], ['re', 'Reynolds number'], ['e', 'E per unit span (3D)'], ['tq', 'torque, mean (3D)'],
      ['r3', 'E3d / E (3D)'], ['dv', 'max |div u| (3D)']];
    $('metrics').innerHTML = cards.map(([k, l]) => `<div class="metric"><div class="m-label" id="m-${k}-l">${l}</div>` +
      `<div class="m-value" id="m-${k}">–</div><div class="m-sub" id="m-${k}-sub">&nbsp;</div></div>`).join('');
    // captions under the two panels
    for (const w of [2, 3]) {
      const d = document.createElement('div');
      d.className = 'caption'; d.id = `cap${w}d`;
      $(`view${w}d`).appendChild(d);
    }
    const note = document.createElement('div');
    note.className = 'caption'; note.id = 'cap-scale';
    $('view3d').parentNode.insertAdjacentElement('afterend', note);
    $('validation').innerHTML = `
      <div class="controls">
        <button class="btn primary" id="val-cpu">Self-test: JavaScript CPU solvers</button>
        <button class="btn primary" id="val-gpu">Self-test: WebGPU solvers</button>
        <button class="btn primary" id="val-exact">Exact solution (spin-up)</button>
        <button class="btn" id="val-cross">Compare LBM and FV (2D case)</button>
        <span class="status" id="val-status"></span></div>
      <div id="val-table"></div><div id="val-exact-table"></div><div id="val-cross-table"></div>`;
  }

  function fillGridOptions() {
    const g = GRID[sim.backend];
    const keep = (id, vals, dflt) => {
      const el = $(id), cur = +el.value || dflt;
      el.innerHTML = vals.map((v) => `<option value="${v}">${v}</option>`).join('');
      el.value = String(vals.includes(cur) ? cur : dflt);
    };
    keep('in-n', g.N, 64); keep('in-nz', g.Nz, 8);
    document.querySelectorAll('#mode2d option, #mode3d option').forEach((o) => {
      o.disabled = sim.backend === 'cpu' && (o.value === 'volume' || o.value === 'isosurface');
    });
  }

  function readInputs() {
    return { method: $('in-method').value, span: $('in-span').value, Re: 10 ** +$('in-re').value,
      Us: +$('in-us').value, Uo: +$('in-uo').value, ro: +$('in-ro').value, R: +$('in-r').value,
      N: +$('in-n').value, Nz: +$('in-nz').value, seed: Math.max(0, +$('in-seed').value || 0) };
  }
  function showValues() {
    const q = readInputs();
    $('v-re').textContent = fmtG(q.Re, 3);
    $('v-us').textContent = q.Us.toFixed(2); $('v-uo').textContent = q.Uo.toFixed(2);
    $('v-ro').textContent = q.ro.toFixed(2); $('v-r').textContent = q.R.toFixed(2);
    $('v-slice').textContent = (+$('in-slice').value).toFixed(2);
    $('cap-lz').textContent = `L_z = N_z / N = ${fmtG(q.Nz / q.N, 3)}  (${q.Nz} cells of size 1/${q.N})` +
      (Math.min(4, q.Nz >> 2) === 0 ? '. N_z < 4: the seed has no modes (SPEC: M = min(4, N_z // 4) = 0).' : '');
  }
  function setInputs(q) {
    const set = (id, v) => { if (v !== undefined) $(id).value = String(v); };
    set('in-method', q.method); set('in-span', q.span);
    if (q.Re !== undefined) $('in-re').value = Math.log10(q.Re);
    set('in-us', q.Us); set('in-uo', q.Uo); set('in-ro', q.ro); set('in-r', q.R); set('in-seed', q.seed);
    for (const [id, v] of [['in-n', q.N], ['in-nz', q.Nz]]) {
      if (v === undefined) continue;
      const el = $(id), vals = [...el.options].map((o) => +o.value);
      el.value = String(vals.includes(v) ? v : vals.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)));   // nearest allowed
    }
    showValues();
  }

  // ------------------------------------------------------------------ renderer adapter (web/render.js)
  // GPU: r = CC3.render.create(device, canvas, geom) per solver (geometry-bound), r.setField(name), r.draw(vb, view),
  // r.readPixels(), r.attachControls(canvas, cb).  CPU: CC3.render.drawSliceCPU(ctx2d, U, geom, view) (slices only).
  const RFIELD = { omega: 'vort_mag', wz: 'vort_z', q: 'q', speed: 'speed', w: 'w' };
  const geomOf = (p) => ({ N: p.N, Nz: p.Nz, h: p.h, Lz: p.Lz, span: p.span, R: p.R, ro: p.ro });
  async function makeRenderers() {
    sim.canvases = { 2: $('canvas2d'), 3: $('canvas3d') };
    for (const w of [2, 3]) {
      if (sim.detach[w]) { sim.detach[w](); sim.detach[w] = null; }
      if (sim.renderers[w]) { try { sim.renderers[w].destroy(); } catch (e) { /* ignore */ } sim.renderers[w] = null; }
    }
    if (sim.backend !== 'gpu') return;
    for (const w of [2, 3]) {
      const p = w === 2 ? sim.p2 : sim.p3;
      const r = CC3.render.create(sim.device, sim.canvases[w], Object.assign(geomOf(p), { blit: URLQ.has('blit') }));
      await r.ready;
      sim.renderers[w] = r;
      sim.detach[w] = r.attachControls(sim.canvases[w], () => { sim.dirty = true; });
    }
  }
  function sizeCanvases() {
    for (const w of [2, 3]) {
      const cv = sim.canvases[w];
      if (!cv) continue;
      const px = URLQ.has('blit') ? 640 : Math.max(160, Math.min(720, Math.round(cv.clientWidth * (window.devicePixelRatio || 1))));
      if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; sim.dirty = true; }
    }
  }
  function viewFor(w, S, p) {
    const r = sim.range || [0, 1];
    const phi = S.phi !== undefined ? S.phi : (p.omega_o || 0) * S.t;
    return { field: RFIELD[$('in-field').value], mode: $(`mode${w}d`).value, slice: +$('in-slice').value,
      range: { lo: r[0], hi: r[1] }, phi };
  }
  async function drawPanels() {
    if (!sim.ready) return;
    for (const w of [2, 3]) {
      const S = w === 2 ? sim.s2 : sim.s3, p = w === 2 ? sim.p2 : sim.p3, view = viewFor(w, S, p);
      if (sim.backend === 'gpu') {
        const r = sim.renderers[w];
        if (S.updateVelocity) S.updateVelocity();
        r.setField(view.field);
        await r.draw(S.velocityBuffer, view);
      } else {
        if (view.mode === 'volume' || view.mode === 'isosurface') view.mode = 'slice-xy';
        CC3.render.drawSliceCPU(sim.canvases[w].getContext('2d'), S.velocity(), geomOf(p), view);
      }
    }
    sim.dirty = false;
  }
  function setCaptions() {
    const f = FIELDS[$('in-field').value], r = sim.range;
    const rt = r ? (f.sym ? `±${fmtG(r[1], 3)}` : `${fmtG(r[0], 3)} … ${fmtG(r[1], 3)}`) : '–';
    $('cap-scale').textContent = `Colour scale (the same in both panels): ${f.short} ${rt}. It follows the flow's own ` +
      `statistics (3 × rms of the field, or the maximum speed), not the inputs.`;
    const sub = (S, p, w) => !p ? '' : `${p.N}×${p.N}×${p.Nz} cells · ${sim.backend === 'gpu' ? 'WebGPU' : 'CPU fallback'} · ` +
      `${$(`mode${w}d`).value}${sim.backend === 'cpu' ? ' (CPU: slices only)' : ''}`;
    $('cap2d').textContent = sub(sim.s2, sim.p2, 2); $('cap3d').textContent = sub(sim.s3, sim.p3, 3);
    $('view3d').querySelector('h3').textContent = sim.p3 ? `3D (Nz = ${sim.p3.Nz}, ${sim.p3.span === 'walls' ? 'end walls' : 'periodic span'})` : '3D';
  }

  // ------------------------------------------------------------------ solvers
  async function makeSolver(method, p, backend) {
    const M = CC3[method];
    if ((backend || sim.backend) === 'gpu') return M.createGpuSolver(sim.device, p);
    return new M.CpuSolver(p);
  }
  const getTorque = async (S) => {
    if (S.readTorque) return S.readTorque();
    const t = S.torque; return typeof t === 'function' ? t.call(S) : t;
  };
  const optional = async (S, name) => {
    const rd = 'read' + name[0].toUpperCase() + name.slice(1);           // GPU: readMaxdiv() refreshes the cached value
    if (typeof S[rd] === 'function') return S[rd]();
    return typeof S[name] === 'function' ? S[name]() : undefined;
  };

  function gridBytes(method, N, Nz) {                       // largest single storage buffer (f32)
    return method === 'lbm' ? 19 * 4 * Nz * N * N : 4 * (Nz + 1) * N * (N + 1);
  }
  // CPU fallback: keep N*N*Nz small.  Returns {N, Nz, note}
  function clampCpu(N, Nz) {
    const N0 = N, Nz0 = Nz;
    N = Math.min(N, 64);
    while (N * N * Nz > CPU_MAX_CELLS && Nz > 2) Nz = Nz >> 1;
    while (N * N * Nz > CPU_MAX_CELLS && N > 16) N = N >> 1;
    return { N, Nz, note: (N !== N0 || Nz !== Nz0) ? `CPU fallback: grid reduced from ${N0}×${N0}×${Nz0} to ${N}×${N}×${Nz}.` : '' };
  }

  async function rebuild() {
    sim.pendingRebuild = false;
    let inp = readInputs();
    if (inp.ro + inp.R > 0.45) { inp.ro = Math.max(0, 0.45 - inp.R); $('in-ro').value = inp.ro; }
    sim.notes = [];
    if (sim.backend === 'cpu') {
      const c = clampCpu(inp.N, inp.Nz);
      if (c.note) { sim.notes.push(c.note); inp.N = c.N; inp.Nz = c.Nz; setInputs({ N: c.N, Nz: c.Nz }); }
    } else {
      const lim = Math.min(sim.device.limits.maxStorageBufferBindingSize, sim.device.limits.maxBufferSize);
      for (const [N, Nz, what] of [[inp.N, inp.Nz, '3D run'], [inp.N, 1, '2D baseline']]) {
        const b = gridBytes(inp.method, N, Nz);
        if (b > lim) {
          showErr(`The ${what} (${N}×${N}×${Nz}, ${inp.method.toUpperCase()}) needs a ${(b / 1e6).toFixed(0)} MB buffer; this GPU allows ` +
            `${(lim / 1e6).toFixed(0)} MB. Choose a smaller N or N_z.`);
          return;
        }
      }
    }
    showErr('');
    sim.ready = false;
    for (const k of ['s2', 's3']) { if (sim[k]) { try { sim[k].destroy(); } catch (e) { /* ignore */ } sim[k] = null; } }
    const M = CC3[inp.method];
    const p2 = M.makeParams(Object.assign({}, inp, { Nz: 1, span: 'periodic' }));
    const p3 = M.makeParams(Object.assign({}, inp));
    try {
      sim.s2 = await makeSolver(inp.method, p2);
      sim.s3 = await makeSolver(inp.method, p3);
    } catch (e) { showErr('Could not create the solvers: ' + (e.message || e)); return; }
    sim.inp = inp; sim.p2 = sim.s2.params || p2; sim.p3 = sim.s3.params || p3;
    sim.H = newHistory(); sim.SP = []; sim.range = null; sim.crangeFresh = true; sim.last = null; sim.msStep = null;
    sim.mass0 = { 2: await optional(sim.s2, 'mass'), 3: await optional(sim.s3, 'mass') };
    sim.raw = { t: [], T2: [], T3: [] };
    await sampleTorque();
    try { await makeRenderers(); } catch (e) { showErr('Could not create the renderers: ' + (e.message || e)); return; }
    sim.ready = true;
    const rel = Math.abs(sim.p2.dt - sim.p3.dt) / sim.p3.dt;
    if (rel > 1e-9) sim.notes.push(`The 2D and 3D time steps differ (${fmtE(sim.p2.dt)} vs ${fmtE(sim.p3.dt)}); the 2D run takes the steps needed to reach the same physical time.`);
    showWarn(warnHtml());
    $('preset-desc').textContent = (PRESETS[$('in-preset').value] || {}).description || '';
    await diagnose();
    sizeCanvases(); setCaptions(); sim.dirty = true;
  }
  function warnHtml() {
    const parts = [...sim.notes];
    if (sim.backend === 'cpu') parts.unshift(sim.forcedCpu ? 'Running the JavaScript CPU solvers, as requested (<code>?cpu</code>).'
      : `WebGPU is not available here${sim.whyNoGpu ? ' (' + esc(sim.whyNoGpu) + ')' : ''}, so JavaScript ports of the solvers run on the CPU. ` +
        'The grids are limited to small sizes (N ≤ 64, N·N·N<sub>z</sub> ≤ 32768) and only slice views are drawn. ' +
        'For the GPU version use a recent Chrome or Edge (version 113 or later), Safari 26, or Firefox 141 or later on Windows.');
    return parts.map(esc).join('<br>').replace(/&lt;(\/?(code|sub))&gt;/g, '<$1>');
  }

  // ------------------------------------------------------------------ stepping (lockstep in physical time)
  async function advance() {
    const fixed = +$('in-spf').value;
    let n = fixed || sim.autoN;
    n = Math.max(1, Math.min(n, Math.floor(TORQUE_DT_MAX / sim.p3.dt)));       // torque is sampled after every frame
    const t0 = performance.now();
    await sim.s3.step(n);
    const T = sim.s3.t;
    const n2 = Math.max(0, Math.round((T - sim.s2.t) / sim.p2.dt));
    if (n2) await sim.s2.step(n2);
    if (sim.backend === 'gpu') await sim.device.queue.onSubmittedWorkDone();
    await sampleTorque();
    const ms = (performance.now() - t0) / n;
    sim.msStep = sim.msStep ? 0.7 * sim.msStep + 0.3 * ms : ms;
    if (!fixed) {
      const target = sim.backend === 'gpu' ? 30 : 40, nmax = sim.backend === 'gpu' ? 400 : 200;
      sim.autoN = Math.max(1, Math.min(nmax, Math.round(target / Math.max(sim.msStep, 1e-3))));
    }
    sim.dirty = true;
  }

  // ------------------------------------------------------------------ torque: samples and running mean
  // The per-step torque is noisy when the cylinder orbits, so the page shows a running mean over TORQUE_WIN time units.
  // The torque is sampled after every frame; a frame covers at most TORQUE_DT_MAX time units.
  const TORQUE_WIN = 0.25, TORQUE_DT_MAX = 0.05;
  async function sampleTorque() {
    const R = sim.raw, t = sim.s3.t;
    if (R.t.length && t <= R.t[R.t.length - 1]) return;
    const [a, b] = [await getTorque(sim.s2), await getTorque(sim.s3)];
    R.t.push(t); R.T2.push(a); R.T3.push(b);
    if (R.t.length > 4000) { for (const k of Object.keys(R)) R[k] = R[k].slice(-3000); }
  }
  function runningMean(key, t) {
    const R = sim.raw;
    let s = 0, n = 0;
    for (let i = R.t.length - 1; i >= 0 && R.t[i] > t - TORQUE_WIN; i--) { if (R.t[i] <= t) { s += R[key][i]; n++; } }
    return n ? s / n : NaN;
  }

  // ------------------------------------------------------------------ diagnostics (host, from velocity read-back)
  async function diagnose() {
    if (!sim.ready) return;
    const t0 = performance.now();
    const D = CC3.diag, S2 = sim.s2, S3 = sim.s3, p2 = sim.p2, p3 = sim.p3;
    const [U2, U3] = [await S2.readVelocity(), await S3.readVelocity()];
    const [dv2, dv3] = [await optional(S2, 'maxdiv'), await optional(S3, 'maxdiv')];
    const [m2, m3] = [await optional(S2, 'mass'), await optional(S3, 'mass')];
    await sampleTorque();
    const ph = (S, p) => (S.phi !== undefined ? S.phi : (p.omega_o || 0) * S.t);
    const f2 = D.fluid_mask(p2, ph(S2, p2)), f3 = D.fluid_mask(p3, ph(S3, p3));
    const sOf = (S, dv) => ({ torque: NaN, maxdiv: dv, phi: S.phi, t: S.t });
    const r2 = D.summary(U2, sOf(S2, dv2), p2);
    const r3 = D.summary(U3, sOf(S3, dv3), p3);
    const early = S3.t < TORQUE_WIN;                          // no torque mean before one window has passed
    r2.torque = early ? NaN : runningMean('T2', S2.t); r3.torque = early ? NaN : runningMean('T3', S3.t);
    const [k2, E2k] = D.spectrum_h(U2, p2.Nz, p2.N, p2.h, f2);
    const [k3, E3k] = D.spectrum_h(U3, p3.Nz, p3.N, p3.h, f3, { maxPlanes: 8 });
    const field = $('in-field').value;
    let qr = 0;
    if (field === 'q') {
      for (const [U, p] of [[U2, p2], [U3, p3]]) {
        const Q = D.q_criterion(U, p.Nz, p.N, p.h, p.span);
        let s = 0; for (let i = 0; i < Q.length; i++) s += Q[i] * Q[i];
        qr = Math.max(qr, 3 * Math.sqrt(s / Q.length));
      }
    }
    sim.last = { r2, r3, t2: S2.t, t3: S3.t, n3: S3.nstep, m2, m3, dv2, dv3, qr, k2, E2k, k3, E3k };
    // history
    const H = sim.H, t = S3.t;
    if (!H.t.length || t > H.t[H.t.length - 1]) {
      H.t.push(t); H.E2.push(r2.E); H.E3.push(r3.E); H.Z2.push(r2.Z); H.Z3.push(r3.Z); H.T2.push(r2.torque); H.T3.push(r3.torque);
      H.Ew.push(r3.Ew); H.E3d.push(r3.E3d);
      for (let m = 0; m < 4; m++) H.Ekz[m].push(r3.Ekz && m + 1 < r3.Ekz.length ? r3.Ekz[m + 1] : null);
      sim.SP.push({ t, k2, e2: E2k, k3, e3: E3k });
      if (sim.SP.length > 400) sim.SP.shift();
      if (H.t.length > 3000) { for (const key of Object.keys(H)) H[key] = key === 'Ekz' ? H[key].map((a) => a.filter((_, i) => i % 2 === 0)) : H[key].filter((_, i) => i % 2 === 0); }
    }
    autoRange();
    updateMetrics();
    if (!Number.isFinite(r3.E) || !Number.isFinite(r2.E)) {
      sim.playing = false; $('b-play').textContent = 'Run';
      showErr('The solution blew up (NaN or infinity). Reset, lower the Reynolds number, or raise N.');
    }
    sim.diagMs = performance.now() - t0;
    sim.lastDiagAt = performance.now();
    sim.diagNow = false;
    if ($('panel-app').offsetParent !== null) drawPlots();
  }

  function autoRange() {
    const L = sim.last, f = $('in-field').value;
    let hi;
    if (f === 'omega' || f === 'wz') hi = 3 * Math.sqrt(2 * Math.max(L.r2.Z, L.r3.Z));        // 3 x rms vorticity (box area 1)
    else if (f === 'speed') hi = Math.max(L.r2.maxspeed, L.r3.maxspeed);
    else if (f === 'w') hi = 3 * Math.sqrt(2 * L.r3.Ew);
    else hi = L.qr;
    if (!(hi > 0)) hi = sim.range ? sim.range[1] : 1;
    const prev = sim.range && !sim.crangeFresh ? sim.range[1] : hi;
    hi = 0.7 * prev + 0.3 * hi;
    sim.crangeFresh = false;
    sim.range = FIELDS[f].sym ? [-hi, hi] : [0, hi];
    setCaptions();
  }

  // ------------------------------------------------------------------ metric cards
  function updateMetrics() {
    const L = sim.last, p = sim.p3, inp = sim.inp;
    $('m-t').textContent = L.t3.toFixed(3);
    $('m-t-sub').textContent = `${L.n3.toLocaleString()} steps · Δt ${fmtE(p.dt, 2)}` +
      (Math.abs(L.t2 - L.t3) > 1e-6 * Math.max(L.t3, 1e-12) ? ` · 2D Δt-lag ${fmtE(L.t2 - L.t3, 1)}` : '');
    $('m-re').textContent = fmtG(inp.Re, 3);
    const Uref = Math.max(Math.abs(inp.Us), Math.abs(inp.Uo)) || 1;
    $('m-re-sub').textContent = `cell Re ${fmtG(Uref * p.h / p.nu, 2)} (U h / ν)`;
    $('m-e').textContent = fmtG(L.r3.E, 4);
    $('m-e-sub').textContent = `2D ${fmtG(L.r2.E, 4)} · fluid only`;
    $('m-tq').textContent = fmtG(L.r3.torque, 4);
    $('m-tq-sub').textContent = Number.isFinite(L.r3.torque) ? `2D ${fmtG(L.r2.torque, 4)} · 0.25 t.u.` : `mean starts at t = ${TORQUE_WIN}`;
    $('m-r3').textContent = L.r3.E > 0 ? fmtE(L.r3.E3d / L.r3.E, 2) : '–';
    $('m-r3-sub').textContent = 'share of E that varies in z';
    if (inp.method === 'fv') {
      $('m-dv-l').textContent = 'max |div u| (3D)';
      $('m-dv').textContent = fmtE(L.dv3, 1);
      $('m-dv-sub').textContent = `2D ${fmtE(L.dv2, 1)}`;
    } else {
      const ma = Math.sqrt(3) * L.r3.maxspeed * p.dt / p.h;      // lattice speed of the fastest cell, in units of c_s
      $('m-dv-l').textContent = 'Mach number Ma (3D)';
      $('m-dv').textContent = fmtG(ma, 3);
      const drift = typeof L.m3 === 'number' && typeof sim.mass0[3] === 'number' && sim.mass0[3] !== 0 ? (L.m3 - sim.mass0[3]) / sim.mass0[3] : NaN;
      $('m-dv-sub').textContent = `τ ${fmtG(p.tau, 3)} · u_lb ${fmtG(p.u_lb, 3)} · mass drift ${fmtE(drift, 1)}`;
    }
    document.querySelectorAll('.metrics .m-sub,.metrics .m-label').forEach((e) => { e.title = e.textContent; });
  }

  // ------------------------------------------------------------------ plots
  function baseLayout(title, extra) {
    return Object.assign({ title: { text: title, font: { size: 14 }, x: 0.02, xanchor: 'left' }, height: 340, margin: { l: 62, r: 16, t: 46, b: 96 },
      legend: { orientation: 'h', x: 0, y: -0.3, yanchor: 'top', font: { size: 11 } }, font: FONT,
      xaxis: { title: { text: 't' } }, datarevision: sim.rev }, extra || {});
  }
  const pos = (a) => a.map((v) => (Number.isFinite(v) && v > 0 ? v : null));      // log axis: drop zeros / NaN
  function drawPlots() {
    if (!sim.H || !sim.H.t.length) return;
    sim.rev++;
    const H = sim.H, t = H.t;
    // (a) spanwise
    const tr = [{ x: t, y: pos(H.Ew), name: 'Ew (w energy)', line: { color: C3, width: 2 } },
      { x: t, y: pos(H.E3d), name: 'E3d (departure from z-mean)', line: { color: '#31333f', width: 2 } }];
    if (sim.p3.span === 'periodic') {
      const cols = ['#8fa8e8', '#4f8f5a', '#c78a2a', '#9b59b6'];
      for (let m = 0; m < 4; m++) {
        if (m + 1 > (sim.p3.Nz >> 1)) break;
        tr.push({ x: t, y: pos(H.Ekz[m]), name: `kz = ${m + 1}`, line: { color: cols[m], width: 1.2 } });
      }
    }
    Plotly.react('plot-spanwise', tr, baseLayout('Spanwise energy (3D), fluid only', {
      yaxis: { type: 'log', title: { text: 'energy per unit span' }, exponentformat: 'e' } }), PLOT_CFG);
    // (b) horizontal spectra
    const avg = $('in-avg').checked, w = Math.max(0.05, +$('in-avgw').value || 1), L = sim.last;
    let e2 = L.E2k, e3 = L.E3k, n = 1;
    if (avg) {
      const t1 = sim.SP[sim.SP.length - 1].t, sel = sim.SP.filter((s) => s.t >= t1 - w);
      n = sel.length;
      e2 = new Float64Array(L.E2k.length); e3 = new Float64Array(L.E3k.length);
      for (const s of sel) { for (let i = 0; i < e2.length; i++) e2[i] += s.e2[i] / n; for (let i = 0; i < e3.length; i++) e3[i] += s.e3[i] / n; }
    }
    const kx = (k, e) => ({ x: Array.from(k).slice(1), y: pos(Array.from(e).slice(1)) });
    Plotly.react('plot-spectra', [
      Object.assign(kx(L.k2, e2), { name: '2D', line: { color: C2, width: 2 } }),
      Object.assign(kx(L.k3, e3), { name: '3D', line: { color: C3, width: 2 } })],
    baseLayout(avg ? `E(k), fluid only, mean of ${n}` : 'E(k), fluid only', {
      xaxis: { type: 'log', title: { text: 'wavenumber k (units of 2π / box side)' } },
      yaxis: { type: 'log', title: { text: 'E(k)' }, exponentformat: 'e' } }), PLOT_CFG);
    // (c) history with a selector
    const opts = { torque: ['T2', 'T3', 'torque', 'torque: running mean, 0.25 time units'], E: ['E2', 'E3', 'E', 'E per unit span, fluid only'], Z: ['Z2', 'Z3', 'Z', 'Z per unit span, fluid only'] };
    const [a, b, lab, ttl] = opts[sim.histSel];
    const k0 = sim.histSel === 'torque' ? Math.max(0, t.findIndex((x) => x >= TORQUE_WIN)) : 0;   // torque: skip t < 0.25
    const none = sim.histSel === 'torque' && !t.some((x) => x >= TORQUE_WIN);
    const traces = [
      { x: none ? [] : t.slice(k0), y: none ? [] : H[a].slice(k0), name: '2D', line: { color: C2, width: 2 } },
      { x: none ? [] : t.slice(k0), y: none ? [] : H[b].slice(k0), name: '3D', line: { color: C3, width: 2 } }];
    if (sim.histSel === 'torque' && $('in-raw').checked) {
      const R = sim.raw, i0 = Math.max(0, R.t.findIndex((x) => x >= TORQUE_WIN));
      traces.push({ x: R.t.slice(i0), y: R.T2.slice(i0), name: '2D raw', line: { color: C2, width: 0.7 }, opacity: 0.35 },
        { x: R.t.slice(i0), y: R.T3.slice(i0), name: '3D raw', line: { color: C3, width: 0.7 }, opacity: 0.35 });
    }
    Plotly.react('plot-history', traces,
    baseLayout(ttl, {
      yaxis: { title: { text: lab }, exponentformat: 'e' }, margin: { l: 62, r: 16, t: 84, b: 96 },
      updatemenus: [{ type: 'buttons', direction: 'right', x: 1, xanchor: 'right', y: 1.0, yanchor: 'bottom', showactive: true,
        active: ['torque', 'E', 'Z'].indexOf(sim.histSel), pad: { r: 0, t: 0 }, font: { size: 11 },
        buttons: ['torque', 'E', 'Z'].map((l) => ({ label: l, method: 'skip' })) }] }), PLOT_CFG);
    if (!sim.histBound) {
      sim.histBound = true;
      $('plot-history').on('plotly_buttonclicked', (ev) => {
        sim.histSel = ['torque', 'E', 'Z'][ev.active]; drawPlots();
      });
    }
    sim.lastPlotAt = performance.now();
  }

  // ------------------------------------------------------------------ frame loop
  async function frame() {
    if (sim.busy) { requestAnimationFrame(frame); return; }
    sim.busy = true;
    try {
      if (sim.pendingRebuild) await rebuild();
      if (sim.ready) {
        let stepped = false;
        if (sim.playing) { await advance(); stepped = true; }
        const now = performance.now();
        const interval = Math.max(300, Math.min(4000, 8 * sim.diagMs));
        if (sim.diagNow || (stepped && now - sim.lastDiagAt > interval)) await diagnose();
        if (sim.dirty) await drawPanels();
      }
    } catch (e) {
      showErr('Error: ' + (e.stack || e));
      sim.playing = false; $('b-play').textContent = 'Run';
      console.error(e);
    } finally {
      sim.busy = false;
      requestAnimationFrame(frame);
    }
  }
  const requestRebuild = (() => { let to; return () => { clearTimeout(to); to = setTimeout(() => { sim.pendingRebuild = true; }, 120); }; })();

  // ------------------------------------------------------------------ wiring
  function wire() {
    document.querySelectorAll('.tabs').forEach((bar) => bar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      bar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.' + bar.dataset.panels).forEach((p) => { p.hidden = (p.id !== btn.dataset.tab); });
      setTimeout(() => {
        document.querySelectorAll('.js-plotly-plot').forEach((el) => { if (el.offsetParent !== null) Plotly.Plots.resize(el); });
        renderPendingPlots(); sizeCanvases(); sim.dirty = true;
        if (sim.last && $('panel-app').offsetParent !== null) drawPlots();
      }, 30);
    }));
    $('in-preset').addEventListener('change', () => {
      const pr = PRESETS[$('in-preset').value];
      $('preset-desc').textContent = pr ? pr.description || '' : '';
      if (!pr) return;
      setInputs(pr.inputs); requestRebuild();
    });
    for (const id of ['in-re', 'in-us', 'in-uo', 'in-ro', 'in-r', 'in-slice']) $(id).addEventListener('input', showValues);
    for (const id of ['in-method', 'in-span', 'in-re', 'in-us', 'in-uo', 'in-ro', 'in-r', 'in-n', 'in-nz', 'in-seed']) {
      $(id).addEventListener('change', () => { $('in-preset').value = 'custom'; $('preset-desc').textContent = ''; showValues(); requestRebuild(); });
    }
    $('in-slice').addEventListener('change', () => { sim.dirty = true; });
    $('in-slice').addEventListener('input', () => { sim.dirty = true; });
    $('in-field').addEventListener('change', () => { sim.crangeFresh = true; sim.diagNow = true; sim.dirty = true; });
    for (const id of ['mode2d', 'mode3d']) $(id).addEventListener('change', () => { sim.dirty = true; setCaptions(); });
    for (const id of ['in-avg', 'in-avgw', 'in-raw']) $(id).addEventListener('change', () => { if (sim.last) drawPlots(); });
    $('b-play').addEventListener('click', () => { sim.playing = !sim.playing; $('b-play').textContent = sim.playing ? 'Pause' : 'Run'; });
    $('b-reset').addEventListener('click', () => { requestRebuild(); });
    $('b-png').addEventListener('click', savePng);
    $('val-cpu').addEventListener('click', () => runValidation({ cpu: true }));
    $('val-gpu').addEventListener('click', () => runValidation({ gpu: true }));
    $('val-exact').addEventListener('click', () => runValidation({ exact: true }));
    $('val-cross').addEventListener('click', () => runValidation({ cross: true }));
    window.addEventListener('resize', sizeCanvases);
  }
  function renderPendingPlots() {
    document.querySelectorAll('[data-wt-plot]:not([data-rendered])').forEach((el) => {
      if (el.offsetParent === null || !globalThis.WT_PLOTS) return;
      const j = WT_PLOTS[el.getAttribute('data-wt-plot')];
      Plotly.newPlot(el, j.data, Object.assign({ height: 360, margin: { l: 60, r: 60, t: 50, b: 50 }, font: FONT }, j.layout), PLOT_CFG);
      el.setAttribute('data-rendered', '1');
    });
  }

  // ------------------------------------------------------------------ Save PNG (both panels in one image)
  async function panelImage(w) {
    if (sim.backend === 'gpu') { const im = await sim.renderers[w].readPixels(); return new ImageData(im.data, im.width, im.height); }
    return sim.canvases[w];
  }
  async function savePng() {
    if (!sim.ready) return;
    await drawPanels();
    const imgs = [await panelImage(2), await panelImage(3)];
    const W = Math.max(imgs[0].width, imgs[1].width), top = 34, foot = 26;
    const cv = document.createElement('canvas');
    cv.width = 2 * W; cv.height = W + top + foot;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#31333f'; g.font = '18px sans-serif';
    imgs.forEach((im, i) => {
      if (typeof ImageData !== 'undefined' && im instanceof ImageData) g.putImageData(im, i * W, top);
      else g.drawImage(im, i * W, top, W, W);
    });
    g.fillText(`2D baseline (Nz = 1)`, 8, 22);
    g.fillText(`3D (Nz = ${sim.p3.Nz}, ${sim.p3.span})`, W + 8, 22);
    g.font = '14px sans-serif';
    const f = FIELDS[$('in-field').value];
    g.fillText(`${sim.inp.method.toUpperCase()} · Re ${fmtG(sim.inp.Re, 3)} · N ${sim.p3.N} · t = ${sim.s3.t.toFixed(3)} · ${f.short} scale ${fmtG(sim.range[1], 3)}`, 8, W + top + 18);
    const url = cv.toDataURL('image/png');
    window.LAST_PNG = { width: cv.width, height: cv.height, bytes: url.length };
    const a = document.createElement('a');
    a.href = url; a.download = `cylinder3d-${sim.inp.method}-Re${Math.round(sim.inp.Re)}-t${sim.s3.t.toFixed(2)}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ------------------------------------------------------------------ validation
  async function runBackendTest(method, backend, refOverride) {
    const made = [];
    const factory = async (arg) => {
      const p = arg && arg.dt !== undefined ? arg : CC3[method].makeParams(arg);
      const s = await makeSolver(method, p, backend);
      made.push(s); return s;
    };
    try {
      const rows = await CC3[method].selftest(factory, refOverride || globalThis.REF[method]);
      return rows.map((r) => Object.assign({ method, backend }, r));
    } finally { for (const s of made) { try { s.destroy(); } catch (e) { /* ignore */ } } }
  }
  function rowsTable(rows) {
    if (!rows.length) return '';
    const body = rows.map((r) => `<tr><td>${r.method.toUpperCase()} ${r.backend}</td><td>${esc(r.name)}</td><td>${fmtG(r.expected, 8)}</td>` +
      `<td>${fmtG(r.got, 8)}</td><td>${fmtE(r.reldiff, 1)}</td><td>${fmtE(r.tol, 0)}</td>` +
      `<td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'pass' : 'FAIL'}</td></tr>`).join('');
    return `<div style="overflow-x:auto"><table class="data"><tr><th>solver</th><th>check</th><th>expected (numpy)</th><th>got</th><th>rel. diff</th><th>tolerance</th><th></th></tr>${body}</table></div>
      <p class="caption">Tolerances are the defaults of each method module (<code>selftest</code> in lbm_cpu.js and fv_cpu.js), not set by this page.</p>`;
  }
  // ---- exact solution: impulsively started centred spinning cylinder (python/selftest_exact.py), N=64, Nz=1
  const parityTolCache = {};
  async function parityTol(method, backend) {       // the module's own default tolerance, read from one small self-test row
    const key = method + backend;
    if (parityTolCache[key] === undefined) {
      const rows = await runBackendTest(method, backend, { cases: [globalThis.REF[method].cases[0]] });
      parityTolCache[key] = rows[0].tol;
    }
    return parityTolCache[key];
  }
  async function exactCase(method, backend) {
    const X = globalThis.REF.exact, np = X[method], p = CC3[method].makeParams(X.case);
    const S = await makeSolver(method, p, backend);
    try {
      let left = np.nstep;                             // the numpy run's number of steps (t >= t_end)
      while (left > 0) { const n = Math.min(left, 100); await S.step(n); left -= n; await sleep(0); }
      if (backend === 'gpu') await sim.device.queue.onSubmittedWorkDone();
      const U = await S.readVelocity(), N = p.N, h = p.h;
      const far = new Uint8Array(N * N);                // cells more than gap*h from the surface (ro = 0: centre of the box)
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) far[j * N + i] = Math.hypot((i + 0.5) * h - 0.5, (j + 0.5) * h - 0.5) > p.R + X.gap_cells * h ? 1 : 0;
      const got = { torque: await getTorque(S), E_far: CC3.diag.energy(U, p.Nz, N, h, p.Lz, far) };
      const tol = await parityTol(method, backend);
      const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
      const rows = ['torque', 'E_far'].map((q) => ({ q, got: got[q], numpy: np[q], exact: X.exact[q], parity: rel(got[q], np[q]),
        errExact: rel(got[q], X.exact[q]), numpyErrExact: rel(np[q], X.exact[q]), pass: rel(got[q], np[q]) <= tol }));
      return { method, backend, t: S.t, steps: S.nstep, tEnd: X.t_end, tol, rows, parityPass: rows.every((r) => r.pass) };
    } finally { S.destroy(); }
  }
  function exactTable(list) {
    const X = globalThis.REF.exact;
    const body = list.map((e) => e.rows.map((r, i) => `<tr><td>${i ? '' : e.method.toUpperCase() + ' ' + e.backend}</td>` +
      `<td>${r.q === 'torque' ? 'torque on the cylinder' : 'kinetic energy, far cells'}</td><td>${fmtG(r.got, 6)}</td><td>${fmtG(r.numpy, 6)}</td>` +
      `<td>${fmtG(r.exact, 6)}</td><td>${fmtE(r.parity, 1)}</td><td>${fmtE(e.tol, 0)}</td><td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'pass' : 'FAIL'}</td>` +
      `<td>${fmtG(100 * r.errExact, 3)} %</td><td>${fmtG(100 * r.numpyErrExact, 3)} %</td></tr>`).join('')).join('');
    return `<h3>Exact solution: impulsively started spinning cylinder</h3>
      <div style="overflow-x:auto"><table class="data"><tr><th>solver</th><th>quantity</th><th>solver</th><th>numpy</th><th>exact</th><th>solver vs numpy</th><th>tolerance</th><th></th>
      <th>solver vs exact</th><th>numpy vs exact</th></tr>${body}</table></div>
      <p class="caption">Centred cylinder (r<sub>o</sub> = 0), N = ${X.case.N}, N<sub>z</sub> = ${X.case.Nz}, Re = ${X.case.Re}, U<sub>s</sub> = ${X.case.Us},
      started from rest and run for the same number of steps as the numpy reference (t = ${fmtG(list[0].t, 6)}, t<sub>end</sub> = ${X.t_end}).
      The exact value is the azimuthal solution of the full Navier–Stokes equations, computed independently of both solvers (notes/verify/annulus.py;
      the diffusion length at t = ${X.t_end} is far from the box walls). The kinetic energy is summed over cells whose centre is more than
      ${X.gap_cells} h from the cylinder surface. <b>Solver vs numpy</b> is the parity check (pass/fail at the module's tolerance).
      <b>Solver vs exact</b> is the measured discretisation error, shown without a pass/fail; the numpy column next to it is the error the
      reference code itself has, i.e. the level to expect.</p>`;
  }
  async function crossCase() {
    const N = sim.backend === 'gpu' ? 64 : 32, T = 2;
    const inp = { N, Nz: 1, span: 'periodic', Re: 100, Us: 1, Uo: 0, ro: 0.2, R: 0.1, seed: 0 };
    const out = {};
    for (const method of ['lbm', 'fv']) {
      const p = CC3[method].makeParams(inp);
      const S = await makeSolver(method, p);
      try {
        let left = Math.ceil(T / p.dt - 1e-9);
        while (left > 0) { const n = Math.min(left, 100); await S.step(n); left -= n; await sleep(0); }
        const U = await S.readVelocity();
        out[method] = { t: S.t, steps: S.nstep, E: CC3.diag.energy(U, p.Nz, p.N, p.h, p.Lz, CC3.diag.fluid_mask(p, S.phi !== undefined ? S.phi : p.omega_o * S.t)), torque: await getTorque(S), dt: p.dt };
      } finally { S.destroy(); }
    }
    return { inp, T, out };
  }
  function crossTable(c) {
    const a = c.out.lbm, b = c.out.fv;
    const row = (name, x, y, d) => `<tr><td>${name}</td><td>${fmtG(x, d)}</td><td>${fmtG(y, d)}</td><td>${fmtE(Math.abs(x - y), 1)}</td>` +
      `<td>${fmtE(Math.abs(x - y) / Math.max(0.5 * Math.abs(x + y), 1e-300), 1)}</td></tr>`;
    return `<h3>LBM and FV, same 2D case (measured values)</h3>
      <div style="overflow-x:auto"><table class="data"><tr><th>quantity</th><th>LBM</th><th>FV</th><th>|LBM − FV|</th><th>|LBM − FV| / mean of the two</th></tr>
      ${row('time reached t', a.t, b.t, 5)}${row('kinetic energy E (fluid only)', a.E, b.E, 6)}${row('torque on cylinder', a.torque, b.torque, 6)}
      <tr><td>time step Δt</td><td>${fmtE(a.dt, 2)}</td><td>${fmtE(b.dt, 2)}</td><td></td><td></td></tr></table></div>
      <p class="caption">N = ${c.inp.N}, N<sub>z</sub> = 1, Re ${c.inp.Re}, U<sub>s</sub> = ${c.inp.Us}, U<sub>o</sub> = ${c.inp.Uo},
      r<sub>o</sub> = ${c.inp.ro}, R = ${c.inp.R}, from rest to t ≈ ${c.T} (each solver stops at its first step at or after t = ${c.T}, so the
      reached times differ by less than one Δt). These are the measured values of the two solvers at this one case and grid; the page makes no statement about which
      is closer to the true solution and no pass/fail is claimed.</p>`;
  }
  async function runValidation(what) {
    const status = $('val-status'), btns = ['val-cpu', 'val-gpu', 'val-exact', 'val-cross'].map($);
    btns.forEach((b) => { b.disabled = true; });
    const wasBusy = sim.busy;
    while (sim.busy) await sleep(20);                      // let the frame loop finish its step
    sim.busy = true;
    const result = { ok: true, rows: [], backend: sim.backend };
    try {
      const jobs = [];
      if (what.cpu) jobs.push(['lbm', 'cpu'], ['fv', 'cpu']);
      if (what.gpu) {
        if (sim.backend === 'gpu') jobs.push(['lbm', 'gpu'], ['fv', 'gpu']);
        else status.textContent = 'No WebGPU on this machine, so only the CPU self-test is available.';
      }
      for (const [m, b] of jobs) {
        status.textContent = `self-test ${m.toUpperCase()} ${b}…`;
        await sleep(20);
        result.rows.push(...await runBackendTest(m, b));
        $('val-table').innerHTML = rowsTable(result.rows);
      }
      if (what.exact) {
        result.exact = [];
        for (const b of (sim.backend === 'gpu' ? ['cpu', 'gpu'] : ['cpu'])) for (const m of ['lbm', 'fv']) {
          status.textContent = `exact solution ${m.toUpperCase()} ${b}…`; await sleep(20);
          result.exact.push(await exactCase(m, b));
          $('val-exact-table').innerHTML = exactTable(result.exact);
        }
      }
      if (what.cross) {
        status.textContent = 'LBM vs FV…'; await sleep(20);
        result.cross = await crossCase();
        $('val-cross-table').innerHTML = crossTable(result.cross);
      }
      result.ok = result.rows.every((r) => r.pass) && (!result.exact || result.exact.every((e) => e.parityPass));
      status.textContent = (result.rows.length || result.exact) ? (result.ok ? `done: ${result.rows.length + (result.exact ? 2 * result.exact.length : 0)} checks, all passed` : 'done: a check FAILED') : 'done';
    } catch (e) {
      result.ok = false; result.error = String(e && e.stack || e);
      status.textContent = 'error: ' + (e.message || e);
    } finally {
      sim.busy = wasBusy;
      btns.forEach((b) => { b.disabled = false; });
      $('val-gpu').disabled = sim.backend !== 'gpu';
    }
    return result;
  }
  async function runAllSelfTests() {
    const r1 = await runValidation({ cpu: true, gpu: sim.backend === 'gpu', exact: true, cross: true });
    window.SELFTEST_RESULT = r1;
  }

  // ------------------------------------------------------------------ start-up
  async function detectBackend() {
    sim.forcedCpu = URLQ.has('cpu');
    if (!sim.forcedCpu) {
      try {
        if (!navigator.gpu) throw new Error('navigator.gpu is undefined');
        if (!CC3.lbm.createGpuSolver || !CC3.fv.createGpuSolver || !CC3.render || !CC3.render.create) throw new Error('GPU modules are missing');
        // ONE device for the whole page, created with the adapter's maximum buffer limits (shared by both methods)
        const device = await CC3.lbm.requestGpuDevice();
        const adapter = device._adapter || null;
        device.lost.then((info) => { sim.ready = false; showErr('The GPU device was lost (' + info.message + '). Reload the page.'); });
        sim.adapter = adapter; sim.device = device; sim.backend = 'gpu';
      } catch (e) { sim.whyNoGpu = String(e.message || e); }
    }
    const pill = $('backend-pill');
    if (sim.backend === 'gpu') {
      let info = adapter_info(sim.adapter);
      pill.textContent = 'WebGPU' + (info ? ' · ' + info : ''); pill.className = 'pill ready';
    } else { pill.textContent = 'CPU fallback (JavaScript)'; pill.className = 'pill busy'; }
    $('val-gpu').disabled = sim.backend !== 'gpu';
  }
  function adapter_info(a) {
    const i = (a && a.info) || {};
    return [i.vendor, i.architecture].filter(Boolean).join(' ');
  }

  async function main() {
    buildUI();
    wire();
    await detectBackend();
    fillGridOptions();
    // initial inputs: default preset, then URL overrides
    const ids = Object.keys(PRESETS);
    const pid = PRESETS[URLQ.get('preset')] ? URLQ.get('preset') : ids[0];
    if (pid) { $('in-preset').value = pid; setInputs(PRESETS[pid].inputs); $('preset-desc').textContent = PRESETS[pid].description || ''; }
    const ov = {};
    for (const k of ['method', 'span']) if (URLQ.has(k)) ov[k] = URLQ.get(k);
    for (const k of ['Re', 'Us', 'Uo', 'ro', 'R', 'N', 'Nz', 'seed']) if (URLQ.has(k) && Number.isFinite(+URLQ.get(k))) ov[k] = +URLQ.get(k);
    if (Object.keys(ov).length) { setInputs(ov); if (!URLQ.has('preset')) $('in-preset').value = 'custom'; }
    if (FIELDS[URLQ.get('field')]) $('in-field').value = URLQ.get('field');
    const mode = URLQ.get('mode');
    if (MODES.includes(mode) && !(sim.backend === 'cpu' && /volume|isosurface/.test(mode))) { $('mode2d').value = mode; $('mode3d').value = mode; }
    showValues();
    sim.canvases = { 2: $('canvas2d'), 3: $('canvas3d') };
    sizeCanvases();
    globalThis.CC3APP = { sim, rebuild, diagnose, drawPanels, runValidation, savePng, readInputs };
    sim.pendingRebuild = true;
    requestAnimationFrame(frame);
    if (URLQ.has('selftest')) { while (!sim.ready && !$('err').textContent) await sleep(50); await runAllSelfTests(); }
  }
  main().catch((e) => { showErr('Start-up failed: ' + (e.stack || e)); console.error(e); });
})();
