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
const adminRoutes = require('./routes/admin.routes');
const botRoutes = require('./routes/bot.routes');

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
          SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2
          UNION
          SELECT 1 FROM session_tutors st JOIN sessions s ON s.id = st.session_id WHERE s.unit_id = $1 AND st.tutor_id = $2
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

// The database schema lives in setup-db.sql (plus db/migrations/). It is no
// longer patched here at start-up: run `npm run db:migrate` after pulling.

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
app.use('/admin', adminRoutes);
app.use('/bot', botRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server only when this file is run directly. Tests import the app with
// Supertest, so they should not open a real network port.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('=================================');
    console.log(`Backend server running`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Database: PostgreSQL (sessioneer_db)`);
    console.log('=================================');
    console.log('Server is now waiting for requests...');
    console.log('Press Ctrl+C to stop');
  });
}

module.exports = { app, server, io };
