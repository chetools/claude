// Exam support for the keypoints flow (the only exam flow): student sign-in by
// emailed link, audio take sealing, the grading packet and critique upload,
// watch grading, and the teacher API for managing exams. Routes: /t/*
// (student, CORS), /api/t/* (teacher, session cookie) and /w/* (watch).
// Exam content (prompt, rubric, student app address) is read from the
// database, never hard-coded here. The server makes no model calls of any
// kind: transcription and grading happen in the student's or teacher's Muse.
import { currentTeacher } from "./auth.js";
import { json, readJson, sha256hex, randomToken, newExamId, normEmail, isEmail, esc, examStatus, HttpError, ctEqual } from "./util.js";

const TOKEN_MIN = 15;
const SESSION_HOURS = 12;
const RATE_PER_HOUR = 5;
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

// ---- audio takes (R2) ----------------------------------------------------------------------
// A spoken take is sealed from its audio: the app uploads one WAV segment per
// slide (16 kHz mono, from the take's own capture), the server stores the
// segments in the AUDIO R2 bucket and seals a fingerprint of the audio. The
// server never transcribes: the take stays in status 'audio_sealed' (audio
// held and fingerprinted, no transcript invented) until the student's Muse
// downloads the segments under the session code, transcribes them, and uploads
// its transcript with its critique and grades. Without a bucket the audio
// routes fail closed.
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
  const receipt = await receiptCode(env, [sub.session_code, sub.email, audioFp, "", "", sub.opened_at, sealedAt]);
  await env.DB.prepare(
    "UPDATE t_submissions SET status = 'audio_sealed', audio_fingerprint = ?, photo_fingerprint = ?, receipt = ?, sealed_at = ?, prompt_version = ?, transcription_json = '{}' WHERE exam_id = ? AND email = ?")
    .bind(audioFp, photo ? photo.sha256 : null, receipt, sealedAt, exam.prompt_version, exam.id, sub.email).run();
  return { audioFingerprint: audioFp, transcriptFingerprint: null, receipt, sealedAt,
    photoFingerprint: photo ? photo.sha256 : null, sealedTranscript: null };
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
  // take (its graded attempts are archived in t_attempts).
  // A new take supersedes the previous take's audio: its graded record is archived
  // in t_attempts, and its audio objects are removed so storage holds one take each.
  if (existing && env.AUDIO) {
    for (const a of Object.values(audioOf(existing))) { try { await env.AUDIO.delete(a.key); } catch { /* already gone */ } }
    for (const mf of motionOf(existing)) { try { await env.AUDIO.delete(mf.key); } catch { /* already gone */ } }
    // The previous take's picture is NOT deleted: pictures are small and cheap
    // to keep. Exam deletion removes them (see the delete route, which walks
    // the attempt log).
  }
  const rostered = await env.DB.prepare("SELECT name FROM t_roster WHERE exam_id = ? AND email = ?").bind(exam.id, s.email).first();
  const sessionCode = randomToken(24);
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO t_submissions (exam_id, email, name, source, session_code, status, opened_at,
       segments_json, history_json, flags_json, manual_json)
     VALUES (?, ?, ?, 'sealed', ?, 'open', ?, '{}', '[]', '[]', '{}')
     ON CONFLICT(exam_id, email) DO UPDATE SET session_code = excluded.session_code, status = 'open',
       opened_at = excluded.opened_at, segments_json = '{}', history_json = '[]',
       transcript = NULL, fingerprint = NULL, receipt = NULL, sealed_at = NULL, final_at = NULL,
       audio_json = '{}', audio_fingerprint = NULL, transcription_json = '{}',
       photo_json = '{}', photo_fingerprint = NULL, motion_json = '[]'`)
    .bind(exam.id, s.email, rostered ? rostered.name : "", sessionCode, now).run();
  return json({ sessionCode, openedAt: now });
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
  if (sub.status === "audio_sealed" || sub.status === "graded" || sub.status === "flagged" || sub.status === "final") {
    return json({ sessionCode: sub.session_code, sealedAt: sub.sealed_at, audioFingerprint: sub.audio_fingerprint,
      transcriptFingerprint: null, receipt: sub.receipt, sealedTranscript: null, alreadySealed: true });
  }
  // Takes seal from their stored audio segments only.
  const audio = audioOf(sub);
  if (!Object.keys(audio).length) throw new HttpError(400, "No audio segments were received for this take.");
  if (!env.AUDIO) throw new HttpError(500, "Audio storage is not configured on the server (R2 bucket binding AUDIO).");
  const out = await finaliseAudioSeal(env, exam, sub);
  return json({ sessionCode: sub.session_code, ...out });
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
  if (!Object.keys(audio).length) throw new HttpError(409, "This submission is not sealed yet.");
  const exam = await loadTExam(env, sub.exam_id);
  return json({
    exam: { id: exam.id, title: exam.title, prompt: exam.prompt, promptVersion: sub.prompt_version ?? exam.prompt_version,
      rubric: rubricOf(exam) },
    student: { name: sub.name, email: sub.email },
    audioFingerprint: sub.audio_fingerprint || null,
    audio: Object.entries(audio).map(([slide, a]) => ({ slide: Number(slide), title: a.title || "", bytes: a.bytes, sha256: a.sha256 })),
    photo: photoOf(sub) ? (({ key, ...rest }) => rest)(photoOf(sub)) : null,
    motion: motionOf(sub).map(({ key, ...rest }) => rest),
  });
}

// One sealed audio segment, credentialed by the session code like the packet itself:
// the student's Muse downloads the segments, transcribes them, and grades from its
// own transcript, which the critique upload stores on the submission.
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

async function uploadCritique(req, env) {
  const body = await readJson(req, 1024 * 1024);
  const sub = await submissionByCode(env, body.sessionCode);
  if (!sub) throw new HttpError(404, "Unknown session code.");
  const exam = await loadTExam(env, sub.exam_id);
  // Audio-sealed take: the student's Muse transcribed the sealed audio itself.
  // Its transcript is stored as the student's transcript (the seal itself is the
  // audio fingerprint; nothing here overwrites it).
  if (!Object.keys(audioOf(sub)).length) {
    throw new HttpError(409, "This submission is not sealed yet.");
  }
  const studentTranscript = String(body.transcript || "").replace(/\s+$/g, "").replace(/^\s+/g, "");
  if (!studentTranscript) throw new HttpError(400, "For an audio-sealed take, the upload must include the transcript made from the sealed audio.");
  const attemptTranscript = studentTranscript;
  const sFp = await sha256hex(studentTranscript);
  await env.DB.prepare("UPDATE t_submissions SET student_transcript = ?, student_fingerprint = ? WHERE exam_id = ? AND email = ?")
    .bind(studentTranscript, sFp, sub.exam_id, sub.email).run();
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
  // No audit or validation runs on the server (the server makes no model calls
  // and never re-grades): the audit field records that nothing ran, and the
  // flags list stays empty. The teacher's own override in the Results view is
  // the only later adjustment.
  const audit = { status: "not_run" };
  const flags = [];
  const status = "graded";
  // Every upload is archived as an attempt; the keypoints standing grade is the
  // best attempt's, computed from t_attempts by the /k/standing route.
  await env.DB.prepare(
    "UPDATE t_submissions SET critique = ?, grades_json = ?, audit_json = ?, flags_json = ?, status = ?, watch_claim_at = NULL WHERE exam_id = ? AND email = ?")
    .bind(critique, JSON.stringify(grades), JSON.stringify(audit), JSON.stringify(flags), status, sub.exam_id, sub.email).run();
  await env.DB.prepare(
    `INSERT INTO t_attempts (session_code, exam_id, email, final, audio_fingerprint, student_transcript, critique, grades_json, status, motion_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_code) DO UPDATE SET final = excluded.final, student_transcript = excluded.student_transcript,
       critique = excluded.critique, grades_json = excluded.grades_json, status = excluded.status, motion_count = excluded.motion_count`)
    .bind(sub.session_code, sub.exam_id, sub.email, 0, sub.audio_fingerprint || null,
      attemptTranscript, critique, JSON.stringify(grades), status, motionOf(sub).length, nowIso()).run();
  return json({ ok: true, status, flags, auditStatus: audit.status });
}

// ---- watch grading (/w/*, credentials: the student's watch token / poll key) --------------
// Option 2: the student's Muse learns about sealed takes without the student pasting
// anything. A low-privilege poll key answers only "is anything pending?"; the grading
// token lists the pending takes. Both are generated per student per exam, authenticated
// by SHA-256 hash, and stored AES-GCM encrypted so the teacher app can re-email the
// same values (decryption is used only by that email action, never for authentication).
// The encryption key is derived from SEAL_SECRET, so rotating SEAL_SECRET makes the
// stored values unreadable; regenerating the credentials is the recovery.

const WATCH_CLAIM_MS = 15 * 60e3;   // a pending fetch claims a take for 15 minutes

async function watchKey(env) {
  if (!env.SEAL_SECRET) throw new HttpError(500, "Watch tokens are not configured on the server (SEAL_SECRET).");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SEAL_SECRET + "|watch-enc-v1|"));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function watchEncrypt(env, value) {
  const key = await watchKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv); all.set(ct, iv.length);
  return btoa(String.fromCharCode(...all));   // base64(iv || ciphertext)
}

export async function watchDecrypt(env, encValue) {
  const key = await watchKey(env);
  const all = Uint8Array.from(atob(String(encValue)), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
  return new TextDecoder().decode(pt);
}

// Creates the credential pair for one student in one exam, only where none exists.
// Returns {created: true, token, pollKey} for a new row, {created: false} otherwise.
export async function createWatchCredentials(env, examId, email, name = "") {
  email = normEmail(email);
  const existing = await env.DB.prepare("SELECT email FROM t_watch_tokens WHERE exam_id = ? AND email = ?")
    .bind(examId, email).first();
  if (existing) return { created: false };
  const token = randomToken(32), pollKey = randomToken(32);
  await env.DB.prepare(
    `INSERT INTO t_watch_tokens (exam_id, email, name, token_hash, token_enc, poll_hash, poll_enc, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(examId, email, String(name || ""), await sha256hex(token), await watchEncrypt(env, token),
      await sha256hex(pollKey), await watchEncrypt(env, pollKey), nowIso()).run();
  return { created: true, token, pollKey };
}

