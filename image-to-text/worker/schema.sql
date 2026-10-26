CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  score REAL,              -- 0-100 from the server's own scoring; NULL = refused / unusable answer
  ts INTEGER NOT NULL,     -- ms since epoch
  ip_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS results_model_ts ON results (model, ts);
