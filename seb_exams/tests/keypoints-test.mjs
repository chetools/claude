// Keypoints assignments: end-to-end test of the /k/* extension against the real
// Worker entry point, with D1/R2 shims. Covers the page and key writes (audit
// token), the model-take identity, a student take graded against the key, and
// the standing (best) grade across attempts.
// Run from seb_exams/:  node tests/keypoints-test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { D1Shim } from "./d1-shim.mjs";
import worker from "../worker/src/index.js";

const sha = (s) => createHash("sha256").update(s).digest("hex");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + String(extra).slice(0, 300) : "")); }
}

const DB = new D1Shim();
DB.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
DB.exec(readFileSync(new URL("../worker/schema-transcript.sql", import.meta.url), "utf8"));
DB.exec(readFileSync(new URL("../worker/schema-keypoints.sql", import.meta.url), "utf8"));
class R2Shim {
  constructor() { this.map = new Map(); }
  async put(key, value) { this.map.set(key, Buffer.from(await new Response(value).arrayBuffer())); }
  async get(key) { const b = this.map.get(key); if (!b) return null;
    return { body: new Uint8Array(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
  async delete(key) { this.map.delete(key); }
}
const env = { DB, AUDIO: new R2Shim(), DEV: "1", APP_ORIGIN: "http://local", ALLOWED_ORIGINS: "http://local",
  SEAL_SECRET: "test-secret", MODEL_API_KEY: "", MAIL_URL: "", MAIL_SECRET: "x", ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };

async function call(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.session) headers["X-Student-Session"] = opts.session;
  if (opts.audit) headers["X-Audit-Token"] = opts.audit;
  let body;
  if (opts.raw !== undefined) { headers["Content-Type"] = "audio/wav"; body = opts.raw; }
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  const req = new Request("http://local" + path, { method, headers, body });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, text };
}

const EXAM = "kp-test1", AUDIT = "audit-token-for-kp-test";
const now = new Date().toISOString();
await DB.prepare(`INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, variations_json, audit_token_hash, opens_at, closes_at, created_at, updated_at)
  VALUES (?, 'prof@example.edu', 'Flash separation', '', 'keypoints', '', '[]', '[]', ?, ?, ?, ?, ?)`)
  .bind(EXAM, sha(AUDIT), new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 86400e3).toISOString(), now, now).run();
await DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES (?, 'alice@example.edu', 'Alice A')").bind(EXAM).run();

async function signIn(email) {
  await call("POST", "/t/login/request", { body: { examId: EXAM, email } });
  const rows = DB.query("SELECT body FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1", email);
  const tok = (rows[0].body.match(/login=([A-Za-z0-9_-]+)/) || [])[1];
  const v = await call("POST", "/t/login/verify", { body: { examId: EXAM, token: tok } });
  return v.data.session;
}

const WAV = Buffer.alloc(3200, 7); // a stand-in segment; the server stores bytes, it does not decode
async function take(sess) {
  const s = await call("POST", "/t/session", { session: sess, body: { examId: EXAM } });
  const code = s.data.sessionCode;
  const seg = await call("POST", "/t/audio-segment?examId=" + EXAM + "&slide=1&title=Explanation", { session: sess, raw: WAV });
  const seal = await call("POST", "/t/seal", { session: sess, body: { examId: EXAM } });
  return { code, segStatus: seg.status, sealStatus: seal.status, seal: seal.data };
}

// ---- page and key -------------------------------------------------------------
let r = await call("POST", "/k/page", { body: { examId: EXAM, pageHtml: "<div class=\"tblock\">x</div>", photos: 3 } });
check("page write without audit token is refused", r.status === 401, r.status);
r = await call("POST", "/k/page", { audit: AUDIT, body: { examId: EXAM, pageHtml: "<div class=\"tblock\"><div class=\"teq\">F = V + L</div><div class=\"tnote\">feed</div></div>", latex: "F = V + L", photos: 3 } });
check("page write with audit token succeeds", r.status === 200 && r.data.ok === true, r.text);
r = await call("GET", "/k/page?exam=" + EXAM);
check("page is served, assignment not yet open", r.status === 200 && r.data.open === false && r.data.pageHtml.includes("F = V + L"), r.text);

r = await call("POST", "/k/model-roster", { audit: AUDIT, body: { examId: EXAM, email: "prof@example.edu", name: "Prof (model)" } });
check("model roster enrolment succeeds", r.status === 200 && r.data.role === "model", r.text);

