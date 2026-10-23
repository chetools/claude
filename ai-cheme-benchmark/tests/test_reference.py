"""Reference solutions vs independent check scripts (different methods), per problem part."""
import json, pathlib, subprocess, sys
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python" / "solutions"))
import run_all  # noqa: E402


@pytest.mark.parametrize("pid", [f"P{i:02d}" for i in range(1, 13)])
def test_reference_matches_independent_check(pid):
    out = subprocess.run([sys.executable, str(ROOT / "python" / "checks" / f"{pid.lower()}_check.py")],
                         capture_output=True, text=True, check=True).stdout
    check = json.loads(out.strip().splitlines()[-1])
    ref = run_all.out[pid]
    for k, v in ref.items():
        assert k in check, (pid, k)
        if isinstance(v, str):
            assert v == check[k], (pid, k, v, check[k])
        else:
            assert check[k] == pytest.approx(v, rel=1e-5), (pid, k)


def test_reference_json_up_to_date():
    stored = json.loads((ROOT / "results" / "reference.json").read_text())
    assert stored.keys() == run_all.out.keys()
    for pid in stored:
        for k, v in run_all.out[pid].items():
            assert stored[pid][k] == (v if isinstance(v, str) else pytest.approx(v, rel=1e-12))
