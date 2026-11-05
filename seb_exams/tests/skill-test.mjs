// Test of the student grading skill's helper script against the real Worker
// over HTTP: packet, verify (exact and altered), submit.
// Run from seb_exams/:  node tests/skill-test.mjs
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { D1Shim } from "./d1-shim.mjs";
import worker from "../worker/src/index.js";

const run = promisify(execFile);
const GRADE = "/home/hatch/workspace/custom-skills/local-transcript-grading/scripts/grade.mjs";
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? " -> " + String(extra).slice(0, 250) : "")); }
}

// mock model: grades everything at the honest level
const HONEST = { "Technical accuracy": 0.9, "Technical completeness": 0.85, "Introduction": 0.8,
  "Relevance": 0.75, "Summary": 0.8, "Conclusion": 0.7 };
const modelServer = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => { res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(HONEST) } }] })); });
});
await new Promise((r) => modelServer.listen(8935, "127.0.0.1", r));

const DB = new D1Shim();
DB.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
DB.exec(readFileSync(new URL("../worker/schema-transcript.sql", import.meta.url), "utf8"));
const env = { DB, DEV: "1", APP_ORIGIN: "http://local", ALLOWED_ORIGINS: "http://local",
  SEAL_SECRET: "seal-test-secret", MODEL_API_KEY: "mock-key", MAIL_URL: "", MAIL_SECRET: "x" };
const ctx = { waitUntil: (p) => p };
await DB.prepare("INSERT INTO t_settings (key, value_json, updated_at) VALUES ('model', ?, ?)")
  .bind(JSON.stringify({ provider: "mock", base_url: "http://127.0.0.1:8935", model: "mock-1" }), new Date().toISOString()).run();
const RUBRIC = Object.entries(HONEST).map(([name]) => ({ name, points: 5, guidance: "" }));
const past = new Date(Date.now() - 3600e3).toISOString();
const future = new Date(Date.now() + 86400e3).toISOString();
await DB.prepare(`INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, variations_json, opens_at, closes_at, created_at, updated_at)
  VALUES ('be-test1', 'prof@example.edu', 'Bernoulli transcript', 'http://local/app', 'bernoulli-equation', 'Grade it.', ?, '[]', ?, ?, ?, ?)`)
  .bind(JSON.stringify(RUBRIC), past, future, past, past).run();
await DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES ('be-test1', 'alice@example.edu', 'Alice A')").run();

// HTTP adapter over the Worker fetch handler
const adapter = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8936");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const wreq = new Request("http://127.0.0.1:8936" + url.pathname + url.search, {
    method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const wres = await worker.fetch(wreq, env, ctx);
  res.writeHead(wres.status, { "Content-Type": wres.headers.get("Content-Type") || "application/json" });
  res.end(await wres.text());
});
await new Promise((r) => adapter.listen(8936, "127.0.0.1", r));
const SERVER = "http://127.0.0.1:8936";

async function call(method, path, body, headers) {
  const req = new Request("http://local" + path, { method,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await worker.fetch(req, env, ctx);
  return { status: res.status, data: await res.json().catch(() => null) };
}
// seal a take through the API
await call("POST", "/t/login/request", { examId: "be-test1", email: "alice@example.edu" });
const mail = DB.query("SELECT body FROM outbox ORDER BY id DESC LIMIT 1")[0].body;
const tok = (mail.match(/login=([A-Za-z0-9_-]+)/) || [])[1];
const v = await call("POST", "/t/login/verify", { examId: "be-test1", token: tok });
const sess = v.data.session;
const opened = await call("POST", "/t/session", { examId: "be-test1" }, { "X-Student-Session": sess });
await call("POST", "/t/segment", { examId: "be-test1", slide: 1, title: "Bernoulli Equation", text: "This is the Bernoulli equation." }, { "X-Student-Session": sess });
const sealed = await call("POST", "/t/seal", { examId: "be-test1" }, { "X-Student-Session": sess });
const code = sealed.data.sessionCode;
const transcript = sealed.data.sealedTranscript;
check("setup: take sealed", !!code && !!transcript, JSON.stringify(sealed.data));

// skill: packet
const pkt = await run("node", [GRADE, "packet", SERVER, code]);
const packet = JSON.parse(pkt.stdout);
check("skill packet returns prompt, rubric, sealed transcript",
  packet.exam.rubric.length === 6 && packet.transcript === transcript, pkt.stdout.slice(0, 150));

// skill: verify exact and altered
writeFileSync("/tmp/t-exact.txt", transcript);
writeFileSync("/tmp/t-altered.txt", transcript.replace("Bernoulli equation", "Bernoulli idea"));
const okV = await run("node", [GRADE, "verify", SERVER, code, "/tmp/t-exact.txt"]);
check("skill verify accepts the exact transcript", JSON.parse(okV.stdout).match === true);
let alteredFailed = false;
try { await run("node", [GRADE, "verify", SERVER, code, "/tmp/t-altered.txt"]); }
catch (e) { alteredFailed = e.code === 1; }
check("skill verify refuses an altered transcript", alteredFailed);

// skill: submit
writeFileSync("/tmp/t-result.json", JSON.stringify({ critique: "Careful work.", grades: HONEST }));
const sub = await run("node", [GRADE, "submit", SERVER, code, "/tmp/t-result.json"]);
const subData = JSON.parse(sub.stdout);
check("skill submit uploads and is not flagged", subData.ok === true && subData.status === "graded", sub.stdout);

const row = DB.query("SELECT status, critique FROM t_submissions WHERE exam_id = 'be-test1'")[0];
check("server stored the critique", row && row.status === "graded" && row.critique === "Careful work.", JSON.stringify(row));

console.log("\n" + pass + " passed, " + fail + " failed");
adapter.close(); modelServer.close();
process.exit(fail ? 1 : 0);
