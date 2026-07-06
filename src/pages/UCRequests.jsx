import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ucAPI } from '../config/api';
import '../styles/UCRequests.css';

const labelFromValue = (value) => {
  if (!value) return '';
  const parts = value.split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

const UCRequests = () => {
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [showSuggestConfirmModal, setShowSuggestConfirmModal] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedSession, setSelectedSession] = useState('');

  const [pendingRequests, setPendingRequests] = useState([]);
  const [processedRequests, setProcessedRequests] = useState([]);

  const availableSessions = [
    { day: 'TUE', time: '12:00pm - 2:00pm', room: 'S303' },
    { day: 'THU', time: '3:00pm - 5:00pm', room: 'S302' },
    { day: 'FRI', time: '2:00pm - 4:00pm', room: 'P413' }
  ];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRequests(); }, []);

  const formatRequest = (request) => {
    const tutorName = request.tutorName || request.tutor || 'Tutor';
    const tutorIcon = tutorName.charAt(0).toUpperCase();
    const currentSession = request.currentSession && request.currentSession.trim() !== ''
      ? labelFromValue(request.currentSession)
      : 'No session data provided';
    const preferredSwapTo = request.preferredSwapTo && request.preferredSwapTo.trim() !== ''
      ? labelFromValue(request.preferredSwapTo)
      : null;
    return {
      ...request,
      tutorName,
      tutorIcon,
      currentSession,
      preferredSwapTo,
      submittedDate: request.submittedDate
        ? new Date(request.submittedDate).toLocaleString()
        : 'Unknown date',
      status: request.status || 'Pending'
    };
  };

  const fetchRequests = async () => {
    try {
      const data = await ucAPI.getAllRequests();
      const formattedData = data.map(formatRequest);
      setPendingRequests(formattedData.filter(r => r.status === 'Pending'));
      setProcessedRequests(formattedData.filter(r => r.status !== 'Pending'));
    } catch (error) {
      console.error('Error fetching UC requests:', error);
    }
  };

  const handleApprove = (request) => { setSelectedRequest(request); setShowApproveModal(true); };
  const handleReject  = (request) => { setSelectedRequest(request); setShowRejectModal(true); };
  const handleSuggest = (request) => { setSelectedRequest(request); setShowSuggestModal(true); };

  const confirmApprove = async () => {
    if (!selectedRequest) return;
    try {
      await ucAPI.reviewRequest(selectedRequest.id, 'accepted', 'Approved by Unit Coordinator');
      await fetchRequests();
      setShowApproveModal(false);
      setSelectedRequest(null);
    } catch (error) { console.error('Error approving request:', error); }
  };

  const confirmReject = async () => {
    if (!selectedRequest) return;
    try {
      await ucAPI.reviewRequest(selectedRequest.id, 'rejected', 'Rejected by Unit Coordinator');
      await fetchRequests();
      setShowRejectModal(false);
      setSelectedRequest(null);
    } catch (error) { console.error('Error rejecting request:', error); }
  };

  const confirmSuggest = () => {
    if (!selectedSession) return;
    setShowSuggestModal(false);
    setShowSuggestConfirmModal(true);
  };

  const finalizeSuggest = async () => {
    if (!selectedRequest || !selectedSession) return;
    try {
      await ucAPI.reviewRequest(selectedRequest.id, 'suggested', selectedSession);
      await fetchRequests();
      setShowSuggestConfirmModal(false);
      setSelectedRequest(null);
      setSelectedSession('');
    } catch (error) { console.error('Error suggesting session:', error); }
  };

  const isUrgent = (req) => (req.priority || '').toLowerCase() === 'urgent';

  return (
    <div className="uc-dashboard-container">
      <aside className="uc-sidebar">
        <div className="uc-logo-section">
          <div className="uc-logo"><span className="uc-logo-icon">S</span></div>
          <h2 className="uc-brand-name">Sessioneer</h2>
        </div>

        <div className="uc-active-unit">
          <p className="uc-active-label">Active Unit</p>
          <p className="uc-unit-code">FIT3077</p>
          <p className="uc-unit-semester">Semester 1, 2025</p>
        </div>

        <nav className="uc-navigation">
          <a href="#dashboard"        className="uc-nav-item">Dashboard</a>
          <Link to="/unit-setup" className="uc-nav-item">Unit Setup</Link>
          <a href="#sessions"         className="uc-nav-item">Sessions</a>
          <a href="#tutors"           className="uc-nav-item">Tutors</a>
          <Link to="/uc-availability" className="uc-nav-item">Availability</Link>
          <a href="#schedule-builder" className="uc-nav-item">Schedule Builder</a>
          <Link to="/uc-requests"     className="uc-nav-item active">Requests</Link>
          <a href="#messages"         className="uc-nav-item">Messages</a>
        </nav>

        <div className="uc-user-profile">
          <div className="uc-user-avatar">D</div>
          <div className="uc-user-info">
            <p className="uc-user-name">Dr. Sarah Kim</p>
            <p className="uc-user-role">Unit Coordinator</p>
          </div>
        </div>
      </aside>

      <main className="uc-main-content">
        <header className="uc-header">
        <h1>Request & Swap</h1>
        <button className="uc-notification-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </header>

        {/* ── Pending Status ── */}
        <section className="uc-section">
          <div className="uc-section-header">
            <div className="uc-section-title-row">
              <h2>Pending Status</h2>
              <div className="uc-status-legend">
                <div className="uc-legend-item"><span className="uc-legend-box changed"></span>Changed</div>
                <div className="uc-legend-item"><span className="uc-legend-box swap"></span>Swap</div>
              </div>
            </div>
            <p className="uc-pending-count">{pendingRequests.length} pending review...</p>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="uc-empty-state"><p>No pending requests</p></div>
          ) : (
            <div className="uc-card-list">
              {pendingRequests.map(request => (
                <div key={request.id} className={`uc-request-card ${isUrgent(request) ? 'urgent-card' : ''}`}>
                  <div className="uc-request-header">
                    <div className="uc-tutor-info">
                      <h3>{request.tutorName}</h3>
                      <p className="uc-submitted-date">Submitted {request.submittedDate}</p>
                    </div>
                    <div className="uc-request-badges">
                      {isUrgent(request) && <span className="uc-badge urgent">URGENT</span>}
                      <span className={`uc-badge ${request.requestType === 'Session swap' ? 'swap' : 'change'}`}>
                        {request.requestType}
                      </span>
                      <span className="uc-badge pending">Pending</span>
                    </div>
                  </div>

                  <div className="uc-request-body">
                    <div className="uc-session-box">
                      <div className="uc-session-label">Current Session</div>
                      <p className="uc-session-time">{request.currentSession}</p>
                    </div>
                    {request.preferredSwapTo && (
                      <>
                        <div className="uc-swap-arrow">↓</div>
                        <div className="uc-session-box">
                          <div className="uc-session-label">Preferred Swap To</div>
                          <p className="uc-session-time">{request.preferredSwapTo}</p>
                        </div>
                      </>
                    )}
                    <div className="uc-reason-box">
                      <div className="uc-reason-label">Reason</div>
                      <p className="uc-reason-text">{request.reason}</p>
                    </div>
                  </div>

                  <div className="uc-action-buttons">
                    <button className="uc-btn approve" onClick={() => handleApprove(request)}>Approve</button>
                    <button className="uc-btn reject"  onClick={() => handleReject(request)}>Reject</button>
                    <button className="uc-btn suggest" onClick={() => handleSuggest(request)}>Suggest</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Confirmation Status ── */}
        <section className="uc-section">
          <div className="uc-section-header">
            <h2>Confirmation Status</h2>
          </div>

          {processedRequests.length === 0 ? (
            <div className="uc-empty-state"><p>No confirmed requests yet</p></div>
          ) : (
            <div className="uc-card-list">
              {processedRequests.map(request => (
                <div key={request.id} className={`uc-request-card ${isUrgent(request) ? 'urgent-card' : ''}`}>
                  <div className="uc-request-header">
                    <div className="uc-tutor-info">
                      <h3>{request.tutorName}</h3>
                      <p className="uc-submitted-date">Submitted {request.submittedDate}</p>
                    </div>
                    <div className="uc-request-badges">
                      <span className={`uc-badge ${request.requestType === 'Session swap' ? 'swap' : 'change'}`}>
                        {request.requestType}
                      </span>
                      <span className={`uc-badge ${(request.status || '').toLowerCase()}`}>
                        {request.status}
                      </span>
                    </div>
                  </div>

                  <div className="uc-request-body">
                    <div className="uc-session-box">
                      <div className="uc-session-label">Current Session</div>
                      <p className="uc-session-time">{request.currentSession}</p>
                    </div>
                    {request.preferredSwapTo && (
                      <>
                        <div className="uc-swap-arrow">↓</div>
                        <div className="uc-session-box">
                          <div className="uc-session-label">Preferred Swap To</div>
                          <p className="uc-session-time">{request.preferredSwapTo}</p>
                        </div>
                      </>
                    )}
                    {request.reviewNotes && (request.status || '').toLowerCase() === 'suggested' && (
                      <div className="uc-session-box suggested">
                        <div className="uc-session-label">Suggested Session</div>
                        <p className="uc-session-time">{request.reviewNotes}</p>
                      </div>
                    )}
                    <div className="uc-reason-box">
                      <div className="uc-reason-label">Reason</div>
                      <p className="uc-reason-text">{request.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="uc-modal-overlay" onClick={() => setShowApproveModal(false)}>
          <div className="uc-modal-content" onClick={e => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowApproveModal(false)}>×</button>
            <div className="uc-modal-icon success">✓</div>
            <h2>Approve Request?</h2>
            <p className="uc-modal-subtitle">This request will be approved and moved to confirmation status.</p>
            <button className="uc-btn-done" onClick={confirmApprove}>Done</button>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="uc-modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="uc-modal-content" onClick={e => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowRejectModal(false)}>×</button>
            <div className="uc-modal-icon warning">!</div>
            <h2>Reject Request?</h2>
            <p className="uc-modal-subtitle">This request will be rejected and moved to confirmation status.</p>
            <button className="uc-btn-done" onClick={confirmReject}>Done</button>
          </div>
        </div>
      )}

      {/* Suggest Modal */}
      {showSuggestModal && (
        <div className="uc-modal-overlay" onClick={() => setShowSuggestModal(false)}>
          <div className="uc-modal-content" onClick={e => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowSuggestModal(false)}>×</button>
            <h2>Suggest Alternative Sessions</h2>
            <p className="uc-modal-subtitle">Select an available session to suggest to the tutor.</p>
            {availableSessions.length === 0 ? (
              <div className="uc-no-sessions">
                <h3>All sessions have been assigned</h3>
                <p>There are no available sessions to suggest at this time.</p>
              </div>
            ) : (
              <div className="uc-sessions-list">
                {availableSessions.map((session, index) => {
                  const sessionValue = `${session.day} ${session.time} ${session.room}`;
                  return (
                    <div key={index}
                      className={`uc-session-option ${selectedSession === sessionValue ? 'selected' : ''}`}
                      onClick={() => setSelectedSession(sessionValue)}>
                      <div className="uc-session-info-row">
                        <span className="uc-day-badge">{session.day}</span>
                        <span className="uc-time-text">{session.time}</span>
                        <span className="uc-room-text">{session.room}</span>
                      </div>
                      <button className="uc-suggest-btn">Suggest</button>
                    </div>
                  );
                })}
              </div>
            )}
            {availableSessions.length > 0 && (
              <button className="uc-btn-done" onClick={confirmSuggest} disabled={!selectedSession}>
                Confirm Suggestion
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suggest Confirm Modal */}
      {showSuggestConfirmModal && (
        <div className="uc-modal-overlay" onClick={() => setShowSuggestConfirmModal(false)}>
          <div className="uc-modal-content" onClick={e => e.stopPropagation()}>
            <button className="uc-modal-close" onClick={() => setShowSuggestConfirmModal(false)}>×</button>
            <div className="uc-modal-icon success">✓</div>
            <h2>Alternative Session Suggested</h2>
            <p className="uc-modal-subtitle">The tutor has been notified and can now review your suggestion.</p>
            <div className="uc-modal-details">
              <div className="uc-detail-row">
                <span className="uc-detail-label">Tutor</span>
                <span className="uc-detail-value">{selectedRequest?.tutorName}</span>
              </div>
              <div className="uc-detail-row">
                <span className="uc-detail-label">Suggested Session</span>
                <span className="uc-detail-value">{selectedSession}</span>
              </div>
            </div>
            <button className="uc-btn-done" onClick={finalizeSuggest}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UCRequests;