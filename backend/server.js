const express = require('express');
const cors = require('cors');
const http = require('http');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const pool = require('./db');

const authRoutes = require('./routes/auth.routes');
const unitsRoutes = require('./routes/units.routes');
const sessionsRoutes = require('./routes/sessions.routes');
const tutorsRoutes = require('./routes/tutors.routes');
const requestsRoutes = require('./routes/requests.routes');
const availabilityRoutes = require('./routes/availability.routes');
const messagesRoutes = require('./routes/messages.routes');
const unitMessagesRoutes = require('./routes/unitMessages.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const profileRoutes = require('./routes/profile.routes');
const tutorApplicationsRoutes = require('./routes/tutorApplications.routes');
const coverRoutes = require('./routes/cover.routes');
const jobsRoutes = require('./routes/jobs.routes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);

  socket.on('join-unit', async (unitId) => {
    try {
      if (!unitId) return;

      const accessResult = await pool.query(
        `
        SELECT 1 WHERE EXISTS (
          SELECT 1 FROM units WHERE id = $1 AND unit_coordinator_id = $2
          UNION
          SELECT 1 FROM availability WHERE unit_id = $1 AND tutor_id = $2
          UNION
          SELECT 1 FROM sessions WHERE unit_id = $1 AND assigned_tutor_id = $2
        )
        `,
        [unitId, socket.user.id]
      );

      if (accessResult.rows.length > 0) {
        socket.join(`unit:${unitId}`);
      }
    } catch (error) {
      console.error('Socket join-unit error:', error);
    }
  });
});

app.set('io', io);

// Add missing columns if they don't exist (existing tables from earlier iterations)
pool.query(`
  DO $$ 
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'change_requests' AND column_name = 'current_session'
    ) THEN
      ALTER TABLE change_requests ADD COLUMN current_session TEXT;
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'change_requests' AND column_name = 'preferred_swap_to'
    ) THEN
      ALTER TABLE change_requests ADD COLUMN preferred_swap_to TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'change_requests' AND column_name = 'priority'
    ) THEN
      ALTER TABLE change_requests ADD COLUMN priority TEXT DEFAULT 'Normal';
    END IF;
  END $$;
`).then(() => {
  console.log('change_requests schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  DO $$ 
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'units' AND column_name = 'campus'
    ) THEN
      ALTER TABLE units ADD COLUMN campus VARCHAR(20);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'units' AND column_name = 'delivery_mode'
    ) THEN
      ALTER TABLE units ADD COLUMN delivery_mode VARCHAR(20);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'units' AND column_name = 'enrolment_size'
    ) THEN
      ALTER TABLE units ADD COLUMN enrolment_size INTEGER;
    END IF;
  END $$;
