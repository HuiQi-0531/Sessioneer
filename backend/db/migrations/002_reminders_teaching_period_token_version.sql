-- 002: reminder emails, unit teaching period and server-side logout.
--
-- Only ADDs things. No existing row is changed:
--   * new nullable columns on units (teaching period) - existing units stay NULL,
--     which simply means "no session reminders" until a UC fills them in;
--   * users.token_version defaults to 0, which matches every token already
--     issued (tokens without a version are treated as version 0);
--   * two new log tables that remember which reminders were already sent.
--
-- Safe to run more than once.

-- Unit teaching period (used by the 24-hour session reminder).
ALTER TABLE units ADD COLUMN IF NOT EXISTS teaching_start_date DATE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS teaching_end_date DATE;

-- Server-side logout: bumping this number invalidates every token issued before.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- One row per availability reminder email sent.
--   kind = 'auto'   : the daily 3-days-before-deadline job. At most one per
--                     tutor + unit + deadline (enforced by the unique index),
--                     so changing the deadline allows one more.
--   kind = 'manual' : the UC's bell button. At most one per tutor + unit per
--                     Brisbane calendar day (checked in the route).
CREATE TABLE IF NOT EXISTS availability_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deadline TIMESTAMP,
    kind VARCHAR(10) NOT NULL DEFAULT 'auto',
    sent_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    CONSTRAINT availability_reminders_kind_check CHECK (kind IN ('auto', 'manual'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_availability_reminders_auto
    ON availability_reminders(unit_id, tutor_id, deadline)
    WHERE kind = 'auto';
CREATE INDEX IF NOT EXISTS idx_availability_reminders_manual
    ON availability_reminders(unit_id, tutor_id, sent_at)
    WHERE kind = 'manual';

-- One row per 24-hour session reminder: tutor + session + class date.
CREATE TABLE IF NOT EXISTS session_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (session_id, tutor_id, occurrence_date)
);
