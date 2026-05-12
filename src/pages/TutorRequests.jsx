import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/TutorRequests.css';

const TutorRequests = () => {
  const [showModal, setShowModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requests, setRequests] = useState([]);
  const [errors, setErrors] = useState({});
  
  // Form state
  const [formData, setFormData] = useState({
    requestType: 'Session swap',
    priority: 'Normal',
    currentSession: '',
    preferredSwapTo: '',
    reason: ''
  });

  // Dummy data for dropdowns
  const requestTypes = ['Session swap', 'Session change'];
  const priorities = ['Normal', 'Urgent'];
  
  const availableSessions = [
    'IFB388 - Mon TUT-01 8am Tutorial 01',
    'IFB388 - Mon TUT-02 10am Tutorial 02',
    'CAB201 - Tue TUT-01 9am Tutorial 01',
    'CAB201 - Wed TUT-02 11am Tutorial 02',
    'IFN503 - Wed TUT-03 2pm Tutorial 03',
    'ITB100 - Thu TUT-01 1pm Tutorial 01',
    'MXB107 - Fri TUT-02 3pm Tutorial 02'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = () => {
    // Validation - check if required fields are filled
    const newErrors = {};
    
    if (!formData.currentSession) {
      newErrors.currentSession = 'Please select a current session';
    }
    
    if (!formData.reason.trim()) {
      newErrors.reason = 'Please provide a reason for your request';
    }
    
    // If there are errors, show them and don't submit
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Clear errors
    setErrors({});

    // Extract unit code from session (format: "IFB388 - Mon TUT-01 8am Tutorial 01")
    const extractUnitCode = (session) => {
      if (!session) return 'UNKNOWN';
      const match = session.match(/^([A-Z]{3}\d{3})/);
      return match ? match[1] : 'UNKNOWN';
    };
    
    const unitCode = extractUnitCode(formData.currentSession);
    
    // Create new request object
    const newRequest = {
      id: Date.now(),
      unitCode: unitCode,
      submittedDate: new Date(), // Store as Date object for time ago calculation
      requestType: formData.requestType,
      priority: formData.priority,
      currentSession: formData.currentSession,
      preferredSwapTo: formData.preferredSwapTo,
      reason: formData.reason,
      status: 'Pending'
    };

    // Add to requests list (Urgent requests go to top)
    setRequests(prev => {
      const newList = [newRequest, ...prev];
      // Sort: Urgent first, then Normal
      return newList.sort((a, b) => {
        if (a.priority === 'Urgent' && b.priority === 'Normal') return -1;
        if (a.priority === 'Normal' && b.priority === 'Urgent') return 1;
        return 0;
      });
    });

    // Show success message
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);

    // Close modal and reset form
    setShowModal(false);
    setFormData({
      requestType: 'Session swap',
      priority: 'Normal',
      currentSession: '',
      preferredSwapTo: '',
      reason: ''
    });
  };

  const handleCancel = () => {
    setShowModal(false);
    setErrors({});
    setFormData({
      requestType: 'Session swap',
      priority: 'Normal',
      currentSession: '',
      preferredSwapTo: '',
      reason: ''
    });
  };

  const handleDelete = (requestId) => {
    if (window.confirm('Are you sure you want to delete this request?')) {
      setRequests(prev => prev.filter(req => req.id !== requestId));
    }
  };

  // Calculate time ago
  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const submitTime = new Date(timestamp);
    const diffMs = now - submitTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    // For older dates, show the date
    return submitTime.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo">
            <span className="logo-icon">S</span>
          </div>
          <h2 className="brand-name">Sessioneer</h2>
        </div>

        <nav className="navigation">
          <Link to="/" className="nav-item">Dashboard</Link>
          <Link to="/sessions" className="nav-item">Sessions</Link>
          <Link to="/availability" className="nav-item">Availability</Link>
          <a href="#schedule-builder" className="nav-item">Schedule</a>
          <Link to="/requests" className="nav-item active">Requests</Link>
          <a href="#messages" className="nav-item">Messages</a>
        </nav>

        <div className="user-profile">
          <div className="user-avatar">L</div>
          <div className="user-info">
            <p className="user-name">Elaine Lee</p>
            <p className="user-role">Tutor</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <h1>Request & Swap</h1>
          <button className="notification-btn">🔔</button>
        </header>

        <div className="requests-content">
          <div className="requests-header">
            <div>
              <h2 className="section-title">Request & Swap Status</h2>
              <div className="status-legend">
                <div className="legend-item">
                  <span className="legend-dot changed"></span>
                  <span>Changed</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot swap"></span>
                  <span>Swap</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot pending"></span>
                  <span>Pending</span>
                </div>
              </div>
            </div>
            <button className="add-request-btn" onClick={() => setShowModal(true)}>
              + Request
            </button>
          </div>

          {/* Empty State or Requests List */}
          {requests.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No requests yet</p>
              <p className="empty-subtitle">Click "+ Request" to create your first swap or change request</p>
            </div>
          ) : (
            <div className="requests-list">
              {requests.map(request => (
                <div key={request.id} className={`request-card ${request.priority === 'Urgent' ? 'urgent-card' : ''}`}>
                  <div className="request-card-header">
                    <div className="request-title">
                      <h3>{request.unitCode}</h3>
                      <p className="request-date">Submitted {getTimeAgo(request.submittedDate)}</p>
                    </div>
                    <div className="header-actions">
                      <div className="request-badges">
                        {request.priority === 'Urgent' && (
                          <span className="badge urgent-badge">URGENT</span>
                        )}
                        <span className={`badge ${request.requestType === 'Session swap' ? 'swap-badge' : 'change-badge'}`}>
                          {request.requestType === 'Session swap' ? 'SWAP REQUEST' : 'CHANGE REQUEST'}
                        </span>
                        <span className="badge pending-badge">PENDING</span>
                      </div>
                      <button 
                        className="delete-btn" 
                        onClick={() => handleDelete(request.id)}
                        title="Delete request"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="request-card-body">
                    {request.requestType === 'Session change' ? (
                      <div className="session-info">
                        <div className="session-label">CURRENT SESSION 0 WILL BE REMOVED</div>
                        <div className="session-time">{request.currentSession}</div>
                      </div>
                    ) : (
                      <>
                        <div className="session-info">
                          <div className="session-label">CURRENT SESSION</div>
                          <div className="session-time">{request.currentSession}</div>
                        </div>
                        <div className="swap-arrow">↓</div>
                        <div className="session-info">
                          <div className="session-label">PREFERRED SWAP TO</div>
                          <div className="session-time">{request.preferredSwapTo}</div>
                        </div>
                      </>
                    )}

                    <div className="reason-section">
                      <div className="reason-label">REASON</div>
                      <div className="reason-text">{request.reason}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Request session swap and change</h2>
                <p className="modal-subtitle">Submit a to swap or modify your assigned sessions</p>
              </div>
              <button className="modal-close-btn" onClick={handleCancel}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Request type</label>
                  <select 
                    name="requestType"
                    value={formData.requestType}
                    onChange={handleInputChange}
                    className="form-select"
                  >
                    {requestTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select 
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    className="form-select"
                  >
                    {priorities.map(priority => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Current session</label>
                <select 
                  name="currentSession"
                  value={formData.currentSession}
                  onChange={handleInputChange}
                  className={`form-select ${errors.currentSession ? 'error' : ''}`}
                >
                  <option value="">-- Select a session --</option>
                  {availableSessions.map((session, index) => (
                    <option key={index} value={session}>{session}</option>
                  ))}
                </select>
                {errors.currentSession && (
                  <p className="error-message">{errors.currentSession}</p>
                )}
              </div>

              <div className="form-group">
                <label>Preferred swap to (optional)</label>
                <select 
                  name="preferredSwapTo"
                  value={formData.preferredSwapTo}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  <option value="">-- Select a session --</option>
                  {availableSessions.map((session, index) => (
                    <option key={index} value={session}>{session}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Reason for request <span className="required">*</span></label>
                <textarea 
                  name="reason"
                  value={formData.reason}
                  onChange={handleInputChange}
                  className={`form-textarea ${errors.reason ? 'error' : ''}`}
                  placeholder="Please provide a detailed reason for your swap/change request..."
                  rows="5"
                />
                {errors.reason && (
                  <p className="error-message">{errors.reason}</p>
                )}
                <p className="helper-text">Be specific about conflicts, commitments, or circumstances requiring this change.</p>
              </div>

              <div className="info-note">
                <span className="note-icon">⚠</span>
                <span className="note-text">
                  <strong>Note:</strong> All requests require Unit Coordinator approval. You will be notified via email once your request is reviewed.
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleCancel}>Cancel</button>
              <button className="btn-submit" onClick={handleSubmit}>Submit Requests</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {showSuccess && (
        <div className="success-toast">
          ✓ Request submitted successfully!
        </div>
      )}
    </div>
  );
};

export default TutorRequests;