// WebGPU driver for web/lbm.wgsl and web/render.wgsl.  Same interface as
// CpuLbm (web/cpu.js): setParams, setSolid, resetFlow, resetTracer, inject,
// step, stats, readFields, render.
'use strict';

const WG = 128;          // workgroup size of flow_step / tracer_step
const RWG = 256;         // workgroup size of reduce

class GpuLbm {
  static async device() {
    if (!navigator.gpu) throw new Error('this browser has no WebGPU (navigator.gpu is missing)');
    const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
    if (!adapter) throw new Error('no WebGPU adapter available');
    const lim = adapter.limits;
    const device = await adapter.requestDevice({requiredLimits: {
      maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize,
      maxBufferSize: lim.maxBufferSize,
      maxStorageBuffersPerShaderStage: Math.min(10, lim.maxStorageBuffersPerShaderStage)}});
    const info = adapter.info || {};
    return {device, adapter, name: [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'GPU'};
  }

  /** dev: result of GpuLbm.device(); canvas: an HTML canvas (may be null). */
  constructor(dev, nx, ny, solid, canvas) {
    this.kind = 'gpu';
    this.dev = dev; const d = this.device = dev.device;
    this.nx = nx; this.ny = ny; this.n = nx * ny;
    const n = this.n;
    const S = GPUBufferUsage.STORAGE, CD = GPUBufferUsage.COPY_DST, CS = GPUBufferUsage.COPY_SRC;
    const buf = (bytes, usage) => d.createBuffer({size: Math.max(16, bytes), usage});
    this.params = buf(64, GPUBufferUsage.UNIFORM | CD);
    this.view = buf(32, GPUBufferUsage.UNIFORM | CD);
    this.fA = buf(36 * n, S | CD | CS); this.fB = buf(36 * n, S | CD | CS);
    this.gA = buf(20 * n, S | CD); this.gB = buf(20 * n, S | CD);
    this.solidBuf = buf(4 * n, S | CD);
    this.fieldsBuf = buf(16 * n, S | CD | CS);
    this.clockBuf = buf(16, S | CD | CS);
    this.nwg = Math.ceil(n / RWG);
    this.partial = buf(16 * this.nwg, S | CS);
    this.detBuf = buf(64, S | CS);
    this.statBytes = 64 + 16 + 16 * this.nwg;
    this.staging = [buf(this.statBytes, GPUBufferUsage.MAP_READ | CD), buf(this.statBytes, GPUBufferUsage.MAP_READ | CD)];
    this.stagingBusy = [false, false];
    this.p = {wp: 1, wm: 1, gx: 0, gy: 0, twp: 1, twm: 1, cIn: 1, pulse0: 0, pulse1: 0, det: [0, 0, 0]};
    this.clock = 0;

    const mod = d.createShaderModule({code: LBM_WGSL});
    const pipe = (entry) => d.createComputePipeline({layout: 'auto', compute: {module: mod, entryPoint: entry}});
    this.pFlow = pipe('flow_step'); this.pTracer = pipe('tracer_step'); this.pTick = pipe('tick');
    this.pReduce = pipe('reduce'); this.pDetect = pipe('detect');
    const P = {binding: 0, resource: {buffer: this.params}};
    const B = (i, b) => ({binding: i, resource: {buffer: b}});
    const bg = (p, entries) => d.createBindGroup({layout: p.getBindGroupLayout(0), entries});
    this.bgFlow = [bg(this.pFlow, [P, B(1, this.fA), B(2, this.fB), B(3, this.solidBuf), B(4, this.fieldsBuf)]),
      bg(this.pFlow, [P, B(1, this.fB), B(2, this.fA), B(3, this.solidBuf), B(4, this.fieldsBuf)])];
    this.bgTracer = [bg(this.pTracer, [P, B(3, this.solidBuf), B(4, this.fieldsBuf), B(5, this.gA), B(6, this.gB), B(7, this.clockBuf)]),
      bg(this.pTracer, [P, B(3, this.solidBuf), B(4, this.fieldsBuf), B(5, this.gB), B(6, this.gA), B(7, this.clockBuf)])];
    this.bgTick = bg(this.pTick, [B(7, this.clockBuf)]);
    this.bgReduce = bg(this.pReduce, [P, B(3, this.solidBuf), B(4, this.fieldsBuf), B(8, this.partial)]);
    this.bgDetect = bg(this.pDetect, [P, B(3, this.solidBuf), B(4, this.fieldsBuf), B(9, this.detBuf)]);
    this.fi = 0; this.gi = 0;          // which buffer holds the current state

    this.canvas = canvas;
    if (canvas) {
      canvas.width = nx; canvas.height = ny;
      this.ctx = canvas.getContext('webgpu');
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.ctx.configure({device: d, format: this.format, alphaMode: 'opaque'});
      const rmod = d.createShaderModule({code: RENDER_WGSL});
      this.pRender = d.createRenderPipeline({layout: 'auto', vertex: {module: rmod, entryPoint: 'vs'},
        fragment: {module: rmod, entryPoint: 'fs', targets: [{format: this.format}]}, primitive: {topology: 'triangle-list'}});
      this.bgRender = d.createBindGroup({layout: this.pRender.getBindGroupLayout(0),
        entries: [B(0, this.view), B(1, this.fieldsBuf), B(2, this.solidBuf)]});
    }
    this.setSolid(solid);
    this.resetFlow();
  }

  writeParams() {
    const p = this.p, a = new ArrayBuffer(64), u = new Uint32Array(a), f = new Float32Array(a);
    u[0] = this.nx; u[1] = this.ny; u[2] = this.n; u[3] = p.pulse0;
    u[4] = p.pulse1; u[5] = p.det[0]; u[6] = p.det[1]; u[7] = p.det[2];
    f[8] = p.wp; f[9] = p.wm; f[10] = p.gx; f[11] = p.gy;
    f[12] = p.twp; f[13] = p.twm; f[14] = p.cIn; f[15] = 0;
    this.device.queue.writeBuffer(this.params, 0, a);
  }
  setParams(p) { Object.assign(this.p, p); this.writeParams(); }
  setSolid(solid) { this.device.queue.writeBuffer(this.solidBuf, 0, new Uint32Array(solid)); }

  resetFlow() {
    const q = this.device.queue, n = this.n;
    q.writeBuffer(this.fA, 0, new Float32Array(9 * n));
    q.writeBuffer(this.fB, 0, new Float32Array(9 * n));
    const fl = new Float32Array(4 * n);
    for (let k = 0; k < n; k++) fl[4 * k + 2] = 1;
    q.writeBuffer(this.fieldsBuf, 0, fl);
    this.clock = 0;
    q.writeBuffer(this.clockBuf, 0, new Uint32Array(4));
    this.resetTracer();
  }
  resetTracer() {
    const q = this.device.queue;
    q.writeBuffer(this.gA, 0, new Float32Array(5 * this.n));
    q.writeBuffer(this.gB, 0, new Float32Array(5 * this.n));
    this.p.pulse0 = this.p.pulse1 = 0;
    this.writeParams();
  }
  inject(steps) { this.resetTracer(); this.p.pulse0 = this.clock; this.p.pulse1 = this.clock + steps; this.writeParams(); }

  /** Record `count` steps into one command buffer: per step flow, tracer, tick. */
  step(count, opt = {}) {
    const flow = opt.flow !== false, tracer = opt.tracer !== false;
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    const wg = Math.ceil(this.n / WG);
    for (let s = 0; s < count; s++) {
      if (flow) { pass.setPipeline(this.pFlow); pass.setBindGroup(0, this.bgFlow[this.fi]); pass.dispatchWorkgroups(wg); this.fi ^= 1; }
      if (tracer) { pass.setPipeline(this.pTracer); pass.setBindGroup(0, this.bgTracer[this.gi]); pass.dispatchWorkgroups(wg); this.gi ^= 1; }
      pass.setPipeline(this.pTick); pass.setBindGroup(0, this.bgTick); pass.dispatchWorkgroups(1);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.clock += count;
  }

  /** Reductions on the GPU, then one small read-back. */
  async stats() {
    const k = this.stagingBusy[0] ? 1 : 0;
    if (this.stagingBusy[k]) return null;          // both read-backs still in flight: skip
    this.stagingBusy[k] = true;
    const st = this.staging[k];
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pReduce); pass.setBindGroup(0, this.bgReduce); pass.dispatchWorkgroups(this.nwg);
    pass.setPipeline(this.pDetect); pass.setBindGroup(0, this.bgDetect); pass.dispatchWorkgroups(1);
    pass.end();
    enc.copyBufferToBuffer(this.detBuf, 0, st, 0, 64);
    enc.copyBufferToBuffer(this.clockBuf, 0, st, 64, 16);
    enc.copyBufferToBuffer(this.partial, 0, st, 80, 16 * this.nwg);
    this.device.queue.submit([enc.finish()]);
    try {
      await st.mapAsync(GPUMapMode.READ);
      const a = st.getMappedRange();
      const det = new Float32Array(a, 0, 16), clock = new Uint32Array(a, 64, 4)[0], part = new Float32Array(a, 80, 4 * this.nwg);
      let sumUx = 0, maxU = 0, mass = 0, maxC = 0;
      for (let w = 0; w < this.nwg; w++) {
        sumUx += part[4 * w]; maxU = Math.max(maxU, part[4 * w + 1]); mass += part[4 * w + 2]; maxC = Math.max(maxC, part[4 * w + 3]);
      }
      const out = {sumUx, maxU, mass, maxC, clock,
        det: [0, 1, 2].map((j) => [det[4 * j], det[4 * j + 1], det[4 * j + 2]])};
      st.unmap();
      return out;
    } finally { this.stagingBusy[k] = false; }
  }

  async readFields() {
    const d = this.device, bytes = 16 * this.n;
    const st = d.createBuffer({size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
    const enc = d.createCommandEncoder();
    enc.copyBufferToBuffer(this.fieldsBuf, 0, st, 0, bytes);
    d.queue.submit([enc.finish()]);
    await st.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(st.getMappedRange().slice(0));
    st.unmap(); st.destroy();
    return out;
  }

  /** Waits until all submitted work has finished (for timing). */
  finish() { return this.device.queue.onSubmittedWorkDone(); }

  render(canvas, mode, vmax) {
    if (!this.ctx) return;
    const a = new ArrayBuffer(32), u = new Uint32Array(a), f = new Float32Array(a);
    u[0] = this.nx; u[1] = this.ny; u[2] = mode; f[4] = vmax;
    this.device.queue.writeBuffer(this.view, 0, a);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({colorAttachments: [{view: this.ctx.getCurrentTexture().createView(),
      loadOp: 'clear', storeOp: 'store', clearValue: {r: 1, g: 1, b: 1, a: 1}}]});
    pass.setPipeline(this.pRender); pass.setBindGroup(0, this.bgRender); pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  destroy() {
    [this.params, this.view, this.fA, this.fB, this.gA, this.gB, this.solidBuf, this.fieldsBuf, this.clockBuf,
      this.partial, this.detBuf, ...this.staging].forEach((b) => b.destroy());
    if (this.ctx) this.ctx.unconfigure();
  }
}
