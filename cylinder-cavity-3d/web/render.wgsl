// render.wgsl: derived scalar fields (|omega|, omega_z, Q, speed, w), a GPU range reduction,
// colour-mapped slices, a ray-marched volume, the 3D cylinder and the overlay lines.
// All velocity/field buffers use the layout [k (z)][j (y)][i (x)] (velocity: [c][k][j][i]).
// Cells are at x = (i+1/2) h, y = (j+1/2) h, z = (k+1/2) h; box x,y in [0,1], z in [0,Lz].

// ------------------------------------------------------------------ field kernels
struct CP {                       // parameters of the compute kernels
  n: i32, nz: i32, periodic: u32, field: u32,
  h: f32, R: f32, ro: f32, phi: f32,
  mask: u32, use_body: u32, sgn: u32, nbins: u32,
  pct: f32, p0: f32, p1: f32, p2: f32,
};
@group(0) @binding(0) var<uniform> C: CP;
@group(0) @binding(1) var<storage, read> V: array<f32>;                 // velocity [c][k][j][i]
@group(0) @binding(2) var<storage, read_write> OUT: array<f32>;         // derived field [k][j][i]
@group(0) @binding(5) var<storage, read> FLD: array<f32>;               // field being reduced
@group(0) @binding(6) var<storage, read_write> ST: array<atomic<u32>>;  // [0] max bits, [1] count, [2..] histogram
@group(0) @binding(7) var<storage, read_write> RNG: array<f32>;         // [lo, hi, max, count]

// velocity component c at cell (i,j,k); one index may lie one step outside the grid, where the
// no-slip odd-mirror ghost value  -(edge value)  is used (periodic z wraps).  Same rule as diagnostics.py.
fn vg(c: i32, i: i32, j: i32, k: i32) -> f32 {
  let n = C.n; let nz = C.nz;
  var ii = i; var jj = j; var kk = k; var s = 1.0;
  if (ii < 0) { ii = 0; s = -s; } else if (ii >= n) { ii = n - 1; s = -s; }
  if (jj < 0) { jj = 0; s = -s; } else if (jj >= n) { jj = n - 1; s = -s; }
  if (kk < 0) { if (C.periodic != 0u) { kk = nz - 1; } else { kk = 0; s = -s; } }
  else if (kk >= nz) { if (C.periodic != 0u) { kk = 0; } else { kk = nz - 1; s = -s; } }
  return s * V[u32(((c * nz + kk) * n + jj) * n + ii)];
}

fn in_body(i: i32, j: i32) -> bool {
  let x = (f32(i) + 0.5) * C.h - (0.5 + C.ro * cos(C.phi));
  let y = (f32(j) + 0.5) * C.h - (0.5 + C.ro * sin(C.phi));
  return x * x + y * y < C.R * C.R;
}

fn cell_index(wid: vec3<u32>, li: u32) -> u32 { return (wid.y * 65535u + wid.x) * 64u + li; }

@compute @workgroup_size(64)
fn cs_fields(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let idx = cell_index(wid, li);
  let n = C.n; let nz = C.nz;
  if (idx >= u32(n * n * nz)) { return; }
  let i = i32(idx) % n; let j = (i32(idx) / n) % n; let k = i32(idx) / (n * n);
  let f = C.field;
  let inv2h = 0.5 / C.h;
  // g[a][b] = d u_a / d x_b
  var g: array<array<f32, 3>, 3>;
  for (var a = 0; a < 3; a++) {
    g[a][0] = (vg(a, i + 1, j, k) - vg(a, i - 1, j, k)) * inv2h;
    g[a][1] = (vg(a, i, j + 1, k) - vg(a, i, j - 1, k)) * inv2h;
    g[a][2] = (vg(a, i, j, k + 1) - vg(a, i, j, k - 1)) * inv2h;
  }
  var val = 0.0;
  if (f == 0u || f == 1u) {
    let wx = g[2][1] - g[1][2];
    let wy = g[0][2] - g[2][0];
    let wz = g[1][0] - g[0][1];
    val = select(wz, sqrt(wx * wx + wy * wy + wz * wz), f == 0u);
  } else if (f == 2u) {
    var s2 = 0.0; var o2 = 0.0;
    for (var a = 0; a < 3; a++) { for (var b = 0; b < 3; b++) {
      let s = 0.5 * (g[a][b] + g[b][a]); let o = 0.5 * (g[a][b] - g[b][a]);
      s2 += s * s; o2 += o * o;
    } }
    val = 0.5 * (o2 - s2);
  } else if (f == 3u) {
    let u = V[idx]; let v = V[idx + u32(n * n * nz)]; let w = V[idx + u32(2 * n * n * nz)];
    val = sqrt(u * u + v * v + w * w);
  } else {
    val = V[idx + u32(2 * n * n * nz)];
  }
  if (C.mask != 0u && in_body(i, j)) { val = 0.0; }
  OUT[idx] = val;
}

