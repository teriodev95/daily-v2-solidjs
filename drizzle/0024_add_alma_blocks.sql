-- Alma blocks: a paragraph is the atomic unit of an Alma entry (`alma_blocks`).
-- Source of truth for an entry's body; `alma_documents.content` becomes a
-- derived cache (block texts joined by "\n\n" in `sort` order). `locked` blocks
-- can only be edited/unlocked by a human session, never an agent (PAT). `sort`
-- is a dense 0..n-1 index. No backfill here — it's done lazily in code on first
-- read. Mirrors schema.ts.
CREATE TABLE IF NOT EXISTS alma_blocks (
  id TEXT PRIMARY KEY,
  alma_id TEXT NOT NULL REFERENCES alma_documents(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS alma_blocks_alma_id_sort ON alma_blocks (alma_id, sort);
