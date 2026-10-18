## WGSL for Python readers

The GPU code is written in **WGSL**, the WebGPU Shading Language. It looks like a cross between Rust and C. This guide
maps `lbm.wgsl` onto the numpy code in `lbm.py`, which has the same structure and function names.

### One thread per cell instead of one array operation

numpy works on whole arrays: `np.roll(f[i], shift)` moves every population at once. A GPU **kernel** does the opposite.
It is a function written for *one* cell, and the GPU runs it for all cells in parallel, thousands at a time:

```wgsl
@compute @workgroup_size(128)
fn flow_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;                 // which cell am I?
  if (idx >= P.n) { return; }      // the last workgroup may overhang the grid
  let x = i32(idx % P.nx);
  let y = i32(idx / P.nx);
  ...
}
```

- `@compute` marks a compute kernel.
- `@workgroup_size(128)` says that threads come in groups of 128. They are scheduled together and could share fast memory.
- JavaScript launches the kernel with `dispatchWorkgroups(ceil(n / 128))`, which runs one thread per cell.
- `gid` is the thread's global index, the GPU equivalent of a loop counter.

### Streaming: `np.roll` becomes a neighbour read

numpy:

```python
src = np.roll(fpost[i], (C[i, 1], C[i, 0]), axis=(0, 1))
from_solid = np.roll(solid, (C[i, 1], C[i, 0]), axis=(0, 1))
f[i] = np.where(from_solid, fpost[OPP[i]], src)
```

WGSL, for one cell:

```wgsl
let sx = (x - CX[i] + nx) % nx;          // upwind neighbour, periodic
let sy = (y - CY[i] + ny) % ny;
let s = u32(sy * nx + sx);
if (solid[s] != 0u) { f[i] = fin[OPP[i] * n + idx]; } else { f[i] = fin[i * n + s]; }
```

This is the **pull** form: every cell *reads* from its neighbours and *writes* only its own memory. If cells pushed their
populations to neighbours instead, two threads could write the same address. Pulling makes the threads independent,
which is all a GPU asks for.

### Buffers: flat arrays, structure of arrays

There are no 3D arrays in WGSL. Each field is a flat `array<f32>` in a GPU **storage buffer**, and population `i` of cell
`idx` lives at `f[i * n + idx]`. In numpy terms that is `f.reshape(9, n)`, the same `[direction, cell]` order as `lbm.py`.
Adjacent threads (adjacent cells) then read adjacent addresses, which the memory system can serve in one transaction.

```wgsl
@group(0) @binding(1) var<storage, read> fin: array<f32>;          // post-collision, step t
@group(0) @binding(2) var<storage, read_write> fout: array<f32>;   // post-collision, step t+1
```

`fin` and `fout` swap roles every step ("ping-pong"). JavaScript keeps two **bind groups**, one per direction, and
alternates between them. The `@group/@binding` numbers tie each variable to a buffer that JavaScript attaches.

### Types are explicit

- `f32` is a 32-bit float (numpy `float32`), `i32` and `u32` are 32-bit signed and unsigned integers, and `vec4<f32>`
  is four floats.
- There are no implicit conversions, so mixing integers and floats needs `f32(CX[i])`.
- `let` is an immutable value; `var` is a mutable variable.
- Fixed-size arrays such as `var f: array<f32, 9>` live in registers, like nine scalar variables.

The GPU computes in float32, numpy in float64. So that 32 bits are enough, the flow populations are stored as
deviations from rest, $h_i = f_i - w_i$ (Theory §5). The *GPU vs Python* tab measures the difference.

### Uniforms: the parameters

Scalars that are the same for every cell (grid size, relaxation rates, body force, pulse window) are packed into one
small **uniform** buffer, a struct:

```wgsl
struct Params { nx: u32, ny: u32, n: u32, pulse_t0: u32, ...
                wp: f32, wm: f32, gx: f32, gy: f32, ... };
@group(0) @binding(0) var<uniform> P: Params;
```

JavaScript writes those 64 bytes with `queue.writeBuffer` whenever a sidebar value changes.

### Reductions: summing on the GPU

Darcy's law needs $U_s$, the sum of $u_x$ over all cells. Reading half a million floats back to JavaScript every frame
would be slow, so the `reduce` kernel sums them on the GPU.
1. Each workgroup of 256 threads loads 256 cells into **workgroup memory** (`var<workgroup> sh`), which is fast,
   on-chip and shared by the group.
2. The group halves the problem eight times, with a `workgroupBarrier()` between steps so that every thread sees the others' writes.
3. Thread 0 writes the group's partial sum.

Only these few thousand partial sums are copied back and added up in JavaScript. A `detect` kernel similarly sums
$u_x c$ and $u_x$ down the three detector columns.

### Recording many steps at once

JavaScript does not call the GPU once per kernel. It records a **command buffer**: for each step, `flow_step`, then
`tracer_step`, then a one-thread `tick` that advances the step counter used for the inlet pulse. The page records dozens
to hundreds of steps per frame and submits them in one go. WebGPU guarantees that each dispatch sees the previous one's
writes, so the steps run in order without any synchronisation code.

### Drawing without copying

The canvas is drawn by a **fragment shader** (`render.wgsl`), a function that runs once per pixel. With one pixel per
cell, it reads the velocity buffer that the compute kernels just wrote and maps it through a colour map. The data never
leaves the GPU.
