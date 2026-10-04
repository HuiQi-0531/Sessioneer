-- 001: one assignment table ("take the paper calendar off the fridge")
--
-- Before this migration a session's tutor could be stored in two places:
--   sessions.assigned_tutor_id / is_assigned / tutor_confirmed / tutor_reject_reason  (old)
--   session_tutors                                                                    (current)
-- Most of the app already used session_tutors, but cover claims (and a few
-- reads) still used the old columns, so the two disagreed.
--
-- This migration:
--   1. copies any old-only assignment into session_tutors, EXCEPT ones that
--      were written by a cover claim (a cover is temporary and already lives
--      in cover_requests, so it must not become a permanent assignment);
--   2. drops the old columns, so nothing can write to them again;
--   3. drops two tables nothing uses (session_assign, swap_requests) if empty.
--
-- Safe to run more than once. Run it with `npm run db:migrate` (which runs
-- setup-db.sql first) - always on a backup / staging copy first.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'assigned_tutor_id'
  ) THEN
    -- 1. Keep real assignments that only exist in the old column.
    EXECUTE $sql$
      INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, tutor_reject_reason)
      SELECT s.id, s.assigned_tutor_id,
             CASE WHEN to_jsonb(s) ? 'tutor_confirmed' THEN (to_jsonb(s)->>'tutor_confirmed')::boolean END,
             CASE WHEN to_jsonb(s) ? 'tutor_reject_reason' THEN to_jsonb(s)->>'tutor_reject_reason' END
      FROM sessions s
      WHERE s.assigned_tutor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM session_tutors st
          WHERE st.session_id = s.id AND st.tutor_id = s.assigned_tutor_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM cover_requests cr
          WHERE cr.session_id = s.id
            AND cr.claimed_by_id = s.assigned_tutor_id
            AND cr.status = 'claimed'
        )
      ON CONFLICT (session_id, tutor_id) DO NOTHING
    $sql$;

    -- Tutors who got a session that way are also members of its unit.
    EXECUTE $sql$
      INSERT INTO unit_memberships (unit_id, user_id, role)
      SELECT DISTINCT s.unit_id, st.tutor_id, 'tutor'
      FROM session_tutors st
      JOIN sessions s ON s.id = st.session_id
      WHERE NOT EXISTS (
        SELECT 1 FROM unit_memberships um
        WHERE um.unit_id = s.unit_id AND um.user_id = st.tutor_id
      )
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
    $sql$;
  END IF;
END $$;

-- 2. Remove the old "paper calendar" columns.
DROP INDEX IF EXISTS idx_sessions_assigned_tutor;
ALTER TABLE sessions DROP COLUMN IF EXISTS assigned_tutor_id;
ALTER TABLE sessions DROP COLUMN IF EXISTS is_assigned;
ALTER TABLE sessions DROP COLUMN IF EXISTS tutor_confirmed;
ALTER TABLE sessions DROP COLUMN IF EXISTS tutor_reject_reason;

-- 3. Unused tables (no route reads or writes them). Only dropped when empty,
-- so no data is ever lost by this step.
DO $$
BEGIN
  IF to_regclass('public.session_assign') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM session_assign) THEN
      DROP TABLE session_assign;
    ELSE
      RAISE NOTICE 'session_assign has rows; left in place for manual review';
    END IF;
  END IF;
  IF to_regclass('public.swap_requests') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM swap_requests) THEN
      DROP TABLE swap_requests;
    ELSE
      RAISE NOTICE 'swap_requests has rows; left in place for manual review';
    END IF;
  END IF;
END $$;
