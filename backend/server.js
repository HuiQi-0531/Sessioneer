const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error(' Database connection error:', err);
  } else {
    console.log(' Database connected at:', res.rows[0].now);
  }
});

// Add missing columns if they don't exist
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
  console.log('✓ Database schema checked and updated');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Middleware
app.use(cors());
app.use(express.json());

// ========== AUTH HELPERS ==========

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, originalHash] = storedHash.split(':');
  const originalHashBuffer = Buffer.from(originalHash, 'hex');
  const inputHashBuffer = crypto.scryptSync(password, salt, 64);

  return crypto.timingSafeEqual(originalHashBuffer, inputHashBuffer);
};

const formatUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

// ========== AUTH ROUTES ==========

app.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, role, password, confirmPassword } = req.body;

    if (!fullName || !email || !role || !password || !confirmPassword) {
      return res.status(400).json({
        error: 'Please fill in all fields'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Passwords do not match'
      });
    }

    const normalizedRole = role === 'Coordinator'
      ? 'coordinator'
      : 'tutor';

    const passwordHash = hashPassword(password);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, role, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
      `,
      [
        fullName,
        email.toLowerCase(),
        normalizedRole,
        passwordHash
      ]
    );

    res.status(201).json({
      message: 'Account created successfully',
      user: formatUser(result.rows[0])
    });

  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Email is already registered'
      });
    }

    console.error('Error registering user:', error);

    res.status(500).json({
      error: 'Failed to create account'
    });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Please enter your email and password'
      });
    }

    const result = await pool.query(
      `
      SELECT id, name, email, role, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    res.json({
      message: 'Login successful',
      user: formatUser(user)
    });

  } catch (error) {
    console.error('Error logging in:', error);

    res.status(500).json({
      error: 'Failed to log in'
    });
  }
});

// Health check endpoint
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

