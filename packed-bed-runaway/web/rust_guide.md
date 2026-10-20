## Reading the Rust code if you know Python

The Rust file `solver/src/lib.rs` implements **the same algorithm** as `python/pbr.py`, and the
function names match. You don't need to learn Rust to follow it. The ten ideas below cover
everything in the file.

### 1. `fn`, types and `let`

```rust
pub fn rate<T: Real>(x: T, th: T, gamma: T) -> T {
    (T::cst(1.0) - x) * (th / (T::cst(1.0) + th / gamma)).exp()
}
```

- `fn` is `def`. Every argument and the return value (`-> T`) have a declared **type**. The compiler checks them all
  before the program ever runs.
- The last expression, with no semicolon, is the return value.
- `pub` means *public*: callable from outside the module.
- `let x = ...` creates a variable that **cannot change**; `let mut x = ...` creates one that can. In Python everything is
  mutable. Rust makes you say so, which removes a whole class of bugs.

### 2. Generics: `<T: Real>`

`rate<T: Real>` means "for any number type `T` that behaves like a real number". The same
source code is compiled **twice**:
- once for `f64` (a plain float), used for ordinary solves;
- once for `Dual<f64>`, a float that carries a derivative, used for sensitivities.

Python achieves something similar with duck typing, but decides at *run time* on every operation. Rust
decides at *compile time* and generates specialized machine code for each type
(*monomorphization*). The generic code is therefore as fast as hand-written code.

### 3. Traits: `trait Real`

A **trait** is a list of capabilities a type promises to have. It is like a Python abstract base class, or a
"protocol". `Real` requires `+ - * /`, negation, `exp`, `cst` (make a constant) and `val` (read the plain value).
`impl Real for f64` and `impl Real for Dual<T>` fulfil that promise for each type.

### 4. Operator overloading: `impl Mul for Dual<T>`

```rust
fn mul(self, o: Self) -> Self {
    Dual { v: self.v * o.v, d: self.d * o.v + self.v * o.d }   // product rule
}
```

This is exactly Python's `__mul__`. Writing `a * b` on two dual numbers runs this function, so
the **chain rule happens automatically** inside every formula. That is all forward-mode
automatic differentiation is.

### 5. `struct` and `impl`

`struct Grid { n: usize, rho: Vec<f64>, ... }` is a class with fields and no methods.
`impl Grid { fn new(n) -> Self {...} }` adds the methods. `Self` means "this type", and `&self` plays
the role of Python's `self`.

### 6. `Vec<f64>`, slices `&[f64]`, and fixed arrays `[f64; 2]`

- `Vec<f64>` is a growable array of floats, like a 1-D numpy array that owns its data.
- `&[f64]` is a **borrowed view** of someone else's array, like passing a numpy view: no copy is made.
- `&mut [f64]` is a view you are allowed to write into. `rhs(..., y: &[T], f: &mut [T])` reads `y` and writes the result into `f`, which the caller allocated once and reuses for every step.
- `[[T; 2]; 2]` is a 2×2 array whose size is known at compile time. It lives on the stack, which costs nothing to allocate.

### 7. Ownership and borrowing

Every value has one owner. Functions *borrow* with `&` (read) or `&mut` (write), and the
compiler proves at compile time that no two parts of the program write the same data at
once. This is how Rust is memory-safe **without a garbage collector**: memory is freed exactly when its
owner goes out of scope. Nothing ever pauses to clean up.

### 8. Loops and indexing

`for i in 0..n { ... }` is `for i in range(n):`. Inside, `y[2 * i + 1]` is the same interleaved
indexing as Python's `y[1::2]`, written element by element. In Rust explicit loops are fast. In
Python they are slow, which is why the Python version must be vectorized with numpy instead.

### 9. Closures: `|xi, y| { ... }`

`integrate(&gr, cfg, |xi, y| { xs.push(xi); })` passes an anonymous function, like a Python
`lambda`, that is called after every accepted step to record the solution.

### 10. `unsafe` and `extern "C"`: the WebAssembly boundary

The functions at the bottom of the file marked `#[no_mangle] pub extern "C"` are the doors that
JavaScript calls:
1. JavaScript writes the inputs into the module's memory.
2. It calls `solve_dim(ptr, ...)`.
3. It reads the result through `out_ptr()` and `out_len()`.

Reading raw memory addresses is `unsafe` because the compiler cannot check addresses that come from outside. That
is why this code is confined to a few small functions at the edge, and everything else is ordinary safe Rust.

## Function map: Python ↔ Rust

| Step | Python (`pbr.py`) | Rust (`lib.rs`) | Difference |
|---|---|---|---|
| Inputs → groups | `groups_from_dimensional(q)` (dict) | `groups_from_dimensional(&q)` (array, generic `T`) | Rust version can carry a derivative |
| Radial grid | `class Grid` | `struct Grid` | same formulas |
| Rate law | `rate`, `rate_grad` (hand-derived) | `rate`, `rate_grad` (**automatic differentiation**) | no derivative formula to get wrong |
| Right-hand side | `rhs` (vectorized numpy) | `rhs` (plain loop) | loop is compiled, not interpreted |
| Jacobian | `jacobian_parts`, `w_banded` | `jacobian`, `Jac` | same 5-diagonal structure |
| Linear solve | `scipy.linalg.solve_banded` (LAPACK) | `Factor::factor` / `Factor::solve` (block Thomas) | factor once, solve 3 times |
| Integration | `integrate` | `integrate` | **identical algorithm and step sequence** |
| Hot spot | `hermite_peak` | `hermite_peak` | same cubic, generic in Rust |
| Sensitivity | `sensitivity_fd` (3 solves) | `sensitivity_dimensional` (1 dual solve) | exact derivative, no step to choose |
| Independent check | `integrate_bdf` (scipy BDF) | none | Python checks Rust |
