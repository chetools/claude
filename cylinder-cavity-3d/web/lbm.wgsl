// lbm.wgsl -- D3Q19 lattice Boltzmann with a moving cylinder: WebGPU compute kernels (float32).
// Port of python/lbm3d.py (see also web/lbm_cpu.js, the float64 JS port with the same kernel structure).
//
// One time step = 6 dispatches (the body position of the step comes from the table `body`, row ctl[0]):
//   geometry       solid mask of the new body position (bit0 = solid now, bit1 = solid before)
//   refill         nodes the body has just left get equilibrium(body velocity, mean neighbour rho) + mean neighbour f_neq
//   collide_stream collide every fluid node (bgk | regularised | mrt), push the post-collision populations to
//                  x + c_q (halfway bounce-back at the walls; a push into the body is a cut link and is left to
//                  `links`); solid nodes get the equilibrium of the body velocity; workgroup partial sums of (rho-1)
//   links          cut links of the body: Bouzidi interpolated bounce-back with moving-wall term, Wen momentum
//                  exchange; workgroup partial sums of (Fx, Fy, Tz, dM)
//   reduce         one workgroup sums the partials: torque/force, mass deficit -> delta, step counter += 1
//   massadd        f_0 += delta on every fluid node (mean fluid density back to exactly 1)
// Layout: population q of node (k, j, i): F[q*vol + (k*N + j)*N + i], vol = N*N*Nz.
// All kernels do identical arithmetic in every z-plane (no z-dependent branches except the wall
// conditions of span = "walls"), so a z-uniform flow stays z-uniform bit for bit.

struct Params {
  v0: vec4<u32>,      // N, Nz, wallz (1 = no-slip end walls), kind (0 bgk, 1 reg, 2 mrt)
  v1: vec4<f32>,      // omega = 1/tau, R (cells), wo (rad/step), Om (rad/step)
  v2: vec4<u32>,      // B (link box side), massfix, nwgA (workgroups of node kernels), nwgB (workgroups of links)
  v3: vec4<f32>,      // hsc = h/dt (velocity scale), 0, 0, 0
  A: array<vec4<f32>, 91>,   // MRT collision matrix (19 x 19, row major) packed in vec4s
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> F: array<f32>;      // populations, current state
@group(0) @binding(2) var<storage, read_write> G: array<f32>;      // populations, next state
@group(0) @binding(3) var<storage, read_write> mask: array<u32>;   // N*N: bit0 solid now, bit1 solid before
@group(0) @binding(4) var<storage, read_write> FPL: array<f32>;    // post-collision populations of the link-box nodes
@group(0) @binding(5) var<storage, read> body: array<vec4<f32>>;   // per step: (cx, cy, 0, 0) in cells
@group(0) @binding(6) var<storage, read_write> ctl: array<f32>;    // 0 step counter, 1 delta, 2 Fx, 3 Fy, 4 Tz, 5 dM, 6 S
@group(0) @binding(7) var<storage, read_write> part: array<f32>;   // workgroup partial sums
@group(0) @binding(8) var<storage, read_write> VEL: array<f32>;    // output velocity (3, Nz, N, N), physical units

const CX = array<i32, 19>(0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0);
const CY = array<i32, 19>(0, 0, 0, 1, -1, 0, 0, 1, -1, -1, 1, 0, 0, 0, 0, 1, -1, 1, -1);
const CZ = array<i32, 19>(0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, -1, -1, 1, 1, -1, -1, 1);
const OPP = array<u32, 19>(0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17);
const WQ = array<f32, 19>(1.0 / 3.0, 1.0 / 18.0, 1.0 / 18.0, 1.0 / 18.0, 1.0 / 18.0, 1.0 / 18.0, 1.0 / 18.0,
  1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0,
  1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0, 1.0 / 36.0);
const CS2: f32 = 1.0 / 3.0;

var<workgroup> sh: array<f32, 256>;      // 4 channels x 64 threads
var<workgroup> sh2: array<f32, 1536>;    // 6 channels x 256 threads (reduce kernel)

// ---------------------------------------------------------------- helpers
fn wglin(wid: vec3<u32>, nwg: vec3<u32>) -> u32 { return wid.y * nwg.x + wid.x; }

// tree sum over the 64 threads of a workgroup, 4 channels at sh[c*64 + lid]; result in sh[c*64]
fn wg_reduce4(lid: u32) {
  for (var s = 32u; s > 0u; s = s >> 1u) {
    workgroupBarrier();
    if (lid < s) {
      for (var c = 0u; c < 4u; c++) { sh[c * 64u + lid] += sh[c * 64u + lid + s]; }
    }
  }
  workgroupBarrier();
}

fn feq(q: u32, rho: f32, ux: f32, uy: f32, uz: f32, uu: f32) -> f32 {
  let cu = f32(CX[q]) * ux + f32(CY[q]) * uy + f32(CZ[q]) * uz;
  return WQ[q] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * uu);
}

