UPDATE stories
SET sort_order = (
  SELECT ranked.rn * 1024
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY team_id, status
        ORDER BY updated_at DESC, id ASC
      ) AS rn
    FROM stories
    WHERE is_active = 1
  ) AS ranked
  WHERE ranked.id = stories.id
)
WHERE is_active = 1;
