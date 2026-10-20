## Why Rust is fast here

Annealing spends almost all its time in the NLP: every move needs one load optimisation, i.e. hundreds of evaluations of
the TAC and its gradient, each a loop over a few dozen exchangers and stage temperatures. That is the kind of code Python
is slowest at and compiled code is fastest at:

- **No interpreter in the loop.** In Python every `+`, `*`, list index and `math.log` goes through the interpreter and creates a
  new float object. Rust compiles `evaluate` to straight machine code (here WebAssembly, which the browser compiles again
  to native code), with floats in registers.
- **Same algorithm, same operations.** The vectors are short (one entry per match), and the Python reference uses plain
  loops so that it reads like the equations and does exactly what the Rust code does.
- **Many independent chains.** Annealing chains do not talk to each other inside an epoch, so each runs in its own Web
  Worker with its own WebAssembly instance; the Performance tab measures the throughput with several workers.

The Performance tab measures the speed-up in your browser instead of quoting a number.

### Why not the GPU?

A GPU pays off for many identical, independent pieces of work. One NLP is the opposite: a chain of L-BFGS steps, each
depending on the last, on a vector of a few dozen loads. What *is* parallel is evaluating many candidate load vectors of one
topology at once, which a population-based method would need; the Performance tab measures exactly that batch on WebGPU
(float32) against the CPU workers (float64), so the choice rests on a measurement.
