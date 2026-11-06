// Watch grading, teacher slice: the /api/t/exams/:id/watch-tokens routes and the
// "Muse tokens" management rules against the real Worker entry point.
// Covers: metadata-only list (no token, poll key, or encrypted values anywhere in
// the response), add as a no-op for existing students, regenerate replacing BOTH
// credentials with the old ones refused at once, per-recipient setup emails
// (one outbox row each, addressed only to that student, containing only that
// student's token), email creating credentials for a student with no row, and a
// corrupted stored token yielding the per-row regenerate error while another
// student's email still succeeds.
// Run from seb_exams/:  node tests/watch-api-test.mjs
import { readFileSync } from "node:fs";
import { D1Shim } from "./d1-shim.mjs";
import worker from "../worker/src/index.js";
import { watchDecrypt } from "../worker/src/transcript.js";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -> " + String(extra).slice(0, 300) : "")); }
}

const DB = new D1Shim();
DB.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
DB.exec(readFileSync(new URL("../worker/schema-transcript.sql", import.meta.url), "utf8"));
class R2Shim {
  constructor() { this.map = new Map(); }
  async put(key, value) { this.map.set(key, Buffer.from(await new Response(value).arrayBuffer())); }
  async get(key) { const b = this.map.get(key); if (!b) return null;
    return { body: new Uint8Array(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
  async delete(key) { this.map.delete(key); }
}
const env = { DB, AUDIO: new R2Shim(), DEV: "1", APP_ORIGIN: "http://local", ALLOWED_ORIGINS: "http://local",
  SEAL_SECRET: "watch-api-test-secret", MODEL_API_KEY: "", MAIL_URL: "", MAIL_SECRET: "x", ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };

async function call(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.pollKey) headers["X-Poll-Key"] = opts.pollKey;
  if (opts.watchToken) headers["X-Watch-Token"] = opts.watchToken;
  let body;
  if (opts.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = opts.form; }
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  const req = new Request("http://local" + path, { method, headers, body });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, text, headers: res.headers };
}

// ---- teacher sign-in through the real auth flow --------------------------------
let r = await call("POST", "/auth/request", { body: { email: "prof@example.edu" } });
const loginTok = (DB.query("SELECT body FROM outbox ORDER BY id DESC LIMIT 1")[0].body.match(/token=([A-Za-z0-9_-]+)/) || [])[1];
r = await call("POST", "/auth/verify", { form: "token=" + loginTok });
const cookie = (r.headers.get("Set-Cookie") || "").split(";")[0];
check("teacher signed in", r.status === 303 && cookie.startsWith("sid="), r.status + " " + cookie);

// ---- exam + roster --------------------------------------------------------------
const past = new Date(Date.now() - 3600e3).toISOString();
const future = new Date(Date.now() + 86400e3).toISOString();
r = await call("POST", "/api/t/exams", { cookie, body: {
  title: "Watch API exam", app_url: "http://local/app", assignment: "assignment",
  prompt: "Grade it.", rubric: [{ name: "Technical accuracy", points: 10, guidance: "" }],
  opens_at: past, closes_at: future } });
check("exam created", r.status === 200 && !!r.data.id, JSON.stringify(r.data));
const examId = r.data.id;
const W = "/api/t/exams/" + examId + "/watch-tokens";
await call("PUT", "/api/t/exams/" + examId + "/roster", { cookie,
  body: { csv: "Alice A,alice@example.edu\nBen B,ben@example.edu\nCarol C,carol@example.edu" } });

const rowOf = (email) => DB.query("SELECT * FROM t_watch_tokens WHERE exam_id = ? AND email = ?", examId, email)[0];
const plainOf = async (email) => { const row = rowOf(email);
  return { token: await watchDecrypt(env, row.token_enc), pollKey: await watchDecrypt(env, row.poll_enc) }; };
const setupMail = () => DB.query("SELECT to_email, body FROM outbox WHERE subject LIKE 'Your Muse watch-grading setup%' ORDER BY id");

// ---- add: creates only where none exists ----------------------------------------
r = await call("POST", W, { cookie, body: { entries: "Alice A, alice@example.edu\nBen B, ben@example.edu" } });
check("add creates two students", r.status === 200 && r.data.added === 2 && r.data.existing === 0, JSON.stringify(r.data));
const aliceHash1 = rowOf("alice@example.edu").token_hash, benHash1 = rowOf("ben@example.edu").token_hash;
r = await call("POST", W, { cookie, body: { entries: "Alice A, alice@example.edu\nBen B, ben@example.edu" } });
check("re-adding existing students is a no-op", r.status === 200 && r.data.added === 0 && r.data.existing === 2, JSON.stringify(r.data));
check("no-op add leaves the stored token unchanged",
  rowOf("alice@example.edu").token_hash === aliceHash1 && rowOf("ben@example.edu").token_hash === benHash1);
r = await call("POST", W, { cookie, body: { emails: ["carol@example.edu"] } });
check("add by emails array creates the third student", r.status === 200 && r.data.added === 1 && r.data.existing === 0, JSON.stringify(r.data));
r = await call("GET", W);
check("watch-tokens API rejects signed-out requests", r.status === 401, r.status);

// ---- list: metadata only, no credential material of any kind ---------------------
r = await call("GET", W, { cookie });
check("list returns the three students", r.status === 200 && r.data.tokens.length === 3
  && r.data.tokens.every((x) => x.status === "active" && x.created_at), JSON.stringify(r.data).slice(0, 200));
let leak = null;
for (const email of ["alice@example.edu", "ben@example.edu", "carol@example.edu"]) {
  const row = rowOf(email), plain = await plainOf(email);
  for (const secret of [plain.token, plain.pollKey, row.token_enc, row.poll_enc, row.token_hash, row.poll_hash]) {
    if (secret && r.text.includes(secret)) leak = email;
  }
}
check("list contains no token, poll key, or encrypted/hash values", leak === null, leak || "");
check("list names no credential fields", !/token_enc|poll_enc|token_hash|poll_hash/.test(r.text), r.text.slice(0, 200));

// ---- email selected: one individually addressed message per student --------------
const mailBefore = setupMail().length;
r = await call("POST", W + "/email", { cookie, body: { emails: ["alice@example.edu", "ben@example.edu"] } });
check("email to two students reports both sent", r.status === 200 && r.data.results.length === 2
  && r.data.results.every((x) => x.sent === true), JSON.stringify(r.data));
const newMail = setupMail().slice(mailBefore);
check("one outbox row per recipient", newMail.length === 2, newMail.length);
const alicePlain = await plainOf("alice@example.edu"), benPlain = await plainOf("ben@example.edu");
const aliceMail = newMail.find((m) => m.to_email === "alice@example.edu");
const benMail = newMail.find((m) => m.to_email === "ben@example.edu");
check("each setup email is addressed only to its own student", !!aliceMail && !!benMail);
check("Alice's email contains her token and poll key, and not Ben's",
  !!aliceMail && aliceMail.body.includes(alicePlain.token) && aliceMail.body.includes(alicePlain.pollKey)
  && !aliceMail.body.includes(benPlain.token) && !aliceMail.body.includes(benPlain.pollKey));
check("Ben's email contains his token, and not Alice's",
  !!benMail && benMail.body.includes(benPlain.token) && !benMail.body.includes(alicePlain.token));
check("setup email carries the server, the skill links and the check-now phrase",
  !!aliceMail && aliceMail.body.includes("http://local") && aliceMail.body.includes("check now")
  && aliceMail.body.includes("keypoints-grading-skill")
  && aliceMail.body.includes("watch-grading-skill"));
check("setup email no longer mentions the transcript-grading skill",
  !!aliceMail && !aliceMail.body.includes("transcript-grading"));
check("last_emailed_at stamped on success for both",
  !!rowOf("alice@example.edu").last_emailed_at && !!rowOf("ben@example.edu").last_emailed_at
  && rowOf("carol@example.edu").last_emailed_at === null);

// ---- email all ---------------------------------------------------------------------
const allBefore = setupMail().length;
r = await call("POST", W + "/email", { cookie, body: { all: true } });
check("email all covers the roster and token list", r.status === 200 && r.data.results.length === 3
  && r.data.results.every((x) => x.sent === true), JSON.stringify(r.data));
check("email all adds one outbox row per student", setupMail().length - allBefore === 3);

// ---- email to a student with no row creates credentials first ----------------------
check("Dave has no watch row yet", !rowOf("dave@example.edu"));
r = await call("POST", W + "/email", { cookie, body: { emails: ["dave@example.edu"] } });
check("email to a student with no row sends", r.status === 200 && r.data.results[0].sent === true, JSON.stringify(r.data));
check("the email action created Dave's credentials", !!rowOf("dave@example.edu") && !!rowOf("dave@example.edu").last_emailed_at);

// ---- corrupted stored token: per-row regenerate error, the batch continues --------
await DB.prepare("UPDATE t_watch_tokens SET token_enc = 'AAAAcorrupted-value' WHERE exam_id = ? AND email = 'carol@example.edu'")
  .bind(examId).run();
const carolStamp = rowOf("carol@example.edu").last_emailed_at;
r = await call("POST", W + "/email", { cookie, body: { emails: ["carol@example.edu", "dave@example.edu"] } });
const carolRes = r.data && r.data.results.find((x) => x.email === "carol@example.edu");
const daveRes = r.data && r.data.results.find((x) => x.email === "dave@example.edu");
check("corrupted row yields the regenerate error, not a 500", r.status === 200 && !!carolRes
  && carolRes.error === "stored token cannot be read — regenerate it", JSON.stringify(r.data));
check("the other student's email in the same batch still succeeds", !!daveRes && daveRes.sent === true, JSON.stringify(r.data));
check("a failed email does not stamp last_emailed_at", rowOf("carol@example.edu").last_emailed_at === carolStamp);

// ---- regenerate: both credentials replaced, old ones refused at once ---------------
const aliceOld = await plainOf("alice@example.edu");
r = await call("POST", W + "/regenerate", { cookie, body: { email: "alice@example.edu" } });
check("regenerate returns metadata only", r.status === 200 && r.data.token && r.data.token.email === "alice@example.edu"
  && !r.text.includes(aliceOld.token) && !r.text.includes(aliceOld.pollKey), r.text.slice(0, 200));
const aliceNew = await plainOf("alice@example.edu");
check("regenerate changed both credentials", aliceNew.token !== aliceOld.token && aliceNew.pollKey !== aliceOld.pollKey);
r = await call("GET", "/w/poll", { pollKey: aliceOld.pollKey });
check("the old poll key is refused at once (401)", r.status === 401, r.status);
r = await call("GET", "/w/pending", { watchToken: aliceOld.token });
check("the old grading token is refused at once (401)", r.status === 401, r.status);
r = await call("GET", "/w/poll", { pollKey: aliceNew.pollKey });
check("the new poll key works", r.status === 200 && r.data.pending === 0, JSON.stringify(r.data));
r = await call("GET", "/w/pending", { watchToken: aliceNew.token });
check("the new grading token works", r.status === 200 && Array.isArray(r.data.takes), JSON.stringify(r.data));

// ---- delete: the row goes and both credentials die --------------------------------
r = await call("DELETE", W, { cookie, body: { emails: ["ben@example.edu"] } });
check("delete removes the row", r.status === 200 && r.data.removed === 1 && !rowOf("ben@example.edu"), JSON.stringify(r.data));
r = await call("GET", "/w/poll", { pollKey: benPlain.pollKey });
check("a deleted student's poll key is refused (401)", r.status === 401, r.status);
r = await call("GET", "/w/pending", { watchToken: benPlain.token });
check("a deleted student's grading token is refused (401)", r.status === 401, r.status);
r = await call("GET", W, { cookie });
check("the list no longer shows the deleted student",
  r.status === 200 && !r.data.tokens.some((x) => x.email === "ben@example.edu"), JSON.stringify(r.data).slice(0, 200));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
