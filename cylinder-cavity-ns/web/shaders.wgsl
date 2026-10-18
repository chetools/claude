// 2D incompressible Navier-Stokes, finite volumes on a staggered (MAC) grid.
// WebGPU compute kernels; the same algorithm, line for line, as python/ns2d.py.
//
// Layout of the flat buffers (row-major, row j = y index, column i = x index):
//   u   N rows x (N+1) columns   u[j*(N+1) + i]   x-velocity on vertical faces
//   v   (N+1) rows x N columns   v[j*N + i]       y-velocity on horizontal faces
//   q, rhs, dye, scalar          N x N cell centres
// One time step = momentum -> penalise -> divergence -> multigrid V-cycles
//                 -> project -> dye -> probe -> advance (one dispatch each).

struct Params {
  n: i32, probe_every: u32, probe_i: i32, probe_j: i32,
  h: f32, nu: f32, dt: f32, R: f32,
  ro: f32, Omega: f32, omega_o: f32, eps: f32,
  field: u32, crange: f32, view_w: f32, view_h: f32,
};
struct State { t: f32, phi: f32, spin: f32, dt_prev: f32, nstep: u32, p0: u32, p1: u32, p2: u32 };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> S: State;
@group(0) @binding(2) var<storage, read_write> u: array<f32>;
@group(0) @binding(3) var<storage, read_write> v: array<f32>;
@group(0) @binding(4) var<storage, read_write> us: array<f32>;
@group(0) @binding(5) var<storage, read_write> vs: array<f32>;
@group(0) @binding(6) var<storage, read_write> ru: array<f32>;
@group(0) @binding(7) var<storage, read_write> rv: array<f32>;
@group(0) @binding(8) var<storage, read_write> q: array<f32>;
@group(0) @binding(9) var<storage, read_write> rhs: array<f32>;
@group(0) @binding(10) var<storage, read_write> dye: array<f32>;
@group(0) @binding(11) var<storage, read_write> dye_out: array<f32>;
@group(0) @binding(12) var<storage, read_write> scalar: array<f32>;
@group(0) @binding(13) var<storage, read_write> partials: array<f32>;
@group(0) @binding(14) var<storage, read_write> probe: array<f32>;

// ------------------------------------------------------------ ghost values
// No-slip walls: every wall is an odd mirror (see pad_u / pad_v in ns2d.py).
fn U(i0: i32, j0: i32) -> f32 {
  let n = P.n;
  var i = i0; var j = j0; var s = 1.0;
  if (i < 0) { i = -i; s = -s; }               // u sits on the x-walls: u[-k] = -u[k]
  if (i > n) { i = 2 * n - i; s = -s; }
  if (j < 0) { j = -1 - j; s = -s; }           // y-walls half a cell away: u[-1-k] = -u[k]
  if (j > n - 1) { j = 2 * n - 1 - j; s = -s; }
  return s * u[j * (n + 1) + i];
}
fn V(i0: i32, j0: i32) -> f32 {
  let n = P.n;
  var i = i0; var j = j0; var s = 1.0;
  if (i < 0) { i = -1 - i; s = -s; }
  if (i > n - 1) { i = 2 * n - 1 - i; s = -s; }
  if (j < 0) { j = -j; s = -s; }
  if (j > n) { j = 2 * n - j; s = -s; }
  return s * v[j * n + i];
}
fn D(i0: i32, j0: i32) -> f32 {                // dye: zero-gradient walls
  let n = P.n;
  var i = i0; var j = j0;
  if (i < 0) { i = -1 - i; }
  if (i > n - 1) { i = 2 * n - 1 - i; }
  if (j < 0) { j = -1 - j; }
  if (j > n - 1) { j = 2 * n - 1 - j; }
  return dye[j * n + i];
}

// ------------------------------------------------------------ advection
fn minmod(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  return sign(a) * min(abs(a), abs(b));
}
// MUSCL face value between nodes a and b (am, bp: the next nodes outward)
fn face_value(am: f32, a: f32, b: f32, bp: f32, vel: f32) -> f32 {
  if (vel >= 0.0) { return a + 0.5 * minmod(a - am, b - a); }
  return b + 0.5 * minmod(b - bp, a - b);
}

