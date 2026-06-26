-- Revocable share links for a single secret, bound to a PAT (`secret_share_links`).
-- Resolving a link needs both the unguessable `ss_` URL token AND its bound PAT.
-- No TTL of its own: it dies with the token. Both FKs ON DELETE CASCADE so
-- deleting the secret or the token removes the link. Only the SHA-256 hash of
-- the raw token is stored. Mirrors schema.ts.
CREATE TABLE IF NOT EXISTS secret_share_links (
  id TEXT PRIMARY KEY,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS secret_share_links_secret_id ON secret_share_links (secret_id);