fn body_u(cx: f32, cy: f32, y: f32) -> f32 {      // -wo (cy - N/2) - Om (y - cy)
  return -P.v1.z * (cy - f32(P.v0.x) * 0.5) - P.v1.w * (y - cy);
}
fn body_v(cx: f32, cy: f32, x: f32) -> f32 {      // wo (cx - N/2) + Om (x - cx)
  return P.v1.z * (cx - f32(P.v0.x) * 0.5) + P.v1.w * (x - cx);
}

fn is_solid_now(m: u32) -> bool { return (m & 1u) != 0u; }

// ---------------------------------------------------------------- geometry
@compute @workgroup_size(64)
fn geometry(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
            @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let n = wglin(wid, nwg) * 64u + lid;
  if (n >= N * N) { return; }
  let b = body[u32(ctl[0])];
  let i = n % N;
  let j = n / N;
  let dx = f32(i) + 0.5 - b.x;
  let dy = f32(j) + 0.5 - b.y;
  var nw = 0u;
  if (sqrt(dx * dx + dy * dy) < P.v1.y) { nw = 1u; }
  mask[n] = ((mask[n] & 1u) << 1u) | nw;
}

// ---------------------------------------------------------------- refill of uncovered nodes (in place on F)
@compute @workgroup_size(64)
fn refill(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
          @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let vol = N * N * P.v0.y;
  let n = wglin(wid, nwg) * 64u + lid;
  if (n >= vol) { return; }
  let i0 = i32(n % N);
  let j0 = i32((n / N) % N);
  let k = n / (N * N);
  if (mask[u32(j0) * N + u32(i0)] != 2u) { return; }       // was solid, is fluid now
  let b = body[u32(ctl[0])];
  let ub = body_u(b.x, b.y, f32(j0) + 0.5);
  let vb = body_v(b.x, b.y, f32(i0) + 0.5);
  var acc: array<f32, 19>;
  for (var q = 0u; q < 19u; q++) { acc[q] = 0.0; }
  var accr = 0.0;
  var cnt = 0.0;
  let Ni = i32(N);
  for (var dj = -1; dj <= 1; dj++) {
    for (var di = -1; di <= 1; di++) {
      if (dj == 0 && di == 0) { continue; }
      let jn = (j0 + dj + Ni) % Ni;
      let inn = (i0 + di + Ni) % Ni;
      if ((mask[u32(jn) * N + u32(inn)] & 3u) != 0u) { continue; }
      let nn = (k * N + u32(jn)) * N + u32(inn);
      var rho = 0.0;
      var mx = 0.0;
      var my = 0.0;
      var mz = 0.0;
      for (var q = 0u; q < 19u; q++) {
        let v = F[q * vol + nn];
        rho += v; mx += f32(CX[q]) * v; my += f32(CY[q]) * v; mz += f32(CZ[q]) * v;
      }
      let ux = mx / rho; let uy = my / rho; let uz = mz / rho;
      let uu = ux * ux + uy * uy + uz * uz;
      for (var q = 0u; q < 19u; q++) { acc[q] += F[q * vol + nn] - feq(q, rho, ux, uy, uz, uu); }
      accr += rho;
      cnt += 1.0;
    }
  }
  let c = max(cnt, 1.0);
  var r = 1.0;
  if (cnt > 0.0) { r = accr / c; }
  let uub = ub * ub + vb * vb;
  let n0 = (k * N + u32(j0)) * N + u32(i0);
  for (var q = 0u; q < 19u; q++) { F[q * vol + n0] = feq(q, r, ub, vb, 0.0, uub) + acc[q] / c; }
}