fn rhs_u(i: i32, j: i32) -> f32 {
  let c = U(i, j);
  let ue = 0.5 * (c + U(i + 1, j));
  let uw = 0.5 * (U(i - 1, j) + c);
  let vn = 0.5 * (V(i - 1, j + 1) + V(i, j + 1));
  let vs_ = 0.5 * (V(i - 1, j) + V(i, j));
  let fe = ue * face_value(U(i - 1, j), c, U(i + 1, j), U(i + 2, j), ue);
  let fw = uw * face_value(U(i - 2, j), U(i - 1, j), c, U(i + 1, j), uw);
  let fn_ = vn * face_value(U(i, j - 1), c, U(i, j + 1), U(i, j + 2), vn);
  let fs = vs_ * face_value(U(i, j - 2), U(i, j - 1), c, U(i, j + 1), vs_);
  let lap = U(i + 1, j) + U(i - 1, j) + U(i, j + 1) + U(i, j - 1) - 4.0 * c;
  return -(fe - fw + fn_ - fs) / P.h + P.nu * lap / (P.h * P.h);
}
fn rhs_v(i: i32, j: i32) -> f32 {
  let c = V(i, j);
  let ue = 0.5 * (U(i + 1, j - 1) + U(i + 1, j));
  let uw = 0.5 * (U(i, j - 1) + U(i, j));
  let vn = 0.5 * (c + V(i, j + 1));
  let vs_ = 0.5 * (V(i, j - 1) + c);
  let fe = ue * face_value(V(i - 1, j), c, V(i + 1, j), V(i + 2, j), ue);
  let fw = uw * face_value(V(i - 2, j), V(i - 1, j), c, V(i + 1, j), uw);
  let fn_ = vn * face_value(V(i, j - 1), c, V(i, j + 1), V(i, j + 2), vn);
  let fs = vs_ * face_value(V(i, j - 2), V(i, j - 1), c, V(i, j + 1), vs_);
  let lap = V(i + 1, j) + V(i - 1, j) + V(i, j + 1) + V(i, j - 1) - 4.0 * c;
  return -(fe - fw + fn_ - fs) / P.h + P.nu * lap / (P.h * P.h);
}

// Adams-Bashforth 2 (forward Euler on the first step): u* = u + dt (a R + b R_prev)
@compute @workgroup_size(16, 16)
fn momentum(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n;
  var a = 1.0; var b = 0.0;
  if (S.dt_prev > 0.0) { let r = P.dt / S.dt_prev; a = 1.0 + 0.5 * r; b = -0.5 * r; }
  if (j < n && i >= 1 && i <= n - 1) {
    let k = j * (n + 1) + i;
    let R = rhs_u(i, j);
    us[k] = u[k] + P.dt * (a * R + b * ru[k]);
    ru[k] = R;
  }
  if (i < n && j >= 1 && j <= n - 1) {
    let k = j * n + i;
    let R = rhs_v(i, j);
    vs[k] = v[k] + P.dt * (a * R + b * rv[k]);
    rv[k] = R;
  }
}

// ------------------------------------------------------------ the body
fn centre(phi: f32) -> vec2<f32> { return vec2<f32>(0.5 + P.ro * cos(phi), 0.5 + P.ro * sin(phi)); }
// smoothed indicator chi and rigid-body velocity (orbit + spin) at point x
fn body(x: vec2<f32>, phi: f32) -> vec3<f32> {
  let c = centre(phi);
  let d = x - c;
  // clamp: some f32 tanh implementations return NaN for large arguments (exp overflow)
  let chi = 0.5 * (1.0 - tanh(clamp((length(d) - P.R) / P.eps, -20.0, 20.0)));
  let ub = -P.omega_o * (c.y - 0.5) - P.Omega * d.y;
  let vb = P.omega_o * (c.x - 0.5) + P.Omega * d.x;
  return vec3<f32>(chi, ub, vb);
}

// u = u* + chi (u_body - u*)  at the new time level (penalisation, eta -> 0)
@compute @workgroup_size(16, 16)
fn penalise(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n; let h = P.h;
  let phi = S.phi + P.omega_o * P.dt;
  if (j < n && i >= 1 && i <= n - 1) {
    let k = j * (n + 1) + i;
    let b = body(vec2<f32>(f32(i) * h, (f32(j) + 0.5) * h), phi);
    u[k] = us[k] + b.x * (b.y - us[k]);
  }
  if (i < n && j >= 1 && j <= n - 1) {
    let k = j * n + i;
    let b = body(vec2<f32>((f32(i) + 0.5) * h, f32(j) * h), phi);
    v[k] = vs[k] + b.x * (b.z - vs[k]);
  }
}

