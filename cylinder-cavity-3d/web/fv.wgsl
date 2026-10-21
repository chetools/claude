// 3D incompressible Navier-Stokes, finite volumes on a staggered (MAC) grid: WebGPU compute kernels.
// The same algorithm, step for step, as python/fv3d.py and web/fv_cpu.js (float32 here).
//
// Flat buffers, index order [k (z)][j (y)][i (x)].  The three face arrays share ONE buffer
// (so that a kernel needs few storage bindings):
//   u at 0                      (Nz, N, N+1)   u[(k*N + j)*(N+1) + i]
//   v at P.offv                 (Nz, N+1, N)   v[(k*(N+1) + j)*N + i]
//   w at P.offw                 (Nz+1, N, N)   w[(k*N + j)*N + i]
// q, rhs: cells (Nz, N, N).  Periodic z: w[Nz] is kept equal to w[0].
// One time step = momentum -> penalise -> divergence -> V-cycles -> project -> advance.

struct Params {
  n: i32, nz: i32, periodic: i32, offv: i32,
  offw: i32, nseed: i32, tanh_mask: i32, pad1: i32,
  h: f32, nu: f32, dt: f32, R: f32,
  ro: f32, Omega: f32, omega_o: f32, eps: f32,
  seed: f32, Lz: f32, Uref: f32, dphi: f32,
};
// written by the host: phi, phi0, local (words 2..4); everything else lives on the GPU
struct State { dt_prev: f32, nstep: u32, phi: f32, phi0: f32, local: u32, torque: f32, maxdiv: f32, pad: f32 };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> S: State;
@group(0) @binding(2) var<storage, read_write> F: array<f32>;      // u, v, w
@group(0) @binding(3) var<storage, read_write> FS: array<f32>;     // u*, v*, w* (predictor)
@group(0) @binding(4) var<storage, read_write> FR: array<f32>;     // previous right-hand sides
@group(0) @binding(5) var<storage, read_write> q: array<f32>;
@group(0) @binding(6) var<storage, read_write> rhs: array<f32>;
@group(0) @binding(7) var<storage, read_write> vel: array<f32>;    // cell-centred velocity [c][k][j][i]
@group(0) @binding(8) var<storage, read_write> partials: array<f32>;

// ------------------------------------------------------------ ghost values (pad_u, pad_v, pad_w)
// z index map for cell-type nodes (u, v): wrap, or odd mirror about the wall half a cell away.
fn zcell(k: i32) -> vec2<i32> {
  let nz = P.nz;
  if (P.periodic == 1) { return vec2<i32>(((k % nz) + nz) % nz, 1); }
  if (k < 0) { return vec2<i32>(-1 - k, -1); }
  if (k > nz - 1) { return vec2<i32>(2 * nz - 1 - k, -1); }
  return vec2<i32>(k, 1);
}
// z index map for w (nodes 0..nz): wrap (w[nz] = w[0]), or odd mirror about the wall ON the end node.
fn zface(k: i32) -> vec2<i32> {
  let nz = P.nz;
  if (P.periodic == 1) { return vec2<i32>(((k % nz) + nz) % nz, 1); }
  if (k < 0) { return vec2<i32>(-k, -1); }
  if (k > nz) { return vec2<i32>(2 * nz - k, -1); }
  return vec2<i32>(k, 1);
}
fn U(i0: i32, j0: i32, k0: i32) -> f32 {
  let n = P.n;
  var i = i0; var j = j0; var s = 1.0;
  if (i < 0) { i = -i; s = -s; }                   // u sits on the x-walls
  if (i > n) { i = 2 * n - i; s = -s; }
  if (j < 0) { j = -1 - j; s = -s; }               // y-walls half a cell away
  if (j > n - 1) { j = 2 * n - 1 - j; s = -s; }
  let z = zcell(k0);
  return s * f32(z.y) * F[(z.x * n + j) * (n + 1) + i];
}
fn V(i0: i32, j0: i32, k0: i32) -> f32 {
  let n = P.n;
  var i = i0; var j = j0; var s = 1.0;
  if (i < 0) { i = -1 - i; s = -s; }
  if (i > n - 1) { i = 2 * n - 1 - i; s = -s; }
  if (j < 0) { j = -j; s = -s; }
  if (j > n) { j = 2 * n - j; s = -s; }
  let z = zcell(k0);
  return s * f32(z.y) * F[P.offv + (z.x * (n + 1) + j) * n + i];
}
fn W(i0: i32, j0: i32, k0: i32) -> f32 {
  let n = P.n;
  var i = i0; var j = j0; var s = 1.0;
  if (i < 0) { i = -1 - i; s = -s; }
  if (i > n - 1) { i = 2 * n - 1 - i; s = -s; }
  if (j < 0) { j = -1 - j; s = -s; }
  if (j > n - 1) { j = 2 * n - 1 - j; s = -s; }
  let z = zface(k0);
  return s * f32(z.y) * F[P.offw + (z.x * n + j) * n + i];
}

