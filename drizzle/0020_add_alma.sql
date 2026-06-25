-- Alma: per-user layered technical memory (`alma_documents`). Three tiers:
-- 0 = always-loaded core ("alma"), 1 = domains, 2 = deep reference. Mirrors
-- schema.ts. Strictly scoped per user; `source` is server-set ('agent'|'human').
CREATE TABLE IF NOT EXISTS alma_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  tier INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS alma_documents_user_id_tier_sort ON alma_documents (user_id, tier, sort);
--> statement-breakpoint
-- Enforce exactly one canonical Tier 0 core per user at the DB level, so a race
-- between two lazy-create requests (D1 has no transactions) cannot duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS alma_documents_one_core ON alma_documents (user_id) WHERE tier = 0 AND kind = 'alma';