// Replaces both credentials for one student (regenerate): the old row is deleted
// first, so the old token and poll key fail authentication immediately afterwards.
export async function replaceWatchCredentials(env, examId, email, name = "") {
  email = normEmail(email);
  await env.DB.prepare("DELETE FROM t_watch_tokens WHERE exam_id = ? AND email = ?").bind(examId, email).run();
  return createWatchCredentials(env, examId, email, name);
}

async function watchRow(env, req, header, column) {
  const v = req.headers.get(header) || "";
  if (v.length < 16 || v.length > 200) return null;
  const hash = await sha256hex(v);
  const row = await env.DB.prepare("SELECT * FROM t_watch_tokens WHERE " + column + " = ?").bind(hash).first();
  return row && ctEqual(hash, row[column]) ? row : null;
}

// Takes awaiting grading for one watch row: sealed, and not inside a live claim.
async function pendingTakes(env, row) {
  const { results } = await env.DB.prepare(
    `SELECT s.session_code, s.status, s.sealed_at, e.title FROM t_submissions s
     JOIN t_exams e ON e.id = s.exam_id
     WHERE s.exam_id = ? AND s.email = ? AND s.status = 'audio_sealed'
       AND (s.watch_claim_at IS NULL OR s.watch_claim_at <= ?) ORDER BY s.sealed_at`)
    .bind(row.exam_id, row.email, isoIn(-WATCH_CLAIM_MS)).all();
  return results;
}

