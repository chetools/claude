// ===================================================================== gpu.js
// WebGPU host code: buffers, pipelines, and one time step as a fixed list of
// compute dispatches.  Many steps are recorded into one compute pass per frame;
// the CPU never waits for the GPU except when it reads the diagnostics back.

// group-0 bindings each kernel uses (binding 0, the parameters, is always included)
const KERNELS = {
  momentum: [1, 2, 3, 4, 5, 6, 7], penalise: [1, 2, 3, 4, 5], divergence: [2, 3, 9], project: [2, 3, 8],
  advect_dye: [2, 3, 10, 11], record_probe: [1, 2, 3, 14], advance: [1], field: [1, 2, 3, 8, 10, 12],
  stats: [1, 2, 3, 4, 5, 8, 13],
};
const MG_KERNELS = ['mg_smooth', 'mg_residual', 'mg_restrict', 'mg_prolong', 'mg_coarse'];
const WG = 16;

class GpuSolver {
  // canvas: null (no drawing), or a canvas drawn through WebGPU; with blit = true the
  // frame is rendered into a texture and copied into a 2D canvas instead (slower; used
  // where a WebGPU canvas cannot be presented, e.g. headless test browsers)
  static async create(canvas, computeWGSL, renderWGSL, device, blit = false) {
    if (!device) {
      if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('no WebGPU adapter');
      device = await adapter.requestDevice();
      GpuSolver.adapter = adapter;            // keep a reference (Chromium drops the instance otherwise)
      GpuSolver.adapterInfo = adapter.info || {};
    }
    const s = new GpuSolver();
    s.kind = 'gpu';
    s.device = device;
    s.blit = blit;
    await s.build(canvas, computeWGSL, renderWGSL);
    return s;
  }

