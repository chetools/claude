// WebGPU batch evaluation of candidate load vectors, for the measurement in
// the Performance tab.  One GPU thread evaluates the TAC of one load vector of
// a fixed network, in float32, with the same formulas as Rust `evaluate`
// (tau = 0): stage temperatures, approach temperatures, LMTD, areas, cost laws.
'use strict';

const GPU_WGSL = /* wgsl */`
@group(0) @binding(0) var<storage, read> mdl: array<f32>;
@group(0) @binding(1) var<storage, read> X: array<f32>;
@group(0) @binding(2) var<storage, read_write> outv: array<f32>;

const BAD: f32 = -1.0;

fn lmtd(a: f32, b: f32) -> f32 {
  let m = 0.5 * (a + b);
  let d = a - b;
  if (abs(d) < 1e-3 * m) { return m - d * d / (12.0 * m); }
  return d / log(a / b);
}

// cost law at offset o: [kind, p0..p7]
fn unit_cost(o: u32, A: f32) -> f32 {
  let kind = u32(mdl[o]);
  if (kind == 0u) {
    if (A <= 0.0) { return mdl[o + 4u] * mdl[o + 1u]; }
    return mdl[o + 4u] * (mdl[o + 1u] + mdl[o + 2u] * pow(A, mdl[o + 3u]));
  }
  if (kind == 1u) {
    let af = max(A * 10.7639104, 150.0);
    let l = log(af);
    let cb = exp(mdl[o + 1u] + mdl[o + 2u] * l + mdl[o + 3u] * l * l);
    var fm = mdl[o + 7u] + 1.0;
    if (mdl[o + 8u] != 0.0) { fm = mdl[o + 7u] + pow(af / 100.0, mdl[o + 8u]); }
    return mdl[o + 4u] * cb * (mdl[o + 5u] + mdl[o + 6u] * fm - 1.0);
  }
  let am = max(A, mdl[o + 7u]);
  let x = log(am) / log(10.0);
  let cp = pow(10.0, mdl[o + 1u] + mdl[o + 2u] * x + mdl[o + 3u] * x * x);
  return mdl[o + 4u] * cp * (mdl[o + 5u] + mdl[o + 6u]);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let b = gid.x;
  let nh = u32(mdl[0]); let nc = u32(mdl[1]); let nm = u32(mdl[3]);
  let emat = mdl[4]; let N = u32(mdl[5]);
  let oS = u32(mdl[6]); let oM = u32(mdl[7]); let oU = u32(mdl[8]);
  if (b >= N) { return; }
  let xb = b * nm;
  var tac: f32 = 0.0;
  for (var m = 0u; m < nm; m = m + 1u) {
    let o = oM + 13u * m;
    let i = u32(mdl[o]); let j = u32(mdl[o + 1u]); let k = u32(mdl[o + 2u]);
    let q = X[xb + m];
    if (q < 0.0) { outv[b] = BAD; return; }
    var hin = mdl[oS + 3u * i]; var hout = hin;
    var cout = mdl[oS + 3u * nh + 3u * j]; var cin = cout;
    let fh = mdl[oS + 3u * i + 2u]; let fc = mdl[oS + 3u * nh + 3u * j + 2u];
    for (var m2 = 0u; m2 < nm; m2 = m2 + 1u) {
      let o2 = oM + 13u * m2;
      let i2 = u32(mdl[o2]); let j2 = u32(mdl[o2 + 1u]); let k2 = u32(mdl[o2 + 2u]);
      let q2 = X[xb + m2];
      if (i2 == i) { if (k2 < k) { hin = hin - q2 / fh; } if (k2 <= k) { hout = hout - q2 / fh; } }
      if (j2 == j) { if (k2 >= k) { cout = cout + q2 / fc; } if (k2 > k) { cin = cin + q2 / fc; } }
    }
    let a = hin - cout; let c = hout - cin;
    if (a < emat || c < emat) { outv[b] = BAD; return; }
    let A = q / (mdl[o + 3u] * lmtd(a, c));
    tac = tac + unit_cost(o + 4u, A);
  }
  // utilities: per hot stream then per cold stream, 14 floats: [on, U, kind, p0..p7, Tin, Tout, cost]
  for (var s = 0u; s < nh + nc; s = s + 1u) {
    let o = oU + 14u * s;
    if (mdl[o] == 0.0) { continue; }
    var t = 0.0;
    var Q = 0.0; var a = 0.0; var c = 0.0;
    if (s < nh) {
      t = mdl[oS + 3u * s];
      for (var m2 = 0u; m2 < nm; m2 = m2 + 1u) { if (u32(mdl[oM + 13u * m2]) == s) { t = t - X[xb + m2] / mdl[oS + 3u * s + 2u]; } }
      Q = mdl[oS + 3u * s + 2u] * (t - mdl[oS + 3u * s + 1u]);
      a = t - mdl[o + 12u]; c = mdl[oS + 3u * s + 1u] - mdl[o + 11u];
    } else {
      let j = s - nh; let os = oS + 3u * nh + 3u * j;
      t = mdl[os];
      for (var m2 = 0u; m2 < nm; m2 = m2 + 1u) { if (u32(mdl[oM + 13u * m2 + 1u]) == j) { t = t + X[xb + m2] / mdl[os + 2u]; } }
      Q = mdl[os + 2u] * (mdl[os + 1u] - t);
      a = mdl[o + 11u] - mdl[os + 1u]; c = mdl[o + 12u] - t;
    }
    if (Q < 0.0 || (s < nh && a < emat) || (s >= nh && c < emat)) { outv[b] = BAD; return; }
    let A = Q / (mdl[o + 1u] * lmtd(a, c));
    tac = tac + unit_cost(o + 2u, A) + mdl[o + 13u] * Q;
  }
  outv[b] = tac;
}`;

