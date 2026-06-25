-- Per-project Markdown notes: project context, repo links, Telegram channel,
-- and other key details. Edited from the wiki-style editor on the frontend;
-- stored as plain markdown text. Mirrors schema.ts.
ALTER TABLE projects ADD COLUMN notes TEXT NOT NULL DEFAULT '';