// ------------------------------------------------------------ advection
fn minmod(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  return sign(a) * min(abs(a), abs(b));
}
// MUSCL face value between nodes a and b (am, bp: the next nodes outward)
fn face_value(am: f32, a: f32, b: f32, bp: f32, vel_: f32) -> f32 {
  if (vel_ >= 0.0) { return a + 0.5 * minmod(a - am, b - a); }
  return b + 0.5 * minmod(b - bp, a - b);
}

fn rhs_u(i: i32, j: i32, k: i32) -> f32 {
  let c = U(i, j, k);
  let ue = 0.5 * (c + U(i + 1, j, k));
  let uw = 0.5 * (U(i - 1, j, k) + c);
  let vn = 0.5 * (V(i - 1, j + 1, k) + V(i, j + 1, k));
  let vs_ = 0.5 * (V(i - 1, j, k) + V(i, j, k));
  let wt = 0.5 * (W(i - 1, j, k + 1) + W(i, j, k + 1));
  let wb = 0.5 * (W(i - 1, j, k) + W(i, j, k));
  let fe = ue * face_value(U(i - 1, j, k), c, U(i + 1, j, k), U(i + 2, j, k), ue);
  let fw = uw * face_value(U(i - 2, j, k), U(i - 1, j, k), c, U(i + 1, j, k), uw);
  let fn_ = vn * face_value(U(i, j - 1, k), c, U(i, j + 1, k), U(i, j + 2, k), vn);
  let fs = vs_ * face_value(U(i, j - 2, k), U(i, j - 1, k), c, U(i, j + 1, k), vs_);
  let ft = wt * face_value(U(i, j, k - 1), c, U(i, j, k + 1), U(i, j, k + 2), wt);
  let fb = wb * face_value(U(i, j, k - 2), U(i, j, k - 1), c, U(i, j, k + 1), wb);
  let lap = (U(i + 1, j, k) + U(i - 1, j, k) + U(i, j + 1, k) + U(i, j - 1, k) - 4.0 * c)
          + (U(i, j, k + 1) + U(i, j, k - 1) - 2.0 * c);
  return -((fe - fw + fn_ - fs) + (ft - fb)) / P.h + P.nu * lap / (P.h * P.h);
}
fn rhs_v(i: i32, j: i32, k: i32) -> f32 {
  let c = V(i, j, k);
  let ue = 0.5 * (U(i + 1, j - 1, k) + U(i + 1, j, k));
  let uw = 0.5 * (U(i, j - 1, k) + U(i, j, k));
  let vn = 0.5 * (c + V(i, j + 1, k));
  let vs_ = 0.5 * (V(i, j - 1, k) + c);
  let wt = 0.5 * (W(i, j - 1, k + 1) + W(i, j, k + 1));
  let wb = 0.5 * (W(i, j - 1, k) + W(i, j, k));
  let fe = ue * face_value(V(i - 1, j, k), c, V(i + 1, j, k), V(i + 2, j, k), ue);
  let fw = uw * face_value(V(i - 2, j, k), V(i - 1, j, k), c, V(i + 1, j, k), uw);
  let fn_ = vn * face_value(V(i, j - 1, k), c, V(i, j + 1, k), V(i, j + 2, k), vn);
  let fs = vs_ * face_value(V(i, j - 2, k), V(i, j - 1, k), c, V(i, j + 1, k), vs_);
  let ft = wt * face_value(V(i, j, k - 1), c, V(i, j, k + 1), V(i, j, k + 2), wt);
  let fb = wb * face_value(V(i, j, k - 2), V(i, j, k - 1), c, V(i, j, k + 1), wb);
  let lap = (V(i + 1, j, k) + V(i - 1, j, k) + V(i, j + 1, k) + V(i, j - 1, k) - 4.0 * c)
          + (V(i, j, k + 1) + V(i, j, k - 1) - 2.0 * c);
  return -((fe - fw + fn_ - fs) + (ft - fb)) / P.h + P.nu * lap / (P.h * P.h);
}
fn rhs_w(i: i32, j: i32, k: i32) -> f32 {
  let c = W(i, j, k);
  let ue = 0.5 * (U(i + 1, j, k - 1) + U(i + 1, j, k));
  let uw = 0.5 * (U(i, j, k - 1) + U(i, j, k));
  let vn = 0.5 * (V(i, j + 1, k - 1) + V(i, j + 1, k));
  let vs_ = 0.5 * (V(i, j, k - 1) + V(i, j, k));
  let wt = 0.5 * (c + W(i, j, k + 1));
  let wb = 0.5 * (W(i, j, k - 1) + c);
  let fe = ue * face_value(W(i - 1, j, k), c, W(i + 1, j, k), W(i + 2, j, k), ue);
  let fw = uw * face_value(W(i - 2, j, k), W(i - 1, j, k), c, W(i + 1, j, k), uw);
  let fn_ = vn * face_value(W(i, j - 1, k), c, W(i, j + 1, k), W(i, j + 2, k), vn);
  let fs = vs_ * face_value(W(i, j - 2, k), W(i, j - 1, k), c, W(i, j + 1, k), vs_);
  let ft = wt * face_value(W(i, j, k - 1), c, W(i, j, k + 1), W(i, j, k + 2), wt);
  let fb = wb * face_value(W(i, j, k - 2), W(i, j, k - 1), c, W(i, j, k + 1), wb);
  let lap = (W(i + 1, j, k) + W(i - 1, j, k) + W(i, j + 1, k) + W(i, j - 1, k) - 4.0 * c)
          + (W(i, j, k + 1) + W(i, j, k - 1) - 2.0 * c);
  return -((fe - fw + fn_ - fs) + (ft - fb)) / P.h + P.nu * lap / (P.h * P.h);
}

