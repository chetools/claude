## Why the GPU is fast here

The companion page on [packed-bed hot spots](https://chetools.github.io/claude/packed-bed-runaway/) argued that a GPU would
*not* help with its problem, a stiff 1D/2D reactor model integrated along the bed. This page is the opposite case. Here is why.

### 1. The work is enormous and uniform

A 480 × 192 grid has 92,000 cells. Each step updates every cell's 9 flow and 5 tracer populations, and a pulse needs
tens of thousands of steps to cross the bed. That is $10^9$–$10^{10}$ cell updates for one RTD, all doing **exactly the
same arithmetic** on different data. GPUs are built for this: thousands of simple cores, each running the same
instruction on its own cell (SIMT, single instruction multiple threads).

The reactor model is the opposite. It has about 60 unknowns per axial step and a long chain of steps, each depending on the
previous one. There is nothing to spread over thousands of cores, and each step needs a small linear solve.

### 2. Every update is local

A cell's update needs only its own populations and those of its eight neighbours from the previous step. There are no
global linear systems. An incompressible Navier–Stokes solver, by contrast, must solve a Poisson equation for the
pressure every step, a global operation that needs many sweeps across the grid. In LBM the pressure is just $\rho c_s^2$,
known locally. With pull streaming and two buffers, threads never write to the same memory, so no locks or atomics are needed.

### 3. LBM is limited by memory bandwidth, and GPUs have plenty

Per cell and step the flow kernel reads 9 populations and writes 9 (72 bytes). It also checks the 9 neighbours' solid
flags and stores the velocity. With the tracer, the total is roughly **200 bytes moved for a few hundred flops**.
A modern processor can do far more arithmetic than that per byte it fetches, so the speed is set by memory bandwidth:

$$
\text{MLUPS}_{\max} \approx \frac{\text{bandwidth}}{\text{bytes per cell update}} .
$$

| Hardware | memory bandwidth | ceiling at ~200 B/update |
|---|---|---|
| One CPU core (one stream of loads) | ~10–20 GB/s | ~50–100 MLUPS |
| Laptop integrated GPU (shared DDR/LPDDR) | ~50–100 GB/s | ~250–500 MLUPS |
| Desktop GPU (GDDR6/6X) | 400–1000 GB/s | ~2000–5000 MLUPS |
| Data-centre GPU (HBM) | 2000–3000 GB/s | ~10,000+ MLUPS |

The *Performance* tab measures your machine and converts the result into an effective bandwidth.

### 4. The data stays on the GPU

The populations, around 60 bytes × cells (about 30 MB for half a million cells), live in GPU memory for the whole
session. Each frame, JavaScript only records "do N steps" and "draw". The image is coloured on the GPU straight from the
simulation buffers, and only a few kilobytes of reduced statistics come back, about ten times a second. Copying the full
field to JavaScript every frame would cost more than the computation itself.

### 5. What the CPU and numpy versions pay for

- **JavaScript (one core)** runs the same loops as the shader, one cell after another. It is compiled by the browser's
  JIT and is respectable, but it is one core against thousands.
- **numpy** moves each array operation into compiled C, but every step makes about a hundred separate passes over
  the arrays (`np.roll`, `np.where`, the equilibrium, …). Each pass writes a full-size temporary array to memory and reads it back, so the
  memory traffic is many times that of the fused GPU kernel. In the browser it also runs as single-threaded WebAssembly.
  numpy is the right tool for *explaining* the algorithm, and the wrong one for running it fast.

### 6. Where a GPU would still struggle

- **Sequential problems**: stiff ODEs integrated step by step, small dense linear solves, or anything where step $n+1$
  needs all of step $n$ before it can start (the packed-bed reactor page).
- **Tiny problems**: launching a kernel costs a few microseconds. A 30-cell grid cannot fill a GPU.
- **Double precision**: consumer GPUs run float64 at 1/32–1/64 of their float32 speed, and WebGPU has no `f64` at all.
  LBM works in float32 if the populations are stored as deviations from rest, as here.
