-- A recurring story can be completed once per user and calendar day.
-- The completions API is idempotent; this index makes that guarantee hold
-- under concurrent requests too.
CREATE UNIQUE INDEX IF NOT EXISTS story_completions_unique_day
  ON story_completions (story_id, user_id, completion_date);
