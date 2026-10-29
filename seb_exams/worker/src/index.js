// seb_exams API: receives exam submissions, checks the Safe Exam Browser Config Key, grades the
// multiple-choice and fill-in-the-blank questions against the key stored in D1, and serves results
// to the teacher (Bearer TEACHER_PASSWORD, a Worker secret).
//
//   POST /check    {exam_id, seb}                      -> {ok} | 403 {error}   (before the exam starts)
//   POST /submit   {exam_id, name, student_id, answers, seb, started_at}
//                                                      -> {ok, receipt} | 4xx {error}
//   GET  /results?exam=<id>   (teacher)                -> {exam, questions, submissions}
//   GET  /exams               (teacher)                -> [{id, title}]

const enc = new TextEncoder();

async function sha256hex(s) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cors(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin" }
    : {};
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

// Constant-time comparison of two strings via their hashes.
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([sha256hex(a || ""), sha256hex(b || "")]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0 && !!b;
}

// SEB check. The SEB JavaScript API exposes SafeExamBrowser.security.configKey = SHA256(page URL
// without fragment + Config Key); SEB versions that use HTTP headers send the same hash of the
// requested URL in X-SafeExamBrowser-ConfigKeyHash. Either one matching an accepted key passes.
async function checkSeb(exam, seb, req) {
  if (!exam.require_seb) return { ok: true, how: "not required" };
  const keys = JSON.parse(exam.config_keys || "[]");
  if (!keys.length) return { ok: false, error: "This exam has no SEB Config Key set up yet. Tell your teacher." };
  if (seb && typeof seb.ck === "string" && typeof seb.url === "string") {
    const url = seb.url.split("#")[0];
    if (url.startsWith(exam.page_url)) {
      for (const k of keys) if ((await sha256hex(url + k)) === seb.ck.toLowerCase()) return { ok: true, how: "js-api" };
    }
  }
  const hdr = req.headers.get("X-SafeExamBrowser-ConfigKeyHash");
  if (hdr) {
    const url = req.url.split("#")[0];
    for (const k of keys) if ((await sha256hex(url + k)) === hdr.toLowerCase()) return { ok: true, how: "header" };
  }
  return { ok: false, error: seb || hdr
    ? "Safe Exam Browser is running with a different configuration than this exam expects. Open the exam with the exam's own SEB link."
    : "This exam must be taken in Safe Exam Browser." };
}

const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function grade(key, answers) {
  const detail = {};
  let score = 0, max = 0, manual = 0;
  for (const q of key.questions) {
    const a = answers[q.id];
    if (q.type === "mc") {
      const ok = a === q.correct;
      detail[q.id] = { ok, points: ok ? q.points : 0 };
    } else if (q.type === "fill") {
      const ok = q.answers.map(norm).includes(norm(a));
      detail[q.id] = { ok, points: ok ? q.points : 0 };
    } else {
      manual += q.points;
      continue;
    }
    max += q.points;
    score += detail[q.id].points;
  }
  return { detail, score, max, manual };
}

function receipt() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((v) => abc[v % abc.length]).join("").replace(/^(.{4})/, "$1-");
}

async function loadExam(env, id) {
  if (typeof id !== "string" || !id) return null;
  return env.DB.prepare("SELECT * FROM exams WHERE id = ?").bind(id).first();
}

async function handle(req, env) {
  const url = new URL(req.url);
  const H = cors(req, env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: H });

  if (req.method === "POST" && (url.pathname === "/check" || url.pathname === "/submit")) {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400, H); }
    const exam = await loadExam(env, body.exam_id);
    if (!exam) return json({ error: "Unknown exam." }, 404, H);
    const seb = await checkSeb(exam, body.seb, req);
    if (!seb.ok) return json({ error: seb.error }, 403, H);
    if (url.pathname === "/check") return json({ ok: true }, 200, H);

    const name = String(body.name || "").trim().slice(0, 200);
    const sid = String(body.student_id || "").trim().toUpperCase().slice(0, 64);
    if (!name || !sid) return json({ error: "Name and student ID are required." }, 400, H);
    const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
    const key = JSON.parse(exam.key_json);
    const clean = {};
    for (const q of key.questions) clean[q.id] = String(answers[q.id] ?? "").slice(0, 20000);
    const g = grade(key, clean);
    const r = receipt();
    try {
      await env.DB.prepare(
        `INSERT INTO submissions (exam_id, student_id, name, answers_json, detail_json, auto_score, auto_max,
           manual_max, receipt, started_at, submitted_at, seb_check, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(exam.id, sid, name, JSON.stringify(clean), JSON.stringify(g.detail), g.score, g.max, g.manual, r,
             String(body.started_at || "").slice(0, 40) || null, new Date().toISOString(), seb.how,
             (req.headers.get("User-Agent") || "").slice(0, 300)).run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) {
        return json({ error: `Student ID ${sid} has already submitted this exam. Only one submission is allowed.` }, 409, H);
      }
      throw e;
    }
    return json({ ok: true, receipt: r }, 200, H);
  }

  if (req.method === "GET" && (url.pathname === "/results" || url.pathname === "/exams")) {
    const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await sameSecret(auth, env.TEACHER_PASSWORD))) return json({ error: "Wrong password." }, 401, H);
    if (url.pathname === "/exams") {
      const { results } = await env.DB.prepare("SELECT id, title FROM exams ORDER BY id").all();
      return json(results, 200, H);
    }
    const exam = await loadExam(env, url.searchParams.get("exam"));
    if (!exam) return json({ error: "Unknown exam." }, 404, H);
    const { results } = await env.DB.prepare(
      "SELECT * FROM submissions WHERE exam_id = ? ORDER BY submitted_at").bind(exam.id).all();
    const key = JSON.parse(exam.key_json);
    return json({ exam: { id: exam.id, title: exam.title }, questions: key.questions, submissions: results.map((s) => ({
      ...s, answers: JSON.parse(s.answers_json), detail: JSON.parse(s.detail_json), answers_json: undefined, detail_json: undefined,
    })) }, 200, H);
  }
  return json({ error: "Not found." }, 404, H);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return json({ error: "Server error." }, 500, cors(req, env)); }
  },
};
