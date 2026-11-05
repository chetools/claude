-- Transcript exams: additive schema for seb_exams. Apply AFTER schema.sql, and re-apply safely
-- (every statement is IF NOT EXISTS / OR IGNORE where it matters). Nothing here drops a table.
--   npx wrangler d1 execute seb-exams --remote --file schema-transcript.sql
-- Prompts, rubrics and connection settings live in these tables, editable in the teacher app;
-- nothing exam-specific is hard-coded in the Worker.

CREATE TABLE IF NOT EXISTS t_settings (
  key        TEXT PRIMARY KEY,   -- e.g. 'model' -> {"provider","base_url","model"}
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS t_exams (
  id            TEXT PRIMARY KEY,
  owner_email   TEXT NOT NULL,
  title         TEXT NOT NULL,
  app_url       TEXT NOT NULL DEFAULT '',   -- student recording app for this exam
  assignment    TEXT NOT NULL DEFAULT '',   -- assignment name the app reports, e.g. 'bernoulli-equation'
  prompt        TEXT NOT NULL DEFAULT '',   -- the grading prompt, exactly as the teacher wrote it
  rubric_json   TEXT NOT NULL DEFAULT '[]', -- [{name, points, guidance}]
  variations_json TEXT NOT NULL DEFAULT '[]', -- [string] one is issued by the server at the start of each take
  prompt_version INTEGER NOT NULL DEFAULT 1, -- bumped whenever prompt or rubric changes
  opens_at      TEXT,
  closes_at     TEXT,
  audit_token_hash TEXT,                    -- SHA-256 of the exam's teacher-validation token (the token itself is shown once, never stored)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS t_exam_teachers (
  exam_id TEXT NOT NULL,
  email   TEXT NOT NULL,
  PRIMARY KEY (exam_id, email)
);
CREATE TABLE IF NOT EXISTS t_roster (
  exam_id TEXT NOT NULL,
  email   TEXT NOT NULL,          -- lower-case; only rostered students may request a login link
  name    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (exam_id, email)
);

-- Student sign-in by emailed link, mirroring the teacher flow in auth.js.
CREATE TABLE IF NOT EXISTS t_login_tokens (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 hex of the emailed token
  exam_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  expires_at TEXT NOT NULL,       -- 15 minutes
  used_at    TEXT
);
CREATE TABLE IF NOT EXISTS t_student_sessions (
  session_hash TEXT PRIMARY KEY,  -- SHA-256 hex of the session value the app holds
  exam_id      TEXT NOT NULL,
  email        TEXT NOT NULL,
  expires_at   TEXT NOT NULL,     -- 12 hours: covers the take and the grading that follows
  created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS t_login_requests (
  email TEXT NOT NULL,
  at    TEXT NOT NULL
);

-- One row per student's take: the sealed record, then the grading record.
CREATE TABLE IF NOT EXISTS t_submissions (
  exam_id       TEXT NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'sealed',  -- 'sealed' (app) or 'teacher' (entered by hand, unsealed)
  session_code  TEXT,                            -- unguessable id of the sealing session; also the grading credential
  status        TEXT NOT NULL DEFAULT 'open',    -- open -> sealed -> graded -> flagged -> final
  variation     TEXT,
  opened_at     TEXT,                            -- server times throughout
  sealed_at     TEXT,
  segments_json TEXT NOT NULL DEFAULT '{}',      -- slide -> {text, firstAt, lastAt, late}
  audio_json    TEXT NOT NULL DEFAULT '{}',      -- slide -> {key, bytes, sha256, title, at} for R2-stored audio segments
  audio_fingerprint TEXT,                        -- SHA-256 hex over the per-slide audio fingerprints, set at audio sealing
  transcription_json TEXT NOT NULL DEFAULT '{}', -- {status, model, at, detail} of the server transcription of the audio
  student_transcript TEXT,                       -- transcript made by the student's own Muse from the sealed audio
  student_fingerprint TEXT,                      -- SHA-256 hex of the student's transcript
  final_at TEXT,                                 -- when the student marked the current take as their final submission
  photo_json TEXT NOT NULL DEFAULT '{}',         -- the submission's one picture {key, bytes, sha256, atSec, slide, precheck, receivedAt}
  photo_fingerprint TEXT,                        -- SHA-256 hex of the picture, covered by the seal
  motion_json TEXT NOT NULL DEFAULT '[]',        -- scene-change captures [{key, n, bytes, sha256, atSec, slide, score, receivedAt}]
  history_json  TEXT NOT NULL DEFAULT '[]',      -- every segment arrival {slide, at, fingerprint, late}
  transcript    TEXT,                            -- assembled master copy, set at sealing
  fingerprint   TEXT,                            -- SHA-256 hex of the assembled transcript
  receipt       TEXT,                            -- keyed code over the sealed record (SEAL_SECRET)
  prompt_version INTEGER,                        -- exam prompt version the grading used
  critique      TEXT,                            -- critique uploaded by the student's Muse
  grades_json   TEXT,                            -- {element name: fraction 0..1} from the student's Muse
  audit_json    TEXT,                            -- {fractions, model, at} from the server audit re-grade
  flags_json    TEXT NOT NULL DEFAULT '[]',      -- elements where student and audit grades disagree
  manual_json   TEXT NOT NULL DEFAULT '{}',      -- teacher: {fractions: {name: fraction}, comment}
  PRIMARY KEY (exam_id, email)
);
CREATE INDEX IF NOT EXISTS t_submissions_exam ON t_submissions (exam_id);

-- One row per graded attempt. Students practise as often as they like: every critique
-- upload (practice or final) is archived here before the submission row moves on, so
-- the practice history survives later takes. The submission row holds the latest
-- attempt, and the final one once the student marks it final.
CREATE TABLE IF NOT EXISTS t_attempts (
  session_code TEXT PRIMARY KEY,  -- the sealed session this attempt belongs to
  exam_id  TEXT NOT NULL,
  email    TEXT NOT NULL,
  final    INTEGER NOT NULL DEFAULT 0, -- 1 when the student marked this attempt as their submission
  audio_fingerprint TEXT,
  student_transcript TEXT,
  critique TEXT,
  grades_json TEXT,
  status   TEXT,
  motion_count INTEGER NOT NULL DEFAULT 0, -- scene-change captures in this attempt (cleanup bookkeeping)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS t_attempts_exam ON t_attempts (exam_id, email);
