## JavaScript and WGSL for Python readers

The Python files (`lbm3d.py`, `fv3d.py`, `diagnostics.py`) are the readable **reference**: the step-by-step
breakdown on the Python tab explains them. The page also contains the same algorithms in two other languages so that
it can run in your browser:

- **JavaScript on the CPU** (`lbm_cpu.js`, `fv_cpu.js`, `diagnostics.js`): the fallback when there is no WebGPU.
  Numbers are 64-bit floats, as in numpy.
- **WGSL on the GPU** (`lbm.wgsl`, `fv.wgsl`, and for pictures `render.wgsl`, `iso.wgsl`), driven by JavaScript
  (`lbm_gpu.js`, `fv_gpu.js`, `render.js`). WGSL is the shader language of WebGPU. Numbers are 32-bit floats.

The names were kept the same on purpose. If you understand a Python function you can find its twin below.

### Python, JavaScript and WGSL side by side

Lattice Boltzmann (one time step of `lbm3d.step`):

| What it does | Python (`lbm3d.py`) | JavaScript CPU (`lbm_cpu.js`) | WGSL kernel (`lbm.wgsl`) |
|---|---|---|---|
| inputs to numbers | `make_params` | `makeParams` | uniform buffer `P`, filled in `createGpuSolver` |
| start state with the seed | `init_state` | `initState` | uploaded once by `createGpuSolver` |
| cylinder position, solid nodes | `make_body`, `solid_mask` | `makeBody`, `solidMask` | `geometry` |
| refill uncovered nodes | `refill` | `P._refill` | `refill` |
| equilibrium | `equilibrium` | `equilibriumAt` | `feq` |
| collision | `collide` | `P._collide` | `collide_stream` (first half) |
| streaming and wall bounce-back | `stream`, `bounce_back_walls` | inside `P._step1` | `collide_stream` (second half) |
| cut links, Bouzidi, force and torque | `find_links`, `bounce_back_body` | inside `P._step1` | `links`, then `reduce` |
| mass correction | `mass_correction` | inside `P._step1` | `reduce`, then `massadd` |
| velocity for plots | `cell_velocity` | `P.velocity` | `velocity` |
| torque | `torque` | `P.torque` | `s.readTorque` (reads the sums that `reduce` left) |
| total mass | `mass` | `P.mass` | `massdiag`, `s.mass` |

Finite volumes (`fv3d.step`):

| What it does | Python (`fv3d.py`) | JavaScript CPU (`fv_cpu.js`) | WGSL kernel (`fv.wgsl`) |
|---|---|---|---|
| inputs to numbers | `make_params` | `makeParams` | uniform buffer `P` |
| the 3D seed | `seed_velocity`, `init_state` | `initState` | `init_seed` |
| limiter and face value | `minmod`, `face_value` | `minmod`, `faceValue` | `minmod`, `face_value` |
| advection and diffusion, then AB2 | `momentum_rhs`, `rhs_block`, `step` | `momentum`, `rhsBlock` | `momentum` (calls `rhs_u`, `rhs_v`, `rhs_w`) |
| the body mask | `body_mask_velocity` | `bodyMaskVelocity` | `body` |
| penalisation | `penalise` | `penalise` | `penalise` |
| divergence | `divergence` | `divergence` | `divergence` |
| red-black smoother | `smooth` | `smooth` | `mg_smooth` |
| residual | `laplacian` | (inside `vcycle`) | `mg_residual` |
| restrict, prolong | `restrict`, `prolong` | `restrict`, `prolongAdd` | `mg_restrict`, `mg_prolong` |
| coarsest grid | (inside `vcycle`) | (inside `vcycle`) | `mg_coarse` |
| V-cycle, pressure solve | `vcycle`, `solve_pressure` | `vcycle`, `solvePressure` | `GpuSolver.vcycle` in `fv_gpu.js` dispatches the `mg_*` kernels |
| subtract the pressure gradient | `project` | `project` | `project` |
| clock, previous step size | `step` | `stepOnce` | `advance` |
| velocity at cell centres | `cell_velocity` | `velocity` | `cell_velocity` |
| torque | `torque` | `torque` | `stats`, then `stats_final` stores it in the state buffer |

Diagnostics and pictures:

| What it does | Python (`diagnostics.py`) | JavaScript (`diagnostics.js`) | GPU (`render.wgsl`) |
|---|---|---|---|
| vorticity $\boldsymbol\omega$ | `vorticity` | `vorticity` | `cs_fields` (field 0 is $\lvert\boldsymbol\omega\rvert$, field 1 is $\omega_z$) |
| Q criterion | `q_criterion` | `q_criterion` | `cs_fields` (field 2) |
| energy, enstrophy | `energy`, `enstrophy` | `energy`, `enstrophy` | not on the GPU |
| $E_w$, $E_{3d}$, $E_{kz}$ | `spanwise_energy` | `spanwise_energy` | not on the GPU |
| horizontal spectrum | `spectrum_h` | `spectrum_h` | not on the GPU |
| one row of the history | `summary` | `summary` | not on the GPU |
| isosurface | none | none | `cs_mc`, `cs_args` in `iso.wgsl` |