fn iu(i: i32, j: i32, k: i32) -> i32 { return (k * P.n + j) * (P.n + 1) + i; }
fn iv(i: i32, j: i32, k: i32) -> i32 { return P.offv + (k * (P.n + 1) + j) * P.n + i; }
fn iw(i: i32, j: i32, k: i32) -> i32 { return P.offw + (k * P.n + j) * P.n + i; }

// Adams-Bashforth 2 (forward Euler on the first step): u* = u + dt (a R + b R_prev).
// Threads cover i, j in 0..N and k in 0..Nz.
@compute @workgroup_size(8, 8, 4)
fn momentum(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = P.n; let nz = P.nz;
  var a = 1.0; var b = 0.0;
  if (S.dt_prev > 0.0) { let r = P.dt / S.dt_prev; a = 1.0 + 0.5 * r; b = -0.5 * r; }
  // wall faces keep their value (R = 0 there): copy everything first, then overwrite the interior
  if (k < nz && j < n && i <= n) {
    let m = iu(i, j, k);
    if (i >= 1 && i <= n - 1) {
      let R = rhs_u(i, j, k);
      FS[m] = F[m] + P.dt * (a * R + b * FR[m]);
      FR[m] = R;
    } else { FS[m] = F[m]; }
  }
  if (k < nz && i < n && j <= n) {
    let m = iv(i, j, k);
    if (j >= 1 && j <= n - 1) {
      let R = rhs_v(i, j, k);
      FS[m] = F[m] + P.dt * (a * R + b * FR[m]);
      FR[m] = R;
    } else { FS[m] = F[m]; }
  }
  if (i < n && j < n && k <= nz) {
    let m = iw(i, j, k);
    let wall = P.periodic == 0 && (k == 0 || k == nz);
    if (wall) { FS[m] = F[m]; }
    else {
      var kk = k;
      if (k == nz) { kk = 0; }                    // periodic: w[Nz] = w[0]
      let R = rhs_w(i, j, kk);
      FS[m] = F[m] + P.dt * (a * R + b * FR[m]);
      FR[m] = R;
    }
  }
}

