// Lattice-Boltzmann flow + tracer in a 2D packed bed: WebGPU compute shaders.
//
// The same algorithm as python/lbm.py, one GPU thread per lattice cell.
// Populations are stored "structure of arrays": population i of cell idx
// lives at f[i * n + idx], so neighbouring threads read neighbouring memory.
// The flow buffers hold h_i = f_i - w_i, the deviation from fluid at rest:
// in float32 the velocity, a small difference of O(0.1) populations, would
// otherwise lose about four digits.  The algebra is unchanged (w_i = w_opp(i)).
//
//   flow_step    D2Q9 pull streaming + halfway bounce-back + TRT collision
//                with Guo forcing                      (lbm.flow_step)
//   tracer_step  D2Q5 TRT advection-diffusion, inlet pulse at x = 0,
//                zero-gradient outlet                  (lbm.tracer_step)
//   tick         advances the step counter used for the inlet pulse
//   reduce       per-workgroup sums for the permeability, max |u|, mass
//   detect       cup-mixing tracer concentration at three detector columns

struct Params {
  nx: u32, ny: u32, n: u32, pulse_t0: u32,
  pulse_t1: u32, det0: u32, det1: u32, det2: u32,
  wp: f32, wm: f32, gx: f32, gy: f32,     // flow: TRT rates, body force
  twp: f32, twm: f32, c_in: f32, pad: f32, // tracer: TRT rates, pulse concentration
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> fin: array<f32>;          // post-collision, step t
@group(0) @binding(2) var<storage, read_write> fout: array<f32>;   // post-collision, step t+1
@group(0) @binding(3) var<storage, read> solid: array<u32>;        // 1 = particle
@group(0) @binding(4) var<storage, read_write> fields: array<vec4<f32>>;  // (ux, uy, rho, c)
@group(0) @binding(5) var<storage, read> gin: array<f32>;          // tracer populations
@group(0) @binding(6) var<storage, read_write> gout: array<f32>;
@group(0) @binding(7) var<storage, read_write> clock: array<u32>;  // [0] = step counter
@group(0) @binding(8) var<storage, read_write> partial: array<vec4<f32>>;
@group(0) @binding(9) var<storage, read_write> det: array<vec4<f32>>;

// D2Q9: rest, +x, +y, -x, -y, (+1,+1), (-1,+1), (-1,-1), (+1,-1).  D2Q5 = first five.
var<private> CX: array<i32, 9> = array<i32, 9>(0, 1, 0, -1, 0, 1, -1, -1, 1);
var<private> CY: array<i32, 9> = array<i32, 9>(0, 0, 1, 0, -1, 1, 1, -1, -1);
var<private> WT: array<f32, 9> = array<f32, 9>(4.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0, 1.0 / 9.0,
                                               1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0);
var<private> OPP: array<u32, 9> = array<u32, 9>(0u, 3u, 4u, 1u, 2u, 7u, 8u, 5u, 6u);
var<private> W5: array<f32, 5> = array<f32, 5>(1.0 / 3.0, 1.0 / 6.0, 1.0 / 6.0, 1.0 / 6.0, 1.0 / 6.0);

// f_i^eq - w_i, written so that no O(1) terms cancel (drho = rho - 1)
fn feq_dev(i: u32, drho: f32, rho: f32, ux: f32, uy: f32) -> f32 {
  let cu = f32(CX[i]) * ux + f32(CY[i]) * uy;
  return WT[i] * (drho + rho * (3.0 * cu + 4.5 * cu * cu - 1.5 * (ux * ux + uy * uy)));
}

@compute @workgroup_size(128)
fn flow_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= P.n) { return; }
  let n = P.n;
  if (solid[idx] != 0u) {                       // particles hold rest populations (h = 0)
    for (var i = 0u; i < 9u; i++) { fout[i * n + idx] = 0.0; }
    fields[idx] = vec4<f32>(0.0, 0.0, 1.0, fields[idx].w);
    return;
  }
  let nx = i32(P.nx);
  let ny = i32(P.ny);
  let x = i32(idx % P.nx);
  let y = i32(idx / P.nx);

  // stream_pull: take population i from the upwind neighbour, or bounce back
  var f: array<f32, 9>;                         // deviations h_i
  for (var i = 0u; i < 9u; i++) {
    let sx = (x - CX[i] + nx) % nx;
    let sy = (y - CY[i] + ny) % ny;
    let s = u32(sy * nx + sx);
    if (solid[s] != 0u) { f[i] = fin[OPP[i] * n + idx]; } else { f[i] = fin[i * n + s]; }
  }

  // moments, with half the body force in the velocity (Guo)
  var drho = 0.0;
  for (var i = 0u; i < 9u; i++) { drho += f[i]; }
  let rho = 1.0 + drho;
  let ux = (f[1] - f[3] + f[5] - f[6] - f[7] + f[8] + 0.5 * P.gx) / rho;
  let uy = (f[2] - f[4] + f[5] + f[6] - f[7] - f[8] + 0.5 * P.gy) / rho;

  // collide_trt: relax symmetric / antisymmetric parts at rates wp / wm
  let uF = ux * P.gx + uy * P.gy;
  for (var i = 0u; i < 9u; i++) {
    let o = OPP[i];
    let cu = f32(CX[i]) * ux + f32(CY[i]) * uy;
    let cF = f32(CX[i]) * P.gx + f32(CY[i]) * P.gy;
    let ei = feq_dev(i, drho, rho, ux, uy);
    let eo = feq_dev(o, drho, rho, ux, uy);
    let fp = 0.5 * (f[i] + f[o]);
    let fm = 0.5 * (f[i] - f[o]);
    let sp = WT[i] * (9.0 * cu * cF - 3.0 * uF);
    let sm = WT[i] * 3.0 * cF;
    fout[i * n + idx] = f[i] - P.wp * (fp - 0.5 * (ei + eo)) - P.wm * (fm - 0.5 * (ei - eo))
                      + (1.0 - 0.5 * P.wp) * sp + (1.0 - 0.5 * P.wm) * sm;
  }
  fields[idx] = vec4<f32>(ux, uy, rho, fields[idx].w);
}