// ------------------------------------------------------------ projection
@compute @workgroup_size(16, 16)
fn divergence(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n;
  if (i >= n || j >= n) { return; }
  let k = j * (n + 1) + i;
  rhs[j * n + i] = (u[k + 1] - u[k] + v[(j + 1) * n + i] - v[j * n + i]) / P.h;
}

@compute @workgroup_size(16, 16)
fn project(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n;
  if (j < n && i >= 1 && i <= n - 1) {
    u[j * (n + 1) + i] -= (q[j * n + i] - q[j * n + i - 1]) / P.h;
  }
  if (i < n && j >= 1 && j <= n - 1) {
    v[j * n + i] -= (q[j * n + i] - q[(j - 1) * n + i]) / P.h;
  }
}

// ------------------------------------------------------------ passive dye
fn dye_flux_x(i: i32, j: i32) -> f32 {        // face i, between cells i-1 and i
  let w = u[j * (P.n + 1) + i];
  return w * face_value(D(i - 2, j), D(i - 1, j), D(i, j), D(i + 1, j), w);
}
fn dye_flux_y(i: i32, j: i32) -> f32 {
  let w = v[j * P.n + i];
  return w * face_value(D(i, j - 2), D(i, j - 1), D(i, j), D(i, j + 1), w);
}
@compute @workgroup_size(16, 16)
fn advect_dye(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n;
  if (i >= n || j >= n) { return; }
  let div = dye_flux_x(i + 1, j) - dye_flux_x(i, j) + dye_flux_y(i, j + 1) - dye_flux_y(i, j);
  dye_out[j * n + i] = dye[j * n + i] - P.dt / P.h * div;
}

// ------------------------------------------------------------ bookkeeping
@compute @workgroup_size(1)
fn record_probe() {
  if (S.nstep % P.probe_every != 0u) { return; }
  let n = P.n; let i = P.probe_i; let j = P.probe_j;
  let slot = (S.nstep / P.probe_every) % 4096u;
  probe[2u * slot] = 0.5 * (u[j * (n + 1) + i] + u[j * (n + 1) + i + 1]);
  probe[2u * slot + 1u] = 0.5 * (v[j * n + i] + v[(j + 1) * n + i]);
}

@compute @workgroup_size(1)
fn advance() {
  S.t += P.dt;
  S.phi += P.omega_o * P.dt;
  S.spin += P.Omega * P.dt;
  S.dt_prev = P.dt;
  S.nstep += 1u;
}

// ------------------------------------------------------------ diagnostics
fn corner_vort(i: i32, j: i32) -> f32 {       // dv/dx - du/dy at corner (i h, j h)
  return (V(i, j) - V(i - 1, j) - U(i, j) + U(i, j - 1)) / P.h;
}
fn cell_vort(i: i32, j: i32) -> f32 {
  return 0.25 * (corner_vort(i, j) + corner_vort(i + 1, j) + corner_vort(i, j + 1) + corner_vort(i + 1, j + 1));
}
fn cell_vel(i: i32, j: i32) -> vec2<f32> {
  let n = P.n;
  return vec2<f32>(0.5 * (u[j * (n + 1) + i] + u[j * (n + 1) + i + 1]),
                   0.5 * (v[j * n + i] + v[(j + 1) * n + i]));
}

// scalar field for display: 0 vorticity, 1 speed, 2 pressure, 3 dye
@compute @workgroup_size(16, 16)
fn field(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n;
  if (i >= n || j >= n) { return; }
  var s = 0.0;
  switch P.field {
    case 0u: { s = cell_vort(i, j); }
    case 1u: { s = length(cell_vel(i, j)); }
    case 2u: { s = q[j * n + i] / P.dt; }
    default: { s = dye[j * n + i]; }
  }
  scalar[j * n + i] = s;
}