// ------------------------------------------------------------ the body
fn centre(phi: f32) -> vec2<f32> { return vec2<f32>(0.5 + P.ro * cos(phi), 0.5 + P.ro * sin(phi)); }
// smoothed indicator chi and rigid-body velocity (orbit + spin) at x; the body does not depend on z
fn body(x: vec2<f32>, phi: f32) -> vec3<f32> {
  let c = centre(phi);
  let d = x - c;
  let r = length(d);
  var chi = clamp((P.R - r) / P.eps, 0.0, 1.0);          // linear ramp inside the circle (mask "ramp")
  if (P.tanh_mask == 1) {                                // legacy mask; clamp: f32 tanh may return NaN for large arguments
    chi = 0.5 * (1.0 - tanh(clamp((r - P.R) / P.eps, -20.0, 20.0)));
  }
  let ub = -P.omega_o * (c.y - 0.5) - P.Omega * d.y;
  let vb = P.omega_o * (c.x - 0.5) + P.Omega * d.x;
  return vec3<f32>(chi, ub, vb);
}

// u = u* + chi (u_body - u*) at the new time level (penalisation, eta -> 0); w_body = 0
@compute @workgroup_size(8, 8, 4)
fn penalise(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = P.n; let nz = P.nz; let h = P.h;
  let phi = S.phi + P.omega_o * P.dt;
  if (k < nz && j < n && i <= n) {
    let m = iu(i, j, k);
    if (i == 0 || i == n) { F[m] = 0.0; }
    else {
      let b = body(vec2<f32>(f32(i) * h, (f32(j) + 0.5) * h), phi);
      F[m] = FS[m] + b.x * (b.y - FS[m]);
    }
  }
  if (k < nz && i < n && j <= n) {
    let m = iv(i, j, k);
    if (j == 0 || j == n) { F[m] = 0.0; }
    else {
      let b = body(vec2<f32>((f32(i) + 0.5) * h, f32(j) * h), phi);
      F[m] = FS[m] + b.x * (b.z - FS[m]);
    }
  }
  if (i < n && j < n && k <= nz) {
    let m = iw(i, j, k);
    if (P.periodic == 0 && (k == 0 || k == nz)) { F[m] = 0.0; }
    else {
      let b = body(vec2<f32>((f32(i) + 0.5) * h, (f32(j) + 0.5) * h), phi);
      F[m] = FS[m] + b.x * (0.0 - FS[m]);
    }
  }
}

// ------------------------------------------------------------ projection
@compute @workgroup_size(8, 8, 4)
fn divergence(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = P.n;
  if (i >= n || j >= n || k >= P.nz) { return; }
  rhs[(k * n + j) * n + i] = ((F[iu(i + 1, j, k)] - F[iu(i, j, k)] + F[iv(i, j + 1, k)] - F[iv(i, j, k)])
                              + (F[iw(i, j, k + 1)] - F[iw(i, j, k)])) / P.h;
}

@compute @workgroup_size(8, 8, 4)
fn project(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = P.n; let nz = P.nz;
  if (k < nz && j < n && i >= 1 && i <= n - 1) {
    F[iu(i, j, k)] -= (q[(k * n + j) * n + i] - q[(k * n + j) * n + i - 1]) / P.h;
  }
  if (k < nz && i < n && j >= 1 && j <= n - 1) {
    F[iv(i, j, k)] -= (q[(k * n + j) * n + i] - q[(k * n + j - 1) * n + i]) / P.h;
  }
  if (i < n && j < n && k <= nz) {
    if (k >= 1 && k <= nz - 1) {
      F[iw(i, j, k)] -= (q[(k * n + j) * n + i] - q[((k - 1) * n + j) * n + i]) / P.h;
    } else if (P.periodic == 1) {              // the face z = 0 (and its copy z = Nz) lies between cell Nz-1 and cell 0
      F[iw(i, j, k)] -= (q[j * n + i] - q[((nz - 1) * n + j) * n + i]) / P.h;
    }
  }
}

// ------------------------------------------------------------ bookkeeping
@compute @workgroup_size(1)
fn advance() {
  S.dt_prev = P.dt;
  S.nstep += 1u;
  S.local += 1u;
  S.phi = S.phi0 + f32(S.local) * P.dphi;     // the host re-bases phi0 every few steps (f32 drift)
}

// cell-centred velocity, [c][k][j][i]
@compute @workgroup_size(8, 8, 4)
fn cell_velocity(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = P.n;
  if (i >= n || j >= n || k >= P.nz) { return; }
  let o = (k * n + j) * n + i; let nc = P.nz * n * n;
  vel[o] = 0.5 * (F[iu(i + 1, j, k)] + F[iu(i, j, k)]);
  vel[nc + o] = 0.5 * (F[iv(i, j + 1, k)] + F[iv(i, j, k)]);
  vel[2 * nc + o] = 0.5 * (F[iw(i, j, k + 1)] + F[iw(i, j, k)]);
}

