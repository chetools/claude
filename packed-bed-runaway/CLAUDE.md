# packed-bed-runaway: lessons

Project-specific lessons. Repo-wide rules are in the root `CLAUDE.md`; Rust/WASM/AD lessons are in the
`rust-wasm-numerics-page` skill (`.claude/skills/`).

## Teaching priorities and scope
- **Build only what was asked for.** Extras removed after delivery: the Barkelew curve, the Semenov and
  Morbidelli–Varma criteria (with the benchmark tab and verdict), and a cross-reference note. Theory derives only
  what the page computes.
- **Teaching priorities.**
  - Python is the readable reference, explained step by step. Students don't know Rust.
  - Rust is there for speed. It gets a "Rust for Python readers" guide and a Python↔Rust function map.
  - Every chart that reacts to the inputs is computed by Rust.
  - Rust is confirmed against Python on the page, with a click-to-run comparison and a speed race of about 10 s of Python.
- **No unverified claims on the page.** Compute a number or leave it out, whether it is a literature comparison, a flop count or a
  physics statement. For example, check the adiabatic limit numerically before calling a temperature superadiabatic.
