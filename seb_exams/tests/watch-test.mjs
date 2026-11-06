// Watch grading (option 2), server slice: /w/poll and /w/pending against the real
// Worker entry point, with D1/R2 shims. Covers the credential crypto round-trip,
// the pending count before and after an audio seal, the 15-minute claim rule
// (exclusion, expiry, clearing on critique upload), the keypoints flow field,
// and 401 for unknown and revoked credentials.
// Run from seb_exams/:  node tests/watch-test.mjs
import { readFileSync } from "node:fs";
import { D1Shim } from "./d1-shim.mjs";
import worker from "../worker/src/index.js";
import { createWatchCredentials, watchEncrypt, watchDecrypt } from "../worker/src/transcript.js";

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
  SEAL_SECRET: "watch-test-secret", MODEL_API_KEY: "", MAIL_URL: "", MAIL_SECRET: "x", ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };

async function call(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.session) headers["X-Student-Session"] = opts.session;
  if (opts.pollKey) headers["X-Poll-Key"] = opts.pollKey;
  if (opts.watchToken) headers["X-Watch-Token"] = opts.watchToken;
  let body;
  if (opts.raw !== undefined) { headers["Content-Type"] = "audio/wav"; body = opts.raw; }
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  const req = new Request("http://local" + path, { method, headers, body });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, text };
}

const RUBRIC = JSON.stringify([{ name: "Technical accuracy", points: 10, guidance: "" }]);
const now = new Date().toISOString();
const past = new Date(Date.now() - 3600e3).toISOString();
const future = new Date(Date.now() + 86400e3).toISOString();
async function makeExam(id, title) {
  await DB.prepare(`INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, variations_json, opens_at, closes_at, created_at, updated_at)
    VALUES (?, 'prof@example.edu', ?, '', 'assignment', 'Grade it.', ?, '[]', ?, ?, ?, ?)`)
    .bind(id, title, RUBRIC, past, future, now, now).run();
  await DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES (?, 'alice@example.edu', 'Alice A')").bind(id).run();
  await DB.prepare("INSERT INTO k_keys (exam_id, key_json, total_points, approved_at, updated_at) VALUES (?, ?, 10, ?, ?)")
    .bind(id, JSON.stringify({ points: [{ text: "Point one", connection: "", points: 10 }] }), now, now).run();
}
await makeExam("wa-test1", "Watch keypoints exam 1");
await makeExam("wa-kp001", "Watch keypoints exam");

async function signIn(examId, email) {
  await call("POST", "/t/login/request", { body: { examId, email } });
  const rows = DB.query("SELECT body FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1", email);
  const tok = (rows[0].body.match(/login=([A-Za-z0-9_-]+)/) || [])[1];
  const v = await call("POST", "/t/login/verify", { body: { examId, token: tok } });
  return v.data.session;
}

const WAV = Buffer.alloc(3200, 7);
async function audioTake(examId, sess) {
  const s = await call("POST", "/t/session", { session: sess, body: { examId } });
  await call("POST", "/t/audio-segment?examId=" + examId + "&slide=1&title=Explanation", { session: sess, raw: WAV });
  const seal = await call("POST", "/t/seal", { session: sess, body: { examId } });
  return { code: s.data.sessionCode, seal };
}

// ---- credentials: creation, hash-only auth material, decrypt round-trip --------
const creds = await createWatchCredentials(env, "wa-test1", "alice@example.edu", "Alice A");
check("credentials created", creds.created === true && typeof creds.token === "string" && typeof creds.pollKey === "string");
const again = await createWatchCredentials(env, "wa-test1", "alice@example.edu", "Alice A");
check("second create is a no-op (existing kept)", again.created === false && !again.token);
const wrow = DB.query("SELECT * FROM t_watch_tokens WHERE exam_id = 'wa-test1' AND email = 'alice@example.edu'")[0];
check("stored row carries no plaintext credential", !!wrow && !JSON.stringify(wrow).includes(creds.token) && !JSON.stringify(wrow).includes(creds.pollKey));
check("decrypt round-trip: grading token", (await watchDecrypt(env, wrow.token_enc)) === creds.token);
check("decrypt round-trip: poll key", (await watchDecrypt(env, wrow.poll_enc)) === creds.pollKey);
check("encrypt/decrypt round-trip on a fresh value", (await watchDecrypt(env, await watchEncrypt(env, "round-trip-value"))) === "round-trip-value");
let badKeyThrew = false;
try { await watchDecrypt({ ...env, SEAL_SECRET: "a-different-secret" }, wrow.token_enc); } catch { badKeyThrew = true; }
check("decrypt with the wrong SEAL_SECRET fails (bad-key path)", badKeyThrew);

