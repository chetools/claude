// ===================================================================== fv_cpu.js
// 3D finite-volume Navier-Stokes, JavaScript float64 port of python/fv3d.py (CPU fallback).
// Same algorithm and the same function names (camelCase) as the numpy reference; the
// operations are evaluated in the same order, so results agree with numpy to ~1e-13.
//
// Arrays are flat Float64Arrays indexed [k (z)][j (y)][i (x)]:
//   u (Nz, N, N+1)  v (Nz, N+1, N)  w (Nz+1, N, N)  q (Nz, N, N)
// Attaches to  CC3.fv  and (in node) exports it:  const fv = require("./fv_cpu.js").
(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const CC3 = (root.CC3 = root.CC3 || {});
  const fv = (CC3.fv = CC3.fv || {});

  // ------------------------------------------------------------- parameters
  // Same numbers and the same keys as fv3d.make_params.
  function makeParams(inp) {
    inp = inp || {};
    const d = (k, v) => (inp[k] === undefined || inp[k] === null ? v : inp[k]);
    const N = d("N", 64), Nz = d("Nz", 1), Re = d("Re", 200.0), R = d("R", 0.1);
    let ro = d("ro", 0.2), Uo = d("Uo", 0.0);
    const Us = d("Us", 1.0), span = d("span", "periodic"), seed = d("seed", 1e-3), mask = d("mask", "ramp");
    const cfl = d("cfl", 0.3), fdiff = d("fdiff", 0.05), width = d("width", 1.0);
    const vcycles = d("vcycles", 2), nu1 = d("nu1", 2), nu2 = d("nu2", 2), ncoarse = d("ncoarse", 40);
    if (!(N >= 8 && (N & (N - 1)) === 0)) throw new Error("N must be a power of two, >= 8");
    if (!(Nz >= 1 && (Nz & (Nz - 1)) === 0)) throw new Error("Nz must be a power of two");
    if (span !== "periodic" && span !== "walls") throw new Error("span must be 'periodic' or 'walls'");
    if (span === "walls" && Nz < 2) throw new Error("walls need at least 2 cells in z");
    const h = 1.0 / N;
    if (ro < 0.02) { ro = 0.0; Uo = 0.0; }                  // a centred cylinder cannot orbit
    const Uref = Math.max(Math.abs(Us), Math.abs(Uo)) || 1.0;
    const nu = Uref * 2 * R / Re;
    const Omega = Us / R;
    const omega_o = ro > 0 ? Uo / ro : 0.0;
    const Umax = Math.abs(Us) + Math.abs(omega_o) * (ro + R);       // fastest point of the body
    const dt = 1.0 / (Umax / (cfl * h) + nu / (fdiff * h * h));     // both limits, combined
    return { N, Nz, h, Lz: Nz * h, span, Re, R, ro, Us, Uo, mask, nu, Uref, seed, Omega, omega_o, dt,
      eps: width * h, vcycles, nu1, nu2, ncoarse };
  }

  // ------------------------------------------------------------- ghost values
  // Index and sign maps for 2 ghost layers on each end of an axis with n nodes (pad_axis in fv3d.py).
  //   face      wall ON the end node (value 0 there):  a[-k] = -a[k]
  //   cell      wall half a cell outside:              a[-1-k] = -a[k]
  //   wrap      periodic, nodes are the cells 0..n-1
  //   wrapface  periodic, last node is a copy of the first (w with w[Nz] = w[0])
  function axisMap(n, kind) {
    const idx = new Int32Array(n + 4), sgn = new Float64Array(n + 4);
    for (let g = -2; g < n + 2; g++) {
      let i = g, s = 1;
      if (g < 0 || g >= n) {
        if (kind === "face") { i = g < 0 ? -g : 2 * (n - 1) - g; s = -1; }
        else if (kind === "cell") { i = g < 0 ? -1 - g : 2 * n - 1 - g; s = -1; }
        else if (kind === "wrap") { i = ((g % n) + n) % n; }
        else if (kind === "wrapface") { const m = n - 1; i = ((g % m) + m) % m; }
        else throw new Error("axisMap: " + kind);
      }
      idx[g + 2] = i; sgn[g + 2] = s;
    }
    return { idx, sgn };
  }

  // out = a with 2 ghost layers on every side; mk, mj, mi are the axis maps
  function pad3(a, nj, ni, mk, mj, mi, out) {
    const PK = mk.idx.length, PJ = mj.idx.length, PI = mi.idx.length;
    for (let K = 0; K < PK; K++) for (let J = 0; J < PJ; J++) {
      const base = (mk.idx[K] * nj + mj.idx[J]) * ni, s = mk.sgn[K] * mj.sgn[J], o = (K * PJ + J) * PI;
      for (let I = 0; I < PI; I++) out[o + I] = (s * mi.sgn[I]) * a[base + mi.idx[I]];
    }
  }

  // ------------------------------------------------------------- advection
  const minmod = (a, b) => (a * b <= 0 ? 0.0 : Math.sign(a) * Math.min(Math.abs(a), Math.abs(b)));
  // MUSCL face value between nodes a and b (am, bp: the next nodes outward); upwind side by the sign of vel
  const faceValue = (am, a, b, bp, vel) =>
    (vel >= 0 ? a + 0.5 * minmod(a - am, b - a) : b + 0.5 * minmod(b - bp, a - b));

  // -div(flux) + nu lap at the node c of the padded component F; ue..wb are the transporting
  // velocities on the six faces of its control volume; sI = 1, sJ, sK are the strides.
  function rhsBlock(F, c, sJ, sK, ue, uw, vn, vs, wt, wb, h, nu) {
    const Fc = F[c];
    const fe = ue * faceValue(F[c - 1], Fc, F[c + 1], F[c + 2], ue);
    const fw = uw * faceValue(F[c - 2], F[c - 1], Fc, F[c + 1], uw);
    const fn = vn * faceValue(F[c - sJ], Fc, F[c + sJ], F[c + 2 * sJ], vn);
    const fs = vs * faceValue(F[c - 2 * sJ], F[c - sJ], Fc, F[c + sJ], vs);
    const ft = wt * faceValue(F[c - sK], Fc, F[c + sK], F[c + 2 * sK], wt);
    const fb = wb * faceValue(F[c - 2 * sK], F[c - sK], Fc, F[c + sK], wb);
    // x,y part first, z part added after: the z part is exactly 0 when the field is z-uniform
    const lap = (F[c + 1] + F[c - 1] + F[c + sJ] + F[c - sJ] - 4 * Fc) + (F[c + sK] + F[c - sK] - 2 * Fc);
    return -((fe - fw + fn - fs) + (ft - fb)) / h + nu * lap / (h * h);
  }

  // ------------------------------------------------------------- the solver
  class CpuSolver {
    constructor(params) {
      this.kind = "cpu";
      this.params = params;
      const { N, Nz, span } = params, F = n => new Float64Array(n);
      const nu_ = Nz * N * (N + 1), nv_ = Nz * (N + 1) * N, nw_ = (Nz + 1) * N * N, nc = Nz * N * N;
      Object.assign(this, {
        u: F(nu_), v: F(nv_), w: F(nw_), us: F(nu_), vs: F(nv_), ws: F(nw_),
        ru: F(nu_), rv: F(nv_), rw: F(nw_), q: F(nc), rhs: F(nc), vel: F(3 * nc),
        t: 0.0, phi: 0.0, spin: 0.0, dt_prev: 0.0, nstep: 0, _torque: 0.0 });
      const zc = span === "periodic" ? "wrap" : "cell", zw = span === "periodic" ? "wrapface" : "face";
      this.mU = [axisMap(Nz, zc), axisMap(N, "cell"), axisMap(N + 1, "face")];
      this.mV = [axisMap(Nz, zc), axisMap(N + 1, "face"), axisMap(N, "cell")];
      this.mW = [axisMap(Nz + 1, zw), axisMap(N, "cell"), axisMap(N, "cell")];
      this.PU = F((Nz + 4) * (N + 4) * (N + 5));
      this.PV = F((Nz + 4) * (N + 5) * (N + 4));
      this.PW = F((Nz + 5) * (N + 4) * (N + 4));
      this.makeBodyTables();
      this.makeLevels();
      this.initState();
    }

    destroy() { /* nothing to release */ }

    // ----------------------------------------------------------- initial state
    // Fluid at rest plus the deliberate 3D seed (seed_velocity in fv3d.py; none for Nz < 4 or seed = 0),
    // then one projection (16 V-cycles from q = 0) so that the discrete field is divergence free.
    initState() {
      const p = this.params;
      if (!(p.Nz >= 4 && p.seed !== 0)) return;
      this.seedVelocity();
      this.divergence();
      for (let c = 0; c < 16; c++) this.vcycle(0);
      this.project();
      this.q.fill(0);
    }

    // The seed is the analytic divergence-free velocity curl(psi y-hat): u = -dpsi/dz, v = 0, w = dpsi/dx,
    //   psi = a F(x,y) W(z) S(z),  F = sin^2(pi x) sin(pi y),  a = seed Uref,
    //   S = sum_{m=1}^{M} sin(k_m z + m)/k_m,  k_m = 2 pi m/Lz,  M = min(4, Nz//4),
    //   W = 1 (periodic) or sin^2(pi z/Lz) (walls);   u = -a F (W' S + W S'),  w = a (dF/dx) W S.
    seedVelocity() {
      const p = this.params, { N, Nz, h, Lz, span } = p, M = Math.min(4, Math.floor(Nz / 4));
      if (M === 0 || p.seed === 0) return;
      const a = p.seed * p.Uref;
      const zfun = z => {
        let S = 0, dS = 0;
        for (let m = 1; m <= M; m++) { const k = 2 * Math.PI * m / Lz; S += Math.sin(k * z + m) / k; dS += Math.cos(k * z + m); }
        if (span === "walls") { const s1 = Math.sin(Math.PI * z / Lz); return [S, dS, s1 * s1, Math.PI / Lz * Math.sin(2 * Math.PI * z / Lz)]; }
        return [S, dS, 1.0, 0.0];
      };
      for (let k = 0; k < Nz; k++) {
        const [S, dS, W, dW] = zfun((k + 0.5) * h), g = dW * S + W * dS;
        for (let j = 0; j < N; j++) for (let i = 0; i <= N; i++) {
          const sx = Math.sin(Math.PI * (i * h)), F = sx * sx * Math.sin(Math.PI * ((j + 0.5) * h));
          this.u[(k * N + j) * (N + 1) + i] = (i === 0 || i === N) ? 0.0 : (-a * F) * g;
        }
      }
      for (let k = 0; k <= Nz; k++) {
        const [S, , W] = zfun(k * h), ws = W * S;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const dFdx = Math.PI * Math.sin(2 * Math.PI * ((i + 0.5) * h)) * Math.sin(Math.PI * ((j + 0.5) * h));
          this.w[(k * N + j) * N + i] = (a * dFdx) * ws;
        }
      }
      if (span === "walls") { this.w.fill(0, 0, N * N); this.w.fill(0, Nz * N * N); }
      else this.w.copyWithin(Nz * N * N, 0, N * N);
    }

    // ----------------------------------------------------------- momentum
    // R = -div(flux) + nu lap for u, v, w (interior faces only), then the Adams-Bashforth update
    // us = u + dt (a R + b R_prev) (first step: forward Euler).  Returns nothing; fills us, vs, ws, ru, rv, rw.
    momentum(a, b) {
      const p = this.params, { N, Nz, h, nu, span, dt } = p;
      pad3(this.u, N, N + 1, ...this.mU, this.PU);
      pad3(this.v, N + 1, N, ...this.mV, this.PV);
      pad3(this.w, N, N, ...this.mW, this.PW);
      const { PU, PV, PW, u, v, w, us, vs, ws, ru, rv, rw } = this;
      us.set(u); vs.set(v); ws.set(w);                       // wall faces keep their value (R = 0 there)
      const usJ = N + 5, usK = (N + 4) * (N + 5);            // padded strides of u
      const vsJ = N + 4, vsK = (N + 5) * (N + 4);            // v
      const wsJ = N + 4, wsK = (N + 4) * (N + 4);            // w
      const U = (k, j, i) => (k + 2) * usK + (j + 2) * usJ + i + 2;
      const V = (k, j, i) => (k + 2) * vsK + (j + 2) * vsJ + i + 2;
      const W = (k, j, i) => (k + 2) * wsK + (j + 2) * wsJ + i + 2;
      const avg = (x, y) => 0.5 * (x + y);
      // ---- u at faces i = 1..N-1
      for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 1; i < N; i++) {
        const c = U(k, j, i), n = (k * N + j) * (N + 1) + i;
        const R = rhsBlock(PU, c, usJ, usK,
          avg(PU[c], PU[c + 1]), avg(PU[c - 1], PU[c]),
          avg(PV[V(k, j + 1, i - 1)], PV[V(k, j + 1, i)]), avg(PV[V(k, j, i - 1)], PV[V(k, j, i)]),
          avg(PW[W(k + 1, j, i - 1)], PW[W(k + 1, j, i)]), avg(PW[W(k, j, i - 1)], PW[W(k, j, i)]), h, nu);
        us[n] = u[n] + dt * (a * R + b * ru[n]); ru[n] = R;
      }
      // ---- v at faces j = 1..N-1
      for (let k = 0; k < Nz; k++) for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) {
        const c = V(k, j, i), n = (k * (N + 1) + j) * N + i;
        const R = rhsBlock(PV, c, vsJ, vsK,
          avg(PU[U(k, j - 1, i + 1)], PU[U(k, j, i + 1)]), avg(PU[U(k, j - 1, i)], PU[U(k, j, i)]),
          avg(PV[c], PV[c + vsJ]), avg(PV[c - vsJ], PV[c]),
          avg(PW[W(k + 1, j - 1, i)], PW[W(k + 1, j, i)]), avg(PW[W(k, j - 1, i)], PW[W(k, j, i)]), h, nu);
        vs[n] = v[n] + dt * (a * R + b * rv[n]); rv[n] = R;
      }
      // ---- w at faces k = 1..Nz-1 (walls) or k = 0..Nz-1 (periodic; w[Nz] copies w[0])
      const k0 = span === "walls" ? 1 : 0;
      for (let k = k0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const c = W(k, j, i), n = (k * N + j) * N + i;
        const R = rhsBlock(PW, c, wsJ, wsK,
          avg(PU[U(k - 1, j, i + 1)], PU[U(k, j, i + 1)]), avg(PU[U(k - 1, j, i)], PU[U(k, j, i)]),
          avg(PV[V(k - 1, j + 1, i)], PV[V(k, j + 1, i)]), avg(PV[V(k - 1, j, i)], PV[V(k, j, i)]),
          avg(PW[c], PW[c + wsK]), avg(PW[c - wsK], PW[c]), h, nu);
        ws[n] = w[n] + dt * (a * R + b * rw[n]); rw[n] = R;
      }
      if (span === "periodic") {
        ws.copyWithin(Nz * N * N, 0, N * N);
        rw.copyWithin(Nz * N * N, 0, N * N);
      }
    }

    // ----------------------------------------------------------- the body
    bodyCentre(phi) { const p = this.params; return [0.5 + p.ro * Math.cos(phi), 0.5 + p.ro * Math.sin(phi)]; }

    // Smoothed indicator chi (1 inside, 0 outside, tanh over ~eps) and the rigid-body velocity
    // (orbit of the centre + spin about it) at the point (x, y); the body does not depend on z.
    bodyMaskVelocity(x, y, phi) {
      const p = this.params, [cx, cy] = this.bodyCentre(phi);
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      const chi = p.mask === "tanh" ? 0.5 * (1 - Math.tanh((r - p.R) / p.eps))        // legacy mask
        : Math.min(Math.max((p.R - r) / p.eps, 0.0), 1.0);                            // linear ramp inside the circle
      const ub = -p.omega_o * (cy - 0.5) - p.Omega * dy;
      const vb = p.omega_o * (cx - 0.5) + p.Omega * dx;
      return [chi, ub, vb];
    }

    // (x, y) of the nodes of one z-layer; they do not depend on k
    makeBodyTables() {
      const { N, h } = this.params;
      const mk = (nj, ni, fx, fy) => {
        const x = new Float64Array(nj * ni), y = new Float64Array(nj * ni);
        for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) { x[j * ni + i] = fx(i) * h; y[j * ni + i] = fy(j) * h; }
        return { x, y, chi: new Float64Array(nj * ni), b: new Float64Array(nj * ni) };
      };
      this.tu = mk(N, N + 1, i => i, j => j + 0.5);
      this.tv = mk(N + 1, N, i => i + 0.5, j => j);
      this.tw = mk(N, N, i => i + 0.5, j => j + 0.5);
    }

    // u = u* + chi (u_body - u*) on interior faces (penalisation, eta -> 0); w_body = 0
    penalise(phi) {
      const { N, Nz, span } = this.params, { u, v, w, us, vs, ws } = this;
      const fill = (t, comp) => {
        for (let n = 0; n < t.x.length; n++) { const r = this.bodyMaskVelocity(t.x[n], t.y[n], phi); t.chi[n] = r[0]; t.b[n] = comp < 0 ? 0.0 : r[comp]; }
      };
      fill(this.tu, 1); fill(this.tv, 2); fill(this.tw, -1);
      for (let k = 0; k < Nz; k++) {
        for (let n = 0; n < N * (N + 1); n++) { const o = k * N * (N + 1) + n; u[o] = us[o] + this.tu.chi[n] * (this.tu.b[n] - us[o]); }
        for (let n = 0; n < (N + 1) * N; n++) { const o = k * (N + 1) * N + n; v[o] = vs[o] + this.tv.chi[n] * (this.tv.b[n] - vs[o]); }
        for (let j = 0; j < N; j++) { u[(k * N + j) * (N + 1)] = 0.0; u[(k * N + j) * (N + 1) + N] = 0.0; }
        for (let i = 0; i < N; i++) { v[k * (N + 1) * N + i] = 0.0; v[k * (N + 1) * N + N * N + i] = 0.0; }
      }
      for (let k = 0; k <= Nz; k++) for (let n = 0; n < N * N; n++) {
        const o = k * N * N + n; w[o] = ws[o] + this.tw.chi[n] * (0.0 - ws[o]);
      }
      if (span === "walls") { w.fill(0.0, 0, N * N); w.fill(0.0, Nz * N * N); }
      else w.copyWithin(Nz * N * N, 0, N * N);
    }

    // ----------------------------------------------------------- projection
    divergence() {
      const { N, Nz, h } = this.params, { u, v, w, rhs } = this;
      for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const iu = (k * N + j) * (N + 1) + i, iv = (k * (N + 1) + j) * N + i, iw = (k * N + j) * N + i;
        rhs[iw] = ((u[iu + 1] - u[iu] + v[iv + N] - v[iv]) + (w[iw + N * N] - w[iw])) / h;
      }
    }

    project() {
      const { N, Nz, h, span } = this.params, { u, v, w, q } = this;
      for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 1; i < N; i++)
        u[(k * N + j) * (N + 1) + i] -= (q[(k * N + j) * N + i] - q[(k * N + j) * N + i - 1]) / h;
      for (let k = 0; k < Nz; k++) for (let j = 1; j < N; j++) for (let i = 0; i < N; i++)
        v[(k * (N + 1) + j) * N + i] -= (q[(k * N + j) * N + i] - q[(k * N + j - 1) * N + i]) / h;
      for (let k = 1; k < Nz; k++) for (let n = 0; n < N * N; n++)
        w[k * N * N + n] -= (q[k * N * N + n] - q[(k - 1) * N * N + n]) / h;
      if (span === "periodic") {            // the face z = 0 lies between cell Nz-1 and cell 0
        for (let n = 0; n < N * N; n++) w[n] -= (q[n] - q[(Nz - 1) * N * N + n]) / h;
        w.copyWithin(Nz * N * N, 0, N * N);
      }
    }

    // ----------------------------------------------------------- multigrid
    // Levels (n, nz): z is coarsened together with x and y while nz >= 2 (semi-coarsening).
    makeLevels() {
      const { N, Nz } = this.params, F = n => new Float64Array(n);
      this.levels = [];
      for (let n = N, nz = Nz, l = 0; n >= 4; n /= 2, l++, nz = nz >= 2 ? nz / 2 : 1) {
        const m = nz * n * n;
        this.levels.push({ n, nz, h: this.params.h * 2 ** l,
          x: l ? F(m) : this.q, b: l ? F(m) : this.rhs, r: F(m), tmp: F(m) });
      }
    }

    // sum of the existing neighbours of cell (k, j, i) and their number (neighbour_sum / neighbour_count)
    nsum(x, n, nz, k, j, i) {
      const periodic = this.params.span === "periodic", o = (k * n + j) * n + i, nn = n * n;
      let s = 0.0, c = 0;
      if (j > 0) { s += x[o - n]; c++; }
      if (j < n - 1) { s += x[o + n]; c++; }
      if (i > 0) { s += x[o - 1]; c++; }
      if (i < n - 1) { s += x[o + 1]; c++; }
      if (nz >= 2) {                         // with one layer there is no z-coupling
        if (periodic) { s += x[((k + nz - 1) % nz) * nn + j * n + i] + x[((k + 1) % nz) * nn + j * n + i]; c += 2; }
        else {
          if (k > 0) { s += x[o - nn]; c++; }
          if (k < nz - 1) { s += x[o + nn]; c++; }
        }
      }
      return [s, c];
    }

    // Red-black Gauss-Seidel, colour = parity of i+j in EVERY layer (z-independent colouring).
    // A cell and its z-neighbours share a colour, so the new values are computed from the old
    // ones first (Jacobi in z) and written afterwards, as numpy does.
    smooth(lv, sweeps) {
      const { n, nz, x, b, tmp } = lv, hh = lv.h * lv.h;
      for (let s = 0; s < sweeps; s++) for (let colour = 0; colour < 2; colour++) {
        for (let k = 0; k < nz; k++) for (let j = 0; j < n; j++) for (let i = (j + colour) % 2; i < n; i += 2) {
          const o = (k * n + j) * n + i, [sum, cnt] = this.nsum(x, n, nz, k, j, i);
          tmp[o] = (sum - hh * b[o]) / cnt;
        }
        for (let k = 0; k < nz; k++) for (let j = 0; j < n; j++) for (let i = (j + colour) % 2; i < n; i += 2) {
          const o = (k * n + j) * n + i; x[o] = tmp[o];
        }
      }
    }

    // fine residual -> coarse right-hand side: average of the 4 children in x,y and of the 2 layers in z
    restrict(lv, nx) {
      const { n, nz, r } = lv, nc = n / 2, nzc = nx.nz, rc = new Float64Array(nz * nc * nc);
      for (let k = 0; k < nz; k++) for (let J = 0; J < nc; J++) for (let I = 0; I < nc; I++) {
        const o = (k * n + 2 * J) * n + 2 * I;
        rc[(k * nc + J) * nc + I] = 0.25 * (r[o] + r[o + n] + r[o + 1] + r[o + n + 1]);
      }
      for (let K = 0; K < nzc; K++) for (let m = 0; m < nc * nc; m++)
        nx.b[K * nc * nc + m] = nz >= 2 ? 0.5 * (rc[2 * K * nc * nc + m] + rc[(2 * K + 1) * nc * nc + m]) : rc[K * nc * nc + m];
    }

    // coarse correction -> fine grid, trilinear (weights 3/4, 1/4 per direction), zero gradient at
    // x,y walls, wrapping (periodic) or clipped (walls) in z; added to x
    prolongAdd(lv, nx) {
      const { n, nz, x } = lv, nc = n / 2, nzc = nx.nz, xc = nx.x;
      const plane = (K, j, i) => {              // 2D trilinear value of coarse layer K at fine (j, i)
        const J = j >> 1, I = i >> 1;
        const I2 = Math.min(Math.max(I + (i % 2 === 0 ? -1 : 1), 0), nc - 1);
        const J2 = Math.min(Math.max(J + (j % 2 === 0 ? -1 : 1), 0), nc - 1);
        const o = K * nc * nc;
        const a = 0.75 * xc[o + J * nc + I] + 0.25 * xc[o + J2 * nc + I];
        const c = 0.75 * xc[o + J * nc + I2] + 0.25 * xc[o + J2 * nc + I2];
        return 0.75 * a + 0.25 * c;
      };
      for (let k = 0; k < nz; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        let val;
        if (nz === nzc) val = plane(k, j, i);                          // z was not coarsened on this level
        else {
          const K = k >> 1, off = k % 2 === 0 ? -1 : 1;
          const K2 = this.params.span === "periodic" ? (K + off + nzc) % nzc : Math.min(Math.max(K + off, 0), nzc - 1);
          val = 0.75 * plane(K, j, i) + 0.25 * plane(K2, j, i);
        }
        x[(k * n + j) * n + i] += val;
      }
    }

    vcycle(l) {
      const p = this.params, lv = this.levels[l], { n, nz, x, b, r } = lv, hh = lv.h * lv.h;
      if (n <= 4) {                           // coarsest grid: many sweeps, fix the constant
        this.smooth(lv, p.ncoarse);
        let m = 0;
        for (let o = 0; o < x.length; o++) m += x[o];
        m /= x.length;
        for (let o = 0; o < x.length; o++) x[o] -= m;
        return;
      }
      this.smooth(lv, p.nu1);
      for (let k = 0; k < nz; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const o = (k * n + j) * n + i, [sum, cnt] = this.nsum(x, n, nz, k, j, i);
        r[o] = b[o] - (sum - cnt * x[o]) / hh;
      }
      const nx = this.levels[l + 1];
      this.restrict(lv, nx);
      nx.x.fill(0);
      this.vcycle(l + 1);
      this.prolongAdd(lv, nx);
      this.smooth(lv, p.nu2);
    }

    solvePressure(cycles) {
      const c = cycles === undefined ? this.params.vcycles : cycles;
      for (let m = 0; m < c; m++) this.vcycle(0);
    }

    // ----------------------------------------------------------- one time step
    stepOnce() {
      const p = this.params, dt = p.dt;
      let a = 1.0, b = 0.0;
      if (this.dt_prev !== 0.0) { const r = dt / this.dt_prev; a = 1 + 0.5 * r; b = -0.5 * r; }   // variable-step AB2
      this.momentum(a, b);
      const phi = this.phi + p.omega_o * dt;                  // body position at the new time level
      this.penalise(phi);
      this.divergence();
      this.solvePressure();                                   // warm start from the previous q
      this.project();
      this.t += dt; this.phi = phi; this.spin += p.Omega * dt; this.dt_prev = dt; this.nstep++;
    }

    step(n) { for (let s = 0; s < (n === undefined ? 1 : n); s++) this.stepOnce(); }

    // ----------------------------------------------------------- diagnostics
    // Velocity at the cell centres, [c][k][j][i] (average of the two faces); returns the internal array.
    velocity() {
      const { N, Nz } = this.params, { u, v, w, vel } = this, nc = Nz * N * N;
      for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (k * N + j) * N + i;
        vel[o] = 0.5 * (u[(k * N + j) * (N + 1) + i + 1] + u[(k * N + j) * (N + 1) + i]);
        vel[nc + o] = 0.5 * (v[(k * (N + 1) + j + 1) * N + i] + v[(k * (N + 1) + j) * N + i]);
        vel[2 * nc + o] = 0.5 * (w[o + N * N] + w[o]);
      }
      return vel;
    }

    async readVelocity() { return this.velocity().slice(); }

    // z-torque of the fluid ON the body about its centre, per unit span, from the penalisation force
    // (per volume) f = chi (u_body - u*) / dt summed over interior faces; the body feels minus that.
    torque() {
      const { N, Nz, h, dt } = this.params, { us, vs } = this;
      const [cx, cy] = this.bodyCentre(this.phi);
      const tu = this.tu, tv = this.tv;
      for (let n = 0; n < tu.x.length; n++) { const r = this.bodyMaskVelocity(tu.x[n], tu.y[n], this.phi); tu.chi[n] = r[0]; tu.b[n] = r[1]; }
      for (let n = 0; n < tv.x.length; n++) { const r = this.bodyMaskVelocity(tv.x[n], tv.y[n], this.phi); tv.chi[n] = r[0]; tv.b[n] = r[2]; }
      const sumV = new Sum(), sumU = new Sum();
      for (let k = 0; k < Nz; k++) {
        for (let j = 1; j < N; j++) for (let i = 0; i < N; i++) {
          const n = j * N + i, fy = tv.chi[n] * (tv.b[n] - vs[k * (N + 1) * N + n]) / dt;
          sumV.add((tv.x[n] - cx) * fy);
        }
        for (let j = 0; j < N; j++) for (let i = 1; i < N; i++) {
          const n = j * (N + 1) + i, fx = tu.chi[n] * (tu.b[n] - us[k * N * (N + 1) + n]) / dt;
          sumU.add((tu.y[n] - cy) * fx);
        }
      }
      return -((sumV.value() - sumU.value()) * h * h / Nz);
    }
    async readTorque() { return this.torque(); }

    // max |div u| over the cells
    maxdiv() {
      this.divergence();
      let m = 0;
      for (let o = 0; o < this.rhs.length; o++) m = Math.max(m, Math.abs(this.rhs[o]));
      return m;
    }

    // energy per unit span: (1/Lz) integral of 1/2 |u|^2 dV
    energy() {
      const { N, Nz, h } = this.params, U = this.velocity(), s = new Sum();
      for (let o = 0; o < U.length; o++) s.add(U[o] * U[o]);
      return 0.5 * s.value() * h * h / Nz;
    }
  }

  // compensated (Neumaier) sum, so that the order of summation does not matter at the 1e-16 level
  class Sum {
    constructor() { this.s = 0; this.c = 0; }
    add(x) { const t = this.s + x; this.c += Math.abs(this.s) >= Math.abs(x) ? (this.s - t) + x : (x - t) + this.s; this.s = t; }
    value() { return this.s + this.c; }
  }

  // ------------------------------------------------------------- self-test
  // Compare a solver (made by factory(params)) with the numpy values ref = selftest_fv.reference().
  // Returns (a promise of) rows {name, expected, got, absdiff, reldiff, tol, pass}.
  //   torque, E, checksum: relative difference |got - expected| / |expected|
  //   samples: worst |got - expected| over the sampled values, relative to max |expected sample|
  // Default tolerance: 1e-12 for float64 solvers (kind "cpu"), 1e-2 for the float32 GPU ones (measured worst 4.7e-3, a torque).
  async function selftest(factory, ref, opts) {
    opts = opts || {};
    const rows = [];
    for (const cs of ref.cases) {
      const p = makeParams(cs.inp);
      const s = await factory(p);
      const tol = opts.tol !== undefined ? opts.tol : (s.kind === "gpu" ? 1e-2 : 1e-12);
      await s.step(cs.steps);
      const vel = await s.readVelocity(), tq = await s.readTorque();
      const { N, Nz, h } = p, nc = Nz * N * N;
      let sq = 0, E = 0;
      for (let o = 0; o < vel.length; o++) sq += vel[o] * vel[o];
      E = 0.5 * sq * h * h / Nz;
      const out = cs.outputs, add = (name, expected, got, scale) => {
        const absdiff = Math.abs(got - expected), reldiff = absdiff / (scale === undefined ? Math.abs(expected) : scale);
        rows.push({ name: cs.name + ": " + name, expected, got, absdiff, reldiff, tol, pass: reldiff <= tol });
      };
      add("torque", out.torque, tq);
      add("E", out.E, E);
      add("checksum (sum u^2)", out.checksum, sq);
      let worst = 0, wexp = 0, wgot = 0, vmax = 0;
      for (const [c, k, j, i, val] of out.samples) vmax = Math.max(vmax, Math.abs(val));
      for (const [c, k, j, i, val] of out.samples) {
        const g = vel[c * nc + (k * N + j) * N + i];
        if (Math.abs(g - val) >= worst) { worst = Math.abs(g - val); wexp = val; wgot = g; }
      }
      add("velocity samples (worst of " + out.samples.length + ", rel. to max|sample|)", wexp, wgot, vmax);
      if (s.destroy) s.destroy();
    }
    return rows;
  }

  Object.assign(fv, { makeParams, CpuSolver, selftest, faceValue, minmod, Sum });
  if (typeof module !== "undefined" && module.exports) module.exports = fv;
})();
