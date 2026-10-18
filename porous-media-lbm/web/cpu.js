// The same lattice-Boltzmann step as web/lbm.wgsl, in plain JavaScript on
// Float32Arrays, one cell after another.  Used when the browser has no WebGPU,
// as the CPU contestant in the speed race, and to cross-check the GPU.
'use strict';

const LCX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const LCY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const LW = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const LOPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
const LW5 = [1 / 3, 1 / 6, 1 / 6, 1 / 6, 1 / 6];

class CpuLbm {
  constructor(nx, ny, solid) {
    this.kind = 'cpu';
    this.nx = nx; this.ny = ny; this.n = nx * ny;
    const n = this.n;
    this.fA = new Float32Array(9 * n); this.fB = new Float32Array(9 * n);
    this.gA = new Float32Array(5 * n); this.gB = new Float32Array(5 * n);
    this.fields = new Float32Array(4 * n);       // (ux, uy, rho, c) per cell
    this.solid = new Uint32Array(n);
    this.clock = 0;
    this.p = {wp: 1, wm: 1, gx: 0, gy: 0, twp: 1, twm: 1, cIn: 1, pulse0: 0, pulse1: 0, det: [0, 0, 0]};
    this.setSolid(solid);
    this.resetFlow();
  }

  setParams(p) { Object.assign(this.p, p); }
  setSolid(solid) { this.solid.set(solid); }

  resetFlow() {
    const n = this.n;
    this.fA.fill(0); this.fB.fill(0);              // h_i = f_i - w_i = 0: fluid at rest
    for (let k = 0; k < n; k++) { this.fields[4 * k] = 0; this.fields[4 * k + 1] = 0; this.fields[4 * k + 2] = 1; }
    this.clock = 0;
    this.resetTracer();
  }

  resetTracer() {
    this.gA.fill(0); this.gB.fill(0);
    for (let k = 0; k < this.n; k++) this.fields[4 * k + 3] = 0;
    this.p.pulse0 = this.p.pulse1 = 0;
  }

  /** Start a square inlet pulse of `steps` steps now. */
  inject(steps) { this.resetTracer(); this.p.pulse0 = this.clock; this.p.pulse1 = this.clock + steps; }

  step(count, opt = {}) {
    const flow = opt.flow !== false, tracer = opt.tracer !== false;
    for (let s = 0; s < count; s++) {
      if (flow) { this.flowStep(this.fA, this.fB); [this.fA, this.fB] = [this.fB, this.fA]; }
      if (tracer) { this.tracerStep(this.gA, this.gB); [this.gA, this.gB] = [this.gB, this.gA]; }
      this.clock++;
    }
  }

