"""Write results/data_sample.json: FAKE data (6 models x 12 problems x 3 runs) to exercise the page generator.
Nothing here is a measurement of any real model."""
import json, os, random, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rnd = random.Random(20261023)
ref = json.load(open(os.path.join(ROOT, "results", "reference.json")))

models = [
    ("sample-a", "Sample model A", "Vendor One", "2025-03-10", 8, False, "none", None, 0.4),
    ("sample-b", "Sample model B", "Vendor One", "2025-09-02", 70, True, "low", "low", 1.8),
    ("sample-c", "Sample model C", "Vendor Two", "2025-11-20", 400, False, "high", "high", 14.5),
    ("sample-d", "Sample model D", "Vendor Two", "2026-04-15", None, False, "high", "medium", 22.0),
    ("sample-e", "Sample model E", "Vendor Three", "2026-06-30", 120, True, "medium", "medium", 6.2),
    ("sample-f", "Sample model F", "Vendor Three", "2026-09-12", None, False, "high", "high", 31.0),
]
skill = {"sample-a": .45, "sample-b": .6, "sample-c": .72, "sample-d": .8, "sample-e": .68, "sample-f": .9}
hard = {"Easy": 0.0, "Medium": 0.15, "Hard": 0.3, "Extremely hard": 0.45}

problems = []
for i in range(1, 13):
    txt = open(os.path.join(ROOT, "problems", f"P{i:02d}.md"), encoding="utf-8").read()
    head = txt.split("\n---\n")[0]
    h = dict(l.split(": ", 1) for l in head.splitlines() if ": " in l)
    problems.append(dict(id=h["id"], topic=h["topic"], difficulty=h["difficulty"], title=h["title"],
                         parts=h["parts"].split(",")))

responses = []
for m in models:
    for p in problems:
        p_ok = max(0.03, min(0.97, skill[m[0]] - hard.get(p["difficulty"], .3)))
        for run in (1, 2, 3):
            score = round(min(10, max(0, 10 * p_ok + rnd.gauss(0, 1.6))))
            text = (f"SAMPLE (fake) response of {m[1]} to {p['id']}, run {run}.\n"
                    f"Step 1: ... Answer (a) = {ref[p['id']]['a']:.4g}\n")
            if m[0] == "sample-a" and p["id"] == "P01" and run == 1:   # hostile text: must be shown as text
                text += '<script>window.PWNED=1</script><img src=x onerror="window.PWNED=1"> @@NOT_A_PLACEHOLDER@@ </pre></details>'
            responses.append(dict(model=m[0], problem=p["id"], run=run, text=text, score=score,
                                  justification=f"FAKE grader note: {score}/10 on {len(p['parts'])} parts."))
data = dict(sample=True,
            models=[dict(id=a, name=b, vendor=c, release_date=d, params=e, params_official=f, params_source="fake sample",
                         reasoning=g, effort=h, cost_usd=k) for a, b, c, d, e, f, g, h, k in models],
            problems=problems, responses=responses)
json.dump(data, open(os.path.join(ROOT, "results", "data_sample.json"), "w"), indent=1, ensure_ascii=False)
print("wrote results/data_sample.json", len(responses), "responses")
