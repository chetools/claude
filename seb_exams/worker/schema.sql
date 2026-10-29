-- D1 schema for seb_exams v2. Apply with: npx wrangler d1 execute seb-exams --remote --file schema.sql
-- (add --local for the dev database). Drops the v1 tables first: v1 data was test data only.
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS attempts;
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS exam_teachers;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS login_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_requests;
DROP TABLE IF EXISTS outbox;

CREATE TABLE teachers (
  email      TEXT PRIMARY KEY,            -- lower-case
  name       TEXT NOT NULL DEFAULT '',
  is_admin   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,            -- SHA-256 hex of the emailed token
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,               -- 15 minutes
  used_at    TEXT
);
CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY,          -- SHA-256 hex of the cookie value
  email        TEXT NOT NULL,
  expires_at   TEXT NOT NULL,             -- 7 days
  created_at   TEXT NOT NULL
);
CREATE TABLE login_requests (
  email TEXT NOT NULL,
  at    TEXT NOT NULL
);
CREATE INDEX login_requests_email ON login_requests (email, at);

CREATE TABLE exams (
  id                   TEXT PRIMARY KEY,
  owner_email          TEXT NOT NULL,
  title                TEXT NOT NULL,
  content_json         TEXT NOT NULL,     -- normalized exam, with answers; never sent to students as is
  require_seb          INTEGER NOT NULL DEFAULT 1,
  opens_at             TEXT,
  closes_at            TEXT,
  quit_password_sha256 TEXT,
  extra_config_keys    TEXT NOT NULL DEFAULT '[]',   -- JSON array of accepted extra Config Keys (hex)
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  regraded_at          TEXT
);
CREATE TABLE exam_teachers (
  exam_id TEXT NOT NULL,
  email   TEXT NOT NULL,
  PRIMARY KEY (exam_id, email)
);
CREATE TABLE images (
  exam_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  mime     TEXT NOT NULL,
  data_b64 TEXT NOT NULL,
  size     INTEGER NOT NULL,              -- decoded bytes
  PRIMARY KEY (exam_id, name)
);
CREATE TABLE attempts (
  exam_id    TEXT NOT NULL,
  student_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  started_at TEXT NOT NULL,               -- server time of the first start
  PRIMARY KEY (exam_id, student_id)
);
CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id      TEXT NOT NULL,
  student_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  detail_json  TEXT NOT NULL,             -- per-question auto-grading result
  auto_score   REAL NOT NULL,
  auto_max     REAL NOT NULL,
  manual_json  TEXT NOT NULL DEFAULT '{}',   -- {qid: {points, comment}} for open questions
  receipt      TEXT NOT NULL,
  started_at   TEXT,
  submitted_at TEXT NOT NULL,
  late         INTEGER NOT NULL DEFAULT 0,
  seb_check    TEXT NOT NULL,             -- how the SEB check passed
  user_agent   TEXT,
  UNIQUE (exam_id, student_id)
);
CREATE INDEX submissions_exam ON submissions (exam_id);
CREATE TABLE outbox (                     -- only written when DEV = "1"
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject  TEXT NOT NULL,
  body     TEXT NOT NULL,
  at       TEXT NOT NULL
);