async function watchPoll(req, env) {
  const row = await watchRow(env, req, "X-Poll-Key", "poll_hash");
  if (!row) throw new HttpError(401, "Bad or revoked poll key.");
  const pending = (await pendingTakes(env, row)).length;
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE t_watch_tokens SET last_poll_at = ?, last_pending_at = CASE WHEN ? > 0 THEN ? ELSE last_pending_at END WHERE exam_id = ? AND email = ?")
    .bind(now, pending, now, row.exam_id, row.email).run();
  return json({ pending });
}

async function watchPending(req, env) {
  const row = await watchRow(env, req, "X-Watch-Token", "token_hash");
  if (!row) throw new HttpError(401, "Bad or revoked watch token.");
  const rows = await pendingTakes(env, row);
  const flow = "keypoints";   // keypoints is the only flow
  const now = nowIso();
  if (rows.length) {
    await env.DB.batch(rows.map((tk) => env.DB.prepare(
      "UPDATE t_submissions SET watch_claim_at = ? WHERE exam_id = ? AND email = ? AND session_code = ?")
      .bind(now, row.exam_id, row.email, tk.session_code)));
  }
  return json({ takes: rows.map((tk) => ({ examId: row.exam_id, title: tk.title, sessionCode: tk.session_code,
    status: tk.status, flow, sealedAt: tk.sealed_at })) });
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
    rubric: rubricOf(e), prompt_version: e.prompt_version,
    opens_at: e.opens_at, closes_at: e.closes_at, owner_email: e.owner_email,
    has_audit_token: !!e.audit_token_hash,
    created_at: e.created_at, updated_at: e.updated_at, status: examStatus(e) };
}

