-- The Sessioneer schema BEFORE migration 001, as it existed on a real
-- database: old setup-db.sql + server.js start-up ALTERs + the three columns
-- that were added by hand. Generated with pg_dump --schema-only.
-- Used only by the migration integration test (INT-16). Do not edit.

CREATE TABLE public.availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tutor_id uuid,
    unit_id uuid,
    day character varying(20) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    preference character varying(50),
    is_submitted boolean DEFAULT false,
    submitted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tutor_id uuid,
    session_id uuid,
    unit_id uuid,
    request_type character varying(50),
    reason text NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    reviewed_by_id uuid,
    reviewed_at timestamp without time zone,
    review_notes text,
    created_at timestamp without time zone DEFAULT now(),
    current_session text,
    preferred_swap_to text,
    priority text DEFAULT 'Normal'::text,
    current_session_id uuid,
    preferred_session_id uuid,
    suggested_session_id uuid
);
CREATE TABLE public.cover_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    created_by_id uuid,
    reason text,
    start_date date,
    end_date date,
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.cover_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid,
    session_id uuid,
    unit_id uuid,
    original_tutor_id uuid,
    reason text,
    status character varying(20) DEFAULT 'open'::character varying,
    created_by_id uuid,
    claimed_by_id uuid,
    claimed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.group_chat_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    user_id uuid,
    last_read_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid,
    recipient_id uuid,
    content text NOT NULL,
    unit_id uuid,
    attachment_url text,
    attachment_name text,
    attachment_type character varying(120),
    attachment_size integer,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    sent_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    notification_type character varying(50),
    title character varying(255) NOT NULL,
    content text NOT NULL,
    related_unit_id uuid,
    related_session_id uuid,
    action_url character varying(255),
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    token_hash character varying(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.session_assign (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    tutor_id uuid,
    unit_id uuid,
    is_draft boolean DEFAULT true,
    status character varying(50),
    tutor_notes text,
    assigned_at timestamp without time zone DEFAULT now(),
    assigned_by_id uuid,
    responded_at timestamp without time zone
);
CREATE TABLE public.session_tutors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    tutor_id uuid,
    tutor_confirmed boolean,
    tutor_reject_reason text,
    created_at timestamp without time zone DEFAULT now(),
    assigned_at timestamp without time zone DEFAULT now(),
    reminder_sent_at timestamp without time zone
);
CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    day character varying(20) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    location character varying(100),
    session_type character varying(50),
    capacity integer,
    required_tutors integer DEFAULT 1 NOT NULL,
    is_assigned boolean DEFAULT false,
    assigned_tutor_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    campus character varying(20),
    status character varying(20) DEFAULT 'Confirmed'::character varying,
    staff_note text,
    tutor_confirmed boolean,
    tutor_reject_reason text,
    session_code character varying(30)
);
CREATE TABLE public.swap_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requesting_tutor_id uuid,
    target_tutor_id uuid,
    current_session_id uuid,
    preferred_session_id uuid,
    notes text,
    status character varying(50) DEFAULT 'pending'::character varying,
    reviewed_by_id uuid,
    reviewed_at timestamp without time zone,
    review_notes text,
    swapped_with_tutor_id uuid,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);
CREATE TABLE public.tutor_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    name character varying(255) NOT NULL,
    last_name character varying(255),
    email character varying(255) NOT NULL,
    phone_number character varying(50),
    work_experience text,
    resume_filename character varying(255),
    resume_mime_type character varying(100),
    resume_data bytea,
    status character varying(20) DEFAULT 'pending'::character varying,
    applied_at timestamp without time zone DEFAULT now(),
    invited_by_id uuid,
    invited_at timestamp without time zone,
    invite_token character varying(255),
    invite_token_expires_at timestamp without time zone,
    created_user_id uuid,
    invited_role character varying(20) DEFAULT 'tutor'::character varying NOT NULL,
    custom_answers jsonb DEFAULT '{}'::jsonb,
    maximum_hours integer,
    contract_type character varying(50)
);
CREATE TABLE public.tutor_unit_markers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    tutor_id uuid,
    priority_tag character varying(50) DEFAULT 'Standard'::character varying,
    internal_notes text,
    created_at timestamp without time zone DEFAULT now(),
    early_access boolean DEFAULT false,
    starred boolean DEFAULT false,
    flagged boolean DEFAULT false,
    tags text[] DEFAULT '{}'::text[]
);
CREATE TABLE public.unit_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    user_id uuid,
    role character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT unit_memberships_role_check CHECK (((role)::text = ANY ((ARRAY['coordinator'::character varying, 'tutor'::character varying, 'super_tutor'::character varying])::text[])))
);
CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_coordinator_id uuid,
    unit_code character varying(20) NOT NULL,
    unit_name character varying(255) NOT NULL,
    semester character varying(20) NOT NULL,
    year integer NOT NULL,
    availability_deadline timestamp without time zone,
    availability_locked boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    campus character varying(20),
    delivery_mode character varying(20),
    enrolment_size integer,
    schedule_locked boolean DEFAULT false,
    schedule_locked_at timestamp without time zone,
    draft_released boolean DEFAULT false,
    application_form jsonb
);
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    last_name character varying(255),
    school_id character varying(50),
    phone_number character varying(20),
    work_experience text,
    maximum_hours integer,
    contract_type character varying(50),
    avatar_url text,
    account_status character varying(20) DEFAULT 'active'::character varying,
    application_status character varying(50),
    applied_at timestamp without time zone,
    approved_at timestamp without time zone,
    approved_by_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    notify_session_updates boolean DEFAULT true,
    notify_request_updates boolean DEFAULT true,
    resume_filename character varying(255),
    resume_mime_type character varying(100),
    resume_data bytea
);
ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cover_batches
    ADD CONSTRAINT cover_batches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.group_chat_reads
    ADD CONSTRAINT group_chat_reads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.group_chat_reads
    ADD CONSTRAINT group_chat_reads_unit_id_user_id_key UNIQUE (unit_id, user_id);
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.session_assign
    ADD CONSTRAINT session_assign_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.session_tutors
    ADD CONSTRAINT session_tutors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.session_tutors
    ADD CONSTRAINT session_tutors_session_id_tutor_id_key UNIQUE (session_id, tutor_id);
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tutor_applications
    ADD CONSTRAINT tutor_applications_invite_token_key UNIQUE (invite_token);