// Get all requests (Tutor view)
app.get('/requests', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cr.id,
        cr.request_type as "requestType",
        cr.reason,
        cr.status,
        cr.review_notes as "reviewNotes",
        cr.created_at as "submittedDate",
        cr.current_session as "currentSession",
        cr.preferred_swap_to as "preferredSwapTo",
        cr.priority,
        u.name as "tutorName",
        un.unit_code as "unitCode"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      LEFT JOIN units un ON cr.unit_id = un.id
      ORDER BY 
        CASE WHEN LOWER(cr.priority) = 'urgent' THEN 0 ELSE 1 END,
        cr.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Create new request
app.post('/requests', async (req, res) => {
  try {
    const {
      tutorName,
      unitCode,
      requestType,
      priority,
      currentSession,
      preferredSwapTo,
      reason
    } = req.body;

    // Get tutor_id (for now, get Elaine Lee's ID)
    const tutorResult = await pool.query(
      'SELECT id FROM users WHERE name = $1 LIMIT 1',
      [tutorName || 'Elaine Lee']
    );

    const tutor_id = tutorResult.rows[0]?.id;

    // Get unit_id
    const unitResult = await pool.query(
      'SELECT id FROM units WHERE unit_code = $1 LIMIT 1',
      [unitCode]
    );

    const unit_id = unitResult.rows[0]?.id;
    
    const priorityValue = priority || 'Normal';

    // Insert request
    const result = await pool.query(`
      INSERT INTO change_requests 
      (tutor_id, unit_id, request_type, reason, status, current_session, preferred_swap_to, priority, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        current_session as "currentSession",
        preferred_swap_to as "preferredSwapTo",
        created_at as "submittedDate"
    `, [tutor_id, unit_id, requestType, reason, 'Pending', currentSession, preferredSwapTo, priorityValue]);
    
    console.log(' New request created:', result.rows[0].id, 'priority:', priorityValue);
    
    const newRequest = {
      ...result.rows[0],
      tutorName: tutorName || 'Elaine Lee',
      unitCode,
    };

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Update request
app.patch('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;
    
    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = COALESCE($1, status),
        review_notes = COALESCE($2, review_notes)
      WHERE id = $3
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        review_notes as "reviewNotes",
        current_session as "currentSession",
        preferred_swap_to as "preferredSwapTo",
        created_at as "submittedDate"
    `, [status, reviewNotes, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    console.log('✓ Request updated:', id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Delete request
app.delete('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM change_requests WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    console.log('Request deleted:', id);
    res.json({ success: true, message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

// Get available sessions
app.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.*,
        u.name as assigned_tutor_name,
        un.unit_code
      FROM sessions s
      LEFT JOIN users u ON s.assigned_tutor_id = u.id
      LEFT JOIN units un ON s.unit_id = un.id
      ORDER BY s.day, s.start_time
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// ========== UC ENDPOINTS ==========

// Get all requests for UC review
app.get('/uc/requests', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cr.id,
        cr.request_type as "requestType",
        cr.reason,
        cr.status,
        cr.review_notes as "reviewNotes",
        cr.created_at as "submittedDate",
        cr.current_session as "currentSession",
        cr.preferred_swap_to as "preferredSwapTo",
        cr.priority,
        u.name as "tutorName",
        un.unit_code as "unitCode"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      LEFT JOIN units un ON cr.unit_id = un.id
      ORDER BY 
        CASE WHEN cr.status = 'Pending' THEN 0 ELSE 1 END,
        CASE WHEN LOWER(cr.priority) = 'urgent' THEN 0 ELSE 1 END,
        cr.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching UC requests:', error);
    res.status(500).json({ error: 'Failed to fetch UC requests' });
  }
});

// Review a request (approve/reject/suggest)
app.patch('/uc/requests/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;
    
    const ucResult = await pool.query(
      "SELECT id FROM users WHERE role = 'coordinator' LIMIT 1"
    );
    const reviewed_by_id = ucResult.rows[0]?.id;

    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = $1, 
        review_notes = $2, 
        reviewed_by_id = $3,
        reviewed_at = NOW()
      WHERE id = $4
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        review_notes as "reviewNotes",
        created_at as "submittedDate"
    `, [status, reviewNotes, reviewed_by_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    console.log(' Request reviewed:', id, status);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error reviewing request:', error);
    res.status(500).json({ error: 'Failed to review request' });
  }
});

// ========== AVAILABILITY ENDPOINTS ==========

// Helper: convert "8am"/"12pm" to TIME string "08:00:00"/"12:00:00"
const slotToTime = (slot) => {
  const match = slot.match(/^(\d+)(am|pm)$/);
  if (!match) return null;
  let hour = parseInt(match[1]);
  const period = match[2];
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:00:00`;
};

// Helper: convert TIME string "08:00:00" back to "8am"
const timeToSlot = (timeStr) => {
  const [h] = timeStr.split(':');
  const hour = parseInt(h);
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
};

// Helper: normalise day "Monday" -> "MON"
const DAY_MAP = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI',
  MON: 'MON', TUE: 'TUE', WED: 'WED', THU: 'THU', FRI: 'FRI',
};

/**
 * GET /availability/tutors?unitCode=FIT3077
 * UC page uses this to get all tutors, their submission status,
 * and their submitted availability slots.
 */
app.get('/availability', async (req, res) => {
  try {
    const { unitCode } = req.query;

    const unitResult = await pool.query(
      'SELECT id FROM units WHERE unit_code = $1 LIMIT 1',
      [unitCode || 'FIT3077']
    );
    if (!unitResult.rows.length) return res.status(404).json({ error: 'Unit not found' });
    const unit_id = unitResult.rows[0].id;

    // All tutors
    const tutorResult = await pool.query(
      "SELECT id, name FROM users WHERE role = 'tutor' ORDER BY name"
    );
    const tutors = tutorResult.rows.map(t => ({ id: t.id, name: t.name, icon: null }));

    // Who has submitted
    const submittedResult = await pool.query(
      'SELECT DISTINCT tutor_id FROM availability WHERE unit_id = $1 AND is_submitted = TRUE',
      [unit_id]
    );
    const submittedIds = new Set(submittedResult.rows.map(r => r.tutor_id));

    const submissionStatus = tutors.map(t => ({
      tutorId: t.id,
      submitted: submittedIds.has(t.id),
    }));

    // All submitted availability rows
    const availResult = await pool.query(
      'SELECT tutor_id, day, start_time, preference FROM availability WHERE unit_id = $1 AND is_submitted = TRUE',
      [unit_id]
    );

    // Build { MON: { tutorId: { "8am": "preferred" } }, ... }
    const availability = { MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {} };
    for (const row of availResult.rows) {
      const day = DAY_MAP[row.day];
      //console.log('DEBUG:', row.day, row.start_time, typeof row.start_time);
      if (!day) continue;
      const slot = timeToSlot(row.start_time);
      if (!availability[day][row.tutor_id]) availability[day][row.tutor_id] = {};
      availability[day][row.tutor_id][slot] = row.preference;
    }

    res.json({ tutors, submissionStatus, availability });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

/**
 * POST /availability/submit
 * Tutor submits their availability.
 * Body: { tutorEmail, unitCode, slots: { "Monday-8:00am": "preferred", ... } }
 */
app.post('/availability/submit', async (req, res) => {
  const client = await pool.connect();
  try {
    const { tutorEmail, unitCode, slots } = req.body;
    if (!tutorEmail || !unitCode || !slots) {
      return res.status(400).json({ error: 'tutorEmail, unitCode, and slots are required' });
    }

    const tutorResult = await client.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1', [tutorEmail]
    );
    if (!tutorResult.rows.length) return res.status(404).json({ error: 'Tutor not found' });
    const tutor_id = tutorResult.rows[0].id;

    const unitResult = await client.query(
      'SELECT id FROM units WHERE unit_code = $1 LIMIT 1', [unitCode]
    );
    if (!unitResult.rows.length) return res.status(404).json({ error: 'Unit not found' });
    const unit_id = unitResult.rows[0].id;

    await client.query('BEGIN');

    // Delete old slots for this tutor + unit
    await client.query(
      'DELETE FROM availability WHERE tutor_id = $1 AND unit_id = $2',
      [tutor_id, unit_id]
    );

    // Insert new slots
    // Key format from TutorAvailability.jsx localStorage: "Monday-8:00am"
    for (const [key, preference] of Object.entries(slots)) {
      const dashIdx = key.indexOf('-');
      if (dashIdx === -1) continue;
      const dayRaw  = key.slice(0, dashIdx);   // "Monday"
      const timeRaw = key.slice(dashIdx + 1);  // "8:00am"

      const day = DAY_MAP[dayRaw];
      if (!day) continue;
      if (!['preferred', 'available', 'avoid'].includes(preference)) continue;

      // Convert "8:00am" -> "08:00:00", end time is start + 1 hour
      const timeMatch = timeRaw.match(/^(\d+):(\d+)(am|pm)$/);
      if (!timeMatch) continue;
      let hour = parseInt(timeMatch[1]);
      const period = timeMatch[3];
      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      const startTime = `${String(hour).padStart(2, '0')}:00:00`;
      const endTime   = `${String(hour + 1).padStart(2, '0')}:00:00`;

      await client.query(`
        INSERT INTO availability (tutor_id, unit_id, day, start_time, end_time, preference, is_submitted, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
      `, [tutor_id, unit_id, day, startTime, endTime, preference]);
    }

    await client.query('COMMIT');
    console.log(`✓ Availability submitted: ${tutorEmail} for ${unitCode}`);
    res.status(201).json({ success: true, message: 'Availability submitted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting availability:', error);
    res.status(500).json({ error: 'Failed to submit availability' });
  } finally {
    client.release();
  }
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log('=================================');
  console.log(` Backend server running`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(`  Database: PostgreSQL (sessioneer_db)`);
  console.log('=================================');
  console.log('Available endpoints:');
  console.log(`  GET    /health`);
  console.log(`  POST   /auth/register`);
  console.log(`  POST   /auth/login`);
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