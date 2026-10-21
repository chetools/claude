/* lbm_gpu.js -- WebGPU driver of the D3Q19 LBM kernels in lbm.wgsl (float32 populations).
 *
 *   const s = await CC3.lbm.createGpuSolver(device, CC3.lbm.makeParams(inp) [, {wgsl: "..."}]);
 *   await s.step(n);  await s.readVelocity();  s.updateVelocity(); s.velocityBuffer; await s.readTorque(); ...
 *
 * Needs lbm_cpu.js (initial state, makeParams).  WGSL text: opts.wgsl, else CC3.lbm.wgslSource, else the
 * element <script type="text/wgsl" id="wgsl-lbm">.
 *
 * Memory: two population buffers A/B of 19*N*N*Nz*4 bytes each, bound as single storage buffers, so the grid
 * must satisfy 19*N*N*Nz*4 <= device.limits.maxStorageBufferBindingSize (and maxBufferSize).  Browsers default to
 * 128 MiB, which holds 128x128x64 (79.7 MB); bigger grids need a device that was created with larger limits:
 * use CC3.lbm.requestGpuDevice(), which asks the adapter for its maximum.  Too big -> createGpuSolver throws.
 * The body position of every step is computed on the host in float64 (table of centres, one row per step of a
 * chunk) and read by the kernels; the geometry (mask, cut links) is rebuilt on the GPU each step.
 */
