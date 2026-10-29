-- D1 schema for seb_exams. Apply with: npx wrangler d1 execute seb-exams --remote --file worker/schema.sql
CREATE TABLE IF NOT EXISTS exams (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  page_url    TEXT NOT NULL,          -- published exam page; SEB hashes are checked against URLs under it
  key_json    TEXT NOT NULL,          -- answer key and points, never sent to students
  config_keys TEXT NOT NULL,          -- JSON array of accepted SEB Config Keys (hex)
  require_seb INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id      TEXT NOT NULL,
  student_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  detail_json  TEXT NOT NULL,         -- per-question auto-grading result
  auto_score   REAL NOT NULL,
  auto_max     REAL NOT NULL,
  manual_max   REAL NOT NULL,         -- points of open questions, graded by the teacher
  receipt      TEXT NOT NULL,
  started_at   TEXT,                  -- reported by the browser
  submitted_at TEXT NOT NULL,         -- server time
  seb_check    TEXT NOT NULL,         -- how the SEB check passed
  user_agent   TEXT,
  UNIQUE (exam_id, student_id)
);
