// Keypoints assignments: routes under /k/ for the explain-the-page flow, the
// only exam flow. The shared exam infrastructure in transcript.js (roster
// sign-in, audio sealing, the grading packet and critique uploads) is used
// unchanged; this module holds only what that infrastructure has no place
// for: the assignment page, the approved answer key, the model-take identity,
// and the standing (best) grade. Teacher-side writes are credentialed by the
// exam's audit token (header X-Audit-Token).
import { json, readJson, sha256hex, normEmail, isEmail, examStatus, HttpError, ctEqual } from "./util.js";

const nowIso = () => new Date().toISOString();

const loadExam = (env, id) => typeof id === "string" && id.length < 64
  ? env.DB.prepare("SELECT * FROM t_exams WHERE id = ?").bind(id).first() : Promise.resolve(null);

const rubricOf = (exam) => { try { return JSON.parse(exam.rubric_json || "[]"); } catch { return []; } };

function corsK(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, X-Student-Session, X-Audit-Token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "600", "Vary": "Origin" }
    : { "Vary": "Origin" };
}

async function examByAuditToken(env, req, examId) {
  const token = req.headers.get("X-Audit-Token") || "";
  if (!examId || token.length < 16 || token.length > 200) return null;
  const exam = await loadExam(env, examId);
  if (!exam || !exam.audit_token_hash) return null;
  const hash = await sha256hex(token);
  return ctEqual(hash, exam.audit_token_hash) ? exam : null;
}

async function studentSession(req, env) {
  const v = req.headers.get("X-Student-Session") || "";
  if (!v || v.length > 100) return null;
  return env.DB.prepare(
    "SELECT exam_id, email FROM t_student_sessions WHERE session_hash = ? AND expires_at > ?")
    .bind(await sha256hex(v), nowIso()).first();
}

const rosterRole = async (env, examId, email) => {
  const r = await env.DB.prepare("SELECT role FROM t_roster WHERE exam_id = ? AND email = ?").bind(examId, email).first();
  return r ? (r.role || "student") : null;
};

const loadKey = async (env, examId) => {
  const row = await env.DB.prepare("SELECT * FROM k_keys WHERE exam_id = ?").bind(examId).first();
  if (!row) return null;
  try { return { ...row, key: JSON.parse(row.key_json) }; } catch { return null; }
};

async function submissionByCode(env, code) {
  if (typeof code !== "string" || code.length < 10 || code.length > 100) return null;
  return env.DB.prepare("SELECT * FROM t_submissions WHERE session_code = ?").bind(code).first();
}

// ---- teacher-skill writes (audit token) ---------------------------------------------

async function postPage(req, env) {
  const body = await readJson(req, 4 * 1024 * 1024);
  const exam = await examByAuditToken(env, req, body.examId);
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const pageHtml = String(body.pageHtml || "");
  if (!pageHtml || pageHtml.length > 2 * 1024 * 1024) throw new HttpError(400, "The page fragment is empty or too large.");
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO k_pages (exam_id, page_html, latex, photos, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exam_id) DO UPDATE SET page_html = excluded.page_html, latex = excluded.latex,
       photos = excluded.photos, updated_at = excluded.updated_at`)
    .bind(exam.id, pageHtml, String(body.latex || "").slice(0, 1024 * 1024), Math.max(0, Math.floor(Number(body.photos) || 0)), now).run();
  return json({ ok: true, examId: exam.id, title: exam.title });
}

async function postKey(req, env) {
  const body = await readJson(req, 1024 * 1024);
  const exam = await examByAuditToken(env, req, body.examId);
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const pts = body.key && Array.isArray(body.key.points) ? body.key.points : null;
  if (!pts || !pts.length || pts.length > 60) throw new HttpError(400, "The key needs between 1 and 60 points.");
  const points = pts.map((p, i) => {
    const text = String((p && p.text) || "").trim().slice(0, 2000);
    const connection = String((p && p.connection) || "").trim().slice(0, 500);
    const value = Number(p && p.points);
    if (!text) throw new HttpError(400, "Key point " + (i + 1) + " has no text.");
    if (!Number.isFinite(value) || value <= 0 || value > 1000) throw new HttpError(400, "Key point " + (i + 1) + " needs a positive points value.");
    return { text, connection, points: value };
  });
  const total = points.reduce((s, p) => s + p.points, 0);
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO k_keys (exam_id, key_json, total_points, approved_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exam_id) DO UPDATE SET key_json = excluded.key_json, total_points = excluded.total_points,
       updated_at = excluded.updated_at`)
    .bind(exam.id, JSON.stringify({ points }), total, now, now).run();
  // Project the key onto the exam rubric: the existing critique upload grades a
  // fraction per rubric element, and the grading packet carries the rubric — so the
  // key reaches the student's Muse, after sealing, through machinery that exists.
  const rubric = points.map((p, i) => ({ name: "Point " + (i + 1), points: p.points,
    guidance: p.text + (p.connection ? " Connection: " + p.connection : "") }));
  await env.DB.prepare("UPDATE t_exams SET rubric_json = ?, prompt_version = prompt_version + 1, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(rubric), now, exam.id).run();
  return json({ ok: true, examId: exam.id, totalPoints: total, points: points.length });
}

async function postModelRoster(req, env) {
  const body = await readJson(req, 8192);
  const exam = await examByAuditToken(env, req, body.examId);
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const email = normEmail(body.email);
  if (!isEmail(email)) throw new HttpError(400, "A valid email is required.");
  await env.DB.prepare(
    `INSERT INTO t_roster (exam_id, email, name, role) VALUES (?, ?, ?, 'model')
     ON CONFLICT(exam_id, email) DO UPDATE SET role = 'model', name = excluded.name`)
    .bind(exam.id, email, String(body.name || "Model take").slice(0, 120)).run();
  return json({ ok: true, examId: exam.id, email, role: "model" });
}

