PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
CREATE TABLE IF NOT EXISTS applications (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  company TEXT NOT NULL CHECK(length(company) BETWEEN 1 AND 80),
  role TEXT NOT NULL CHECK(length(role) BETWEEN 1 AND 120),
  location TEXT NOT NULL,
  work_type TEXT NOT NULL CHECK(work_type IN ('Uzaktan', 'Hibrit', 'Ofiste')),
  stage TEXT NOT NULL CHECK(stage IN ('saved', 'applied', 'interview', 'offer', 'rejected')),
  application_date TEXT NOT NULL,
  interview_at TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
) STRICT;
PRAGMA user_version = 1;
CREATE TABLE IF NOT EXISTS auth_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS auth_attempts_expiry ON auth_attempts(expires_at);
