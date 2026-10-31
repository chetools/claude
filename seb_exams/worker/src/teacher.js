// Teacher API (/api/*): needs the session cookie and the X-Requested-With header; same-origin only (no CORS).
import yaml from "js-yaml";
import { validateExam, gradeSubmission, sanitizeSvgCheck } from "../public/shared/validate.js";
import { currentTeacher } from "./auth.js";
import { configKey, studentUrl, sebLink } from "./seb.js";
import { json, readJson, sha256hex, newExamId, HttpError, base64Info, normEmail, isEmail, examStatus } from "./util.js";

const MB = 1024 * 1024;
const MAX_IMAGE = MB;                 // decoded bytes per image
const MAX_CONTENT = 1_500_000;        // D1 allows about 2 MB per value
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const MIME = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

const bad = (msg) => new HttpError(400, msg);
const isAdmin = (t) => !!t.is_admin;

// ---- access ------------------------------------------------------------------------------------
async function examFor(env, t, id, { ownerOnly = false } = {}) {
  const e = await env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
  if (!e) throw new HttpError(404, "Unknown exam.");
  let ok = isAdmin(t) || e.owner_email === t.email;
  if (!ok && !ownerOnly) ok = !!(await env.DB.prepare("SELECT 1 AS x FROM exam_teachers WHERE exam_id = ? AND email = ?").bind(id, t.email).first());
  if (!ok) throw new HttpError(403, "You do not have access to this exam.");
  return e;
}

// ---- images ------------------------------------------------------------------------------------
// Returns {mime, size, b64} or throws an Error with a plain-English message.
function checkImage(name, b64) {
  const ext = name.split(".").pop().toLowerCase();
  const mime = MIME[ext];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) || !mime) throw new Error(`Image "${name}": use a plain file name ending in svg, png, jpg, jpeg or webp.`);
  const info = typeof b64 === "string" ? base64Info(b64) : null;
  if (!info) throw new Error(`Image "${name}": the data is not valid base64.`);
  if (info.size > MAX_IMAGE) throw new Error(`Image "${name}" is ${(info.size / MB).toFixed(2)} MB; the limit is 1 MB.`);
  const bytes = Uint8Array.from(atob(info.clean), (c) => c.charCodeAt(0));
  const head = (s, off = 0) => [...s].every((ch, i) => bytes[off + i] === ch.charCodeAt(0));
  if (mime === "image/svg+xml") {
    const msg = sanitizeSvgCheck(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
    if (msg) throw new Error(`Image "${name}": ${msg}`);
  } else if (mime === "image/png" ? !head("\x89PNG") : mime === "image/jpeg" ? !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    : !(head("RIFF") && head("WEBP", 8))) {
    throw new Error(`Image "${name}": the content is not a real ${ext.toUpperCase()} file.`);
  }
  return { mime, size: info.size, b64: info.clean };
}

const insertImage = (env, examId, name, im) => env.DB.prepare(
  "INSERT OR REPLACE INTO images (exam_id, name, mime, data_b64, size) VALUES (?, ?, ?, ?, ?)").bind(examId, name, im.mime, im.b64, im.size);

// ---- grading -----------------------------------------------------------------------------------
const sumOpen = (exam) => exam.questions.filter((q) => q.type === "open").reduce((s, q) => s + q.points, 0);

