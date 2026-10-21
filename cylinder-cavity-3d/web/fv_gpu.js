// ===================================================================== fv_gpu.js
// WebGPU host code for the 3D finite-volume solver: buffers, pipelines, and one time step as a fixed
// list of compute dispatches (kernels in fv.wgsl).  Many steps are encoded into one compute pass per
// submission; the CPU waits for the GPU only when it reads something back.
//
//   const dev = await CC3.fv.requestDevice();                  // asks for the adapter's buffer limits
//   const s = await CC3.fv.createGpuSolver(dev, CC3.fv.makeParams(inp));
//   s.step(100);                                                // returns at once (undefined)
//   const vel = await s.readVelocity();                         // Float32Array [c][k][j][i], physical units
//   s.updateVelocity(); ... s.velocityBuffer                    // GPUBuffer for the renderers
//
// The WGSL text is read from <script type="text/wgsl" id="wgsl-fv"> unless passed as 3rd argument.
(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const CC3 = (root.CC3 = root.CC3 || {});
  const fv = (CC3.fv = CC3.fv || {});

  // group-0 bindings each main kernel uses (binding 0, the parameters, is always included)
  const KERNELS = {
    momentum: [1, 2, 3, 4], penalise: [1, 2, 3], divergence: [2, 6], project: [2, 5], advance: [1],
    cell_velocity: [2, 7], init_seed: [2], stats: [1, 2, 3, 8], stats_final: [1, 8],
  };
  const MG_KERNELS = ["mg_smooth", "mg_residual", "mg_restrict", "mg_prolong", "mg_coarse"];
  const STEPS_PER_PASS = 16;            // phi is re-based on the host every pass (f32 accumulation)
  const NBUF = 5;                        // largest number of storage buffers one kernel binds

  // Buffer sizes (bytes) a grid needs, and the largest single buffer.
  function gpuRequirements(p) {
    const { N, Nz } = p, nc = Nz * N * N;
    const nF = Nz * N * (N + 1) + Nz * (N + 1) * N + (Nz + 1) * N * N;
    return { faceBuffer: 4 * nF, cellBuffer: 4 * nc, velocityBuffer: 12 * nc, largest: Math.max(4 * nF, 12 * nc),
      total: 4 * (3 * nF + 3 * nc + 3 * nc * 1.2) };
  }

  // Adapter + device with the adapter's own buffer limits (the defaults, 128 MiB, are small for big grids).
  async function requestDevice() {
    if (!(typeof navigator !== "undefined" && navigator.gpu)) throw new Error("WebGPU is not available in this browser");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("no WebGPU adapter");
    fv.adapter = adapter;               // keep a reference (Chromium drops the instance otherwise)
    const L = adapter.limits, want = {};
    for (const k of ["maxStorageBufferBindingSize", "maxBufferSize"]) want[k] = L[k];
    return adapter.requestDevice({ requiredLimits: want });
  }

  class GpuSolver {
    constructor(device, params) {
      this.kind = "gpu";
      this.device = device;
      this.params = params;
      this.t = 0; this.nstep = 0; this.phi = 0;
      this._torque = 0; this._maxdiv = 0;
    }

    checkLimits() {
      const p = this.params, lim = this.device.limits, r = gpuRequirements(p);
      const maxBind = lim.maxStorageBufferBindingSize, maxBuf = lim.maxBufferSize;
      if (r.largest > maxBind || r.largest > maxBuf)
        throw new Error(`grid N=${p.N}, Nz=${p.Nz} needs a ${(r.largest / 2 ** 20).toFixed(1)} MiB buffer but this device allows ` +
          `${(Math.min(maxBind, maxBuf) / 2 ** 20).toFixed(1)} MiB (maxStorageBufferBindingSize ${maxBind}, maxBufferSize ${maxBuf}); use a smaller N or Nz, or the CPU fallback`);
      if (lim.maxStorageBuffersPerShaderStage < NBUF)
        throw new Error(`device allows only ${lim.maxStorageBuffersPerShaderStage} storage buffers per stage, ${NBUF} needed`);
      if (lim.maxComputeInvocationsPerWorkgroup < 256) throw new Error("device needs maxComputeInvocationsPerWorkgroup >= 256");
      const wgz = Math.ceil((p.Nz + 1) / 4), wgx = Math.ceil((p.N + 1) / 8);
      if (wgz > lim.maxComputeWorkgroupsPerDimension || wgx > lim.maxComputeWorkgroupsPerDimension)
        throw new Error("grid exceeds maxComputeWorkgroupsPerDimension");
    }

    async build(wgsl) {
      const dev = this.device, p = this.params;
      this.checkLimits();
      if (!wgsl) {
        const el = typeof document !== "undefined" && document.getElementById("wgsl-fv");
        if (!el) throw new Error("fv WGSL source not given and #wgsl-fv not found");
        wgsl = el.textContent;
      }
      dev.lost.then(info => { this.lost = info; });
      const module = dev.createShaderModule({ code: wgsl });
      const info = await module.getCompilationInfo();
      const errs = info.messages.filter(m => m.type === "error");
      if (errs.length) throw new Error("WGSL: " + errs.map(m => `line ${m.lineNum}: ${m.message}`).join("; "));
      const C = GPUShaderStage.COMPUTE;
      dev.pushErrorScope("validation");
      this.layouts = {}; this.pipes = {};
      for (const [name, bind] of Object.entries(KERNELS)) {
        const layout = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: "uniform" } },
          ...bind.map(b => ({ binding: b, visibility: C, buffer: { type: "storage" } }))] });
        this.layouts[name] = layout;
        this.pipes[name] = dev.createComputePipeline({ layout: dev.createPipelineLayout({ bindGroupLayouts: [layout] }),
          compute: { module, entryPoint: name } });
      }
      this.mgLayout = dev.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: { type: "uniform" } },
        ...[1, 2, 3, 4, 5].map(b => ({ binding: b, visibility: C, buffer: { type: "storage" } }))] });
      const mgPL = dev.createPipelineLayout({ bindGroupLayouts: [this.mgLayout] });
      for (const name of MG_KERNELS)
        this.pipes[name] = dev.createComputePipeline({ layout: mgPL, compute: { module, entryPoint: name } });
      const err = await dev.popErrorScope();
      if (err) throw new Error("WebGPU pipeline: " + err.message);
      this.allocate();
      this.initState();
    }

    buffer(bytes, extra = 0) {
      const b = this.device.createBuffer({ size: Math.max(bytes, 16),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | extra });
      this.owned.push(b);
      return b;
    }

    allocate() {
      const dev = this.device, p = this.params, { N, Nz } = p, nc = Nz * N * N;
      const nU = Nz * N * (N + 1), nV = Nz * (N + 1) * N, nW = (Nz + 1) * N * N, nF = nU + nV + nW;
      this.owned = [];
      const B = {};
      B.S = this.buffer(32);
      B.F = this.buffer(4 * nF); B.FS = this.buffer(4 * nF); B.FR = this.buffer(4 * nF);
      B.q = this.buffer(4 * nc); B.rhs = this.buffer(4 * nc);
      B.vel = this.buffer(12 * nc);
      this.nwg = Math.ceil((N + 1) / 16) ** 2;
      B.part = this.buffer(8 * this.nwg);
      this.velocityBuffer = B.vel;
      this.bufs = B;
      // parameter uniform (80 bytes, see struct Params in fv.wgsl)
      const a = new ArrayBuffer(80), I = new Int32Array(a), Fl = new Float32Array(a);
      I.set([N, Nz, p.span === "periodic" ? 1 : 0, nU, nU + nV, Math.min(4, Math.floor(Nz / 2)), 0, 0]);
      Fl.set([p.h, p.nu, p.dt, p.R, p.ro, p.Omega, p.omega_o, p.eps, p.seed, p.Lz, p.Uref, p.omega_o * p.dt], 8);
      this.paramBuf = dev.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.owned.push(this.paramBuf);
      dev.queue.writeBuffer(this.paramBuf, 0, a);
      const slot = { S: 1, F: 2, FS: 3, FR: 4, q: 5, rhs: 6, vel: 7, part: 8 }, inv = Object.fromEntries(Object.entries(slot).map(([k, v]) => [v, k]));
      this.groups = {};
      for (const [name, bind] of Object.entries(KERNELS))
        this.groups[name] = dev.createBindGroup({ layout: this.layouts[name], entries: [
          { binding: 0, resource: { buffer: this.paramBuf } },
          ...bind.map(b => ({ binding: b, resource: { buffer: B[inv[b]] } }))] });
      // multigrid levels (N, Nz), (N/2, Nz/2), ... while z has >= 2 layers; n = 4 is the coarsest.  Level 0 works in place on q, rhs.
      this.levels = [];
      for (let n = N, nz = Nz, l = 0; n >= 4; n /= 2, l++, nz = nz >= 2 ? nz / 2 : 1) {
        const m = nz * n * n;
        this.levels.push({ n, nz, nzc: nz >= 2 ? nz / 2 : 1, x: l ? this.buffer(4 * m) : B.q, b: l ? this.buffer(4 * m) : B.rhs, r: this.buffer(4 * m) });
      }
      const dummy = [this.buffer(16), this.buffer(16)];
      this.levels.forEach((lv, l) => {
        const next = this.levels[l + 1], coarsest = !next;
        lv.groups = [0, 1].map(colour => {
          const ub = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
          this.owned.push(ub);
          const u = new ArrayBuffer(32), ui = new Int32Array(u);
          ui.set([lv.n, lv.nz, lv.nzc, colour]);
          new Float32Array(u)[4] = (p.h * 2 ** l) * (p.h * 2 ** l);
          ui[5] = coarsest ? p.ncoarse : 0; ui[6] = p.span === "periodic" ? 1 : 0;
          dev.queue.writeBuffer(ub, 0, u);
          return dev.createBindGroup({ layout: this.mgLayout, entries: [
            { binding: 0, resource: { buffer: ub } }, { binding: 1, resource: { buffer: lv.x } },
            { binding: 2, resource: { buffer: lv.b } }, { binding: 3, resource: { buffer: lv.r } },
            { binding: 4, resource: { buffer: next ? next.x : dummy[0] } },
            { binding: 5, resource: { buffer: next ? next.b : dummy[1] } }] });
        });
      });
    }

    // ------------------------------------------------------------- dispatch helpers
    kernel(pass, name, nx, ny, nz) {
      pass.setPipeline(this.pipes[name]);
      pass.setBindGroup(0, this.groups[name]);
      pass.dispatchWorkgroups(Math.ceil(nx / 8), Math.ceil(ny / 8), Math.ceil(nz / 4));
    }
    column(pass, name) {                    // 16 x 16 threads over (i, j) columns
      const N1 = this.params.N + 1;
      pass.setPipeline(this.pipes[name]);
      pass.setBindGroup(0, this.groups[name]);
      pass.dispatchWorkgroups(Math.ceil(N1 / 16), Math.ceil(N1 / 16));
    }
    single(pass, name) { pass.setPipeline(this.pipes[name]); pass.setBindGroup(0, this.groups[name]); pass.dispatchWorkgroups(1); }
    mg(pass, name, l, colour) {
      const lv = this.levels[l], nc = lv.n / 2;
      pass.setPipeline(this.pipes[name]);
      pass.setBindGroup(0, lv.groups[colour]);
      if (name === "mg_coarse") pass.dispatchWorkgroups(1);
      else if (name === "mg_smooth") pass.dispatchWorkgroups(Math.ceil(lv.n / 16), Math.ceil(lv.n / 16));
      else if (name === "mg_restrict") pass.dispatchWorkgroups(Math.ceil(nc / 8), Math.ceil(nc / 8), Math.ceil(lv.nzc / 4));
      else pass.dispatchWorkgroups(Math.ceil(lv.n / 8), Math.ceil(lv.n / 8), Math.ceil(lv.nz / 4));
    }

    vcycle(pass, l) {
      const p = this.params;
      if (l === this.levels.length - 1) { this.mg(pass, "mg_coarse", l, 0); return; }
      for (let k = 0; k < p.nu1; k++) { this.mg(pass, "mg_smooth", l, 0); this.mg(pass, "mg_smooth", l, 1); }
      this.mg(pass, "mg_residual", l, 0);
      this.mg(pass, "mg_restrict", l, 0);
      this.vcycle(pass, l + 1);
      this.mg(pass, "mg_prolong", l, 0);
      for (let k = 0; k < p.nu2; k++) { this.mg(pass, "mg_smooth", l, 0); this.mg(pass, "mg_smooth", l, 1); }
    }

    // ------------------------------------------------------------- initial state, steps
    // Fluid at rest plus the deliberate 3D seed on the w faces, one projection (16 V-cycles from q = 0).
    initState() {
      const p = this.params, { N, Nz } = p;
      this.t = 0; this.nstep = 0; this.phi = 0;
      this.device.queue.writeBuffer(this.bufs.S, 0, new Uint32Array(8));
      if (!(Nz > 1 && p.seed !== 0)) return;
      const enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
      this.kernel(pass, "init_seed", N, N, Nz + 1);
      this.kernel(pass, "divergence", N, N, Nz);
      for (let c = 0; c < 16; c++) this.vcycle(pass, 0);
      this.kernel(pass, "project", N + 1, N + 1, Nz + 1);
      pass.end();
      enc.clearBuffer(this.bufs.q);                      // q = dt * pressure of the first step starts from 0
      this.device.queue.submit([enc.finish()]);
    }

    reset() {
      const enc = this.device.createCommandEncoder();
      for (const k of ["F", "FS", "FR", "q", "rhs", "vel"]) enc.clearBuffer(this.bufs[k]);
      this.device.queue.submit([enc.finish()]);
      this.initState();
    }

    // Advance n steps.  Returns at once; the work is queued (readVelocity / finish() wait for it).
    step(n) {
      n = n === undefined ? 1 : n;
      const p = this.params, { N, Nz } = p, dev = this.device, TWO_PI = 2 * Math.PI;
      for (let done = 0; done < n; done += STEPS_PER_PASS) {
        const cnt = Math.min(STEPS_PER_PASS, n - done);
        const hw = new ArrayBuffer(12);                  // State words 2..4: phi, phi0, local
        new Float32Array(hw).set([this.phi, this.phi]);
        new Uint32Array(hw)[2] = 0;
        dev.queue.writeBuffer(this.bufs.S, 8, hw);
        const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
        for (let s = 0; s < cnt; s++) {
          this.kernel(pass, "momentum", N + 1, N + 1, Nz + 1);
          this.kernel(pass, "penalise", N + 1, N + 1, Nz + 1);
          this.kernel(pass, "divergence", N, N, Nz);
          for (let c = 0; c < p.vcycles; c++) this.vcycle(pass, 0);
          this.kernel(pass, "project", N + 1, N + 1, Nz + 1);
          this.single(pass, "advance");
        }
        pass.end();
        dev.queue.submit([enc.finish()]);
        this.phi = (this.phi + cnt * p.omega_o * p.dt) % TWO_PI;
        if (this.phi < 0) this.phi += TWO_PI;
      }
      this.nstep += n; this.t += n * p.dt;
    }

    async finish() { await this.device.queue.onSubmittedWorkDone(); }

    // ------------------------------------------------------------- read-back
    encodeStats(pass) { this.column(pass, "stats"); this.single(pass, "stats_final"); }

    // cell-centred velocity into velocityBuffer ([c][k][j][i], f32, physical units); call before rendering
    updateVelocity() {
      const { N, Nz } = this.params, enc = this.device.createCommandEncoder(), pass = enc.beginComputePass();
      this.kernel(pass, "cell_velocity", N, N, Nz);
      pass.end();
      this.device.queue.submit([enc.finish()]);
    }

    async readBack(withVelocity) {
      const { N, Nz } = this.params, dev = this.device, nbytes = 12 * Nz * N * N;
      const st = dev.createBuffer({ size: (withVelocity ? nbytes : 0) + 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
      if (withVelocity) this.kernel(pass, "cell_velocity", N, N, Nz);
      this.encodeStats(pass);
      pass.end();
      if (withVelocity) enc.copyBufferToBuffer(this.bufs.vel, 0, st, 0, nbytes);
      enc.copyBufferToBuffer(this.bufs.S, 0, st, withVelocity ? nbytes : 0, 32);
      dev.queue.submit([enc.finish()]);
      await st.mapAsync(GPUMapMode.READ);
      const raw = st.getMappedRange().slice(0);
      st.unmap(); st.destroy();
      const sw = new Float32Array(raw, withVelocity ? nbytes : 0, 8);
      this._torque = sw[5]; this._maxdiv = sw[6];
      return withVelocity ? new Float32Array(raw, 0, nbytes / 4) : null;
    }

    async readVelocity() { return this.readBack(true); }
    async readTorque() { await this.readBack(false); return this._torque; }
    async readMaxdiv() { await this.readBack(false); return this._maxdiv; }
    torque() { return this._torque; }       // value of the last readVelocity / readTorque
    maxdiv() { return this._maxdiv; }

    destroy() { for (const b of this.owned || []) b.destroy(); this.owned = []; }
  }

  async function createGpuSolver(device, params, wgsl) {
    const s = new GpuSolver(device, params);
    await s.build(wgsl);
    return s;
  }

  Object.assign(fv, { createGpuSolver, requestDevice, gpuRequirements, GpuSolver });
  if (typeof module !== "undefined" && module.exports) module.exports = fv;
})();
