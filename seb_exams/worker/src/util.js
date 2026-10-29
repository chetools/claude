// Small helpers shared by the Worker modules.

const enc = new TextEncoder();

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export async function sha256hex(s) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two strings (length differences are not secret here: both are hex hashes).
export function ctEqual(a, b) {
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export function randomToken(nBytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(nBytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Random string over `alphabet` without modulo bias.
export function randomString(n, alphabet) {
  const lim = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < n) {
    for (const v of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (v < lim && out.length < n) out += alphabet[v % alphabet.length];
    }
  }
  return out;
}

// e.g. "mt-7k2p9x": first two letters of the title, then six random characters.
export function newExamId(title) {
  const letters = String(title).normalize("NFD").toLowerCase().replace(/[^a-z]/g, "");
  return (letters.slice(0, 2).padEnd(2, "x")) + "-" + randomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
}

export function receipt() {
  const r = randomString(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  return r.slice(0, 4) + "-" + r.slice(4);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

// Reads a request body as text, refusing anything over `limit` bytes.
export async function readText(req, limit) {
  const len = Number(req.headers.get("Content-Length"));
  if (len > limit) throw new HttpError(413, "Request too large.");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > limit) throw new HttpError(413, "Request too large.");
  return new TextDecoder().decode(buf);
}

export async function readJson(req, limit = 1024 * 1024) {
  const t = await readText(req, limit);
  try {
    const v = JSON.parse(t);
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v;
  } catch { throw new HttpError(400, "Bad request: the body must be a JSON object."); }
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/;
export const normEmail = (s) => String(s ?? "").trim().toLowerCase();
export const isEmail = (s) => typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// draft = no opens_at; scheduled = before it; open = inside the window; closed = after closes_at.
export function examStatus(exam, nowMs = Date.now()) {
  if (!exam.opens_at) return "draft";
  if (nowMs < Date.parse(exam.opens_at)) return "scheduled";
  if (exam.closes_at && nowMs >= Date.parse(exam.closes_at)) return "closed";
  return "open";
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function base64Info(b64) {
  const s = String(b64).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) return null;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return { clean: s, size: Math.floor((s.length * 3) / 4) - pad };
}
