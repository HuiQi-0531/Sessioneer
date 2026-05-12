const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Path to db.json
const dbPath = path.join(__dirname, 'db.json');

// Helper function to read db
const readDB = () => {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading db.json:', error);
    return { requests: [], sessions: [] };
  }
};

// Helper function to write db
const writeDB = (data) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing db.json:', error);
  }
};

// Initialize db.json if it doesn't exist
if (!fs.existsSync(dbPath)) {
  console.log('📝 Creating db.json...');
  writeDB({
    requests: [],
    sessions: [
      { id: 1, value: "IFB388 - Mon TUT-01 8am Tutorial 01" },
      { id: 2, value: "IFB388 - Mon TUT-02 10am Tutorial 02" },
      { id: 3, value: "CAB201 - Tue TUT-01 9am Tutorial 01" },
      { id: 4, value: "CAB201 - Wed TUT-02 11am Tutorial 02" },
      { id: 5, value: "IFN503 - Wed TUT-03 2pm Tutorial 03" },
      { id: 6, value: "ITB100 - Thu TUT-01 1pm Tutorial 01" },
      { id: 7, value: "MXB107 - Fri TUT-02 3pm Tutorial 02" }
    ]
  });
}

// ========== ROUTES ==========

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Get all requests
app.get('/requests', (req, res) => {
  try {
    const db = readDB();
    res.json(db.requests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Create new request
app.post('/requests', (req, res) => {
  try {
    const db = readDB();
    
    const newRequest = {
      id: Date.now(),
      ...req.body,
      submittedDate: new Date().toISOString(),
      status: 'Pending'
    };
    
    db.requests.push(newRequest);
    
    // Sort: Urgent first, then by date
    db.requests.sort((a, b) => {
      if (a.priority === 'Urgent' && b.priority === 'Normal') return -1;
      if (a.priority === 'Normal' && b.priority === 'Urgent') return 1;
      return new Date(b.submittedDate) - new Date(a.submittedDate);
    });
    
    writeDB(db);
    console.log('✅ New request created:', newRequest.id);
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Update request
app.patch('/requests/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    
    const index = db.requests.findIndex(req => req.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    db.requests[index] = { ...db.requests[index], ...req.body };
    writeDB(db);
    
    console.log('✅ Request updated:', id);
    res.json(db.requests[index]);
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Delete request
app.delete('/requests/:id', (req, res) => {
  try {
    const db = readDB();
    const id = parseInt(req.params.id);
    
    const initialLength = db.requests.length;
    db.requests = db.requests.filter(req => req.id !== id);
    
    if (db.requests.length === initialLength) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    writeDB(db);
    console.log('🗑️ Request deleted:', id);
    res.json({ success: true, message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

// Get available sessions
app.get('/sessions', (req, res) => {
  try {
    const db = readDB();
    res.json(db.sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server - THIS KEEPS IT RUNNING
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`✅ Backend server running`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📊 Database: ${dbPath}`);
  console.log('=================================');
  console.log('Available endpoints:');
  console.log(`  GET    /health`);
  console.log(`  GET    /requests`);
  console.log(`  POST   /requests`);
  console.log(`  PATCH  /requests/:id`);
  console.log(`  DELETE /requests/:id`);
  console.log(`  GET    /sessions`);
  console.log('=================================');
  console.log('Server is now waiting for requests...');
  console.log('Press Ctrl+C to stop');
});