// Draws the scalar field (bilinear between cell centres, colour-mapped) and the cylinder.
struct Params {
  n: i32, probe_every: u32, probe_i: i32, probe_j: i32,
  h: f32, nu: f32, dt: f32, R: f32,
  ro: f32, Omega: f32, omega_o: f32, eps: f32,
  field: u32, crange: f32, view_w: f32, view_h: f32,
};
struct State { t: f32, phi: f32, spin: f32, dt_prev: f32, nstep: u32, p0: u32, p1: u32, p2: u32 };

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> S: State;
@group(0) @binding(2) var<storage, read> scalar: array<f32>;

@vertex
fn vs_main(@builtin(vertex_index) k: u32) -> @builtin(position) vec4<f32> {
  let xy = vec2<f32>(f32((k << 1u) & 2u), f32(k & 2u));      // one triangle covering the screen
  return vec4<f32>(xy * 2.0 - 1.0, 0.0, 1.0);
}

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
fn dyemap(t: f32) -> vec3<f32> {
  return mix(vec3<f32>(0.12, 0.16, 0.35), vec3<f32>(0.98, 0.75, 0.25), clamp(t, 0.0, 1.0));
}

fn sample(x: f32, y: f32) -> f32 {
  let n = P.n;
  let fx = clamp(x * f32(n) - 0.5, 0.0, f32(n - 1));
  let fy = clamp(y * f32(n) - 0.5, 0.0, f32(n - 1));
  let i0 = i32(floor(fx)); let j0 = i32(floor(fy));
  let i1 = min(i0 + 1, n - 1); let j1 = min(j0 + 1, n - 1);
  let tx = fx - f32(i0); let ty = fy - f32(j0);
  let a = mix(scalar[j0 * n + i0], scalar[j0 * n + i1], tx);
  let b = mix(scalar[j1 * n + i0], scalar[j1 * n + i1], tx);
  return mix(a, b, ty);
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let x = pos.x / P.view_w;
  let y = 1.0 - pos.y / P.view_h;
  let s = sample(x, y);
  var col: vec3<f32>;
  switch P.field {
    case 0u, 2u: { col = diverging(clamp(s / P.crange, -1.0, 1.0)); }
    case 1u: { col = sequential(s / P.crange); }
    default: { col = dyemap(s); }
  }
  // the cylinder: translucent grey disc, a radius that turns with the spin, dark outline
  let px = 1.0 / P.view_w;
  let c = vec2<f32>(0.5 + P.ro * cos(S.phi), 0.5 + P.ro * sin(S.phi));
  let d = vec2<f32>(x, y) - c;
  let r = length(d);
  if (r < P.R) {
    col = mix(col, vec3<f32>(0.55, 0.57, 0.62), 0.8);
    let e = vec2<f32>(cos(S.spin), sin(S.spin));
    let along = dot(d, e);
    if (along > 0.0 && abs(d.x * e.y - d.y * e.x) < 1.5 * px) { col = vec3<f32>(0.19, 0.2, 0.25); }
  }
  if (abs(r - P.R) < 1.2 * px) { col = vec3<f32>(0.19, 0.2, 0.25); }
  // the velocity probe: a small x
  let pr = vec2<f32>(x, y) - (vec2<f32>(f32(P.probe_i), f32(P.probe_j)) + 0.5) * P.h;
  if (max(abs(pr.x), abs(pr.y)) < 5.0 * px && abs(abs(pr.x) - abs(pr.y)) < 1.0 * px) { col = vec3<f32>(0.19, 0.2, 0.25); }
  return vec4<f32>(col, 1.0);
}
