"""Write solver/bench_inputs.txt (flat models of the literature benchmarks)
for: cd solver && cargo run --release --example bench"""
import os
import hen

HERE = os.path.dirname(os.path.abspath(__file__))
lines = []
# extra run: H5C1 at EMAT 5 K, because the published utility loads are below
# the EMAT 10 K limit (see the Benchmarks tab)
# (base problem, EMAT, film coefficient for every stream and utility)
EXTRA = {"H5C1 (Yee & Grossmann) @EMAT 5": ("H5C1 (Yee & Grossmann)", 5.0, None),
         "H5C1 (Yee & Grossmann) @U=1": ("H5C1 (Yee & Grossmann)", 10.0, 2.0),
         "H5C1 (Yee & Grossmann) @U=1, EMAT 1": ("H5C1 (Yee & Grossmann)", 1.0, 2.0)}
for name in list(hen.BENCHMARKS) + list(EXTRA):
    base, emat, h = EXTRA.get(name, (name, None, None))
    p = hen.benchmark(base)
    if emat is not None:
        p["emat"] = emat
    if h is not None:
        for s in p["hot"] + p["cold"] + p["hu"] + p["cu"]:
            s["h"] = h
    m = hen.Model(p)
    lines.append(name + " | " + " ".join(repr(float(a)) for a in hen.flatten_model(m)))
open(os.path.join(HERE, "..", "solver", "bench_inputs.txt"), "w").write("\n".join(lines) + "\n")
print(len(lines), "benchmarks")
