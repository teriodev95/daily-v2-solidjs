-- Librarian fields for autonomous wiki article analysis
ALTER TABLE wiki_articles ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE wiki_articles ADD COLUMN librarian_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE wiki_articles ADD COLUMN suggested_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE wiki_articles ADD COLUMN suggested_links TEXT NOT NULL DEFAULT '[]';
ALTER TABLE wiki_articles ADD COLUMN librarian_error TEXT NOT NULL DEFAULT '';
ALTER TABLE wiki_articles ADD COLUMN librarian_retries INTEGER NOT NULL DEFAULT 0;