// ---------------------------------------------------------------- collide + stream + walls
@compute @workgroup_size(64)
fn collide_stream(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
                  @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let Nz = P.v0.y;
  let vol = N * N * Nz;
  let wl = wglin(wid, nwg);
  let n = wl * 64u + lid;
  var s = 0.0;       // sum of (rho - 1) over the fluid nodes of this workgroup
  var cnt = 0.0;     // number of fluid nodes
  if (n < vol) {
    let i = n % N;
    let j = (n / N) % N;
    let k = n / (N * N);
    let b = body[u32(ctl[0])];
    if (is_solid_now(mask[j * N + i])) {
      // solid node: equilibrium of the body velocity (lbm3d._reset_solid)
      let ub = body_u(b.x, b.y, f32(j) + 0.5);
      let vb = body_v(b.x, b.y, f32(i) + 0.5);
      let uu = ub * ub + vb * vb;
      for (var q = 0u; q < 19u; q++) { G[q * vol + n] = feq(q, 1.0, ub, vb, 0.0, uu); }
    } else {
      var fp: array<f32, 19>;
      var tmp: array<f32, 19>;
      var rho = 0.0;
      var mx = 0.0;
      var my = 0.0;
      var mz = 0.0;
      for (var q = 0u; q < 19u; q++) {
        let v = F[q * vol + n];
        fp[q] = v;
        rho += v; mx += f32(CX[q]) * v; my += f32(CY[q]) * v; mz += f32(CZ[q]) * v;
      }
      let ux = mx / rho; let uy = my / rho; let uz = mz / rho;
      let uu = ux * ux + uy * uy + uz * uz;
      let omega = P.v1.x;
      let kind = P.v0.w;
      if (kind == 0u) {
        for (var q = 0u; q < 19u; q++) { fp[q] = fp[q] - omega * (fp[q] - feq(q, rho, ux, uy, uz, uu)); }
      } else if (kind == 1u) {
        var pxx = 0.0; var pyy = 0.0; var pzz = 0.0; var pxy = 0.0; var pxz = 0.0; var pyz = 0.0;
        for (var q = 0u; q < 19u; q++) {
          let cx = f32(CX[q]); let cy = f32(CY[q]); let cz = f32(CZ[q]);
          let fn_ = fp[q] - feq(q, rho, ux, uy, uz, uu);
          pxx += cx * cx * fn_; pyy += cy * cy * fn_; pzz += cz * cz * fn_;
          pxy += cx * cy * fn_; pxz += cx * cz * fn_; pyz += cy * cz * fn_;
        }
        let a = 1.0 - omega;
        let tr = pxx + pyy + pzz;
        for (var q = 0u; q < 19u; q++) {
          let cx = f32(CX[q]); let cy = f32(CY[q]); let cz = f32(CZ[q]);
          let qp = cx * cx * pxx + cy * cy * pyy + cz * cz * pzz
                 + 2.0 * (cx * cy * pxy + cx * cz * pxz + cy * cz * pyz) - CS2 * tr;
          fp[q] = feq(q, rho, ux, uy, uz, uu) + a * ((0.5 / (CS2 * CS2)) * WQ[q] * qp);
        }
      } else {
        for (var q = 0u; q < 19u; q++) { tmp[q] = fp[q] - feq(q, rho, ux, uy, uz, uu); }
        var out: array<f32, 19>;
        for (var q = 0u; q < 19u; q++) {
          var acc = 0.0;
          for (var m = 0u; m < 19u; m++) {
            let e = q * 19u + m;
            acc += P.A[e / 4u][e % 4u] * tmp[m];
          }
          out[q] = fp[q] - acc;
        }
        fp = out;
      }
      s = rho - 1.0;
      cnt = 1.0;
      // keep f* of the nodes that may carry cut links (box around the body)
      let B = P.v2.x;
      let jb = i32(j) - (i32(floor(b.y - P.v1.y)) - 2);
      let ib = i32(i) - (i32(floor(b.x - P.v1.y)) - 2);
      if (jb >= 0 && jb < i32(B) && ib >= 0 && ib < i32(B)) {
        let base = ((u32(jb) * B + u32(ib)) * Nz + k) * 19u;
        for (var q = 0u; q < 19u; q++) { FPL[base + q] = fp[q]; }
      }
      // push, halfway bounce-back at the walls
      G[n] = fp[0];
      let Ni = i32(N);
      let Nzi = i32(Nz);
      for (var q = 1u; q < 19u; q++) {
        let tx = i32(i) + CX[q];
        let ty = i32(j) + CY[q];
        let tz = i32(k) + CZ[q];
        if (tx < 0 || tx >= Ni || ty < 0 || ty >= Ni || (P.v0.z == 1u && (tz < 0 || tz >= Nzi))) {
          G[OPP[q] * vol + n] = fp[q];
        } else if (!is_solid_now(mask[u32(ty) * N + u32(tx)])) {
          let tzw = u32((tz + Nzi) % Nzi);
          G[q * vol + (tzw * N + u32(ty)) * N + u32(tx)] = fp[q];
        }
      }
    }
  }
  sh[lid] = s;
  sh[64u + lid] = cnt;
  sh[128u + lid] = 0.0;
  sh[192u + lid] = 0.0;
  wg_reduce4(lid);
  if (lid == 0u) { part[wl * 2u] = sh[0]; part[wl * 2u + 1u] = sh[64]; }
}