// ------------------------------------------------------------------ range reduction
// robust range: |v| histogram on a square-root scale of |v|/max, percentile C.pct of the cells outside the body
@compute @workgroup_size(64)
fn cs_clear(@builtin(local_invocation_index) li: u32) {
  let nb = C.nbins + 2u;
  for (var b = li; b < nb; b += 64u) { atomicStore(&ST[b], 0u); }
}

fn counted(idx: u32) -> bool {
  let n = C.n;
  if (C.use_body != 0u && in_body(i32(idx) % n, (i32(idx) / n) % n)) { return false; }
  let v = FLD[idx];
  return v == v && abs(v) < 3.0e38;
}

@compute @workgroup_size(64)
fn cs_max(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let idx = cell_index(wid, li);
  if (idx >= u32(C.n * C.n * C.nz)) { return; }
  if (!counted(idx)) { return; }
  atomicMax(&ST[0], bitcast<u32>(abs(FLD[idx])));
}

@compute @workgroup_size(64)
fn cs_hist(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let idx = cell_index(wid, li);
  if (idx >= u32(C.n * C.n * C.nz)) { return; }
  if (!counted(idx)) { return; }
  let mx = bitcast<f32>(atomicLoad(&ST[0]));
  let r = select(0.0, abs(FLD[idx]) / mx, mx > 0.0);
  let b = min(u32(sqrt(r) * f32(C.nbins)), C.nbins - 1u);
  atomicAdd(&ST[2u + b], 1u);
  atomicAdd(&ST[1], 1u);
}

@compute @workgroup_size(1)
fn cs_range() {
  let mx = bitcast<f32>(atomicLoad(&ST[0]));
  let cnt = atomicLoad(&ST[1]);
  var hi = 1.0;
  if (cnt > 0u && mx > 0.0) {
    let want = u32(ceil(C.pct * f32(cnt)));
    var acc = 0u; var bin = C.nbins - 1u;
    for (var b = 0u; b < C.nbins; b++) {
      acc += atomicLoad(&ST[2u + b]);
      if (acc >= want) { bin = b; break; }
    }
    let q = f32(bin + 1u) / f32(C.nbins);
    hi = max(mx * q * q, 1.0e-30);
  }
  RNG[0] = select(0.0, -hi, C.sgn != 0u);
  RNG[1] = hi;
  RNG[2] = mx;
  RNG[3] = f32(cnt);
}

// ------------------------------------------------------------------ rendering
struct Params {
  n: i32, nz: i32, periodic: u32, field: u32,
  h: f32, Lz: f32, R: f32, ro: f32,
  phi: f32, slice: f32, mode: u32, auto_range: u32,
  lo: f32, hi: f32, view_w: f32, view_h: f32,
  steps: u32, opacity: f32, p0: f32, p1: f32,
  cam_pos: vec4<f32>,      // xyz eye, w = tan(fov/2)
  cam_r: vec4<f32>,        // xyz right, w = aspect
  cam_u: vec4<f32>,        // xyz up
  cam_f: vec4<f32>,        // xyz forward
  plane: vec4<f32>,        // slice layout: x pixel of origin, y pixel of origin (from top), pixels per unit
  vp: mat4x4<f32>,         // world -> clip (depth 0..1)
};
@group(0) @binding(8) var<uniform> P: Params;
@group(0) @binding(9) var<storage, read> FA: array<f32>;
@group(0) @binding(10) var<storage, read> RA: array<f32>;

