"""Extract each measured run's final answer and tool use from its subagent transcript.

    python extract_runs.py TASKS_DIR      # writes ../measured/runs/wNNN.json

A run is flagged "leak" if any tool call touched this project's files or its published page.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MEAS = os.path.join(HERE, "..", "measured")
LEAK_MARKS = ("ai-failure-modes", "references.json", "questions.json", "chetools.github.io/claude")


def extract(path):
    tools, answer = [], None
    for line in open(path, encoding="utf-8"):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        m = e.get("message")
        if not isinstance(m, dict) or not isinstance(m.get("content"), list) or e.get("type") != "assistant":
            continue
        for b in m["content"]:
            if b.get("type") != "tool_use":
                continue
            if b.get("name") == "SubagentHandback":
                answer = b["input"].get("message")
            else:
                tools.append({"name": b.get("name"), "input": json.dumps(b.get("input"))[:400]})
    leak = any(any(k in t["input"] for k in LEAK_MARKS) for t in tools)
    return {"answer": answer, "tools": tools, "leak": leak}


def main(tasks_dir):
    amap = json.load(open(os.path.join(MEAS, "agent_map.json")))
    qs = json.load(open(os.path.join(MEAS, "questions.json")))
    os.makedirs(os.path.join(MEAS, "runs"), exist_ok=True)
    for w, aid in sorted(amap.items()):
        n = int(w[1:])
        out = os.path.join(MEAS, "runs", f"{w}.json")
        src = os.path.join(tasks_dir, f"{aid}.output")
        if not os.path.exists(src):
            print(w, "no transcript")
            continue
        r = extract(src)
        if r["answer"] is None:
            print(w, "no final answer (failed run)")
            continue
        r.update({"run": w, "qid": qs[(n - 1) % 25]["id"], "round": (n - 1) // 25 + 1})
        json.dump(r, open(out, "w"), indent=1, ensure_ascii=False)
        print(w, r["qid"], "tools:", [t["name"] for t in r["tools"]], "LEAK" if r["leak"] else "")


if __name__ == "__main__":
    main(sys.argv[1])