// ---- poll / pending: nothing sealed yet -----------------------------------------
let r = await call("GET", "/w/poll", { pollKey: "unknown-poll-key-000000" });
check("poll with an unknown key is 401", r.status === 401, r.status);
r = await call("GET", "/w/pending", { watchToken: "unknown-watch-token-0000" });
check("pending with an unknown token is 401", r.status === 401, r.status);
r = await call("GET", "/w/poll", { pollKey: creds.token });
check("the grading token does not work as a poll key", r.status === 401, r.status);
r = await call("GET", "/w/poll", { pollKey: creds.pollKey });
check("poll with no sealed take reports 0", r.status === 200 && r.data.pending === 0, JSON.stringify(r.data));
let stamps = DB.query("SELECT last_poll_at, last_pending_at FROM t_watch_tokens WHERE exam_id = 'wa-test1'")[0];
check("poll stamps last_poll_at only", !!stamps.last_poll_at && stamps.last_pending_at === null, JSON.stringify(stamps));

// ---- an audio seal makes the take pending ----------------------------------------
const aSess = await signIn("wa-test1", "alice@example.edu");
const take = await audioTake("wa-test1", aSess);
check("audio take sealed", take.seal.status === 200 && take.seal.data.sealedTranscript === null, JSON.stringify(take.seal.data));
r = await call("GET", "/w/poll", { pollKey: creds.pollKey });
check("poll after the audio seal reports 1", r.status === 200 && r.data.pending === 1, JSON.stringify(r.data));
stamps = DB.query("SELECT last_pending_at FROM t_watch_tokens WHERE exam_id = 'wa-test1'")[0];
check("a positive poll stamps last_pending_at", !!stamps.last_pending_at);
r = await call("GET", "/w/pending", { watchToken: creds.token });
check("pending lists the take with the keypoints flow", r.status === 200 && r.data.takes.length === 1
  && r.data.takes[0].examId === "wa-test1" && r.data.takes[0].title === "Watch keypoints exam 1"
  && r.data.takes[0].sessionCode === take.code && r.data.takes[0].status === "audio_sealed"
  && r.data.takes[0].flow === "keypoints" && !!r.data.takes[0].sealedAt, JSON.stringify(r.data));

// ---- the claim rule: excluded until expiry, back after, gone after submit --------
r = await call("GET", "/w/pending", { watchToken: creds.token });
check("a claimed take is not listed again", r.status === 200 && r.data.takes.length === 0, JSON.stringify(r.data));
r = await call("GET", "/w/poll", { pollKey: creds.pollKey });
check("a claimed take does not count as pending", r.status === 200 && r.data.pending === 0, JSON.stringify(r.data));
await DB.prepare("UPDATE t_submissions SET watch_claim_at = ? WHERE exam_id = 'wa-test1'")
  .bind(new Date(Date.now() - 16 * 60e3).toISOString()).run();
r = await call("GET", "/w/pending", { watchToken: creds.token });
check("the take reappears after the claim expires", r.status === 200 && r.data.takes.length === 1, JSON.stringify(r.data));
r = await call("POST", "/t/critique", { body: { sessionCode: take.code,
  transcript: "1 (Explanation): Words from the sealed audio.", critique: "Graded by the student's Muse.",
  grades: { "Technical accuracy": 0.9 } } });
check("critique upload succeeds", r.status === 200 && r.data.status === "graded", JSON.stringify(r.data));
const claimAfter = DB.query("SELECT watch_claim_at FROM t_submissions WHERE exam_id = 'wa-test1'")[0];
check("the critique upload clears the claim", claimAfter.watch_claim_at === null, JSON.stringify(claimAfter));
r = await call("GET", "/w/pending", { watchToken: creds.token });
check("a graded take is not pending", r.status === 200 && r.data.takes.length === 0, JSON.stringify(r.data));
r = await call("GET", "/w/poll", { pollKey: creds.pollKey });
check("poll is back to 0 after grading", r.status === 200 && r.data.pending === 0, JSON.stringify(r.data));

// ---- keypoints flow ----------------------------------------------------------------
const kpCreds = await createWatchCredentials(env, "wa-kp001", "alice@example.edu", "Alice A");
const kSess = await signIn("wa-kp001", "alice@example.edu");
await audioTake("wa-kp001", kSess);
r = await call("GET", "/w/pending", { watchToken: kpCreds.token });
check("pending marks a keypoints exam's take as flow=keypoints", r.status === 200 && r.data.takes.length === 1
  && r.data.takes[0].flow === "keypoints" && r.data.takes[0].examId === "wa-kp001", JSON.stringify(r.data));

// ---- revocation: deleting the row kills both credentials at once -------------------
await DB.prepare("DELETE FROM t_watch_tokens WHERE exam_id = 'wa-test1' AND email = 'alice@example.edu'").run();
r = await call("GET", "/w/poll", { pollKey: creds.pollKey });
check("poll with a revoked (deleted) key is 401", r.status === 401, r.status);
r = await call("GET", "/w/pending", { watchToken: creds.token });
check("pending with a revoked (deleted) token is 401", r.status === 401, r.status);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