// Statements that recompute every submission of the exam from its stored answers; manual grades are kept
// for questions that still exist and are still open (points capped at the question's points).
async function regradeStatements(env, examId, exam, now) {
  const { results } = await env.DB.prepare("SELECT id, answers_json, manual_json FROM submissions WHERE exam_id = ?").bind(examId).all();
  const open = new Map(exam.questions.filter((q) => q.type === "open").map((q) => [q.id, q.points]));
  const st = [env.DB.prepare("UPDATE exams SET regraded_at = ? WHERE id = ?").bind(now, examId)];
  for (const s of results) {
    const g = gradeSubmission(exam, JSON.parse(s.answers_json));
    const manual = {};
    for (const [qid, m] of Object.entries(JSON.parse(s.manual_json || "{}"))) {
      if (!open.has(qid)) continue;
      manual[qid] = { points: typeof m.points === "number" ? Math.min(m.points, open.get(qid)) : null, comment: m.comment || "" };
    }
    st.push(env.DB.prepare("UPDATE submissions SET detail_json = ?, auto_score = ?, auto_max = ?, manual_json = ? WHERE id = ?")
      .bind(JSON.stringify(g.detail), g.score, g.max, JSON.stringify(manual), s.id));
  }
  return st;
}

// Replacing an exam's questions is refused while students can be taking it.
const OPEN_REPLACE_MSG = "This exam is open; close it before replacing its questions.";
const refuseIfOpen = (e) => (examStatus(e) === "open" ? json({ error: OPEN_REPLACE_MSG }, 423) : null);

// What a replace would change, matched by question id. changed = any normalized field differs; key_changed = the
// grading key differs (type, points, correct option position, blank answers/variants).
const keyOf = (q) => JSON.stringify([q.type, q.points,
  q.type === "mc" ? q.options.findIndex((o) => o.correct) : null,
  q.type === "fill" ? q.blanks.map((b) => [b.answer, b.variants || []]) : null]);

async function replaceSummary(env, e, oldExam, newExam) {
  const old = new Map(oldExam.questions.map((q) => [q.id, q]));
  const cur = new Map(newExam.questions.map((q) => [q.id, q]));
  const added = [], removed = [], changed = [], keyChanged = [];
  for (const [id, q] of cur) {
    const o = old.get(id);
    if (!o) { added.push(id); continue; }
    if (JSON.stringify(o) !== JSON.stringify(q)) changed.push(id);
    if (keyOf(o) !== keyOf(q)) keyChanged.push(id);
  }
  for (const id of old.keys()) if (!cur.has(id)) removed.push(id);
  const stillOpen = new Set(newExam.questions.filter((q) => q.type === "open").map((q) => q.id));
  const { results } = await env.DB.prepare("SELECT manual_json FROM submissions WHERE exam_id = ?").bind(e.id).all();
  let dropped = 0;
  for (const s of results) for (const qid of Object.keys(JSON.parse(s.manual_json || "{}"))) if (!stillOpen.has(qid)) dropped++;
  return { added, removed, changed, key_changed: keyChanged, regrade_count: results.length, manual_grades_dropped: dropped };
}

async function runBatch(env, stmts) {
  for (let i = 0; i < stmts.length; i += 90) await env.DB.batch(stmts.slice(i, i + 90));
}