// per-workgroup partial sums (E, Z, torque) and maxima (|div|, speed, |omega|, |p|)
var<workgroup> red: array<f32, 2048>;
@compute @workgroup_size(16, 16)
fn stats(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_index) li: u32,
         @builtin(workgroup_id) wg: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n; let h = P.h;
  var a = array<f32, 8>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  if (i < n && j < n) {
    let c = cell_vel(i, j);
    let w = cell_vort(i, j);
    a[0] = 0.5 * dot(c, c) * h * h;
    a[1] = 0.5 * w * w * h * h;
    let cb = centre(S.phi);
    var tq = 0.0;
    if (i >= 1) {
      let x = vec2<f32>(f32(i) * h, (f32(j) + 0.5) * h);
      let b = body(x, S.phi);
      let k = j * (n + 1) + i;
      tq -= (x.y - cb.y) * b.x * (b.y - us[k]) / P.dt;
    }
    if (j >= 1) {
      let x = vec2<f32>((f32(i) + 0.5) * h, f32(j) * h);
      let b = body(x, S.phi);
      let k = j * n + i;
      tq += (x.x - cb.x) * b.x * (b.z - vs[k]) / P.dt;
    }
    a[2] = -tq * h * h;
    let k = j * (n + 1) + i;
    a[3] = abs(u[k + 1] - u[k] + v[(j + 1) * n + i] - v[j * n + i]) / h;
    a[4] = length(c);
    a[5] = abs(w);
    a[6] = abs(q[j * n + i]) / P.dt;
  }
  for (var m = 0u; m < 8u; m++) { red[m * 256u + li] = a[m]; }
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) {
      for (var m = 0u; m < 3u; m++) { red[m * 256u + li] += red[m * 256u + li + s]; }
      for (var m = 3u; m < 8u; m++) { red[m * 256u + li] = max(red[m * 256u + li], red[m * 256u + li + s]); }
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let w = wg.y * nwg.x + wg.x;
    for (var m = 0u; m < 8u; m++) { partials[8u * w + m] = red[m * 256u]; }
  }
}

// ------------------------------------------------------------ tracer particles
// pos[k] = (x, y, x_prev, y_prev); life[k] = (age, lifetime).  Advected once per
// frame over the simulated time that frame covered (F.tau), in F.substeps RK2 steps.
struct Frame { tau: f32, substeps: u32, seed: u32, count: u32 };
@group(0) @binding(15) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(16) var<storage, read_write> life: array<vec2<f32>>;
@group(0) @binding(17) var<uniform> F: Frame;

// bilinear interpolation of each MAC component (ns2d.interp_velocity)
fn vel_at(p0: vec2<f32>) -> vec2<f32> {
  let n = f32(P.n);
  let p = clamp(p0, vec2<f32>(0.0), vec2<f32>(1.0));
  let fu = vec2<f32>(p.x * n, p.y * n - 0.5);             // u nodes at (i h, (j+1/2) h)
  let iu = clamp(floor(fu), vec2<f32>(-1.0), vec2<f32>(n - 1.0));
  let tu = fu - iu;
  let i = i32(iu.x); let j = i32(iu.y);
  let ua = mix(U(i, j), U(i + 1, j), tu.x);
  let ub = mix(U(i, j + 1), U(i + 1, j + 1), tu.x);
  let fv = vec2<f32>(p.x * n - 0.5, p.y * n);             // v nodes at ((i+1/2) h, j h)
  let iv = clamp(floor(fv), vec2<f32>(-1.0), vec2<f32>(n - 1.0));
  let tv = fv - iv;
  let a = i32(iv.x); let b = i32(iv.y);
  let va = mix(V(a, b), V(a + 1, b), tv.x);
  let vb = mix(V(a, b + 1), V(a + 1, b + 1), tv.x);
  return vec2<f32>(mix(ua, ub, tu.y), mix(va, vb, tv.y));
}

fn hash(x0: u32) -> u32 {                     // PCG-style integer hash
  var x = x0 * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return (x >> 22u) ^ x;
}
fn rand(k: u32, salt: u32) -> f32 { return f32(hash(k * 7919u + salt + F.seed * 104729u) & 0xffffffu) / 16777216.0; }

@compute @workgroup_size(256)
fn advect_particles(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= F.count) { return; }
  var p = pos[k].xy;
  var a = life[k];
  let dt = F.tau / f32(F.substeps);
  for (var s = 0u; s < F.substeps; s++) {
    let k1 = vel_at(p);
    p = p + dt * vel_at(p + 0.5 * dt * k1);
  }
  a.x += F.tau;
  let inside = body(p, S.phi).x > 0.5;
  let outside = any(p < vec2<f32>(0.0)) || any(p > vec2<f32>(1.0));
  if (a.x >= a.y || inside || outside) {      // respawn somewhere random, no streak
    let q = vec2<f32>(rand(k, 1u), rand(k, 2u));
    pos[k] = vec4<f32>(q, q);
    life[k] = vec2<f32>(0.0, 2.0 + 2.0 * rand(k, 3u));
    return;
  }
  pos[k] = vec4<f32>(p, pos[k].xy);
  life[k] = a;
}

// self-test helper: velocity at the points pos[k].xy -> life[k]
@compute @workgroup_size(256)
fn sample_velocity(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= F.count) { return; }
  life[g.x] = vel_at(pos[g.x].xy);
}

