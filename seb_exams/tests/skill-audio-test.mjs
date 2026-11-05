// Test: the grading skill's audio mode against the real Worker over HTTP.
// Seals an audio take, then drives grade.mjs: packet -> audio -> submit.
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { D1Shim } from "/home/hatch/workspace/transcript-exams-build/seb_exams/tests/d1-shim.mjs";
import worker from "/home/hatch/workspace/transcript-exams-build/seb_exams/worker/src/index.js";
const run = promisify(execFile);
const GRADE = "/home/hatch/workspace/custom-skills/local-transcript-grading/scripts/grade.mjs";
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log("PASS  " + n); } else { fail++; console.log("FAIL  " + n + " -> " + String(x).slice(0, 250)); } };

class R2Shim {
  constructor() { this.map = new Map(); }
  async put(k, v) { this.map.set(k, Buffer.from(await new Response(v).arrayBuffer())); }
  async get(k) { const b = this.map.get(k); return b ? { body: new Uint8Array(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null; }
  async delete(k) { this.map.delete(k); }
}
const DB = new D1Shim();
DB.exec(readFileSync("/home/hatch/workspace/transcript-exams-build/seb_exams/worker/schema.sql", "utf8"));
DB.exec(readFileSync("/home/hatch/workspace/transcript-exams-build/seb_exams/worker/schema-transcript.sql", "utf8"));
const env = { DB, AUDIO: new R2Shim(), DEV: "1", APP_ORIGIN: "http://local", ALLOWED_ORIGINS: "http://local",
  SEAL_SECRET: "x".repeat(32), MODEL_API_KEY: "", MAIL_URL: "", MAIL_SECRET: "x", ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };
const past = new Date(Date.now() - 3600e3).toISOString(), future = new Date(Date.now() + 86400e3).toISOString();
const RUBRIC = ["Technical accuracy", "Technical completeness", "Introduction", "Relevance", "Summary", "Conclusion"].map((name) => ({ name, points: 5, guidance: "" }));
await DB.prepare(`INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, variations_json, opens_at, closes_at, created_at, updated_at)
  VALUES ('be-test1', 'prof@example.edu', 'Bernoulli transcript', 'http://local/app', 'bernoulli-equation', 'Grade it.', ?, '[]', ?, ?, ?, ?)`)
  .bind(JSON.stringify(RUBRIC), past, future, past, past).run();
await DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES ('be-test1', 'alice@example.edu', 'Alice A')").run();

const adapter = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8937");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const wreq = new Request("http://127.0.0.1:8937" + url.pathname + url.search, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const wres = await worker.fetch(wreq, env, ctx);
  const buf = Buffer.from(await wres.arrayBuffer());
  res.writeHead(wres.status, { "Content-Type": wres.headers.get("Content-Type") || "application/json" });
  res.end(buf);
});
await new Promise((r) => adapter.listen(8937, "127.0.0.1", r));
const SERVER = "http://127.0.0.1:8937";
async function call(method, path, body, headers, raw) {
  const req = new Request("http://local" + path, { method, headers: { ...(raw ? { "Content-Type": "audio/wav" } : { "Content-Type": "application/json" }), ...(headers || {}) },
    body: raw || (body === undefined ? undefined : JSON.stringify(body)) });
  const res = await worker.fetch(req, env, ctx);
  return { status: res.status, data: await res.json().catch(() => null) };
}
await call("POST", "/t/login/request", { examId: "be-test1", email: "alice@example.edu" });
const mail = DB.query("SELECT body FROM outbox ORDER BY id DESC LIMIT 1")[0].body;
const tok = (mail.match(/login=([A-Za-z0-9_-]+)/) || [])[1];
const v = await call("POST", "/t/login/verify", { examId: "be-test1", token: tok });
const sess = { "X-Student-Session": v.data.session };
await call("POST", "/t/session", { examId: "be-test1" }, sess);
const wav = new TextEncoder().encode("FAKE-WAV-ONE").buffer;
await call("POST", "/t/audio-segment?examId=be-test1&slide=1&title=Bernoulli%20Equation", undefined, sess, wav);
const sealed = await call("POST", "/t/seal", { examId: "be-test1" }, sess);
const code = sealed.data.sessionCode;
check("setup: audio take sealed", sealed.status === 200 && sealed.data.transcriptionStatus === "not_configured" && !!sealed.data.audioFingerprint, JSON.stringify(sealed.data));

const pkt = JSON.parse((await run("node", [GRADE, "packet", SERVER, code])).stdout);
check("skill packet shows audio, no transcript", pkt.transcript === null && pkt.audio.length === 1 && !!pkt.audioFingerprint);
const man = JSON.parse((await run("node", [GRADE, "audio", SERVER, code, "/tmp/skill-audio-out"])).stdout);
check("skill audio mode downloads the segment", man.segments.length === 1 && existsSync("/tmp/skill-audio-out/slide-1.wav")
  && readFileSync("/tmp/skill-audio-out/slide-1.wav", "utf8") === "FAKE-WAV-ONE", JSON.stringify(man));
const grades = Object.fromEntries(RUBRIC.map((r) => [r.name, 0.8]));
writeFileSync("/tmp/skill-audio-result.json", JSON.stringify({ transcript: "1 (Bernoulli Equation): Words from audio one.", critique: "Solid explanation.", grades }));
const sub = JSON.parse((await run("node", [GRADE, "submit", SERVER, code, "/tmp/skill-audio-result.json"])).stdout);
check("skill submit uploads transcript, critique, grades", sub.ok === true && sub.status === "graded", JSON.stringify(sub));
const row = DB.query("SELECT student_transcript, status FROM t_submissions WHERE exam_id = 'be-test1'")[0];
check("server stored the student transcript", row.student_transcript.includes("Words from audio one.") && row.status === "graded", JSON.stringify(row));
adapter.close();
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
