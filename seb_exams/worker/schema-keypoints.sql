-- Keypoints assignments: additive schema for seb_exams. Apply AFTER schema.sql and
-- schema-transcript.sql (and the audio/practice migrations). The CREATE TABLE statements
-- are safe to re-apply; the ALTER runs once (SQLite has no ADD COLUMN IF NOT EXISTS).
--   npx wrangler d1 execute seb-exams --remote --file schema-keypoints.sql
-- A keypoints assignment reuses the transcript-exam tables for sign-in, sealing and
-- grading; these tables hold only what that machinery has no place for: the assignment
-- page (the typeset teacher page) and the approved answer key.

ALTER TABLE t_roster ADD COLUMN role TEXT NOT NULL DEFAULT 'student';  -- 'student' | 'model'

CREATE TABLE IF NOT EXISTS k_pages (
  exam_id   TEXT PRIMARY KEY,
  page_html TEXT NOT NULL,          -- the combined page fragment (.tblock/.teq/.tnote blocks)
  latex     TEXT NOT NULL DEFAULT '', -- the LaTeX source the fragment was rendered from
  photos    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS k_keys (
  exam_id      TEXT PRIMARY KEY,
  key_json     TEXT NOT NULL,       -- {points: [{text, connection, points}]}
  total_points REAL NOT NULL,
  approved_at  TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