// ------------------------------------------------------------ deliberate 3D seed
// curl(psi y-hat): u = -a F (W' S + W S') on the u faces, v = 0, w = a (dF/dx) W S on the w faces,
// psi = a F W S, F = sin^2(pi x) sin(pi y), a = seed Uref (see seed_velocity in fv3d.py).
// Returns (S, S', W, W') at height z.
fn seed_z(z: f32) -> vec4<f32> {
  let pi = 3.14159265358979;
  var S = 0.0; var dS = 0.0;
  for (var m = 1; m <= P.nseed; m++) {
    let k = 2.0 * pi * f32(m) / P.Lz;
    S += sin(k * z + f32(m)) / k;
    dS += cos(k * z + f32(m));
  }
  if (P.periodic == 0) {
    let s1 = sin(pi * z / P.Lz);
    return vec4<f32>(S, dS, s1 * s1, pi / P.Lz * sin(2.0 * pi * z / P.Lz));
  }
  return vec4<f32>(S, dS, 1.0, 0.0);
}
@compute @workgroup_size(8, 8, 4)
fn init_seed(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = P.n; let nz = P.nz;
  let pi = 3.14159265358979;
  let a = P.seed * P.Uref;
  if (k < nz && j < n && i <= n) {                       // u faces
    let m = iu(i, j, k);
    if (i == 0 || i == n) { F[m] = 0.0; }
    else {
      let z = seed_z((f32(k) + 0.5) * P.h);
      let sx = sin(pi * f32(i) * P.h);
      let Fxy = sx * sx * sin(pi * (f32(j) + 0.5) * P.h);
      F[m] = (-a * Fxy) * (z.w * z.x + z.z * z.y);
    }
  }
  if (i < n && j < n && k <= nz) {                       // w faces
    let m = iw(i, j, k);
    if (P.periodic == 0 && (k == 0 || k == nz)) { F[m] = 0.0; }
    else {
      var kk = k;
      if (k == nz) { kk = 0; }                           // periodic: w[Nz] = w[0]
      let z = seed_z(f32(kk) * P.h);
      let dFdx = pi * sin(2.0 * pi * (f32(i) + 0.5) * P.h) * sin(pi * (f32(j) + 0.5) * P.h);
      F[m] = (a * dFdx) * (z.z * z.x);
    }
  }
}

// ------------------------------------------------------------ diagnostics: torque and max |div|
// torque: -(sum over v faces (x - cx) fy  -  sum over u faces (y - cy) fx) h^2 / Nz,
// with f = chi (u_body - u*) / dt.  Each thread owns an (i, j) column; one partial per workgroup,
// reduced by stats_final.
var<workgroup> red: array<f32, 512>;
@compute @workgroup_size(16, 16)
fn stats(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_index) li: u32,
         @builtin(workgroup_id) wg: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n; let nz = P.nz; let h = P.h;
  var tq = 0.0; var md = 0.0;
  if (i <= n && j <= n) {
    let cb = centre(S.phi);
    for (var k = 0; k < nz; k++) {
      if (j >= 1 && j <= n - 1 && i < n) {             // v face
        let x = vec2<f32>((f32(i) + 0.5) * h, f32(j) * h);
        let b = body(x, S.phi);
        let m = iv(i, j, k);
        tq += (x.x - cb.x) * (b.x * (b.z - FS[m]) / P.dt);
      }
      if (i >= 1 && i <= n - 1 && j < n) {             // u face
        let x = vec2<f32>(f32(i) * h, (f32(j) + 0.5) * h);
        let b = body(x, S.phi);
        let m = iu(i, j, k);
        tq -= (x.y - cb.y) * (b.x * (b.y - FS[m]) / P.dt);
      }
      if (i < n && j < n) {
        let d = ((F[iu(i + 1, j, k)] - F[iu(i, j, k)] + F[iv(i, j + 1, k)] - F[iv(i, j, k)])
                 + (F[iw(i, j, k + 1)] - F[iw(i, j, k)])) / h;
        md = max(md, abs(d));
      }
    }
  }
  red[li] = tq; red[256u + li] = md;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) {
      red[li] += red[li + s];
      red[256u + li] = max(red[256u + li], red[256u + li + s]);
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let w = wg.y * nwg.x + wg.x;
    partials[2u * w] = red[0]; partials[2u * w + 1u] = red[256];
  }
}

