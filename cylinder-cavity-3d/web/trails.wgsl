// trails.wgsl: flow particles (massless tracers) and their trails.  Port of web/tracers.js (the f64 reference).
// cs_advect moves every particle over the simulated time tau (RK2 midpoint, `sub` substeps, the velocity frozen
// at its current value), re-seeds it at random when it has aged, left the box or entered the cylinder, and writes
// its new position into the trail ring.  vs_trail / fs_trail draw the last K-1 moves of every particle as lines.
// Velocity layout [c][k][j][i] (f32, cell-centred: x = (i+1/2) h ...); box x,y in [0,1], z in [0,Lz].

struct TP {
  n: i32, nz: i32, periodic: u32, np: u32,
  h: f32, lz: f32, R: f32, ro: f32,
  phi: f32, tau: f32, sub: u32, slot: u32,     // slot: ring index written by this call
  kcap: u32, frame: u32, pad0: u32, pad1: u32,
};
@group(0) @binding(0) var<uniform> T: TP;
@group(0) @binding(1) var<storage, read> V: array<f32>;
@group(0) @binding(2) var<storage, read_write> PS: array<vec4<f32>>;   // [2p] x y z age, [2p+1] life 0 0 0
@group(0) @binding(3) var<storage, read_write> TR: array<vec4<f32>>;   // [p*kcap+slot] x y z speed (-1: a path starts here, -2: empty)

// velocity component c at cell (i,j,k); one index may lie one cell outside the grid, where the no-slip
// odd-mirror ghost -(edge value) is used (periodic z wraps).  Same rule as render.wgsl vg() and diagnostics.py.
fn vg(c: i32, i: i32, j: i32, k: i32) -> f32 {
  let n = T.n; let nz = T.nz;
  var ii = i; var jj = j; var kk = k; var s = 1.0;
  if (ii < 0) { ii = 0; s = -s; } else if (ii >= n) { ii = n - 1; s = -s; }
  if (jj < 0) { jj = 0; s = -s; } else if (jj >= n) { jj = n - 1; s = -s; }
  if (kk < 0) { if (T.periodic != 0u) { kk = nz - 1; } else { kk = 0; s = -s; } }
  else if (kk >= nz) { if (T.periodic != 0u) { kk = 0; } else { kk = nz - 1; s = -s; } }
  return s * V[u32(((c * nz + kk) * n + jj) * n + ii)];
}

// trilinear interpolation between cell centres (tracers.js velAt)
fn vel(p0: vec3<f32>) -> vec3<f32> {
  let n = f32(T.n);
  let x = clamp(p0.x, 0.0, 1.0); let y = clamp(p0.y, 0.0, 1.0);
  var z = p0.z;
  if (T.periodic != 0u) { z = z - T.lz * floor(z / T.lz); } else { z = clamp(z, 0.0, T.lz); }
  let fx = x * n - 0.5; let fy = y * n - 0.5; let fz = z / T.h - 0.5;
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy)); let k0 = i32(floor(fz));
  let tx = fx - f32(i0); let ty = fy - f32(j0); let tz = fz - f32(k0);
  var out = vec3<f32>(0.0);
  for (var c = 0; c < 3; c++) {
    let a0 = mix(mix(vg(c, i0, j0, k0), vg(c, i0 + 1, j0, k0), tx), mix(vg(c, i0, j0 + 1, k0), vg(c, i0 + 1, j0 + 1, k0), tx), ty);
    let a1 = mix(mix(vg(c, i0, j0, k0 + 1), vg(c, i0 + 1, j0, k0 + 1), tx), mix(vg(c, i0, j0 + 1, k0 + 1), vg(c, i0 + 1, j0 + 1, k0 + 1), tx), ty);
    out[c] = mix(a0, a1, tz);
  }
  return out;
}

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(seed: ptr<function, u32>) -> f32 { *seed = pcg(*seed); return f32(*seed >> 8u) / 16777216.0; }

