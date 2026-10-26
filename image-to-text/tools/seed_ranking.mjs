// Adds real test-card results to the shared ranking: each free vision model reads web/probe.png through the page's
// own pipeline (same prompt + Tesseract draft) RUNS times; every raw answer (or refusal) is reported to the Worker.
// Usage: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=... node tools/seed_ranking.mjs <worker-url> [runs]
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const Tesseract = require(path.join(ROOT, ".buildtools/node_modules/tesseract.js"));
const { pickFreeVisionModels } = require(path.join(ROOT, "web/convert.js"));
const [WORKER, RUNS = "4"] = process.argv.slice(2);
const KEY = process.env.OPENROUTER_API_KEY || "injected-by-proxy";

// Prompt and hint wording taken from the page itself, so the seeded results match what visitors run.
const app = fs.readFileSync(path.join(ROOT, "web/app.js"), "utf8");
const PROMPT = eval(app.match(/const PROMPT = (\[[\s\S]*?\]\.join\("\\n"\));/)[1]);
const hintPrompt = eval("(" + app.match(/const hintPrompt = (\(ocr\) => [\s\S]*?"\\n<\/ocr>");/)[1] + ")");

const png = path.join(ROOT, "web/probe.png");
const img = "data:image/png;base64," + fs.readFileSync(png).toString("base64");
const worker = await Tesseract.createWorker("eng");
const prompt = hintPrompt((await worker.recognize(png)).data.text);
await worker.terminate();

const models = pickFreeVisionModels((await (await fetch("https://openrouter.ai/api/v1/models")).json()).data).map((m) => m.id);
console.log("models:", models.join(", "));
const tally = {};
for (let run = 0; run < +RUNS; run++) {
  await Promise.all(models.map(async (model) => {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: img } }] }] }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    const code = j.error ? j.error.code || r.status : r ? r.status : 0;
    const text = j.choices?.[0]?.message?.content;
    let body;
    if (text && String(text).trim()) body = { model, text: String(text) };
    else if ([400, 403, 404].includes(code)) body = { model }; // refused: counts as a failed test
    else { (tally[model] ||= []).push("busy(" + code + ")"); return; } // rate-limited/timeout: not reported, like the page
    const s = await (await fetch(WORKER + "/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
    (tally[model] ||= []).push(s.stored ? (s.score ?? "refused") : "not stored");
  }));
}
for (const [m, v] of Object.entries(tally)) console.log(m.padEnd(52), v.join("  "));
