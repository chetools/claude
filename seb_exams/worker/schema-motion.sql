-- One-time migration for an existing seb-exams D1 database: scene-change
-- (motion) captures during a take.
-- Apply once, after schema-photo.sql:
--   wrangler d1 execute seb-exams --remote --file worker/schema-motion.sql

ALTER TABLE t_submissions ADD COLUMN motion_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE t_attempts ADD COLUMN motion_count INTEGER NOT NULL DEFAULT 0;