/** Flatten model + network for the shader (see the layout in GPU_WGSL). */
function gpuModel(M, prob, net) {
  const nm = net.matches.length, head = 9;
  const v = [M.nH, M.nC, M.K, nm, M.emat, 0, 0, 0, 0];
  v[6] = head;
  for (const s of prob.hot) v.push(s.Tin, s.Tout, s.F);
  for (const s of prob.cold) v.push(s.Tin, s.Tout, s.F);
  v[7] = v.length;
  for (const [i, j, k] of net.matches) v.push(i, j, k, M.U[i][j], M.kind[i][j], ...M.par[i][j]);
  v[8] = v.length;
  const util = (o) => (o ? [1, o.U, o.kind, ...o.par, o.Tin, o.Tout, o.cost] : new Array(14).fill(0));
  for (let i = 0; i < M.nH; i++) v.push(...util(net.cu[i] >= 0 ? M.cool[i][net.cu[i]] : null));
  for (let j = 0; j < M.nC; j++) v.push(...util(net.hu[j] >= 0 ? M.heat[j][net.hu[j]] : null));
  return v;
}

async function gpuMeasure() {
  const st = (t) => { $('gpu-status').textContent = t; };
  const res = (S.sa && S.sa.best) || (S.seq && S.seq.res && S.seq.model.K === S.M.K ? S.seq.res : null) || S.grid.res;
  if (!res || !res.net.matches.length) { st('Draw a network or run the optimizer first (the batch perturbs its loads).'); return; }
  const net = res.net, nm = net.matches.length, N = parseInt($('gpu-n').value, 10);
  // candidates: the optimal loads perturbed by up to +-15 % (mulberry32, seed 5)
  let a = 5 >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const X = new Float64Array(N * nm);
  for (let b = 0; b < N; b++) for (let m = 0; m < nm; m++) X[b * nm + m] = res.x[m] * (1 + 0.3 * (rnd() - 0.5));
  // CPU: Rust in the worker pool, float64
  st(`CPU: ${pool.n} workers, ${N} load vectors…`);
  await pool.ready;
  const parts = pool.n, per = Math.ceil(N / parts);
  let t0 = performance.now();
  const outs = await Promise.all(Array.from({length: parts}, (_, p) => {
    const lo = p * per, hi = Math.min(N, lo + per);
    return pool.run({fn: 'evalbatch', flat: S.M.flat, net, X: X.slice(lo * nm, hi * nm), n: hi - lo, nm});
  }));
  const cpuMs = performance.now() - t0;
  const cpu = new Float64Array(N); let at = 0;
  for (const o of outs) { cpu.set(o.tac, at); at += o.tac.length; }
  let html = '<table class="data"><tr><th>quantity</th><th>value</th></tr>';
  html += `<tr><td>network</td><td>${nm} matches, ${N.toLocaleString()} load vectors</td></tr>`;
  html += `<tr><td>CPU, Rust f64, ${pool.n} workers (incl. transfer)</td><td>${fmt(cpuMs, 1)} ms</td></tr>`;
  if (!navigator.gpu) { $('gpu-out').innerHTML = html + '<tr><td>WebGPU</td><td>not available in this browser</td></tr></table>'; st('No WebGPU here; only the CPU time was measured.'); return; }
  st('GPU: compiling the shader…');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) { $('gpu-out').innerHTML = html + '<tr><td>WebGPU</td><td>no adapter</td></tr></table>'; st('No WebGPU adapter.'); return; }
  const device = await adapter.requestDevice({requiredLimits: {maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize}});
  const modu = device.createShaderModule({code: GPU_WGSL});
  const info = await modu.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error('WGSL: ' + errs.map((m) => m.message).join('; '));
  const mv = gpuModel(S.M, S.prob, net); mv[5] = N;
  const mk = (arr, usage) => { const bf = device.createBuffer({size: Math.max(16, arr.byteLength), usage, mappedAtCreation: true}); new Float32Array(bf.getMappedRange()).set(arr); bf.unmap(); return bf; };
  const pipeline = device.createComputePipeline({layout: 'auto', compute: {module: modu, entryPoint: 'main'}});
  const run = async () => {
    const t = performance.now();
    const bm = mk(new Float32Array(mv), GPUBufferUsage.STORAGE);
    const bx = mk(new Float32Array(X), GPUBufferUsage.STORAGE);
    const bo = device.createBuffer({size: 4 * N, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC});
    const br = device.createBuffer({size: 4 * N, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
    const bg = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: bm}}, {binding: 1, resource: {buffer: bx}}, {binding: 2, resource: {buffer: bo}}]});
    const enc = device.createCommandEncoder(); const pass = enc.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(N / 64)); pass.end();
    enc.copyBufferToBuffer(bo, 0, br, 0, 4 * N); device.queue.submit([enc.finish()]);
    await br.mapAsync(GPUMapMode.READ); const out = new Float32Array(br.getMappedRange()).slice(); br.unmap();
    [bm, bx, bo, br].forEach((x) => x.destroy());
    return {out, ms: performance.now() - t};
  };
  st('GPU: warm-up run…'); await run();
  st('GPU: timed run…'); const g = await run();
  let nOk = 0, nBoth = 0, worst = 0;
  for (let b = 0; b < N; b++) {
    const c = cpu[b], v = g.out[b];
    const okC = Number.isFinite(c), okG = v >= 0;
    if (okC === okG) nOk++;
    if (okC && okG) { nBoth++; worst = Math.max(worst, Math.abs(v - c) / c); }
  }
  html += `<tr><td>GPU, WGSL f32 (incl. upload and read-back)</td><td>${fmt(g.ms, 1)} ms</td></tr>`;
  html += `<tr><td>GPU adapter</td><td>${esc((adapter.info && (adapter.info.description || adapter.info.vendor)) || 'unknown')}</td></tr>`;
  html += `<tr><td>same feasible/infeasible verdict</td><td>${nOk} of ${N}</td></tr>`;
  html += `<tr><td>largest relative TAC difference (both feasible, ${nBoth})</td><td>${worst.toExponential(2)}</td></tr>`;
  html += `<tr><td>GPU time / CPU time</td><td><b>${fmt(g.ms / cpuMs, 2)}</b></td></tr></table>`;
  $('gpu-out').innerHTML = html;
  window.GPU_LAST = {n: N, nm, gpu_ms: g.ms, cpu_ms: cpuMs, workers: pool.n, agree: nOk, both: nBoth, maxrel: worst,
    adapter: (adapter.info && (adapter.info.description || adapter.info.vendor)) || 'unknown', problem: S.prob.name};
  st(g.ms < cpuMs ? 'Measured: the GPU batch was faster here.' : 'Measured: the CPU workers were faster here.');
  device.destroy();
}
