// Shared ranking of free OpenRouter vision models for the image-to-text page.
// Browsers report each model's raw answer to the built-in test card; the score is computed here, with the page's
// own scoring code, so a client cannot simply post a number. GET /ranking aggregates the last 7 days.
import markdownit from "markdown-it";
import convert from "../../web/convert.js";
import spec from "../../web/probe.json";

const WINDOW_MS = 7 * 24 * 3600 * 1000;
const PER_IP_MODEL_MS = 3600 * 1000; // one report per visitor per model per hour
const ORIGINS = [/^https:\/\/chetools\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];

function cors(req) {
  const o = req.headers.get("origin") || "";
  return ORIGINS.some((r) => r.test(o))
    ? { "access-control-allow-origin": o, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" }
    : {};
}

const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors(req) } });

async function ipHash(req) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("itt:" + ip));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function report(req, env) {
  let b;
  try { b = await req.json(); } catch (e) { return json(req, { error: "bad json" }, 400); }
  const model = String(b.model || "");
  if (!/^[\w.-]+\/[\w.:-]+$/.test(model) || model.length > 120) return json(req, { error: "bad model id" }, 400);
  let score = null;
  if (b.text !== undefined && b.text !== null) {
    const text = String(b.text);
    if (text.length > 20000) return json(req, { error: "text too long" }, 400);
    score = Math.round(convert.scoreTranscription(markdownit, text, spec).total * 10) / 10;
  }
  const now = Date.now(), ip = await ipHash(req);
  const dup = await env.DB.prepare("SELECT 1 FROM results WHERE model = ? AND ip_hash = ? AND ts > ? LIMIT 1")
    .bind(model, ip, now - PER_IP_MODEL_MS).first();
  if (dup) return json(req, { stored: false, score, reason: "already reported this hour" });
  await env.DB.prepare("INSERT INTO results (model, score, ts, ip_hash) VALUES (?, ?, ?, ?)").bind(model, score, now, ip).run();
  return json(req, { stored: true, score });
}

async function ranking(req, env) {
  const since = Date.now() - WINDOW_MS;
  const { results } = await env.DB.prepare("SELECT model, score, ts FROM results WHERE ts > ? ORDER BY model, ts").bind(since).all();
  const by = {};
  for (const r of results) (by[r.model] ||= []).push(r);
  const models = Object.entries(by).map(([model, rows]) => {
    const ok = rows.filter((r) => r.score !== null).map((r) => r.score).sort((a, b) => a - b);
    // Median, so a few odd reports cannot move a model far.
    const median = ok.length ? (ok.length % 2 ? ok[(ok.length - 1) / 2] : (ok[ok.length / 2 - 1] + ok[ok.length / 2]) / 2) : null;
    return { model, median, tests: ok.length, refused: rows.length - ok.length, last: rows[rows.length - 1].ts };
  });
  models.sort((a, b) => (b.median ?? -1) - (a.median ?? -1) || b.tests - a.tests);
  return new Response(JSON.stringify({ since, models }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60", ...cors(req) },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (url.pathname === "/ranking" && req.method === "GET") return ranking(req, env);
    if (url.pathname === "/report" && req.method === "POST") return report(req, env);
    return json(req, { error: "not found" }, 404);
  },
};
