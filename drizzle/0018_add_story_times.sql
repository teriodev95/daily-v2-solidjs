-- Optional time-block fields for stories (Apple Calendar-style scheduling).
-- Both NULL = all-day; both present = timed block.
-- Format: "HH:mm" (validated server-side in worker/routes/stories.ts).
ALTER TABLE `stories` ADD COLUMN `start_time` text;
ALTER TABLE `stories` ADD COLUMN `end_time` text;