// ---- exams -------------------------------------------------------------------------------------
async function listExams(env, t) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.title, e.owner_email, e.opens_at, e.closes_at, e.updated_at,
       (SELECT COUNT(*) FROM submissions s WHERE s.exam_id = e.id) AS submissions,
       COALESCE(json_array_length(e.content_json, '$.questions'), 0) AS questions
     FROM exams e WHERE ?1 = 1 OR e.owner_email = ?2
       OR EXISTS (SELECT 1 FROM exam_teachers x WHERE x.exam_id = e.id AND x.email = ?2)
     ORDER BY e.updated_at DESC`).bind(isAdmin(t) ? 1 : 0, t.email).all();
  return results.map((r) => ({ ...r, status: examStatus(r) }));
}

async function importExam(req, env, t) {
  const body = await readJson(req, 25 * MB);
  const imgs = body.images && typeof body.images === "object" && !Array.isArray(body.images) ? body.images : {};
  const names = Object.keys(imgs);
  const errors = [], warnings = [];
  let replace = null;
  const dry = body.dry_run === true;
  if (body.replace_id !== undefined && body.replace_id !== null) {
    replace = await examFor(env, t, String(body.replace_id));
    const locked = refuseIfOpen(replace);
    if (locked) return locked;
  }
  if (typeof body.yaml !== "string") throw bad("yaml must be the text of exam.yaml.");
  if (body.yaml.length > 2 * MB) throw bad("exam.yaml is larger than 2 MB.");
  let obj;
  try { obj = yaml.load(body.yaml, { schema: yaml.CORE_SCHEMA }); }
  catch (e) { errors.push(`exam.yaml is not valid YAML: ${String(e.message).split("\n").slice(0, 3).join(" ")}`); }
  const checked = {};
  for (const n of names) {
    try { checked[n] = checkImage(n, imgs[n]); } catch (e) { errors.push(e.message); }
  }
  let exam = null;
  if (!errors.length || obj !== undefined) {
    if (obj !== undefined) {
      const r = validateExam(obj, names);
      errors.push(...r.errors); warnings.push(...r.warnings); exam = r.exam;
    }
  }
  const content = exam ? JSON.stringify(exam) : "";
  if (exam && content.length > MAX_CONTENT) errors.push("The exam text is larger than 1.5 MB.");
  if (errors.length) return json({ errors, warnings }, 422);

  if (dry) {
    const summary = replace ? await replaceSummary(env, replace, JSON.parse(replace.content_json), exam) : null;
    return json({ ok: true, exam, warnings, summary });
  }
  const now = new Date().toISOString();
  const imageStmts = (id) => names.map((n) => insertImage(env, id, n, checked[n]));
  if (replace) {
    await env.DB.batch([
      env.DB.prepare("UPDATE exams SET title = ?, content_json = ?, updated_at = ? WHERE id = ?").bind(exam.title, content, now, replace.id),
      env.DB.prepare("DELETE FROM images WHERE exam_id = ?").bind(replace.id),
      ...imageStmts(replace.id),
    ]);
    await runBatch(env, await regradeStatements(env, replace.id, exam, now));
    return json({ id: replace.id, warnings });
  }
  let id;
  for (let i = 0; i < 5; i++) {
    id = newExamId(exam.title);
    if (!(await env.DB.prepare("SELECT 1 AS x FROM exams WHERE id = ?").bind(id).first())) break;
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO exams (id, owner_email, title, content_json, require_seb, extra_config_keys, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, '[]', ?, ?)`).bind(id, t.email, exam.title, content, now, now),
    ...imageStmts(id),
  ]);
  return json({ id, warnings });
}

async function getExam(env, e) {
  const [imgs, co, n] = await Promise.all([
    env.DB.prepare("SELECT name, mime, size FROM images WHERE exam_id = ? ORDER BY name").bind(e.id).all(),
    env.DB.prepare("SELECT email FROM exam_teachers WHERE exam_id = ? ORDER BY email").bind(e.id).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE exam_id = ?").bind(e.id).first(),
  ]);
  return {
    id: e.id, title: e.title, content: JSON.parse(e.content_json), images: imgs.results,
    owner_email: e.owner_email, teachers: co.results.map((r) => r.email),
    require_seb: !!e.require_seb, opens_at: e.opens_at, closes_at: e.closes_at,
    has_quit_password: !!e.quit_password_sha256, extra_config_keys: JSON.parse(e.extra_config_keys || "[]"),
    config_key: await configKey(e), seb_link: sebLink(env, e.id), student_url: studentUrl(e.id),
    submissions_count: n.n, regraded_at: e.regraded_at,
  };
}

function dumpExam(exam) {
  const clean = JSON.parse(JSON.stringify(exam));
  for (const q of clean.questions) if (q.blanks) for (const b of q.blanks) if (!b.variants.length) delete b.variants;
  return yaml.dump(clean, { lineWidth: -1, noRefs: true });
}

