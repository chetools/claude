## Why there is Rust at all

Python (`sdl.py`) is the readable reference, and it is what the step-by-step tab explains. Every chart in the App tab is computed
by the Rust translation, `lib.rs`, compiled to WebAssembly. The *Compare strategies* tab runs hundreds of complete sessions, each with
dozens of likelihood optimizations and covariance updates, and in Rust that takes seconds. The *Performance* tab measures the difference on your machine,
and *Rust vs Python* checks that both give the same answers.

## Reading Rust as a Python programmer

| Python (`sdl.py`) | Rust (`lib.rs`) | What to know |
|---|---|---|
| `X` as a numpy array of shape `(n, d)` | `x: &[f64]` of length `n * d` | Matrices are flat lists stored row by row: element `(i, c)` is `x[i * d + c]`. |
| `np.sum(A * B)`, `A @ B` | explicit `for` loops | Loops are fast in compiled code, so there is no need to vectorize. |
| `def f(X, y):` | `pub fn f(x: &[f64], y: &[f64]) -> f64 {` | Every argument and result has a declared type. `&` borrows data without copying. |
| `y = y.copy()`; `y[0] = 1` | `let mut y = y.to_vec();` | Variables are read-only unless declared `mut`. |
| `gp = dict(ell=..., L=...)` | `pub struct Gp { pub ell: Vec<f64>, pub l: Vec<f64>, ... }` | A struct is a dict with fixed, typed fields. |
| `lambda z: nll_grad(z, X, y)` | <code>&#124;zz, gg&#124; nll_grad(zz, x, d, &amp;yz, gg)</code> | A closure. Here it writes the gradient into `gg` instead of returning a tuple. |
| `(s * 1000003 + stream) & M64` | `seed.wrapping_mul(1000003).wrapping_add(stream)` | Python integers never overflow, so `sdl.Rng` masks to 64 bits; Rust's `u64` wraps around by itself. |
| `np.linalg.cholesky`, `np.linalg.solve` | `cholesky`, `solve_lower`, `solve_upper_t` | Written out, about 60 lines. They use the triangular shape of $L$. |
| raises `LinAlgError` | returns `false` / `f64::INFINITY` | Rust has no exceptions here; failures are ordinary return values. |
| `for _s in sdl.STRATEGIES` (strings) | `RANDOM, LHS, MAXVAR, IMSE` = 0, 1, 2, 3 | Numbers cross the WebAssembly boundary more easily than strings. |

## Function map

Both files define these in the same order, so each Python function can be read next to its Rust translation.

| Python | Rust | Purpose |
|---|---|---|
| `Rng` | `Rng` | SplitMix64 random numbers (identical streams) |
| `forrester`, `gramacy_lee`, `reactor_yield`, `branin`, `TRUTHS` | same names, `truth(id, x)` | the hidden true processes |
| `grid` | `grid` | candidate and error grid |
| `matern52` | `matern52`, `matern52_matrix` | covariance (one pair / a whole matrix) |
| `bounds`, `to_theta`, `to_z` | same | hyperparameter box and the tanh map |
| `nll_grad` | `nll_grad` | negative log likelihood and gradient |
| `bfgs` | `bfgs` | the optimizer |
| `gp_fit`, `gp_build` | `gp_fit`, `gp_build` | fit hyperparameters; condition on data |
| `gp_predict` | `gp_predict` | mean and variance on the grid |
| `posterior_cov` | `posterior_cov` | grid covariance $C$ |
| `lhs_maximin` | `lhs_maximin` | maximin Latin hypercube |
| `greedy_batch` | `greedy_batch` | max-variance / IMSE batch with rank-one updates |
| `run_session` | `run_session` | the whole sequential loop |
| (none) | `session`, `curve`, `alloc`, `out_ptr`, `out_len` | the interface the page calls |

## How the page talks to the WebAssembly module

The module exports plain functions. The page writes the 7 inputs (problem, strategy, $n_0$, batch, budget, noise, seed) into memory
obtained from `alloc`, calls `session` (everything needed to draw every round) or `curve` (only the learning curve), and reads
the numbers back from `out_ptr()` / `out_len()`. The layout of the `session` result is documented above that function in `lib.rs`.
For the comparison, the page runs `curve` in several Web Workers at once, one per CPU core (up to 8), each with its own copy of the module.
