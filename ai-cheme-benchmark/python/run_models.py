"""Send each problem to each model on OpenRouter and cache the raw replies.

Usage: python run_models.py --models a,b,c --runs 1 [--problems P01,P02] [--cap 1.0]
Key: environment variable OPENROUTER_API_KEY (never written anywhere).
Replies go to results/raw/<model id with / -> __>/<PID>_r<run>.json; existing files are skipped,
so a re-run never pays twice. Each reply records OpenRouter's reported cost; the run stops
before starting a call once the paid total reaches the cap.
"""
import argparse, asyncio, json, os, pathlib, re, sys, time

import httpx

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "results" / "raw"
URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM = ("You are taking an undergraduate chemical engineering exam. Solve the problem carefully, "
          "showing your working. At the end, give one line per part, exactly in the form\n"
          "FINAL (a): <number> <unit>\n"
          "using the part letters of the problem.")


def load_problem(pid):
    text = (ROOT / "problems" / f"{pid}.md").read_text()
    head, body = text.split("\n---\n", 1)
    meta = dict(line.split(": ", 1) for line in head.splitlines() if ": " in line)
    return meta, body.strip()


def raw_path(model, pid, run):
    return RAW / model.replace("/", "__").replace(":", "_") / f"{pid}_r{run}.json"


def spent():
    total = 0.0
    for f in RAW.rglob("*.json"):
        total += json.loads(f.read_text()).get("cost") or 0.0
    return total


async def call(client, sem, model, pid, run, args, state):
    out = raw_path(model, pid, run)
    if out.exists():
        return
    _, body = load_problem(pid)
    payload = {"model": model, "messages": [{"role": "system", "content": SYSTEM},
                                            {"role": "user", "content": body}],
               "usage": {"include": True}}
    if args.max_tokens:
        payload["max_tokens"] = args.max_tokens
    async with sem:
        if state["spent"] >= args.cap:
            state["skipped"] += 1
            return
        for attempt in range(8):
            t0 = time.time()
            try:
                r = await client.post(URL, json=payload, timeout=900)
            except httpx.HTTPError as e:
                err = repr(e)
            else:
                if r.status_code == 200:
                    j = r.json()
                    if "choices" in j and j["choices"]:
                        msg = j["choices"][0]["message"]
                        rec = {"model": model, "problem": pid, "run": run,
                               "served_model": j.get("model"), "provider": j.get("provider"),
                               "text": msg.get("content") or "",
                               "reasoning": msg.get("reasoning"),
                               "finish_reason": j["choices"][0].get("finish_reason"),
                               "usage": j.get("usage"), "cost": (j.get("usage") or {}).get("cost", 0.0),
                               "seconds": round(time.time() - t0, 1)}
                        # --keep-cutoff: keep a reply cut off at the output limit even with no text (graded as it stands)
                        if rec["text"].strip() or (args.keep_cutoff and rec["finish_reason"] == "length"):
                            out.parent.mkdir(parents=True, exist_ok=True)
                            out.write_text(json.dumps(rec, indent=1))
                            state["spent"] += rec["cost"] or 0.0
                            print(f"{model} {pid} r{run}: {len(rec['text'])} chars, "
                                  f"${rec['cost'] or 0:.5f}, {rec['seconds']} s", flush=True)
                            return
                        err = f"empty content, finish={rec['finish_reason']}"
                    else:
                        err = str(j.get("error"))[:200]
                else:
                    err = f"HTTP {r.status_code}: {r.text[:200]}"
            wait = min(120, 5 * 2 ** attempt)
            print(f"{model} {pid} r{run}: {err}; retry in {wait} s", flush=True)
            await asyncio.sleep(wait)
        state["failed"].append((model, pid, run))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--problems", default=",".join(f"P{i:02d}" for i in range(1, 13)))
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--cap", type=float, default=1.0, help="USD, total over all cached replies")
    ap.add_argument("--max-tokens", type=int, default=0, help="0 = provider default")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--keep-cutoff", action="store_true",
                    help="save a reply cut off at the output limit even if it has no text, instead of retrying")
    args = ap.parse_args()
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY is not set")
    state = {"spent": spent(), "skipped": 0, "failed": []}
    print(f"already spent ${state['spent']:.4f} of ${args.cap}")
    sem = asyncio.Semaphore(args.concurrency)
    headers = {"Authorization": f"Bearer {key}", "X-Title": "ChemE AI benchmark"}
    async with httpx.AsyncClient(headers=headers) as client:
        await asyncio.gather(*[call(client, sem, m, p, r, args, state)
                               for m in args.models.split(",")
                               for p in args.problems.split(",")
                               for r in range(1, args.runs + 1)])
    print(f"spent ${state['spent']:.4f}; skipped for cap: {state['skipped']}; failed: {state['failed']}")


if __name__ == "__main__":
    asyncio.run(main())
