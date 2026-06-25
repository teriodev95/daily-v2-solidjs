-- Internal encrypted vault (`secrets`) + append-only audit log
-- (`secret_audit_events`). Mirrors schema.ts; the secret value is stored
-- AES-256-GCM-encrypted and is never written to the audit log.
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  project_id TEXT REFERENCES projects(id),
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  environment TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS secrets_team_id_revoked_at ON secrets (team_id, revoked_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS secrets_project_id ON secrets (project_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS secret_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  secret_id TEXT NOT NULL REFERENCES secrets(id),
  team_id TEXT NOT NULL,
  project_id TEXT,
  actor_user_id TEXT,
  actor_token_id TEXT,
  actor_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS secret_audit_events_secret_id_created_at ON secret_audit_events (secret_id, created_at);
