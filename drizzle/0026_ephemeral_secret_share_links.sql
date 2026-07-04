-- Rework secret share links (issue #8): drop the PAT binding, make links
-- ephemeral (5-minute TTL enforced server-side). Existing links are discarded
-- on purpose — the bound-token model never worked in practice and the new
-- links are throw-away by design. Mirrors schema.ts.
DROP TABLE IF EXISTS secret_share_links;
--> statement-breakpoint
CREATE TABLE secret_share_links (
  id TEXT PRIMARY KEY,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE INDEX secret_share_links_secret_id ON secret_share_links (secret_id);
