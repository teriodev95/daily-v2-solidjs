-- Enforce at most ONE active (non-revoked) share token per (story, user).
-- Rotation logic in POST /api/stories/:id/share-token revokes the previous
-- token before minting a new one; this partial unique index guarantees that
-- invariant even under concurrent rotation attempts.
CREATE UNIQUE INDEX IF NOT EXISTS story_share_tokens_active_unique
  ON story_share_tokens (story_id, user_id)
  WHERE revoked_at IS NULL;
