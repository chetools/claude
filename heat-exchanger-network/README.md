# Heat exchanger network synthesis (interactive teaching page)

Live page: https://chetools.github.io/claude/heat-exchanger-network/

Sequential synthesis (LP utility targets with forbidden matches → MILP fewest matches → NLP network),
an interactive grid diagram, and simulated annealing over the stage-wise superstructure (Yee & Grossmann,
isothermal mixing), with material-dependent exchanger costs (Seider et al. / Turton) and bottom-up utility prices.

| directory | contents |
|---|---|
| `python/` | `hen.py` (reference), `walkthrough.py` (breakdown cells), `runner.py`, `make_molab.py`, `benchmarks.py`, `bench_page.py`, tests |
| `solver/` | Rust solver (`src/lib.rs`), `cargo test`, `examples/dump.rs` (parity values), `examples/bench.rs` (benchmark runs) |
| `web/` | `template.html`, `app.js`, `core.js` (problem set-up, LP/MILP text for HiGHS), `gpu.js` (WebGPU batch), markdown |
| `benchmarks/` | Furman–Sahinidis instances (Letsios et al. 2018, Apache-2.0) and our computed results |
| `tests/` | Playwright drivers: `page_check.js`, `race.js`, `gpu_measure.js` |
| `dist/` | the built single-file page |
| `notebook/` | generated MoLab (marimo) notebook |

Build and check:

    python build.py --pages <gh-pages worktree>/heat-exchanger-network
    (cd solver && cargo test --release); (cd python && pytest -q)
    marimo check notebook/walkthrough_molab.py && python notebook/walkthrough_molab.py
    python -m http.server 8765 --directory dist &  node tests/page_check.js

Regenerating the benchmark results (minutes to an hour):

    cd python && python make_bench_inputs.py && python benchmarks.py furman
    cd ../solver && cargo run --release --example bench -- 5000 4 "" 4
