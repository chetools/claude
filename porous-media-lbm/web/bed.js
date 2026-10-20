// Bed geometry and relaxation rates: a line-by-line port of the matching
// functions in python/lbm.py (same PRNG, same order of random draws, same
// floating-point operations), so a seed gives the same bed everywhere.
'use strict';

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Disk list [[x, y, d], ...]; see lbm.place_disks. */
function placeDisks(nx, ny, porosity, D, layout = 'random', spread = 0, gap = 2, seed = 1, walls = false, maxFail = 4000) {
  const y0 = walls ? 1 : 0, y1 = walls ? ny - 1 : ny;
  const area = nx * (y1 - y0);
  if (layout === 'empty') return [];
  if (layout === 'square' || layout === 'staggered') {
    const a = D * Math.sqrt(Math.PI / (4 * (1 - porosity)));
    const ncol = Math.max(1, Math.round(nx / a));
    let nrow = Math.max(1, Math.round((y1 - y0) / a));
    if (layout === 'staggered' && nrow % 2) nrow += 1;
    const ax = nx / ncol, ay = (y1 - y0) / nrow;
    const d = Math.sqrt(4 * (1 - porosity) * ax * ay / Math.PI);
    const out = [];
    for (let j = 0; j < nrow; j++) {
      const shift = (layout === 'staggered' && j % 2) ? 0.5 * ax : 0;
      for (let i = 0; i < ncol; i++) out.push([(i + 0.5) * ax + shift, y0 + (j + 0.5) * ay, d]);
    }
    return out;
  }
  const rnd = mulberry32(seed);
  const target = (1 - porosity) * area;
  const disks = [];
  let solid = 0, fails = 0;
  while (solid < target && fails < maxFail) {
    const d = D * (1 + spread * (2 * rnd() - 1));
    const r = 0.5 * d;
    const x = rnd() * nx;
    let y;
    if (walls) {
      const lo = y0 + r + gap, hi = y1 - r - gap;
      if (hi <= lo) break;
      y = lo + rnd() * (hi - lo);
    } else {
      y = rnd() * ny;
    }
    let ok = true;
    for (const [xo, yo, dO] of disks) {
      let dx = x - xo;
      if (dx > nx / 2) dx -= nx; else if (dx < -nx / 2) dx += nx;
      let dy = y - yo;
      if (!walls) { if (dy > ny / 2) dy -= ny; else if (dy < -ny / 2) dy += ny; }
      const lim = r + 0.5 * dO + gap;
      if (dx * dx + dy * dy < lim * lim) { ok = false; break; }
    }
    if (ok) { disks.push([x, y, d]); solid += Math.PI * r * r; fails = 0; } else { fails += 1; }
  }
  return disks;
}

/** Uint32 solid mask, row-major [y * nx + x]; see lbm.rasterize. */
function rasterize(nx, ny, disks, walls = false) {
  const s = new Uint32Array(nx * ny);
  for (const [cx, cy, d] of disks) {
    const r = 0.5 * d;
    // visit a bounding box (wrapped), but compute dx, dy exactly as numpy does
    const xa = Math.floor(cx - r) - 1, xb = Math.ceil(cx + r) + 1;
    const ya = Math.floor(cy - r) - 1, yb = Math.ceil(cy + r) + 1;
    for (let yy = ya; yy <= yb; yy++) {
      const j = ((yy % ny) + ny) % ny;
      let dy = (j + 0.5) - cy;
      if (dy > ny / 2) dy -= ny; else if (dy < -ny / 2) dy += ny;
      for (let xx = xa; xx <= xb; xx++) {
        const i = ((xx % nx) + nx) % nx;
        let dx = (i + 0.5) - cx;
        if (dx > nx / 2) dx -= nx; else if (dx < -nx / 2) dx += nx;
        if (dy * dy + dx * dx < r * r) s[j * nx + i] = 1;
      }
    }
  }
  if (walls) for (let i = 0; i < nx; i++) { s[i] = 1; s[(ny - 1) * nx + i] = 1; }
  return s;
}

function porosityOf(solid, nx, ny, walls = false) {
  let n = 0, tot = 0;
  for (let j = walls ? 1 : 0; j < (walls ? ny - 1 : ny); j++) {
    for (let i = 0; i < nx; i++) { tot++; if (solid[j * nx + i]) n++; }
  }
  return 1 - n / tot;
}

function specificSurface(disks) {
  if (!disks.length) return 0;
  let p = 0, a = 0;
  for (const [, , d] of disks) { p += Math.PI * d; a += Math.PI * d * d / 4; }
  return p / a;
}

const CS2 = 1 / 3;
const viscosity = (tau) => CS2 * (tau - 0.5);
/** TRT rates for the flow; magic = null gives BGK.  See lbm.trt_rates. */
function trtRates(tau, magic = 3 / 16) {
  const wp = 1 / tau;
  if (magic === null) return [wp, wp];
  return [wp, 1 / (0.5 + magic / (tau - 0.5))];
}
/** TRT rates for D2Q5 advection-diffusion.  See lbm.tracer_rates. */
function tracerRates(D, magic = 0.25) {
  const wm = 1 / (0.5 + D / CS2);
  return [1 / (0.5 + magic / (1 / wm - 0.5)), wm];
}

if (typeof module !== 'undefined') {
  module.exports = {mulberry32, placeDisks, rasterize, porosityOf, specificSurface, viscosity, trtRates, tracerRates, CS2};
}