`).then(() => {
  console.log('units schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  DO $$ 
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'campus'
    ) THEN
      ALTER TABLE sessions ADD COLUMN campus VARCHAR(20);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'status'
    ) THEN
      ALTER TABLE sessions ADD COLUMN status VARCHAR(20) DEFAULT 'Confirmed';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'staff_note'
    ) THEN
      ALTER TABLE sessions ADD COLUMN staff_note TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'tutor_confirmed'
    ) THEN
      ALTER TABLE sessions ADD COLUMN tutor_confirmed BOOLEAN DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'tutor_reject_reason'
    ) THEN
      ALTER TABLE sessions ADD COLUMN tutor_reject_reason TEXT;
    END IF;
  END $$;
`).then(() => {
  console.log('sessions schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS tutor_unit_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    tutor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    priority_tag VARCHAR(50) DEFAULT 'Standard',
    internal_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(unit_id, tutor_id)
  );
`).then(() => {
  console.log('tutor_unit_markers schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS unit_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('coordinator', 'tutor')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(unit_id, user_id, role)
  );

  INSERT INTO unit_memberships (unit_id, user_id, role)
  SELECT id, unit_coordinator_id, 'coordinator'
  FROM units
  WHERE unit_coordinator_id IS NOT NULL
  ON CONFLICT (unit_id, user_id, role) DO NOTHING;

  INSERT INTO unit_memberships (unit_id, user_id, role)
  SELECT DISTINCT unit_id, tutor_id, 'tutor'
  FROM availability
  WHERE tutor_id IS NOT NULL AND unit_id IS NOT NULL
  ON CONFLICT (unit_id, user_id, role) DO NOTHING;

  INSERT INTO unit_memberships (unit_id, user_id, role)
  SELECT DISTINCT unit_id, assigned_tutor_id, 'tutor'
  FROM sessions
  WHERE assigned_tutor_id IS NOT NULL AND unit_id IS NOT NULL
  ON CONFLICT (unit_id, user_id, role) DO NOTHING;

  -- Widen the role check to allow 'super_tutor' (Super Tutor = tutor who can
  -- also be assigned to Lecture / Consultation sessions). Table may already
  -- exist with the old constraint from before this feature, so drop + re-add.
  ALTER TABLE unit_memberships DROP CONSTRAINT IF EXISTS unit_memberships_role_check;
  ALTER TABLE unit_memberships ADD CONSTRAINT unit_memberships_role_check
    CHECK (role IN ('coordinator', 'tutor', 'super_tutor'));
`).then(() => {
  console.log('unit_memberships schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_unit_markers' AND column_name = 'tags'
    ) THEN
      ALTER TABLE tutor_unit_markers ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
  END $$;
`).then(() => {
  console.log('tutor_unit_markers tags column OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'unit_id'
    ) THEN
      ALTER TABLE messages ADD COLUMN unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'attachment_url'
    ) THEN
      ALTER TABLE messages ADD COLUMN attachment_url TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'attachment_name'
    ) THEN
      ALTER TABLE messages ADD COLUMN attachment_name TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'attachment_type'
    ) THEN
      ALTER TABLE messages ADD COLUMN attachment_type VARCHAR(120);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'messages' AND column_name = 'attachment_size'
    ) THEN
      ALTER TABLE messages ADD COLUMN attachment_size INTEGER;
    END IF;
  END $$;
`).then(() => {
  console.log('messages attachment columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS group_chat_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(unit_id, user_id)
  );
`).then(() => {
  console.log('group_chat_reads schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens(user_id);

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
    ON password_reset_tokens(token_hash);
`).then(() => {
  console.log('password_reset_tokens schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Safety net: notifications table should already exist from the original
// schema, but create it if a deployment is missing it.
pool.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    related_unit_id UUID REFERENCES units(id),
    related_session_id UUID REFERENCES sessions(id),
    action_url VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
`).then(() => {
  console.log('notifications schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Add schedule locking columns to units if they don't exist
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'units' AND column_name = 'schedule_locked'
    ) THEN
      ALTER TABLE units ADD COLUMN schedule_locked BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'units' AND column_name = 'schedule_locked_at'
    ) THEN
      ALTER TABLE units ADD COLUMN schedule_locked_at TIMESTAMP;
    END IF;
  END $$;
`).then(() => {
  console.log('units schedule_locked columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Draft-release gate: tutors can't see the timetable until the UC releases the
// draft (or the schedule is finalised/locked, which counts as released too).
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'units' AND column_name = 'draft_released'
    ) THEN
      ALTER TABLE units ADD COLUMN draft_released BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_unit_markers' AND column_name = 'early_access'
    ) THEN
      ALTER TABLE tutor_unit_markers ADD COLUMN early_access BOOLEAN DEFAULT FALSE;
    END IF;
  END $$;
`).then(() => {
  console.log('units draft_released / tutor_unit_markers early_access columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Coordinator "star" (favourite/priority pick) and "flag" (risk/caution) markers on tutors.
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_unit_markers' AND column_name = 'starred'
    ) THEN
      ALTER TABLE tutor_unit_markers ADD COLUMN starred BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_unit_markers' AND column_name = 'flagged'
    ) THEN
      ALTER TABLE tutor_unit_markers ADD COLUMN flagged BOOLEAN DEFAULT FALSE;
    END IF;
  END $$;
`).then(() => {
  console.log('tutor_unit_markers starred / flagged columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Add notification preference columns to users if they don't exist
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'last_name'
    ) THEN
      ALTER TABLE users ADD COLUMN last_name VARCHAR(255);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'notify_session_updates'
    ) THEN
      ALTER TABLE users ADD COLUMN notify_session_updates BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'notify_request_updates'
    ) THEN
      ALTER TABLE users ADD COLUMN notify_request_updates BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'avatar_url'
    ) THEN
      ALTER TABLE users ADD COLUMN avatar_url TEXT;
    END IF;
  END $$;
`).then(() => {
  console.log('users profile columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS session_tutors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    tutor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tutor_confirmed BOOLEAN DEFAULT NULL,
    tutor_reject_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    assigned_at TIMESTAMP DEFAULT NOW(),
    reminder_sent_at TIMESTAMP,
    UNIQUE(session_id, tutor_id)
  );

  ALTER TABLE session_tutors
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP DEFAULT NOW();

  ALTER TABLE session_tutors
    ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;

  UPDATE session_tutors
  SET assigned_at = COALESCE(created_at, NOW())
  WHERE assigned_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_session_tutors_pending_reminders
    ON session_tutors(assigned_at)
    WHERE tutor_confirmed IS NULL AND reminder_sent_at IS NULL;
`).then(() => {
  console.log('session_tutors reminder schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Tutor application/onboarding tables
pool.query(`
  CREATE TABLE IF NOT EXISTS tutor_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    work_experience TEXT,
    resume_filename VARCHAR(255),
    resume_mime_type VARCHAR(100),
    resume_data BYTEA,
    status VARCHAR(20) DEFAULT 'pending',
    applied_at TIMESTAMP DEFAULT NOW(),
    invited_by_id UUID REFERENCES users(id),
    invited_at TIMESTAMP,
    invite_token VARCHAR(255) UNIQUE,
    invite_token_expires_at TIMESTAMP,
    created_user_id UUID REFERENCES users(id)
  );
`).then(() => {
  console.log('tutor_applications schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_applications' AND column_name = 'unit_id'
    ) THEN
      ALTER TABLE tutor_applications ADD COLUMN unit_id UUID REFERENCES units(id) ON DELETE CASCADE;
    END IF;
  END $$;
`).then(() => {
  console.log('tutor_applications unit link OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_applications' AND column_name = 'last_name'
    ) THEN
      ALTER TABLE tutor_applications ADD COLUMN last_name VARCHAR(255);
    END IF;
  END $$;
`).then(() => {
  console.log('tutor_applications name columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Which unit role the coordinator picked when inviting this applicant -
// 'tutor' or 'super_tutor'. Applied to unit_memberships once the invite is
// accepted (or immediately, for a direct-invite of an existing user).
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tutor_applications' AND column_name = 'invited_role'
    ) THEN
      ALTER TABLE tutor_applications ADD COLUMN invited_role VARCHAR(20) NOT NULL DEFAULT 'tutor';
    END IF;
  END $$;
`).then(() => {
  console.log('tutor_applications invited_role column OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Resume fields on the real users table too, so an accepted applicant's
// resume stays visible on their tutor profile after their account exists.
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'resume_filename'
    ) THEN
      ALTER TABLE users ADD COLUMN resume_filename VARCHAR(255);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'resume_mime_type'
    ) THEN
      ALTER TABLE users ADD COLUMN resume_mime_type VARCHAR(100);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'resume_data'
    ) THEN
      ALTER TABLE users ADD COLUMN resume_data BYTEA;
    END IF;
  END $$;
`).then(() => {
  console.log('users resume columns OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Cover-request broadcast tables: a UC selects sessions an absent tutor
// can't cover, they get broadcast to every other tutor on the unit, and the
// first one to claim each session gets it (first come, first served).
pool.query(`
  CREATE TABLE IF NOT EXISTS cover_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    created_by_id UUID REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS cover_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID REFERENCES cover_batches(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
    original_tutor_id UUID REFERENCES users(id),
    claimed_by_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'open',
    reason TEXT,
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    claimed_at TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_cover_requests_status ON cover_requests(status);
  CREATE INDEX IF NOT EXISTS idx_cover_requests_unit ON cover_requests(unit_id);
`).then(() => {
  console.log('cover_requests schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint (no token required)
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW(), current_database()');
    res.json({
      status: 'ok',
      message: 'Backend is running',
      database: result.rows[0].current_database,
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed'
    });
  }
});

// Route modules
app.use('/auth', authRoutes);
app.use('/units', unitsRoutes);
app.use('/units/:unitId/sessions', sessionsRoutes);
app.use('/units/:unitId/tutors', tutorsRoutes);
app.use('/units/:unitId/messages', unitMessagesRoutes);
app.use('/messages', messagesRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/', dashboardRoutes);
app.use('/profile', profileRoutes);
app.use('/tutor-applications', tutorApplicationsRoutes);
app.use('/', requestsRoutes);       // /requests, /uc/requests, /sessions (legacy)
app.use('/', coverRoutes);          // /cover-requests, /uc/cover-requests
app.use('/availability', availabilityRoutes);
app.use('/jobs', jobsRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
server.listen(PORT, () => {
  console.log('=================================');
  console.log(`Backend server running`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Database: PostgreSQL (sessioneer_db)`);
  console.log('=================================');
  console.log('Server is now waiting for requests...');
  console.log('Press Ctrl+C to stop');
});