// Prints a small run of the page's CPU solver as JSON, for python/test_lbm.py
// (test_javascript_solver_matches_numpy).
'use strict';
const {placeDisks, rasterize, trtRates, tracerRates} = require('./bed.js');
const {CpuLbm} = require('./cpu.js');

const params = {nx: 48, ny: 24, porosity: 0.65, D: 8, seed: 11, gap: 1.5, tau: 0.9, g: 2e-5,
  steps: 300, Dm: 0.02, pulse: 15, tsteps: 200};
const p = params;
const solid = rasterize(p.nx, p.ny, placeDisks(p.nx, p.ny, p.porosity, p.D, 'random', 0, p.gap, p.seed));
const sim = new CpuLbm(p.nx, p.ny, solid);
const [wp, wm] = trtRates(p.tau);
const [twp, twm] = tracerRates(p.Dm);
sim.setParams({wp, wm, gx: p.g, gy: 0, twp, twm, cIn: 1});
sim.step(p.steps, {tracer: false});
const ux = Array.from({length: p.nx * p.ny}, (_, k) => sim.fields[4 * k]);
sim.inject(p.pulse);
sim.step(p.tsteps, {flow: false});
const c = Array.from({length: p.nx * p.ny}, (_, k) => sim.fields[4 * k + 3]);
process.stdout.write(JSON.stringify({params, solid: Array.from(solid), ux, c}));
