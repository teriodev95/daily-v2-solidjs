CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  last_used_ip TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_token_hash ON api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS api_tokens_user_id_revoked_at ON api_tokens (user_id, revoked_at);