async function putContent(req, env, e) {
  const locked = refuseIfOpen(e);
  if (locked) return locked;
  const body = await readJson(req, MB * 1.5);
  const { results } = await env.DB.prepare("SELECT name FROM images WHERE exam_id = ?").bind(e.id).all();
  const r = validateExam(body.content, results.map((x) => x.name));
  if (r.errors.length) return json({ errors: r.errors, warnings: r.warnings }, 422);
  const content = JSON.stringify(r.exam);
  if (content.length > MAX_CONTENT) return json({ errors: ["The exam text is larger than 1.5 MB."], warnings: [] }, 422);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE exams SET title = ?, content_json = ?, updated_at = ? WHERE id = ?").bind(r.exam.title, content, now, e.id).run();
  await runBatch(env, await regradeStatements(env, e.id, r.exam, now));
  return json({ warnings: r.warnings });
}

function isoOrNull(v, field) {
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !ISO_RE.test(v) || isNaN(Date.parse(v))) throw bad(`${field} must be a date and time in ISO format, or null.`);
  return new Date(v).toISOString();
}

async function putSettings(req, env, e) {
  const b = await readJson(req);
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const opens = has("opens_at") ? isoOrNull(b.opens_at, "opens_at") : e.opens_at;
  const closes = has("closes_at") ? isoOrNull(b.closes_at, "closes_at") : e.closes_at;
  if (opens && closes && Date.parse(closes) <= Date.parse(opens)) throw bad("closes_at must be after opens_at.");
  if (closes && !opens) throw bad("Set opens_at as well as closes_at.");
  let req_seb = e.require_seb;
  if (has("require_seb")) {
    if (typeof b.require_seb !== "boolean" && b.require_seb !== 0 && b.require_seb !== 1) throw bad("require_seb must be true or false.");
    req_seb = b.require_seb ? 1 : 0;
  }
  let pw = e.quit_password_sha256;
  if (has("quit_password")) {
    if (b.quit_password === null || b.quit_password === "") pw = null;
    else if (typeof b.quit_password === "string" && b.quit_password.length <= 200) pw = await sha256hex(b.quit_password);
    else throw bad("quit_password must be text of at most 200 characters, or null.");
  }
  let keys = JSON.parse(e.extra_config_keys || "[]");
  if (has("extra_config_keys")) {
    if (!Array.isArray(b.extra_config_keys) || b.extra_config_keys.length > 20 ||
        !b.extra_config_keys.every((k) => typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k.trim()))) {
      throw bad("extra_config_keys must be a list of at most 20 Config Keys, each 64 hexadecimal characters.");
    }
    keys = [...new Set(b.extra_config_keys.map((k) => k.trim().toLowerCase()))];
  }
  await env.DB.prepare(`UPDATE exams SET require_seb = ?, opens_at = ?, closes_at = ?, quit_password_sha256 = ?,
    extra_config_keys = ?, updated_at = ? WHERE id = ?`).bind(req_seb, opens, closes, pw, JSON.stringify(keys), new Date().toISOString(), e.id).run();
  return json({ ok: true });
}

async function openNow(env, e) {
  const now = Date.now();
  const dur = JSON.parse(e.content_json).duration_minutes;
  const min = now + (dur + 15) * 60e3;
  const closes = e.closes_at && Date.parse(e.closes_at) > min ? e.closes_at : new Date(min).toISOString();
  const opens = new Date(now).toISOString();
  await env.DB.prepare("UPDATE exams SET opens_at = ?, closes_at = ?, updated_at = ? WHERE id = ?").bind(opens, closes, opens, e.id).run();
  return json({ opens_at: opens, closes_at: closes });
}

async function closeNow(env, e) {
  const now = new Date().toISOString();
  const opens = e.opens_at && Date.parse(e.opens_at) <= Date.parse(now) ? e.opens_at : now;
  await env.DB.prepare("UPDATE exams SET opens_at = ?, closes_at = ?, updated_at = ? WHERE id = ?").bind(opens, now, now, e.id).run();
  return json({ opens_at: opens, closes_at: now });
}

