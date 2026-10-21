// render.js: WebGPU renderers (slices, ray-marched volume, marching-cubes isosurface) for the 3D page.
//
// API
//   const r = CC3.render.create(device, canvas, geom);       // synchronous; `await r.ready` checks the shaders compiled
//     geom = {N, Nz, h, Lz, span: 'periodic'|'walls', R, ro,
//             blit?: bool        draw into the canvas through an offscreen texture + 2D context (headless / ?blit),
//             maxTris?: number   isosurface triangle cap (default 500000, reduced to fit the device limits),
//             wgsl?: {render, iso}   shader text; default: <script type="text/wgsl" id="wgsl-render|wgsl-iso">,
//             width?, height?    used only if canvas is null}
//   r.setField(name)            'vort_mag' (|w|) | 'vort_z' | 'q' | 'speed' | 'w'
//   r.setColorField(name|null)  isosurface colour field (default null = one flat colour)
//   r.computeFields(vb, phi?)   GPU kernel: derived field(s) from the f32 velocity buffer [c][k][j][i], then the GPU
//                               range reduction.  phi (cylinder angle) given: body cells are zeroed (r.maskBody, default
//                               true) and left out of the range statistics.  Returns a promise of r.lastRange.
//   r.draw(vb, view)            view = {mode: 'slice-xy'|'slice-xz'|'slice-yz'|'volume'|'isosurface',
//                                       slice: 0..1 (xy: z = slice*Lz, xz: y = slice, yz: x = slice),
//                                       camera: {yaw, pitch, dist} (default r.camera; z is up, yaw=-pi/2 looks along +y),
//                                       range: {lo, hi} | 'auto', colorRange: same for the colour field,
//                                       isoValue: number (absolute) or isoFrac (fraction of the auto range, default 0.4),
//                                       opacity (volume, default 1), phi, blit: bool (offscreen only),
//                                       recompute: false to skip computeFields (camera-only redraw),
//                                       plain: true = no field colouring: white slices / only box and cylinder in 3D}
//                               draw() recomputes the fields unless view.recompute === false.  Returns a promise
//                               (resolved when a blit copy is done; otherwise immediately).
//   r.lastRange = {lo, hi, max, auto, signed}   range used by the colour bar (auto: read back asynchronously, so it
//                               follows the data by one frame); r.lastColorRange likewise; r.lastIso = {triangles, capped, cap}
//   r.tracers = GpuTracers | null   flow particles drawn in every view (web/tracers.js); view.trails === false hides them
//   r.attachControls(canvas, onChange) -> detach()   drag = orbit, wheel / pinch = zoom (edits r.camera)
//   r.readPixels() -> Promise<{width, height, data: Uint8ClampedArray RGBA}>  re-renders the last view offscreen
//   r.readField() / r.readMesh() / r._setFieldData(f32) : test helpers
//   CC3.render.drawSliceCPU(ctx2d, U (Float64Array, 3*Nz*N*N), geom, view)  slices only; returns the range used
//   CC3.render.cpuField(U, geom, name) -> Float64Array  (f64 port of the field kernel, for parity tests)
//
// Fields match python/diagnostics.py: central differences, odd-mirror (-u) wall ghosts, periodic or wall z.
// Limits: volume ray-march uses `steps` samples per ray (default 160, r.volumeSteps, max 512), early exit at
// transmittance 0.02; isosurface is capped at maxTris triangles (r.lastIso.capped tells).
(function (root) {
  "use strict";
  const CC3 = (root.CC3 = root.CC3 || {});
  const FIELDS = { vort_mag: 0, vort_z: 1, q: 2, speed: 3, w: 4 };
  const SIGNED = [false, true, true, false, true];
  const NBINS = 2048;
  const MODES = { "slice-xy": 1, "slice-xz": 2, "slice-yz": 3, volume: 4, isosurface: 5 };

  // ------------------------------------------------------------------ CPU: fields, layout, colours
  function fieldCell(U, g, kind, i, j, k) {
    const n = g.N, nz = g.Nz, h = g.h, per = g.span !== "walls";
    const vg = (c, ii, jj, kk) => {
      let s = 1;
      if (ii < 0) { ii = 0; s = -s; } else if (ii >= n) { ii = n - 1; s = -s; }
      if (jj < 0) { jj = 0; s = -s; } else if (jj >= n) { jj = n - 1; s = -s; }
      if (kk < 0) { if (per) kk = nz - 1; else { kk = 0; s = -s; } }
      else if (kk >= nz) { if (per) kk = 0; else { kk = nz - 1; s = -s; } }
      return s * U[((c * nz + kk) * n + jj) * n + ii];
    };
    if (kind === 3) { const q = (c) => U[((c * nz + k) * n + j) * n + i]; return Math.hypot(q(0), q(1), q(2)); }
    if (kind === 4) return U[((2 * nz + k) * n + j) * n + i];
    const G = [[], [], []];
    for (let a = 0; a < 3; a++) {
      G[a][0] = (vg(a, i + 1, j, k) - vg(a, i - 1, j, k)) / (2 * h);
      G[a][1] = (vg(a, i, j + 1, k) - vg(a, i, j - 1, k)) / (2 * h);
      G[a][2] = (vg(a, i, j, k + 1) - vg(a, i, j, k - 1)) / (2 * h);
    }
    if (kind === 0 || kind === 1) {
      const wx = G[2][1] - G[1][2], wy = G[0][2] - G[2][0], wz = G[1][0] - G[0][1];
      return kind === 1 ? wz : Math.sqrt(wx * wx + wy * wy + wz * wz);
    }
    let s2 = 0, o2 = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const s = 0.5 * (G[a][b] + G[b][a]), o = 0.5 * (G[a][b] - G[b][a]);
      s2 += s * s; o2 += o * o;
    }
    return 0.5 * (o2 - s2);
  }
  function cpuField(U, g, name) {
    const kind = FIELDS[name], n = g.N, out = new Float64Array(n * n * g.Nz);
    for (let k = 0; k < g.Nz; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      out[(k * n + j) * n + i] = fieldCell(U, g, kind, i, j, k);
    return out;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function diverging(t) {
    const lo = [0.23, 0.30, 0.75], mid = [0.97, 0.97, 0.97], hi = [0.71, 0.016, 0.15];
    return t < 0 ? mix3(mid, lo, -t) : mix3(mid, hi, t);
  }
  const VIR = [[0.267, 0.005, 0.329], [0.230, 0.322, 0.546], [0.128, 0.567, 0.551], [0.369, 0.789, 0.383], [0.993, 0.906, 0.144]];
  function sequential(t) {
    const s = Math.min(Math.max(t, 0), 1) * 4, k = Math.min(Math.floor(s), 3);
    return mix3(VIR[k], VIR[k + 1], s - k);
  }
  // slice layout in pixels: origin (bottom-left of the domain) and pixels per unit length
  function planeLayout(W, H, mode, Lz) {
    const A = 1, B = mode === "slice-xy" ? 1 : Lz, ms = Math.max(1, Math.min(W, H) / 400);
    const ml = 34 * ms, mb = 30 * ms, mt = 12 * ms, mr = 14 * ms;
    const sc = Math.min((W - ml - mr) / A, (H - mt - mb) / B);
    const ox = ml + ((W - ml - mr) - A * sc) / 2;
    const oy = mt + ((H - mt - mb) + B * sc) / 2;     // pixel row (from the top) of the domain's lower edge
    return { ox, oy, sc, A, B, ms };
  }

  function drawSliceCPU(ctx, U, g, view) {
    const cv = ctx.canvas, W = cv.width, H = cv.height;
    const mode = view.mode || "slice-xy", name = view.field || "vort_mag", kind = FIELDS[name];
    ctx.fillStyle = "rgb(246,247,249)"; ctx.fillRect(0, 0, W, H);
    if (!(mode in MODES) || MODES[mode] > 3) {
      ctx.fillStyle = "#333"; ctx.font = "16px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("3D views need WebGPU", W / 2, H / 2);
      return null;
    }
    const n = g.N, nz = g.Nz, f = view.slice === undefined ? 0.5 : view.slice;
    const L = planeLayout(W, H, mode, g.Lz);
    const phi = view.phi || 0, cx = 0.5 + g.ro * Math.cos(phi), cy = 0.5 + g.ro * Math.sin(phi);
    const A = L.A, B = L.B;
    // cell values on the plane, (na x nb)
    const na = n, nb = mode === "slice-xy" ? n : nz;
    const vals = new Float64Array(na * nb), inb = new Uint8Array(na * nb);
    const zi = Math.min(nz - 1, Math.max(0, Math.round(f * nz - 0.5)));
    const ji = Math.min(n - 1, Math.max(0, Math.round(f * n - 0.5))), ii0 = ji;
    for (let b = 0; b < nb; b++) for (let a = 0; a < na; a++) {
      let i, j, k;
      if (mode === "slice-xy") { i = a; j = b; k = zi; } else if (mode === "slice-xz") { i = a; j = ji; k = b; } else { i = ii0; j = a; k = b; }
      vals[b * na + a] = fieldCell(U, g, kind, i, j, k);
      const x = (i + 0.5) * g.h - cx, y = (j + 0.5) * g.h - cy;
      inb[b * na + a] = x * x + y * y < g.R * g.R ? 1 : 0;
    }
    let lo, hi;
    const signed = SIGNED[kind];
    if (view.range && view.range !== "auto") { lo = view.range.lo; hi = view.range.hi; }
    else {
      const a = []; for (let m = 0; m < vals.length; m++) if (!inb[m] && Number.isFinite(vals[m])) a.push(Math.abs(vals[m]));
      a.sort((p, q) => p - q);
      const h95 = a.length ? a[Math.min(a.length - 1, Math.ceil(0.995 * a.length) - 1)] : 1;
      hi = Math.max(h95, 1e-30); lo = signed ? -hi : 0;
    }
    const img = ctx.createImageData(W, H), d = img.data;
    const sample = (u, v) => {                   // bilinear between cell centres, clamped (z wrapped if periodic)
      const fa = Math.min(Math.max(u * (mode === "slice-xy" || mode === "slice-xz" ? n : n) - 0.5, 0), na - 1);
      let fb = mode === "slice-xy" ? v * n - 0.5 : v / g.h - 0.5;
      fb = Math.min(Math.max(fb, 0), nb - 1);
      const a0 = Math.floor(fa), b0 = Math.floor(fb), a1 = Math.min(a0 + 1, na - 1), b1 = Math.min(b0 + 1, nb - 1);
      const ta = fa - a0, tb = fb - b0;
      return lerp(lerp(vals[b0 * na + a0], vals[b0 * na + a1], ta), lerp(vals[b1 * na + a0], vals[b1 * na + a1], ta), tb);
    };
    const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-30), px = 1 / L.sc;
    for (let py = 0; py < H; py++) for (let pxx = 0; pxx < W; pxx++) {
      const u = (pxx + 0.5 - L.ox) / L.sc, v = (L.oy - (py + 0.5)) / L.sc;
      let c = [0.965, 0.968, 0.975];
      if (u >= 0 && u <= A && v >= 0 && v <= B) {
        c = view.plain ? [1, 1, 1] : signed ? diverging(Math.max(-1, Math.min(1, sample(u, v) / m))) : sequential((sample(u, v) - lo) / Math.max(hi - lo, 1e-30));
        const wx = mode === "slice-yz" ? f : u, wy = mode === "slice-xy" ? v : (mode === "slice-xz" ? f : u);
        const r = Math.hypot(wx - cx, wy - cy) - g.R;
        if (r < 0) c = mix3(c, [0.55, 0.57, 0.62], 0.8);
        if (Math.abs(r) < 1.2 * px / (mode === "slice-xy" ? 1 : 3)) c = [0.19, 0.2, 0.25];
      }
      const o = 4 * (py * W + pxx);
      d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = "#555"; ctx.lineWidth = 1; ctx.strokeRect(L.ox, L.oy - B * L.sc, A * L.sc, B * L.sc);
    ctx.fillStyle = "#333"; ctx.font = (14 * L.ms) + "px sans-serif"; ctx.textAlign = "center";
    const hl = mode === "slice-yz" ? "y" : "x", vl = mode === "slice-xy" ? "y" : "z";
    ctx.fillText(hl, L.ox + A * L.sc - 6 * L.ms, L.oy + 18 * L.ms);
    ctx.fillText(vl, L.ox - 14 * L.ms, L.oy - B * L.sc + 12 * L.ms);
    return { lo, hi, signed };
  }

  // ------------------------------------------------------------------ small vector helpers
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // vector strokes for the axis letters, in a box 0..1 (x) by 0..1 (y up)
  const GLYPH = {
    x: [[[0, 1], [1, 0]], [[0, 0], [1, 1]]],
    y: [[[0, 1], [0.5, 0.4]], [[1, 1], [0.5, 0.4]], [[0.5, 0.4], [0.25, -0.3]]],
    z: [[[0, 1], [1, 1]], [[1, 1], [0, 0]], [[0, 0], [1, 0]]],
  };

  class Lines {                                   // dynamic line list in clip space: x y z w r g b a
    constructor(W, H) { this.W = W; this.H = H; this.v = []; }
    clipPx(px, py, z) { return [2 * px / this.W - 1, 1 - 2 * py / this.H, z || 0, 1]; }
    segClip(a, b, c) { this.v.push(...a, ...c, ...b, ...c); }
    segPx(p, q, c, z) { this.segClip(this.clipPx(p[0], p[1], z), this.clipPx(q[0], q[1], z), c); }
    glyph(ch, px, py, size, c) {                  // (px,py) = lower-left of the letter, pixels
      for (const [a, b] of GLYPH[ch]) for (const o of [0, 0.8]) {
        this.segPx([px + a[0] * size * 0.6 + o, py - a[1] * size], [px + b[0] * size * 0.6 + o, py - b[1] * size], c);
      }
    }
  }

  // ------------------------------------------------------------------ the GPU renderer
  function create(device, canvas, geom) {
    const g = Object.assign({}, geom);
    g.h = g.h || 1 / g.N; g.Lz = g.Lz || g.Nz * g.h;
    const periodic = g.span !== "walls";
    const N = g.N, Nz = g.Nz, ncell = N * N * Nz;
    const blitMode = !!g.blit;
    const src = (key, id) => (g.wgsl && g.wgsl[key]) || document.getElementById(id).textContent;
    const rmod = device.createShaderModule({ code: src("render", "wgsl-render") });
    const imod = device.createShaderModule({ code: src("iso", "wgsl-iso") });
    const U = GPUBufferUsage, S = GPUShaderStage;
    const r = { geom: g, field: "vort_mag", colorField: null, maskBody: true, percentile: 0.995, volumeSteps: 160,
      camera: { yaw: -1.2, pitch: 0.55, dist: 2.7 }, lastRange: { lo: 0, hi: 1, max: 0, auto: true, signed: false },
      lastColorRange: { lo: 0, hi: 1, max: 0, auto: true, signed: false }, lastIso: { triangles: 0, capped: false, cap: 0 } };
    r.ready = (async () => {
      const errs = [];
      for (const [nm, m] of [["render.wgsl", rmod], ["iso.wgsl", imod]]) {
        const info = await m.getCompilationInfo();
        for (const x of info.messages) if (x.type === "error") errs.push(`${nm}:${x.lineNum}: ${x.message}`);
      }
      if (errs.length) throw new Error("WGSL compile errors:\n" + errs.join("\n"));
      return true;
    })();

    const W0 = () => (canvas ? canvas.width : g.width || 640), H0 = () => (canvas ? canvas.height : g.height || 480);
    let ctx = null, ctx2d = null;
    let format = "rgba8unorm";
    if (canvas) {
      if (blitMode) ctx2d = canvas.getContext("2d");
      else {
        ctx = canvas.getContext("webgpu");
        format = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format, alphaMode: "opaque" });
      }
    }
    const buf = (size, usage) => device.createBuffer({ size: Math.max(16, size), usage });
    const ST_ = U.STORAGE, CS_ = U.COPY_SRC, CD_ = U.COPY_DST, UN_ = U.UNIFORM;
    const fieldA = buf(ncell * 4, ST_ | CS_ | CD_), fieldB = buf(ncell * 4, ST_ | CS_);
    const statsA = buf((NBINS + 2) * 4, ST_), statsB = buf((NBINS + 2) * 4, ST_);
    const rngA = buf(16, ST_ | CS_), rngB = buf(16, ST_ | CS_);
    const cpA = buf(64, UN_ | CD_), cpB = buf(64, UN_ | CD_);
    const paramsBuf = buf(224, UN_ | CD_), ipBuf = buf(144, UN_ | CD_);
    const rdRange = buf(32, U.MAP_READ | CD_);
    const lineCap = 40000, lineBuf = buf(lineCap * 32, U.VERTEX | CD_);

    // explicit bind-group layouts
    const bgl = (entries) => device.createBindGroupLayout({ entries });
    const C = S.COMPUTE, F = S.FRAGMENT, V = S.VERTEX;
    const st = (b, vis, type) => ({ binding: b, visibility: vis, buffer: { type } });
    const lFields = bgl([st(0, C, "uniform"), st(1, C, "read-only-storage"), st(2, C, "storage")]);
    const lStats = bgl([st(0, C, "uniform"), st(5, C, "read-only-storage"), st(6, C, "storage"), st(7, C, "storage")]);
    const lRender = bgl([st(8, V | F, "uniform"), st(9, F, "read-only-storage"), st(10, F, "read-only-storage")]);
    const lIsoC = bgl([st(0, C, "uniform"), st(1, C, "read-only-storage"), st(2, C, "read-only-storage"), st(3, C, "storage"),
      st(5, C, "storage"), st(6, C, "storage"), st(7, C, "read-only-storage")]);
    const lIsoM = bgl([st(0, V | F, "uniform"), st(4, V, "read-only-storage"), st(8, F, "read-only-storage")]);
    const pl = (l) => device.createPipelineLayout({ bindGroupLayouts: [l] });
    const cpipe = (mod, entry, l) => device.createComputePipeline({ layout: pl(l), compute: { module: mod, entryPoint: entry } });
    const pFields = cpipe(rmod, "cs_fields", lFields);
    const pClear = cpipe(rmod, "cs_clear", lStats), pMax = cpipe(rmod, "cs_max", lStats),
      pHist = cpipe(rmod, "cs_hist", lStats), pRange = cpipe(rmod, "cs_range", lStats);
    const pMC = cpipe(imod, "cs_mc", lIsoC), pArgs = cpipe(imod, "cs_args", lIsoC);

    const rpipes = {};                              // render pipelines per target format
    function pipes(fmt) {
      if (rpipes[fmt]) return rpipes[fmt];
      const tgt = [{ format: fmt }];
      const ds = (w) => ({ format: "depth32float", depthWriteEnabled: w, depthCompare: w ? "less" : "less-equal" });
      const full = (mod, entry, fs, layout, depth) => device.createRenderPipeline({ layout: pl(layout),
        vertex: { module: mod, entryPoint: "vs_full" }, fragment: { module: mod, entryPoint: entry, targets: tgt },
        primitive: { topology: "triangle-list" }, depthStencil: depth ? ds(true) : { format: "depth32float", depthWriteEnabled: false, depthCompare: "always" } });
      const o = {
        slice: full(rmod, "fs_slice", 0, lRender, false),
        volume: device.createRenderPipeline({ layout: pl(lRender), vertex: { module: rmod, entryPoint: "vs_full" },
          fragment: { module: rmod, entryPoint: "fs_volume", targets: tgt }, primitive: { topology: "triangle-list" },
          depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less-equal" } }),   // no-hit rays write depth 1
        cyl: full(rmod, "fs_cyl", 0, lRender, true),
        line: device.createRenderPipeline({ layout: pl(lRender),
          vertex: { module: rmod, entryPoint: "vs_line", buffers: [{ arrayStride: 32, attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x4" }, { shaderLocation: 1, offset: 16, format: "float32x4" }] }] },
          fragment: { module: rmod, entryPoint: "fs_line", targets: tgt }, primitive: { topology: "line-list" },
          depthStencil: ds(false) }),
        mesh: device.createRenderPipeline({ layout: pl(lIsoM), vertex: { module: imod, entryPoint: "vs_mesh" },
          fragment: { module: imod, entryPoint: "fs_mesh", targets: tgt }, primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: ds(true) }),
      };
      return (rpipes[fmt] = o);
    }

    // ---- targets
    let off = null, depth = null, offW = 0, offH = 0;
    function ensureTargets(W, H) {
      if (off && offW === W && offH === H) return;
      if (off) { off.destroy(); depth.destroy(); }
      off = device.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      depth = device.createTexture({ size: [W, H], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT });
      offW = W; offH = H;
    }
    let depthDirect = null, ddW = 0, ddH = 0;
    function ensureDepthDirect(W, H) {
      if (depthDirect && ddW === W && ddH === H) return;
      if (depthDirect) depthDirect.destroy();
      depthDirect = device.createTexture({ size: [W, H], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT });
      ddW = W; ddH = H;
    }

    // ---- compute: fields + range
    const cpData = new ArrayBuffer(64), cpF = new Float32Array(cpData), cpI = new Int32Array(cpData), cpU = new Uint32Array(cpData);
    function writeCP(bufr, field, phi) {
      const useBody = Number.isFinite(phi);
      cpI[0] = N; cpI[1] = Nz; cpU[2] = periodic ? 1 : 0; cpU[3] = field;
      cpF[4] = g.h; cpF[5] = g.R; cpF[6] = g.ro; cpF[7] = useBody ? phi : 0;
      cpU[8] = useBody && r.maskBody ? 1 : 0; cpU[9] = useBody ? 1 : 0; cpU[10] = SIGNED[field] ? 1 : 0; cpU[11] = NBINS;
      cpF[12] = r.percentile; cpF[13] = 0; cpF[14] = 0; cpF[15] = 0;
      device.queue.writeBuffer(bufr, 0, cpData);
    }
    const groups = (cells) => { const gcount = Math.ceil(cells / 64); return [Math.min(gcount, 65535), Math.ceil(gcount / 65535)]; };
    let rdBusy = false;
    function encodeStats(pass, cp, fld, stats, rng) {
      const bg = device.createBindGroup({ layout: lStats, entries: [{ binding: 0, resource: { buffer: cp } },
        { binding: 5, resource: { buffer: fld } }, { binding: 6, resource: { buffer: stats } }, { binding: 7, resource: { buffer: rng } }] });
      const [gx, gy] = groups(ncell);
      pass.setBindGroup(0, bg);
      pass.setPipeline(pClear); pass.dispatchWorkgroups(1);
      pass.setPipeline(pMax); pass.dispatchWorkgroups(gx, gy);
      pass.setPipeline(pHist); pass.dispatchWorkgroups(gx, gy);
      pass.setPipeline(pRange); pass.dispatchWorkgroups(1);
    }
    r.computeFields = function (vb, phi, opts) {
      opts = opts || {};
      const fa = FIELDS[r.field], fb = r.colorField ? FIELDS[r.colorField] : null;
      writeCP(cpA, fa, phi);
      if (fb !== null) writeCP(cpB, fb, phi);
      const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
      const [gx, gy] = groups(ncell);
      const fieldsBG = (cp, out) => device.createBindGroup({ layout: lFields, entries: [{ binding: 0, resource: { buffer: cp } },
        { binding: 1, resource: { buffer: vb } }, { binding: 2, resource: { buffer: out } }] });
      if (!opts.skipFields) { pass.setPipeline(pFields); pass.setBindGroup(0, fieldsBG(cpA, fieldA)); pass.dispatchWorkgroups(gx, gy); }
      encodeStats(pass, cpA, fieldA, statsA, rngA);
      if (fb !== null) {
        if (!opts.skipFields) { pass.setPipeline(pFields); pass.setBindGroup(0, fieldsBG(cpB, fieldB)); pass.dispatchWorkgroups(gx, gy); }
        encodeStats(pass, cpB, fieldB, statsB, rngB);
      }
      pass.end();
      const doRead = !rdBusy;
      if (doRead) { enc.copyBufferToBuffer(rngA, 0, rdRange, 0, 16); enc.copyBufferToBuffer(rngB, 0, rdRange, 16, 16); rdBusy = true; }
      device.queue.submit([enc.finish()]);
      if (!doRead) return Promise.resolve(r.lastRange);
      const sa = SIGNED[fa], sb = fb !== null && SIGNED[fb];
      return rdRange.mapAsync(GPUMapMode.READ).then(() => {
        const a = new Float32Array(rdRange.getMappedRange().slice(0));
        rdRange.unmap(); rdBusy = false;
        r.lastRange = { lo: a[0], hi: a[1], max: a[2], auto: true, signed: sa };
        if (fb !== null) r.lastColorRange = { lo: a[4], hi: a[5], max: a[6], auto: true, signed: sb };
        return r.lastRange;
      }, (e) => { rdBusy = false; throw e; });
    };
    r.setField = (name) => { if (!(name in FIELDS)) throw new Error("unknown field " + name); r.field = name; };
    r.setColorField = (name) => { if (name !== null && !(name in FIELDS)) throw new Error("unknown field " + name); r.colorField = name; };
    r._setFieldData = (f32) => { device.queue.writeBuffer(fieldA, 0, f32); };
    async function readBuf(b, bytes) {
      const rb = device.createBuffer({ size: Math.ceil(bytes / 4) * 4, usage: U.MAP_READ | CD_ });
      const e = device.createCommandEncoder(); e.copyBufferToBuffer(b, 0, rb, 0, Math.ceil(bytes / 4) * 4);
      device.queue.submit([e.finish()]);
      await rb.mapAsync(GPUMapMode.READ);
      const out = rb.getMappedRange().slice(0); rb.unmap(); rb.destroy();
      return out;
    }
    r.readField = async () => new Float32Array(await readBuf(fieldA, ncell * 4));
    r.readColorField = async () => new Float32Array(await readBuf(fieldB, ncell * 4));

    // ---- isosurface resources (lazy)
    let iso = null;
    function ensureIso() {
      if (iso) return iso;
      const lim = device.limits;
      let cap = g.maxTris || 500000;
      cap = Math.max(1, Math.min(cap, Math.floor(Math.min(lim.maxStorageBufferBindingSize, lim.maxBufferSize) / 96)));
      iso = { cap, verts: buf(cap * 96, ST_ | CS_), counter: buf(4, ST_ | CS_ | CD_), args: buf(16, ST_ | U.INDIRECT),
        rd: buf(16, U.MAP_READ | CD_), busy: false };
      r.lastIso.cap = cap;
      return iso;
    }
    r.readMesh = async () => {
      ensureIso();
      const cnt = new Uint32Array(await readBuf(iso.counter, 4))[0];
      const n = Math.min(cnt, iso.cap);
      const v = n ? new Float32Array(await readBuf(iso.verts, n * 96)) : new Float32Array(0);
      return { triangles: cnt, stored: n, capped: cnt > iso.cap, vertices: v };   // per vertex: pos(3) cval nrm(3) pad
    };

    // ---- camera
    function camera(cam, W, H) {
      const t = [0.5, 0.5, g.Lz / 2], cp = Math.cos(cam.pitch);
      const eye = [t[0] + cam.dist * cp * Math.cos(cam.yaw), t[1] + cam.dist * cp * Math.sin(cam.yaw), t[2] + cam.dist * Math.sin(cam.pitch)];
      const f = norm3([t[0] - eye[0], t[1] - eye[1], t[2] - eye[2]]);
      const rr = norm3(cross3(f, [0, 0, 1])), u = cross3(rr, f);
      const asp = W / H, tf = Math.tan(17.5 * Math.PI / 180) * Math.max(1, 1 / asp);
      const near = 0.02, far = 20, kf = far / (far - near);
      const rows = [
        [rr[0] / (tf * asp), rr[1] / (tf * asp), rr[2] / (tf * asp), -dot3(eye, rr) / (tf * asp)],
        [u[0] / tf, u[1] / tf, u[2] / tf, -dot3(eye, u) / tf],
        [f[0] * kf, f[1] * kf, f[2] * kf, kf * (-dot3(eye, f) - near)],
        [f[0], f[1], f[2], -dot3(eye, f)]];
      const vp = new Float32Array(16);
      for (let rI = 0; rI < 4; rI++) for (let c = 0; c < 4; c++) vp[c * 4 + rI] = rows[rI][c];
      const project = (p) => rows.map((row) => row[0] * p[0] + row[1] * p[1] + row[2] * p[2] + row[3]);
      return { eye, f, r: rr, u, tf, asp, vp, project };
    }

    // ---- overlay lines
    const DARK = [0.25, 0.27, 0.32, 1];
    function sliceOverlay(L, mode, W, H) {
      const lines = new Lines(W, H), x0 = L.ox, x1 = L.ox + L.A * L.sc, y1 = L.oy, y0 = L.oy - L.B * L.sc;
      const q = (a, b) => lines.segPx(a, b, DARK);
      q([x0, y0], [x1, y0]); q([x1, y0], [x1, y1]); q([x1, y1], [x0, y1]); q([x0, y1], [x0, y0]);
      const hl = mode === "slice-yz" ? "y" : "x", vl = mode === "slice-xy" ? "y" : "z", s = 13 * L.ms;
      lines.glyph(hl, x1 - 0.6 * s, y1 + 16 * L.ms + s, s, DARK);
      lines.glyph(vl, x0 - 1.1 * s - 12 * L.ms, y0 + s + 2 * L.ms, s, DARK);
      // axis arrows (outside the frame, pointing along +x / +y|z)
      const a = 5 * L.ms;
      q([x0, y1 + 8 * L.ms], [x1, y1 + 8 * L.ms]); q([x1, y1 + 8 * L.ms], [x1 - a, y1 + 8 * L.ms - a * 0.6]); q([x1, y1 + 8 * L.ms], [x1 - a, y1 + 8 * L.ms + a * 0.6]);
      q([x0 - 8 * L.ms, y1], [x0 - 8 * L.ms, y0]); q([x0 - 8 * L.ms, y0], [x0 - 8 * L.ms - a * 0.6, y0 + a]); q([x0 - 8 * L.ms, y0], [x0 - 8 * L.ms + a * 0.6, y0 + a]);
      return lines;
    }
    function boxOverlay(cam, W, H) {
      const lines = new Lines(W, H), Lz = g.Lz;
      const P = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, Lz], [1, 0, Lz], [1, 1, Lz], [0, 1, Lz]];
      const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      const ax = { "0,1": [0.8, 0.15, 0.15, 1], "0,3": [0.1, 0.55, 0.2, 1], "0,4": [0.15, 0.3, 0.85, 1] };
      for (const [a, b] of E) lines.segClip(cam.project(P[a]), cam.project(P[b]), ax[a + "," + b] || DARK);
      const lab = (ch, p, c) => {
        const q = cam.project(p); if (q[3] <= 0) return;
        const px = (q[0] / q[3] * 0.5 + 0.5) * W, py = (0.5 - q[1] / q[3] * 0.5) * H, s = Math.max(12, Math.min(W, H) / 30);
        lines.glyph(ch, px - 0.3 * s, py + 0.5 * s, s, c);
      };
      lab("x", [1.07, 0, 0], ax["0,1"]); lab("y", [0, 1.07, 0], ax["0,3"]); lab("z", [0, 0, Lz + 0.07], ax["0,4"]);
      return lines;
    }

    // ---- draw
    const pData = new ArrayBuffer(224), pF = new Float32Array(pData), pI = new Int32Array(pData), pU = new Uint32Array(pData);
    const ipData = new ArrayBuffer(144), iF = new Float32Array(ipData), iI = new Int32Array(ipData), iU = new Uint32Array(ipData);
    let last = null;
    function readTex(tex, W, H) {
      const bpr = Math.ceil(W * 4 / 256) * 256;
      const rb = device.createBuffer({ size: bpr * H, usage: U.MAP_READ | CD_ });
      const e = device.createCommandEncoder();
      e.copyTextureToBuffer({ texture: tex }, { buffer: rb, bytesPerRow: bpr }, [W, H]);
      device.queue.submit([e.finish()]);
      return rb.mapAsync(GPUMapMode.READ).then(() => {
        const s = new Uint8Array(rb.getMappedRange()), data = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) data.set(s.subarray(y * bpr, y * bpr + W * 4), y * W * 4);
        rb.unmap(); rb.destroy();
        return { width: W, height: H, data };
      });
    }
    function drawInternal(vb, view, forceOff) {
      const mode = view.mode || "slice-xy", W = W0(), H = H0();
      if (!(mode in MODES)) throw new Error("unknown mode " + mode);
      const phi = view.phi === undefined ? 0 : view.phi;
      const kind = FIELDS[r.field];
      const plain = !!view.plain;                         // no field colouring (flow particles on)
      if (vb && view.recompute !== false && !plain) r.computeFields(vb, phi);
      const auto = !view.range || view.range === "auto";
      if (!auto) r.lastRange = { lo: view.range.lo, hi: view.range.hi, max: NaN, auto: false, signed: SIGNED[kind] };
      const cam = camera(view.camera || r.camera, W, H);
      const L = planeLayout(W, H, mode, g.Lz);
      const steps = Math.max(8, Math.min(512, Math.round(view.steps || r.volumeSteps)));
      pI[0] = N; pI[1] = Nz; pU[2] = periodic ? 1 : 0; pU[3] = kind;
      pF[4] = g.h; pF[5] = g.Lz; pF[6] = g.R; pF[7] = g.ro;
      pF[8] = phi; pF[9] = view.slice === undefined ? 0.5 : view.slice; pU[10] = MODES[mode]; pU[11] = auto ? 1 : 0;
      pF[12] = auto ? 0 : view.range.lo; pF[13] = auto ? 1 : view.range.hi; pF[14] = W; pF[15] = H;
      pU[16] = steps; pF[17] = view.opacity === undefined ? 1 : view.opacity; pF[18] = plain ? 1 : 0; pF[19] = 0;
      pF.set([...cam.eye, cam.tf], 20); pF.set([...cam.r, cam.asp], 24); pF.set([...cam.u, 0], 28); pF.set([...cam.f, 0], 32);
      pF.set([L.ox, L.oy, L.sc, 0], 36); pF.set(cam.vp, 40);
      device.queue.writeBuffer(paramsBuf, 0, pData);

      const useOff = forceOff || view.blit || blitMode || !ctx;
      let colorView;
      if (useOff) { ensureTargets(W, H); colorView = off.createView(); } else { ensureDepthDirect(W, H); colorView = ctx.getCurrentTexture().createView(); }
      const dview = useOff ? depth.createView() : depthDirect.createView();
      const pp = pipes(useOff ? "rgba8unorm" : format);
      const enc = device.createCommandEncoder();
      const rbg = device.createBindGroup({ layout: lRender, entries: [{ binding: 8, resource: { buffer: paramsBuf } },
        { binding: 9, resource: { buffer: fieldA } }, { binding: 10, resource: { buffer: rngA } }] });

      let lines;
      let isoBG = null;
      if (mode === "isosurface" && !plain) {
        const I = ensureIso();
        const hasC = r.colorField !== null, cAuto = !view.colorRange || view.colorRange === "auto";
        iI[0] = N; iI[1] = Nz; iU[2] = periodic ? 1 : 0; iU[3] = I.cap;
        iF[4] = g.h; iF[5] = g.Lz;
        const useFrac = view.isoValue === undefined;
        iF[6] = useFrac ? 0 : view.isoValue; iF[7] = view.isoFrac === undefined ? 0.4 : view.isoFrac;
        iU[8] = useFrac ? 1 : 0; iU[9] = hasC ? 1 : 0; iU[10] = hasC && SIGNED[FIELDS[r.colorField]] ? 1 : 0; iU[11] = cAuto ? 1 : 0;
        iF[12] = cAuto ? 0 : view.colorRange.lo; iF[13] = cAuto ? 1 : view.colorRange.hi;
        iF.set([...cam.eye, 1], 16); iF.set(cam.vp, 20);
        device.queue.writeBuffer(ipBuf, 0, ipData);
        if (!cAuto) r.lastColorRange = { lo: view.colorRange.lo, hi: view.colorRange.hi, max: NaN, auto: false, signed: iU[10] === 1 };
        const bgC = device.createBindGroup({ layout: lIsoC, entries: [{ binding: 0, resource: { buffer: ipBuf } },
          { binding: 1, resource: { buffer: fieldA } }, { binding: 2, resource: { buffer: hasC ? fieldB : fieldA } },
          { binding: 3, resource: { buffer: I.verts } }, { binding: 5, resource: { buffer: I.counter } },
          { binding: 6, resource: { buffer: I.args } }, { binding: 7, resource: { buffer: rngA } }] });
        isoBG = device.createBindGroup({ layout: lIsoM, entries: [{ binding: 0, resource: { buffer: ipBuf } },
          { binding: 4, resource: { buffer: I.verts } }, { binding: 8, resource: { buffer: hasC ? rngB : rngA } }] });
        enc.clearBuffer(I.counter);
        const cp = enc.beginComputePass();
        const nzc = periodic ? Nz + 1 : Nz - 1, cells = (N - 1) * (N - 1) * Math.max(nzc, 0);
        const [gx, gy] = groups(Math.max(cells, 1));
        cp.setBindGroup(0, bgC);
        cp.setPipeline(pMC); cp.dispatchWorkgroups(gx, gy);
        cp.setPipeline(pArgs); cp.dispatchWorkgroups(1);
        cp.end();
        if (!I.busy) { enc.copyBufferToBuffer(I.counter, 0, I.rd, 0, 4); I.busy = true; }
        else I.skipRead = true;
      }

      const bg = [0.965, 0.968, 0.975, 1];
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view: colorView, clearValue: { r: bg[0], g: bg[1], b: bg[2], a: 1 }, loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: dview, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" } });
      if (mode.startsWith("slice")) {
        rp.setPipeline(pp.slice); rp.setBindGroup(0, rbg); rp.draw(3);
        lines = sliceOverlay(L, mode, W, H);
      } else {
        if (plain) { rp.setPipeline(pp.cyl); rp.setBindGroup(0, rbg); rp.draw(3); }
        else if (mode === "volume") { rp.setPipeline(pp.volume); rp.setBindGroup(0, rbg); rp.draw(3); }
        else {
          rp.setPipeline(pp.cyl); rp.setBindGroup(0, rbg); rp.draw(3);
          rp.setPipeline(pp.mesh); rp.setBindGroup(0, isoBG); rp.drawIndirect(iso.args, 0);
        }
        lines = boxOverlay(cam, W, H);
      }
      if (r.tracers && view.trails !== false) {                // flow particles (web/tracers.js, trails.wgsl)
        r.tracers.encodeDraw(rp, { fmt: useOff ? "rgba8unorm" : format, mode: MODES[mode], vp: cam.vp, L, W, H,
          slice: view.slice === undefined ? 0.5 : view.slice, phi });
      }
      const nv = Math.min(lines.v.length / 8, lineCap);
      device.queue.writeBuffer(lineBuf, 0, new Float32Array(lines.v.slice(0, nv * 8)));
      rp.setPipeline(pp.line); rp.setBindGroup(0, rbg); rp.setVertexBuffer(0, lineBuf); rp.draw(nv);
      rp.end();
      device.queue.submit([enc.finish()]);

      let p = Promise.resolve();
      if (mode === "isosurface" && !plain && iso.busy && !iso.skipRead) {
        const I = iso;
        p = I.rd.mapAsync(GPUMapMode.READ).then(() => {
          const c = new Uint32Array(I.rd.getMappedRange().slice(0))[0]; I.rd.unmap(); I.busy = false;
          r.lastIso = { triangles: c, capped: c > I.cap, cap: I.cap };
        }, () => { I.busy = false; });
      } else if (iso) iso.skipRead = false;
      if (useOff && ctx2d && !forceOff) {
        p = p.then(() => readTex(off, W, H)).then((im) => { ctx2d.putImageData(new ImageData(im.data, W, H), 0, 0); });
      }
      return { promise: p, W, H };
    }
    r.draw = function (vb, view) {
      view = Object.assign({}, view || {});
      last = { vb, view };
      return drawInternal(vb, view, false).promise;
    };
    r.readPixels = async function () {
      if (!last) throw new Error("nothing drawn yet");
      const v = Object.assign({}, last.view, { recompute: false });
      const o = drawInternal(last.vb, v, true);
      await o.promise;
      const im = await readTex(off, o.W, o.H);
      if (iso) await device.queue.onSubmittedWorkDone();
      return im;
    };

    r.attachControls = function (cv, onChange) {
      const pts = new Map(); let pinch = 0;
      cv.style.touchAction = "none";
      const fire = () => { if (onChange) onChange(r.camera); };
      const down = (e) => { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; };
      const move = (e) => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 1) {
          r.camera.yaw -= (e.clientX - prev[0]) * 0.01;
          r.camera.pitch = Math.max(-1.5, Math.min(1.5, r.camera.pitch + (e.clientY - prev[1]) * 0.01));
          fire();
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch > 0) { r.camera.dist = Math.max(0.8, Math.min(8, r.camera.dist * pinch / dd)); fire(); }
          pinch = dd;
        }
      };
      const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
      const wheel = (e) => { e.preventDefault(); r.camera.dist = Math.max(0.8, Math.min(8, r.camera.dist * Math.exp(e.deltaY * 0.001))); fire(); };
      cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
      cv.addEventListener("wheel", wheel, { passive: false });
      return () => {
        cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move);
        cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up);
        cv.removeEventListener("wheel", wheel);
      };
    };
    r.destroy = () => { for (const b of [fieldA, fieldB, statsA, statsB, rngA, rngB, lineBuf]) b.destroy(); if (iso) { iso.verts.destroy(); } };
    return r;
  }

  CC3.render = { create, drawSliceCPU, cpuField, fieldCell, planeLayout, FIELDS };
  if (typeof module !== "undefined") module.exports = CC3.render;
})(typeof window !== "undefined" ? window : globalThis);
