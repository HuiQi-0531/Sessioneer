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
  END $$;
`).then(() => {
  console.log('sessions schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Create the tutor_unit_markers table if it doesn't exist yet.
// Stores per-unit priority tags and internal notes for tutors
// (used by the Tutors page and later by the schedule builder).
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
  console.log('Available endpoints:');
  console.log(`  GET    /health`);
  console.log(`  POST   /auth/register`);
  console.log(`  POST   /auth/login`);
  console.log(`  GET    /units`);
  console.log(`  GET    /units/:id`);
  console.log(`  POST   /units`);
  console.log(`  PUT    /units/:id`);
  console.log(`  DELETE /units/:id`);
  console.log(`  GET    /units/:unitId/sessions`);
  console.log(`  POST   /units/:unitId/sessions`);
  console.log(`  PUT    /units/:unitId/sessions/:sessionId`);
  console.log(`  DELETE /units/:unitId/sessions/:sessionId`);
  console.log(`  POST   /units/:unitId/sessions/import`);
  console.log(`  GET    /units/:unitId/tutors`);
  console.log(`  PUT    /units/:unitId/tutors/:tutorId/marker`);
  console.log(`  GET    /requests`);
  console.log(`  POST   /requests`);
  console.log(`  PATCH  /requests/:id`);
  console.log(`  DELETE /requests/:id`);
  console.log(`  GET    /sessions`);
  console.log(`  GET    /uc/requests`);
  console.log(`  PATCH  /uc/requests/:id/review`);
  console.log(`  GET    /availability`);
  console.log(`  POST   /availability/submit`);
  console.log('=================================');
  console.log('Server is now waiting for requests...');
  console.log('Press Ctrl+C to stop');
});