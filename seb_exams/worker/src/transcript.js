// Transcript exams: student sign-in by emailed link, transcript sealing, grading support,
// and the teacher API for managing transcript exams. Routes: /t/* (student, CORS) and
// /api/t/* (teacher, session cookie). Exam content (prompt, rubric, variations, student app
// address) and the model connection settings are read from the database, never hard-coded here.
import { currentTeacher } from "./auth.js";
import { json, readJson, sha256hex, randomToken, newExamId, normEmail, isEmail, esc, examStatus, HttpError, ctEqual } from "./util.js";

const TOKEN_MIN = 15;
const SESSION_HOURS = 12;
const RATE_PER_HOUR = 5;
const FLAG_DIFF = 0.25;   // student vs audit grade, as a fraction of the element's range
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
const nowIso = () => new Date().toISOString();

function corsT(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, X-Student-Session",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "600", "Vary": "Origin" }
    : { "Vary": "Origin" };
}

async function sendMail(env, to, subject, html, text) {
  if (env.DEV === "1") {
    await env.DB.prepare("INSERT INTO outbox (to_email, subject, body, at) VALUES (?, ?, ?, ?)")
      .bind(to, subject, text, nowIso()).run();
    return;
  }
  try {
    const res = await fetch(env.MAIL_URL, {
      method: "POST", redirect: "follow", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.MAIL_SECRET, to, subject, html, text }),
    });
    if (!res.ok) console.error("mail failed", res.status);
  } catch (e) { console.error("mail failed", String(e)); }
}

const loadTExam = (env, id) => typeof id === "string" && id.length < 64
  ? env.DB.prepare("SELECT * FROM t_exams WHERE id = ?").bind(id).first() : Promise.resolve(null);

async function tExamFor(env, t, id) {
  const e = await loadTExam(env, id);
  if (!e) throw new HttpError(404, "Unknown transcript exam.");
  let ok = !!t.is_admin || e.owner_email === t.email;
  if (!ok) ok = !!(await env.DB.prepare("SELECT 1 AS x FROM t_exam_teachers WHERE exam_id = ? AND email = ?").bind(id, t.email).first());
  if (!ok) throw new HttpError(403, "You do not have access to this exam.");
  return e;
}

const rubricOf = (exam) => { try { return JSON.parse(exam.rubric_json || "[]"); } catch { return []; } };
const variationsOf = (exam) => { try { return JSON.parse(exam.variations_json || "[]"); } catch { return []; } };

function assemble(segments) {
  const out = [];
  for (let k = 1; k <= 99; k++) {
    const seg = segments[String(k)];
    if (seg && seg.text && seg.text.trim()) out.push(k + " (" + (seg.title || "") + "): " + seg.text.trim());
  }
  return out.join("\n");
}

async function receiptCode(env, parts) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SEAL_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts.join("|")));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function studentSession(req, env) {
  const v = req.headers.get("X-Student-Session") || "";
  if (!v || v.length > 100) return null;
  return env.DB.prepare(
    "SELECT exam_id, email FROM t_student_sessions WHERE session_hash = ? AND expires_at > ?")
    .bind(await sha256hex(v), nowIso()).first();
}

async function getSettings(env, key) {
  const row = await env.DB.prepare("SELECT value_json FROM t_settings WHERE key = ?").bind(key).first();
  try { return row ? JSON.parse(row.value_json) : null; } catch { return null; }
}

// ---- audit re-grade ----------------------------------------------------------------------
// Grades only, with the exam's own prompt and rubric, through the configured model
// connection (an OpenAI-style chat completions endpoint). Returns {status, fractions?, model?}.
async function runAudit(env, exam, transcript) {
  const cfg = await getSettings(env, "model");
  if (!cfg || !cfg.base_url || !cfg.model) return { status: "not_configured" };
  if (!env.MODEL_API_KEY) return { status: "no_key" };
  const rubric = rubricOf(exam);
  const system = [
    "You are an audit grader. Grade the transcript with the teacher's prompt and rubric below.",
    "Return only a JSON object mapping each rubric element name to a fraction from 0 to 1.",
    "Teacher prompt:\n" + exam.prompt,
    "Rubric (name, points, guidance):\n" + JSON.stringify(rubric),
  ].join("\n\n");
  try {
    const res = await fetch(cfg.base_url.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.MODEL_API_KEY },
      body: JSON.stringify({ model: cfg.model, temperature: 0,
        messages: [{ role: "system", content: system }, { role: "user", content: transcript }] }),
    });
    if (!res.ok) return { status: "error", detail: "model HTTP " + res.status };
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { status: "error", detail: "model returned no JSON" };
    const raw = JSON.parse(m[0]);
    const fractions = {};
    for (const el of rubric) {
      const v = Number(raw[el.name]);
      if (Number.isFinite(v)) fractions[el.name] = Math.min(1, Math.max(0, v));
    }
    return { status: "done", fractions, model: cfg.model, at: nowIso() };
  } catch (e) {
    return { status: "error", detail: String(e).slice(0, 200) };
  }
}

// ---- audio takes (R2) ----------------------------------------------------------------------
// A spoken take can be sealed from its audio instead of from a browser-made transcript:
// the app uploads one WAV segment per slide (16 kHz mono, from the take's own capture),
// the server stores the segments in the AUDIO R2 bucket and seals a fingerprint of the
// audio. The server never transcribes: the take stays in status 'audio_sealed' (audio
// held and fingerprinted, no transcript invented) until the student's Muse downloads
// the segments under the session code, transcribes them, and uploads its transcript
// with its critique and grades. Without a bucket the audio routes fail closed.
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;   // one slide segment; ~13 min at 16 kHz 16-bit mono

async function sha256hexBytes(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const audioOf = (sub) => { try { return JSON.parse(sub.audio_json || "{}"); } catch { return {}; } };

async function audioKey(env, examId, email, sessionCode, slide) {
  const eh = (await sha256hex(email)).slice(0, 16);
  return "exams/" + examId + "/" + eh + "/" + sessionCode + "/slide-" + slide + ".wav";
}

function audioFingerprintOf(audio) {
  const lines = Object.keys(audio).sort((a, b) => Number(a) - Number(b))
    .map((k) => k + ":" + audio[k].sha256);
  return lines.join("\n");
}


// Seal an audio take: stamps the audio fingerprint and the receipt over the stored
// segments (the submission picture and scene-change captures are covered when
// present). The take is held as 'audio_sealed'; its transcript is made later by the
// student's Muse from the sealed audio. Called by /t/seal.
function motionOf(sub) {
  try { const m = JSON.parse((sub && sub.motion_json) || "[]"); return Array.isArray(m) ? m : []; }
  catch { return []; }
}

function photoOf(sub) {
  try { const p = JSON.parse((sub && sub.photo_json) || "{}"); return p && p.key ? p : null; }
  catch { return null; }
}

async function finaliseAudioSeal(env, exam, sub) {
  const audio = audioOf(sub);
  const photo = photoOf(sub);
  // The sealed fingerprint covers the audio segments and, when one was captured, the
  // submission's picture: neither can be substituted after sealing.
  const motion = motionOf(sub);
  const fpText = audioFingerprintOf(audio) + (photo ? "\nphoto:" + photo.sha256 : "")
    + (motion.length ? "\nmotion:" + motion.map((m) => m.sha256).join(",") : "");
  const audioFp = await sha256hex(fpText);
  const sealedAt = sub.sealed_at || nowIso();
  const receipt = await receiptCode(env, [sub.session_code, sub.email, audioFp, "", sub.variation || "", sub.opened_at, sealedAt]);
  await env.DB.prepare(
    "UPDATE t_submissions SET status = 'audio_sealed', audio_fingerprint = ?, photo_fingerprint = ?, receipt = ?, sealed_at = ?, prompt_version = ?, transcription_json = '{}' WHERE exam_id = ? AND email = ?")
    .bind(audioFp, photo ? photo.sha256 : null, receipt, sealedAt, exam.prompt_version, exam.id, sub.email).run();
  return { audioFingerprint: audioFp, transcriptFingerprint: null, receipt, sealedAt,
    photoFingerprint: photo ? photo.sha256 : null, sealedTranscript: null };
}

function computeFlags(rubric, grades, audit) {
  const flags = [];
  if (!audit || audit.status !== "done" || !audit.fractions) return flags;
  for (const el of rubric) {
    const a = grades ? grades[el.name] : undefined;
    const b = audit.fractions[el.name];
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) > FLAG_DIFF) {
      flags.push({ element: el.name, student: a, audit: b });
    }
  }
  return flags;
}