// ------------------------------------------------------------ multigrid
// Cell-centred, zero-flux walls:  (sum of existing neighbours - count * x) / h^2 = b
struct Level { n: i32, colour: i32, h2: f32, sweeps: i32 };
@group(1) @binding(0) var<uniform> L: Level;
@group(1) @binding(1) var<storage, read_write> xf: array<f32>;
@group(1) @binding(2) var<storage, read_write> bf: array<f32>;
@group(1) @binding(3) var<storage, read_write> rf: array<f32>;
@group(1) @binding(4) var<storage, read_write> xc: array<f32>;
@group(1) @binding(5) var<storage, read_write> bc: array<f32>;

fn nsum(i: i32, j: i32, n: i32) -> vec2<f32> {   // (neighbour sum, neighbour count)
  var s = 0.0; var c = 0.0;
  if (i > 0) { s += xf[j * n + i - 1]; c += 1.0; }
  if (i < n - 1) { s += xf[j * n + i + 1]; c += 1.0; }
  if (j > 0) { s += xf[(j - 1) * n + i]; c += 1.0; }
  if (j < n - 1) { s += xf[(j + 1) * n + i]; c += 1.0; }
  return vec2<f32>(s, c);
}

@compute @workgroup_size(16, 16)
fn mg_smooth(@builtin(global_invocation_id) g: vec3<u32>) {   // one colour of red-black Gauss-Seidel
  let i = i32(g.x); let j = i32(g.y); let n = L.n;
  if (i >= n || j >= n || (i + j) % 2 != L.colour) { return; }
  let s = nsum(i, j, n);
  xf[j * n + i] = (s.x - L.h2 * bf[j * n + i]) / s.y;
}

@compute @workgroup_size(16, 16)
fn mg_residual(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = L.n;
  if (i >= n || j >= n) { return; }
  let s = nsum(i, j, n);
  rf[j * n + i] = bf[j * n + i] - (s.x - s.y * xf[j * n + i]) / L.h2;
}

@compute @workgroup_size(16, 16)
fn mg_restrict(@builtin(global_invocation_id) g: vec3<u32>) {  // over coarse cells
  let I = i32(g.x); let J = i32(g.y); let n = L.n; let nc = n / 2;
  if (I >= nc || J >= nc) { return; }
  let k = 2 * J * n + 2 * I;
  bc[J * nc + I] = 0.25 * (rf[k] + rf[k + 1] + rf[k + n] + rf[k + n + 1]);
  xc[J * nc + I] = 0.0;
}

@compute @workgroup_size(16, 16)
fn mg_prolong(@builtin(global_invocation_id) g: vec3<u32>) {   // bilinear, over fine cells
  let i = i32(g.x); let j = i32(g.y); let n = L.n; let nc = n / 2;
  if (i >= n || j >= n) { return; }
  let I = i / 2; let J = j / 2;
  let I2 = clamp(I + select(1, -1, i % 2 == 0), 0, nc - 1);
  let J2 = clamp(J + select(1, -1, j % 2 == 0), 0, nc - 1);
  let a = 0.75 * xc[J * nc + I] + 0.25 * xc[J2 * nc + I];
  let c = 0.75 * xc[J * nc + I2] + 0.25 * xc[J2 * nc + I2];
  xf[j * n + i] += 0.75 * a + 0.25 * c;
}

// coarsest grid (n <= 8): one workgroup does all the sweeps, then removes the mean
var<workgroup> msum: array<f32, 64>;
@compute @workgroup_size(64)
fn mg_coarse(@builtin(local_invocation_index) li: u32) {
  let n = L.n; let k = i32(li);
  let i = k % n; let j = k / n;
  let inside = k < n * n;
  for (var sweep = 0; sweep < L.sweeps; sweep++) {
    for (var colour = 0; colour < 2; colour++) {
      if (inside && (i + j) % 2 == colour) {
        let s = nsum(i, j, n);
        xf[k] = (s.x - L.h2 * bf[k]) / s.y;
      }
      workgroupBarrier();
      storageBarrier();
    }
  }
  msum[li] = select(0.0, xf[min(k, n * n - 1)], inside);
  workgroupBarrier();
  for (var s = 32u; s > 0u; s >>= 1u) {
    if (li < s) { msum[li] += msum[li + s]; }
    workgroupBarrier();
  }
  let mean = msum[0] / f32(n * n);
  if (inside) { xf[k] -= mean; }
}