const BG = vec3<f32>(0.965, 0.968, 0.975);
const INK = vec3<f32>(0.19, 0.2, 0.25);
const GREY = vec3<f32>(0.55, 0.57, 0.62);

fn diverging(t: f32) -> vec3<f32> {            // blue - white - red, t in [-1, 1]
  let lo = vec3<f32>(0.23, 0.30, 0.75); let mid = vec3<f32>(0.97, 0.97, 0.97); let hi = vec3<f32>(0.71, 0.016, 0.15);
  if (t < 0.0) { return mix(mid, lo, -t); }
  return mix(mid, hi, t);
}
fn sequential(t: f32) -> vec3<f32> {           // viridis, 5 stops, t in [0, 1]
  var c = array<vec3<f32>, 5>(vec3<f32>(0.267, 0.005, 0.329), vec3<f32>(0.230, 0.322, 0.546),
    vec3<f32>(0.128, 0.567, 0.551), vec3<f32>(0.369, 0.789, 0.383), vec3<f32>(0.993, 0.906, 0.144));
  let s = clamp(t, 0.0, 1.0) * 4.0;
  let k = min(i32(floor(s)), 3);
  return mix(c[k], c[k + 1], s - f32(k));
}
fn is_signed(f: u32) -> bool { return f == 1u || f == 2u || f == 4u; }
fn used_range() -> vec2<f32> {
  if (P.auto_range != 0u) { return vec2<f32>(RA[0], RA[1]); }
  return vec2<f32>(P.lo, P.hi);
}
fn sym(r: vec2<f32>) -> f32 { return max(max(abs(r.x), abs(r.y)), 1.0e-30); }
fn cmap(v: f32, r: vec2<f32>) -> vec3<f32> {
  if (is_signed(P.field)) { return diverging(clamp(v / sym(r), -1.0, 1.0)); }
  return sequential((v - r.x) / max(r.y - r.x, 1.0e-30));
}

fn fval(i: i32, j: i32, k: i32) -> f32 { return FA[u32((k * P.n + j) * P.n + i)]; }

// trilinear interpolation between cell centres; clamped in x,y, wrapped or clamped in z
fn samp3(p: vec3<f32>) -> f32 {
  let n = P.n;
  let fx = clamp(p.x * f32(n) - 0.5, 0.0, f32(n - 1));
  let fy = clamp(p.y * f32(n) - 0.5, 0.0, f32(n - 1));
  var fz = p.z / P.h - 0.5;
  var k0 = 0; var k1 = 0; var tz = 0.0;
  if (P.periodic != 0u) {
    let nzf = f32(P.nz);
    fz = fz - nzf * floor(fz / nzf);
    k0 = min(i32(floor(fz)), P.nz - 1); tz = fz - f32(k0); k1 = (k0 + 1) % P.nz;
  } else {
    fz = clamp(fz, 0.0, f32(P.nz - 1));
    k0 = min(i32(floor(fz)), max(P.nz - 2, 0)); k1 = min(k0 + 1, P.nz - 1); tz = fz - f32(k0);
  }
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy));
  let i1 = min(i0 + 1, n - 1); let j1 = min(j0 + 1, n - 1);
  let tx = fx - f32(i0); let ty = fy - f32(j0);
  let a0 = mix(mix(fval(i0, j0, k0), fval(i1, j0, k0), tx), mix(fval(i0, j1, k0), fval(i1, j1, k0), tx), ty);
  let a1 = mix(mix(fval(i0, j0, k1), fval(i1, j0, k1), tx), mix(fval(i0, j1, k1), fval(i1, j1, k1), tx), ty);
  return mix(a0, a1, tz);
}

