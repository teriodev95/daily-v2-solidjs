-- Wiki share tokens: project-scoped, read-only tokens that let external
-- agents navigate an entire project's wiki graph from a single entry URL.
-- Mirrors the shape of story_share_tokens (0012/0013) but binds to a
-- project instead of a single resource.
CREATE TABLE IF NOT EXISTS wiki_share_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  entry_article_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_share_tokens_hash
  ON wiki_share_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_wiki_share_tokens_active
  ON wiki_share_tokens(project_id, user_id, revoked_at);

-- Partial unique index: at most one active token per (project, user). The
-- rotate helper revokes the previous active row BEFORE inserting the new
-- one; this constraint enforces that invariant under concurrent rotations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_share_tokens_unique_active
  ON wiki_share_tokens(project_id, user_id)
  WHERE revoked_at IS NULL;