async function postImage(req, env, e) {
  const b = await readJson(req, 1.5 * MB);
  if (typeof b.name !== "string") throw bad("name is required.");
  let im;
  try { im = checkImage(b.name, b.base64); } catch (err) { return json({ errors: [err.message] }, 422); }
  const have = await env.DB.prepare("SELECT name FROM images WHERE exam_id = ?").bind(e.id).all();
  if (have.results.length >= 20 && !have.results.some((r) => r.name === b.name)) return json({ errors: ["An exam can have at most 20 images."] }, 422);
  await insertImage(env, e.id, b.name, im).run();
  return json({ name: b.name });
}

async function deleteImage(env, e, name) {
  const exam = JSON.parse(e.content_json);
  const i = exam.questions.findIndex((q) => q.image === name);
  if (i >= 0) throw new HttpError(409, `Image "${name}" is used by question ${i + 1}. Remove it from the question first.`);
  await env.DB.prepare("DELETE FROM images WHERE exam_id = ? AND name = ?").bind(e.id, name).run();
  return json({ ok: true });
}

async function deleteExam(env, e) {
  await env.DB.batch(["images", "exam_teachers", "attempts", "submissions"].map((tb) => env.DB.prepare(`DELETE FROM ${tb} WHERE exam_id = ?`).bind(e.id))
    .concat(env.DB.prepare("DELETE FROM exams WHERE id = ?").bind(e.id)));
  return json({ ok: true });
}

// ---- results -----------------------------------------------------------------------------------
function manualTotal(exam, manual) {
  const open = new Set(exam.questions.filter((q) => q.type === "open").map((q) => q.id));
  return Object.entries(manual).reduce((s, [k, m]) => s + (open.has(k) && typeof m.points === "number" ? m.points : 0), 0);
}

async function results(env, e) {
  const exam = JSON.parse(e.content_json);
  const { results: rows } = await env.DB.prepare("SELECT * FROM submissions WHERE exam_id = ? ORDER BY submitted_at, id").bind(e.id).all();
  const mmax = sumOpen(exam);
  return json({ questions: exam.questions, submissions: rows.map((s) => {
    const manual = JSON.parse(s.manual_json || "{}");
    return {
      id: s.id, name: s.name, student_id: s.student_id, started_at: s.started_at, submitted_at: s.submitted_at, late: !!s.late,
      minutes_used: s.started_at ? Math.round((Date.parse(s.submitted_at) - Date.parse(s.started_at)) / 6000) / 10 : null,
      answers: JSON.parse(s.answers_json), detail: JSON.parse(s.detail_json), auto_score: s.auto_score, auto_max: s.auto_max,
      manual, manual_max: mmax, total: s.auto_score + manualTotal(exam, manual), receipt: s.receipt, seb_check: s.seb_check,
    };
  }) });
}

async function submissionFor(env, t, id) {
  const s = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  if (!s) throw new HttpError(404, "Unknown submission.");
  const e = await examFor(env, t, s.exam_id);
  return { s, e };
}

async function putManual(req, env, t, id) {
  const { s, e } = await submissionFor(env, t, id);
  const b = await readJson(req);
  const exam = JSON.parse(e.content_json);
  const q = exam.questions.find((x) => x.id === b.qid);
  if (!q || q.type !== "open") throw bad("qid must be an open question of this exam.");
  const comment = b.comment === undefined || b.comment === null ? "" : b.comment;
  if (typeof comment !== "string" || comment.length > 5000) throw bad("comment must be text of at most 5000 characters.");
  const points = b.points === undefined ? null : b.points;
  if (points !== null && (typeof points !== "number" || !Number.isFinite(points) || points < 0 || points > q.points || points * 2 !== Math.round(points * 2))) {
    throw new HttpError(422, `points must be null or a multiple of 0.5 from 0 to ${q.points}.`);
  }
  const manual = JSON.parse(s.manual_json || "{}");
  if (points === null && !comment) delete manual[q.id]; else manual[q.id] = { points, comment };
  await env.DB.prepare("UPDATE submissions SET manual_json = ? WHERE id = ?").bind(JSON.stringify(manual), s.id).run();
  return json({ manual, manual_max: sumOpen(exam), total: s.auto_score + manualTotal(exam, manual) });
}

