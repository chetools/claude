# sweep: fast multicore CPU LBM for Reynolds-number sweeps

Development / research tool. Not used by the page. Needs `pip install numba`.

* `lbm_fast.py` : numba port of `../lbm3d.py` (D3Q19; bgk / reg / mrt; halfway bounce-back walls;
  Bouzidi moving cylinder with the q-dependent moving-wall term; refill; Wen momentum exchange;
  seed; mass correction). `step_fast(s, p)` has the contract of `lbm3d.step`, and
  `make_params` / `init_state` are the reference's own.
* `test_lbm_fast.py` : parity with `lbm3d` (`pytest -q sweep/test_lbm_fast.py`, about 40 s).
* `run_sweep.py` : resumable batch runner (below).

## How it is built
One fused pass per step (`_collide_stream_kernel`) works on x-rows: moments, collision, then the
post-collision populations are pushed to their neighbours, reflected at the walls. A second kernel
treats all cut links of the cylinder (interpolated bounce-back + force/torque); a small third one adds
the mass correction. The mass of the fluid nodes is followed through the step instead of summed in an
extra pass. Body geometry (solid mask, links) is rebuilt in numba only when the cylinder moves.
Same operations as `lbm3d.step`, so results agree to round-off (about 1e-15, test limit 1e-11).

Porting a new correction from `lbm3d.step`: add the kernel call at the marked place in `step_fast`
(after the body links, before the solid nodes are reset) and read its switch from `p`.
Currently ported: everything in `lbm3d.step`, including `mass_correction` (switch `p["mass_fix"]`).

`lbm_fast.py` sets `OMP_WAIT_POLICY=PASSIVE` (unless already set): with the default spin-waiting a
shared machine ran 6x slower. Limit the threads with `--threads` or `NUMBA_NUM_THREADS`.
Not supported: periodic x / y boxes (`wall_x=False`); N need not be a power of two in the kernels,
but `make_params` insists on it.

## Run a sweep
```
python run_sweep.py cases.json                 # foreground
python run_sweep.py cases.json --background    # detached; log in results/progress.log, results/sweep.out
python run_sweep.py cases.json --list          # done / pending
```
Options: `--out DIR` (default `sweep/results`), `--threads N`, `--volume` (save the full final velocity
as float32 `.npy`; off by default, it is `3*Nz*N*N*4` bytes), `--retry-failed`.

`cases.json`: a list of cases, or `{"defaults": {...}, "cases": [...]}`:
```json
{"defaults": {"N": 96, "Nz": 32, "Us": 1.0, "Uo": 0.0, "ro": 0.2, "span": "periodic", "seed": 1e-3, "t_end": 20},
 "cases": [{"Re": 400}, {"Re": 800}, {"Re": 1600, "name": "re1600_walls", "span": "walls"}]}
```
Keys: `N Nz Re Us Uo ro span seed t_end` (`t_end` required), optional `R u_lb collision mass_fix
every_t` (series spacing, default 0.05) `n_snap` (default 4) `volume max_wall name`. A typo is an error.

Per case in the results directory: `<name>.json` (params, series, timing, status, written last: its
existence marks the case as done, so an interrupted case is simply re-run), `<name>.npz` (snapshots:
`t_snap`, `wz_xy` = omega_z in the mid z-plane, `w_xz` = w in the plane y = 1/2, float32), and
`<name>_u.npy` if requested. Series keys: `t E Z Ew E3d Ekz[kz=0..4] torque maxu_lb mass`
(`Ekz` is null for `span: walls`; `maxu_lb` is the largest lattice speed |u|). `status` is
`finished`, `diverged` (non-finite or max |u_lb| > 0.5; the run stops there) or `timeout` (`max_wall`).
Diverged cases count as done unless `--retry-failed`.

`results/` is not committed-sized data: it holds only small files unless `--volume` is used.
