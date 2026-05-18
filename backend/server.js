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
        cr.created_at as "submittedDate",
        u.name as "tutorName",
        un.unit_code as "unitCode",
        'Normal' as priority,
        '' as "currentSession",
        '' as "preferredSwapTo"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      LEFT JOIN units un ON cr.unit_id = un.id
      ORDER BY cr.created_at DESC
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

    // Insert request
    const result = await pool.query(`
      INSERT INTO change_requests 
      (tutor_id, unit_id, request_type, reason, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        created_at as "submittedDate"
    `, [tutor_id, unit_id, requestType, reason, 'Pending']);

    console.log(' New request created:', result.rows[0].id);

    // Return formatted response matching frontend expectations
    const newRequest = {
      ...result.rows[0],
      tutorName: tutorName || 'Elaine Lee',
      unitCode,
      currentSession,
      preferredSwapTo,
      priority: priority || 'Normal'
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
    const updates = req.body;

    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = COALESCE($1, status),
        review_notes = COALESCE($2, review_notes)
      WHERE id = $3
      RETURNING *
    `, [updates.status, updates.reviewNotes, id]);

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
        u.name as "tutorName",
        un.unit_code as "unitCode",
        'Normal' as priority,
        '' as "currentSession",
        '' as "preferredSwapTo"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      LEFT JOIN units un ON cr.unit_id = un.id
      ORDER BY 
        CASE 
          WHEN cr.status = 'Pending' THEN 0 
          ELSE 1 
        END,
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

    // Get UC user ID (Dr. Sarah Kim)
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
  console.log(`  GET    /requests`);
  console.log(`  POST   /requests`);
  console.log(`  PATCH  /requests/:id`);
  console.log(`  DELETE /requests/:id`);
  console.log(`  GET    /sessions`);
  console.log(`  GET    /uc/requests`);
  console.log(`  PATCH  /uc/requests/:id/review`);
  console.log('=================================');
  console.log('Server is now waiting for requests...');
  console.log('Press Ctrl+C to stop');
});