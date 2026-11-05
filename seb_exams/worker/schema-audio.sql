-- Audio takes: one-time migration for a database that already has the transcript schema.
-- Run ONCE against the live database (plain ALTER TABLE has no IF NOT EXISTS in SQLite;
-- running it twice fails on the duplicate column, which is harmless and expected):
--   npx wrangler d1 execute seb-exams --remote --file schema-audio.sql
-- Fresh installs do not need this file: schema-transcript.sql already creates the columns.

ALTER TABLE t_submissions ADD COLUMN audio_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE t_submissions ADD COLUMN audio_fingerprint TEXT;
ALTER TABLE t_submissions ADD COLUMN transcription_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE t_submissions ADD COLUMN student_transcript TEXT;
ALTER TABLE t_submissions ADD COLUMN student_fingerprint TEXT;