@compute @workgroup_size(128)
fn tracer_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= P.n) { return; }
  let n = P.n;
  if (solid[idx] != 0u) {
    for (var i = 0u; i < 5u; i++) { gout[i * n + idx] = 0.0; }
    fields[idx].w = 0.0;
    return;
  }
  let u = fields[idx].xy;                       // velocity of this step (flow_step ran first)
  let x = i32(idx % P.nx);
  if (x == 0) {                                 // inlet: equilibrium at the pulse concentration
    let t = clock[0];
    let c_in = select(0.0, P.c_in, t >= P.pulse_t0 && t < P.pulse_t1);
    for (var i = 0u; i < 5u; i++) {
      gout[i * n + idx] = W5[i] * c_in * (1.0 + 3.0 * (f32(CX[i]) * u.x + f32(CY[i]) * u.y));
    }
    fields[idx].w = c_in;
    return;
  }
  let nx = i32(P.nx);
  let ny = i32(P.ny);
  let y = i32(idx / P.nx);
  var g: array<f32, 5>;
  var c = 0.0;
  for (var i = 0u; i < 5u; i++) {
    let sx = clamp(x - CX[i], 0, nx - 1);       // not periodic in x: clamp = zero gradient
    let sy = (y - CY[i] + ny) % ny;
    let s = u32(sy * nx + sx);
    if (solid[s] != 0u) { g[i] = gin[OPP[i] * n + idx]; } else { g[i] = gin[i * n + s]; }
    c += g[i];
  }
  for (var i = 0u; i < 5u; i++) {
    let o = OPP[i];
    let cu = f32(CX[i]) * u.x + f32(CY[i]) * u.y;
    let gp = 0.5 * (g[i] + g[o]);
    let gm = 0.5 * (g[i] - g[o]);
    gout[i * n + idx] = g[i] - P.twp * (gp - W5[i] * c) - P.twm * (gm - 3.0 * W5[i] * c * cu);
  }
  fields[idx].w = c;
}

@compute @workgroup_size(1)
fn tick() {
  clock[0] = clock[0] + 1u;
}

var<workgroup> sh: array<vec4<f32>, 256>;

// (sum ux, max |u|, sum rho, max c) over the fluid cells of one workgroup
@compute @workgroup_size(256)
fn reduce(@builtin(global_invocation_id) gid: vec3<u32>,
          @builtin(local_invocation_id) lid: vec3<u32>,
          @builtin(workgroup_id) wid: vec3<u32>) {
  var v = vec4<f32>(0.0);
  if (gid.x < P.n) {
    if (solid[gid.x] == 0u) {
      let q = fields[gid.x];
      v = vec4<f32>(q.x, length(q.xy), q.z, q.w);
    }
  }
  sh[lid.x] = v;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (lid.x < s) {
      let a = sh[lid.x];
      let b = sh[lid.x + s];
      sh[lid.x] = vec4<f32>(a.x + b.x, max(a.y, b.y), a.z + b.z, max(a.w, b.w));
    }
    workgroupBarrier();
  }
  if (lid.x == 0u) { partial[wid.x] = sh[0]; }
}

// cup-mixing sums down three detector columns: (sum ux c, sum ux, sum c, 0)
@compute @workgroup_size(4)
fn detect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let j = gid.x;
  if (j > 2u) { return; }
  var col = P.det0;
  if (j == 1u) { col = P.det1; }
  if (j == 2u) { col = P.det2; }
  var s = vec4<f32>(0.0);
  for (var y = 0u; y < P.ny; y++) {
    let idx = y * P.nx + col;
    if (solid[idx] == 0u) {
      let q = fields[idx];
      s += vec4<f32>(q.x * q.w, q.x, q.w, 0.0);
    }
  }
  det[j] = s;
}