Only the finite-volume and lattice Boltzmann solvers, and the two field computations of the pictures, run on the GPU. The
charts of $E$, $Z$, $E_w$, $E_{3d}$, spectra and torque are computed on the CPU in `diagnostics.js` from a velocity
array read back from the solver.

### What a compute shader is

A normal Python loop visits grid points one after the other:

```python
for k in range(Nz):
    for j in range(N):
        for i in range(N):
            rhs[k, j, i] = divergence_of_cell(u, v, w, k, j, i)
```

A **compute shader** is the body of that loop, written once, which the GPU runs for **every** `(i, j, k)` at the same time
(each copy is an *invocation*, or thread). Because every invocation does the same thing on a different index, the
kernels contain no loop over the grid; instead each thread asks "which point am I?" through a built-in index
(`global_invocation_id`, or `workgroup_id` and `local_invocation_index`).

- **Buffer.** A block of GPU memory holding a flat array of numbers, like a 1D numpy array. A 3D array
  `a[k, j, i]` is stored as `a[(k * N + j) * N + i]`, last index fastest (the same order as numpy's default). That is why the kernels
  index with expressions like `(k * P.n + j) * P.n + i`.
- **Workgroup.** Threads are launched in small teams. Each team has a size set in the shader, for example
  `@workgroup_size(64)` in `lbm.wgsl` or `@workgroup_size(8, 8, 4)` (256 threads) in `fv.wgsl`. Threads of one team can share fast
  memory (`var<workgroup>`) and wait for each other (`workgroupBarrier()`); threads of different teams cannot.
- **Dispatch.** The JavaScript call `pass.dispatchWorkgroups(nx, ny, nz)` launches that many teams. To cover
  $N^3$ points with 64-thread teams one launches $\lceil N^3/64\rceil$ teams, and the extra threads of the last team
  must stop early: every kernel starts with `if (n >= vol) { return; }`.
- **Order.** Dispatches inside one compute pass run in the order they were recorded and each one sees the memory
  writes of the previous one. A kernel therefore never starts before the previous kernel is complete. That is how the steps below are chained.
- **Reductions.** Adding up numbers (the torque, the total mass, the maximum of a field) needs cooperation. Each team sums its threads in
  workgroup memory and writes one partial sum into a buffer; one further kernel (`reduce`, `stats_final`) adds the partial sums.

### One lattice Boltzmann step on the GPU

`lbm.wgsl` has a header comment with the same list. Per time step, `lbm_gpu.js` records these dispatches (in `s.step`):

| dispatch | threads | what it replaces in `lbm3d.step` |
|---|---|---|
| `geometry` | one per $(i, j)$ of the plane | `make_body`, `solid_mask` |
| `refill` | one per node | `refill` |
| `collide_stream` | one per node | `collide`, `stream`, `bounce_back_walls` |
| `links` | one per node of a small box around the body | `find_links`, `bounce_back_body` |
| `reduce` | one team | sums the partial results of the two kernels above |
| `massadd` | one per node | `mass_correction` |

Differences from the Python order, in plain terms:

- **Fused kernel.** Python collides everything into a new array, then streams it. The kernel `collide_stream` collides a node and
  immediately *pushes* the 19 results to its neighbours' slots of a second buffer `G`, while the first buffer `F` is only read.
  A population leaving the box is written back to the opposite direction of the same node: that is the halfway bounce-back
  of `bounce_back_walls`. A push into the body is skipped, because that is a cut link and the `links` kernel fills it.
- **Two buffers.** Streaming reads `F` and writes `G`; the next step swaps their roles (`dir ^= 1` in `s.step` of `lbm_gpu.js`). Without two
  buffers a thread could overwrite a value another thread has not yet read, since all threads run at the same time.
- **Links.** The body occupies only a few dozen nodes in each plane, so `links` runs on a box of side `B` around the cylinder, and
  `collide_stream` saves the post-collision populations $f^*$ of those nodes in the buffer `FPL`.
  Each thread processes the cut links of one node and writes the Bouzidi populations and its contribution to the force and torque.
- **Partial sums.** Each team of `collide_stream` and `links` leaves partial sums of $\rho-1$ (mass) and of the momentum exchange;
  `reduce` adds them, converts the mass deficit to $\delta$ and stores the force, torque and $\delta$ in the control buffer `ctl`;
  `massadd` then adds $\delta$ to $f_0$ of every fluid node.
- **The body position** is computed on the CPU in 64-bit floats for every step of a batch and put in a small table (`body`); the
  kernels read row `ctl[0]`, which `reduce` advances by one. Up to `CHUNK = 128` steps are recorded into one submission.
- **Z-uniformity.** The kernels use identical arithmetic in every $z$-plane (the only $z$-dependent branches are the end-wall
  conditions), as the header comment of `lbm.wgsl` says, so a flow that is uniform in $z$ stays uniform.

### One finite-volume step on the GPU

`GpuSolver.step` in `fv_gpu.js` records, for each time step:

1. `momentum`: advection, diffusion and the AB2 predictor for $u$, $v$ and $w$ in one dispatch, written to a second set of arrays `FS` (the predictor);
2. `penalise`: the body mask, giving the penalised velocity (back into `F`);
3. `divergence`: the right-hand side `rhs` of the pressure equation;
4. `vcycles` V-cycles (default 2), each a *sequence of dispatches* made by `GpuSolver.vcycle`;
5. `project`: subtract the pressure gradient;
6. `advance`: one single-thread kernel that updates the clock, the previous step size, and the body angle.

**The V-cycle as dispatches.** `GpuSolver.vcycle(pass, l)` is recursive, like `fv3d.vcycle`, but instead of calling a function it
records kernels for grid level `l`:

- `mg_smooth` twice per sweep, once for each colour of the red-black pattern (`nu1` sweeps before, `nu2` after);
- `mg_residual`, then `mg_restrict` to the coarser level, then the same sequence on level `l + 1`;
- `mg_prolong` adds the interpolated coarse correction; and on the coarsest grid (4 x 4 columns) `mg_coarse`
  does all its sweeps in a single team of 256 threads, using barriers between the colours, and removes the mean.

Two details are worth knowing for reading the code:

- **Why the smoother is one thread per column.** The red-black colour is $i+j$ in every layer, as in the Python (see FV 7 of the Python tab).
  A cell and its $z$-neighbours therefore have the same colour and must all be updated from the *old* values (Jacobi in $z$),
  which is what numpy does. `mg_smooth` assigns one thread to an $(i, j)$ column and lets it walk up the $z$ layers while remembering the old
  value of the layer below (`smooth_column` in `fv.wgsl`).
- **Everything stays on the GPU.** The clock, the body angle and the Adams-Bashforth history live in a small `State` buffer. Because
  32-bit floats cannot accumulate the angle accurately, the CPU re-bases the angle every `STEPS_PER_PASS = 16` steps (comment in `fv_gpu.js`).
  The CPU reads the results back only for the charts.

### 32-bit and 64-bit numbers, and what the Validation tab compares

numpy and the JavaScript CPU solvers use 64-bit floats (about 16 significant digits; relative rounding $\approx2.2\times10^{-16}$). WebGPU shaders use
32-bit floats (about 7 digits; relative rounding $\approx1.2\times10^{-7}$). Two consequences:

- A GPU result is the same *algorithm* in lower precision: rounding differences grow over many steps. They are not an error in the algorithm.
- Some functions fail in 32 bits for large arguments (`tanh` can return NaN). The optional legacy `tanh` penalisation mask in `fv.wgsl` therefore clamps its argument to $[-20, 20]$ before calling `tanh`.

The Validation tab runs small test cases (listed in `python/selftest_lbm.py` and `python/selftest_fv.py`: $N=16$, $N_z=4$ and 1, periodic and walls, with spin and
orbit) with each solver and compares them with the numpy values embedded in the page at build time. The checks (`selftest` in the four solver files):

| check | how it is compared |
|---|---|
| torque, kinetic energy $E$, checksum | relative difference $\lvert\text{got}-\text{expected}\rvert/\lvert\text{expected}\rvert$ |
| fluid mass (lattice Boltzmann only) | relative difference |
| sampled velocities (fixed positions chosen in `selftest_lbm.py` and `selftest_fv.py`) | the **worst** absolute difference, relative to the largest sampled $\lvert u\rvert$ |

The tolerances as implemented are:

| solver | tolerance |
|---|---|
| JavaScript CPU (64-bit) against numpy | relative difference at most $10^{-12}$ |
| WebGPU (32-bit), lattice Boltzmann, against numpy | relative difference at most $2\times10^{-3}$ (`lbm_cpu.js`) |
| WebGPU (32-bit), finite volume, against numpy | relative difference at most $10^{-2}$ (`fv_cpu.js`) |

Each row of the table shows the tolerance next to the measured difference and a pass or FAIL. The button for the lattice Boltzmann against the finite-volume solver (`crossCase` in `app.js`) is different: it runs
one 2D case with both methods to about $t=2$ and prints the measured differences of $E$ and the torque with **no** pass/fail,
because the two methods are different discretisations of the same equations, and no tolerance has been derived for them.

### How the renderers compute $\lvert\boldsymbol\omega\rvert$ and $Q$

The pictures need a scalar at every cell; `render.wgsl` computes it from the velocity buffer (kernel `cs_fields`, one thread per cell):

1. It forms the $3\times3$ velocity gradient $g_{ab}=\partial u_a/\partial x_b$ with central differences, $(f_{i+1}-f_{i-1})/2h$, in all three directions.
2. At the box edge the missing neighbour is the **no-slip ghost value** $-(\text{edge value})$ (function `vg`), periodic $z$ wraps around.
   This is the same rule as `diagnostics.py`.
3. From $g$:
   - vorticity $\boldsymbol\omega=(g_{21}-g_{12},\;g_{02}-g_{20},\;g_{10}-g_{01})$ and its magnitude $\lvert\boldsymbol\omega\rvert$ (field 0) or the single component $\omega_z$ (field 1);
   - $Q=\tfrac12(\lVert\Omega\rVert^2-\lVert S\rVert^2)$ (field 2), with $S=\tfrac12(g+g^T)$ and $\Omega=\tfrac12(g-g^T)$, summing over all nine entries.
   Speed (field 3) and $w$ (field 4) are read directly from the velocity buffer.
4. Cells inside the cylinder are set to 0 (`in_body`), so the rigidly rotating interior does not dominate the colours.

**Colour range.** The largest value in a field can come from a single cell, which would make everything else look faint. The range is therefore
**robust**: `cs_max` finds the maximum of $\lvert v\rvert$ outside the body, `cs_hist` makes a histogram of $\sqrt{\lvert v\rvert/\max}$ (using atomic counters),
and `cs_range` returns the value below which a chosen percentile of the cells lies. That value is used as the colour limit.

**Isosurface.** `iso.wgsl` runs *marching cubes*: `cs_mc` has one thread per cell of eight nodes; it classifies the corners as above or below the
threshold, looks up which triangles the case needs, places the vertices by linear interpolation along the edges and
reserves space for them in a vertex buffer with an atomic counter; `cs_args` turns the counter into the draw call, so the
CPU never needs to know how many triangles there are. The threshold is `isoFrac` times the robust range (default 0.4, `render.js`). For periodic $z$
the cells at the wrap-around are drawn twice so the surface fills the box.

**On the CPU.** With no WebGPU, `render.js` draws only 2D slices, computing the field from the velocity array with `cpuField` and `fieldCell`.
The volume and isosurface views need the GPU.

### Flow particles (`tracers.js`, `trails.wgsl`)

The trails are massless tracers moved by each panel's computed velocity. The readable version is `tracers.js` (64-bit JavaScript);
`trails.wgsl` does the same on the GPU, one thread per particle.

1. **Velocity at a point** (`velAt`, WGSL `vel`): trilinear interpolation between the cell centres. Between the last centre and a wall
   the no-slip ghost value $-(\text{edge value})$ is used (the same `vg` rule as above), so the velocity is exactly zero on the walls.
   Periodic $z$ wraps around.
2. **Moving** (`advectOne`, WGSL `cs_advect`): each frame the particles are moved over the simulated time $\tau$ that the frame covered, with the
   velocity frozen at its current value. They use the midpoint rule (RK2) $\mathbf x \leftarrow \mathbf x + \Delta t\,\mathbf u(\mathbf x + \tfrac12\Delta t\,\mathbf u(\mathbf x))$,
   in `substeps` steps, enough that one step moves at most $h/2$ at the body's top speed (at most 32 steps).
3. **Re-seeding:** a particle that has lived its lifetime (2 to 4 time units), left the box or entered the cylinder starts again at a random point.
   The new path is not joined to the old one.
4. **Trails:** every particle keeps its last $K$ positions in a ring buffer (`K` from the *Trail length* slider, 4 to 64 points). The vertex shader
   `vs_trail` draws the last $K-1$ moves as lines, fading with age and stronger where the move was faster. On a slice it keeps only the particles within
   $2h$ of the plane. Storing positions, rather than painting into an image, keeps the trails correct when the 3D view is rotated.

The Validation tab checks `velAt` on a linear field (trilinear interpolation reproduces it exactly) and on the walls (exactly zero). It checks RK2
against the exact circle of a solid-body rotation (the error falls by 4 when the steps are halved). It compares `trails.wgsl` value by value with
`tracers.js` on the same 32-bit velocity field.

### What was not checked here

The function map above was built from the names in the files and every name was looked up with a text search. The statements about
tolerances are read from the code (`selftest` functions and the comments in `lbm_cpu.js`, `fv_cpu.js`). No timing or speed statement is made on
this page; the Validation tab can measure what your machine does.