// one workgroup sums the partials: S.torque (z-torque of the fluid on the body, per unit span), S.maxdiv
@compute @workgroup_size(256)
fn stats_final(@builtin(local_invocation_index) li: u32) {
  let np = u32(arrayLength(&partials) / 2u);
  var tq = 0.0; var md = 0.0;
  for (var w = li; w < np; w += 256u) { tq += partials[2u * w]; md = max(md, partials[2u * w + 1u]); }
  red[li] = tq; red[256u + li] = md;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) {
      red[li] += red[li + s];
      red[256u + li] = max(red[256u + li], red[256u + li + s]);
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    S.torque = -(red[0] * P.h * P.h / f32(P.nz));
    S.maxdiv = red[256];
  }
}

// ------------------------------------------------------------ multigrid
// Cell-centred, zero-flux walls:  (sum of existing neighbours - count * x) / h^2 = b.
// Semi-coarsening: z is coarsened together with x and y while nz >= 2 (nzc = nz/2, else 1).
struct Level { n: i32, nz: i32, nzc: i32, colour: i32, h2: f32, sweeps: i32, periodic: i32, pad: i32 };
@group(0) @binding(0) var<uniform> L: Level;
@group(0) @binding(1) var<storage, read_write> xf: array<f32>;
@group(0) @binding(2) var<storage, read_write> bf: array<f32>;
@group(0) @binding(3) var<storage, read_write> rf: array<f32>;
@group(0) @binding(4) var<storage, read_write> xc: array<f32>;
@group(0) @binding(5) var<storage, read_write> bc: array<f32>;

// (neighbour sum, neighbour count) of cell (i, j, k): same order of additions as fv3d.neighbour_sum
fn nsum(i: i32, j: i32, k: i32) -> vec2<f32> {
  let n = L.n; let nz = L.nz; let id = (k * n + j) * n + i; let nn = n * n;
  var s = 0.0; var c = 0.0;
  if (j > 0) { s += xf[id - n]; c += 1.0; }
  if (j < n - 1) { s += xf[id + n]; c += 1.0; }
  if (i > 0) { s += xf[id - 1]; c += 1.0; }
  if (i < n - 1) { s += xf[id + 1]; c += 1.0; }
  if (nz >= 2) {
    if (L.periodic == 1) {
      s += xf[((k + nz - 1) % nz) * nn + j * n + i] + xf[((k + 1) % nz) * nn + j * n + i]; c += 2.0;
    } else {
      if (k > 0) { s += xf[id - nn]; c += 1.0; }
      if (k < nz - 1) { s += xf[id + nn]; c += 1.0; }
    }
  }
  return vec2<f32>(s, c);
}

// One red-black colour for the whole (i, j) column, with z-independent colouring (colour = parity of
// i+j in every layer).  A cell and its z-neighbours share a colour, so they must all be updated from
// the OLD values (Jacobi in z, as numpy does): one thread owns the column and remembers the old
// value of the layer below (and of layer 0 for the periodic wrap).
fn smooth_column(i: i32, j: i32) {
  let n = L.n; let nz = L.nz; let nn = n * n; let col = j * n + i;
  let first_old = xf[col];
  var prev_old = 0.0;
  for (var k = 0; k < nz; k++) {
    let id = k * nn + col;
    let xo = xf[id];
    var s = 0.0; var c = 0.0;
    if (j > 0) { s += xf[id - n]; c += 1.0; }
    if (j < n - 1) { s += xf[id + n]; c += 1.0; }
    if (i > 0) { s += xf[id - 1]; c += 1.0; }
    if (i < n - 1) { s += xf[id + 1]; c += 1.0; }
    if (nz >= 2) {
      if (L.periodic == 1) {
        var zm = prev_old; if (k == 0) { zm = xf[(nz - 1) * nn + col]; }
        var zp = first_old; if (k < nz - 1) { zp = xf[id + nn]; }
        s += zm + zp; c += 2.0;
      } else {
        if (k > 0) { s += prev_old; c += 1.0; }
        if (k < nz - 1) { s += xf[id + nn]; c += 1.0; }
      }
    }
    xf[id] = (s - L.h2 * bf[id]) / c;
    prev_old = xo;
  }
}

