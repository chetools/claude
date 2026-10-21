/* lbm_cpu.js -- D3Q19 lattice Boltzmann with a moving cylinder, float64 JavaScript port of python/lbm3d.py.
 *
 * Same names and the same steps as the numpy reference (python/lbm3d.py), organised like the numba
 * port (python/sweep/lbm_fast.py) and the WGSL kernels (web/lbm.wgsl):
 *
 *   step():  body (phi, solid mask)  ->  refill  ->  collide + stream + halfway bounce-back (one pass)
 *            -> cut links of the body (Bouzidi, moving wall, Wen momentum exchange)
 *            -> mass_correction  -> (solid nodes carry the body's equilibrium)
 *
 * Layout: f[q][k][j][i], flat index ((q*Nz + k)*N + j)*N + i, lattice units inside (h = dt = 1).
 * API:  CC3.lbm.makeParams(inp)           == python make_params (same keys / numbers)
 *       new CC3.lbm.CpuSolver(params)     solver interface of SPEC.md
 *       CC3.lbm.selftest(factory, ref)    rows {name, expected, got, absdiff, reldiff, tol, pass}
 * Loadable in node: module.exports = CC3.lbm.
 */
(function () {
  "use strict";
  var G = typeof window !== "undefined" ? window : globalThis;
  G.CC3 = G.CC3 || {};
  var lbm = (G.CC3.lbm = G.CC3.lbm || {});

  // ------------------------------------------------------------------ the lattice D3Q19
  var CX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0];
  var CY = [0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1];
  var CZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1];
  var W = [1 / 3];
  var OPP = [0];
  var q0;
  for (q0 = 1; q0 < 19; q0++) {
    W.push(q0 <= 6 ? 1 / 18 : 1 / 36);
    OPP.push(q0 % 2 === 1 ? q0 + 1 : q0 - 1);
  }
  var CS2 = 1.0 / 3.0;
  var MRT_RATES = { e: 1.19, eps: 1.4, q: 1.2, pi: 1.4, m: 1.98 };
  lbm.lattice = { CX: CX, CY: CY, CZ: CZ, W: W, OPP: OPP, MRT_RATES: MRT_RATES };

  /** d'Humieres (2002) moment matrix (19 x 19, rows = moments). */
  function mrtBasis() {
    var rows = [];
    for (var m = 0; m < 19; m++) rows.push(new Array(19));
    for (var q = 0; q < 19; q++) {
      var x = CX[q], y = CY[q], z = CZ[q], c2 = x * x + y * y + z * z;
      var v = [
        1, 19 * c2 - 30, (21 * c2 * c2 - 53 * c2 + 24) / 2,
        x, (5 * c2 - 9) * x, y, (5 * c2 - 9) * y, z, (5 * c2 - 9) * z,
        3 * x * x - c2, (3 * c2 - 5) * (3 * x * x - c2),
        y * y - z * z, (3 * c2 - 5) * (y * y - z * z),
        x * y, y * z, x * z,
        (y * y - z * z) * x, (z * z - x * x) * y, (x * x - y * y) * z];
      for (var m2 = 0; m2 < 19; m2++) rows[m2][q] = v[m2];
    }
    return rows;
  }

  /** A = M^-1 S M.  The rows of M are mutually orthogonal, so M^-1 = M^T diag(1/|row|^2) (no solve needed). */
  function mrtMatrix(omega) {
    var M = mrtBasis(), r = MRT_RATES;
    var s = [0, r.e, r.eps, 0, r.q, 0, r.q, 0, r.q, omega, r.pi, omega, r.pi, omega, omega, omega, r.m, r.m, r.m];
    var A = [];
    for (var a = 0; a < 19; a++) A.push(new Array(19).fill(0));
    for (var m = 0; m < 19; m++) {
      var nn = 0;
      for (var q = 0; q < 19; q++) nn += M[m][q] * M[m][q];
      var sm = s[m] / nn;
      for (var a2 = 0; a2 < 19; a2++)
        for (var b = 0; b < 19; b++) A[a2][b] += M[m][a2] * sm * M[m][b];
    }
    return A;
  }
  lbm.mrtMatrix = mrtMatrix;

  // ------------------------------------------------------------------ parameters
  var DEFAULT_COLLISION = "reg";

  /** Inputs -> everything a step needs; same keys and numbers as python lbm3d.make_params (+ lattice_params). */
  function makeParams(inp) {
    inp = inp || {};
    var d = { N: 64, Nz: 1, Re: 200.0, R: 0.1, ro: 0.2, Us: 1.0, Uo: 0.0, span: "periodic", u_lb: 0.05,
              collision: DEFAULT_COLLISION, seed: 1e-3 };
    var a = {};
    for (var k in d) a[k] = inp[k] !== undefined ? inp[k] : d[k];
    var N = a.N, Nz = a.Nz;
    if (!(N >= 8 && (N & (N - 1)) === 0 && Nz >= 1 && (Nz & (Nz - 1)) === 0))
      throw new Error("N must be a power of two >= 8 and Nz a power of two >= 1");
    if (a.collision !== "bgk" && a.collision !== "reg" && a.collision !== "mrt") throw new Error("collision: bgk | reg | mrt");
    if (a.span !== "periodic" && a.span !== "walls") throw new Error("span: periodic | walls");
    var h = 1.0 / N, ro = a.ro, Uo = a.Uo;
    if (ro < 0.02) { ro = 0.0; Uo = 0.0; }
    var Uref = Math.max(Math.abs(a.Us), Math.abs(Uo)) || 1.0;
    var nu = Uref * 2 * a.R / a.Re;
    var Omega = a.Us / a.R;
    var omega_o = ro > 0 ? Uo / ro : 0.0;
    var Umax = Math.abs(a.Us) + Math.abs(omega_o) * (ro + a.R);
    var dt = a.u_lb * h / (Umax || Uref);
    var nu_lb = nu * dt / (h * h);
    var tau = 3.0 * nu_lb + 0.5;
    var p = { N: N, Nz: Nz, nu_lb: nu_lb, tau: tau, omega: 1.0 / tau, collision: a.collision, span: a.span,
              wall_x: true, wall_y: true, mrt_A: mrtMatrix(1.0 / tau),
              h: h, Lz: Nz * h, Re: a.Re, R: a.R, ro: ro, Us: a.Us, Uo: Uo, nu: nu, Omega: Omega,
              omega_o: omega_o, dt: dt, u_lb: a.u_lb, seed: a.seed, Uref: Uref };
    if (inp.mass_fix !== undefined) p.mass_fix = inp.mass_fix;   // test switch (python: p["mass_fix"])
    return p;
  }

  lbm.makeParams = makeParams;

  // ------------------------------------------------------------------ body and geometry (lattice units)
  /** Cylinder at orbit angle phi: centre, radius, rigid-body velocity in lattice units. */
  function makeBody(phi, p) {
    var N = p.N;
    return { cx: N * (0.5 + p.ro * Math.cos(phi)), cy: N * (0.5 + p.ro * Math.sin(phi)), R: p.R * N,
             wo: p.omega_o * p.dt, Om: p.Omega * p.dt, N: N };
  }
  function bodyU(b, x, y) { return -b.wo * (b.cy - b.N / 2) - b.Om * (y - b.cy); }
  function bodyV(b, x, y) { return b.wo * (b.cx - b.N / 2) + b.Om * (x - b.cx); }

  /** Node-centre-inside-circle mask, Uint8Array(N*N) [j*N+i]. */
  function solidMask(b, N, out) {
    out = out || new Uint8Array(N * N);
    for (var j = 0; j < N; j++)
      for (var i = 0; i < N; i++) out[j * N + i] = Math.hypot(i + 0.5 - b.cx, j + 0.5 - b.cy) < b.R ? 1 : 0;
    return out;
  }

  /** Bounding box of every node that can carry a cut link: origin (i0, j0), side B (cells). */
  function linkBox(b) { return { i0: Math.floor(b.cx - b.R) - 2, j0: Math.floor(b.cy - b.R) - 2, B: Math.ceil(2 * b.R) + 6 }; }

  // ------------------------------------------------------------------ initial state
  function equilibriumAt(f, vol, n, rho, ux, uy, uz) {
    var uu = ux * ux + uy * uy + uz * uz;
    for (var q = 0; q < 19; q++) {
      var cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz;
      f[q * vol + n] = W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu);
    }
  }

  /** Fluid at rest (rho = 1) plus the deliberate 3D seed (SPEC.md), as lbm3d.init_state.
   *  Returns {f: Float64Array(19*Nz*N*N), solid: Uint8Array(N*N), phi: 0}. */
  function initState(p) {
    var N = p.N, Nz = p.Nz, vol = Nz * N * N;
    var f = new Float64Array(19 * vol);
    var seeded = Nz > 1 && p.seed !== 0;
    var M = Math.min(4, Math.floor(Nz / 2));
    var sx = new Float64Array(N);
    for (var i = 0; i < N; i++) sx[i] = Math.sin(Math.PI * ((i + 0.5) / N));
    for (var k = 0; k < Nz; k++) {
      var prof = 0.0;
      if (seeded) { var z = (k + 0.5) / Nz; for (var m = 1; m <= M; m++) prof += Math.cos(2 * Math.PI * m * z + m); }
      for (var j = 0; j < N; j++)
        for (var i2 = 0; i2 < N; i2++) {
          var w = seeded ? p.seed * p.Uref * prof * (sx[j] * sx[i2]) * p.dt / p.h : 0.0;
          equilibriumAt(f, vol, (k * N + j) * N + i2, 1.0, 0.0, 0.0, w);
        }
    }
    var solid = new Uint8Array(N * N);
    if (p.R > 0) {
      var b = makeBody(0.0, p);
      solidMask(b, N, solid);
      resetSolid(f, vol, N, Nz, solid, b);
    }
    return { f: f, solid: solid, phi: 0.0 };
  }

  /** Solid nodes carry the equilibrium (rho = 1) of the body's velocity (lbm3d._reset_solid). */
  function resetSolid(f, vol, N, Nz, solid, b) {
    for (var j = 0; j < N; j++)
      for (var i = 0; i < N; i++) {
        if (!solid[j * N + i]) continue;
        var ub = bodyU(b, i + 0.5, j + 0.5), vb = bodyV(b, i + 0.5, j + 0.5);
        for (var k = 0; k < Nz; k++) equilibriumAt(f, vol, (k * N + j) * N + i, 1.0, ub, vb, 0.0);
      }
  }

  // ------------------------------------------------------------------ the solver
  function CpuSolver(params) {
    var p = (this.params = params);
    var N = p.N, Nz = p.Nz, vol = Nz * N * N;
    if (!(p.wall_x !== false && p.wall_y !== false)) throw new Error("periodic x / y boxes are not supported");
    this.vol = vol;
    var st = initState(p);
    this.f = st.f;
    this.g = new Float64Array(19 * vol);
    this.solid = st.solid;                       // current (new) mask
    this.solidOld = new Uint8Array(st.solid);
    this.phi = 0.0;
    this.t = 0.0;
    this.nstep = 0;
    this.exchange = [0, 0, 0];                   // lattice (Fx, Fy, Tz) of the last step, summed over the span
    this.kind = { bgk: 0, reg: 1, mrt: 2 }[p.collision];
    this.A = new Float64Array(361);
    for (var a = 0; a < 19; a++) for (var b = 0; b < 19; b++) this.A[a * 19 + b] = p.mrt_A[a][b];
    this.massFix = p.mass_fix !== false;
    this._fp = new Float64Array(19);
    this._tmp = new Float64Array(19);
    this._fpl = null;                            // post-collision populations of the link-box nodes
    this._U = null;
  }
  lbm.CpuSolver = CpuSolver;
  lbm.initState = initState;
  lbm.makeBody = makeBody;
  lbm.solidMask = solidMask;
  lbm.linkBox = linkBox;

  var P = CpuSolver.prototype;

  /** Refill (lbm3d.refill): nodes the body has just left get the equilibrium at the body velocity and the
   *  mean density of their valid in-plane neighbours, plus the neighbours' mean non-equilibrium part. */
  P._refill = function (b) {
    var p = this.params, N = p.N, Nz = p.Nz, vol = this.vol, f = this.f, so = this.solidOld, sn = this.solid;
    var acc = new Float64Array(19);
    for (var j0 = 0; j0 < N; j0++)
      for (var i0 = 0; i0 < N; i0++) {
        if (!(so[j0 * N + i0] && !sn[j0 * N + i0])) continue;
        var ub = bodyU(b, i0 + 0.5, j0 + 0.5), vb = bodyV(b, i0 + 0.5, j0 + 0.5);
        for (var k = 0; k < Nz; k++) {
          acc.fill(0);
          var accr = 0.0, cnt = 0.0;
          for (var dj = -1; dj <= 1; dj++)
            for (var di = -1; di <= 1; di++) {
              if (dj === 0 && di === 0) continue;
              var jn = (j0 + dj + N) % N, inn = (i0 + di + N) % N;
              if (so[jn * N + inn] || sn[jn * N + inn]) continue;
              var n = (k * N + jn) * N + inn;
              var rho = 0.0, mx = 0.0, my = 0.0, mz = 0.0, q;
              for (q = 0; q < 19; q++) { var v = f[q * vol + n]; rho += v; mx += CX[q] * v; my += CY[q] * v; mz += CZ[q] * v; }
              var ux = mx / rho, uy = my / rho, uz = mz / rho, uu = ux * ux + uy * uy + uz * uz;
              for (q = 0; q < 19; q++) {
                var cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz;
                acc[q] += f[q * vol + n] - W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu);
              }
              accr += rho; cnt += 1.0;
            }
          var c = Math.max(cnt, 1.0), r = cnt > 0 ? accr / c : 1.0;
          var uub = ub * ub + vb * vb, n0 = (k * N + j0) * N + i0;
          for (var q2 = 0; q2 < 19; q2++) {
            var cu2 = CX[q2] * ub + CY[q2] * vb;
            f[q2 * vol + n0] = W[q2] * r * (1 + 3 * cu2 + 4.5 * cu2 * cu2 - 1.5 * uub) + acc[q2] / c;
          }
        }
      }
  };

  /** Collision of the node n of f: fills this._fp with f*, returns rho. */
  P._collide = function (f, n, vol) {
    var fp = this._fp, tmp = this._tmp, omega = this.params.omega, kind = this.kind, q;
    var rho = 0.0, mx = 0.0, my = 0.0, mz = 0.0;
    for (q = 0; q < 19; q++) { var v = f[q * vol + n]; fp[q] = v; rho += v; mx += CX[q] * v; my += CY[q] * v; mz += CZ[q] * v; }
    var ux = mx / rho, uy = my / rho, uz = mz / rho, uu = ux * ux + uy * uy + uz * uz;
    if (kind === 0) {                                         // BGK
      for (q = 0; q < 19; q++) {
        var cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz;
        var feq = W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uu);
        fp[q] = fp[q] - omega * (fp[q] - feq);
      }
    } else if (kind === 1) {                                  // regularised
      var pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
      for (q = 0; q < 19; q++) {
        var cx = CX[q], cy = CY[q], cz = CZ[q];
        var cu1 = cx * ux + cy * uy + cz * uz;
        var fn = fp[q] - W[q] * rho * (1 + 3 * cu1 + 4.5 * cu1 * cu1 - 1.5 * uu);
        tmp[q] = fn;
        pxx += cx * cx * fn; pyy += cy * cy * fn; pzz += cz * cz * fn;
        pxy += cx * cy * fn; pxz += cx * cz * fn; pyz += cy * cz * fn;
      }
      var a = 1.0 - omega, tr = pxx + pyy + pzz;
      for (q = 0; q < 19; q++) {
        var cx2 = CX[q], cy2 = CY[q], cz2 = CZ[q];
        var cu2 = cx2 * ux + cy2 * uy + cz2 * uz;
        var feq2 = W[q] * rho * (1 + 3 * cu2 + 4.5 * cu2 * cu2 - 1.5 * uu);
        var qp = cx2 * cx2 * pxx + cy2 * cy2 * pyy + cz2 * cz2 * pzz +
                 2.0 * (cx2 * cy2 * pxy + cx2 * cz2 * pxz + cy2 * cz2 * pyz) - CS2 * tr;
        fp[q] = feq2 + a * ((0.5 / (CS2 * CS2)) * W[q] * qp);
      }
    } else {                                                  // MRT: f - A f_neq
      for (q = 0; q < 19; q++) {
        var cu3 = CX[q] * ux + CY[q] * uy + CZ[q] * uz;
        tmp[q] = fp[q] - W[q] * rho * (1 + 3 * cu3 + 4.5 * cu3 * cu3 - 1.5 * uu);
      }
      var A = this.A;
      for (q = 0; q < 19; q++) {
        var s = 0.0;
        for (var m = 0; m < 19; m++) s += A[q * 19 + m] * tmp[m];
        fp[q] = fp[q] - s;
      }
    }
    return rho;
  };

  /** One step (lbm3d.step). */
  P.step = function (nsteps) {
    for (var it = 0; it < (nsteps === undefined ? 1 : nsteps); it++) this._step1();
  };

  P._step1 = function () {
    var p = this.params, N = p.N, Nz = p.Nz, vol = this.vol, wallz = p.span === "walls";
    this.phi += p.omega_o * p.dt;
    var b = makeBody(this.phi, p);
    // geometry: solidOld <- solid, solid <- new mask
    var tmpm = this.solidOld; this.solidOld = this.solid; this.solid = tmpm;
    solidMask(b, N, this.solid);
    var so = this.solidOld, sn = this.solid;
    var changed = false;
    for (var m = 0; m < N * N; m++) if (so[m] !== sn[m]) { changed = true; break; }
    if (changed) this._refill(b);
    // fused collide + stream + halfway bounce-back
    var f = this.f, g = this.g, fp = this._fp, i, j, k, q;
    var box = linkBox(b), Bx = box.B;
    var need = Bx * Bx * Nz * 19;
    if (!this._fpl || this._fpl.length !== need) this._fpl = new Float64Array(need);
    var fpl = this._fpl;
    var S = 0.0;                                  // sum over fluid nodes of (rho - 1) before collision
    for (k = 0; k < Nz; k++)
      for (j = 0; j < N; j++)
        for (i = 0; i < N; i++) {
          var n = (k * N + j) * N + i;
          if (sn[j * N + i]) {                    // solid node: equilibrium of the body velocity
            equilibriumAt(g, vol, n, 1.0, bodyU(b, i + 0.5, j + 0.5), bodyV(b, i + 0.5, j + 0.5), 0.0);
            continue;
          }
          var rho = this._collide(f, n, vol);
          S += rho - 1.0;
          var jb = j - box.j0, ib = i - box.i0;
          if (jb >= 0 && jb < Bx && ib >= 0 && ib < Bx) {
            var base = ((jb * Bx + ib) * Nz + k) * 19;
            for (q = 0; q < 19; q++) fpl[base + q] = fp[q];
          }
          g[n] = fp[0];
          for (q = 1; q < 19; q++) {
            var tx = i + CX[q], ty = j + CY[q], tz = k + CZ[q];
            if (tx < 0 || tx >= N || ty < 0 || ty >= N || (wallz && (tz < 0 || tz >= Nz))) {
              g[OPP[q] * vol + n] = fp[q];        // leaves the box: reflected (halfway bounce-back)
            } else if (!sn[ty * N + tx]) {        // (a push into the body is a cut link, handled below)
              g[q * vol + (((tz + Nz) % Nz) * N + ty) * N + tx] = fp[q];
            }
          }
        }
    // cut links of the body: Bouzidi interpolated bounce-back + Wen momentum exchange
    var Fx = 0.0, Fy = 0.0, Tz = 0.0, dM = 0.0;
    for (var jb2 = 0; jb2 < Bx; jb2++)
      for (var ib2 = 0; ib2 < Bx; ib2++) {
        j = box.j0 + jb2; i = box.i0 + ib2;
        if (j < 0 || j >= N || i < 0 || i >= N || sn[j * N + i]) continue;
        var dx = i + 0.5 - b.cx, dy = j + 0.5 - b.cy;
        for (q = 1; q < 19; q++) {
          var cx = CX[q], cy = CY[q], cz = CZ[q], a = cx * cx + cy * cy;
          if (a === 0) continue;
          var ni = i + cx, nj = j + cy;
          if (ni < 0 || ni >= N || nj < 0 || nj >= N || !sn[nj * N + ni]) continue;
          var qb = OPP[q];
          var bq = dx * cx + dy * cy;
          var disc = Math.max(bq * bq - a * (dx * dx + dy * dy - b.R * b.R), 0.0);
          var s = Math.min(Math.max((-bq - Math.sqrt(disc)) / a, 0.0), 1.0);
          var xw = i + 0.5 + s * cx, yw = j + 0.5 + s * cy;
          var ub = bodyU(b, xw, yw), vb = bodyV(b, xw, yw);
          var gw = -6.0 * W[q] * (cx * ub + cy * vb);
          for (k = 0; k < Nz; k++) {
            if (wallz && (k + cz < 0 || k + cz >= Nz)) continue;   // that link is a z-wall (bounce_back_walls)
            var nn = (k * N + j) * N + i;
            var base2 = ((jb2 * Bx + ib2) * Nz + k) * 19;
            var fq = fpl[base2 + q], fqb = fpl[base2 + qb];
            var i2 = i - cx, j2 = j - cy, k2 = k - cz;
            var ok = i2 >= 0 && i2 < N && j2 >= 0 && j2 < N;
            if (ok) ok = !sn[j2 * N + i2];
            if (ok && wallz) ok = k2 >= 0 && k2 < Nz;
            var f2 = ok ? g[q * vol + nn] : fq;       // streamed value = f*_q(x_f - c_q)
            var nw = s < 0.5 ? 2 * s * fq + (1 - 2 * s) * f2 + gw
                             : (fq + (2 * s - 1) * fqb + gw) / (2 * s);
            g[qb * vol + nn] = nw;
            var Px = (cx - ub) * fq + (cx + ub) * nw, Py = (cy - vb) * fq + (cy + vb) * nw;
            Fx += Px; Fy += Py;
            Tz += (xw - b.cx) * Py - (yw - b.cy) * Px;
            dM += nw - fq;
          }
        }
      }
    this.exchange = [Fx, Fy, Tz];
    // mass_correction: mean density of the fluid nodes back to exactly 1 (delta on f_0 of every fluid node)
    if (this.massFix) {
      var nf = 0;
      for (m = 0; m < N * N; m++) if (!sn[m]) nf++;
      nf *= Nz;
      var delta = -(S + dM) / nf;
      for (k = 0; k < Nz; k++)
        for (j = 0; j < N; j++)
          for (i = 0; i < N; i++) if (!sn[j * N + i]) g[(k * N + j) * N + i] += delta;
    }
    this.f = g; this.g = f;
    this.t += p.dt;
    this.nstep += 1;
  };

  /** Physical cell-centre velocity, Float64Array(3*Nz*N*N), layout [c][k][j][i]; reused buffer (no copy). */
  P.velocity = function () {
    var p = this.params, vol = this.vol, f = this.f, sc = p.h / p.dt;
    var U = this._U || (this._U = new Float64Array(3 * vol));
    for (var n = 0; n < vol; n++) {
      var rho = 0.0, mx = 0.0, my = 0.0, mz = 0.0;
      for (var q = 0; q < 19; q++) { var v = f[q * vol + n]; rho += v; mx += CX[q] * v; my += CY[q] * v; mz += CZ[q] * v; }
      U[n] = (mx / rho) * sc; U[vol + n] = (my / rho) * sc; U[2 * vol + n] = (mz / rho) * sc;
    }
    return U;
  };
  P.readVelocity = function () { return Promise.resolve(this.velocity()); };

  /** z-torque of the fluid on the cylinder about its centre per unit span, physical units (rho = 1). */
  P.torque = function () { var p = this.params; return this.exchange[2] * (Math.pow(p.h, 4) / (p.dt * p.dt)) / p.Nz; };
  P.readTorque = function () { return Promise.resolve(this.torque()); };
  /** Fx, Fy per unit span, physical units. */
  P.force = function () {
    var p = this.params, s = Math.pow(p.h, 3) / (p.dt * p.dt) / p.Nz;
    return [this.exchange[0] * s, this.exchange[1] * s];
  };
  /** Total mass on the fluid nodes (lattice units). */
  P.mass = function () {
    var N = this.params.N, Nz = this.params.Nz, vol = this.vol, f = this.f, sn = this.solid, tot = 0.0;
    for (var k = 0; k < Nz; k++)
      for (var j = 0; j < N; j++)
        for (var i = 0; i < N; i++) {
          if (sn[j * N + i]) continue;
          var n = (k * N + j) * N + i;
          for (var q = 0; q < 19; q++) tot += f[q * vol + n];
        }
    return tot;
  };
  P.readMass = function () { return Promise.resolve(this.mass()); };
  P.destroy = function () { this.f = this.g = this._fpl = this._U = null; };
  P.precision = "f64";

  // ------------------------------------------------------------------ self-test against the numpy reference
  /** Derived outputs of a solver as in python/selftest_lbm.py: torque, E, mass, checksum and the sampled velocities. */
  async function outputs(s, ref) {
    var p = s.params, U = await s.readVelocity(), n = U.length, E = 0.0, ck = 0.0, i;
    for (i = 0; i < n; i++) { E += U[i] * U[i]; ck += Math.abs(U[i]) * (1 + i / n); }
    E = 0.5 * E * Math.pow(p.h, 3) / p.Lz;
    var Nz = p.Nz, N = p.N, got = [];
    for (i = 0; i < ref.samples.length; i++) {
      var sm = ref.samples[i];
      got.push(U[((sm[0] * Nz + sm[1]) * N + sm[2]) * N + sm[3]]);
    }
    return { torque: await s.readTorque(), E: E, mass: await s.readMass(), checksum: ck, samples: got };
  }

  /** Run every case of ref (python selftest_lbm.reference()['cases']) through solverFactory(params) and compare.
   *  opts.tol overrides the tolerance (default 1e-12 relative for f64 solvers, 2e-3 for f32). */
  async function selftest(solverFactory, ref, opts) {
    opts = opts || {};
    var rows = [];
    var cases = ref.cases || ref.lbm.cases;
    for (var c = 0; c < cases.length; c++) {
      var cs = cases[c], p = makeParams(cs.inp);
      var s = await solverFactory(p);
      await s.step(cs.steps);
      var out = await outputs(s, cs.outputs);
      var tol = opts.tol !== undefined ? opts.tol : (s.precision === "f32" ? 2e-3 : 1e-12);
      var tag = "lbm N=" + cs.inp.N + " Nz=" + cs.inp.Nz + " " + (cs.inp.span || "periodic") + " " +
                (cs.inp.collision || "reg") + " " + cs.steps + " steps";
      var add = function (name, expected, got, scale) {
        var ad = Math.abs(got - expected), rel = ad / Math.max(Math.abs(scale !== undefined ? scale : expected), 1e-300);
        rows.push({ name: tag + ": " + name, expected: expected, got: got, absdiff: ad, reldiff: rel, tol: tol,
                    pass: isFinite(rel) && rel <= tol });
      };
      var o = cs.outputs;
      add("torque", o.torque, out.torque);
      add("kinetic energy E", o.E, out.E);
      add("fluid mass", o.mass, out.mass);
      add("checksum", o.checksum, out.checksum);
      var worst = 0, wi = 0, vmax = 0, i;
      for (i = 0; i < o.samples.length; i++) vmax = Math.max(vmax, Math.abs(o.samples[i][4]));
      for (i = 0; i < o.samples.length; i++) {
        var d = Math.abs(out.samples[i] - o.samples[i][4]);
        if (d >= worst) { worst = d; wi = i; }
      }
      add("worst of " + o.samples.length + " sampled velocities (rel. to max |u|)", o.samples[wi][4], out.samples[wi], vmax);
      if (s.destroy) s.destroy();
    }
    return rows;
  }
  lbm.selftest = selftest;
  lbm.selftestOutputs = outputs;

  if (typeof module !== "undefined" && module.exports) module.exports = lbm;
})();
