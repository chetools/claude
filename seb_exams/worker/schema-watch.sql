-- One-time migration for an existing seb-exams D1 database: watch grading
-- (option 2) — per-student Muse credentials and the pending-take claim.
-- Apply once, after schema-keypoints.sql:
--   wrangler d1 execute seb-exams --remote --file worker/schema-watch.sql
-- The ALTER is plain on purpose: re-running fails on the duplicate column, which is
-- how you know it has already been applied. The CREATE TABLE is safe to re-apply.

ALTER TABLE t_submissions ADD COLUMN watch_claim_at TEXT;

CREATE TABLE IF NOT EXISTS t_watch_tokens (
  exam_id  TEXT NOT NULL,
  email    TEXT NOT NULL,          -- lower-case; one credential pair per student per exam
  name     TEXT NOT NULL DEFAULT '',
  token_hash TEXT NOT NULL,        -- SHA-256 hex of the grading token (authentication is by hash)
  token_enc  TEXT NOT NULL,        -- grading token, AES-GCM encrypted (see transcript.js); decrypt only to email it
  poll_hash  TEXT NOT NULL,        -- SHA-256 hex of the low-privilege poll key
  poll_enc   TEXT NOT NULL,        -- poll key, encrypted the same way
  created_at TEXT NOT NULL,
  last_emailed_at TEXT,
  last_poll_at    TEXT,
  last_pending_at TEXT,
  PRIMARY KEY (exam_id, email)
);
CREATE INDEX IF NOT EXISTS t_watch_tokens_token ON t_watch_tokens (token_hash);
CREATE INDEX IF NOT EXISTS t_watch_tokens_poll ON t_watch_tokens (poll_hash);
