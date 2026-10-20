## Why is the Rust version so much faster?

Both versions run in the **same browser** and as **WebAssembly** (WASM), and they execute the same algorithm with
the same step sequence. Yet one solve takes well under a millisecond in Rust and tens of milliseconds
in Python. The difference comes from *what* is compiled to WASM.

### 1. Compiled code vs. an interpreter compiled to WASM

- **Rust** is compiled ahead of time by LLVM straight into WASM instructions for *this
  program*. The browser then translates those into native machine code. A line such as `a * b + c` becomes two
  machine instructions working on CPU registers.
- **Python in the browser (Pyodide)** is the CPython **interpreter itself** compiled to WASM.
  Your Python code is still *interpreted*. For each `a * b` the interpreter must:
  1. fetch the bytecode;
  2. look up the types of `a` and `b`;
  3. find their `__mul__`;
  4. allocate a new float object on the heap;
  5. update reference counts.

  That is dozens to hundreds of machine instructions for one multiplication, and it is a layer of
  interpretation on top of the WASM layer.

### 2. numpy helps, but not for small arrays

numpy moves the loop into compiled C, so one `x * y` on a million elements is fast. But every
numpy call still pays a fixed toll of roughly 1–5 µs, because it goes through the interpreter, parses its arguments
and allocates a result array. Our arrays are tiny: 30 radial cells. One Python `rhs` makes about 20 numpy
calls on 30-element arrays, so **almost all the time is overhead, not arithmetic**. The table below
measures this.

### 3. The Rust features that make the difference

**Zero-cost generics.** `rate<T: Real>` is compiled separately for `f64` and `Dual<f64>`, and
each version is specialized and inlined. Automatic differentiation therefore costs only the extra
arithmetic, about 2–3×, with no dispatch and no object allocation:

```rust
impl<T: Real> Mul for Dual<T> {
    #[inline(always)]
    fn mul(self, o: Self) -> Self { Dual { v: self.v * o.v, d: self.d * o.v + self.v * o.d } }
}
```

**No allocation in the inner loop.** All work vectors (`k1`, `k2`, `k3`, ...) are allocated
**once** per solve and reused for every step. The 2×2 blocks are fixed-size arrays on the stack.
Python's `y + 0.5 * h * k1` creates two new arrays on every call.

**No garbage collector, no reference counting.** Ownership tells the compiler exactly when
memory can be freed, so nothing runs in the background and no object carries a counter.

**Compiler optimization.** `opt-level = 3`, link-time optimization (`lto = true`) and
`codegen-units = 1` let LLVM:
- inline across the whole program;
- remove bounds checks it can prove unnecessary;
- keep loop variables in registers;
- vectorize with WASM SIMD (`+simd128`).

**A structure-aware linear solver.** Block Thomas factors $W$ once per step and reuses the
factors for all three stages. Python's `solve_banded` re-factors the matrix on each call, through a
general LAPACK interface. Both are $O(N)$; the Rust version simply does less work.

**Zero-copy hand-off to JavaScript.** Results stay in WASM linear memory, and JavaScript reads
them through a `Float64Array` *view*, with no serialization or copying.

**Parallelism.** Every point of a sensitivity map is an independent solve. The page runs one
WASM instance per CPU core in **Web Workers**, giving another factor equal to your number of cores.
Python in Pyodide is single-threaded.

### 4. Measured on your machine

<div id="micro-panel"></div>

### 5. Would WebGPU make it faster still?

Not for this problem, and the reasons are instructive.

- **One solve is sequential.** Each axial step needs the previous one, and a step involves
  only about 60 unknowns. Launching GPU work has a latency of tens of microseconds per dispatch, which is
  longer than a whole Rust step takes on the CPU. A GPU only pays off with thousands of
  independent operations in flight.
- **A map is parallel, but...** The 1,000+ points of a sensitivity map are independent, so a
  GPU kernel could in principle integrate all of them at once. Three things stand in the way:
  - **No 64-bit floats.** WebGPU's shading language (WGSL) has no `f64`. Near runaway, $T^*$
    jumps by hundreds of kelvin over a few percent of $p_0$, and the sensitivity is a derivative
    of that jump. 32-bit floats carry about 7 digits; the stiff solver, with its exponentials of up to $e^{20}$, needs
    the 16 digits of `f64`.
  - **Divergence.** Each map point needs a different number of adaptive steps, so GPU
    threads, which run in lockstep groups, would wait for the slowest. Fixed steps would avoid this, but would
    need far more of them to survive the hot spot.
  - **Tooling and reach.** It would need a separate kernel in WGSL (or experimental
    `rust-gpu`), and WebGPU support still varies across browsers.
- **When it would pay off:** parameter studies of around 10⁵ points or more, with a fixed-step or
  f32-tolerant formulation. For interactive maps of about 10³ points, **f64 WASM on all CPU cores** is
  the right tool, and it is what this page uses.
