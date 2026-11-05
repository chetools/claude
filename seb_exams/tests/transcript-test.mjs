// End-to-end test of the transcript-exam extension against the real Worker
// entry point, with a D1 shim and a mock model server for the audit re-grade.
// Run from seb_exams/:  node tests/transcript-test.mjs
import http from "node:http";
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

// ---- mock model server --------------------------------------------------
let auditFractions = {};
const modelServer = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => { chunks.push(c); });
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("latin1");
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url.includes("audio/transcriptions")) {
      const text = body.includes("slide-1") ? "Words from audio one." : "Words from audio two.";
      res.end(JSON.stringify({ text }));
    } else {
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(auditFractions) } }] }));
    }
  });
});
await new Promise((r) => modelServer.listen(8932, "127.0.0.1", r));

// ---- worker environment ---------------------------------------------------
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
const AUDIO = new R2Shim();
const env = { DB, AUDIO, DEV: "1", APP_ORIGIN: "http://local", ALLOWED_ORIGINS: "http://local",
  SEAL_SECRET: "seal-test-secret", MODEL_API_KEY: "mock-key", MAIL_URL: "", MAIL_SECRET: "x",
  ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };

async function call(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.session) headers["X-Student-Session"] = opts.session;
  let body;
  if (opts.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = opts.form; }
  else if (opts.raw !== undefined) { headers["Content-Type"] = "audio/wav"; body = opts.raw; }
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  const req = new Request("http://local" + path, { method, headers, body });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* html or csv */ }
  return { status: res.status, data, text, headers: res.headers };
}

// ---- teacher sign-in through the real auth flow ---------------------------
let r = await call("POST", "/auth/request", { body: { email: "prof@example.edu" } });
check("teacher login link requested", r.status === 200);
const outbox = DB.query("SELECT body FROM outbox ORDER BY id DESC LIMIT 1");
const token = (outbox[0].body.match(/token=([A-Za-z0-9_-]+)/) || [])[1];
check("login token found in outbox (DEV mail)", !!token);
r = await call("POST", "/auth/verify", { form: "token=" + token });
const cookie = (r.headers.get("Set-Cookie") || "").split(";")[0];
check("teacher session cookie issued", r.status === 303 && cookie.startsWith("sid="), r.status + " " + cookie);
r = await call("GET", "/api/t/exams");
check("teacher API rejects signed-out request", r.status === 401, r.status);