  async build(canvas, computeWGSL, renderWGSL) {
    const dev = this.device;
    this.lost = false;
    dev.lost.then(() => { this.lost = true; });
    const module = dev.createShaderModule({ code: computeWGSL });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) throw new Error('WGSL: ' + errs.map(m => `line ${m.lineNum}: ${m.message}`).join('; '));
    const C = GPUShaderStage.COMPUTE;
    this.layouts = {};
    this.pipes = {};
    dev.pushErrorScope('validation');
    for (const [name, bind] of Object.entries(KERNELS)) {
      const layout = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: 'uniform' } },
        ...bind.map(b => ({ binding: b, visibility: C, buffer: { type: 'storage' } }))] });
      this.layouts[name] = layout;
      this.pipes[name] = dev.createComputePipeline({ layout: dev.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module, entryPoint: name } });
    }
    this.emptyLayout = dev.createBindGroupLayout({ entries: [] });
    this.emptyGroup = dev.createBindGroup({ layout: this.emptyLayout, entries: [] });
    this.mgLayout = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: 'uniform' } },
      ...[1, 2, 3, 4, 5].map(b => ({ binding: b, visibility: C, buffer: { type: 'storage' } }))] });
    const mgPL = dev.createPipelineLayout({ bindGroupLayouts: [this.emptyLayout, this.mgLayout] });
    for (const name of MG_KERNELS)
      this.pipes[name] = dev.createComputePipeline({ layout: mgPL, compute: { module, entryPoint: name } });
    if (canvas) {
      this.canvas = canvas;
      if (this.blit) {
        this.ctx2d = canvas.getContext('2d');
        this.format = 'rgba8unorm';
      } else {
        this.ctx = canvas.getContext('webgpu');
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({ device: dev, format: this.format, alphaMode: 'opaque' });
      }
      const rmod = dev.createShaderModule({ code: renderWGSL });
      const F = GPUShaderStage.FRAGMENT;
      this.renderLayout = dev.createBindGroupLayout({ entries: [
        { binding: 0, visibility: F, buffer: { type: 'uniform' } },
        { binding: 1, visibility: F, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: F, buffer: { type: 'read-only-storage' } }] });
      this.renderPipe = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [this.renderLayout] }),
        vertex: { module: rmod, entryPoint: 'vs_main' },
        fragment: { module: rmod, entryPoint: 'fs_main', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list' } });
    }
    const err = await dev.popErrorScope();
    if (err) throw new Error('WebGPU pipeline: ' + err.message);
    this.params = new ArrayBuffer(64);
    this.paramBuf = dev.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.field = 0; this.crange = 1;
  }

  buffer(bytes) {
    const b = this.device.createBuffer({ size: Math.max(bytes, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.owned.push(b);
    return b;
  }

  configure(p, reset) {
    const old = this.p;
    this.p = p;
    if (reset || !old || old.N !== p.N) this.allocate();
    this.writeParams();
  }

  writeParams() {
    const p = this.p, I = new Int32Array(this.params), U = new Uint32Array(this.params), F = new Float32Array(this.params);
    I[0] = p.N; U[1] = p.probe_every; I[2] = p.probe_i; I[3] = p.probe_j;
    F.set([p.h, p.nu, p.dt, p.R, p.ro, p.Omega, p.omega_o, p.eps], 4);
    U[12] = this.field; F[13] = this.crange;
    F[14] = this.canvas ? this.canvas.width : 1; F[15] = this.canvas ? this.canvas.height : 1;
    this.device.queue.writeBuffer(this.paramBuf, 0, this.params);
  }

  setView(field, crange) {
    this.field = field; this.crange = crange;
    if (this.p) this.writeParams();
  }

  allocate() {
    const dev = this.device, N = this.p.N, nf = N * (N + 1) * 4, nc = N * N * 4;
    for (const b of this.owned || []) b.destroy();
    this.owned = [];
    const B = {};
    B[1] = this.buffer(32);                                    // state
    for (const k of [2, 3, 4, 5, 6, 7]) B[k] = this.buffer(nf);  // u v us vs ru rv
    for (const k of [8, 9, 10, 11, 12]) B[k] = this.buffer(nc);  // q rhs dye dye' scalar
    this.nwg = Math.ceil(N / WG) ** 2;
    B[13] = this.buffer(this.nwg * 32);                        // stats partials
    B[14] = this.buffer(4096 * 8);                             // probe ring
    this.bufs = B;
    this.resetDye();
    this.parity = 0;
    const group = (name, swap) => dev.createBindGroup({ layout: this.layouts[name], entries: [
      { binding: 0, resource: { buffer: this.paramBuf } },
      ...KERNELS[name].map(b => ({ binding: b, resource: { buffer: B[swap && (b === 10 || b === 11) ? 21 - b : b] } }))] });
    this.groups = {};
    for (const name of Object.keys(KERNELS)) this.groups[name] = [group(name, false), group(name, true)];
    // multigrid levels N, N/2, ..., 4; level 0 works in place on q (x) and rhs (b)
    this.levels = [];
    for (let n = N, l = 0; n >= 4; n /= 2, l++) {
      const lv = { n, x: l ? this.buffer(n * n * 4) : B[8], b: l ? this.buffer(n * n * 4) : B[9],
        r: this.buffer(n * n * 4) };
      this.levels.push(lv);
    }
    const dummy = [this.buffer(16), this.buffer(16)];
    this.levels.forEach((lv, l) => {
      const next = this.levels[l + 1];
      lv.groups = [0, 1].map(colour => {
        const ub = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        this.owned.push(ub);
        const a = new ArrayBuffer(16);
        new Int32Array(a).set([lv.n, colour]);
        new Float32Array(a)[2] = (1 / lv.n) ** 2;
        new Int32Array(a)[3] = this.p.ncoarse;
        dev.queue.writeBuffer(ub, 0, a);
        return dev.createBindGroup({ layout: this.mgLayout, entries: [
          { binding: 0, resource: { buffer: ub } }, { binding: 1, resource: { buffer: lv.x } },
          { binding: 2, resource: { buffer: lv.b } }, { binding: 3, resource: { buffer: lv.r } },
          { binding: 4, resource: { buffer: next ? next.x : dummy[0] } },
          { binding: 5, resource: { buffer: next ? next.b : dummy[1] } }] });
      });
    });
    if (this.canvas) this.renderGroup = dev.createBindGroup({ layout: this.renderLayout, entries: [
      { binding: 0, resource: { buffer: this.paramBuf } }, { binding: 1, resource: { buffer: B[1] } },
      { binding: 2, resource: { buffer: B[12] } }] });
    const stage = 32 + this.nwg * 32 + 4096 * 8;
    this.staging = dev.createBuffer({ size: stage, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.owned.push(this.staging);
    this.reading = false;
  }

  reset() { this.allocate(); this.writeParams(); }

  resetDye() {
    const N = this.p.N, dye = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) dye[j * N + i] = Math.floor(j * 8 / N) % 2;
    this.device.queue.writeBuffer(this.bufs[10], 0, dye);
    this.device.queue.writeBuffer(this.bufs[11], 0, dye);
  }

  kernel(pass, name, nx, ny) {
    pass.setPipeline(this.pipes[name]);
    pass.setBindGroup(0, this.groups[name][name === 'advect_dye' || name === 'field' ? this.parity : 0]);
    pass.dispatchWorkgroups(Math.ceil(nx / WG), Math.ceil(ny / WG));
  }

  mg(pass, name, l, colour, threads) {
    pass.setPipeline(this.pipes[name]);
    pass.setBindGroup(0, this.emptyGroup);
    pass.setBindGroup(1, this.levels[l].groups[colour]);
    if (name === 'mg_coarse') pass.dispatchWorkgroups(1);
    else pass.dispatchWorkgroups(Math.ceil(threads / WG), Math.ceil(threads / WG));
  }

  vcycle(pass, l) {
    const lv = this.levels[l], p = this.p;
    if (l === this.levels.length - 1) { this.mg(pass, 'mg_coarse', l, 0, 0); return; }
    for (let k = 0; k < p.nu1; k++) { this.mg(pass, 'mg_smooth', l, 0, lv.n); this.mg(pass, 'mg_smooth', l, 1, lv.n); }
    this.mg(pass, 'mg_residual', l, 0, lv.n);
    this.mg(pass, 'mg_restrict', l, 0, lv.n / 2);
    this.vcycle(pass, l + 1);
    this.mg(pass, 'mg_prolong', l, 0, lv.n);
    for (let k = 0; k < p.nu2; k++) { this.mg(pass, 'mg_smooth', l, 0, lv.n); this.mg(pass, 'mg_smooth', l, 1, lv.n); }
  }

  // record k time steps into one compute pass and submit
  step(k) {
    const N = this.p.N, enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
    for (let s = 0; s < k; s++) {
      this.kernel(pass, 'momentum', N + 1, N + 1);
      this.kernel(pass, 'penalise', N + 1, N + 1);
      this.kernel(pass, 'divergence', N, N);
      for (let c = 0; c < this.p.vcycles; c++) this.vcycle(pass, 0);
      this.kernel(pass, 'project', N + 1, N + 1);
      this.kernel(pass, 'advect_dye', N, N);
      this.parity ^= 1;
      this.kernel(pass, 'record_probe', 1, 1);
      this.kernel(pass, 'advance', 1, 1);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  // colour-map the current field into the canvas (or into a texture, for blit / snapshot)
  draw(texture) {
    const N = this.p.N, enc = this.device.createCommandEncoder();
    const cp = enc.beginComputePass();
    this.kernel(cp, 'field', N, N);
    cp.end();
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: texture.createView(),
      loadOp: 'clear', storeOp: 'store', clearValue: { r: 1, g: 1, b: 1, a: 1 } }] });
    rp.setPipeline(this.renderPipe);
    rp.setBindGroup(0, this.renderGroup);
    rp.draw(3);
    rp.end();
    return enc;
  }

  render() {
    if (!this.canvas) return;
    if (this.blit) { this.blitFrame(); return; }
    this.device.queue.submit([this.draw(this.ctx.getCurrentTexture()).finish()]);
  }

  async blitFrame() {
    if (this.blitting) return;
    this.blitting = true;
    try {
      const img = await this.snapshot();
      if (img) this.ctx2d.putImageData(img, 0, 0);
    } finally { this.blitting = false; }
  }

  // the current frame as ImageData (render to a texture, copy to a buffer, read back)
  async snapshot() {
    const W = this.canvas.width, H = this.canvas.height, dev = this.device;
    const tex = dev.createTexture({ size: [W, H], format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const bpr = Math.ceil(W * 4 / 256) * 256;
    const buf = dev.createBuffer({ size: bpr * H, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.draw(tex);
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [W, H]);
    dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), img = new ImageData(W, H);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = y * bpr + 4 * x, d = 4 * (y * W + x);
      img.data[d] = src[s + (bgra ? 2 : 0)]; img.data[d + 1] = src[s + 1];
      img.data[d + 2] = src[s + (bgra ? 0 : 2)]; img.data[d + 3] = 255;
    }
    buf.unmap(); buf.destroy(); tex.destroy();
    return img;
  }

  // diagnostics: per-workgroup partials reduced on the CPU; null if a read is in flight
  async readStats() {
    if (this.reading) return null;
    this.reading = true;
    const N = this.p.N, B = this.bufs, enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    this.kernel(pass, 'stats', N, N);
    pass.end();
    const st = this.staging;
    enc.copyBufferToBuffer(B[1], 0, st, 0, 32);
    enc.copyBufferToBuffer(B[13], 0, st, 32, this.nwg * 32);
    enc.copyBufferToBuffer(B[14], 0, st, 32 + this.nwg * 32, 4096 * 8);
    this.device.queue.submit([enc.finish()]);
    try {
      await st.mapAsync(GPUMapMode.READ);
    } catch (e) { this.reading = false; return null; }
    if (st !== this.staging) { this.reading = false; return null; }   // reallocated meanwhile
    const raw = st.getMappedRange().slice(0);
    st.unmap();
    this.reading = false;
    const f = new Float32Array(raw), u32 = new Uint32Array(raw);
    const r = { t: f[0], phi: f[1], nstep: u32[4], E: 0, Z: 0, torque: 0, maxdiv: 0, maxspeed: 0, maxvort: 0, maxp: 0 };
    for (let w = 0; w < this.nwg; w++) {
      const o = 8 + 8 * w;
      r.E += f[o]; r.Z += f[o + 1]; r.torque += f[o + 2];
      r.maxdiv = Math.max(r.maxdiv, f[o + 3]); r.maxspeed = Math.max(r.maxspeed, f[o + 4]);
      r.maxvort = Math.max(r.maxvort, f[o + 5]); r.maxp = Math.max(r.maxp, f[o + 6]);
    }
    r.probe = f.subarray(8 + 8 * this.nwg);
    return r;
  }

  async readUV() {
    const N = this.p.N, nf = N * (N + 1) * 4, dev = this.device;
    const st = dev.createBuffer({ size: 2 * nf, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = dev.createCommandEncoder();
    enc.copyBufferToBuffer(this.bufs[2], 0, st, 0, nf);
    enc.copyBufferToBuffer(this.bufs[3], 0, st, nf, nf);
    dev.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const a = new Float32Array(st.getMappedRange().slice(0));
    st.destroy();
    return { u: a.subarray(0, N * (N + 1)), v: a.subarray(N * (N + 1)) };
  }

  async finish() { await this.device.queue.onSubmittedWorkDone(); }

  destroy() {
    for (const b of this.owned || []) b.destroy();
    this.owned = [];
  }
}