// ---------------------------------------------------------------- cut links of the body
@compute @workgroup_size(64)
fn links(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
         @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let Nz = P.v0.y;
  let vol = N * N * Nz;
  let B = P.v2.x;
  let wl = wglin(wid, nwg);
  let t = wl * 64u + lid;
  var Fx = 0.0; var Fy = 0.0; var Tz = 0.0; var dM = 0.0;
  if (t < B * B * Nz) {
    let k = t % Nz;
    let nb = t / Nz;
    let b = body[u32(ctl[0])];
    let jb = nb / B;
    let ib = nb % B;
    let j = i32(floor(b.y - P.v1.y)) - 2 + i32(jb);
    let i = i32(floor(b.x - P.v1.y)) - 2 + i32(ib);
    let Ni = i32(N);
    let Nzi = i32(Nz);
    if (j >= 0 && j < Ni && i >= 0 && i < Ni && !is_solid_now(mask[u32(j) * N + u32(i)])) {
      let dx = f32(i) + 0.5 - b.x;
      let dy = f32(j) + 0.5 - b.y;
      let R = P.v1.y;
      let nn = (k * N + u32(j)) * N + u32(i);
      for (var q = 1u; q < 19u; q++) {
        let cx = CX[q]; let cy = CY[q]; let cz = CZ[q];
        let a = f32(cx * cx + cy * cy);
        if (a == 0.0) { continue; }
        let ni = i + cx; let nj = j + cy;
        if (ni < 0 || ni >= Ni || nj < 0 || nj >= Ni) { continue; }
        if (!is_solid_now(mask[u32(nj) * N + u32(ni)])) { continue; }
        let kz = i32(k) + cz;
        if (P.v0.z == 1u && (kz < 0 || kz >= Nzi)) { continue; }   // that link is a z-wall
        let qb = OPP[q];
        let bq = dx * f32(cx) + dy * f32(cy);
        let disc = max(bq * bq - a * (dx * dx + dy * dy - R * R), 0.0);
        let sc = clamp((-bq - sqrt(disc)) / a, 0.0, 1.0);
        let xw = f32(i) + 0.5 + sc * f32(cx);
        let yw = f32(j) + 0.5 + sc * f32(cy);
        let ub = body_u(b.x, b.y, yw);
        let vb = body_v(b.x, b.y, xw);
        let gw = -6.0 * WQ[q] * (f32(cx) * ub + f32(cy) * vb);
        let base = ((jb * B + ib) * Nz + k) * 19u;
        let fq = FPL[base + q];
        let fqb = FPL[base + qb];
        let i2 = i - cx; let j2 = j - cy; let k2 = i32(k) - cz;
        var ok = i2 >= 0 && i2 < Ni && j2 >= 0 && j2 < Ni;
        if (ok) { ok = !is_solid_now(mask[u32(j2) * N + u32(i2)]); }
        if (ok && P.v0.z == 1u) { ok = k2 >= 0 && k2 < Nzi; }
        var f2 = fq;
        if (ok) { f2 = G[q * vol + nn]; }
        var nw: f32;
        if (sc < 0.5) { nw = 2.0 * sc * fq + (1.0 - 2.0 * sc) * f2 + gw; }
        else { nw = (fq + (2.0 * sc - 1.0) * fqb + gw) / (2.0 * sc); }
        G[qb * vol + nn] = nw;
        let Px = (f32(cx) - ub) * fq + (f32(cx) + ub) * nw;
        let Py = (f32(cy) - vb) * fq + (f32(cy) + vb) * nw;
        Fx += Px; Fy += Py;
        Tz += (xw - b.x) * Py - (yw - b.y) * Px;
        dM += nw - fq;
      }
    }
  }
  sh[lid] = Fx;
  sh[64u + lid] = Fy;
  sh[128u + lid] = Tz;
  sh[192u + lid] = dM;
  wg_reduce4(lid);
  if (lid == 0u) {
    let o = 2u * P.v2.z + wl * 4u;
    part[o] = sh[0]; part[o + 1u] = sh[64]; part[o + 2u] = sh[128]; part[o + 3u] = sh[192];
  }
}

