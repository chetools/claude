// Tests of the ranking Worker running locally: `cd worker && npx wrangler dev --local --port 8787`
// (after `npx wrangler d1 execute image-to-text-ranking --local --file schema.sql`). Pass a base URL to test elsewhere.
import assert from "assert/strict";
const BASE = process.argv[2] || "http://localhost:8787";
const tag = "test-" + Date.now().toString(36);
const post = (body, origin = "http://localhost:8765") =>
  fetch(BASE + "/report", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const perfect = "## Team Update 🚀\n\nHi all, the **release is on Friday**. Please *double-check* the ~~old~~ new checklist ✅.\n\n" +
  "- Tests: **142 passed**, 3 skipped\n- Budget: $12,480.50 (↑ 4.2%)\n\n| Name | Role | Status |\n|---|---|---|\n| Ana | QA | ✅ Done |\n| Raj | Dev | ⏳ In progress |\n\n" +
  "Invoice #A-20931 is due 2026-11-15; contact ops@example.com or call +1 (555) 013-2244 before 5 pm.";
let n = 0;
const ok = (name) => { n++; console.log("ok  " + name); };

let r = await post({ model: tag + "/good:free", text: perfect });
let j = await r.json();
assert.equal(r.status, 200); assert.equal(j.stored, true); assert.equal(j.score, 100);
assert.equal(r.headers.get("access-control-allow-origin"), "http://localhost:8765");
ok("perfect answer scored 100 on the server, CORS for allowed origin");

j = await (await post({ model: tag + "/flat:free", text: perfect.replace(/\*\*|~~/g, "") })).json();
assert.ok(j.score > 70 && j.score < 90, String(j.score));
ok("unformatted answer scored " + j.score);

j = await (await post({ model: tag + "/refused:free" })).json();
assert.equal(j.stored, true); assert.equal(j.score, null);
ok("refusal stored with no score");

// Only checkable locally: this container's outgoing IP changes between requests, so the live Worker sees new visitors.
if (/localhost/.test(BASE)) {
  j = await (await post({ model: tag + "/good:free", text: perfect })).json();
  assert.equal(j.stored, false);
  ok("second report from the same visitor within the hour is not stored");
} else console.log("--  duplicate-report check skipped (remote: the test's IP changes per request)");

j = await (await post({ model: tag + "/fake:free", score: 100 })).json();
assert.equal(j.score, null);
ok("a posted score is ignored (only text is scored)");

r = await post({ model: "not a model", text: "x" });
assert.equal(r.status, 400);
r = await post({ model: tag + "/big:free", text: "x".repeat(20001) });
assert.equal(r.status, 400);
ok("bad model id and oversized text rejected");

r = await post({ model: tag + "/other:free", text: "x" }, "https://evil.example");
assert.equal(r.headers.get("access-control-allow-origin"), null);
ok("no CORS header for other origins");

const rank = await (await fetch(BASE + "/ranking", { headers: { origin: "https://chetools.github.io" } })).json();
const mine = rank.models.filter((m) => m.model.startsWith(tag));
const med = mine.map((m) => m.median ?? -1);
assert.ok(med.every((x, i) => i === 0 || med[i - 1] >= x), JSON.stringify(mine));
assert.equal(mine[0].model, tag + "/good:free"); assert.equal(mine[0].median, 100); assert.equal(mine[0].tests, 1);
assert.equal(mine.find((m) => m.model === tag + "/refused:free").refused, 1);
ok("ranking: best median first, refusals counted");
console.log(`\n${n} worker tests passed`);
