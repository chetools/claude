// Test-only server for the recording app: serves the real Worker (with a
// pre-made teacher session injected for /api/* checks), the v13 sealing app
// at /app, and a /test-outbox peek at DEV mail. NOT part of the Worker.
// Usage: node tests/app-serve.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { D1Shim } from "./d1-shim.mjs";
import worker from "../worker/src/index.js";

const port = Number(process.argv[2] || 8934);
const origin = "http://127.0.0.1:" + port;
const sha = (s) => createHash("sha256").update(s).digest("hex");

const DB = new D1Shim();
DB.exec(await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8"));
DB.exec(await readFile(new URL("../worker/schema-transcript.sql", import.meta.url), "utf8"));
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
  VALUES ('be-test1', 'prof@example.edu', 'Bernoulli transcript', ?, 'bernoulli-equation', 'Grade the explanation.', ?, ?, ?, ?, ?, ?)`)
  .bind(origin + "/app", JSON.stringify(RUBRIC),
    JSON.stringify(["(a) Explain 9 to a first-year student.", "(b) State what changes if friction is not zero."]),
    new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 86400e3).toISOString(), now, now).run();
await DB.prepare("INSERT INTO t_roster (exam_id, email, name) VALUES ('be-test1', 'alice@example.edu', 'Alice A')").run();

const env = { DB, DEV: "1", APP_ORIGIN: origin, ALLOWED_ORIGINS: origin,
  SEAL_SECRET: "seal-test-secret", MODEL_API_KEY: "mock-key", MAIL_URL: "", MAIL_SECRET: "x", ADMIN_EMAIL: "prof@example.edu" };
const ctx = { waitUntil: (p) => p };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  try {
    if (url.pathname === "/test-outbox") {
      const rows = DB.query("SELECT body FROM outbox ORDER BY id DESC LIMIT 1");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(rows.length ? rows[0].body : "");
      return;
    }
    if (url.pathname === "/app") {
      const data = await readFile("/home/hatch/workspace/bernoulli-explain-app/app-v13-sealing.html");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
      return;
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/t/") || url.pathname.startsWith("/auth/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers, cookie: "sid=testsid" };
      const wreq = new Request(origin + url.pathname + url.search, {
        method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const wres = await worker.fetch(wreq, env, ctx);
      const text = await wres.text();
      const h = {};
      wres.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(wres.status, h);
      res.end(text);
      return;
    }
    res.writeHead(404); res.end("not found");
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(e && e.stack || e));
  }
});
server.listen(port, "127.0.0.1", () => console.log("app test server on " + origin));