  // Populations are stored as h_i = f_i - w_i, exactly as on the GPU.
  flowStep(fin, fout) {
    const {nx, ny, n, solid, fields} = this;
    const {wp, wm, gx, gy} = this.p;
    const f = new Float32Array(9);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const idx = y * nx + x;
        if (solid[idx]) {
          for (let i = 0; i < 9; i++) fout[i * n + idx] = 0;
          fields[4 * idx] = 0; fields[4 * idx + 1] = 0; fields[4 * idx + 2] = 1;
          continue;
        }
        for (let i = 0; i < 9; i++) {                 // stream_pull with bounce-back
          const sx = (x - LCX[i] + nx) % nx, sy = (y - LCY[i] + ny) % ny;
          const s = sy * nx + sx;
          f[i] = solid[s] ? fin[LOPP[i] * n + idx] : fin[i * n + s];
        }
        let drho = 0;
        for (let i = 0; i < 9; i++) drho += f[i];
        const rho = 1 + drho;
        const ux = (f[1] - f[3] + f[5] - f[6] - f[7] + f[8] + 0.5 * gx) / rho;
        const uy = (f[2] - f[4] + f[5] + f[6] - f[7] - f[8] + 0.5 * gy) / rho;
        const usq = ux * ux + uy * uy, uF = ux * gx + uy * gy;
        for (let i = 0; i < 9; i++) {                 // collide_trt with Guo forcing
          const o = LOPP[i];
          const cu = LCX[i] * ux + LCY[i] * uy, co = -cu;
          const cF = LCX[i] * gx + LCY[i] * gy;
          const ei = LW[i] * (drho + rho * (3 * cu + 4.5 * cu * cu - 1.5 * usq));
          const eo = LW[o] * (drho + rho * (3 * co + 4.5 * co * co - 1.5 * usq));
          const sp = LW[i] * (9 * cu * cF - 3 * uF), sm = LW[i] * 3 * cF;
          fout[i * n + idx] = f[i] - wp * (0.5 * (f[i] + f[o]) - 0.5 * (ei + eo))
            - wm * (0.5 * (f[i] - f[o]) - 0.5 * (ei - eo)) + (1 - 0.5 * wp) * sp + (1 - 0.5 * wm) * sm;
        }
        fields[4 * idx] = ux; fields[4 * idx + 1] = uy; fields[4 * idx + 2] = rho;
      }
    }
  }

  tracerStep(gin, gout) {
    const {nx, ny, n, solid, fields} = this;
    const {twp, twm, cIn, pulse0, pulse1} = this.p;
    const g = new Float32Array(5);
    const c0 = (this.clock >= pulse0 && this.clock < pulse1) ? cIn : 0;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const idx = y * nx + x;
        if (solid[idx]) { for (let i = 0; i < 5; i++) gout[i * n + idx] = 0; fields[4 * idx + 3] = 0; continue; }
        const ux = fields[4 * idx], uy = fields[4 * idx + 1];
        if (x === 0) {
          for (let i = 0; i < 5; i++) gout[i * n + idx] = LW5[i] * c0 * (1 + 3 * (LCX[i] * ux + LCY[i] * uy));
          fields[4 * idx + 3] = c0;
          continue;
        }
        let c = 0;
        for (let i = 0; i < 5; i++) {
          const sx = Math.min(nx - 1, Math.max(0, x - LCX[i])), sy = (y - LCY[i] + ny) % ny;
          const s = sy * nx + sx;
          g[i] = solid[s] ? gin[LOPP[i] * n + idx] : gin[i * n + s];
          c += g[i];
        }
        for (let i = 0; i < 5; i++) {
          const o = LOPP[i];
          const cu = LCX[i] * ux + LCY[i] * uy;
          gout[i * n + idx] = g[i] - twp * (0.5 * (g[i] + g[o]) - LW5[i] * c) - twm * (0.5 * (g[i] - g[o]) - 3 * LW5[i] * c * cu);
        }
        fields[4 * idx + 3] = c;
      }
    }
  }

  /** Same quantities as the GPU's reduce + detect kernels. */
  async stats() {
    const {nx, ny, n, solid, fields} = this;
    let sumUx = 0, maxU = 0, mass = 0, sumC = 0, nFluid = 0;
    for (let k = 0; k < n; k++) {
      if (solid[k]) continue;
      nFluid++;
      const ux = fields[4 * k], uy = fields[4 * k + 1];
      sumUx += ux; mass += fields[4 * k + 2]; sumC += fields[4 * k + 3];
      maxU = Math.max(maxU, Math.hypot(ux, uy));
    }
    const det = this.p.det.map((col) => {
      let a = 0, b = 0, c = 0;
      for (let y = 0; y < ny; y++) {
        const k = y * nx + col;
        if (solid[k]) continue;
        a += fields[4 * k] * fields[4 * k + 3]; b += fields[4 * k]; c += fields[4 * k + 3];
      }
      return [a, b, c];
    });
    return {sumUx, maxU, mass, sumC, det, clock: this.clock, nFluid};
  }

  async readFields() { return this.fields.slice(); }

  /** Draw into a 2D canvas (one pixel per cell); same colour maps as render.wgsl. */
  render(canvas, mode, vmax) {
    const {nx, ny, solid, fields} = this;
    if (canvas.width !== nx || canvas.height !== ny) { canvas.width = nx; canvas.height = ny; }
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(nx, ny);
    const at = (x, y) => 4 * (((y + ny) % ny) * nx + ((x + nx) % nx));
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const k = y * nx + x, o = 4 * ((ny - 1 - y) * nx + x);
        let rgb;
        if (solid[k]) rgb = [0.36, 0.38, 0.44];
        else if (mode === 0) rgb = viridisRGB(Math.hypot(fields[4 * k], fields[4 * k + 1]) / vmax);
        else if (mode === 1) {
          const w = 0.5 * ((fields[at(x + 1, y) + 1] - fields[at(x - 1, y) + 1]) - (fields[at(x, y + 1)] - fields[at(x, y - 1)]));
          rgb = divergingRGB(w / vmax);
        } else if (mode === 2) rgb = viridisRGB(fields[4 * k + 3] / vmax);
        else rgb = divergingRGB((fields[4 * k + 2] - 1) / 3 / vmax);
        img.data[o] = 255 * rgb[0]; img.data[o + 1] = 255 * rgb[1]; img.data[o + 2] = 255 * rgb[2]; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  destroy() {}
}

function viridisRGB(t) {
  t = Math.min(1, Math.max(0, t));
  const c = [[0.2777273272, 0.0054073445, 0.3340998053], [0.1050930431, 1.4046134720, 1.3845901620],
    [-0.3308618287, 0.2148475595, 0.0950952280], [-4.6342304990, -5.7991009740, -19.3324409200],
    [6.2282699360, 14.1799333600, 56.6905526000], [4.7763849320, -13.7451453600, -65.3530326300],
    [-5.4354558530, 4.6458526150, 26.3124352500]];
  return [0, 1, 2].map((j) => Math.min(1, Math.max(0, c[0][j] + t * (c[1][j] + t * (c[2][j] + t * (c[3][j] + t * (c[4][j] + t * (c[5][j] + t * c[6][j]))))))));
}
function divergingRGB(t) {
  t = Math.min(1, Math.max(-1, t));
  const w = [0.97, 0.97, 0.97], e = t < 0 ? [0.23, 0.30, 0.75] : [0.71, 0.02, 0.15], a = Math.abs(t);
  return [0, 1, 2].map((j) => w[j] + (e[j] - w[j]) * a);
}

if (typeof module !== 'undefined') module.exports = {CpuLbm, viridisRGB, divergingRGB};
