const express = require('express');
const cors = require('cors');
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

const app = express();
const PORT = process.env.PORT || 5001;

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
  END $$;
`).then(() => {
  console.log('messages unit_id column OK');
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

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
app.use('/', requestsRoutes);       // /requests, /uc/requests, /sessions (legacy)
app.use('/availability', availabilityRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Backend server running`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Database: PostgreSQL (sessioneer_db)`);
  console.log('=================================');
  console.log('Server is now waiting for requests...');
  console.log('Press Ctrl+C to stop');
});