ALTER TABLE ONLY public.tutor_applications
    ADD CONSTRAINT tutor_applications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tutor_unit_markers
    ADD CONSTRAINT tutor_unit_markers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tutor_unit_markers
    ADD CONSTRAINT tutor_unit_markers_unit_id_tutor_id_key UNIQUE (unit_id, tutor_id);
ALTER TABLE ONLY public.unit_memberships
    ADD CONSTRAINT unit_memberships_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.unit_memberships
    ADD CONSTRAINT unit_memberships_unit_id_user_id_role_key UNIQUE (unit_id, user_id, role);
ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE INDEX idx_change_requests_status ON public.change_requests USING btree (status);
CREATE INDEX idx_change_requests_tutor ON public.change_requests USING btree (tutor_id);
CREATE INDEX idx_cover_requests_status ON public.cover_requests USING btree (status);
CREATE INDEX idx_cover_requests_unit ON public.cover_requests USING btree (unit_id);
CREATE INDEX idx_password_reset_tokens_token_hash ON public.password_reset_tokens USING btree (token_hash);
CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);
CREATE INDEX idx_session_tutors_pending_reminders ON public.session_tutors USING btree (assigned_at) WHERE ((tutor_confirmed IS NULL) AND (reminder_sent_at IS NULL));
CREATE INDEX idx_sessions_assigned_tutor ON public.sessions USING btree (assigned_tutor_id);
CREATE INDEX idx_sessions_unit ON public.sessions USING btree (unit_id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_role ON public.users USING btree (role);
ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_current_session_id_fkey FOREIGN KEY (current_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_preferred_session_id_fkey FOREIGN KEY (preferred_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_reviewed_by_id_fkey FOREIGN KEY (reviewed_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_suggested_session_id_fkey FOREIGN KEY (suggested_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.change_requests
    ADD CONSTRAINT change_requests_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE ONLY public.cover_batches
    ADD CONSTRAINT cover_batches_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.cover_batches
    ADD CONSTRAINT cover_batches_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.cover_batches(id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_claimed_by_id_fkey FOREIGN KEY (claimed_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_original_tutor_id_fkey FOREIGN KEY (original_tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);
ALTER TABLE ONLY public.cover_requests
    ADD CONSTRAINT cover_requests_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE ONLY public.group_chat_reads
    ADD CONSTRAINT group_chat_reads_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.group_chat_reads
    ADD CONSTRAINT group_chat_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_session_id_fkey FOREIGN KEY (related_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_related_unit_id_fkey FOREIGN KEY (related_unit_id) REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.session_assign
    ADD CONSTRAINT session_assign_assigned_by_id_fkey FOREIGN KEY (assigned_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.session_assign
    ADD CONSTRAINT session_assign_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);
ALTER TABLE ONLY public.session_assign
    ADD CONSTRAINT session_assign_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.session_assign
    ADD CONSTRAINT session_assign_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE ONLY public.session_tutors
    ADD CONSTRAINT session_tutors_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.session_tutors
    ADD CONSTRAINT session_tutors_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_assigned_tutor_id_fkey FOREIGN KEY (assigned_tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_current_session_id_fkey FOREIGN KEY (current_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_preferred_session_id_fkey FOREIGN KEY (preferred_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_requesting_tutor_id_fkey FOREIGN KEY (requesting_tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_reviewed_by_id_fkey FOREIGN KEY (reviewed_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_swapped_with_tutor_id_fkey FOREIGN KEY (swapped_with_tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_target_tutor_id_fkey FOREIGN KEY (target_tutor_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.tutor_applications
    ADD CONSTRAINT tutor_applications_created_user_id_fkey FOREIGN KEY (created_user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.tutor_applications
    ADD CONSTRAINT tutor_applications_invited_by_id_fkey FOREIGN KEY (invited_by_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.tutor_applications
    ADD CONSTRAINT tutor_applications_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tutor_unit_markers
    ADD CONSTRAINT tutor_unit_markers_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tutor_unit_markers
    ADD CONSTRAINT tutor_unit_markers_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.unit_memberships
    ADD CONSTRAINT unit_memberships_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.unit_memberships
    ADD CONSTRAINT unit_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_unit_coordinator_id_fkey FOREIGN KEY (unit_coordinator_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_approved_by_id_fkey FOREIGN KEY (approved_by_id) REFERENCES public.users(id);
