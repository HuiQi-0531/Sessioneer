-- Sessioneer database schema: the complete "blueprint".
--
-- This file IS the database. Every table and column the backend uses is
-- listed here, and nothing else creates tables or columns (server.js used to
-- add ~40 columns at start-up; that has been removed).
--
-- Safe to run on a brand-new database AND on an existing one: tables use
-- CREATE TABLE IF NOT EXISTS and every column is repeated as
-- ADD COLUMN IF NOT EXISTS, so an older database is filled in, never wiped.
--
-- Changing the schema from now on:
--   1. add the column/table here, and
--   2. add a numbered file in db/migrations/ (e.g. 002_add_x.sql) for
--      databases that already exist, then run `npm run db:migrate`.
--
-- Assignments: session_tutors is the ONLY record of who teaches a session.
-- sessions has no tutor columns. Temporary covers live in cover_requests.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    school_id VARCHAR(50),
    phone_number VARCHAR(20),
    work_experience TEXT,
    maximum_hours INTEGER,
    contract_type VARCHAR(50),
    avatar_url TEXT,
    account_status VARCHAR(20) DEFAULT 'active',
    application_status VARCHAR(50),
    applied_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notify_session_updates BOOLEAN DEFAULT TRUE,
    notify_request_updates BOOLEAN DEFAULT TRUE,
    resume_filename VARCHAR(255),
    resume_mime_type VARCHAR(100),
    resume_data BYTEA,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_experience TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS maximum_hours INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS application_status VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_session_updates BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_request_updates BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_filename VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_mime_type VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS resume_data BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- units
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_coordinator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    unit_code VARCHAR(20) NOT NULL,
    unit_name VARCHAR(255) NOT NULL,
    semester VARCHAR(20) NOT NULL,
    year INTEGER NOT NULL,
    campus VARCHAR(20),
    delivery_mode VARCHAR(20),
    enrolment_size INTEGER,
    availability_deadline TIMESTAMP,
    availability_locked BOOLEAN DEFAULT FALSE,
    schedule_locked BOOLEAN DEFAULT FALSE,
    schedule_locked_at TIMESTAMP,
    draft_released BOOLEAN DEFAULT FALSE,
    application_form JSONB,
    teaching_start_date DATE,
    teaching_end_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_coordinator_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_code VARCHAR(20);
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_name VARCHAR(255);
ALTER TABLE units ADD COLUMN IF NOT EXISTS semester VARCHAR(20);
ALTER TABLE units ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE units ADD COLUMN IF NOT EXISTS campus VARCHAR(20);
ALTER TABLE units ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20);
ALTER TABLE units ADD COLUMN IF NOT EXISTS enrolment_size INTEGER;
ALTER TABLE units ADD COLUMN IF NOT EXISTS availability_deadline TIMESTAMP;
ALTER TABLE units ADD COLUMN IF NOT EXISTS availability_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS schedule_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS schedule_locked_at TIMESTAMP;
ALTER TABLE units ADD COLUMN IF NOT EXISTS draft_released BOOLEAN DEFAULT FALSE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS application_form JSONB;
ALTER TABLE units ADD COLUMN IF NOT EXISTS teaching_start_date DATE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS teaching_end_date DATE;
ALTER TABLE units ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- unit_memberships
CREATE TABLE IF NOT EXISTS unit_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(unit_id, user_id, role),
    CONSTRAINT unit_memberships_role_check CHECK (role IN ('coordinator', 'tutor', 'super_tutor'))
);
ALTER TABLE unit_memberships ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE unit_memberships ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE unit_memberships ADD COLUMN IF NOT EXISTS role VARCHAR(20);
ALTER TABLE unit_memberships ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    session_code VARCHAR(30),
    day VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(100),
    campus VARCHAR(20),
    session_type VARCHAR(50),
    capacity INTEGER,
    required_tutors INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) DEFAULT 'Confirmed',
    staff_note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_code VARCHAR(30);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS day VARCHAR(20);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location VARCHAR(100);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS campus VARCHAR(20);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR(50);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS capacity INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS required_tutors INTEGER DEFAULT 1;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Confirmed';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS staff_note TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- session_tutors
CREATE TABLE IF NOT EXISTS session_tutors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    tutor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tutor_confirmed BOOLEAN DEFAULT NULL,
    tutor_reject_reason TEXT,
    assigned_at TIMESTAMP DEFAULT NOW(),
    reminder_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(session_id, tutor_id)
);
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS tutor_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS tutor_confirmed BOOLEAN DEFAULT NULL;
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS tutor_reject_reason TEXT;
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT NOW();
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;
ALTER TABLE session_tutors ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- availability
CREATE TABLE IF NOT EXISTS availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    day VARCHAR(20) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    preference VARCHAR(50),
    is_submitted BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE availability ADD COLUMN IF NOT EXISTS tutor_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS day VARCHAR(20);
