// Teacher sign-in by emailed link: /auth/request, /auth/verify (GET page + POST), /auth/logout.
// Tokens and sessions are stored only as SHA-256 hashes.
import { sha256hex, randomToken, json, readJson, readText, normEmail, isEmail, esc, parseCookies } from "./util.js";

const TOKEN_MIN = 15;
const SESSION_DAYS = 7;
const RATE_PER_HOUR = 5;
const OK_MESSAGE = "If this address belongs to a teacher, a sign-in link has been sent. It is valid for 15 minutes.";

const isoIn = (ms) => new Date(Date.now() + ms).toISOString();

const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function page(title, bodyHtml, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6f8;color:#1b2430;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{box-sizing:border-box;width:100%;max-width:26rem;margin:1rem;padding:1.5rem;background:#fff;border:1px solid #d5dbe1;border-radius:10px}
h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:.5rem 0 1rem}
button,a.btn{display:inline-block;box-sizing:border-box;width:100%;padding:.7rem 1rem;border:0;border-radius:8px;background:#1f5fbf;color:#fff;font:inherit;font-weight:600;text-align:center;text-decoration:none;cursor:pointer}
@media(prefers-color-scheme:dark){body{background:#12171d;color:#e6ebf0}main{background:#1b232c;border-color:#34404c}}
</style></head><body><main>${bodyHtml}</main></body></html>`;
  return new Response(html, { status, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": PAGE_CSP, "X-Content-Type-Options": "nosniff" } });
}

function cookie(env, value, maxAge) {
  // Secure is dropped only in local dev, where the page is served over plain http.
  return `sid=${value}; HttpOnly;${env.DEV === "1" ? "" : " Secure;"} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function sendMail(env, to, subject, html, text) {
  if (env.DEV === "1") {
    await env.DB.prepare("INSERT INTO outbox (to_email, subject, body, at) VALUES (?, ?, ?, ?)")
      .bind(to, subject, text, new Date().toISOString()).run();
    return;
  }
  try {
    const res = await fetch(env.MAIL_URL, {
      method: "POST", redirect: "follow", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.MAIL_SECRET, to, subject, html, text }),
    });
    const body = await res.text();
    let ok = res.ok;
    try { if (JSON.parse(body).ok === false) ok = false; } catch { /* not JSON: judged by status */ }
    if (!ok) console.error("mail failed", res.status, body.slice(0, 300));
  } catch (e) {
    console.error("mail failed", String(e));
  }
}

async function requestLink(req, env, ctx) {
  const body = await readJson(req, 4096);
  const email = normEmail(body.email);
  const now = new Date().toISOString();
  // housekeeping
  await env.DB.batch([
    env.DB.prepare("DELETE FROM login_tokens WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM login_requests WHERE at < ?").bind(isoIn(-24 * 3600e3)),
    // first run: the admin from the ADMIN_EMAIL secret becomes the first teacher
    ...(env.ADMIN_EMAIL && isEmail(normEmail(env.ADMIN_EMAIL)) ? [env.DB.prepare(
      "INSERT INTO teachers (email, name, is_admin, created_at, active) SELECT ?, '', 1, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM teachers)")
      .bind(normEmail(env.ADMIN_EMAIL), now)] : []),
  ]);
  if (isEmail(email)) {
    const t = await env.DB.prepare("SELECT email FROM teachers WHERE email = ? AND active = 1").bind(email).first();
    if (t) {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_requests WHERE email = ? AND at > ?")
        .bind(email, isoIn(-3600e3)).first();
      if (n.n < RATE_PER_HOUR) {
        const token = randomToken(32);
        await env.DB.batch([
          env.DB.prepare("INSERT INTO login_requests (email, at) VALUES (?, ?)").bind(email, now),
          env.DB.prepare("INSERT INTO login_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)")
            .bind(await sha256hex(token), email, isoIn(TOKEN_MIN * 60e3)),
        ]);
        const link = `${env.APP_ORIGIN}/auth/verify?token=${token}`;
        const text = `Open this link to sign in to SEB Exams (valid for ${TOKEN_MIN} minutes, works once):\n\n${link}\n\nIf you did not ask for this, ignore this email.`;
        const html = `<p>Open this link to sign in to SEB Exams. It is valid for ${TOKEN_MIN} minutes and works once.</p><p><a href="${esc(link)}">Sign in to SEB Exams</a></p><p style="color:#666">If you did not ask for this, ignore this email.</p>`;
        const job = sendMail(env, email, "Sign in to SEB Exams", html, text);
        // production: send in the background so the response time does not reveal whether the address is a teacher
        if (env.DEV === "1") await job; else ctx.waitUntil(job);
      }
    }
  }
  return json({ ok: true, message: OK_MESSAGE });
}

const errorPage = (msg) => page("Sign-in problem",
  `<h1>Sign-in link not valid</h1><p>${esc(msg)}</p><a class="btn" href="/">Back to sign-in</a>`, 400);

async function verifyPage(url) {
  const token = url.searchParams.get("token") || "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return errorPage("This link is incomplete. Request a new one.");
  return page("Sign in to SEB Exams", `<h1>Sign in to SEB Exams</h1><p>Press the button to finish signing in on this device.</p>
<form method="post" action="/auth/verify"><input type="hidden" name="token" value="${esc(token)}"><button type="submit">Sign in</button></form>`);
}

async function verifyPost(req, env) {
  const form = new URLSearchParams(await readText(req, 4096));
  const token = form.get("token") || "";
  const hash = await sha256hex(token);
  const now = new Date().toISOString();
  // single use: only one request can flip used_at from NULL
  const r = await env.DB.prepare(
    "UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").bind(now, hash, now).run();
  if (r.meta.changes !== 1) return errorPage("This link has expired or was already used. Request a new one.");
  const row = await env.DB.prepare("SELECT email FROM login_tokens WHERE token_hash = ?").bind(hash).first();
  const t = await env.DB.prepare("SELECT email FROM teachers WHERE email = ? AND active = 1").bind(row.email).first();
  if (!t) return errorPage("This account is not active.");
  const sid = randomToken(32);
  await env.DB.prepare("INSERT INTO sessions (session_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256hex(sid), t.email, isoIn(SESSION_DAYS * 86400e3), now).run();
  return new Response(null, { status: 303, headers: { "Location": "/", "Set-Cookie": cookie(env, sid, SESSION_DAYS * 86400), "Cache-Control": "no-store" } });
}

async function logout(req, env) {
  const sid = parseCookies(req).sid;
  if (sid) await env.DB.prepare("DELETE FROM sessions WHERE session_hash = ?").bind(await sha256hex(sid)).run();
  const headers = { "Set-Cookie": cookie(env, "", 0), "Cache-Control": "no-store" };
  if ((req.headers.get("Accept") || "").includes("text/html")) return new Response(null, { status: 303, headers: { ...headers, Location: "/" } });
  return json({ ok: true }, 200, headers);
}

// The signed-in, active teacher of this request (row of `teachers`), or null.
export async function currentTeacher(req, env) {
  const sid = parseCookies(req).sid;
  if (!sid || sid.length > 100) return null;
  return env.DB.prepare(
    `SELECT t.email, t.name, t.is_admin FROM sessions s JOIN teachers t ON t.email = s.email
     WHERE s.session_hash = ? AND s.expires_at > ? AND t.active = 1`).bind(await sha256hex(sid), new Date().toISOString()).first();
}

export async function handleAuth(req, env, ctx, url) {
  const p = url.pathname, m = req.method;
  try {
    if (p === "/auth/request" && m === "POST") return await requestLink(req, env, ctx);
    if (p === "/auth/verify" && m === "GET") return await verifyPage(url);
    if (p === "/auth/verify" && m === "POST") return await verifyPost(req, env);
    if (p === "/auth/logout" && m === "POST") return await logout(req, env);
  } catch (e) {
    if (e.status === 413 || e.status === 400) return json({ error: e.message }, e.status);
    throw e;
  }
  return json({ error: "Not found." }, 404);
}