@compute @workgroup_size(16, 16)
fn mg_smooth(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y);
  if (i >= L.n || j >= L.n || (i + j) % 2 != L.colour) { return; }
  smooth_column(i, j);
}

@compute @workgroup_size(8, 8, 4)
fn mg_residual(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = L.n;
  if (i >= n || j >= n || k >= L.nz) { return; }
  let s = nsum(i, j, k); let id = (k * n + j) * n + i;
  rf[id] = bf[id] - (s.x - s.y * xf[id]) / L.h2;
}

@compute @workgroup_size(8, 8, 4)
fn mg_restrict(@builtin(global_invocation_id) g: vec3<u32>) {  // over coarse cells
  let I = i32(g.x); let J = i32(g.y); let K = i32(g.z); let n = L.n; let nc = n / 2;
  if (I >= nc || J >= nc || K >= L.nzc) { return; }
  var v = 0.0;
  if (L.nz >= 2) {
    let o0 = (2 * K * n + 2 * J) * n + 2 * I; let o1 = o0 + n * n;
    let a = 0.25 * (rf[o0] + rf[o0 + n] + rf[o0 + 1] + rf[o0 + n + 1]);
    let b = 0.25 * (rf[o1] + rf[o1 + n] + rf[o1 + 1] + rf[o1 + n + 1]);
    v = 0.5 * (a + b);
  } else {
    let o = (K * n + 2 * J) * n + 2 * I;
    v = 0.25 * (rf[o] + rf[o + n] + rf[o + 1] + rf[o + n + 1]);
  }
  let m = (K * nc + J) * nc + I;
  bc[m] = v; xc[m] = 0.0;
}

fn plane(K: i32, i: i32, j: i32) -> f32 {      // 2D trilinear value of coarse layer K at fine (j, i)
  let nc = L.n / 2;
  let I = i / 2; let J = j / 2;
  let I2 = clamp(I + select(1, -1, i % 2 == 0), 0, nc - 1);
  let J2 = clamp(J + select(1, -1, j % 2 == 0), 0, nc - 1);
  let o = K * nc * nc;
  let a = 0.75 * xc[o + J * nc + I] + 0.25 * xc[o + J2 * nc + I];
  let c = 0.75 * xc[o + J * nc + I2] + 0.25 * xc[o + J2 * nc + I2];
  return 0.75 * a + 0.25 * c;
}

@compute @workgroup_size(8, 8, 4)
fn mg_prolong(@builtin(global_invocation_id) g: vec3<u32>) {   // over fine cells
  let i = i32(g.x); let j = i32(g.y); let k = i32(g.z); let n = L.n;
  if (i >= n || j >= n || k >= L.nz) { return; }
  var v = 0.0;
  if (L.nz == L.nzc) { v = plane(k, i, j); }
  else {
    let K = k / 2; let off = select(1, -1, k % 2 == 0);
    var K2 = clamp(K + off, 0, L.nzc - 1);
    if (L.periodic == 1) { K2 = (K + off + L.nzc) % L.nzc; }
    v = 0.75 * plane(K, i, j) + 0.25 * plane(K2, i, j);
  }
  xf[(k * n + j) * n + i] += v;
}

// coarsest grid (n = 4): one workgroup, one thread per (i, j) column, all sweeps, then the mean is removed
var<workgroup> msum: array<f32, 256>;
@compute @workgroup_size(256)
fn mg_coarse(@builtin(local_invocation_index) li: u32) {
  let n = L.n; let nz = L.nz; let col = i32(li);
  let ncol = n * n;
  let i = col % n; let j = col / n;
  for (var sweep = 0; sweep < L.sweeps; sweep++) {
    for (var colour = 0; colour < 2; colour++) {
      if (col < ncol && (i + j) % 2 == colour) { smooth_column(i, j); }
      storageBarrier();
      workgroupBarrier();
    }
  }
  var cs = 0.0;
  if (col < ncol) { for (var k = 0; k < nz; k++) { cs += xf[k * ncol + col]; } }
  msum[li] = cs;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) { msum[li] += msum[li + s]; }
    workgroupBarrier();
  }
  let mean = msum[0] / f32(ncol * nz);
  if (col < ncol) { for (var k = 0; k < nz; k++) { xf[k * ncol + col] -= mean; } }
}