// ---- student routes (/t/*) ---------------------------------------------------------------

async function studentLoginRequest(req, env, ctx) {
  const body = await readJson(req, 4096);
  const exam = await loadTExam(env, body.examId);
  const email = normEmail(body.email);
  const now = nowIso();
  if (exam && isEmail(email)) {
    const rostered = await env.DB.prepare("SELECT name FROM t_roster WHERE exam_id = ? AND email = ?")
      .bind(exam.id, email).first();
    if (rostered) {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM t_login_requests WHERE email = ? AND at > ?")
        .bind(email, isoIn(-3600e3)).first();
      if (n.n < RATE_PER_HOUR) {
        const token = randomToken(32);
        await env.DB.batch([
          env.DB.prepare("INSERT INTO t_login_requests (email, at) VALUES (?, ?)").bind(email, now),
          env.DB.prepare("INSERT INTO t_login_tokens (token_hash, exam_id, email, expires_at) VALUES (?, ?, ?, ?)")
            .bind(await sha256hex(token), exam.id, email, isoIn(TOKEN_MIN * 60e3)),
        ]);
        const sep = exam.app_url.includes("?") ? "&" : "?";
        const link = `${exam.app_url}${sep}exam=${encodeURIComponent(exam.id)}&login=${token}&server=${encodeURIComponent(env.APP_ORIGIN || "")}`;
        const text = `Open this link to sign in for "${exam.title}" (valid for ${TOKEN_MIN} minutes, works once):\n\n${link}\n\nIf you did not ask for this, ignore this email.`;
        const html = `<p>Open this link to sign in for ${esc(exam.title)}. It is valid for ${TOKEN_MIN} minutes and works once.</p><p><a href="${esc(link)}">Sign in</a></p><p style="color:#666">If you did not ask for this, ignore this email.</p>`;
        const job = sendMail(env, email, "Sign in for " + exam.title, html, text);
        if (env.DEV === "1") await job; else ctx.waitUntil(job);
      }
    }
  }
  return json({ ok: true, message: "If this address is on the class roster, a sign-in link has been sent. It is valid for 15 minutes." });
}

