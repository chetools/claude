-- One-time migration for an existing seb-exams D1 database: one sealed picture
-- per submission (captured by the app at a randomised moment during the take).
-- Apply once, after schema-practice.sql:
--   wrangler d1 execute seb-exams --remote --file worker/schema-photo.sql

ALTER TABLE t_submissions ADD COLUMN photo_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE t_submissions ADD COLUMN photo_fingerprint TEXT;
