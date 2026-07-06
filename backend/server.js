const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();
const { verifyToken, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5001;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected at:', res.rows[0].now);
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
  console.log('change_requests schema OK');
}).catch(err => {
  console.error('Schema update error:', err);
});

// Add fields needed for the Create Unit feature
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

// Works out if a unit's semester has already passed.
// Semester 1 is treated as Jan-Jun, Semester 2 as Jul-Dec.
const isUnitActive = (semester, year) => {
  if (!semester || !year) return true; // not enough info, assume active
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 = Jan

  if (year > currentYear) return true;
  if (year < currentYear) return false;

  const isSem1 = semester.toLowerCase().includes('1');
  if (isSem1) return currentMonth <= 5; // Jan-Jun
  return currentMonth >= 6; // Jul-Dec
};

// ========== AUTH ROUTES (no token required) ==========

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

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful',
      user: formatUser(user),
      token
    });

  } catch (error) {
    console.error('Error logging in:', error);

    res.status(500).json({
      error: 'Failed to log in'
    });
  }
});

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

// ========== UNITS ENDPOINTS (coordinator only) ==========

// Get all units belonging to the logged-in coordinator
app.get('/units', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, unit_code, unit_name, semester, year, campus,
             delivery_mode, enrolment_size, availability_deadline,
             availability_locked, created_at
      FROM units
      WHERE unit_coordinator_id = $1
      ORDER BY year DESC, semester DESC, created_at DESC
      `,
      [req.user.id]
    );

    const units = result.rows.map(u => ({
      id: u.id,
      unitCode: u.unit_code,
      unitName: u.unit_name,
      semester: u.semester,
      year: u.year,
      campus: u.campus,
      deliveryMode: u.delivery_mode,
      enrolmentSize: u.enrolment_size,
      availabilityDeadline: u.availability_deadline,
      availabilityLocked: u.availability_locked,
      isActive: isUnitActive(u.semester, u.year)
    }));

    res.json(units);
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Get a single unit (must belong to the logged-in coordinator)
app.get('/units/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT id, unit_code, unit_name, semester, year, campus,
             delivery_mode, enrolment_size, availability_deadline,
             availability_locked, created_at
      FROM units
      WHERE id = $1 AND unit_coordinator_id = $2
      `,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const u = result.rows[0];
    res.json({
      id: u.id,
      unitCode: u.unit_code,
      unitName: u.unit_name,
      semester: u.semester,
      year: u.year,
      campus: u.campus,
      deliveryMode: u.delivery_mode,
      enrolmentSize: u.enrolment_size,
      availabilityDeadline: u.availability_deadline,
      availabilityLocked: u.availability_locked,
      isActive: isUnitActive(u.semester, u.year)
    });
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// Create a new unit
app.post('/units', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const {
      unitCode,
      unitName,
      semester,
      year,
      campus,
      deliveryMode,
      enrolmentSize,
      availabilityDeadline
    } = req.body;

    if (!unitCode || !unitName || !semester || !year || !deliveryMode) {
      return res.status(400).json({
        error: 'Unit code, unit name, semester, year, and delivery mode are required'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO units
        (unit_coordinator_id, unit_code, unit_name, semester, year,
         campus, delivery_mode, enrolment_size, availability_deadline)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline
      `,
      [
        req.user.id,
        unitCode,
        unitName,
        semester,
        year,
        campus || null,
        deliveryMode,
        enrolmentSize || null,
        availabilityDeadline || null
      ]
    );

    const u = result.rows[0];
    res.status(201).json({
      id: u.id,
      unitCode: u.unit_code,
      unitName: u.unit_name,
      semester: u.semester,
      year: u.year,
      campus: u.campus,
      deliveryMode: u.delivery_mode,
      enrolmentSize: u.enrolment_size,
      availabilityDeadline: u.availability_deadline,
      isActive: isUnitActive(u.semester, u.year)
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// Update an existing unit
app.put('/units/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      unitCode,
      unitName,
      semester,
      year,
      campus,
      deliveryMode,
      enrolmentSize,
      availabilityDeadline
    } = req.body;

    const result = await pool.query(
      `
      UPDATE units
      SET
        unit_code = COALESCE($1, unit_code),
        unit_name = COALESCE($2, unit_name),
        semester = COALESCE($3, semester),
        year = COALESCE($4, year),
        campus = COALESCE($5, campus),
        delivery_mode = COALESCE($6, delivery_mode),
        enrolment_size = COALESCE($7, enrolment_size),
        availability_deadline = COALESCE($8, availability_deadline)
      WHERE id = $9 AND unit_coordinator_id = $10
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline
      `,
      [
        unitCode, unitName, semester, year, campus,
        deliveryMode, enrolmentSize, availabilityDeadline,
        id, req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const u = result.rows[0];
    res.json({
      id: u.id,
      unitCode: u.unit_code,
      unitName: u.unit_name,
      semester: u.semester,
      year: u.year,
      campus: u.campus,
      deliveryMode: u.delivery_mode,
      enrolmentSize: u.enrolment_size,
      availabilityDeadline: u.availability_deadline,
      isActive: isUnitActive(u.semester, u.year)
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// Delete a unit
app.delete('/units/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM units WHERE id = $1 AND unit_coordinator_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json({ success: true, message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

// ========== REQUESTS ENDPOINTS (any logged-in user) ==========

// Get all requests (Tutor view)
app.get('/requests', verifyToken, async (req, res) => {
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
app.post('/requests', verifyToken, async (req, res) => {
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
    
    console.log('New request created:', result.rows[0].id, 'priority:', priorityValue);
    
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
app.patch('/requests/:id', verifyToken, async (req, res) => {
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
    
    console.log('Request updated:', id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Delete request
app.delete('/requests/:id', verifyToken, async (req, res) => {
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
app.get('/sessions', verifyToken, async (req, res) => {
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

// ========== UC ENDPOINTS (coordinator only) ==========

// Get all requests for UC review
app.get('/uc/requests', verifyToken, requireRole('coordinator'), async (req, res) => {
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
app.patch('/uc/requests/:id/review', verifyToken, requireRole('coordinator'), async (req, res) => {
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

    console.log('Request reviewed:', id, status);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error reviewing request:', error);
    res.status(500).json({ error: 'Failed to review request' });
  }
});

// ========== AVAILABILITY ENDPOINTS (any logged-in user) ==========

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
app.get('/availability', verifyToken, async (req, res) => {
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
app.post('/availability/submit', verifyToken, async (req, res) => {
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
    console.log(`Availability submitted: ${tutorEmail} for ${unitCode}`);
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