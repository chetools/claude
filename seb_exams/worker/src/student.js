// Student API (public, CORS for ALLOWED_ORIGINS): /s/info, /s/seb/<id>.seb, /s/start, /s/submit.
// Never returns answers.
import { gradeSubmission, publicExam } from "../public/shared/validate.js";
import { json, readJson, examStatus, receipt, HttpError } from "./util.js";
import { checkSeb, sebFileUrl, sebLink, sebPlist } from "./seb.js";

const GRACE_MS = 2 * 60e3;
const MAX_ANSWERS_BYTES = 1_500_000;

export function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "600", "Vary": "Origin" }
    : { "Vary": "Origin" };
}

const loadExam = (env, id) => typeof id === "string" && id.length < 64
  ? env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first() : Promise.resolve(null);

const trimId = (s) => String(s ?? "").trim().toUpperCase().slice(0, 64);

// Keeps only well-formed answers for the exam's questions.
function cleanAnswers(exam, answers) {
  const a = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  const out = {};
  for (const q of exam.questions) {
    const v = a[q.id];
    if (q.type === "mc" && typeof v === "string") out[q.id] = v.slice(0, 20);
    else if (q.type === "open" && typeof v === "string") out[q.id] = v.slice(0, 20000);
    else if (q.type === "fill" && Array.isArray(v)) out[q.id] = v.slice(0, q.blanks.length).map((s) => String(s ?? "").slice(0, 200));
  }
  return out;
}

async function handleStudent(req, env, url, H) {
  const p = url.pathname;
  const mseb = p.match(/^\/s\/seb\/([a-z0-9-]{1,40})\.seb$/);
  if (req.method === "GET" && (mseb || p === "/exam.seb")) {
    const id = mseb ? mseb[1] : url.searchParams.get("id");
    const row = await loadExam(env, id);
    if (!row) throw new HttpError(404, "Unknown exam.");
    return new Response(sebPlist(row), { headers: { ...H, "Content-Type": "application/seb",
      "Content-Disposition": `attachment; filename="${row.id}.seb"`, "Cache-Control": "no-store" } });
  }
  if (req.method === "GET" && p === "/s/info") {
    const e = await loadExam(env, url.searchParams.get("id"));
    if (!e) throw new HttpError(404, "Unknown exam.");
    const c = JSON.parse(e.content_json);
    return json({ title: e.title, require_seb: !!e.require_seb, duration_minutes: c.duration_minutes,
      opens_at: e.opens_at, closes_at: e.closes_at, status: examStatus(e),
      seb_link: sebLink(env, e.id), seb_file_url: sebFileUrl(env, e.id) }, 200, H);
  }
  if (req.method === "POST" && (p === "/s/start" || p === "/s/submit")) {
    const body = await readJson(req, 1024 * 1024 * 2);
    const e = await loadExam(env, body.exam_id);
    if (!e) throw new HttpError(404, "Unknown exam.");
    const seb = await checkSeb(env, e, body.seb, req);
    if (!seb.ok) throw new HttpError(403, seb.error);
    const sid = trimId(body.student_id);
    if (!sid) throw new HttpError(400, "Student ID is required.");
    const exam = JSON.parse(e.content_json);
    const now = Date.now();
    const done = await env.DB.prepare("SELECT id FROM submissions WHERE exam_id = ? AND student_id = ?").bind(e.id, sid).first();
    if (done) throw new HttpError(409, `Student ID ${sid} has already submitted this exam. Only one submission is allowed.`);
    let at = await env.DB.prepare("SELECT * FROM attempts WHERE exam_id = ? AND student_id = ?").bind(e.id, sid).first();
    const endsOf = (a) => {
      const end = Date.parse(a.started_at) + exam.duration_minutes * 60e3;
      return new Date(e.closes_at ? Math.min(end, Date.parse(e.closes_at)) : end);
    };

    if (p === "/s/start") {
      const name = String(body.name ?? "").trim().slice(0, 200);
      if (!name) throw new HttpError(400, "Name is required.");
      if (!at) {
        // a new attempt needs an open exam; a restart may continue until the student's own time (plus grace) is over
        if (examStatus(e, now) !== "open") throw new HttpError(423, "This exam is not open.");
        const started = new Date(now).toISOString();
        await env.DB.prepare("INSERT OR IGNORE INTO attempts (exam_id, student_id, name, started_at) VALUES (?, ?, ?, ?)")
          .bind(e.id, sid, name, started).run();
        at = await env.DB.prepare("SELECT * FROM attempts WHERE exam_id = ? AND student_id = ?").bind(e.id, sid).first();
      } else if (now > endsOf(at).getTime() + GRACE_MS) {
        throw new HttpError(423, "Your time for this exam is over.");
      }
      const { results } = await env.DB.prepare("SELECT name, data_b64, mime FROM images WHERE exam_id = ?").bind(e.id).all();
      const images = {};
      for (const r of results) images[r.name] = `data:${r.mime};base64,${r.data_b64}`;
      return json({ exam: publicExam(exam, images, e.id), started_at: at.started_at,
        ends_at: endsOf(at).toISOString(), server_now: new Date(now).toISOString() }, 200, H);
    }

    if (!at) throw new HttpError(403, "This exam was not started. Start it first.");
    const answers = cleanAnswers(exam, body.answers);
    const answersJson = JSON.stringify(answers);
    if (answersJson.length > MAX_ANSWERS_BYTES) throw new HttpError(413, "The answers are too large.");
    const g = gradeSubmission(exam, answers);
    const ends = endsOf(at).getTime();
    const late = now > ends + GRACE_MS ? 1 : 0;
    const rc = receipt();
    try {
      await env.DB.prepare(
        `INSERT INTO submissions (exam_id, student_id, name, answers_json, detail_json, auto_score, auto_max,
           receipt, started_at, submitted_at, late, seb_check, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(e.id, sid, at.name, answersJson, JSON.stringify(g.detail), g.score, g.max, rc, at.started_at,
          new Date(now).toISOString(), late, seb.how, (req.headers.get("User-Agent") || "").slice(0, 300)).run();
    } catch (err) {
      if (String(err).includes("UNIQUE")) throw new HttpError(409, `Student ID ${sid} has already submitted this exam. Only one submission is allowed.`);
      throw err;
    }
    return json({ ok: true, receipt: rc }, 200, H);
  }
  throw new HttpError(404, "Not found.");
}

export async function handleS(req, env, url) {
  const H = cors(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });
  try {
    return await handleStudent(req, env, url, H);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, H);
    console.error(e);
    return json({ error: "Server error." }, 500, H);
  }
}
