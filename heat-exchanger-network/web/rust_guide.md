## Rust for Python readers

The Rust solver (`solver/src/lib.rs`) is a line-by-line translation of sections 2 and 5–7 of `hen.py`. If you can read the
Python, you can read the Rust with these few rules.

| Python | Rust | note |
|---|---|---|
| `def f(x, y):` | `fn f(x: f64, y: &[f64]) -> f64 {` | types are written out; `&[f64]` is a read-only view of a list of floats |
| `x = 1.0` | `let x = 1.0;` | `let` creates a name; it cannot change |
| `x += 1` on a name | `let mut x = 0.0; x += 1.0;` | `mut` marks a name that changes |
| `[0.0] * n` | `vec![0.0; n]` | a growable array (`Vec<f64>`) |
| `[[0.0] * (K + 1) for _ in range(nH)]` | `vec![vec![0.0; kk + 1]; model.nh]` | a list of lists |
| `for m, (i, j, k) in enumerate(net["matches"]):` | `for (m, &(i, j, k)) in net.matches.iter().enumerate() {` | same loop |
| `for k in range(K - 1, -1, -1):` | `for k in (0..kk).rev() {` | `a..b` is `range(a, b)` |
| `math.log(x)`, `x ** b`, `math.exp(x)` | `x.ln()`, `x.powf(b)`, `x.exp()` | methods on the number |
| `return a, b` | `(a, b)` as the last line | the last expression is the result |
| a dict of results | a `struct` | fields are named and typed (`Eval`, `LoadResult`) |
| `None` / a value | `Option<T>`: `None` / `Some(v)` | `match` or `if let Some(v) = ...` unpacks it |
| `if q > 0 else 0.0` | `if q > 0.0 { ... } else { 0.0 }` | `if` is an expression |
| `lambda y: ...` | `\|y\| ...` | a closure |

Integers and floats are never mixed silently: `1` and `1.0` are different types, and `k as f64` converts. Index lists with
`usize` (an unsigned integer).

### Python ↔ Rust function map

| hen.py | lib.rs | what it does |
|---|---|---|
| `unit_cost` | `unit_cost` | annualised exchanger cost and dC/dA, three cost laws |
| `Model` / `flatten_model` | `Model::from_flat` | the compiled problem; Python (or the page's JavaScript) writes a flat list of numbers that Rust reads |
| `flatten_net` | `Net::from_flat`, `Net::to_flat` | a topology: matches $(i,j,k)$ and the utility of each stream |
| `lmtd` | `lmtd` | log-mean temperature difference and its derivatives |
| `temperatures` | `temperatures` | stage temperatures from the loads |
| `evaluate` | `evaluate` | TAC, barrier and penalty terms, gradient |
| `_backprop` | `backprop` | the adjoint through the temperature recurrences |
| `slacks`, `max_feasible_step` | `slacks`, `max_feasible_step` | the linear constraints and the largest safe step |
| `feasible_start` | `feasible_start` | scale infeasible start loads down until feasible |
| `lbfgs_level` | `lbfgs_level` | one barrier level: L-BFGS with backtracking |
| `optimize_loads` | `optimize_loads` | the NLP: seven barrier/penalty levels |
| `residuals` | `residuals` | utility loads of switched-off streams |
| `Mulberry32` | `Mulberry32` | the 32-bit random generator (same numbers in Python, JS, Rust) |
| `initial_network`, `propose`, `warm_start`, `objective` | same names | pieces of the annealing |
| `anneal` | `anneal` | simulated annealing over the topology |
| `problem_table` | `problem_table`, `composite` | targets and the curves for the charts |

The LP and the MILP are not in Rust: HiGHS solves them (highs-js in the page, scipy in Python).

### How the page talks to Rust

There is no binding generator. The functions marked `#[no_mangle] pub extern "C"` are the module's exports. JavaScript asks
for memory with `alloc(n)`, writes `Float64Array`s into it (the flat model, the network, start loads), calls e.g.
`optimize(...)`, and reads the result through a `Float64Array` view of `out_ptr()` / `out_len()`. The same compiled module
is instantiated once on the page (grid diagram) and once in every Web Worker (annealing chains, step 3, batch evaluation).
