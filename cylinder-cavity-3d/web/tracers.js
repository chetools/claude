// tracers.js: flow particles (massless tracers carried by the computed velocity) and their trails.
//
// The readable reference is velAt() + rk2() + CpuTracers.advect() below (float64).  web/trails.wgsl is its GPU
// port; the page's self-test compares the two value by value (selftest()).
//
// A trail is the particle's path over the last `trailTime` units of simulated time, stored as KPTS points spaced
// dts = trailTime / (KPTS - 1) apart.  The spacing is in simulated time, so a trail looks the same however much
// time one frame covers (that depends on the machine).
//
// API
//   CC3.tracers.velAt(U, g, x, y, z) -> [u, v, w]      trilinear interpolation of the cell-centred velocity
//       U: velocity [c][k][j][i] (length 3*Nz*N*N), g = {N, Nz, h, Lz, span, R, ro}
//   CC3.tracers.trailTime(i)                            slider step 0..7 -> trail length in time units (TRAIL_STEPS)
//   CC3.tracers.SPEED_RAMP                              trail colour stops, slow -> fast (same as trails.wgsl ramp)
//   CC3.tracers.keepHash(p)                             in [0, 1): particle p is drawn when keepHash(p) < keep
//   new CC3.tracers.CpuTracers(g, count)                .advect(U, tau, phi, p), .drawSlice(ctx2d, view) (CPU fallback)
//   new CC3.tracers.GpuTracers(device, g, count)        .advect(velocityBuffer, tau, phi, p), .encodeDraw(rp, o) (render.js)
//   both: .trailTime, .smax (speed at the dark end of the colour ramp), .draw = {keep, alpha} (set by the page),
//         .setState(xyz) / .readState() (tests)
//   CC3.tracers.selftest({device?}) -> rows {name, expected, got, reldiff, tol, pass}
(function (root) {
  "use strict";
  const CC3 = (root.CC3 = root.CC3 || {});
  const KPTS = 24;                                         // points per trail (the ring length)
  const TRAIL_STEPS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1];   // trail lengths offered (time units)
  const trailTime = (i) => TRAIL_STEPS[Math.min(Math.max(Math.round(i), 0), TRAIL_STEPS.length - 1)];
  const SPEED_RAMP = [[0.52, 0.63, 0.82], [0.30, 0.45, 0.80], [0.42, 0.18, 0.62], [0.12, 0.04, 0.22]];
  function rampColour(t) {
    const s = Math.min(Math.max(t, 0), 1) * 3, k = Math.min(Math.floor(s), 2), f = s - k, a = SPEED_RAMP[k], b = SPEED_RAMP[k + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  // the PCG hash of trails.wgsl, in 32-bit integer arithmetic
  function pcg(v) {
    const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
    const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
    return ((w >>> 22) ^ w) >>> 0;
  }
  const keepHash = (p) => (pcg((p ^ 0x9e3779b9) >>> 0) >>> 8) / 16777216;

  // ------------------------------------------------------------------ reference: velocity at a point
  // Cell centres sit at ((i+1/2)h, (j+1/2)h, (k+1/2)h).  Between the last centre and a wall the no-slip
  // odd-mirror ghost  -(edge value)  is used, so the interpolated velocity is exactly zero on the walls
  // (the same ghost rule as diagnostics.py and render.wgsl).  Periodic z wraps.
  function velAt(U, g, x0, y0, z0) {
    const n = g.N, nz = g.Nz, h = g.h, per = g.span !== "walls";
    const x = Math.min(Math.max(x0, 0), 1), y = Math.min(Math.max(y0, 0), 1);
    const z = per ? z0 - g.Lz * Math.floor(z0 / g.Lz) : Math.min(Math.max(z0, 0), g.Lz);
    const fx = x * n - 0.5, fy = y * n - 0.5, fz = z / h - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy), k0 = Math.floor(fz);
    const tx = fx - i0, ty = fy - j0, tz = fz - k0;
    const vg = (c, i, j, k) => {
      let s = 1;
      if (i < 0) { i = 0; s = -s; } else if (i >= n) { i = n - 1; s = -s; }
      if (j < 0) { j = 0; s = -s; } else if (j >= n) { j = n - 1; s = -s; }
      if (k < 0) { if (per) k = nz - 1; else { k = 0; s = -s; } }
      else if (k >= nz) { if (per) k = 0; else { k = nz - 1; s = -s; } }
      return s * U[((c * nz + k) * n + j) * n + i];
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const a0 = lerp(lerp(vg(c, i0, j0, k0), vg(c, i0 + 1, j0, k0), tx), lerp(vg(c, i0, j0 + 1, k0), vg(c, i0 + 1, j0 + 1, k0), tx), ty);
      const a1 = lerp(lerp(vg(c, i0, j0, k0 + 1), vg(c, i0 + 1, j0, k0 + 1), tx), lerp(vg(c, i0, j0 + 1, k0 + 1), vg(c, i0 + 1, j0 + 1, k0 + 1), tx), ty);
      out[c] = lerp(a0, a1, tz);
    }
    return out;
  }

  // one RK2 (midpoint) step of length dt with the velocity frozen
  function rk2(U, g, q, dt) {
    const u1 = velAt(U, g, q[0], q[1], q[2]);
    const u2 = velAt(U, g, q[0] + 0.5 * dt * u1[0], q[1] + 0.5 * dt * u1[1], q[2] + 0.5 * dt * u1[2]);
    return [q[0] + dt * u2[0], q[1] + dt * u2[1], q[2] + dt * u2[2]];
  }
  // n steps over tau (no walls, no re-seeding): used by the self-test
  function advectOne(U, g, q0, tau, n) {
    let q = q0;
    for (let s = 0; s < n; s++) q = rk2(U, g, q, tau / n);
    return q;
  }

  // Substeps for a move over tau, split exactly at the trail-point times (every dts of simulated time), so a trail
  // is sampled the same whatever time one frame covers.  Each piece between two trail points is cut into substeps
  // that move at most h/2 at the body's top speed.  `clock.t` carries the time since the last trail point.
  // Returns {dt: substep lengths, mark: 1 where a substep ends with a trail point, n: number of trail points}.
  const MAXSUB = 256;
  function schedule(tau, p, dts, clock) {
    const umax = Math.abs(p.Us) + Math.abs(p.omega_o || 0) * (p.ro + p.R) || 1, hmax = 0.5 * p.h / umax;
    const dt = [], mark = [];
    let left = tau, c = clock.t, n = 0;
    const eps = 1e-9 * dts;                                  // rounding: a trail point due within eps is taken now
    while (left > eps && dt.length < MAXSUB) {
      const toPoint = Math.max(dts - c, 0), hit = toPoint <= left + eps, seg = hit ? toPoint : left;
      const m = Math.max(1, Math.ceil(seg / hmax - 1e-9));
      for (let s = 0; s < m; s++) { dt.push(seg / m); mark.push(0); }
      if (hit) { mark[mark.length - 1] = 1; n++; c = 0; } else c += seg;
      left -= seg;
    }
    clock.t = c;
    return { dt: Float64Array.from(dt), mark: Uint8Array.from(mark), sub: dt.length, n };
  }

  // ------------------------------------------------------------------ CPU tracers (fallback and reference)
  // Trail ring: point (p, slot) = x y z w, w = |u| there, -1 = a path starts here, -2 = empty.
  class CpuTracers {
    constructor(g, count) {
      this.g = g; this.np = count; this.kcap = KPTS; this.trailTime = trailTime(3);
      this.pos = new Float64Array(3 * count); this.age = new Float64Array(count);
      this.life = new Float64Array(count);                      // zero lifetimes: all spawn on the first move
      this.brk = new Uint8Array(count).fill(1);
      this.trail = new Float32Array(4 * count * this.kcap);
      for (let m = 0; m < count * this.kcap; m++) this.trail[4 * m + 3] = -2;
      this.frame = 0; this.head = 0; this.points = 0; this.clock = { t: 0 }; this.smax = 1;
      this.draw = { keep: 1, alpha: 0.8 }; this.random = Math.random;
    }
    setState(xyz, life = 1e30) { this.pos.set(xyz); this.age.fill(0); this.life.fill(life); this.brk.fill(0); }
    readState() { return this.pos.slice(); }
    advect(U, tau, phi, p) {
      if (!(tau > 0) || !this.np) return;
      const g = this.g, S = schedule(tau, p || g, this.trailTime / (KPTS - 1), this.clock), T = this.trail;
      const cx = 0.5 + g.ro * Math.cos(phi), cy = 0.5 + g.ro * Math.sin(phi), per = g.span !== "walls";
      for (let k = 0; k < this.np; k++) {
        let q = [this.pos[3 * k], this.pos[3 * k + 1], this.pos[3 * k + 2]], slot = this.head;
        for (let s = 0; s < S.sub; s++) {
          q = rk2(U, g, q, S.dt[s]);
          this.age[k] += S.dt[s];
          if (per && (q[2] < 0 || q[2] >= g.Lz)) { q[2] -= g.Lz * Math.floor(q[2] / g.Lz); this.brk[k] = 1; }
          const out = q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1 || (!per && (q[2] < 0 || q[2] > g.Lz));
          if (this.age[k] >= this.life[k] || out || Math.hypot(q[0] - cx, q[1] - cy) < g.R) {   // re-seed: a new path
            q = [this.random(), this.random(), this.random() * g.Lz];
            this.age[k] = 0; this.life[k] = 2 + 2 * this.random(); this.brk[k] = 1;
          }
          if (S.mark[s]) {                                      // a trail point, every dts of simulated time
            slot = (slot + 1) % this.kcap;
            const u = velAt(U, g, q[0], q[1], q[2]), o = 4 * (k * this.kcap + slot);
            T[o] = q[0]; T[o + 1] = q[1]; T[o + 2] = q[2]; T[o + 3] = this.brk[k] ? -1 : Math.hypot(u[0], u[1], u[2]);
            this.brk[k] = 0;
          }
        }
        this.pos[3 * k] = q[0]; this.pos[3 * k + 1] = q[1]; this.pos[3 * k + 2] = q[2];
      }
      this.head = (this.head + S.n) % this.kcap; this.points += S.n; this.frame++;
      this.lastSub = S.sub; this.lastPoints = S.n;
    }
    // slice views on a 2D canvas: same selection, colour and opacity as vs_trail in trails.wgsl
    drawSlice(ctx, view) {
      if (!this.np || this.points < 2) return;
      const cv = ctx.canvas, g = this.g, mode = view.mode, L = CC3.render.planeLayout(cv.width, cv.height, mode, g.Lz);
      const slab = 2 * g.h, f = view.slice === undefined ? 0.5 : view.slice, spos = mode === "slice-xy" ? f * g.Lz : f;
      const per = g.span !== "walls", T = this.trail, km1 = KPTS - 1, D = this.draw, phi = view.phi || 0;
      const cx = 0.5 + g.ro * Math.cos(phi), cy = 0.5 + g.ro * Math.sin(phi);
      const px = (o) => {
        const u = mode === "slice-yz" ? T[o + 1] : T[o], v = mode === "slice-xy" ? T[o + 1] : T[o + 2];
        return [L.ox + u * L.sc, L.oy - v * L.sc];
      };
      const NC = 8, NA = 4, buckets = Array.from({ length: NC * NA }, () => []);
      for (let p = 0; p < this.np; p++) {
        if (keepHash(p) >= D.keep) continue;
        for (let a = 0; a < km1; a++) {
          const on = 4 * (p * this.kcap + (this.head + this.kcap - a) % this.kcap);
          const oo = 4 * (p * this.kcap + (this.head + 2 * this.kcap - a - 1) % this.kcap);
          if (T[on + 3] < 0 || T[oo + 3] < -1.5) continue;
          let d = mode === "slice-xy" ? T[on + 2] - spos : mode === "slice-xz" ? T[on + 1] - spos : T[on] - spos;
          if (mode === "slice-xy" && per) d -= g.Lz * Math.round(d / g.Lz);
          if (Math.abs(d) > slab) continue;
          if (Math.hypot(T[on] - cx, T[on + 1] - cy) < g.R || Math.hypot(T[oo] - cx, T[oo + 1] - cy) < g.R) continue;   // under the cylinder now
          const alpha = 1 - a / km1;
          const c = Math.min(NC - 1, Math.floor(Math.min(T[on + 3] / this.smax, 1) * NC));
          buckets[c * NA + Math.min(NA - 1, Math.floor(alpha * NA))].push([px(oo), px(on)]);
        }
      }
      ctx.lineWidth = Math.max(1, L.ms * 0.75);
      buckets.forEach((segs, b) => {
        if (!segs.length) return;
        const col = rampColour((Math.floor(b / NA) + 0.5) / NC).map((x) => Math.round(255 * x)).join(",");
        ctx.strokeStyle = `rgba(${col},${D.alpha * ((b % NA) + 0.5) / NA})`;
        ctx.beginPath();
        for (const [a, c] of segs) { ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
        ctx.stroke();
      });
    }
    destroy() {}
  }

  // ------------------------------------------------------------------ GPU tracers (web/trails.wgsl)
  class GpuTracers {
    constructor(device, g, count, wgsl) {
      this.device = device; this.g = g; this.np = count; this.kcap = KPTS; this.trailTime = trailTime(3);
      this.frame = 0; this.head = 0; this.points = 0; this.clock = { t: 0 }; this.smax = 1; this.draw = { keep: 1, alpha: 0.8 };
      const U = GPUBufferUsage;
      this.mod = device.createShaderModule({ code: wgsl || document.getElementById("wgsl-trails").textContent });
      this.state = device.createBuffer({ size: Math.max(32, 32 * count), usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
      this.trail = device.createBuffer({ size: Math.max(16, 16 * count * this.kcap), usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
      this.tp = device.createBuffer({ size: 64, usage: U.UNIFORM | U.COPY_DST });
      this.td = device.createBuffer({ size: 144, usage: U.UNIFORM | U.COPY_DST });
      this.sch = device.createBuffer({ size: 8 * MAXSUB, usage: U.STORAGE | U.COPY_DST });
      const init = new Float32Array(4 * count * this.kcap);
      for (let m = 0; m < count * this.kcap; m++) init[4 * m + 3] = -2;
      device.queue.writeBuffer(this.trail, 0, init);
      const st0 = new Float32Array(8 * count);                       // zero lifetimes: all spawn on the first move
      for (let k = 0; k < count; k++) st0[8 * k + 5] = 1;
      device.queue.writeBuffer(this.state, 0, st0);
      const S = GPUShaderStage, st = (b, vis, type) => ({ binding: b, visibility: vis, buffer: { type } });
      this.lA = device.createBindGroupLayout({ entries: [st(0, S.COMPUTE, "uniform"), st(1, S.COMPUTE, "read-only-storage"),
        st(2, S.COMPUTE, "storage"), st(3, S.COMPUTE, "storage"), st(6, S.COMPUTE, "read-only-storage")] });
      this.lD = device.createBindGroupLayout({ entries: [st(4, S.VERTEX, "uniform"), st(5, S.VERTEX, "read-only-storage")] });
      this.pAdvect = device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [this.lA] }),
        compute: { module: this.mod, entryPoint: "cs_advect" } });
      this.bgD = device.createBindGroup({ layout: this.lD, entries: [{ binding: 4, resource: { buffer: this.td } },
        { binding: 5, resource: { buffer: this.trail } }] });
      this.pipes = {};
      this.ready = this.mod.getCompilationInfo().then((info) => {
        const errs = info.messages.filter((m) => m.type === "error").map((m) => `trails.wgsl:${m.lineNum}: ${m.message}`);
        if (errs.length) throw new Error("WGSL compile errors:\n" + errs.join("\n"));
        return true;
      });
    }
    pipe(fmt) {
      if (this.pipes[fmt]) return this.pipes[fmt];
      return (this.pipes[fmt] = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.lD] }),
        vertex: { module: this.mod, entryPoint: "vs_trail" },
        fragment: { module: this.mod, entryPoint: "fs_trail", targets: [{ format: fmt, blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } } }] },
        primitive: { topology: "line-list" },
        depthStencil: { format: "depth32float", depthWriteEnabled: false, depthCompare: "less-equal" } }));
    }
    setState(xyz, life = 1e30) {
      const a = new Float32Array(8 * this.np);
      for (let k = 0; k < this.np; k++) { a.set([xyz[3 * k], xyz[3 * k + 1], xyz[3 * k + 2], 0, life, 0, 0, 0], 8 * k); }
      this.device.queue.writeBuffer(this.state, 0, a);
    }
    async readBuf(b, bytes) {
      const rb = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const e = this.device.createCommandEncoder(); e.copyBufferToBuffer(b, 0, rb, 0, bytes);
      this.device.queue.submit([e.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy();
      return out;
    }
    async readState() {                    // tests: positions (x y z per particle) and the pending path-break flags
      const a = await this.readBuf(this.state, 32 * this.np), pos = new Float64Array(3 * this.np), brk = new Uint8Array(this.np);
      for (let k = 0; k < this.np; k++) { pos[3 * k] = a[8 * k]; pos[3 * k + 1] = a[8 * k + 1]; pos[3 * k + 2] = a[8 * k + 2]; brk[k] = a[8 * k + 5] > 0.5 ? 1 : 0; }
      pos.brk = brk;
      return pos;
    }
    async readTrail() { return this.readBuf(this.trail, 16 * this.np * this.kcap); }
    advect(vb, tau, phi, p) {
      if (!(tau > 0) || !this.np) return;
      const g = this.g, S = schedule(tau, p || g, this.trailTime / (KPTS - 1), this.clock);
      const sch = new Float32Array(2 * MAXSUB);
      for (let k = 0; k < S.sub; k++) { sch[2 * k] = S.dt[k]; sch[2 * k + 1] = S.mark[k]; }
      this.device.queue.writeBuffer(this.sch, 0, sch, 0, Math.max(2, 2 * S.sub));
      const d = new ArrayBuffer(64), F = new Float32Array(d), I = new Int32Array(d), Ui = new Uint32Array(d);
      I[0] = g.N; I[1] = g.Nz; Ui[2] = g.span !== "walls" ? 1 : 0; Ui[3] = this.np;
      F[4] = g.h; F[5] = g.Lz; F[6] = g.R; F[7] = g.ro;
      F[8] = phi; F[9] = tau; Ui[10] = S.sub; Ui[11] = this.head;
      Ui[12] = this.kcap; Ui[13] = this.frame >>> 0;
      this.device.queue.writeBuffer(this.tp, 0, d);
      const bg = this.device.createBindGroup({ layout: this.lA, entries: [{ binding: 0, resource: { buffer: this.tp } },
        { binding: 1, resource: { buffer: vb } }, { binding: 2, resource: { buffer: this.state } }, { binding: 3, resource: { buffer: this.trail } },
        { binding: 6, resource: { buffer: this.sch } }] });
      const e = this.device.createCommandEncoder(), cp = e.beginComputePass();
      cp.setPipeline(this.pAdvect); cp.setBindGroup(0, bg); cp.dispatchWorkgroups(Math.ceil(this.np / 64));
      cp.end();
      this.device.queue.submit([e.finish()]);
      this.head = (this.head + S.n) % this.kcap; this.points += S.n; this.frame++;
      this.lastSub = S.sub; this.lastPoints = S.n;
    }
    // called by render.js inside its render pass. o = {fmt, mode (1..5), vp, L (planeLayout), W, H, slice, phi}
    encodeDraw(rp, o) {
      if (!this.np || this.points < 2) return;
      const g = this.g, d = new ArrayBuffer(144), F = new Float32Array(d), Ui = new Uint32Array(d);
      F.set(o.vp, 0);
      F[16] = o.L.ox; F[17] = o.L.oy; F[18] = o.L.sc; Ui[19] = o.mode;
      F[20] = o.W; F[21] = o.H; F[22] = o.mode === 1 ? o.slice * g.Lz : o.slice; F[23] = 2 * g.h;
      Ui[24] = this.np; Ui[25] = this.kcap; Ui[26] = KPTS; Ui[27] = this.head;
      F[28] = this.smax; F[29] = g.Lz; Ui[30] = g.span !== "walls" ? 1 : 0; F[31] = this.draw.keep;
      F[32] = this.draw.alpha; F[33] = 0.5 + g.ro * Math.cos(o.phi || 0); F[34] = 0.5 + g.ro * Math.sin(o.phi || 0); F[35] = g.R;
      this.device.queue.writeBuffer(this.td, 0, d);
      rp.setPipeline(this.pipe(o.fmt)); rp.setBindGroup(0, this.bgD);
      rp.draw(2 * this.np * (KPTS - 1));
    }
    destroy() { this.state.destroy(); this.trail.destroy(); this.tp.destroy(); this.td.destroy(); this.sch.destroy(); }
  }

  // ------------------------------------------------------------------ self-test
  // CPU: the interpolation against exact values (a linear field, the no-slip walls) and the RK2 path against an
  // exact circle.  GPU: trails.wgsl against this file's float64 reference on the same float32 velocity field.
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function fieldOf(g, fn) {
    const n = g.N, nz = g.Nz, U = new Float64Array(3 * nz * n * n);
    for (let k = 0; k < nz; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = fn((i + 0.5) * g.h, (j + 0.5) * g.h, (k + 0.5) * g.h);
      for (let c = 0; c < 3; c++) U[((c * nz + k) * n + j) * n + i] = v[c];
    }
    return U;
  }
  // a smooth 3D test flow (not divergence-free; only the interpolation and the integrator are tested)
  const testFlow = (g) => (x, y, z) => {
    const kz = 2 * Math.PI / g.Lz;
    return [Math.sin(Math.PI * x) * Math.cos(Math.PI * y) * (0.6 + 0.3 * Math.cos(kz * z)),
      -Math.cos(Math.PI * x) * Math.sin(Math.PI * y) * (0.6 - 0.2 * Math.sin(kz * z)),
      0.25 * Math.sin(2 * Math.PI * x) * Math.sin(Math.PI * y) * Math.cos(kz * z)];
  };

  function cpuRows() {
    const rows = [];
    const row = (name, got, tol) => rows.push({ name, expected: 0, got, reldiff: got, tol, pass: got <= tol });
    for (const span of ["periodic", "walls"]) {
      const g = { N: 16, Nz: 8, h: 1 / 16, Lz: 0.5, span, R: 0.1, ro: 0.2 };
      const lin = (x, y, z) => [0.3 + 0.7 * x - 0.2 * y + 0.5 * z, -0.1 + 0.4 * x + 0.9 * y - 0.3 * z, 0.2 - 0.6 * x + 0.1 * y + 0.8 * z];
      const U = fieldOf(g, lin), r = lcg(7);
      let e = 0, m = 0;
      for (let s = 0; s < 64; s++) {                          // interior: inside the hull of the cell centres
        const x = g.h / 2 + r() * (1 - g.h), y = g.h / 2 + r() * (1 - g.h), z = g.h / 2 + r() * (g.Lz - g.h);
        const a = velAt(U, g, x, y, z), b = lin(x, y, z);
        for (let c = 0; c < 3; c++) { e = Math.max(e, Math.abs(a[c] - b[c])); m = Math.max(m, Math.abs(b[c])); }
      }
      row(`trilinear velocity of a linear field, 64 interior points (${span}): max error / max |u|`, e / m, 1e-12);
      const V = fieldOf(g, testFlow(g));
      let w = 0, vm = 0;
      for (let s = 0; s < 64; s++) {                          // points on the four side walls (and end walls)
        const t = r(), u = r() * g.Lz, side = s % (span === "walls" ? 6 : 4);
        const q = [[0, t, u], [1, t, u], [t, 0, u], [t, 1, u], [t, r(), 0], [t, r(), g.Lz]][side];
        const a = velAt(V, g, q[0], q[1], q[2]);
        w = Math.max(w, Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]));
      }
      for (let m2 = 0; m2 < V.length; m2++) vm = Math.max(vm, Math.abs(V[m2]));
      row(`velocity on the no-slip walls, 64 points (${span}): max |u| / max |u| of the field`, w / vm, 1e-12);
    }
    // RK2 in solid-body rotation u = Omega x (r - c) (a linear field: interpolated exactly), a quarter turn,
    // against the exact circle, with 32 and 64 substeps.  A second-order method divides the error by 4.
    const g = { N: 32, Nz: 2, h: 1 / 32, Lz: 1 / 16, span: "periodic", R: 0.01, ro: 0 };
    const U = fieldOf(g, (x, y) => [-(y - 0.5), x - 0.5, 0]);
    const errOf = (sub) => { const q = advectOne(U, g, [0.75, 0.5, 0.03], Math.PI / 2, sub); return Math.hypot(q[0] - 0.5, q[1] - 0.75) / 0.25; };
    const e32 = errOf(32), e64 = errOf(64), ratio = e32 / e64;
    rows.push({ name: `RK2 path, solid rotation, a quarter turn vs the exact circle: error / radius ${e32.toExponential(2)} (32 substeps), ` +
      `${e64.toExponential(2)} (64); their ratio (second order: 4)`, expected: 4, got: ratio, reldiff: rel(ratio, 4), tol: 0.02, pass: rel(ratio, 4) <= 0.02 });
    // trail points are spaced in simulated time: 0.5 time units in frames of 0.0125 or of 0.05 give the same trail
    // (uniform flow, where every RK2 step is exact whatever its length)
    const gu = { N: 16, Nz: 4, h: 1 / 16, Lz: 0.25, span: "periodic", R: 0.05, ro: 0.3, Us: 1, omega_o: 0 };
    const Uu = fieldOf(gu, () => [0.31, 0.17, 0.05]), run = (frame) => {
      const C = new CpuTracers(gu, 16); C.trailTime = 0.23; C.setState(Array.from({ length: 48 }, (_, i) => [0.1, 0.12, 0.1][i % 3] + 0.01 * Math.floor(i / 3)));
      for (let t = 0; t < 0.5 - 1e-12; t += frame) C.advect(Uu, frame, 0, gu);
      return C;
    };
    const A = run(0.0125), B = run(0.05);
    let dpt = 0;
    for (let m = 0; m < A.trail.length; m++) {
      if (m % 4 === 3) continue;
      let d = A.trail[m] - B.trail[m];
      if (m % 4 === 2) d -= gu.Lz * Math.round(d / gu.Lz);       // z is periodic: z = 0 and z = Lz are one point
      dpt = Math.max(dpt, Math.abs(d));
    }
    const same = A.points === B.points && A.head === B.head;
    rows.push({ name: `trail after 0.5 time units in frames of 0.0125 vs 0.05 (uniform flow): ${A.points} vs ${B.points} points; max |point difference| / h`,
      expected: 0, got: same ? dpt / gu.h : Infinity, reldiff: same ? dpt / gu.h : Infinity, tol: 1e-6, pass: same && dpt / gu.h <= 1e-6 });
    return rows;
  }

  async function gpuRows(device, wgsl) {
    const rows = [];
    for (const span of ["periodic", "walls"]) {
      const p = { N: 16, Nz: 8, h: 1 / 16, Lz: 0.5, span, R: 0.1, ro: 0.2, Us: 1, omega_o: 2.5 };
      const g = p, n = 4096, U = new Float32Array(fieldOf(g, testFlow(g)));
      const vb = device.createBuffer({ size: U.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(vb, 0, U);
      const r = lcg(11), xyz = new Float64Array(3 * n);
      for (let k = 0; k < n; k++) { xyz[3 * k] = r(); xyz[3 * k + 1] = r(); xyz[3 * k + 2] = r() * g.Lz; }
      const G = new GpuTracers(device, g, n, wgsl);
      try {
        await G.ready;
        const C = new CpuTracers(g, n);
        G.trailTime = C.trailTime = 0.1;
        G.setState(Float32Array.from(xyz)); C.setState(Float64Array.from(Float32Array.from(xyz)));
        C.random = () => 0.5;
        const tau = 0.05, phi = 0.7;
        G.advect(vb, tau, phi, p); C.advect(U, tau, phi, p);
        const gp = await G.readState(), gt = await G.readTrail();
        let dmax = 0, smax = 0, smaxRef = 0, mism = 0, nres = 0;
        for (let k = 0; k < n; k++) {
          let cf = C.brk[k] === 1, gf = gp.brk[k] === 1;          // a path break: re-seeded or wrapped in this move
          for (let s = 1; s <= C.lastPoints; s++) {
            const o = 4 * (k * C.kcap + s);
            if (C.trail[o + 3] === -1) cf = true;
            if (gt[o + 3] === -1) gf = true;
          }
          if (cf !== gf) { mism++; continue; }
          if (cf) { nres++; continue; }
          for (let c = 0; c < 3; c++) dmax = Math.max(dmax, Math.abs(gp[3 * k + c] - C.pos[3 * k + c]));
          for (let s = 1; s <= C.lastPoints; s++) {
            const o = 4 * (k * C.kcap + s);
            for (let c = 0; c < 3; c++) dmax = Math.max(dmax, Math.abs(gt[o + c] - C.trail[o + c]));
            smax = Math.max(smax, Math.abs(gt[o + 3] - C.trail[o + 3])); smaxRef = Math.max(smaxRef, Math.abs(C.trail[o + 3]));
          }
        }
        const pts = `${C.lastPoints} trail points, ${C.lastSub} RK2 substeps`;
        rows.push({ name: `GPU vs JS f64, ${n} particles, one move (${span}, ${pts}): max |position difference| / h`,
          expected: 0, got: dmax / g.h, reldiff: dmax / g.h, tol: 1e-4, pass: dmax / g.h <= 1e-4 });
        rows.push({ name: `GPU vs JS f64 (${span}): max |trail-point speed difference| / max speed`,
          expected: 0, got: smax / smaxRef, reldiff: smax / smaxRef, tol: 1e-4, pass: smax / smaxRef <= 1e-4 });
        rows.push({ name: `GPU vs JS f64 (${span}): particles re-seeded or wrapped by one side only (${nres} by both)`,
          expected: 0, got: mism, reldiff: mism, tol: 0, pass: mism === 0 });
      } finally { G.destroy(); vb.destroy(); }
    }
    return rows;
  }

  async function selftest(opts) {
    opts = opts || {};
    if (opts.device) return gpuRows(opts.device, opts.wgsl);
    return cpuRows();
  }

  CC3.tracers = { velAt, rk2, advectOne, schedule, trailTime, TRAIL_STEPS, KPTS, SPEED_RAMP, rampColour, keepHash, pcg, CpuTracers, GpuTracers, selftest };
  if (typeof module !== "undefined") module.exports = CC3.tracers;
})(typeof window !== "undefined" ? window : globalThis);
