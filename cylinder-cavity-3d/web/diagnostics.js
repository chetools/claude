// ===================================================================== diagnostics.js
// CC3.diag: float64 JavaScript port of python/diagnostics.py, same names and normalisations.
//
// Layout (as everywhere on this page): velocity U is ONE flat array of length 3*Nz*N*N, index order
// [c][k][j][i]  (c = 0,1,2 for u,v,w; k = z, j = y, i = x), cell centres at (i+1/2) h.  Float32Array (GPU
// read-back) and Float64Array (CPU solver) are both accepted; every sum is done in float64.
// Python's U.shape = (3, Nz, N, N) becomes the explicit arguments (Nz, N); `p` below is a solver parameter
// object with the keys N, Nz, h, Lz, span.
//
// Fluid-only integrals: E, Z, Ew, E3d, Ekz and the spectrum are integrals over cells whose centre lies outside the
// cylinder (fluid_mask).  `fluid` is an optional Uint8Array(Nz*N*N) (1 = fluid) as returned by fluid_mask; null/undefined
// means the whole box.
//
// Derivatives: second-order central differences; at a no-slip wall the missing neighbour is the ghost value
// -u (odd mirror).  Periodic z wraps (for Nz = 1 every z-derivative is exactly zero).
(function () {
  'use strict';
  const CC3 = (globalThis.CC3 = globalThis.CC3 || {});

  // ------------------------------------------------------------------ FFT (radix-2, direct DFT otherwise)
  const twCache = new Map();
  function twiddles(n) {
    let t = twCache.get(n);
    if (!t) {
      const c = new Float64Array(n / 2), s = new Float64Array(n / 2);
      for (let k = 0; k < n / 2; k++) { c[k] = Math.cos(2 * Math.PI * k / n); s[k] = -Math.sin(2 * Math.PI * k / n); }
      t = { c, s }; twCache.set(n, t);
    }
    return t;
  }
  const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;

  // In-place forward DFT  X_m = sum_k x_k exp(-2 pi i m k / n)  of re/im (length n, typed arrays or subarrays).
  // Unscaled.  Radix-2 when n is a power of two, otherwise a direct O(n^2) sum (small n only).
  function fft(re, im, n) {
    if (n <= 1) return;
    if (!isPow2(n)) {
      const or = new Float64Array(n), oi = new Float64Array(n);
      for (let m = 0; m < n; m++) {
        let sr = 0, si = 0;
        for (let k = 0; k < n; k++) {
          const a = -2 * Math.PI * ((m * k) % n) / n, c = Math.cos(a), s = Math.sin(a);
          sr += re[k] * c - im[k] * s; si += re[k] * s + im[k] * c;
        }
        or[m] = sr; oi[m] = si;
      }
      for (let m = 0; m < n; m++) { re[m] = or[m]; im[m] = oi[m]; }
      return;
    }
    for (let i = 1, j = 0; i < n; i++) {                       // bit reversal
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const tw = twiddles(n);
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1, step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = tw.c[k * step], wi = tw.s[k * step];
          const a = i + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  // ------------------------------------------------------------------ gradient at one cell
  // g[3*a + b] = d u_a / d x_b  (b = 0,1,2 is x,y,z)
  function gradAt(U, Nz, N, V, zwall, k, j, i, g, h2) {
    const idx = (k * N + j) * N + i;
    for (let a = 0; a < 3; a++) {
      const o = a * V + idx, c = U[o];
      const xl = i > 0 ? U[o - 1] : -c, xh = i < N - 1 ? U[o + 1] : -c;
      const yl = j > 0 ? U[o - N] : -c, yh = j < N - 1 ? U[o + N] : -c;
      let zl, zh;
      if (k > 0) zl = U[o - N * N]; else zl = zwall ? -c : U[o + (Nz - 1) * N * N];
      if (k < Nz - 1) zh = U[o + N * N]; else zh = zwall ? -c : U[o - (Nz - 1) * N * N];
      g[3 * a] = (xh - xl) / h2; g[3 * a + 1] = (yh - yl) / h2; g[3 * a + 2] = (zh - zl) / h2;
    }
  }

  // omega = curl u, Float64Array 3*Nz*N*N
  function vorticity(U, Nz, N, h, span) {
    const V = Nz * N * N, out = new Float64Array(3 * V), g = new Float64Array(9), zw = span === 'walls', h2 = 2 * h;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      gradAt(U, Nz, N, V, zw, k, j, i, g, h2);
      const idx = (k * N + j) * N + i;
      out[idx] = g[7] - g[5];          // dw/dy - dv/dz
      out[V + idx] = g[2] - g[6];      // du/dz - dw/dx
      out[2 * V + idx] = g[3] - g[1];  // dv/dx - du/dy
    }
    return out;
  }

  // Q = 1/2 (|Omega|^2 - |S|^2), Float64Array Nz*N*N
  function q_criterion(U, Nz, N, h, span) {
    const V = Nz * N * N, out = new Float64Array(V), g = new Float64Array(9), zw = span === 'walls', h2 = 2 * h;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      gradAt(U, Nz, N, V, zw, k, j, i, g, h2);
      let S2 = 0, O2 = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const s = 0.5 * (g[3 * a + b] + g[3 * b + a]), o = 0.5 * (g[3 * a + b] - g[3 * b + a]);
        S2 += s * s; O2 += o * o;
      }
      out[(k * N + j) * N + i] = 0.5 * (O2 - S2);
    }
    return out;
  }

  // ------------------------------------------------------------------ fluid-only mask
  // Uint8Array (Nz*N*N), 1 for cells whose centre is outside the cylinder (r > R); same in every z-plane.
  // p needs N, Nz, R, ro; phi = body angle (centre (0.5 + ro cos phi, 0.5 + ro sin phi)).
  function fluid_mask(p, phi) {
    const N = p.N, Nz = p.Nz, cx = 0.5 + p.ro * Math.cos(phi), cy = 0.5 + p.ro * Math.sin(phi), R2 = p.R * p.R;
    const out = new Uint8Array(Nz * N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (i + 0.5) / N - cx, dy = (j + 0.5) / N - cy;
      if (dx * dx + dy * dy > R2) for (let k = 0; k < Nz; k++) out[(k * N + j) * N + i] = 1;
    }
    return out;
  }
  // U with body cells set to zero (U itself if fluid is null); Float64Array copy otherwise
  function fluidOnly(U, Nz, N, fluid) {
    if (!fluid) return U;
    const V = Nz * N * N, out = new Float64Array(3 * V);
    for (let c = 0; c < 3; c++) for (let n = 0; n < V; n++) out[c * V + n] = fluid[n] ? U[c * V + n] : 0;
    return out;
  }

  // ------------------------------------------------------------------ integral measures
  function energy(U, Nz, N, h, Lz, fluid) {                        // (1/Lz) int 1/2 |u|^2 dV over the fluid
    const V = Nz * N * N;
    let s = 0;
    for (let c = 0; c < 3; c++) for (let n = 0; n < V; n++) { if (fluid && !fluid[n]) continue; const u = U[c * V + n]; s += u * u; }
    return 0.5 * s * h * h * h / Lz;
  }

  // omega is computed from the full U, then only fluid cells are summed
  function enstrophy(U, Nz, N, h, Lz, span, fluid) {
    const V = Nz * N * N, g = new Float64Array(9), zw = span === 'walls', h2 = 2 * h;
    let s = 0;
    for (let k = 0; k < Nz; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (fluid && !fluid[(k * N + j) * N + i]) continue;
      gradAt(U, Nz, N, V, zw, k, j, i, g, h2);
      const a = g[7] - g[5], b = g[2] - g[6], c = g[3] - g[1];
      s += a * a + b * b + c * c;
    }
    return 0.5 * s * h * h * h / Lz;
  }

  // Ew, E3d and (periodic only) Ekz = energy per spanwise Fourier mode kz = 0..floor(Nz/2); Ekz = null for walls.
  // Same normalisation as python: c_m = DFT_z(U)/Nz, Ekz_m = h^2 sum_{c,j,i} 1/2 mult_m |c_m|^2, mult = 2 except the
  // zero mode and the Nyquist mode.  sum(Ekz) = energy(U) (Parseval).
  function spanwise_energy(U, Nz, N, h, Lz, span, fluid) {
    U = fluidOnly(U, Nz, N, fluid);
    const NN = N * N, V = Nz * NN, dV = h * h * h;
    let sw = 0;
    for (let n = 2 * V; n < 3 * V; n++) sw += U[n] * U[n];
    const Ew = 0.5 * sw * dV / Lz;
    const periodic = span === 'periodic', M = (Nz >> 1) + 1;
    let s3 = 0;
    const acc = periodic ? new Float64Array(M) : null;
    const re = new Float64Array(Nz), im = new Float64Array(Nz);
    for (let c = 0; c < 3; c++) for (let ji = 0; ji < NN; ji++) {
      const base = c * V + ji;
      let mean = 0;
      for (let k = 0; k < Nz; k++) mean += U[base + k * NN];
      mean /= Nz;
      for (let k = 0; k < Nz; k++) { const d = U[base + k * NN] - mean; s3 += d * d; }
      if (periodic) {
        for (let k = 0; k < Nz; k++) { re[k] = U[base + k * NN]; im[k] = 0; }
        fft(re, im, Nz);
        for (let m = 0; m < M; m++) acc[m] += re[m] * re[m] + im[m] * im[m];
      }
    }
    const E3d = 0.5 * s3 * dV / Lz;
    let Ekz = null;
    if (periodic) {
      Ekz = new Float64Array(M);
      for (let m = 0; m < M; m++) {
        let mult = m === 0 ? 1 : 2;
        if (Nz % 2 === 0 && m === M - 1) mult = 1;                // Nyquist mode has no partner
        Ekz[m] = 0.5 * mult * (acc[m] / (Nz * Nz)) * h * h;
      }
    }
    return { Ew, E3d, Ekz };
  }

  // Horizontal spectrum, "windowed shape, rescaled to the true energy": per z-plane, body cells set to zero (if fluid),
  // Hann window sin^2(pi x) sin^2(pi y), 2D FFT, shells round(|k|); each plane's spectrum is multiplied by one number so
  // that it sums to the plane's true fluid energy; planes averaged.  Then sum(E_k) = energy(U, ..., fluid) exactly.
  // Returns [k, E_k] (k = 0,1,2,...).  opts.maxPlanes (default: all) uses that many evenly spaced planes (cost saver for
  // big 3D grids; the sum is then the energy of those planes).
  function spectrum_h(U, Nz, N, h, fluid, opts) {
    const maxPlanes = opts && opts.maxPlanes ? opts.maxPlanes : Infinity;
    const NN = N * N, V = Nz * NN;
    const W = new Float64Array(N);
    for (let i = 0; i < N; i++) { const x = (i + 0.5) / N; W[i] = Math.sin(Math.PI * x) ** 2; }
    const nP = Math.min(Nz, maxPlanes);
    const re = new Float64Array(NN), im = new Float64Array(NN), cr = new Float64Array(N), ci = new Float64Array(N);
    const e = new Float64Array(NN);
    const kk = (idx) => (idx <= ((N - 1) >> 1) ? idx : idx - N);
    const shell = new Int32Array(NN);
    let kmax = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const sh = Math.round(Math.hypot(kk(j), kk(i)));
      shell[j * N + i] = sh; if (sh > kmax) kmax = sh;
    }
    const Ek = new Float64Array(kmax + 1), ek = new Float64Array(kmax + 1), kvec = new Float64Array(kmax + 1);
    for (let n = 0; n <= kmax; n++) kvec[n] = n;
    const n4 = Math.pow(N, 4);
    for (let pl = 0; pl < nP; pl++) {
      const k = Math.floor(pl * Nz / nP);
      e.fill(0);
      let truth = 0;
      for (let c = 0; c < 3; c++) {
        const base = c * V + k * NN;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const n = j * N + i, u = (fluid && !fluid[k * NN + n]) ? 0 : U[base + n];
          truth += u * u;
          re[n] = u * W[j] * W[i]; im[n] = 0;
        }
        for (let j = 0; j < N; j++) fft(re.subarray(j * N, (j + 1) * N), im.subarray(j * N, (j + 1) * N), N);
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) { cr[j] = re[j * N + i]; ci[j] = im[j * N + i]; }
          fft(cr, ci, N);
          for (let j = 0; j < N; j++) e[j * N + i] += 0.5 * (cr[j] * cr[j] + ci[j] * ci[j]) / n4;
        }
      }
      truth *= 0.5 * h * h;
      ek.fill(0);
      for (let n = 0; n < NN; n++) ek[shell[n]] += e[n];
      let tot = 0;
      for (let n = 0; n <= kmax; n++) tot += ek[n];
      const f = tot > 0 ? truth / tot : 1;                      // a plane with no windowed energy keeps a zero spectrum
      for (let n = 0; n <= kmax; n++) Ek[n] += ek[n] * f / nP;
    }
    return [kvec, Ek];
  }

  // dict(E, Z, Ew, E3d, torque, maxdiv, maxspeed) + Ekz (JS extra, so the app does not repeat the spanwise DFT).
  // E, Z, Ew, E3d, Ekz are fluid-only when p has R: the mask comes from fluid_mask(p, phi), phi = s.phi if present, else
  // p.omega_o * s.t.  torque / maxdiv are copied from s when numbers, else NaN.  maxspeed is over the whole box.
  function summary(U, s, p) {
    const { N, Nz, h, Lz, span } = p;
    let fluid = null;
    if (p.R !== undefined) fluid = fluid_mask(p, s && s.phi !== undefined ? s.phi : p.omega_o * s.t);
    const sp = spanwise_energy(U, Nz, N, h, Lz, span, fluid);
    let ms = 0;
    const V = Nz * N * N;
    for (let n = 0; n < V; n++) { const q = U[n] * U[n] + U[V + n] * U[V + n] + U[2 * V + n] * U[2 * V + n]; if (q > ms) ms = q; }
    const num = (x) => (typeof x === 'number' ? x : NaN);
    return { E: energy(U, Nz, N, h, Lz, fluid), Z: enstrophy(U, Nz, N, h, Lz, span, fluid), Ew: sp.Ew, E3d: sp.E3d,
      torque: num(s && s.torque), maxdiv: num(s && s.maxdiv), maxspeed: Math.sqrt(ms), Ekz: sp.Ekz };
  }

  CC3.diag = { fft, fluid_mask, vorticity, q_criterion, energy, enstrophy, spanwise_energy, spectrum_h, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = CC3.diag;
})();
