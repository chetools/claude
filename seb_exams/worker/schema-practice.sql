-- One-time migration for an existing seb-exams D1 database: practice attempts,
-- final submission marking, and teacher-Muse validation.
-- Apply once, after schema-audio.sql:
--   wrangler d1 execute seb-exams --remote --file worker/schema-practice.sql
-- Plain ALTERs on purpose: re-running fails on the first duplicate column, which is
-- how you know it has already been applied.

ALTER TABLE t_exams ADD COLUMN audit_token_hash TEXT;
ALTER TABLE t_submissions ADD COLUMN final_at TEXT;

CREATE TABLE IF NOT EXISTS t_attempts (
  session_code TEXT PRIMARY KEY,
  exam_id  TEXT NOT NULL,
  email    TEXT NOT NULL,
  final    INTEGER NOT NULL DEFAULT 0,
  audio_fingerprint TEXT,
  student_transcript TEXT,
  critique TEXT,
  grades_json TEXT,
  status   TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS t_attempts_exam ON t_attempts (exam_id, email);