async function teacherApi(req, env, url) {
  const t = await currentTeacher(req, env);
  if (!t) throw new HttpError(401, "Sign in first.");
  const p = url.pathname, m = req.method;

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
      `INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, opens_at, closes_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, t.email, title, String(b.app_url || ""), String(b.assignment || ""), String(b.prompt || ""),
        JSON.stringify(cleanRubric(b.rubric || [])),
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
      `UPDATE t_exams SET title = ?, app_url = ?, assignment = ?, prompt = ?, rubric_json = ?,
         opens_at = ?, closes_at = ?, prompt_version = ?, updated_at = ? WHERE id = ?`)
      .bind(String(b.title || e.title), String(b.app_url ?? e.app_url), String(b.assignment ?? e.assignment),
        String(b.prompt ?? e.prompt), JSON.stringify(rubric),
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
        // Earlier attempts' pictures and scene-change captures (kept across takes).
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
      env.DB.prepare("DELETE FROM t_watch_tokens WHERE exam_id = ?").bind(e.id),
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

  const mResults = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/results$/);
  if (mResults && m === "GET") {
    const e = await tExamFor(env, t, mResults[1]);
    const { results } = await env.DB.prepare("SELECT * FROM t_submissions WHERE exam_id = ? ORDER BY name, email").bind(e.id).all();
    const att = await env.DB.prepare("SELECT email, COUNT(*) AS c FROM t_attempts WHERE exam_id = ? GROUP BY email").bind(e.id).all();
    const attCount = Object.fromEntries((att.results || []).map((a) => [a.email, a.c]));
    return json({ exam: examView(e), results: results.map((r) => ({
      email: r.email, name: r.name, source: r.source, status: r.status,
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
    for (const el of rubric) head.push(el.name + " (student)", el.name + " (final)");
    head.push("total (final)", "comment");
    const lines = [head.map(q).join(",")];
    for (const r of results) {
      const grades = r.grades_json ? JSON.parse(r.grades_json) : {};
      const manual = JSON.parse(r.manual_json || "{}");
      const row = [r.name, r.email, r.source, r.status];
      let total = 0, anyFinal = false;
      for (const el of rubric) {
        const f = manual.fractions && typeof manual.fractions[el.name] === "number" ? manual.fractions[el.name]
          : typeof grades[el.name] === "number" ? grades[el.name] : null;
        row.push(pts(grades[el.name], el), pts(f, el));
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

  // ---- watch tokens (teacher management; list views carry metadata only) -------------
  const watchMeta = (r) => ({ email: r.email, name: r.name || "", status: "active",
    created_at: r.created_at, last_emailed_at: r.last_emailed_at,
    last_poll_at: r.last_poll_at, last_pending_at: r.last_pending_at });
  const loadWatchRow = (env, examId, email) => env.DB.prepare(
    "SELECT * FROM t_watch_tokens WHERE exam_id = ? AND email = ?").bind(examId, email).first();
  const rosterName = async (env, examId, email) => {
    const r = await env.DB.prepare("SELECT name FROM t_roster WHERE exam_id = ? AND email = ?").bind(examId, email).first();
    return r ? r.name : "";
  };
  // Accepts {entries: "Name, email\n..."} (roster form) or {emails: [...]}.
  const watchEntries = (b) => {
    const out = [];
    if (Array.isArray(b.emails)) {
      for (const v of b.emails) {
        const email = normEmail(v);
        if (!isEmail(email)) throw new HttpError(400, "Bad email address: " + String(v).slice(0, 80));
        out.push({ email, name: "" });
      }
    }
    for (const line of String(b.entries || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      const parts = line.split(",").map((s) => s.trim());
      const email = normEmail(parts.length > 1 ? parts[parts.length - 1] : parts[0]);
      if (!isEmail(email)) throw new HttpError(400, "Line is not 'name, email': " + line.slice(0, 80));
      out.push({ email, name: parts.length > 1 ? parts.slice(0, -1).join(", ") : "" });
    }
    return out;
  };

  const mWatch = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/watch-tokens$/);
  if (mWatch && m === "GET") {
    const e = await tExamFor(env, t, mWatch[1]);
    const { results } = await env.DB.prepare(
      "SELECT email, name, created_at, last_emailed_at, last_poll_at, last_pending_at FROM t_watch_tokens WHERE exam_id = ? ORDER BY name, email")
      .bind(e.id).all();
    return json({ tokens: results.map(watchMeta) });
  }
  if (mWatch && m === "POST") {
    const e = await tExamFor(env, t, mWatch[1]);
    const b = await readJson(req, 512 * 1024);
    let added = 0, existing = 0;
    for (const { email, name } of watchEntries(b)) {
      const r = await createWatchCredentials(env, e.id, email, name || (await rosterName(env, e.id, email)));
      if (r.created) added++; else existing++;
    }
    return json({ ok: true, added, existing });
  }
  if (mWatch && m === "DELETE") {
    const e = await tExamFor(env, t, mWatch[1]);
    const b = await readJson(req, 512 * 1024);
    const emails = Array.isArray(b.emails) ? b.emails.map(normEmail) : [normEmail(b.email)];
    let removed = 0;
    for (const email of emails) {
      if (!isEmail(email)) throw new HttpError(400, "Bad email address.");
      const r = await env.DB.prepare("DELETE FROM t_watch_tokens WHERE exam_id = ? AND email = ?").bind(e.id, email).run();
      removed += r.meta.changes || 0;
    }
    return json({ ok: true, removed });
  }

  const mWatchRegen = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/watch-tokens\/regenerate$/);
  if (mWatchRegen && m === "POST") {
    const e = await tExamFor(env, t, mWatchRegen[1]);
    const b = await readJson(req, 4096);
    const email = normEmail(b.email);
    if (!isEmail(email)) throw new HttpError(400, "Bad email address.");
    const old = await loadWatchRow(env, e.id, email);
    await replaceWatchCredentials(env, e.id, email, (old && old.name) || (await rosterName(env, e.id, email)));
    return json({ ok: true, token: watchMeta(await loadWatchRow(env, e.id, email)) });
  }

  const mWatchEmail = p.match(/^\/api\/t\/exams\/([a-z0-9-]{1,40})\/watch-tokens\/email$/);
  if (mWatchEmail && m === "POST") {
    const e = await tExamFor(env, t, mWatchEmail[1]);
    const b = await readJson(req, 512 * 1024);
    let targets;
    if (b.all === true) {
      const rows = await env.DB.prepare(
        `SELECT email FROM t_watch_tokens WHERE exam_id = ?
         UNION SELECT email FROM t_roster WHERE exam_id = ? ORDER BY email`).bind(e.id, e.id).all();
      targets = (rows.results || []).map((r) => r.email);
    } else {
      targets = watchEntries(b).map((x) => x.email);
    }
    const server = env.APP_ORIGIN || url.origin;
    const results = [];
    for (const email of targets) {
      try {
        await createWatchCredentials(env, e.id, email, await rosterName(env, e.id, email));
        const row = await loadWatchRow(env, e.id, email);
        const token = await watchDecrypt(env, row.token_enc);
        const pollKey = await watchDecrypt(env, row.poll_enc);
        const setup = [
          "Set up watch grading for \"" + e.title + "\" in your Muse, once:",
          "",
          "Server: " + server,
          "My grading token: " + token,
          "My poll key: " + pollKey,
          "",
          "Paste this instruction into your Muse:",
          "\"Set up watch grading with the watch-grading skill",
          "(https://github.com/chetools/muse/tree/main/watch-grading-skill).",
          "Use the server, grading token and poll key in this email as my watch",
          "credentials: poll the server every 60 seconds with the poll key, and",
          "when a sealed take of mine is pending, grade it with the keypoints-",
          "grading skill (https://github.com/chetools/muse/tree/main/keypoints-grading-skill)",
          "and upload the grades. Do not print",
          "the token or the poll key back to me.\"",
          "",
          "After you record a take you do not have to wait for the next poll:",
          "open your Muse and say \"check now\" and it will look for your take",
          "at once and grade it.",
        ].join("\n");
        const html = setup.split("\n").map((l) => l ? "<p>" + esc(l) + "</p>" : "").join("");
        await sendMail(env, email, "Your Muse watch-grading setup for " + e.title, html, setup);
        await env.DB.prepare("UPDATE t_watch_tokens SET last_emailed_at = ? WHERE exam_id = ? AND email = ?")
          .bind(nowIso(), e.id, email).run();
        results.push({ email, sent: true });
      } catch (err) {
        results.push({ email, error: "stored token cannot be read — regenerate it" });
      }
    }
    return json({ ok: true, results });
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
    // Release a submission the teacher has marked final (through the Results
    // override) for more practice: the final marking and any final grade set
    // from it are cleared; graded attempts stay in the attempt log.
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
    if (p.startsWith("/w/")) {
      let res = null;
      if (m === "GET" && p === "/w/poll") res = await watchPoll(req, env);
      else if (m === "GET" && p === "/w/pending") res = await watchPending(req, env);
      if (res) return res;
      throw new HttpError(404, "Not found.");
    }
    let res = null;
    if (m === "POST" && p === "/t/login/request") res = await studentLoginRequest(req, env, ctx);
    else if (m === "POST" && p === "/t/login/verify") res = await studentLoginVerify(req, env);
    else if (m === "POST" && p === "/t/session") res = await sealSessionOpen(req, env);
    else if (m === "POST" && p === "/t/audio-segment") res = await audioSegment(req, env, url);
    else if (m === "POST" && p === "/t/photo") res = await photoUpload(req, env, url);
    else if (m === "POST" && p === "/t/motion-photo") res = await motionUpload(req, env, url);
    else if (m === "POST" && p === "/t/seal") res = await sealTake(req, env);
    else if (m === "GET" && p === "/t/packet") res = await gradingPacket(env, url);
    else if (m === "GET" && p === "/t/audio") res = await audioDownload(env, url);
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