async function deleteSubmission(env, t, id) {
  const { s } = await submissionFor(env, t, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(s.id),
    env.DB.prepare("DELETE FROM attempts WHERE exam_id = ? AND student_id = ?").bind(s.exam_id, s.student_id),
  ]);
  return json({ ok: true });
}

// ---- teachers ----------------------------------------------------------------------------------
async function adminCount(env) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM teachers WHERE is_admin = 1 AND active = 1").first()).n;
}
const teacherOut = (r) => ({ email: r.email, name: r.name, is_admin: !!r.is_admin, active: !!r.active, created_at: r.created_at });

async function teachersApi(req, env, t, method, email, body) {
  if (!isAdmin(t)) throw new HttpError(403, "Only an administrator can manage teachers.");
  if (!email) {
    if (method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM teachers ORDER BY email").all();
      return json(results.map(teacherOut));
    }
    const b = await body();
    const em = normEmail(b.email);
    if (!isEmail(em)) throw bad("Enter a valid email address.");
    if (await env.DB.prepare("SELECT 1 AS x FROM teachers WHERE email = ?").bind(em).first()) throw new HttpError(409, "This teacher already exists.");
    const name = String(b.name ?? "").trim().slice(0, 200);
    await env.DB.prepare("INSERT INTO teachers (email, name, is_admin, created_at, active) VALUES (?, ?, ?, ?, 1)")
      .bind(em, name, b.is_admin ? 1 : 0, new Date().toISOString()).run();
    return json(teacherOut(await env.DB.prepare("SELECT * FROM teachers WHERE email = ?").bind(em).first()));
  }
  const cur = await env.DB.prepare("SELECT * FROM teachers WHERE email = ?").bind(email).first();
  if (!cur) throw new HttpError(404, "Unknown teacher.");
  if (method === "PUT") {
    const b = await body();
    const name = b.name === undefined ? cur.name : String(b.name).trim().slice(0, 200);
    const adm = b.is_admin === undefined ? cur.is_admin : b.is_admin ? 1 : 0;
    const act = b.active === undefined ? cur.active : b.active ? 1 : 0;
    if (cur.is_admin && cur.active && (!adm || !act) && (await adminCount(env)) <= 1) throw new HttpError(409, "There must be at least one active administrator.");
    await env.DB.prepare("UPDATE teachers SET name = ?, is_admin = ?, active = ? WHERE email = ?").bind(name, adm, act, email).run();
    if (!act) await env.DB.prepare("DELETE FROM sessions WHERE email = ?").bind(email).run();
    return json(teacherOut(await env.DB.prepare("SELECT * FROM teachers WHERE email = ?").bind(email).first()));
  }
  if (method === "DELETE") {
    if (email === t.email) throw new HttpError(409, "You cannot remove yourself.");
    if (cur.is_admin && cur.active && (await adminCount(env)) <= 1) throw new HttpError(409, "You cannot remove the last administrator.");
    await env.DB.batch([
      env.DB.prepare("UPDATE exams SET owner_email = ? WHERE owner_email = ?").bind(t.email, email),
      env.DB.prepare("DELETE FROM exam_teachers WHERE email = ?").bind(email),
      env.DB.prepare("DELETE FROM sessions WHERE email = ?").bind(email),
      env.DB.prepare("DELETE FROM login_tokens WHERE email = ?").bind(email),
      env.DB.prepare("DELETE FROM teachers WHERE email = ?").bind(email),
    ]);
    return json({ ok: true });
  }
  throw new HttpError(405, "Method not allowed.");
}