async function getModel(req, env, url) {
  const exam = await examByAuditToken(env, req, url.searchParams.get("exam"));
  if (!exam) throw new HttpError(401, "Bad or missing audit token for this exam.");
  const { results } = await env.DB.prepare(
    `SELECT s.email, s.session_code, s.status, s.audio_fingerprint, s.sealed_at FROM t_submissions s
     JOIN t_roster r ON r.exam_id = s.exam_id AND r.email = s.email
     WHERE s.exam_id = ? AND r.role = 'model' ORDER BY s.opened_at DESC`).bind(exam.id).all();
  return json({ exam: { id: exam.id, title: exam.title },
    model: results.length ? { email: results[0].email, sessionCode: results[0].session_code,
      status: results[0].status, audioFingerprint: results[0].audio_fingerprint, sealedAt: results[0].sealed_at } : null });
}

// ---- app-facing reads -----------------------------------------------------------------

async function getPage(env, url) {
  const exam = await loadExam(env, url.searchParams.get("exam"));
  if (!exam) throw new HttpError(404, "Unknown assignment.");
  const page = await env.DB.prepare("SELECT * FROM k_pages WHERE exam_id = ?").bind(exam.id).first();
  if (!page) throw new HttpError(404, "The page for this assignment has not been set yet.");
  const key = await loadKey(env, exam.id);
  return json({ exam: { id: exam.id, title: exam.title }, pageHtml: page.page_html, photos: page.photos,
    open: !!key && examStatus(exam) === "open", keyApproved: !!key,
    opensAt: exam.opens_at, closesAt: exam.closes_at });
}

async function getRole(req, env, url) {
  const s = await studentSession(req, env);
  if (!s) throw new HttpError(403, "Not signed in.");
  const examId = url.searchParams.get("exam");
  if (examId && s.exam_id !== examId) throw new HttpError(403, "This sign-in is for a different assignment.");
  const role = await rosterRole(env, s.exam_id, s.email);
  if (!role) throw new HttpError(403, "This email is not on the roster for this assignment.");
  return json({ role, email: s.email });
}

// ---- grading-side reads (sealed session code) -----------------------------------------

async function getKeySession(env, url) {
  const sub = await submissionByCode(env, url.searchParams.get("session"));
  if (!sub) throw new HttpError(404, "Unknown session code.");
  const sealed = !!sub.audio_fingerprint;
  if (!sealed) throw new HttpError(409, "This take is not sealed yet.");
  const key = await loadKey(env, sub.exam_id);
  if (!key) throw new HttpError(404, "No approved answer key for this assignment.");
  const role = await rosterRole(env, sub.exam_id, sub.email);
  return json({ exam: { id: sub.exam_id }, student: { email: sub.email, name: sub.name }, role: role || "student",
    key: key.key, totalPoints: key.total_points, approvedAt: key.approved_at });
}

function scoreOf(gradesJson, rubric) {
  if (!gradesJson) return null;
  let g; try { g = JSON.parse(gradesJson); } catch { return null; }
  let score = 0, any = false;
  for (const el of rubric) {
    const f = Number(g[el.name]);
    if (Number.isFinite(f)) { score += Math.min(1, Math.max(0, f)) * (Number(el.points) || 0); any = true; }
  }
  return any ? Math.round(score * 100) / 100 : null;
}

async function getStanding(env, url) {
  const sub = await submissionByCode(env, url.searchParams.get("session"));
  if (!sub) throw new HttpError(404, "Unknown session code.");
  const role = await rosterRole(env, sub.exam_id, sub.email);
  if (role === "model") return json({ attempts: [], standing: null, max: null, role });
  const exam = await loadExam(env, sub.exam_id);
  const rubric = rubricOf(exam);
  const max = rubric.reduce((s, el) => s + (Number(el.points) || 0), 0);
  const { results } = await env.DB.prepare(
    "SELECT session_code, grades_json, status, created_at FROM t_attempts WHERE exam_id = ? AND email = ? ORDER BY created_at")
    .bind(sub.exam_id, sub.email).all();
  const attempts = results.map((a) => ({ session: a.session_code, at: a.created_at, status: a.status,
    score: scoreOf(a.grades_json, rubric) }));
  const scored = attempts.map((a) => a.score).filter((s) => s !== null);
  return json({ exam: { id: sub.exam_id, title: exam.title }, attempts,
    standing: scored.length ? Math.max(...scored) : null, max });
}

// ---- dispatcher ------------------------------------------------------------------------

export async function handleKeypoints(req, env, ctx, url) {
  const p = url.pathname, m = req.method;
  const H = corsK(req, env);
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: H });
  try {
    let res = null;
    if (m === "POST" && p === "/k/page") res = await postPage(req, env);
    else if (m === "POST" && p === "/k/key") res = await postKey(req, env);
    else if (m === "POST" && p === "/k/model-roster") res = await postModelRoster(req, env);
    else if (m === "GET" && p === "/k/model") res = await getModel(req, env, url);
    else if (m === "GET" && p === "/k/page") res = await getPage(env, url);
    else if (m === "GET" && p === "/k/role") res = await getRole(req, env, url);
    else if (m === "GET" && p === "/k/key-session") res = await getKeySession(env, url);
    else if (m === "GET" && p === "/k/standing") res = await getStanding(env, url);
    if (!res) return json({ error: "Not found." }, 404, H);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(H)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, H);
    throw e;
  }
}
