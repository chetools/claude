"""Write solver/ref_inputs.txt: models, networks and loads for the Rust
reference dump (cargo run --release --example dump), which writes
solver/ref.json; test_hen.test_rust_parity compares it with this module.

One case per line:  problem | model | net | x | tau mu scale
One anneal per line: ANNEAL problem | model | iters seed
"""
import os
import random

import hen

HERE = os.path.dirname(os.path.abspath(__file__))


def fmt(v):
    return " ".join(repr(float(a)) for a in v)


def main():
    lines = []
    rng = random.Random(11)
    for name in ["H2C2 (Escobar & Trierweiler)", "H4C5 aromatics (Linnhoff & Ahmad)", "H5C1 (Yee & Grossmann)",
                 "H8C7 (Bjork & Pettersson)"]:
        model = hen.Model(hen.benchmark(name))
        pairs = [(i, j) for i in range(model.nH) for j in range(model.nC) if model.allowed[i][j]]
        for t in range(3):
            M = set()
            while len(M) < min(5, len(pairs) * model.K):
                i, j = rng.choice(pairs)
                M.add((i, j, rng.randrange(model.K)))
            net = dict(matches=sorted(M), hu=[0 if h else -1 for h in model.heat],
                       cu=[0 if c else -1 for c in model.cool])
            if t == 2:
                net["cu"][0] = -1
            x = hen.start_point(model, net, 0.03 * (t + 1))
            lines.append(f"{name} | {fmt(hen.flatten_model(model))} | {fmt(hen.flatten_net(net))} | {fmt(x)} | "
                         f"{fmt([1e-4 * t, 10.0 * t, 1e5])}")
    for name, iters, seed in [("H2C2 (Escobar & Trierweiler)", 300, 2), ("H5C1 (Yee & Grossmann)", 150, 7)]:
        model = hen.Model(hen.benchmark(name))
        lines.append(f"ANNEAL {name} | {fmt(hen.flatten_model(model))} | {iters} {seed}")
    dst = os.path.join(HERE, "..", "solver", "ref_inputs.txt")
    with open(dst, "w") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote", dst)


if __name__ == "__main__":
    main()
