CREATE TABLE IF NOT EXISTS story_share_tokens (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS story_share_tokens_token_hash ON story_share_tokens (token_hash);
CREATE INDEX IF NOT EXISTS story_share_tokens_story_user_revoked ON story_share_tokens (story_id, user_id, revoked_at);