async function studentLoginVerify(req, env) {
  const body = await readJson(req, 4096);
  const token = String(body.token || "");
  const hash = await sha256hex(token);
  const now = nowIso();
  const r = await env.DB.prepare(
    "UPDATE t_login_tokens SET used_at = ? WHERE token_hash = ? AND exam_id = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now, hash, String(body.examId || ""), now).run();
  if (r.meta.changes !== 1) throw new HttpError(400, "This link has expired or was already used. Request a new one.");
  const row = await env.DB.prepare("SELECT email FROM t_login_tokens WHERE token_hash = ?").bind(hash).first();
  const rostered = await env.DB.prepare("SELECT name FROM t_roster WHERE exam_id = ? AND email = ?")
    .bind(String(body.examId || ""), row.email).first();
  const session = randomToken(32);
  await env.DB.prepare("INSERT INTO t_student_sessions (session_hash, exam_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256hex(session), String(body.examId || ""), row.email, isoIn(SESSION_HOURS * 3600e3), now).run();
  const exam = await loadTExam(env, String(body.examId || ""));
  return json({ session, email: row.email, name: rostered ? rostered.name : "",
    exam: { id: exam.id, title: exam.title, assignment: exam.assignment } });
}

async function requireStudent(req, env, examId) {
  const s = await studentSession(req, env);
  if (!s) throw new HttpError(403, "Not signed in. Use the emailed link first.");
  if (examId && s.exam_id !== examId) throw new HttpError(403, "This sign-in is for a different exam.");
  return s;
}

const loadSubmission = (env, examId, email) => env.DB.prepare(
  "SELECT * FROM t_submissions WHERE exam_id = ? AND email = ?").bind(examId, email).first();

async function sealSessionOpen(req, env) {
  const body = await readJson(req, 4096);
  const exam = await loadTExam(env, body.examId);
  if (!exam) throw new HttpError(404, "Unknown transcript exam.");
  const s = await requireStudent(req, env, exam.id);
  const status = examStatus(exam);
  if (status !== "open") throw new HttpError(403, "This exam is " + status + " and is not accepting takes now.");
  const existing = await loadSubmission(env, exam.id, s.email);
  // Practice is unlimited: a new take may start over any earlier sealed or graded
  // take (its graded attempts are archived in t_attempts). A take the student has
  // marked final locks the exam for that student until the teacher releases it.
  if (existing && existing.source === "sealed" && (existing.status === "awaiting_validation" || existing.status === "final")) {
    throw new HttpError(409, "This exam is already submitted as final. The teacher can release it for another attempt.");
  }
  // A new take supersedes the previous take's audio: its graded record is archived
  // in t_attempts, and its audio objects are removed so storage holds one take each.
  if (existing && env.AUDIO) {
    for (const a of Object.values(audioOf(existing))) { try { await env.AUDIO.delete(a.key); } catch { /* already gone */ } }
    for (const mf of motionOf(existing)) { try { await env.AUDIO.delete(mf.key); } catch { /* already gone */ } }
    // The previous take's picture is NOT deleted: pictures are small, and the
    // teacher's validation compares them across a student's submissions. Exam
    // deletion removes them (see the delete route, which walks the attempt log).
  }
  const rostered = await env.DB.prepare("SELECT name FROM t_roster WHERE exam_id = ? AND email = ?").bind(exam.id, s.email).first();
  const variations = variationsOf(exam);
  const variation = variations.length ? variations[Math.floor(Math.random() * variations.length)] : null;
  const sessionCode = randomToken(24);
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO t_submissions (exam_id, email, name, source, session_code, status, variation, opened_at,
       segments_json, history_json, flags_json, manual_json)
     VALUES (?, ?, ?, 'sealed', ?, 'open', ?, ?, '{}', '[]', '[]', '{}')
     ON CONFLICT(exam_id, email) DO UPDATE SET session_code = excluded.session_code, status = 'open',
       variation = excluded.variation, opened_at = excluded.opened_at, segments_json = '{}', history_json = '[]',
       transcript = NULL, fingerprint = NULL, receipt = NULL, sealed_at = NULL, final_at = NULL,
       audio_json = '{}', audio_fingerprint = NULL, transcription_json = '{}',
       photo_json = '{}', photo_fingerprint = NULL, motion_json = '[]'`)
    .bind(exam.id, s.email, rostered ? rostered.name : "", sessionCode, variation, now).run();
  return json({ sessionCode, variation, openedAt: now });
}

async function sealSegment(req, env) {
  const body = await readJson(req, 200 * 1024);
  const exam = await loadTExam(env, body.examId);
  if (!exam) throw new HttpError(404, "Unknown transcript exam.");
  const s = await requireStudent(req, env, exam.id);
  const sub = await loadSubmission(env, exam.id, s.email);
  if (!sub || sub.status !== "open" || sub.source !== "sealed") throw new HttpError(409, "No open take for this student.");
  const slide = Number(body.slide);
  if (!Number.isInteger(slide) || slide < 1 || slide > 99) throw new HttpError(400, "Bad slide number.");
  const text = String(body.text == null ? "" : body.text).slice(0, 20000);
  const title = String(body.title == null ? "" : body.title).slice(0, 120);
  const segments = JSON.parse(sub.segments_json || "{}");
  const history = JSON.parse(sub.history_json || "[]");
  const at = nowIso();
  let late = false;
  for (const k of Object.keys(segments)) if (Number(k) > slide) late = true;
  const prev = segments[String(slide)];
  segments[String(slide)] = { text, title, firstAt: prev ? prev.firstAt : at, lastAt: at, late: late || (prev ? prev.late : false) };
  const fp = await sha256hex(text);
  history.push({ slide, at, fingerprint: fp, late });
  await env.DB.prepare("UPDATE t_submissions SET segments_json = ?, history_json = ? WHERE exam_id = ? AND email = ?")
    .bind(JSON.stringify(segments), JSON.stringify(history), exam.id, s.email).run();
  return json({ ok: true, slide, receivedAt: at, late, segmentFingerprint: fp });
}

async function audioSegment(req, env, url) {
  if (!env.AUDIO) throw new HttpError(500, "Audio storage is not configured on the server (R2 bucket binding AUDIO).");
  const exam = await loadTExam(env, url.searchParams.get("examId"));
  if (!exam) throw new HttpError(404, "Unknown transcript exam.");
  const s = await requireStudent(req, env, exam.id);
  const sub = await loadSubmission(env, exam.id, s.email);
  if (!sub || sub.status !== "open" || sub.source !== "sealed") throw new HttpError(409, "No open take for this student.");
  const slide = Number(url.searchParams.get("slide"));
  if (!Number.isInteger(slide) || slide < 1 || slide > 99) throw new HttpError(400, "Bad slide number.");
  const title = String(url.searchParams.get("title") || "").slice(0, 120);
  const len = Number(req.headers.get("Content-Length"));
  if (len > AUDIO_MAX_BYTES) throw new HttpError(413, "Audio segment too large.");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > AUDIO_MAX_BYTES) throw new HttpError(413, "Audio segment too large.");
  if (!buf.byteLength) throw new HttpError(400, "Empty audio segment.");
  const sha = await sha256hexBytes(buf);
  const key = await audioKey(env, exam.id, s.email, sub.session_code, slide);
  await env.AUDIO.put(key, buf, { httpMetadata: { contentType: req.headers.get("Content-Type") || "audio/wav" } });
  const audio = audioOf(sub);
  const history = JSON.parse(sub.history_json || "[]");
  const at = nowIso();
  audio[String(slide)] = { key, bytes: buf.byteLength, sha256: sha, title, at };
  history.push({ slide, at, fingerprint: sha, audio: true });
  await env.DB.prepare("UPDATE t_submissions SET audio_json = ?, history_json = ? WHERE exam_id = ? AND email = ?")
    .bind(JSON.stringify(audio), JSON.stringify(history), exam.id, s.email).run();
  return json({ ok: true, slide, bytes: buf.byteLength, segmentFingerprint: sha, receivedAt: at });
}

// The submission's one picture: a single frame the app captured at a randomised
// moment during the take. Stored in R2 like the audio, recorded on the submission,
// and covered by the seal's fingerprint (see finaliseAudioSeal and the text seal).
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
async function photoUpload(req, env, url) {
  const examId = url.searchParams.get("examId");
  const exam = await loadTExam(env, examId);
  if (!exam) throw new HttpError(404, "Unknown transcript exam.");
  const s = await requireStudent(req, env, exam.id);
  const sub = await loadSubmission(env, exam.id, s.email);
  if (!sub || sub.status !== "open" || sub.source !== "sealed") throw new HttpError(409, "No open take for this student.");
  if (!env.AUDIO) throw new HttpError(500, "Photo storage is not configured on the server (R2 bucket binding AUDIO).");
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw new HttpError(400, "Empty picture.");
  if (buf.byteLength > PHOTO_MAX_BYTES) throw new HttpError(413, "Picture too large.");
  const sha = await sha256hexBytes(buf);
  const key = "exams/" + exam.id + "/" + (await sha256hex(s.email)).slice(0, 16) + "/" + sub.session_code + "/photo.jpg";
  await env.AUDIO.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
  const atSec = Number(url.searchParams.get("at"));
  const slide = Number(url.searchParams.get("slide"));
  const precheck = String(url.searchParams.get("precheck") || "").slice(0, 24);
  const photo = { key, bytes: buf.byteLength, sha256: sha,
    atSec: Number.isFinite(atSec) ? Math.round(atSec) : null,
    slide: Number.isInteger(slide) ? slide : null,
    precheck: ["confirmed", "self_confirmed", "not_confirmed"].includes(precheck) ? precheck : "unknown",
    receivedAt: nowIso() };
  await env.DB.prepare("UPDATE t_submissions SET photo_json = ? WHERE exam_id = ? AND email = ?")
    .bind(JSON.stringify(photo), exam.id, s.email).run();
  return json({ ok: true, photoFingerprint: sha, bytes: buf.byteLength });
}

// Motion captures: frames the app grabbed when the scene changed suddenly during
// the take. Stored like the picture, listed on the submission, covered by the seal.
const MOTION_MAX = 20;
async function motionUpload(req, env, url) {
  const examId = url.searchParams.get("examId");
  const exam = await loadTExam(env, examId);
  if (!exam) throw new HttpError(404, "Unknown transcript exam.");
  const s = await requireStudent(req, env, exam.id);
  const sub = await loadSubmission(env, exam.id, s.email);
  if (!sub || sub.status !== "open" || sub.source !== "sealed") throw new HttpError(409, "No open take for this student.");
  if (!env.AUDIO) throw new HttpError(500, "Photo storage is not configured on the server (R2 bucket binding AUDIO).");
  const motion = motionOf(sub);
  if (motion.length >= MOTION_MAX) return json({ ok: true, capped: true, count: motion.length });
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw new HttpError(400, "Empty frame.");
  if (buf.byteLength > PHOTO_MAX_BYTES) throw new HttpError(413, "Frame too large.");
  const sha = await sha256hexBytes(buf);
  const n = motion.length + 1;
  const key = "exams/" + exam.id + "/" + (await sha256hex(s.email)).slice(0, 16) + "/" + sub.session_code + "/motion-" + n + ".jpg";
  await env.AUDIO.put(key, buf, { httpMetadata: { contentType: "image/jpeg" } });
  const atSec = Number(url.searchParams.get("at"));
  const slide = Number(url.searchParams.get("slide"));
  const score = Number(url.searchParams.get("score"));
  motion.push({ key, n, bytes: buf.byteLength, sha256: sha,
    atSec: Number.isFinite(atSec) ? Math.round(atSec) : null,
    slide: Number.isInteger(slide) ? slide : null,
    score: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
    receivedAt: nowIso() });
  await env.DB.prepare("UPDATE t_submissions SET motion_json = ? WHERE exam_id = ? AND email = ?")
    .bind(JSON.stringify(motion), exam.id, s.email).run();
  return json({ ok: true, n, photoFingerprint: sha });
}

async function sealTake(req, env) {
  if (!env.SEAL_SECRET) throw new HttpError(500, "Sealing is not configured on the server (SEAL_SECRET).");
  const body = await readJson(req, 1024 * 1024);
  const exam = await loadTExam(env, body.examId);
  if (!exam) throw new HttpError(404, "Unknown transcript exam.");
  const s = await requireStudent(req, env, exam.id);
  const sub = await loadSubmission(env, exam.id, s.email);
  if (!sub || sub.source !== "sealed") throw new HttpError(409, "No take to seal.");
  if (sub.status === "sealed" || sub.status === "graded" || sub.status === "flagged" || sub.status === "final") {
    return json({ sessionCode: sub.session_code, sealedAt: sub.sealed_at, transcriptFingerprint: sub.fingerprint,
      receipt: sub.receipt, sealedTranscript: sub.transcript, alreadySealed: true });
  }
  const assembled = assemble(JSON.parse(sub.segments_json || "{}"));
  if (!assembled) {
    // Audio take: no text segments, but stored audio segments seal the take.
    const audio = audioOf(sub);
    if (Object.keys(audio).length) {
      if (!env.AUDIO) throw new HttpError(500, "Audio storage is not configured on the server (R2 bucket binding AUDIO).");
      const out = await finaliseAudioSeal(env, exam, sub);
      return json({ sessionCode: sub.session_code, ...out });
    }
    throw new HttpError(400, "No transcript segments were received.");
  }
  if (body.fullTranscript != null && String(body.fullTranscript).replace(/\s+$/g, "") !== assembled) {
    throw new HttpError(409, "The submitted text differs from the segments held by the server.");
  }
  const fingerprint = await sha256hex(assembled);
  const sealedAt = nowIso();
  const receipt = await receiptCode(env, [sub.session_code, s.email, fingerprint, sub.variation || "", sub.opened_at, sealedAt]);
  const photo = photoOf(sub);
  await env.DB.prepare(
    "UPDATE t_submissions SET status = 'sealed', transcript = ?, fingerprint = ?, photo_fingerprint = ?, receipt = ?, sealed_at = ?, prompt_version = ? WHERE exam_id = ? AND email = ?")
    .bind(assembled, fingerprint, photo ? photo.sha256 : null, receipt, sealedAt, exam.prompt_version, exam.id, s.email).run();
  return json({ sessionCode: sub.session_code, sealedAt, transcriptFingerprint: fingerprint, receipt, sealedTranscript: assembled,
    photoFingerprint: photo ? photo.sha256 : null });
}

// ---- grading routes (credential: the sealed session code) ------------------------------

async function submissionByCode(env, code) {
  if (typeof code !== "string" || code.length < 10 || code.length > 100) return null;
  return env.DB.prepare("SELECT * FROM t_submissions WHERE session_code = ?").bind(code).first();
}

async function gradingPacket(env, url) {
  const sub = await submissionByCode(env, url.searchParams.get("session"));
  if (!sub) throw new HttpError(404, "Unknown session code.");
  const audio = audioOf(sub);
  if (!sub.transcript && !Object.keys(audio).length) throw new HttpError(409, "This submission is not sealed yet.");
  const exam = await loadTExam(env, sub.exam_id);
  return json({
    exam: { id: exam.id, title: exam.title, prompt: exam.prompt, promptVersion: sub.prompt_version ?? exam.prompt_version,
      rubric: rubricOf(exam) },
    student: { name: sub.name, email: sub.email },
    variation: sub.variation, transcript: sub.transcript, fingerprint: sub.fingerprint,
    audioFingerprint: sub.audio_fingerprint || null,
    audio: Object.entries(audio).map(([slide, a]) => ({ slide: Number(slide), title: a.title || "", bytes: a.bytes, sha256: a.sha256 })),
    photo: photoOf(sub) ? (({ key, ...rest }) => rest)(photoOf(sub)) : null,
    motion: motionOf(sub).map(({ key, ...rest }) => rest),
  });
}

// One sealed audio segment, credentialed by the session code like the packet itself:
// the student's Muse downloads the segments, transcribes them, and grades from its
// own transcript (see uploadCritique for how that transcript is checked and stored).
async function audioDownload(env, url) {
  const sub = await submissionByCode(env, url.searchParams.get("session"));
  if (!sub) throw new HttpError(404, "Unknown session code.");
  const seg = audioOf(sub)[String(url.searchParams.get("slide") || "")];
  if (!seg) throw new HttpError(404, "No audio for that slide.");
  if (!env.AUDIO) throw new HttpError(500, "Audio storage is not configured on the server (R2 bucket binding AUDIO).");
  const obj = await env.AUDIO.get(seg.key);
  if (!obj) throw new HttpError(404, "The stored audio object is missing (it may have expired under the retention rule).");
  return new Response(obj.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}

async function verifyTranscript(req, env) {
  const body = await readJson(req, 1024 * 1024);
  const sub = await submissionByCode(env, body.sessionCode);
  if (!sub) throw new HttpError(404, "Unknown session code.");
  if (!sub.fingerprint) throw new HttpError(409, "This submission is not sealed yet.");
  const fp = await sha256hex(String(body.transcript || "").replace(/\s+$/g, "").replace(/^\s+/g, ""));
  return json({ match: ctEqual(fp, sub.fingerprint), transcriptFingerprint: sub.fingerprint });
}

function wordSimilarity(a, b) {
  const words = (t) => new Set(String(t).toLowerCase().match(/[a-z0-9]+/g) || []);
  const A = words(a), B = words(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

async function uploadCritique(req, env) {
  const body = await readJson(req, 1024 * 1024);
  const sub = await submissionByCode(env, body.sessionCode);
  if (!sub) throw new HttpError(404, "Unknown session code.");
  const exam = await loadTExam(env, sub.exam_id);
  let gradedText = sub.transcript;
  let attemptTranscript = sub.student_transcript || null;
  if (sub.transcript) {
    const fp = await sha256hex(String(body.transcript || "").replace(/\s+$/g, "").replace(/^\s+/g, ""));
    if (!ctEqual(fp, sub.fingerprint)) throw new HttpError(409, "The graded transcript is not the sealed transcript.");
  } else if (Object.keys(audioOf(sub)).length) {
    // Audio-sealed take: the student's Muse transcribed the sealed audio itself.
    // Its transcript is stored as the student's transcript (the seal itself is the
    // audio fingerprint; nothing here overwrites it), and the audit, when configured,
    // grades that transcript.
    const studentTranscript = String(body.transcript || "").replace(/\s+$/g, "").replace(/^\s+/g, "");
    if (!studentTranscript) throw new HttpError(400, "For an audio-sealed take, the upload must include the transcript made from the sealed audio.");
    attemptTranscript = studentTranscript;
    gradedText = studentTranscript;
    const sFp = await sha256hex(studentTranscript);
    await env.DB.prepare("UPDATE t_submissions SET student_transcript = ?, student_fingerprint = ? WHERE exam_id = ? AND email = ?")
      .bind(studentTranscript, sFp, sub.exam_id, sub.email).run();
  } else {
    throw new HttpError(409, "This submission is not sealed yet.");
  }
  const rubric = rubricOf(exam);
  const gradesIn = body.grades && typeof body.grades === "object" ? body.grades : {};
  const grades = {};
  for (const el of rubric) {
    const v = Number(gradesIn[el.name]);
    if (!Number.isFinite(v)) throw new HttpError(400, "Missing or invalid grade for rubric element: " + el.name);
    grades[el.name] = Math.min(1, Math.max(0, v));
  }
  const critique = String(body.critique || "").slice(0, 100000);
  if (!critique) throw new HttpError(400, "The critique text is empty.");
  const audit = await runAudit(env, exam, gradedText);
  const flags = computeFlags(rubric, grades, audit);
  let status = flags.length ? "flagged" : "graded";
  // Practice vs final: every upload is archived as an attempt. When the student marks
  // the upload final, the submission waits for the teacher's Muse to validate it;
  // the teacher's validation, not the student's grades, then sets the grade.
  const isFinal = body.final === true;
  const finalAt = isFinal ? nowIso() : null;
  if (isFinal) status = "awaiting_validation";
  await env.DB.prepare(
    "UPDATE t_submissions SET critique = ?, grades_json = ?, audit_json = ?, flags_json = ?, status = ?, final_at = COALESCE(?, final_at) WHERE exam_id = ? AND email = ?")
    .bind(critique, JSON.stringify(grades), JSON.stringify(audit), JSON.stringify(flags), status, finalAt, sub.exam_id, sub.email).run();
  await env.DB.prepare(
    `INSERT INTO t_attempts (session_code, exam_id, email, final, audio_fingerprint, student_transcript, critique, grades_json, status, motion_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_code) DO UPDATE SET final = excluded.final, student_transcript = excluded.student_transcript,
       critique = excluded.critique, grades_json = excluded.grades_json, status = excluded.status, motion_count = excluded.motion_count`)
    .bind(sub.session_code, sub.exam_id, sub.email, isFinal ? 1 : 0, sub.audio_fingerprint || null,
      attemptTranscript, critique, JSON.stringify(grades), status, motionOf(sub).length, nowIso()).run();
  return json({ ok: true, status, flags, auditStatus: audit.status, final: isFinal });
}

// ---- teacher-Muse validation (/tv/*, credential: the exam's audit token) -----------------
// The teacher's own Muse validates final submissions: it downloads the sealed audio,
// transcribes it independently, grades it, and posts its grades here. The token is
// generated per exam in the teacher app and stored only as a SHA-256 hash.

async function examByAuditToken(env, req, examId) {
  const token = req.headers.get("X-Audit-Token") || "";
  if (!examId || token.length < 16 || token.length > 200) return null;
  const exam = await loadTExam(env, examId);
  if (!exam || !exam.audit_token_hash) return null;
  const hash = await sha256hex(token);
  return ctEqual(hash, exam.audit_token_hash) ? exam : null;
}

async function tvAwaiting(req, env, url) {
  const exam = await examByAuditToken(env, req, url.searchParams.get("examId"));
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const { results } = await env.DB.prepare(
    "SELECT email, name, final_at, sealed_at, grades_json FROM t_submissions WHERE exam_id = ? AND status = 'awaiting_validation' ORDER BY final_at")
    .bind(exam.id).all();
  return json({ exam: { id: exam.id, title: exam.title },
    awaiting: results.map((r) => ({ email: r.email, name: r.name, finalAt: r.final_at, sealedAt: r.sealed_at,
      grades: r.grades_json ? JSON.parse(r.grades_json) : null })) });
}

async function tvSubmission(req, env, url) {
  const exam = await examByAuditToken(env, req, url.searchParams.get("examId"));
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const sub = await loadSubmission(env, exam.id, normEmail(url.searchParams.get("email") || ""));
  if (!sub) throw new HttpError(404, "No submission for that student.");
  const audio = audioOf(sub);
  return json({
    exam: { id: exam.id, title: exam.title, prompt: exam.prompt, promptVersion: sub.prompt_version ?? exam.prompt_version, rubric: rubricOf(exam) },
    student: { name: sub.name, email: sub.email },
    variation: sub.variation, status: sub.status, finalAt: sub.final_at, sessionCode: sub.session_code,
    transcript: sub.transcript, studentTranscript: sub.student_transcript || null,
    critique: sub.critique, grades: sub.grades_json ? JSON.parse(sub.grades_json) : null,
    audioFingerprint: sub.audio_fingerprint || null,
    audio: Object.entries(audio).map(([slide, a]) => ({ slide: Number(slide), title: a.title || "", bytes: a.bytes, sha256: a.sha256 })),
    photo: photoOf(sub) ? (({ key, ...rest }) => rest)(photoOf(sub)) : null,
    motion: motionOf(sub).map(({ key, ...rest }) => rest),
    attemptPhotos: await attemptPhotoList(env, exam.id, sub.email),
  });
}

async function attemptPhotoList(env, examId, email) {
  const { results } = await env.DB.prepare(
    "SELECT session_code, final, created_at FROM t_attempts WHERE exam_id = ? AND email = ? ORDER BY created_at")
    .bind(examId, email).all();
  return (results || []).map((a) => ({ sessionCode: a.session_code, final: !!a.final, createdAt: a.created_at }));
}

async function tvMotion(req, env, url) {
  const exam = await examByAuditToken(env, req, url.searchParams.get("examId"));
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const sub = await loadSubmission(env, exam.id, normEmail(url.searchParams.get("email") || ""));
  if (!sub) throw new HttpError(404, "No submission for that student.");
  const frame = motionOf(sub).find((m) => m.n === Number(url.searchParams.get("n")));
  if (!frame) throw new HttpError(404, "No such motion capture.");
  if (!env.AUDIO) throw new HttpError(500, "Photo storage is not configured on the server (R2 bucket binding AUDIO).");
  const obj = await env.AUDIO.get(frame.key);
  if (!obj) throw new HttpError(404, "The stored frame is missing.");
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}

async function tvPhoto(req, env, url) {
  const exam = await examByAuditToken(env, req, url.searchParams.get("examId"));
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const email = normEmail(url.searchParams.get("email") || "");
  const sub = await loadSubmission(env, exam.id, email);
  if (!sub) throw new HttpError(404, "No submission for that student.");
  if (!env.AUDIO) throw new HttpError(500, "Photo storage is not configured on the server (R2 bucket binding AUDIO).");
  const session = url.searchParams.get("session");
  let key = null;
  if (session) {
    // An earlier attempt's picture: its object key is derived from the attempt's
    // session code, the same pattern the upload used.
    const att = await env.DB.prepare("SELECT session_code FROM t_attempts WHERE exam_id = ? AND email = ? AND session_code = ?")
      .bind(exam.id, email, session).first();
    if (!att) throw new HttpError(404, "No such attempt for that student.");
    key = "exams/" + exam.id + "/" + (await sha256hex(email)).slice(0, 16) + "/" + session + "/photo.jpg";
  } else {
    const photo = photoOf(sub);
    if (!photo) throw new HttpError(404, "This submission has no picture.");
    key = photo.key;
  }
  const obj = await env.AUDIO.get(key);
  if (!obj) throw new HttpError(404, "No picture stored for that take (it may predate pictures, or the take had none).");
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
}

async function tvAudio(req, env, url) {
  const exam = await examByAuditToken(env, req, url.searchParams.get("examId"));
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const sub = await loadSubmission(env, exam.id, normEmail(url.searchParams.get("email") || ""));
  if (!sub) throw new HttpError(404, "No submission for that student.");
  const seg = audioOf(sub)[url.searchParams.get("slide") || ""];
  if (!seg) throw new HttpError(404, "No audio stored for that slide.");
  if (!env.AUDIO) throw new HttpError(500, "Audio storage is not configured on the server (R2 bucket binding AUDIO).");
  const obj = await env.AUDIO.get(seg.key);
  if (!obj) throw new HttpError(404, "The stored audio object is missing (it may have expired under the retention rule).");
  return new Response(obj.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
}

async function tvValidate(req, env) {
  const body = await readJson(req, 1024 * 1024);
  const exam = await examByAuditToken(env, req, body.examId);
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const email = normEmail(body.email || "");
  const sub = await loadSubmission(env, exam.id, email);
  if (!sub) throw new HttpError(404, "No submission for that student.");
  if (sub.status !== "awaiting_validation") throw new HttpError(409, "This submission is not awaiting validation (status: " + sub.status + ").");
  const rubric = rubricOf(exam);
  const gradesIn = body.grades && typeof body.grades === "object" ? body.grades : {};
  const vGrades = {};
  for (const el of rubric) {
    const v = Number(gradesIn[el.name]);
    if (!Number.isFinite(v)) throw new HttpError(400, "Missing or invalid grade for rubric element: " + el.name);
    vGrades[el.name] = Math.min(1, Math.max(0, v));
  }
  const vTranscript = String(body.transcript || "").slice(0, 100000);
  const studentGrades = sub.grades_json ? JSON.parse(sub.grades_json) : {};
  const audit = { status: "done", source: "teacher-claude", fractions: vGrades, model: "teacher's Muse",
    at: nowIso(), transcript: vTranscript || undefined };
  // Identity picture check: the validator viewed the submission's picture against
  // the pictures from the student's earlier submissions. A "different" verdict
  // flags the submission for the teacher; it never fails it automatically.
  const photoVerdict = ["same", "different", "unclear", "none"].includes(body.photoVerdict) ? body.photoVerdict : null;
  if (photoVerdict) audit.photo_check = { verdict: photoVerdict, note: String(body.photoNote || "").slice(0, 500), at: nowIso() };
  if (body.motionNote) audit.photo_check = { ...(audit.photo_check || {}), motion_note: String(body.motionNote).slice(0, 1000), at: nowIso() };
  const flags = computeFlags(rubric, studentGrades, audit);
  if (photoVerdict === "different") flags.push({ element: "Identity picture", student: 0, audit: 1 });
  let similarity = null;
  const against = sub.student_transcript || sub.transcript;
  if (vTranscript && against) {
    similarity = Math.round(wordSimilarity(vTranscript, against) * 1000) / 1000;
    audit.transcript_similarity = similarity;
    if (similarity < 0.6) flags.push({ element: "Transcription match", student: similarity, audit: 1 });
  }
  if (flags.length) {
    await env.DB.prepare("UPDATE t_submissions SET audit_json = ?, flags_json = ?, status = 'flagged' WHERE exam_id = ? AND email = ?")
      .bind(JSON.stringify(audit), JSON.stringify(flags), exam.id, email).run();
    return json({ ok: true, status: "flagged", flags, similarity });
  }
  // No flags: the teacher's Muse grades become the final grade, through the same
  // manual record the teacher's own override uses, so results and CSV agree.
  const manual = { fractions: vGrades, comment: String(body.comment || "Validated by the teacher's Muse.").slice(0, 2000),
    by: "teacher's Muse", at: nowIso() };
  await env.DB.prepare("UPDATE t_submissions SET audit_json = ?, flags_json = '[]', manual_json = ?, status = 'final' WHERE exam_id = ? AND email = ?")
    .bind(JSON.stringify(audit), JSON.stringify(manual), exam.id, email).run();
  return json({ ok: true, status: "final", flags: [], similarity });
}

// ---- teacher API (/api/t/*) ---------------------------------------------------------------

function cleanRubric(v) {
  if (!Array.isArray(v)) throw new HttpError(400, "The rubric must be a list.");
  const seen = new Set();
  return v.map((el) => {
    const name = String(el && el.name || "").trim();
    const points = Number(el && el.points);
    if (!name || seen.has(name)) throw new HttpError(400, "Rubric element names must be present and unique.");
    if (!Number.isFinite(points) || points <= 0) throw new HttpError(400, "Rubric element points must be positive numbers.");
    seen.add(name);
    return { name, points, guidance: String(el.guidance || "").slice(0, 2000) };
  });
}

function examView(e) {
  return { id: e.id, title: e.title, app_url: e.app_url, assignment: e.assignment, prompt: e.prompt,
    rubric: rubricOf(e), variations: variationsOf(e), prompt_version: e.prompt_version,
    opens_at: e.opens_at, closes_at: e.closes_at, owner_email: e.owner_email,
    has_audit_token: !!e.audit_token_hash,
    created_at: e.created_at, updated_at: e.updated_at, status: examStatus(e) };
}

async function teacherApi(req, env, url) {
  const t = await currentTeacher(req, env);
  if (!t) throw new HttpError(401, "Sign in first.");
  const p = url.pathname, m = req.method;

  if (p === "/api/t/settings/model" && m === "GET") {
    const cfg = (await getSettings(env, "model")) || { provider: "", base_url: "", model: "" };
    return json({ provider: cfg.provider || "", base_url: cfg.base_url || "", model: cfg.model || "",
      audio_configured: !!env.AUDIO,
      key_configured: !!env.MODEL_API_KEY });
  }
  if (p === "/api/t/settings/model" && m === "PUT") {
    const b = await readJson(req, 8192);
    const cfg = { provider: String(b.provider || "").slice(0, 60), base_url: String(b.base_url || "").slice(0, 300),
      model: String(b.model || "").slice(0, 120) };
    await env.DB.prepare("INSERT INTO t_settings (key, value_json, updated_at, updated_by) VALUES ('model', ?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
      .bind(JSON.stringify(cfg), nowIso(), t.email).run();
    return json({ ok: true });
  }

  if (p === "/api/t/exams" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT e.* FROM t_exams e LEFT JOIN t_exam_teachers et ON et.exam_id = e.id
       WHERE ? = 1 OR e.owner_email = ? OR et.email = ? ORDER BY e.created_at DESC`)
      .bind(t.is_admin ? 1 : 0, t.email, t.email).all();
    return json({ exams: results.map(examView) });
  }
  if (p === "/api/t/exams" && m === "POST") {
    const b = await readJson(req, 512 * 1024);
    const title = String(b.title || "").trim();
    if (!title) throw new HttpError(400, "Give the exam a title.");
    const id = newExamId(title);
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, variations_json, opens_at, closes_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, t.email, title, String(b.app_url || ""), String(b.assignment || ""), String(b.prompt || ""),
        JSON.stringify(cleanRubric(b.rubric || [])), JSON.stringify((b.variations || []).map((s) => String(s).slice(0, 500))),
        b.opens_at || null, b.closes_at || null, now, now).run();
    return json({ id });
  }

  const mExam = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})$/);
  if (mExam && m === "GET") return json({ exam: examView(await tExamFor(env, t, mExam[1])) });
  if (mExam && m === "PUT") {
    const e = await tExamFor(env, t, mExam[1]);
    const b = await readJson(req, 512 * 1024);
    const rubric = cleanRubric(b.rubric || []);
    const changed = String(b.prompt || "") !== e.prompt || JSON.stringify(rubric) !== e.rubric_json;
    await env.DB.prepare(
      `UPDATE t_exams SET title = ?, app_url = ?, assignment = ?, prompt = ?, rubric_json = ?, variations_json = ?,
         opens_at = ?, closes_at = ?, prompt_version = ?, updated_at = ? WHERE id = ?`)
      .bind(String(b.title || e.title), String(b.app_url ?? e.app_url), String(b.assignment ?? e.assignment),
        String(b.prompt ?? e.prompt), JSON.stringify(rubric),
        JSON.stringify((b.variations || variationsOf(e)).map((s) => String(s).slice(0, 500))),
        b.opens_at ?? e.opens_at, b.closes_at ?? e.closes_at,
        e.prompt_version + (changed ? 1 : 0), nowIso(), e.id).run();
    return json({ ok: true, prompt_version: e.prompt_version + (changed ? 1 : 0) });
  }
  if (mExam && m === "DELETE") {
    const e = await tExamFor(env, t, mExam[1]);
    if (e.owner_email !== t.email && !t.is_admin) throw new HttpError(403, "Only the owner can delete this exam.");
    if (env.AUDIO) {
      const { results } = await env.DB.prepare("SELECT email, audio_json, photo_json FROM t_submissions WHERE exam_id = ?").bind(e.id).all();
      for (const r of results) {
        for (const seg of Object.values(audioOf(r))) { try { await env.AUDIO.delete(seg.key); } catch { /* retention rule is the backstop */ } }
        const ph = photoOf(r);
        if (ph) { try { await env.AUDIO.delete(ph.key); } catch { /* retention rule is the backstop */ } }
        // Earlier attempts' pictures (kept across takes for identity comparison).
        for (const mf of motionOf(r)) { try { await env.AUDIO.delete(mf.key); } catch { /* retention rule is the backstop */ } }
        const atts = await env.DB.prepare("SELECT session_code, motion_count FROM t_attempts WHERE exam_id = ? AND email = ?").bind(e.id, r.email).all();
        for (const a of atts.results || []) {
          const base = "exams/" + e.id + "/" + (await sha256hex(r.email)).slice(0, 16) + "/" + a.session_code + "/";
          try { await env.AUDIO.delete(base + "photo.jpg"); } catch { /* retention rule is the backstop */ }
          for (let i = 1; i <= (a.motion_count || 0); i++) {
            try { await env.AUDIO.delete(base + "motion-" + i + ".jpg"); } catch { /* retention rule is the backstop */ }
          }
        }
      }
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM t_attempts WHERE exam_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM t_submissions WHERE exam_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM t_roster WHERE exam_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM t_exam_teachers WHERE exam_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM t_login_tokens WHERE exam_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM t_student_sessions WHERE exam_id = ?").bind(e.id),
      env.DB.prepare("DELETE FROM t_exams WHERE id = ?").bind(e.id),
    ]);
    return json({ ok: true });
  }

  const mRoster = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/roster$/);
  if (mRoster && m === "GET") {
    const e = await tExamFor(env, t, mRoster[1]);
    const { results } = await env.DB.prepare("SELECT email, name FROM t_roster WHERE exam_id = ? ORDER BY name, email").bind(e.id).all();
    return json({ roster: results });
  }
  if (mRoster && m === "PUT") {
    const e = await tExamFor(env, t, mRoster[1]);
    const b = await readJson(req, 512 * 1024);
    const lines = String(b.csv || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.trim());
      const email = normEmail(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
      const name = parts.length > 1 ? parts.slice(0, -1).join(", ") : "";
      if (!isEmail(email)) throw new HttpError(400, "Roster line is not 'name, email': " + line.slice(0, 80));
      rows.push([email, name]);
    }
    const stmts = [env.DB.prepare("DELETE FROM t_roster WHERE exam_id = ?").bind(e.id)];
    for (const [email, name] of rows) {
      stmts.push(env.DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES (?, ?, ?)").bind(e.id, email, name));
    }
    await env.DB.batch(stmts);
    return json({ ok: true, count: rows.length });
  }

  const mTeachers = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/teachers$/);
  if (mTeachers && m === "POST") {
    const e = await tExamFor(env, t, mTeachers[1]);
    const b = await readJson(req, 4096);
    const email = normEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, "Bad email address.");
    await env.DB.prepare("INSERT OR IGNORE INTO t_exam_teachers (exam_id, email) VALUES (?, ?)").bind(e.id, email).run();
    return json({ ok: true });
  }

  const mManual = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/manual$/);
  if (mManual && m === "POST") {
    const e = await tExamFor(env, t, mManual[1]);
    const b = await readJson(req, 1024 * 1024);
    const email = normEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, "Bad email address.");
    const transcript = String(b.transcript || "");
    if (!transcript.trim()) throw new HttpError(400, "The transcript is empty.");
    const fingerprint = await sha256hex(transcript.replace(/\s+$/g, ""));
    await env.DB.prepare(
      `INSERT INTO t_submissions (exam_id, email, name, source, session_code, status, transcript, fingerprint, sealed_at, prompt_version)
       VALUES (?, ?, ?, 'teacher', ?, 'sealed', ?, ?, ?, ?)
       ON CONFLICT(exam_id, email) DO UPDATE SET source = 'teacher', transcript = excluded.transcript,
         fingerprint = excluded.fingerprint, status = 'sealed', prompt_version = excluded.prompt_version`)
      .bind(e.id, email, String(b.name || ""), "manual-" + randomToken(16), transcript, fingerprint, nowIso(), e.prompt_version).run();
    return json({ ok: true });
  }

  const mResults = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results$/);
  if (mResults && m === "GET") {
    const e = await tExamFor(env, t, mResults[1]);
    const { results } = await env.DB.prepare("SELECT * FROM t_submissions WHERE exam_id = ? ORDER BY name, email").bind(e.id).all();
    const att = await env.DB.prepare("SELECT email, COUNT(*) AS c FROM t_attempts WHERE exam_id = ? GROUP BY email").bind(e.id).all();
    const attCount = Object.fromEntries((att.results || []).map((a) => [a.email, a.c]));
    return json({ exam: examView(e), results: results.map((r) => ({
      email: r.email, name: r.name, source: r.source, status: r.status, variation: r.variation,
      opened_at: r.opened_at, sealed_at: r.sealed_at, fingerprint: r.fingerprint, session_code: r.session_code,
      final_at: r.final_at || null, attempts: attCount[r.email] || 0,
      audio_fingerprint: r.audio_fingerprint || null,
      audio: Object.entries(audioOf(r)).map(([slide, a]) => ({ slide: Number(slide), bytes: a.bytes, sha256: a.sha256, title: a.title || "" })),
      photo: photoOf(r) ? (({ key, ...rest }) => rest)(photoOf(r)) : null,
      motion: motionOf(r).map(({ key, ...rest }) => rest),
      student_transcript: r.student_transcript || null,
      transcript: r.transcript, critique: r.critique,
      grades: r.grades_json ? JSON.parse(r.grades_json) : null,
      audit: r.audit_json ? JSON.parse(r.audit_json) : null,
      flags: JSON.parse(r.flags_json || "[]"),
      manual: JSON.parse(r.manual_json || "{}"),
      history: JSON.parse(r.history_json || "[]"),
    })) });
  }

  const mCsv = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results\.csv$/);
  if (mCsv && m === "GET") {
    const e = await tExamFor(env, t, mCsv[1]);
    const rubric = rubricOf(e);
    const { results } = await env.DB.prepare("SELECT * FROM t_submissions WHERE exam_id = ? ORDER BY name, email").bind(e.id).all();
    const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const pts = (frac, el) => typeof frac === "number" ? String(Math.round(frac * el.points * 100) / 100) : "";
    const head = ["name", "email", "source", "status"];
    for (const el of rubric) head.push(el.name + " (student)", el.name + " (audit)", el.name + " (final)");
    head.push("total (final)", "comment");
    const lines = [head.map(q).join(",")];
    for (const r of results) {
      const grades = r.grades_json ? JSON.parse(r.grades_json) : {};
      const audit = r.audit_json ? JSON.parse(r.audit_json) : {};
      const manual = JSON.parse(r.manual_json || "{}");
      const row = [r.name, r.email, r.source, r.status];
      let total = 0, anyFinal = false;
      for (const el of rubric) {
        const f = manual.fractions && typeof manual.fractions[el.name] === "number" ? manual.fractions[el.name]
          : typeof grades[el.name] === "number" ? grades[el.name] : null;
        row.push(pts(grades[el.name], el), pts(audit.fractions ? audit.fractions[el.name] : undefined, el), pts(f, el));
        if (f !== null) { total += f * el.points; anyFinal = true; }
      }
      row.push(anyFinal ? String(Math.round(total * 100) / 100) : "", manual.comment || "");
      lines.push(row.map(q).join(","));
    }
    return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.id}-results.csv"`, "Cache-Control": "no-store" } });
  }


  const mAudio = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results\/([^/]+)\/audio\/(\d{1,2})$/);
  if (mAudio && m === "GET") {
    const e = await tExamFor(env, t, mAudio[1]);
    const email = normEmail(decodeURIComponent(mAudio[2]));
    const sub = await loadSubmission(env, e.id, email);
    if (!sub) throw new HttpError(404, "No submission for that student.");
    const seg = audioOf(sub)[mAudio[3]];
    if (!seg) throw new HttpError(404, "No audio for that slide.");
    if (!env.AUDIO) throw new HttpError(500, "Audio storage is not configured on the server (R2 bucket binding AUDIO).");
    const obj = await env.AUDIO.get(seg.key);
    if (!obj) throw new HttpError(404, "The stored audio object is missing (it may have expired under the retention rule).");
    return new Response(obj.body, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="slide-${mAudio[3]}.wav"` } });
  }

  const mToken = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/audit-token$/);
  if (mToken && m === "POST") {
    const e = await tExamFor(env, t, mToken[1]);
    const token = randomToken(24);
    await env.DB.prepare("UPDATE t_exams SET audit_token_hash = ? WHERE id = ?").bind(await sha256hex(token), e.id).run();
    return json({ ok: true, token }); // shown once; only its hash is stored
  }

  const mRelease = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results\/([^/]+)\/release$/);
  if (mRelease && m === "POST") {
    const e = await tExamFor(env, t, mRelease[1]);
    const email = normEmail(decodeURIComponent(mRelease[2]));
    const sub = await loadSubmission(env, e.id, email);
    if (!sub) throw new HttpError(404, "No submission for that student.");
    // Release a final submission for more practice: the final marking and any final
    // grade set from it are cleared; graded attempts stay in the attempt log.
    await env.DB.prepare("UPDATE t_submissions SET status = 'graded', final_at = NULL, manual_json = '{}' WHERE exam_id = ? AND email = ?")
      .bind(e.id, email).run();
    return json({ ok: true });
  }

  const mPhoto = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results\/([^/]+)\/photo$/);
  if (mPhoto && m === "GET") {
    const e = await tExamFor(env, t, mPhoto[1]);
    const email = normEmail(decodeURIComponent(mPhoto[2]));
    const sub = await loadSubmission(env, e.id, email);
    if (!sub) throw new HttpError(404, "No submission for that student.");
    const photo = photoOf(sub);
    if (!photo) throw new HttpError(404, "This submission has no picture.");
    if (!env.AUDIO) throw new HttpError(500, "Photo storage is not configured on the server (R2 bucket binding AUDIO).");
    const obj = await env.AUDIO.get(photo.key);
    if (!obj) throw new HttpError(404, "The stored picture is missing (it may have expired under the retention rule).");
    return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  }

  const mMotion = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results\/([^/]+)\/motion\/(\d{1,2})$/);
  if (mMotion && m === "GET") {
    const e = await tExamFor(env, t, mMotion[1]);
    const email = normEmail(decodeURIComponent(mMotion[2]));
    const sub = await loadSubmission(env, e.id, email);
    if (!sub) throw new HttpError(404, "No submission for that student.");
    const frame = motionOf(sub).find((x) => x.n === Number(mMotion[3]));
    if (!frame) throw new HttpError(404, "No such motion capture.");
    if (!env.AUDIO) throw new HttpError(500, "Photo storage is not configured on the server (R2 bucket binding AUDIO).");
    const obj = await env.AUDIO.get(frame.key);
    if (!obj) throw new HttpError(404, "The stored frame is missing.");
    return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  }

  const mOverride = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results\/([^/]+)\/override$/);
  if (mOverride && m === "POST") {
    const e = await tExamFor(env, t, mOverride[1]);
    const email = normEmail(decodeURIComponent(mOverride[2]));
    const sub = await loadSubmission(env, e.id, email);
    if (!sub) throw new HttpError(404, "No submission for that student.");
    const b = await readJson(req, 8192);
    const rubric = rubricOf(e);
    const fractions = {};
    for (const el of rubric) {
      const v = b.fractions ? Number(b.fractions[el.name]) : NaN;
      if (Number.isFinite(v)) fractions[el.name] = Math.min(1, Math.max(0, v));
    }
    const manual = { fractions, comment: String(b.comment || "").slice(0, 2000), by: t.email, at: nowIso() };
    await env.DB.prepare("UPDATE t_submissions SET manual_json = ?, status = 'final' WHERE exam_id = ? AND email = ?")
      .bind(JSON.stringify(manual), e.id, email).run();
    return json({ ok: true });
  }

  throw new HttpError(404, "Not found.");
}

// ---- dispatcher ----------------------------------------------------------------------------

export async function handleTranscript(req, env, ctx, url) {
  const p = url.pathname, m = req.method;
  try {
    if (p.startsWith("/api/t/")) return await teacherApi(req, env, url);
    const H = corsT(req, env);
    if (m === "OPTIONS") return new Response(null, { status: 204, headers: H });
    if (p.startsWith("/tv/")) {
      let res = null;
      if (m === "GET" && p === "/tv/awaiting") res = await tvAwaiting(req, env, url);
      else if (m === "GET" && p === "/tv/submission") res = await tvSubmission(req, env, url);
      else if (m === "GET" && p === "/tv/audio") res = await tvAudio(req, env, url);
      else if (m === "GET" && p === "/tv/photo") res = await tvPhoto(req, env, url);
      else if (m === "GET" && p === "/tv/motion") res = await tvMotion(req, env, url);
      else if (m === "POST" && p === "/tv/validate") res = await tvValidate(req, env);
      if (res) { for (const [k, v] of Object.entries(H)) if (k !== "Content-Type") res.headers.set(k, v); return res; }
      throw new HttpError(404, "Not found.");
    }
    let res = null;
    if (m === "POST" && p === "/t/login/request") res = await studentLoginRequest(req, env, ctx);
    else if (m === "POST" && p === "/t/login/verify") res = await studentLoginVerify(req, env);
    else if (m === "POST" && p === "/t/session") res = await sealSessionOpen(req, env);
    else if (m === "POST" && p === "/t/segment") res = await sealSegment(req, env);
    else if (m === "POST" && p === "/t/audio-segment") res = await audioSegment(req, env, url);
    else if (m === "POST" && p === "/t/photo") res = await photoUpload(req, env, url);
    else if (m === "POST" && p === "/t/motion-photo") res = await motionUpload(req, env, url);
    else if (m === "POST" && p === "/t/seal") res = await sealTake(req, env);
    else if (m === "GET" && p === "/t/packet") res = await gradingPacket(env, url);
    else if (m === "GET" && p === "/t/audio") res = await audioDownload(env, url);
    else if (m === "POST" && p === "/t/verify") res = await verifyTranscript(req, env);
    else if (m === "POST" && p === "/t/critique") res = await uploadCritique(req, env);
    if (!res) return json({ error: "Not found." }, 404, H);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(H)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    if (e instanceof HttpError) {
      const H = p.startsWith("/t/") ? corsT(req, env) : {};
      return json({ error: e.message }, e.status, H);
    }
    throw e;
  }
}
