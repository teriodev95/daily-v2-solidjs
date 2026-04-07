-- Step 1: Merge purpose and objective into description for stories that have content in those fields
-- Case: both purpose and objective have content
UPDATE stories SET description =
  '## Para qué' || char(10) || purpose || char(10) || char(10) ||
  CASE WHEN description != '' THEN description || char(10) || char(10) ELSE '' END ||
  '## Objetivo' || char(10) || objective
WHERE purpose != '' AND objective != '' AND description NOT LIKE '%## Para qué%';

-- Case: only purpose has content
UPDATE stories SET description =
  '## Para qué' || char(10) || purpose ||
  CASE WHEN description != '' THEN char(10) || char(10) || description ELSE '' END
WHERE purpose != '' AND objective = '' AND description NOT LIKE '%## Para qué%';

-- Case: only objective has content
UPDATE stories SET description =
  CASE WHEN description != '' THEN description || char(10) || char(10) ELSE '' END ||
  '## Objetivo' || char(10) || objective
WHERE purpose = '' AND objective != '' AND description NOT LIKE '%## Objetivo%';

-- Step 2: Drop the columns (SQLite requires recreating the table, but D1 supports ALTER TABLE DROP COLUMN)
ALTER TABLE stories DROP COLUMN purpose;
ALTER TABLE stories DROP COLUMN objective;