(function () {
  "use strict";
  var G = typeof window !== "undefined" ? window : globalThis;
  G.CC3 = G.CC3 || {};
  var lbm = (G.CC3.lbm = G.CC3.lbm || {});
  var CHUNK = 128;           // steps per submission

  function bytesPerPopulationBuffer(p) { return 19 * p.N * p.N * p.Nz * 4; }
  lbm.gpuBytesPerPopulationBuffer = bytesPerPopulationBuffer;

  /** Largest Nz (power of two) that fits for a given N under the device limits (0 if none). */
  lbm.maxNzGpu = function (device, N) {
    var lim = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize), nz = 0;
    for (var z = 1; z <= 4096; z *= 2) if (19 * N * N * z * 4 <= lim) nz = z;
    return nz;
  };

  /** Adapter + device with the adapter's own maximum buffer limits (default limits are only 128 / 256 MiB). */
  lbm.requestGpuDevice = async function (adapterOptions) {
    if (!navigator.gpu) throw new Error("WebGPU is not available");
    var adapter = await navigator.gpu.requestAdapter(adapterOptions);
    if (!adapter) throw new Error("no WebGPU adapter");
    var L = adapter.limits;
    var device = await adapter.requestDevice({ requiredLimits: {
      maxStorageBufferBindingSize: L.maxStorageBufferBindingSize, maxBufferSize: L.maxBufferSize } });
    device._adapter = adapter;      // keep a reference to the adapter
    return device;
  };

  function wgslText(opts) {
    if (opts && opts.wgsl) return opts.wgsl;
    if (lbm.wgslSource) return lbm.wgslSource;
    var el = typeof document !== "undefined" && document.getElementById("wgsl-lbm");
    if (!el) throw new Error("LBM WGSL source not found (opts.wgsl, CC3.lbm.wgslSource or #wgsl-lbm)");
    return el.textContent;
  }

  // bindings used by each kernel (explicit bind-group layouts)
  var KERNELS = {
    geometry: [0, 3, 5, 6], refill: [0, 1, 3, 5, 6], collide_stream: [0, 1, 2, 3, 4, 5, 6, 7],
    links: [0, 2, 3, 4, 5, 6, 7], reduce: [0, 6, 7], massadd: [0, 2, 3, 6],
    velocity: [0, 1, 8, 3], massdiag: [0, 1, 3, 7]
  };
  var BTYPE = { 0: "uniform", 5: "read-only-storage" };

  async function createGpuSolver(device, params, opts) {
    var p = params, N = p.N, Nz = p.Nz, vol = N * N * Nz;
    if (!(p.wall_x !== false && p.wall_y !== false)) throw new Error("periodic x / y boxes are not supported");
    // ---- limits
    var need = bytesPerPopulationBuffer(p);
    var maxB = device.limits.maxStorageBufferBindingSize, maxBuf = device.limits.maxBufferSize;
    if (need > maxB || need > maxBuf) {
      var fit = lbm.maxNzGpu(device, N);
      throw new Error("LBM grid " + N + "x" + N + "x" + Nz + " needs " + (need / 1048576).toFixed(1) +
        " MiB per population buffer, but this GPU device allows " + (Math.min(maxB, maxBuf) / 1048576).toFixed(0) +
        " MiB per storage buffer (maxStorageBufferBindingSize " + maxB + ", maxBufferSize " + maxBuf + "). " +
        (fit ? "Use Nz <= " + fit + " at N = " + N + ", " : "Use a smaller N, ") +
        "or create the device with CC3.lbm.requestGpuDevice() to get the adapter's maximum limits.");
    }
    var nwgNode = Math.ceil(vol / 64);
    var Rc = p.R * N, B = Math.ceil(2 * Rc) + 6;
    var nthB = B * B * Nz, nwgB = Math.ceil(nthB / 64);
    var maxDim = device.limits.maxComputeWorkgroupsPerDimension || 65535;
    // the WGSL linearises workgroups as wid.y * num_workgroups.x + wid.x, so any 2D split works
    function dims(nwg) { var x = Math.min(nwg, maxDim); return [x, Math.ceil(nwg / x)]; }
    if (Math.ceil(nwgNode / maxDim) > maxDim) throw new Error("grid too large for one dispatch");
    var partLen = 2 * nwgNode + 4 * nwgB + 2 * nwgNode;

    var U = GPUBufferUsage, S = U.STORAGE | U.COPY_SRC | U.COPY_DST;
    function mk(size, usage, label) { return device.createBuffer({ size: Math.max(size, 16), usage: usage, label: label }); }
    var st = lbm.initState(p);
    var f32 = new Float32Array(st.f);
    var bufs = {
      A: mk(need, S, "lbm f A"), B: mk(need, S, "lbm f B"), mask: mk(N * N * 4, S, "lbm mask"),
      fpl: mk(B * B * Nz * 19 * 4, S, "lbm fpl"), body: mk(CHUNK * 16, S, "lbm body table"),
      ctl: mk(8 * 4, S, "lbm ctl"), part: mk(partLen * 4, S, "lbm partials"),
      vel: mk(3 * vol * 4, S, "lbm velocity"), uni: mk(16 * 4 * 4 + 91 * 16, U.UNIFORM | U.COPY_DST, "lbm params")
    };
    device.queue.writeBuffer(bufs.A, 0, f32);
    var m0 = new Uint32Array(N * N);
    for (var m = 0; m < N * N; m++) m0[m] = st.solid[m];
    device.queue.writeBuffer(bufs.mask, 0, m0);
    // ---- uniform block
    var ub = new ArrayBuffer(64 + 91 * 16), u32 = new Uint32Array(ub), fl = new Float32Array(ub);
    u32[0] = N; u32[1] = Nz; u32[2] = p.span === "walls" ? 1 : 0; u32[3] = { bgk: 0, reg: 1, mrt: 2 }[p.collision];
    fl[4] = p.omega; fl[5] = Rc; fl[6] = p.omega_o * p.dt; fl[7] = p.Omega * p.dt;
    u32[8] = B; u32[9] = p.mass_fix === false ? 0 : 1; u32[10] = nwgNode; u32[11] = nwgB;
    fl[12] = p.h / p.dt;
    for (var a = 0; a < 19; a++) for (var c = 0; c < 19; c++) fl[16 + a * 19 + c] = p.mrt_A[a][c];
    device.queue.writeBuffer(bufs.uni, 0, ub);

    // ---- pipelines
    var module = device.createShaderModule({ code: wgslText(opts), label: "lbm.wgsl" });
    var info = await module.getCompilationInfo();
    var errs = info.messages.filter(function (mm) { return mm.type === "error"; });
    if (errs.length) throw new Error("lbm.wgsl: " + errs.map(function (e) { return e.lineNum + ":" + e.linePos + " " + e.message; }).join("\n"));
    var NAMES = { 0: "uni", 1: "F", 2: "G", 3: "mask", 4: "fpl", 5: "body", 6: "ctl", 7: "part", 8: "vel" };
    var pipes = {}, layouts = {};
    Object.keys(KERNELS).forEach(function (name) {
      var entries = KERNELS[name].map(function (b) {
        return { binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: BTYPE[b] || "storage" } };
      });
      layouts[name] = device.createBindGroupLayout({ entries: entries, label: name });
      pipes[name] = device.createComputePipeline({
        label: name, layout: device.createPipelineLayout({ bindGroupLayouts: [layouts[name]] }),
        compute: { module: module, entryPoint: name }
      });
    });
    // bind groups for the two ping-pong directions: dir 0: F = A, G = B; dir 1: F = B, G = A
    function group(name, dir) {
      var map = { 0: bufs.uni, 1: dir ? bufs.B : bufs.A, 2: dir ? bufs.A : bufs.B, 3: bufs.mask, 4: bufs.fpl,
                  5: bufs.body, 6: bufs.ctl, 7: bufs.part, 8: bufs.vel };
      return device.createBindGroup({ layout: layouts[name], label: name + dir,
        entries: KERNELS[name].map(function (b) { return { binding: b, resource: { buffer: map[b] } }; }) });
    }
    var bg = [{}, {}];
    Object.keys(KERNELS).forEach(function (name) { bg[0][name] = group(name, 0); bg[1][name] = group(name, 1); });

    var massFix = p.mass_fix !== false;
    var dN = dims(Math.ceil(N * N / 64)), dV = dims(nwgNode), dB = dims(nwgB);
    var stage = null;
    function staging(size) {
      if (!stage || stage.size < size) {
        if (stage) stage.destroy();
        stage = device.createBuffer({ size: size, usage: U.MAP_READ | U.COPY_DST, label: "lbm staging" });
      }
      return stage;
    }
    async function readback(src, offset, bytes) {
      var sb = staging(bytes);
      var enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(src, offset, sb, 0, bytes);
      device.queue.submit([enc.finish()]);
      await sb.mapAsync(GPUMapMode.READ, 0, bytes);
      var out = sb.getMappedRange(0, bytes).slice(0);
      sb.unmap();
      return out;
    }

    var s = {
      params: p, precision: "f32", t: 0, nstep: 0, velocityBuffer: bufs.vel, device: device,
      _phi: 0.0, _dir: 0, _torque: 0, _busy: Promise.resolve()
    };

    /** Advance n steps: chunks of CHUNK steps, one submission each; resolves when the GPU has finished. */
    s.step = function (n) {
      n = n === undefined ? 1 : n;
      while (n > 0) {
        var m = Math.min(n, CHUNK);
        var tab = new Float32Array(CHUNK * 4);
        for (var r = 0; r < m; r++) {
          s._phi += p.omega_o * p.dt;
          tab[4 * r] = N * (0.5 + p.ro * Math.cos(s._phi));
          tab[4 * r + 1] = N * (0.5 + p.ro * Math.sin(s._phi));
        }
        device.queue.writeBuffer(bufs.body, 0, tab);
        device.queue.writeBuffer(bufs.ctl, 0, new Float32Array([0]));
        var enc = device.createCommandEncoder();
        var pass = enc.beginComputePass();
        var dir = s._dir;
        function run(name, d) { pass.setPipeline(pipes[name]); pass.setBindGroup(0, bg[dir][name]); pass.dispatchWorkgroups(d[0], d[1]); }
        for (var r2 = 0; r2 < m; r2++) {
          run("geometry", dN);
          run("refill", dV);
          run("collide_stream", dV);
          run("links", dB);
          pass.setPipeline(pipes.reduce); pass.setBindGroup(0, bg[dir].reduce); pass.dispatchWorkgroups(1);
          if (massFix) run("massadd", dV);
          dir ^= 1;
        }
        // The next chunk's first step reads ctl[0] = 0 again; the step counter only lives inside a chunk.
        pass.end();
        device.queue.submit([enc.finish()]);
        s._dir = dir;
        s.nstep += m; s.t += m * p.dt;
        n -= m;
      }
      return device.queue.onSubmittedWorkDone();
    };

    /** Refresh s.velocityBuffer from the current populations (encodes a kernel). */
    s.updateVelocity = function () {
      var enc = device.createCommandEncoder();
      var pass = enc.beginComputePass();
      pass.setPipeline(pipes.velocity); pass.setBindGroup(0, bg[s._dir].velocity); pass.dispatchWorkgroups(dV[0], dV[1]);
      pass.end();
      device.queue.submit([enc.finish()]);
    };

    s.readVelocity = async function () {
      s.updateVelocity();
      var buf = await readback(bufs.vel, 0, 3 * vol * 4);
      return new Float32Array(buf);
    };

    /** z-torque on the cylinder per unit span of the last step, physical units. */
    s.readTorque = async function () {
      var c = new Float32Array(await readback(bufs.ctl, 0, 8 * 4));
      s._torque = c[4] * (Math.pow(p.h, 4) / (p.dt * p.dt)) / Nz;
      s._force = [c[2] * Math.pow(p.h, 3) / (p.dt * p.dt) / Nz, c[3] * Math.pow(p.h, 3) / (p.dt * p.dt) / Nz];
      return s._torque;
    };
    s.torque = function () { return s._torque; };      // value of the last readTorque() / readVelocity-free refresh

    /** Total mass on the fluid nodes (lattice units): n_fluid + sum(rho - 1), by a parallel reduction. */
    s.mass = async function () {
      var enc = device.createCommandEncoder();
      var pass = enc.beginComputePass();
      pass.setPipeline(pipes.massdiag); pass.setBindGroup(0, bg[s._dir].massdiag); pass.dispatchWorkgroups(dV[0], dV[1]);
      pass.end();
      device.queue.submit([enc.finish()]);
      var o = (2 * nwgNode + 4 * nwgB) * 4;
      var a = new Float32Array(await readback(bufs.part, o, 2 * nwgNode * 4));
      var sum = 0, cnt = 0;
      for (var w = 0; w < nwgNode; w++) { sum += a[2 * w]; cnt += a[2 * w + 1]; }
      return cnt + sum;
    };
    s.readMass = s.mass;

    s.destroy = function () {
      Object.keys(bufs).forEach(function (k) { bufs[k].destroy(); });
      if (stage) stage.destroy();
    };
    return s;
  }
  lbm.createGpuSolver = createGpuSolver;
  if (typeof module !== "undefined" && module.exports) module.exports = lbm;
})();