@vertex
fn vs_full(@builtin(vertex_index) k: u32) -> @builtin(position) vec4<f32> {
  let xy = vec2<f32>(f32((k << 1u) & 2u), f32(k & 2u));      // one triangle covering the screen
  return vec4<f32>(xy * 2.0 - 1.0, 0.0, 1.0);
}

fn cyl_centre() -> vec2<f32> { return vec2<f32>(0.5 + P.ro * cos(P.phi), 0.5 + P.ro * sin(P.phi)); }

// ---- slices: mode 1 = xy (z = slice Lz), 2 = xz (y = slice), 3 = yz (x = slice)
@fragment
fn fs_slice(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let u = (frag.x - P.plane.x) / P.plane.z;
  let v = (P.plane.y - frag.y) / P.plane.z;
  var p = vec3<f32>(0.0);
  var vmax = 1.0;
  if (P.mode == 1u) { p = vec3<f32>(u, v, P.slice * P.Lz); }
  else if (P.mode == 2u) { p = vec3<f32>(u, P.slice, v); vmax = P.Lz; }
  else { p = vec3<f32>(P.slice, u, v); vmax = P.Lz; }
  // derivatives before any branch (uniform control flow)
  let d = p.xy - cyl_centre();
  let fr = length(d) - P.R;
  let fw = max(length(vec2<f32>(dpdx(fr), dpdy(fr))), 1.0e-6);
  if (u < 0.0 || u > 1.0 || v < 0.0 || v > vmax) { return vec4<f32>(BG, 1.0); }
  let r = used_range();
  var col = cmap(samp3(p), r);
  if (fr < 0.0) { col = mix(col, GREY, 0.8); }
  if (abs(fr) < 1.0 * fw) { col = INK; }
  return vec4<f32>(col, 1.0);
}

// ---- 3D ray set-up
fn ray_dir(frag: vec4<f32>) -> vec3<f32> {
  let nx = (frag.x / P.view_w) * 2.0 - 1.0;
  let ny = 1.0 - (frag.y / P.view_h) * 2.0;
  let tf = P.cam_pos.w;
  return normalize(P.cam_f.xyz + P.cam_r.xyz * (nx * tf * P.cam_r.w) + P.cam_u.xyz * (ny * tf));
}
// ray / box [0,1]x[0,1]x[0,Lz]: returns (tnear, tfar), tnear > tfar if missed
fn ray_box(o: vec3<f32>, d: vec3<f32>) -> vec2<f32> {
  let bmax = vec3<f32>(1.0, 1.0, P.Lz);
  let inv = 1.0 / select(d, vec3<f32>(1.0e-9), abs(d) < vec3<f32>(1.0e-9));
  let t0 = (vec3<f32>(0.0) - o) * inv; let t1 = (bmax - o) * inv;
  let tn = min(t0, t1); let tf = max(t0, t1);
  return vec2<f32>(max(max(max(tn.x, tn.y), tn.z), 0.0), min(min(tf.x, tf.y), tf.z));
}
// first point inside the cylinder (axis parallel to z) on the segment [t0,t1]: (t, nx, ny, nz), t < 0 if none
fn cyl_hit(o: vec3<f32>, d: vec3<f32>, t0: f32, t1: f32) -> vec4<f32> {
  let c = cyl_centre();
  let oc = o.xy - c;
  let a = dot(d.xy, d.xy);
  let cc = dot(oc, oc) - P.R * P.R;
  var tin = -1.0e30; var tout = 1.0e30;
  if (a < 1.0e-12) {
    if (cc >= 0.0) { return vec4<f32>(-1.0, 0.0, 0.0, 0.0); }
  } else {
    let b = dot(oc, d.xy);
    let disc = b * b - a * cc;
    if (disc <= 0.0) { return vec4<f32>(-1.0, 0.0, 0.0, 0.0); }
    let s = sqrt(disc);
    tin = (-b - s) / a; tout = (-b + s) / a;
  }
  let ts = max(tin, t0);
  if (ts >= min(tout, t1)) { return vec4<f32>(-1.0, 0.0, 0.0, 0.0); }
  if (tin >= t0) {                                       // enters through the side
    let q = (o + d * ts).xy - c;
    return vec4<f32>(ts, q / P.R, 0.0);
  }
  return vec4<f32>(ts, 0.0, 0.0, -sign(d.z));          // already inside at the box entry: an end face
}
fn cyl_colour(h: vec4<f32>, d: vec3<f32>) -> vec3<f32> {
  let n = vec3<f32>(h.y, h.z, h.w);
  return GREY * (0.55 + 0.6 * abs(dot(n, -d)));
}
fn depth_of(pw: vec3<f32>) -> f32 {
  let c = P.vp * vec4<f32>(pw, 1.0);
  return clamp(c.z / c.w, 0.0, 1.0);
}

