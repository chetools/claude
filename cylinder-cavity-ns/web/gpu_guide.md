## Why this problem suits a GPU

The companion page on [packed-bed hot spots](../packed-bed-runaway/) explains why WebGPU would *not* help
there. That solver marches along the bed, one small, strictly sequential implicit step after another, each
with a few dozen unknowns. This flow is the opposite case:

- **Lots of independent work per step.** At $N = 512$ every step updates 525 000 $u$ values,
  525 000 $v$ values and 262 000 pressures. Each update reads only its neighbours, so all of them can run at once.
- **Explicit stencils.** Momentum, penalisation, divergence and projection are each one pass over the grid with a
  small, fixed stencil and no linear solve. That is the access pattern GPUs are built for.
- **A parallel pressure solver.** Red–black Gauss–Seidel updates all cells of one colour simultaneously, and
  restriction and interpolation are stencils too, so multigrid maps onto a sequence of dispatches.
- **Memory bandwidth decides the speed.** A step does little arithmetic per value but reads and writes the grid
  many times. A GPU has several times the memory bandwidth of a CPU and thousands of threads to hide latency;
  JavaScript runs on one core.

The Validation tab measures both speeds on your machine.

## The anatomy of one time step

Every kernel in `shaders.wgsl` is a `@compute` entry point. It runs one invocation (thread) per grid
point, in workgroups of $16\times16$:

| dispatch | threads | reads | writes |
|---|---|---|---|
| `momentum` | $(N+1)^2$ | `u v ru rv` | `us vs ru rv` |
| `penalise` | $(N+1)^2$ | `us vs`, state | `u v` |
| `divergence` | $N^2$ | `u v` | `rhs` |
| V-cycle × 2 | 11 dispatches per grid level | `q rhs` + coarse levels | `q` |
| `project` | $(N+1)^2$ | `q` | `u v` |
| `advect_dye` | $N^2$ | `u v dye` | `dye'` (ping-pong) |
| `record_probe`, `advance` | 1 | | probe ring, clock |

At $N = 256$ (7 grid levels) one step is about 140 dispatches. A frame records many steps into **one compute pass** and submits it once.
WebGPU guarantees that each dispatch sees the writes of the previous one, so no explicit synchronisation is
needed. The CPU never waits for the GPU while stepping, because the clock, the body angle and the
Adams–Bashforth history live in a small `State` buffer on the GPU. The `advance` kernel updates them after
each step. The CPU reads results back only for the charts, a few times per second, through `mapAsync`.

## Reading WGSL as a Python programmer

```wgsl
@compute @workgroup_size(16, 16)
fn divergence(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = i32(g.x); let j = i32(g.y); let n = P.n;
  if (i >= n || j >= n) { return; }
  let k = j * (n + 1) + i;
  rhs[j * n + i] = (u[k + 1] - u[k] + v[(j + 1) * n + i] - v[j * n + i]) / P.h;
}
```

This is the body of the numpy one-liner

```python
rhs = (u[:, 1:] - u[:, :-1] + v[1:, :] - v[:-1, :]) / h
```

written for **one** element. The GPU runs it for every `(i, j)` at once. The rules are:

- `g` is the thread's global index, so `(g.x, g.y)` plays the role of the array index.
- Buffers are flat 1D arrays, so `u[j, i]` becomes `u[j * (N+1) + i]`.
- Threads outside the grid return immediately (`if (i >= n ...) { return; }`), because whole workgroups are launched.
- `let` is an immutable local and `var` a mutable one. Types are explicit: `f32` is single precision.

The ghost-value functions `U(i, j)` and `V(i, j)` replace `np.pad`. They fold an out-of-range index back into the
box and flip the sign, exactly as `pad_u` and `pad_v` do.

## Reductions

Energy, enstrophy, torque and the maxima need a sum or maximum over the whole grid. The `stats` kernel does a
**tree reduction in workgroup shared memory**:
1. each of the 256 threads writes its value to `var<workgroup> red`;
2. at every halving step, threads `0..s-1` combine element `li` with `li + s`;
3. `workgroupBarrier()` makes sure all of the step's writes are visible before the next step.

The first thread writes the workgroup's result to `partials`. The CPU adds up the $(N/16)^2$ partial results
after `mapAsync`.

## Single precision

GPUs compute in `f32` (about 7 significant digits); numpy and the JavaScript fallback use `f64`. After 100 steps
of the self-test case the GPU velocities differ from numpy by about $10^{-3}$ relative to the largest velocity.
That is round-off, amplified by the pressure solver; the Validation tab shows it. In the chaotic regime two runs that differ by round-off decorrelate after a while: this is the
butterfly effect, not a bug. Statistics such as the mean energy are expected to agree.

## Rendering

After stepping, the `field` kernel writes the selected scalar (vorticity, speed, pressure or dye) at cell
centres. The fragment shader in `render.wgsl` runs once per screen pixel: it interpolates that buffer
bilinearly, applies the colour map, and draws the cylinder with its spin marker analytically. The field
never leaves GPU memory.

## Fallback

Browsers without WebGPU run `cpu.js`, a line-by-line JavaScript port in double precision, on a $64^2$ or
$128^2$ grid. It agrees with numpy to round-off (about $10^{-14}$), which the Validation tab checks too.
