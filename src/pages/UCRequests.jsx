import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/UCRequests.css';

const UCRequests = () => {
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [showSuggestConfirmModal, setShowSuggestConfirmModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedSession, setSelectedSession] = useState('');

  // Dummy data for pending requests (sorted by priority - Urgent first)
  const [pendingRequests, setPendingRequests] = useState([
    {
      id: 2,
      tutorName: 'John Smith',
      tutorIcon: 'J',
      submittedDate: '19 Apr 2025, 09:15',
      requestType: 'Session swap',
      priority: 'Urgent',
      currentSession: 'Tue TUT-01 12:00pm Tutorial 01',
      preferredSwapTo: 'Tue TUT-02 10:00am Tutorial 02',
      reason: 'Current session timing conflicts with another class'
    },
    {
      id: 1,
      tutorName: 'Mat Lee',
      tutorIcon: 'M',
      submittedDate: '20 Apr 2025, 14:30',
      requestType: 'Session change',
      priority: 'Normal',
      currentSession: 'Tue TUT-03 10:00am Tutorial 03',
      preferredSwapTo: '',
      reason: 'Clashed with another commitment'
    },
    {
      id: 3,
      tutorName: 'Sarah Chen',
      tutorIcon: 'S',
      submittedDate: '18 Apr 2025, 16:20',
      requestType: 'Session swap',
      priority: 'Normal',
      currentSession: 'Wed TUT-01 2:00pm Tutorial 01',
      preferredSwapTo: 'Thu TUT-02 3:00pm Tutorial 02',
      reason: 'Personal medical appointment conflict'
    }
  ]);

  // Dummy data for processed requests (status)
  const [processedRequests, setProcessedRequests] = useState([
    {
      id: 3,
      tutorName: 'Alex',
      tutorIcon: 'A',
      submittedDate: '20 Apr 2025, 14:30',
      requestType: 'Session change',
      currentSession: 'Wed TUT-04 10:00am Tutorial 04',
      reason: 'Clashed with another commitment',
      status: 'accepted'
    },
    {
      id: 4,
      tutorName: 'Emma Wilson',
      tutorIcon: 'E',
      submittedDate: '17 Apr 2025, 11:45',
      requestType: 'Session swap',
      currentSession: 'Mon TUT-01 8:00am Tutorial 01',
      preferredSwapTo: 'Fri TUT-02 3:00pm Tutorial 02',
      reason: 'Early morning commute is difficult',
      status: 'suggested',
      suggestedSession: 'Thu TUT-03 1:00pm Tutorial 03'
    },
    {
      id: 5,
      tutorName: 'Michael Brown',
      tutorIcon: 'M',
      submittedDate: '16 Apr 2025, 09:30',
      requestType: 'Session change',
      currentSession: 'Fri TUT-01 2:00pm Tutorial 01',
      reason: 'Personal reasons',
      status: 'rejected'
    }
  ]);

  // Available sessions for suggestion
  // TO SHOW "All sessions assigned": set this to []
  // TO SHOW session list: uncomment the array below
  const availableSessions = [
    { day: 'TUE', time: '12:00pm - 2:00pm', room: 'S303' },
    { day: 'THU', time: '3:00pm - 5:00pm', room: 'S302' },
    { day: 'FRI', time: '2:00pm - 4:00pm', room: 'P413' }
  ];
  
  // Uncomment this to show "All sessions have been assigned" state:
  // const availableSessions = [];

  const handleApprove = (request) => {
    setSelectedRequest(request);
    setShowApproveModal(true);
  };

  const handleReject = (request) => {
    setSelectedRequest(request);
    setShowRejectModal(true);
  };

  const handleSuggest = (request) => {
    setSelectedRequest(request);
    setShowSuggestModal(true);
  };

  const confirmApprove = () => {
    // Remove from pending and add to processed
    setPendingRequests(prev => prev.filter(req => req.id !== selectedRequest.id));
    setProcessedRequests(prev => [...prev, { ...selectedRequest, status: 'accepted' }]);
    setShowApproveModal(false);
    setSelectedRequest(null);
  };

  const confirmReject = () => {
    // Remove from pending and add to processed
    setPendingRequests(prev => prev.filter(req => req.id !== selectedRequest.id));
    setProcessedRequests(prev => [...prev, { ...selectedRequest, status: 'rejected' }]);
    setShowRejectModal(false);
    setSelectedRequest(null);
  };

  const confirmSuggest = () => {
    if (!selectedSession) return;
    
    setShowSuggestModal(false);
    setShowSuggestConfirmModal(true);
  };

  const finalizeSuggest = () => {
    // Remove from pending and add to processed with suggested session
    setPendingRequests(prev => prev.filter(req => req.id !== selectedRequest.id));
    setProcessedRequests(prev => [...prev, { 
      ...selectedRequest, 
      status: 'suggested',
      suggestedSession: selectedSession
    }]);
    setShowSuggestConfirmModal(false);
    setSelectedRequest(null);
    setSelectedSession('');
  };

  return (
    <div className="uc-dashboard-container">
      {/* Sidebar */}
      <aside className="uc-sidebar">
        <div className="uc-logo-section">
          <div className="uc-logo">
            <span className="uc-logo-icon">S</span>
          </div>
          <h2 className="uc-brand-name">Sessioneer</h2>
        </div>

        <div className="uc-active-unit">
          <p className="uc-active-label">Active Unit</p>
          <p className="uc-unit-code">FIT3077</p>
          <p className="uc-unit-semester">Semester 1, 2025</p>
        </div>

        <nav className="uc-navigation">
          <a href="#dashboard" className="uc-nav-item">Dashboard</a>
          <a href="#unit-setup" className="uc-nav-item">Unit Setup</a>
          <a href="#sessions" className="uc-nav-item">Sessions</a>
          <a href="#tutors" className="uc-nav-item">Tutors</a>
          <a href="#availability" className="uc-nav-item">Availability</a>
          <a href="#schedule-builder" className="uc-nav-item">Schedule Builder</a>
          <Link to="/uc-requests" className="uc-nav-item active">Requests</Link>
          <a href="#messages" className="uc-nav-item">Messages</a>
        </nav>

        <div className="uc-user-profile">
          <div className="uc-user-avatar">D</div>
          <div className="uc-user-info">
            <p className="uc-user-name">Dr. Sarah Kim</p>
            <p className="uc-user-role">Unit Coordinator</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="uc-main-content">
        <header className="uc-header">
          <h1>Request & Swap</h1>
          <button className="uc-notification-btn">🔔</button>
        </header>

        {/* Pending Review Section */}
        <section className="uc-pending-section">
          <div className="uc-section-header">
            <div>
              <div className="uc-section-title-row">
                <h2>Request & Swap</h2>
                <div className="uc-status-legend">
                  <div className="uc-legend-item">
                    <span className="uc-legend-box changed"></span>
                    <span>Changed</span>
                  </div>
                  <div className="uc-legend-item">
                    <span className="uc-legend-box swap"></span>
                    <span>Swap</span>
                  </div>
                </div>
              </div>
              <p className="uc-pending-count">{pendingRequests.length} pending review...</p>
            </div>
          </div>

          <div className="uc-pending-list">
            {pendingRequests.length === 0 ? (
              <div className="uc-empty-state">
                <p>No Request and Swap</p>
              </div>
            ) : (
              pendingRequests.map(request => (
                <div key={request.id} className={`uc-request-card ${request.priority === 'Urgent' ? 'urgent-card' : ''}`}>
                  <div className="uc-request-header">
                    <div className="uc-tutor-info">
                      <h3>{request.tutorName}</h3>
                      <p className="uc-submitted-date">Submitted {request.submittedDate}</p>
                    </div>
                    <div className="uc-request-badges">
                      {request.priority === 'Urgent' && (
                        <span className="uc-badge urgent">URGENT</span>
                      )}
                      <span className={`uc-badge ${request.requestType === 'Session swap' ? 'swap' : 'change'}`}>
                        {request.requestType === 'Session swap' ? 'SWAP REQUEST' : 'CHANGE REQUEST'}
                      </span>
                      <span className="uc-badge pending">PENDING</span>
                    </div>
                  </div>

                  <div className="uc-request-body">
                    <div className="uc-session-box">
                      <p className="uc-session-label">
                        {request.requestType === 'Session change' 
                          ? 'CURRENT SESSION 0 WILL BE REMOVED' 
                          : 'CURRENT SESSION'}
                      </p>
                      <p className="uc-session-time">{request.currentSession}</p>
                    </div>

                    {request.requestType === 'Session swap' && request.preferredSwapTo && (
                      <>
                        <div className="uc-swap-arrow">↓</div>
                        <div className="uc-session-box">
                          <p className="uc-session-label">PREFERRED SWAP TO</p>
                          <p className="uc-session-time">{request.preferredSwapTo}</p>
                        </div>
                      </>
                    )}

                    <div className="uc-reason-box">
                      <p className="uc-reason-label">REASON</p>
                      <p className="uc-reason-text">{request.reason}</p>
                    </div>

                    <div className="uc-action-buttons">
                      <button className="uc-btn approve" onClick={() => handleApprove(request)}>
                        Approve
                      </button>
                      <button className="uc-btn reject" onClick={() => handleReject(request)}>
                        Reject
                      </button>
                      <button className="uc-btn suggest" onClick={() => handleSuggest(request)}>
                        Suggest
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Status Section */}
        <section className="uc-status-section">
          <h2>Request & Swap Status</h2>
          
          <div className="uc-status-list">
            {processedRequests.length === 0 ? (
              <div className="uc-empty-state">
                <p>No Request and Swap</p>
              </div>
            ) : (
              processedRequests.map(request => (
                <div key={request.id} className="uc-status-card">
                  <div className="uc-status-header">
                    <div className="uc-tutor-info">
                      <h3>{request.tutorName}</h3>
                      <p className="uc-submitted-date">Submitted {request.submittedDate}</p>
                    </div>
                    <div className="uc-request-badges">
                      <span className={`uc-badge ${request.requestType === 'Session swap' ? 'swap' : 'change'}`}>
                        {request.requestType === 'Session swap' ? 'SWAP REQUEST' : 'CHANGE REQUEST'}
                      </span>
                      <span className={`uc-badge ${request.status}`}>
                        {request.status === 'accepted' ? 'ACCEPT' : request.status === 'rejected' ? 'REJECT' : 'SUGGESTED'}
                      </span>
                    </div>
                  </div>

                  <div className="uc-status-body">
                    <div className="uc-session-box">
                      <p className="uc-session-label">
                        {request.requestType === 'Session change' 
                          ? 'CURRENT SESSION 0 WILL BE REMOVED' 
                          : 'CURRENT SESSION'}
                      </p>
                      <p className="uc-session-time">{request.currentSession}</p>
                    </div>

                    {request.suggestedSession && (
                      <>
                        <div className="uc-swap-arrow">↓</div>
                        <div className="uc-session-box suggested">
                          <p className="uc-session-label">SUGGESTED SESSION</p>
                          <p className="uc-session-time">{request.suggestedSession}</p>
                        </div>
                      </>
                    )}

                    <div className="uc-reason-box">
                      <p className="uc-reason-label">REASON</p>
                      <p className="uc-reason-text">{request.reason}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="uc-modal-overlay" onClick={() => setShowApproveModal(false)}>
          <div className="uc-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowApproveModal(false)}>×</button>
            <div className="uc-modal-icon success">✓</div>
            <h2>Request Approved</h2>
            <p className="uc-modal-subtitle">The tutor's change request has been approved.</p>
            
            <div className="uc-modal-details">
              <div className="uc-detail-row">
                <span className="uc-detail-label">TUTOR</span>
                <span className="uc-detail-value">{selectedRequest?.tutorName}</span>
              </div>
              <div className="uc-detail-row">
                <span className="uc-detail-label">SESSION</span>
                <span className="uc-detail-value change-badge">CHANGE REQUEST</span>
              </div>
              <div className="uc-detail-row">
                <span className="uc-detail-label">REASON</span>
                <span className="uc-detail-value">{selectedRequest?.reason}</span>
              </div>
              <div className="uc-session-detail">
                <span className="uc-day-badge">TUE</span>
                <span className="uc-time-text">10:00pm - 12:00pm</span>
                <span className="uc-room-badge">S303</span>
              </div>
            </div>

            <div className="uc-modal-info">
              <span className="uc-info-icon">ℹ</span>
              <p>The UC has been notified of your approval. Their session has been updated accordingly. You may need to reassign a replacement tutor for the removed slot.</p>
            </div>

            <button className="uc-btn-done" onClick={confirmApprove}>Done</button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="uc-modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="uc-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowRejectModal(false)}>×</button>
            <div className="uc-modal-icon reject">✕</div>
            <h2>Request Reject</h2>
            <p className="uc-modal-subtitle">The tutor's change request has been declined.</p>
            
            <div className="uc-modal-details">
              <div className="uc-detail-row">
                <span className="uc-detail-label">TUTOR</span>
                <span className="uc-detail-value">{selectedRequest?.tutorName}</span>
              </div>
              <div className="uc-detail-row">
                <span className="uc-detail-label">SESSION</span>
                <span className="uc-detail-value change-badge">CHANGE REQUEST</span>
              </div>
              <div className="uc-detail-row">
                <span className="uc-detail-label">REASON</span>
                <span className="uc-detail-value">{selectedRequest?.reason}</span>
              </div>
              <div className="uc-session-detail">
                <span className="uc-day-badge">WED</span>
                <span className="uc-time-text">2:00pm - 4:00pm</span>
                <span className="uc-room-badge">S304</span>
              </div>
            </div>

            <div className="uc-modal-info">
              <span className="uc-info-icon">ℹ</span>
              <p>The tutor has been notified of your approval. Their session has been updated accordingly. You may need to reassign a replacement tutor for the removed slot.</p>
            </div>

            <button className="uc-btn-done" onClick={confirmReject}>Done</button>
          </div>
        </div>
      )}

      {/* Suggest Sessions Modal */}
      {showSuggestModal && (
        <div className="uc-modal-overlay" onClick={() => setShowSuggestModal(false)}>
          <div className="uc-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowSuggestModal(false)}>×</button>
            <h2>Suggest Alternative Sessions</h2>
            <p className="uc-modal-subtitle">Select an available session to suggest to the tutor</p>

            {availableSessions.length === 0 ? (
              <div className="uc-no-sessions">
                <div className="uc-calendar-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="#9ca3af" strokeWidth="2"/>
                    <path d="M3 9H21M8 2V6M16 2V6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 13H8.01M12 13H12.01M16 13H16.01M8 17H8.01M12 17H12.01M16 17H16.01" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3>All sessions have been assigned</h3>
                <p>There are no available sessions to suggest at this time. You may need to reject this request or manually reassign existing sessions.</p>
              </div>
            ) : (
              <div className="uc-sessions-list">
                {availableSessions.map((session, index) => (
                  <div 
                    key={index} 
                    className={`uc-session-option ${selectedSession === `${session.day} ${session.time}` ? 'selected' : ''}`}
                    onClick={() => setSelectedSession(`${session.day} ${session.time}`)}
                  >
                    <div className="uc-session-info-row">
                      <span className="uc-day-badge">{session.day}</span>
                      <span className="uc-time-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                          <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </span>
                      <span className="uc-time-text">{session.time}</span>
                      <span className="uc-room-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </span>
                      <span className="uc-room-text">{session.room}</span>
                    </div>
                    <button className="uc-suggest-btn">Suggest</button>
                  </div>
                ))}
              </div>
            )}

            {availableSessions.length > 0 && (
              <button 
                className="uc-btn-done" 
                onClick={confirmSuggest}
                disabled={!selectedSession}
              >
                Confirm Suggestion
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suggest Confirmation Modal */}
      {showSuggestConfirmModal && (
        <div className="uc-modal-overlay" onClick={() => setShowSuggestConfirmModal(false)}>
          <div className="uc-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowSuggestConfirmModal(false)}>×</button>
            <div className="uc-modal-icon success">✓</div>
            <h2>Alternative Session Suggested</h2>
            <p className="uc-modal-subtitle">The tutor has been notified and can now review your suggestion. You'll be notified once they respond.</p>
            
            <div className="uc-modal-details">
              <div className="uc-detail-row">
                <span className="uc-detail-label">TUTOR</span>
                <span className="uc-detail-value">{selectedRequest?.tutorName}</span>
              </div>
              <div className="uc-detail-row">
                <span className="uc-detail-label">SUGGESTED SESSION</span>
                <span className="uc-detail-value">{selectedSession}</span>
              </div>
            </div>

            <div className="uc-modal-info">
              <span className="uc-info-icon">ℹ</span>
              <p>The tutor will receive a notification and can accept or decline your suggestion. You'll be notified once they respond.</p>
            </div>

            <button className="uc-btn-done" onClick={finalizeSuggest}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UCRequests;