struct VOut { @location(0) color: vec4<f32>, @builtin(frag_depth) depth: f32 };

fn hash2(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453); }

@fragment
fn fs_volume(@builtin(position) frag: vec4<f32>) -> VOut {
  var out: VOut;
  let o = P.cam_pos.xyz;
  let d = ray_dir(frag);
  let tb = ray_box(o, d);
  if (tb.x >= tb.y) { discard; }
  var tm1 = tb.y;
  let ch = cyl_hit(o, d, tb.x, tb.y);
  var hit = false;
  if (ch.x >= 0.0) { tm1 = ch.x; hit = true; }
  let r = used_range();
  let m = sym(r);
  let nst = max(P.steps, 1u);
  let dt = max(tm1 - tb.x, 0.0) / f32(nst);
  let jit = hash2(frag.xy);
  var T = 1.0;
  var acc = vec3<f32>(0.0);
  for (var s = 0u; s < nst; s++) {
    let t = tb.x + (f32(s) + jit) * dt;
    let v = samp3(o + d * t);
    var sc = 0.0; var col = vec3<f32>(0.0);
    if (P.field == 1u || P.field == 4u) { sc = abs(v) / m; col = diverging(clamp(v / m, -1.0, 1.0)); }
    else if (P.field == 2u) { sc = max(v, 0.0) / m; col = sequential(sc); }
    else { sc = (v - r.x) / max(r.y - r.x, 1.0e-30); col = sequential(sc); }
    // square-root scaling: weak but coherent structures stay visible next to a few very strong cells
    let sq = sqrt(clamp(sc, 0.0, 1.0));
    if (P.field != 1u && P.field != 4u) { col = sequential(sq); }
    let dens = P.opacity * 25.0 * smoothstep(0.12, 0.7, sq);
    let a = 1.0 - exp(-dens * dt);
    acc += T * a * col;
    T *= 1.0 - a;
    if (T < 0.02) { break; }
  }
  var depth = 1.0;
  var bg = BG;
  if (hit) {
    bg = cyl_colour(ch, d);
    depth = depth_of(o + d * ch.x);
  }
  out.color = vec4<f32>(acc + T * bg, 1.0);
  out.depth = depth;
  return out;
}

// the cylinder alone (isosurface mode): analytic ray cast, writes depth
@fragment
fn fs_cyl(@builtin(position) frag: vec4<f32>) -> VOut {
  var out: VOut;
  let o = P.cam_pos.xyz;
  let d = ray_dir(frag);
  let tb = ray_box(o, d);
  if (tb.x >= tb.y) { discard; }
  let ch = cyl_hit(o, d, tb.x, tb.y);
  if (ch.x < 0.0) { discard; }
  out.color = vec4<f32>(cyl_colour(ch, d), 1.0);
  out.depth = depth_of(o + d * ch.x);
  return out;
}

// ---------------------------------------------------------------- overlay lines (clip-space vertices)
struct LOut { @builtin(position) pos: vec4<f32>, @location(0) col: vec4<f32> };
@vertex
fn vs_line(@location(0) p: vec4<f32>, @location(1) c: vec4<f32>) -> LOut {
  var o: LOut; o.pos = p; o.col = c; return o;
}
@fragment
fn fs_line(i: LOut) -> @location(0) vec4<f32> { return i.col; }
