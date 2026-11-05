// Test-only server for the teacher transcript pages: serves the real Worker
// API with a pre-made teacher session cookie injected, plus the public files.
// NOT part of the Worker. Usage: node tests/ui-serve.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { D1Shim } from "./d1-shim.mjs";
import worker from "../worker/src/index.js";

const port = Number(process.argv[2] || 8933);
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const sha = (s) => createHash("sha256").update(s).digest("hex");

const DB = new D1Shim();
DB.exec(await readFile(path.join(root, "worker/schema.sql"), "utf8"));
DB.exec(await readFile(path.join(root, "worker/schema-transcript.sql"), "utf8"));
const now = new Date().toISOString();
await DB.prepare("INSERT INTO teachers (email, name, is_admin, created_at, active) VALUES ('prof@example.edu', 'Prof', 1, ?, 1)").bind(now).run();
await DB.prepare("INSERT INTO sessions (session_hash, email, expires_at, created_at) VALUES (?, 'prof@example.edu', ?, ?)")
  .bind(sha("testsid"), new Date(Date.now() + 86400e3).toISOString(), now).run();
const RUBRIC = [
  { name: "Technical accuracy", points: 10, guidance: "Terms, signs and subscripts correct." },
  { name: "Technical completeness", points: 10, guidance: "Every equation explained in full." },
  { name: "Introduction", points: 5, guidance: "" }, { name: "Relevance", points: 5, guidance: "" },
  { name: "Summary", points: 5, guidance: "" }, { name: "Conclusion", points: 5, guidance: "" },
];
await DB.prepare(`INSERT INTO t_exams (id, owner_email, title, app_url, assignment, prompt, rubric_json, variations_json, opens_at, closes_at, created_at, updated_at)
  VALUES ('be-test1', 'prof@example.edu', 'Bernoulli transcript', 'http://local/app', 'bernoulli-equation', 'Grade the explanation.', ?, '[]', ?, ?, ?, ?)`)
  .bind(JSON.stringify(RUBRIC), new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 86400e3).toISOString(), now, now).run();
await DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES ('be-test1', 'alice@example.edu', 'Alice A')").run();
await DB.prepare(`INSERT INTO t_submissions (exam_id, email, name, source, session_code, status, transcript, fingerprint, sealed_at, critique, grades_json, audit_json, flags_json)
  VALUES ('be-test1', 'alice@example.edu', 'Alice A', 'sealed', 'code-1234567890', 'flagged', '1 (Bernoulli Equation): This is the Bernoulli equation.', 'abc', ?, 'A careful critique.', ?, ?, ?)`)
  .bind(now, JSON.stringify({ "Technical accuracy": 0.9, "Technical completeness": 0.85, "Introduction": 0.8, "Relevance": 0.75, "Summary": 0.8, "Conclusion": 0.7 }),
    JSON.stringify({ status: "done", model: "mock-1", fractions: { "Technical accuracy": 0.4, "Technical completeness": 0.85, "Introduction": 0.8, "Relevance": 0.75, "Summary": 0.8, "Conclusion": 0.7 } }),
    JSON.stringify([{ element: "Technical accuracy", student: 0.9, audit: 0.4 }])).run();

const env = { DB, DEV: "1", APP_ORIGIN: "http://local", ALLOWED_ORIGINS: "http://local",
  SEAL_SECRET: "seal-test-secret", MODEL_API_KEY: "mock-key", MAIL_URL: "", MAIL_SECRET: "x", ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  try {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/t/") || url.pathname.startsWith("/auth/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers, cookie: "sid=testsid" };
      const wreq = new Request("http://local" + url.pathname + url.search, {
        method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const wres = await worker.fetch(wreq, env, ctx);
      const text = await wres.text();
      const h = {};
      wres.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(wres.status, h);
      res.end(text);
      return;
    }
    const name = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!/^\/[A-Za-z0-9._/-]+$/.test(name) || name.includes("..")) { res.writeHead(400); res.end("bad path"); return; }
    const data = await readFile(path.join(root, "worker/public", name.slice(1)));
    res.writeHead(200, { "Content-Type": name.endsWith(".html") ? "text/html" : name.endsWith(".js") ? "text/javascript" : "text/css" });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(e && e.stack || e));
  }
});
server.listen(port, "127.0.0.1", () => console.log("ui test server on http://127.0.0.1:" + port));