// ---- model settings -------------------------------------------------------
r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "mock-whisper" } });
check("model settings saved", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("GET", "/api/t/settings/model", { cookie });
check("model settings read back, key not exposed", r.data.model === "mock-1" && r.data.transcribe_model === "mock-whisper" && r.data.audio_configured === true && r.data.key_configured === true && !JSON.stringify(r.data).includes("mock-key"));

// ---- create the pilot exam --------------------------------------------------
const RUBRIC = [
  { name: "Technical accuracy", points: 10, guidance: "Terms, signs and subscripts correct." },
  { name: "Technical completeness", points: 10, guidance: "Every equation explained in full." },
  { name: "Introduction", points: 5, guidance: "The introduction sets up what follows." },
  { name: "Relevance", points: 5, guidance: "Why the result matters is established." },
  { name: "Summary", points: 5, guidance: "The summary covers what was derived." },
  { name: "Conclusion", points: 5, guidance: "A conclusion is drawn." },
];
const past = new Date(Date.now() - 3600e3).toISOString();
const future = new Date(Date.now() + 86400e3).toISOString();
r = await call("POST", "/api/t/exams", { cookie, body: {
  title: "Bernoulli transcript", app_url: "http://local/app", assignment: "bernoulli-equation",
  prompt: "Grade the explanation of the Bernoulli equation.", rubric: RUBRIC,
  variations: ["(a) Explain 9 to a first-year student.", "(b) State what changes if friction is not zero."],
  opens_at: past, closes_at: future } });
check("exam created", r.status === 200 && !!r.data.id, JSON.stringify(r.data));
const examId = r.data.id;

// ---- roster -------------------------------------------------------------------
r = await call("PUT", `/api/t/exams/${examId}/roster`, { cookie, body: { csv: "Alice A,alice@example.edu\nBen B,ben@example.edu\nDan D,dan@example.edu\nEve E,eve@example.edu\nFrank F,frank@example.edu\nGrace G,grace@example.edu" } });
check("roster imported", r.status === 200 && r.data.count === 6, JSON.stringify(r.data));

// ---- student login --------------------------------------------------------------
async function studentLogin(email) {
  await call("POST", "/t/login/request", { body: { examId, email } });
  const rows = DB.query("SELECT body FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1", email);
  if (!rows.length) return null;
  const tok = (rows[0].body.match(/login=([A-Za-z0-9_-]+)/) || [])[1];
  const v = await call("POST", "/t/login/verify", { body: { examId, token: tok } });
  return { tok, verify: v };
}
const before = DB.query("SELECT COUNT(*) AS n FROM outbox")[0].n;
await call("POST", "/t/login/request", { body: { examId, email: "mallory@evil.edu" } });
check("non-roster address gets no login email", DB.query("SELECT COUNT(*) AS n FROM outbox")[0].n === before);
const alice = await studentLogin("alice@example.edu");
check("rostered student signs in by emailed link", alice && alice.verify.status === 200 && !!alice.verify.data.session, JSON.stringify(alice && alice.verify.data));
const reuse = await call("POST", "/t/login/verify", { body: { examId, token: alice.tok } });
check("login link cannot be reused", reuse.status === 400, reuse.status);
const aSess = alice.verify.data.session;

// ---- sealing ---------------------------------------------------------------------
r = await call("POST", "/t/session", { session: aSess, body: { examId } });
check("sealing session opened", r.status === 200 && !!r.data.sessionCode, JSON.stringify(r.data));
check("variation issued by server", Array.isArray(["(a) Explain 9 to a first-year student.", "(b) State what changes if friction is not zero."]) && String(r.data.variation).startsWith("("));
r = await call("POST", "/t/segment", { session: aSess, body: { examId, slide: 1, title: "Bernoulli Equation", text: "This is the Bernoulli equation." } });
check("segment 1 accepted", r.status === 200 && r.data.late === false);
r = await call("POST", "/t/segment", { session: aSess, body: { examId, slide: 2, title: "Energy balance", text: "The system energy balance is." } });
check("segment 2 accepted", r.status === 200);
r = await call("POST", "/t/segment", { session: aSess, body: { examId, slide: 1, title: "Bernoulli Equation", text: "This is the Bernoulli equation, restated." } });
check("late edit flagged", r.status === 200 && r.data.late === true);
r = await call("POST", "/t/seal", { session: aSess, body: { examId, fullTranscript: "a swapped transcript" } });
check("seal with swapped transcript refused", r.status === 409, r.status);
r = await call("POST", "/t/seal", { session: aSess, body: { examId } });
const expected = "1 (Bernoulli Equation): This is the Bernoulli equation, restated.\n2 (Energy balance): The system energy balance is.";
check("seal succeeds with assembled transcript", r.status === 200 && r.data.sealedTranscript === expected, JSON.stringify(r.data));
check("fingerprint matches the assembled text", r.data.transcriptFingerprint === sha(expected));
const aCode = r.data.sessionCode;

// ---- grading packet, verify, honest critique --------------------------------------
r = await call("GET", "/t/packet?session=" + aCode);
check("grading packet carries prompt, rubric, transcript", r.status === 200 && r.data.exam.prompt.includes("Bernoulli") && r.data.exam.rubric.length === 6 && r.data.transcript === expected, JSON.stringify(r.data).slice(0, 200));
r = await call("POST", "/t/verify", { body: { sessionCode: aCode, transcript: expected } });
check("verify exact transcript", r.data.match === true);
r = await call("POST", "/t/verify", { body: { sessionCode: aCode, transcript: expected.replace("restated", "improved") } });
check("verify detects swap", r.data.match === false);
const honest = { "Technical accuracy": 0.9, "Technical completeness": 0.85, "Introduction": 0.8, "Relevance": 0.75, "Summary": 0.8, "Conclusion": 0.7 };
auditFractions = { ...honest };
r = await call("POST", "/t/critique", { body: { sessionCode: aCode, transcript: expected, critique: "A careful explanation.", grades: honest } });
check("honest critique accepted, not flagged", r.status === 200 && r.data.status === "graded" && r.data.flags.length === 0, JSON.stringify(r.data));

// ---- second student: inflated grades get flagged ------------------------------------
const ben = await studentLogin("ben@example.edu");
const bSess = ben.verify.data.session;
await call("POST", "/t/session", { session: bSess, body: { examId } });
await call("POST", "/t/segment", { session: bSess, body: { examId, slide: 1, title: "Bernoulli Equation", text: "Um, Bernoulli." } });
r = await call("POST", "/t/seal", { session: bSess, body: { examId } });
const bCode = r.data.sessionCode;
const bTranscript = r.data.sealedTranscript;
auditFractions = { "Technical accuracy": 0.2, "Technical completeness": 0.2, "Introduction": 0.3, "Relevance": 0.2, "Summary": 0.3, "Conclusion": 0.2 };
const inflated = { "Technical accuracy": 1, "Technical completeness": 1, "Introduction": 1, "Relevance": 1, "Summary": 1, "Conclusion": 1 };
r = await call("POST", "/t/critique", { body: { sessionCode: bCode, transcript: bTranscript, critique: "Perfect.", grades: inflated } });
check("inflated critique flagged by audit", r.status === 200 && r.data.status === "flagged" && r.data.flags.length === 6, JSON.stringify(r.data));
r = await call("POST", "/t/critique", { body: { sessionCode: bCode, transcript: bTranscript + " extra", critique: "x", grades: inflated } });
check("critique on a swapped transcript refused", r.status === 409, r.status);

// ---- audio take: upload, seal, server transcription --------------------------------
const wav1 = new TextEncoder().encode("FAKE-WAV-ONE").buffer;
const wav2 = new TextEncoder().encode("FAKE-WAV-TWO").buffer;
const dan = await studentLogin("dan@example.edu");
const dSess = dan.verify.data.session;
await call("POST", "/t/session", { session: dSess, body: { examId } });
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { raw: wav1 });
check("audio upload without sign-in refused", r.status === 403, r.status);
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: dSess, raw: wav1 });
check("audio segment 1 stored", r.status === 200 && r.data.segmentFingerprint === sha("FAKE-WAV-ONE"), JSON.stringify(r.data));
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=2&title=${encodeURIComponent("Energy balance")}`, { session: dSess, raw: wav2 });
check("audio segment 2 stored", r.status === 200 && r.data.segmentFingerprint === sha("FAKE-WAV-TWO"));
check("two objects in the bucket", AUDIO.map.size === 2, AUDIO.map.size);
r = await call("POST", "/t/seal", { session: dSess, body: { examId } });
const dExpected = "1 (Bernoulli Equation): Words from audio one.\n2 (Energy balance): Words from audio two.";
check("audio seal transcribes on the server", r.status === 200 && r.data.transcriptionStatus === "done" && r.data.sealedTranscript === dExpected, JSON.stringify(r.data));
check("audio fingerprint covers both segments", r.data.audioFingerprint === sha("1:" + sha("FAKE-WAV-ONE") + "\n2:" + sha("FAKE-WAV-TWO")), r.data.audioFingerprint);
const dCode = r.data.sessionCode;
r = await call("GET", "/t/packet?session=" + dCode);
check("packet for audio take carries transcript and audio fingerprint", r.status === 200 && r.data.transcript === dExpected && r.data.audioFingerprint === sha("1:" + sha("FAKE-WAV-ONE") + "\n2:" + sha("FAKE-WAV-TWO")));
r = await call("GET", `/api/t/exams/${examId}/results/${encodeURIComponent("dan@example.edu")}/audio/1`, { cookie });
check("teacher can download slide audio", r.status === 200 && r.text === "FAKE-WAV-ONE", r.status + " " + r.text);
env.AUDIO = undefined;
r = await call("POST", `/t/audio-segment?examId=${examId}&slide=3`, { session: dSess, raw: wav1 });
check("audio route fails closed with no bucket", r.status === 500, r.status);
env.AUDIO = AUDIO;

// ---- audio take with no transcription model: held as audio_sealed, teacher retries ----
r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "" } });
const eve = await studentLogin("eve@example.edu");
const eSess = eve.verify.data.session;
await call("POST", "/t/session", { session: eSess, body: { examId } });
await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: eSess, raw: wav1 });
r = await call("POST", "/t/seal", { session: eSess, body: { examId } });
check("unconfigured transcription holds the take as audio_sealed", r.status === 200 && r.data.transcriptionStatus === "not_configured" && r.data.sealedTranscript === null, JSON.stringify(r.data));
const eCode = r.data.sessionCode;
r = await call("GET", "/t/packet?session=" + eCode);
check("packet serves an untranscribed audio take for student-Muse grading", r.status === 200 && r.data.transcript === null && r.data.audio.length === 1, r.status);
r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "mock-whisper" } });
r = await call("POST", `/api/t/exams/${examId}/results/${encodeURIComponent("eve@example.edu")}/transcribe`, { cookie, body: {} });
check("teacher-triggered transcription completes the seal", r.status === 200 && r.data.transcriptionStatus === "done" && r.data.sealedTranscript === "1 (Bernoulli Equation): Words from audio one.", JSON.stringify(r.data));

// ---- student Muse transcribes the sealed audio itself and grades it -----------------
r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "" } });
const frank = await studentLogin("frank@example.edu");
const fSess = frank.verify.data.session;
await call("POST", "/t/session", { session: fSess, body: { examId } });
await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: fSess, raw: wav1 });
r = await call("POST", "/t/seal", { session: fSess, body: { examId } });
check("frank's take is audio_sealed", r.status === 200 && r.data.transcriptionStatus === "not_configured", JSON.stringify(r.data));
const fCode = r.data.sessionCode;
r = await call("GET", "/t/packet?session=" + fCode);
check("packet for an audio take lists the sealed audio, no transcript", r.status === 200 && r.data.transcript === null && r.data.audio.length === 1 && !!r.data.audioFingerprint, JSON.stringify(r.data).slice(0, 250));
r = await call("GET", "/t/audio?session=" + fCode + "&slide=1");
check("student Muse can download the sealed segment", r.status === 200 && r.text === "FAKE-WAV-ONE", r.status + " " + r.text);
r = await call("GET", "/t/audio?session=" + fCode + "&slide=9");
check("download of a missing slide refused", r.status === 404, r.status);
auditFractions = { ...honest };
r = await call("POST", "/t/critique", { body: { sessionCode: fCode, critique: "No transcript.", grades: honest } });
check("audio critique without a transcript refused", r.status === 400, r.status);
const fTranscript = "1 (Bernoulli Equation): Words from audio one.";
r = await call("POST", "/t/critique", { body: { sessionCode: fCode, transcript: fTranscript, critique: "Graded from my own transcription of the sealed audio.", grades: honest } });
check("student Muse transcript + critique accepted", r.status === 200 && r.data.status === "graded" && r.data.transcriptionCheck.status === "not_configured", JSON.stringify(r.data));
r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "mock-whisper" } });
r = await call("POST", "/t/critique", { body: { sessionCode: fCode, transcript: "1 (Bernoulli Equation): Completely invented words about nothing.", critique: "Graded from an invented transcript.", grades: honest } });
check("invented transcript flagged against the server transcription", r.status === 200 && r.data.status === "flagged" && r.data.transcriptionCheck.similarity < 0.6 && r.data.flags.some((f) => f.element === "Transcription match"), JSON.stringify(r.data));

// ---- practice loop, final marking, and teacher-Muse validation -----------------------
r = await call("PUT", "/api/t/settings/model", { cookie, body: { provider: "mock", base_url: "http://127.0.0.1:8932", model: "mock-1", transcribe_model: "" } });
const grace = await studentLogin("grace@example.edu");
let gSess = grace.verify.data.session;
await call("POST", "/t/session", { session: gSess, body: { examId } });
await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: gSess, raw: wav1 });
const jpg1 = new TextEncoder().encode("FAKE-JPEG-ONE").buffer;
r = await call("POST", `/t/photo?examId=${examId}&at=42&slide=3&precheck=confirmed`, { session: gSess, raw: jpg1 });
const jpg1Sha = createHash("sha256").update(Buffer.from(jpg1)).digest("hex");
check("submission picture uploaded during the take", r.status === 200 && r.data.photoFingerprint === jpg1Sha, JSON.stringify(r.data));
r = await call("POST", "/t/seal", { session: gSess, body: { examId } });
check("the seal covers the picture fingerprint", r.status === 200 && r.data.photoFingerprint === jpg1Sha, JSON.stringify(r.data).slice(0, 160));
const gCode1 = r.data.sessionCode;
auditFractions = { ...honest };
r = await call("POST", "/t/critique", { body: { sessionCode: gCode1, transcript: "1 (Bernoulli Equation): Words from audio one.", critique: "Practice feedback.", grades: honest } });
check("practice attempt graded, not final", r.status === 200 && r.data.status === "graded" && r.data.final === false, JSON.stringify(r.data));
r = await call("POST", "/t/session", { session: gSess, body: { examId } });
check("a new practice take may start after grading", r.status === 200 && !!r.data.sessionCode, JSON.stringify(r.data));
const gCode2 = r.data.sessionCode;
await call("POST", `/t/audio-segment?examId=${examId}&slide=1&title=${encodeURIComponent("Bernoulli Equation")}`, { session: gSess, raw: wav1 });
const jpg2 = new TextEncoder().encode("FAKE-JPEG-TWO").buffer;
await call("POST", `/t/photo?examId=${examId}&at=57&slide=4&precheck=self_confirmed`, { session: gSess, raw: jpg2 });
const mot1 = new TextEncoder().encode("FAKE-MOTION-ONE").buffer;
const mot2 = new TextEncoder().encode("FAKE-MOTION-TWO").buffer;
r = await call("POST", `/t/motion-photo?examId=${examId}&at=61&slide=4&score=38.5`, { session: gSess, raw: mot1 });
check("scene-change capture uploaded", r.status === 200 && r.data.n === 1, JSON.stringify(r.data));
await call("POST", `/t/motion-photo?examId=${examId}&at=95&slide=6&score=41.0`, { session: gSess, raw: mot2 });
r = await call("POST", "/t/seal", { session: gSess, body: { examId } });
check("second take seals", r.status === 200 && r.data.sessionCode === gCode2, JSON.stringify(r.data).slice(0, 160));
r = await call("POST", "/t/critique", { body: { sessionCode: gCode2, transcript: "1 (Bernoulli Equation): Words from audio one.", critique: "Final feedback.", grades: honest, final: true } });
check("final upload waits for validation", r.status === 200 && r.data.status === "awaiting_validation" && r.data.final === true, JSON.stringify(r.data));
r = await call("POST", "/t/session", { session: gSess, body: { examId } });
check("a final submission locks new takes", r.status === 409, r.status);
r = await call("POST", `/api/t/exams/${examId}/audit-token`, { cookie, body: {} });
check("audit token generated", r.status === 200 && typeof r.data.token === "string" && r.data.token.length >= 16, JSON.stringify(r.data).slice(0, 80));
const aTok = r.data.token;
const TH = { headers: { "X-Audit-Token": aTok } };
r = await call("GET", "/tv/awaiting?examId=" + examId, { headers: { "X-Audit-Token": "wrong-token-value-0000" } });
check("awaiting list refuses a wrong token", r.status === 401, r.status);
r = await call("GET", "/tv/awaiting?examId=" + examId, TH);
check("awaiting list shows the final submission", r.status === 200 && r.data.awaiting.length === 1 && r.data.awaiting[0].email === "grace@example.edu", JSON.stringify(r.data).slice(0, 200));
r = await call("GET", "/tv/submission?examId=" + examId + "&email=grace@example.edu", TH);
check("validation packet carries the student transcript and grades", r.status === 200 && r.data.studentTranscript.includes("Words from audio one") && r.data.grades["Technical accuracy"] === honest["Technical accuracy"], JSON.stringify(r.data).slice(0, 200));
r = await call("GET", "/tv/audio?examId=" + examId + "&email=grace@example.edu&slide=1", TH);
check("teacher Muse downloads the sealed audio", r.status === 200 && r.text === "FAKE-WAV-ONE", r.status + " " + r.text);
r = await call("GET", "/tv/submission?examId=" + examId + "&email=grace@example.edu", TH);
check("validation packet lists the picture and attempt pictures", r.status === 200 && r.data.photo && r.data.photo.precheck === "self_confirmed" && r.data.attemptPhotos.length === 2, JSON.stringify(r.data).slice(0, 200));
check("validation packet lists the scene-change captures", r.data.motion.length === 2 && r.data.motion[0].atSec === 61 && r.data.motion[1].score === 41, JSON.stringify(r.data.motion));
r = await call("GET", "/tv/motion?examId=" + examId + "&email=grace@example.edu&n=2", TH);
check("teacher Muse downloads a scene-change capture", r.status === 200 && r.text === "FAKE-MOTION-TWO", r.status + " " + r.text);
r = await call("GET", "/tv/photo?examId=" + examId + "&email=grace@example.edu", TH);
check("teacher Muse downloads the final take's picture", r.status === 200 && r.text === "FAKE-JPEG-TWO", r.status + " " + r.text);
r = await call("GET", "/tv/photo?examId=" + examId + "&email=grace@example.edu&session=" + gCode1, TH);
check("teacher Muse downloads an earlier attempt's picture", r.status === 200 && r.text === "FAKE-JPEG-ONE", r.status + " " + r.text);
const divergent = Object.fromEntries(Object.keys(honest).map((k) => [k, 0.1]));
r = await call("POST", "/tv/validate", { ...TH, body: { examId, email: "grace@example.edu", transcript: "1 (Bernoulli Equation): Words from audio one.", grades: divergent } });
check("divergent validation is flagged, grade not set", r.status === 200 && r.data.status === "flagged" && r.data.similarity === 1, JSON.stringify(r.data));
r = await call("POST", "/tv/validate", { ...TH, body: { examId, email: "grace@example.edu", transcript: "1 (Bernoulli Equation): Words from audio one.", grades: honest } });
check("a flagged submission is not silently re-validated", r.status === 409, r.status);
r = await call("POST", `/api/t/exams/${examId}/results/grace@example.edu/release`, { cookie, body: {} });
check("teacher release reopens practice", r.status === 200, JSON.stringify(r.data));
r = await call("POST", "/t/critique", { body: { sessionCode: gCode2, transcript: "1 (Bernoulli Equation): Words from audio one.", critique: "Final feedback.", grades: honest, final: true } });
check("student can mark final again after release", r.status === 200 && r.data.status === "awaiting_validation", JSON.stringify(r.data));
r = await call("POST", "/tv/validate", { ...TH, body: { examId, email: "grace@example.edu", transcript: "1 (Bernoulli Equation): Words from audio one.", grades: honest, photoVerdict: "different", photoNote: "The final picture shows a different person." } });
check("a different-person picture verdict flags the submission", r.status === 200 && r.data.status === "flagged" && r.data.flags.some((f) => f.element === "Identity picture"), JSON.stringify(r.data));
await call("POST", `/api/t/exams/${examId}/results/grace@example.edu/release`, { cookie, body: {} });
r = await call("POST", "/t/critique", { body: { sessionCode: gCode2, transcript: "1 (Bernoulli Equation): Words from audio one.", critique: "Final feedback.", grades: honest, final: true } });
check("student can mark final again after the picture flag", r.status === 200 && r.data.status === "awaiting_validation", JSON.stringify(r.data));
const validated = Object.fromEntries(Object.keys(honest).map((k) => [k, 0.7]));
r = await call("POST", "/tv/validate", { ...TH, body: { examId, email: "grace@example.edu", transcript: "1 (Bernoulli Equation): Words from audio one.", grades: validated, photoVerdict: "same" } });
check("agreeing validation sets the final grade", r.status === 200 && r.data.status === "final" && r.data.similarity === 1, JSON.stringify(r.data));

// ---- teacher results, override, CSV, manual entry ------------------------------------
r = await call("GET", `/api/t/exams/${examId}/results`, { cookie });
check("results list all six students", r.status === 200 && r.data.results.length === 6, JSON.stringify(r.data).slice(0, 200));
const graceRow = r.data.results.find((x) => x.email === "grace@example.edu");
check("attempts archived and validation recorded as the final grade", !!graceRow && graceRow.attempts === 2 && graceRow.status === "final"
  && graceRow.manual.fractions["Technical accuracy"] === 0.7 && graceRow.audit.source === "teacher-claude", JSON.stringify(graceRow).slice(0, 300));
const frankRow = r.data.results.find((x) => x.email === "frank@example.edu");
check("student Muse transcript stored on the submission", !!frankRow && frankRow.student_transcript === "1 (Bernoulli Equation): Completely invented words about nothing." && frankRow.transcript === fTranscript, JSON.stringify(frankRow).slice(0, 300));
const settled = { "Technical accuracy": 0.5, "Technical completeness": 0.5, "Introduction": 0.5, "Relevance": 0.5, "Summary": 0.5, "Conclusion": 0.5 };
r = await call("POST", `/api/t/exams/${examId}/results/${encodeURIComponent("nobody@example.edu")}/override`, { cookie, body: { fractions: settled, comment: "wrong student" } });
check("override for unknown student refused", r.status === 404, r.status);
r = await call("POST", `/api/t/exams/${examId}/results/${encodeURIComponent("ben@example.edu")}/override`, { cookie, body: { fractions: settled, comment: "Settled after review." } });
check("teacher override recorded", r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
r = await call("GET", `/api/t/exams/${examId}/results.csv`, { cookie });
check("CSV has final points and comment", r.status === 200 && r.text.includes('"Technical accuracy (student)"') && r.text.includes("Settled after review.") && r.text.includes('"5","5","5"') === false && r.text.includes('"5"'), r.text.slice(0, 400));
r = await call("POST", `/api/t/exams/${examId}/manual`, { cookie, body: { email: "carol@example.edu", name: "Carol C", transcript: "Teacher entered text." } });
check("teacher-entered transcript stored as unsealed source", r.status === 200);
r = await call("GET", `/api/t/exams/${examId}/results`, { cookie });
const carol = r.data.results.find((x) => x.email === "carol@example.edu");
check("manual entry marked source=teacher", !!carol && carol.source === "teacher");

// ---- prompt edit bumps the version ------------------------------------------------------
r = await call("GET", `/api/t/exams/${examId}`, { cookie });
const view = r.data.exam;
r = await call("PUT", `/api/t/exams/${examId}`, { cookie, body: { ...view, prompt: view.prompt + " Be strict." } });
check("prompt edit bumps version", r.status === 200 && r.data.prompt_version === 2, JSON.stringify(r.data));

// ---- exam deletion removes the stored audio --------------------------------------------
check("bucket holds the audio, both attempt pictures, and the scene-change captures", AUDIO.map.size === 9, AUDIO.map.size);
r = await call("DELETE", `/api/t/exams/${examId}`, { cookie });
check("exam deleted and its audio objects removed", r.status === 200 && AUDIO.map.size === 0, r.status + " / " + AUDIO.map.size);

console.log("\n" + pass + " passed, " + fail + " failed");
modelServer.close();
process.exit(fail ? 1 : 0);
