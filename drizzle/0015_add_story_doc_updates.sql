-- Append-only log of Yjs binary updates per story `description`.
-- Keeps the per-update model server-side without a read-modify-write race;
-- merging is done by replaying all rows for a story into a fresh Y.Doc.
-- Compaction (squash N rows into one) is left for a future maintenance job.
CREATE TABLE `story_doc_updates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `story_id` text NOT NULL,
  `update` blob NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `story_doc_updates_story_id_idx` ON `story_doc_updates` (`story_id`);