// ---- model take -----------------------------------------------------------------
const profSess = await signIn("prof@example.edu");
check("teacher (model) can sign in", !!profSess);
r = await call("GET", "/k/role?exam=" + EXAM, { session: profSess });
check("role reports model", r.status === 200 && r.data.role === "model", r.text);
const modelTake = await take(profSess);
check("model take seals by audio", modelTake.sealStatus === 200 && !!modelTake.seal.audioFingerprint, JSON.stringify(modelTake.seal));
r = await call("GET", "/k/model?exam=" + EXAM, { audit: AUDIT });
check("model take is findable by the teacher skill", r.status === 200 && r.data.model && r.data.model.sessionCode === modelTake.code, r.text);
r = await call("GET", "/k/standing?session=" + modelTake.code);
check("standing for a model take is empty", r.status === 200 && r.data.standing === null && r.data.attempts.length === 0, r.text);

// ---- the key ----------------------------------------------------------------------
const KEY = { points: [
  { text: "Balances stated and symbols defined.", connection: "", points: 15 },
  { text: "Equilibrium relation and the source of K.", connection: "", points: 20 },
  { text: "Vapour fraction defined; summation to one equation.", connection: "Rests on points 1 and 2", points: 25 },
] };
r = await call("POST", "/k/key", { audit: "wrong-token-00000000", body: { examId: EXAM, key: KEY } });
check("key write with a bad audit token is refused", r.status === 401, r.status);
r = await call("POST", "/k/key", { audit: AUDIT, body: { examId: EXAM, key: KEY } });
check("key write succeeds with its total", r.status === 200 && r.data.totalPoints === 60, r.text);
const examRow = DB.query("SELECT rubric_json FROM t_exams WHERE id = ?", EXAM)[0];
const rubric = JSON.parse(examRow.rubric_json);
check("key is projected onto the rubric", rubric.length === 3 && rubric[2].name === "Point 3" && rubric[2].guidance.includes("Rests on points 1 and 2"), examRow.rubric_json);
r = await call("GET", "/k/page?exam=" + EXAM);
check("assignment is open once the key is approved", r.status === 200 && r.data.open === true, r.text);
r = await call("GET", "/k/key-session?session=" + modelTake.code);
check("key-session returns the key for the sealed model take", r.status === 200 && r.data.role === "model" && r.data.key.points.length === 3, r.text);

// ---- student attempts ---------------------------------------------------------------
const aliceSess = await signIn("alice@example.edu");
r = await call("GET", "/k/role?exam=" + EXAM, { session: aliceSess });
check("role reports student", r.status === 200 && r.data.role === "student", r.text);

const a1 = await take(aliceSess);
check("attempt 1 seals", a1.sealStatus === 200, a1.sealStatus);
const packet = await call("GET", "/t/packet?session=" + a1.code);
check("packet carries the key as rubric guidance", packet.status === 200 && packet.data.exam.rubric.length === 3
  && packet.data.exam.rubric[0].guidance.includes("Balances stated"), packet.text.slice(0, 200));
r = await call("POST", "/t/critique", { body: { sessionCode: a1.code, transcript: "I explained some of it.",
  critique: "Feedback one.", grades: { "Point 1": 1, "Point 2": 0.5, "Point 3": 0 } } });
check("attempt 1 critique upload succeeds", r.status === 200 && r.data.ok === true, r.text);
r = await call("GET", "/k/standing?session=" + a1.code);
check("standing after attempt 1 is 25 of 60", r.status === 200 && r.data.standing === 25 && r.data.max === 60 && r.data.attempts.length === 1, r.text);

const a2 = await take(aliceSess);
await call("POST", "/t/critique", { body: { sessionCode: a2.code, transcript: "I explained nearly all of it.",
  critique: "Feedback two.", grades: { "Point 1": 1, "Point 2": 1, "Point 3": 0.5 } } });
r = await call("GET", "/k/standing?session=" + a2.code);
check("standing rises to the best attempt (47.5)", r.status === 200 && r.data.standing === 47.5 && r.data.attempts.length === 2, r.text);

const a3 = await take(aliceSess);
await call("POST", "/t/critique", { body: { sessionCode: a3.code, transcript: "A worse try.",
  critique: "Feedback three.", grades: { "Point 1": 0.5, "Point 2": 0, "Point 3": 0 } } });
r = await call("GET", "/k/standing?session=" + a3.code);
check("a worse attempt never lowers the standing grade", r.status === 200 && r.data.standing === 47.5 && r.data.attempts.length === 3, r.text);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
