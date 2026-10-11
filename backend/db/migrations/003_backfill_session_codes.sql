-- Sessions added from the Admin console (and some older imports/copies) were
-- saved with no session code, so they show up without TUT01/LEC01 etc.
-- This gives every code-less session the next free code for its type in its
-- unit, numbered by day and start time, after any codes that already exist.
-- Sessions that already have a code are not touched.
WITH missing AS (
  SELECT
    s.id,
    s.unit_id,
    CASE LOWER(TRIM(COALESCE(s.session_type, '')))
      WHEN 'tutorial' THEN 'TUT'
      WHEN 'consultation' THEN 'CON'
      WHEN 'practical' THEN 'PRC'
      WHEN 'lecture' THEN 'LEC'
      WHEN 'workshop' THEN 'WOR'
      ELSE 'SES'
    END AS prefix,
    CASE s.day
      WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
      WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
    END AS day_order,
    s.start_time
  FROM sessions s
  WHERE s.session_code IS NULL OR TRIM(s.session_code) = ''
),
existing AS (
  SELECT
    unit_id,
    SUBSTRING(UPPER(session_code) FROM '^([A-Z]+)[0-9]+$') AS prefix,
    MAX(SUBSTRING(UPPER(session_code) FROM '^[A-Z]+([0-9]+)$')::int) AS max_num
  FROM sessions
  WHERE UPPER(session_code) ~ '^[A-Z]+[0-9]+$'
  GROUP BY 1, 2
),
numbered AS (
  SELECT
    m.id,
    m.prefix,
    COALESCE(e.max_num, 0)
      + ROW_NUMBER() OVER (PARTITION BY m.unit_id, m.prefix ORDER BY m.day_order, m.start_time, m.id) AS num
  FROM missing m
  LEFT JOIN existing e ON e.unit_id = m.unit_id AND e.prefix = m.prefix
)
UPDATE sessions s
SET session_code = n.prefix || LPAD(n.num::text, 2, '0')
FROM numbered n
WHERE s.id = n.id;