// ---------------------------------------------------------------- reduce the partial sums (one workgroup)
@compute @workgroup_size(256)
fn reduce(@builtin(local_invocation_index) lid: u32) {
  var S = 0.0; var cnt = 0.0; var Fx = 0.0; var Fy = 0.0; var Tz = 0.0; var dM = 0.0;
  for (var w = lid; w < P.v2.z; w += 256u) { S += part[w * 2u]; cnt += part[w * 2u + 1u]; }
  for (var w = lid; w < P.v2.w; w += 256u) {
    let o = 2u * P.v2.z + w * 4u;
    Fx += part[o]; Fy += part[o + 1u]; Tz += part[o + 2u]; dM += part[o + 3u];
  }
  sh2[lid] = S; sh2[256u + lid] = cnt; sh2[512u + lid] = Fx; sh2[768u + lid] = Fy; sh2[1024u + lid] = Tz;
  sh2[1280u + lid] = dM;
  for (var s = 128u; s > 0u; s = s >> 1u) {
    workgroupBarrier();
    if (lid < s) {
      for (var c = 0u; c < 6u; c++) { sh2[c * 256u + lid] += sh2[c * 256u + lid + s]; }
    }
  }
  workgroupBarrier();
  if (lid == 0u) {
    let nf = sh2[256];
    var delta = 0.0;
    if (P.v2.y == 1u) { delta = -(sh2[0] + sh2[1280]) / nf; }
    ctl[1] = delta;
    ctl[2] = sh2[512]; ctl[3] = sh2[768]; ctl[4] = sh2[1024]; ctl[5] = sh2[1280]; ctl[6] = sh2[0];
    ctl[0] = ctl[0] + 1.0;
  }
}

// ---------------------------------------------------------------- mass correction: f_0 += delta on the fluid nodes
@compute @workgroup_size(64)
fn massadd(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
           @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let n = wglin(wid, nwg) * 64u + lid;
  if (n >= N * N * P.v0.y) { return; }
  if (!is_solid_now(mask[n % (N * N)])) { G[n] = G[n] + ctl[1]; }
}

// ---------------------------------------------------------------- output: velocity and fluid mass
@compute @workgroup_size(64)
fn velocity(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
            @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let vol = N * N * P.v0.y;
  let n = wglin(wid, nwg) * 64u + lid;
  if (n >= vol) { return; }
  var rho = 0.0; var mx = 0.0; var my = 0.0; var mz = 0.0;
  for (var q = 0u; q < 19u; q++) {
    let v = F[q * vol + n];
    rho += v; mx += f32(CX[q]) * v; my += f32(CY[q]) * v; mz += f32(CZ[q]) * v;
  }
  let sc = P.v3.x / rho;
  VEL[n] = mx * sc; VEL[vol + n] = my * sc; VEL[2u * vol + n] = mz * sc;
}

// partial sums of (rho - 1) and of the fluid-node count over the whole state (zone after the step partials)
@compute @workgroup_size(64)
fn massdiag(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>,
            @builtin(num_workgroups) nwg: vec3<u32>) {
  let N = P.v0.x;
  let vol = N * N * P.v0.y;
  let wl = wglin(wid, nwg);
  let n = wl * 64u + lid;
  var s = 0.0; var cnt = 0.0;
  if (n < vol && !is_solid_now(mask[n % (N * N)])) {
    var rho = 0.0;
    for (var q = 0u; q < 19u; q++) { rho += F[q * vol + n]; }
    s = rho - 1.0;
    cnt = 1.0;
  }
  sh[lid] = s; sh[64u + lid] = cnt; sh[128u + lid] = 0.0; sh[192u + lid] = 0.0;
  wg_reduce4(lid);
  if (lid == 0u) {
    let o = 2u * P.v2.z + 4u * P.v2.w + wl * 2u;
    part[o] = sh[0]; part[o + 1u] = sh[64];
  }
}
