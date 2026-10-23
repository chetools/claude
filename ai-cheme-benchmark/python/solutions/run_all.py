"""Run every reference solution and write ../../results/reference.json."""
import importlib, json, pathlib, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
out = {}
for i in range(1, 13):
    mod = importlib.import_module(f"p{i:02d}")
    out[f"P{i:02d}"] = mod.solve(**mod.INPUTS)
if __name__ == "__main__":
    (HERE.parent.parent / "results" / "reference.json").write_text(json.dumps(out, indent=1))
    for k, v in out.items():
        print(k, {kk: (round(vv, 6) if isinstance(vv, float) else vv) for kk, vv in v.items()})
