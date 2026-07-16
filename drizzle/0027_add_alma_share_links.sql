-- Ephemeral public share links for a single ALMA document. Raw tokens are
-- returned once and only their SHA-256 hashes are persisted. Links expire
-- after five minutes and can be revoked early.
CREATE TABLE IF NOT EXISTS alma_share_links (
  id TEXT PRIMARY KEY,
  alma_id TEXT NOT NULL REFERENCES alma_documents(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS alma_share_links_alma_id ON alma_share_links (alma_id);
--> statement-breakpoint
-- Append-only audit survives document deletion. It records link ids and actor
-- metadata only; ALMA content and raw share tokens never enter the log.
CREATE TABLE IF NOT EXISTS alma_share_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alma_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_token_id TEXT,
  actor_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS alma_share_audit_events_alma_id_created_at
  ON alma_share_audit_events (alma_id, created_at);