@compute @workgroup_size(64)
fn cs_advect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p = gid.x;
  if (p >= T.np) { return; }
  let st = PS[2u * p];
  var life = PS[2u * p + 1u].x;
  var q = st.xyz;
  let dt = T.tau / f32(T.sub);
  for (var s = 0u; s < T.sub; s++) {
    let u1 = vel(q);
    let u2 = vel(q + 0.5 * dt * u1);
    q += dt * u2;
  }
  let age = st.w + T.tau;
  let speed = length(q - st.xyz) / T.tau;
  var wrapped = false;
  if (T.periodic != 0u && (q.z < 0.0 || q.z >= T.lz)) { q.z = q.z - T.lz * floor(q.z / T.lz); wrapped = true; }
  let out = q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || (T.periodic == 0u && (q.z < 0.0 || q.z > T.lz));
  let c = vec2<f32>(0.5 + T.ro * cos(T.phi), 0.5 + T.ro * sin(T.phi));
  let inside = length(q.xy - c) < T.R;
  var w = speed;
  if (age >= life || out || inside) {                 // re-seed somewhere random: a new path starts, no streak
    var seed = pcg(p ^ pcg(T.frame * 2654435761u + 12345u));
    q = vec3<f32>(rnd(&seed), rnd(&seed), rnd(&seed) * T.lz);
    life = 2.0 + 2.0 * rnd(&seed);
    PS[2u * p] = vec4<f32>(q, 0.0);
    PS[2u * p + 1u] = vec4<f32>(life, 0.0, 0.0, 0.0);
    w = -1.0;
  } else {
    PS[2u * p] = vec4<f32>(q, age);
    if (wrapped) { w = -1.0; }                        // crossed the periodic span: do not draw a line across the box
  }
  TR[p * T.kcap + T.slot] = vec4<f32>(q, w);
}

// ---------------------------------------------------------------- drawing
struct TD {
  vp: mat4x4<f32>,
  ox: f32, oy: f32, sc: f32, mode: u32,          // mode 1..3: slice xy / xz / yz (pixel layout), 4, 5: 3D (vp)
  W: f32, H: f32, spos: f32, slab: f32,          // spos: slice coordinate; slab: half-thickness shown on a slice
  ink: vec4<f32>,
  np: u32, kcap: u32, K: u32, head: u32,
  sref: f32, lz: f32, periodic: u32, pad: u32,
};
@group(0) @binding(4) var<uniform> D: TD;
@group(0) @binding(5) var<storage, read> TRR: array<vec4<f32>>;

struct TOut { @builtin(position) pos: vec4<f32>, @location(0) col: vec4<f32> };

fn place(q: vec3<f32>) -> vec4<f32> {
  if (D.mode >= 4u) { return D.vp * vec4<f32>(q, 1.0); }
  var u = q.x; var v = q.y;
  if (D.mode == 2u) { v = q.z; } else if (D.mode == 3u) { u = q.y; v = q.z; }
  let px = D.ox + u * D.sc; let py = D.oy - v * D.sc;
  return vec4<f32>(2.0 * px / D.W - 1.0, 1.0 - 2.0 * py / D.H, 0.0, 1.0);
}

@vertex
fn vs_trail(@builtin(vertex_index) vi: u32) -> TOut {
  var o: TOut;
  o.pos = vec4<f32>(0.0, 0.0, -2.0, 1.0);            // outside the clip volume: nothing drawn
  o.col = vec4<f32>(0.0);
  let km1 = D.K - 1u;
  let seg = vi / 2u;
  let p = seg / km1; let a = seg % km1;             // a: age of the segment's newer end, in frames
  let sn = (D.head + D.kcap - a) % D.kcap;
  let so = (D.head + 2u * D.kcap - a - 1u) % D.kcap;
  let qn = TRR[p * D.kcap + sn]; let qo = TRR[p * D.kcap + so];
  if (qn.w < 0.0 || qo.w < -1.5) { return o; }
  var fs = 1.0;
  if (D.mode < 4u) {                                  // slices: only particles near the plane
    var d = 0.0;
    if (D.mode == 1u) {
      d = qn.z - D.spos;
      if (D.periodic != 0u) { d = d - D.lz * round(d / D.lz); }
    } else if (D.mode == 2u) { d = qn.y - D.spos; } else { d = qn.x - D.spos; }
    if (abs(d) > D.slab) { return o; }
    fs = 1.0 - abs(d) / D.slab;
  }
  let sp = clamp(sqrt(qn.w / D.sref), 0.3, 1.0);
  let fade = 1.0 - f32(a) / f32(km1);
  var q = qo.xyz;
  if ((vi & 1u) == 1u) { q = qn.xyz; }
  o.pos = place(q);
  o.col = vec4<f32>(D.ink.rgb, D.ink.a * sp * fade * fs);
  return o;
}
@fragment
fn fs_trail(i: TOut) -> @location(0) vec4<f32> { return i.col; }
