"""Combine the cached replies (results/raw), the grades (results/grades/PNN.json) and the model metadata
(results/model_meta.json) into results/data.json, the input of build.py.

grades/PNN.json: {"<model id>": {"parts": {"a": points, ...}, "score": total, "justification": "..."}}
results/errors/PNN.json: {"<model id>": {"<part>": {"type": <key of error_types.TYPES>, "note": "..."}}}, one label for
every part that lost points and none for parts with full points.
Stops with a message on a missing grade, a part score above the rubric's points or off the half-point grid,
or a total that is not the sum of the parts.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from rubric import POINTS                                    # noqa: E402
from run_models import load_problem, raw_path               # noqa: E402
from error_types import TYPES                               # noqa: E402

RUN = 1


def num_b(s):
    """'25.8B (3.8B active)' -> (25.8, 3.8); '8.0B' -> (8.0, None); None -> (None, None)."""
    if s is None:
        return None, None
    v = [float(x) for x in re.findall(r"([\d.]+)B", s)]
    return v[0], (v[1] if len(v) > 1 else None)


def main():
    meta = json.loads((ROOT / "results" / "model_meta.json").read_text())
    pids = sorted(POINTS)
    problems, grades, labels = [], {}, {}
    for pid in pids:
        h, _ = load_problem(pid)
        problems.append(dict(id=pid, topic=h["topic"], difficulty=h["difficulty"], title=h["title"],
                             parts=h["parts"].split(",")))
        g = ROOT / "results" / "grades" / f"{pid}.json"
        grades[pid] = json.loads(g.read_text()) if g.exists() else {}
        e = ROOT / "results" / "errors" / f"{pid}.json"
        labels[pid] = json.loads(e.read_text()) if e.exists() else {}
    models, responses, errors, missing = [], [], [], []
    for m in meta:
        cost, n = 0.0, 0
        for pid in pids:
            f = raw_path(m["id"], pid, RUN)
            if not f.exists():
                missing.append(f"{m['id']} {pid} (no reply)")
                continue
            raw = json.loads(f.read_text())
            g = grades[pid].get(m["id"])
            if g is None:
                missing.append(f"{m['id']} {pid} (not graded)")
                continue
            cost += raw.get("cost") or 0.0
            n += 1
            parts = g["parts"]
            for k, pts in POINTS[pid].items():
                v = parts.get(k)
                if v is None or not 0 <= v <= pts or (2 * v) != int(2 * v):
                    errors.append(f"{m['id']} {pid} ({k}): {v!r} (max {pts}, half points)")
            if abs(sum(parts.values()) - g["score"]) > 1e-9:
                errors.append(f"{m['id']} {pid}: score {g['score']} != sum of parts {sum(parts.values())}")
            lab = labels[pid].get(m["id"], {})
            for k, pts in POINTS[pid].items():
                lost = parts[k] < pts
                if lost != (k in lab):
                    errors.append(f"{m['id']} {pid} ({k}): " + ("lost points but no error label" if lost
                                                                else "error label on a full-marks part"))
                if k in lab and (lab[k].get("type") not in TYPES or not lab[k].get("note")):
                    errors.append(f"{m['id']} {pid} ({k}): bad error label {lab[k]!r}")
            if set(lab) - set(POINTS[pid]):
                errors.append(f"{m['id']} {pid}: error labels for unknown parts {sorted(set(lab) - set(POINTS[pid]))}")
            text = raw["text"]
            if raw.get("finish_reason") == "length":
                text += "\n\n[reply cut off at the provider's output-token limit]"
            responses.append(dict(model=m["id"], problem=pid, run=RUN, text=text, score=g["score"],
                                  justification=g["justification"], parts=parts, errors=lab))
        if not n:
            missing.append(f"{m['id']}: no graded reply at all; model left out")
            continue
        total, active = num_b(m["params"])
        models.append(dict(id=m["id"], name=m["name"].split(": ", 1)[-1], vendor=m["vendor"],
                           release_date=m["release_date"], params=total, params_active=active,
                           params_official=m["params_official"], params_source=m["params_source"],
                           reasoning="provider default" if m["reasoning"] else "none", effort=None,
                           cost_usd=round(cost, 6)))
    if errors:
        sys.exit("grade errors:\n  " + "\n  ".join(errors))
    out = ROOT / "results" / "data.json"
    out.write_text(json.dumps(dict(models=models, problems=problems, responses=responses), indent=1,
                              ensure_ascii=False))
    print(f"wrote {out.relative_to(ROOT)}: {len(models)} models, {len(responses)} responses")
    if missing:
        print("missing:\n  " + "\n  ".join(missing))


if __name__ == "__main__":
    main()