async function coTeachers(req, env, e, method, email) {
  if (method === "POST") {
    const em = normEmail((await readJson(req)).email);
    const t = await env.DB.prepare("SELECT email FROM teachers WHERE email = ? AND active = 1").bind(em).first();
    if (!t) throw new HttpError(404, "No teacher with this email address. An administrator must add them first.");
    if (em !== e.owner_email) await env.DB.prepare("INSERT OR IGNORE INTO exam_teachers (exam_id, email) VALUES (?, ?)").bind(e.id, em).run();
    return json({ ok: true });
  }
  await env.DB.prepare("DELETE FROM exam_teachers WHERE exam_id = ? AND email = ?").bind(e.id, normEmail(email)).run();
  return json({ ok: true });
}

// ---- router ------------------------------------------------------------------------------------
export async function handleApi(req, env, url) {
  const m = req.method;
  const seg = url.pathname.split("/").slice(2).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  try {
    const t = await currentTeacher(req, env);
    if (!t) return json({ error: "Not signed in." }, 401);
    // images are loaded by <img> tags, which cannot send the header; they are read-only
    const isImageGet = m === "GET" && seg[0] === "exams" && seg[2] === "images" && seg.length === 4;
    if (!isImageGet && req.headers.get("X-Requested-With") !== "seb-exams") return json({ error: "Missing X-Requested-With header." }, 403);
    const body = () => readJson(req);
    const [a, id, b, c] = seg;

    if (a === "me" && m === "GET" && seg.length === 1) return json({ email: t.email, name: t.name, is_admin: isAdmin(t) });
    if (a === "teachers" && seg.length <= 2) return await teachersApi(req, env, t, m, id && normEmail(id), body);
    if (a === "submissions" && id) {
      if (b === "manual" && m === "PUT" && seg.length === 3) return await putManual(req, env, t, Number(id));
      if (!b && m === "DELETE") return await deleteSubmission(env, t, Number(id));
    }
    if (a === "exams") {
      if (seg.length === 1 && m === "GET") return json(await listExams(env, t));
      if (id === "import" && m === "POST" && seg.length === 2) return await importExam(req, env, t);
      if (id) {
        const owner = (m === "DELETE" && !b) || b === "teachers";
        const e = await examFor(env, t, id, { ownerOnly: owner });
        if (!b && m === "GET") return json(await getExam(env, e));
        if (!b && m === "DELETE") return await deleteExam(env, e);
        if (b === "images" && !c && m === "POST") return await postImage(req, env, e);
        if (b === "images" && c && m === "GET") {
          const r = await env.DB.prepare("SELECT mime, data_b64 FROM images WHERE exam_id = ? AND name = ?").bind(e.id, c).first();
          if (!r) throw new HttpError(404, "Unknown image.");
          return new Response(Uint8Array.from(atob(r.data_b64), (ch) => ch.charCodeAt(0)), { headers: {
            "Content-Type": r.mime, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'" } });
        }
        if (b === "images" && c && m === "DELETE") return await deleteImage(env, e, c);
        if (b === "export" && m === "GET") {
          const { results } = await env.DB.prepare("SELECT name, data_b64 FROM images WHERE exam_id = ?").bind(e.id).all();
          return json({ yaml: dumpExam(JSON.parse(e.content_json)), images: Object.fromEntries(results.map((r) => [r.name, r.data_b64])) });
        }
        if (b === "content" && m === "PUT") return await putContent(req, env, e);
        if (b === "settings" && m === "PUT") return await putSettings(req, env, e);
        if (b === "open-now" && m === "POST") return await openNow(env, e);
        if (b === "close-now" && m === "POST") return await closeNow(env, e);
        if (b === "results" && m === "GET") return await results(env, e);
        if (b === "teachers" && ((m === "POST" && !c) || (m === "DELETE" && c))) return await coTeachers(req, env, e, m, c);
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    throw e;
  }
}