ALTER TABLE availability ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS preference VARCHAR(50);
ALTER TABLE availability ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN DEFAULT FALSE;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- tutor_unit_markers
CREATE TABLE IF NOT EXISTS tutor_unit_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    tutor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    priority_tag VARCHAR(50) DEFAULT 'Standard',
    internal_notes TEXT,
    tags TEXT[] DEFAULT '{}',
    early_access BOOLEAN DEFAULT FALSE,
    starred BOOLEAN DEFAULT FALSE,
    flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(unit_id, tutor_id)
);
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS tutor_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS priority_tag VARCHAR(50) DEFAULT 'Standard';
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS early_access BOOLEAN DEFAULT FALSE;
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT FALSE;
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE;
ALTER TABLE tutor_unit_markers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- change_requests
CREATE TABLE IF NOT EXISTS change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    request_type VARCHAR(50),
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    priority TEXT DEFAULT 'Normal',
    current_session TEXT,
    preferred_swap_to TEXT,
    current_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    preferred_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    suggested_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS tutor_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(50);
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Normal';
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS current_session TEXT;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS preferred_swap_to TEXT;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS current_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS preferred_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS suggested_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- cover_batches
CREATE TABLE IF NOT EXISTS cover_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE cover_batches ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE cover_batches ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cover_batches ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE cover_batches ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE cover_batches ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE cover_batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- cover_requests
CREATE TABLE IF NOT EXISTS cover_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES cover_batches(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    original_tutor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'open',
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES cover_batches(id) ON DELETE CASCADE;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS original_tutor_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS claimed_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    related_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    related_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    action_url VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_type VARCHAR(120),
    attachment_size INTEGER,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    sent_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(120);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_size INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP DEFAULT NOW();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- group_chat_reads
CREATE TABLE IF NOT EXISTS group_chat_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(unit_id, user_id)
);
ALTER TABLE group_chat_reads ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE group_chat_reads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE group_chat_reads ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP DEFAULT NOW();

-- password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- tutor_applications
CREATE TABLE IF NOT EXISTS tutor_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    work_experience TEXT,
    maximum_hours INTEGER,
    contract_type VARCHAR(50),
    resume_filename VARCHAR(255),
    resume_mime_type VARCHAR(100),
    resume_data BYTEA,
    custom_answers JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending',
    applied_at TIMESTAMP DEFAULT NOW(),
    invited_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at TIMESTAMP,
    invited_role VARCHAR(20) NOT NULL DEFAULT 'tutor',
    invite_token VARCHAR(255) UNIQUE,
    invite_token_expires_at TIMESTAMP,
    created_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS work_experience TEXT;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS maximum_hours INTEGER;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS resume_filename VARCHAR(255);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS resume_mime_type VARCHAR(100);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS resume_data BYTEA;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP DEFAULT NOW();
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS invited_by_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS invited_role VARCHAR(20) DEFAULT 'tutor';
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255);
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMP;
ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS created_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- availability_reminders (availability deadline reminder log; see migration 002)
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

-- session_reminders (24-hour class reminder log; see migration 002)
CREATE TABLE IF NOT EXISTS session_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    UNIQUE (session_id, tutor_id, occurrence_date)
);

-- unit_memberships may exist with the older two-role check
ALTER TABLE unit_memberships DROP CONSTRAINT IF EXISTS unit_memberships_role_check;
ALTER TABLE unit_memberships ADD CONSTRAINT unit_memberships_role_check
    CHECK (role IN ('coordinator', 'tutor', 'super_tutor'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_units_code ON units(unit_code);
CREATE INDEX IF NOT EXISTS idx_unit_memberships_user ON unit_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_unit ON sessions(unit_id);
CREATE INDEX IF NOT EXISTS idx_session_tutors_tutor ON session_tutors(tutor_id);
CREATE INDEX IF NOT EXISTS idx_session_tutors_pending_reminders
    ON session_tutors(assigned_at)
    WHERE tutor_confirmed IS NULL AND reminder_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_availability_tutor_unit ON availability(tutor_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_tutor ON change_requests(tutor_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_cover_requests_status ON cover_requests(status);
CREATE INDEX IF NOT EXISTS idx_cover_requests_unit ON cover_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_cover_requests_claimed_by ON cover_requests(claimed_by_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

-- Which numbered migrations have been applied (used by `npm run db:migrate`)
CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
);
