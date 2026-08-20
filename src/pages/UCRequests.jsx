import React, { useState, useEffect } from 'react';
import { sessionsAPI, ucAPI } from '../config/api';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';

const labelFromValue = (value) => {
  if (!value) return '';
  const parts = value.split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

const APPEAL_MARKER = '--- Appeal ---';
// Appeals are stored as one combined string ("<original reason>\n\n--- Appeal ---\n<appeal text>").
// Split that back apart so the UI can show "Reason" and "Appeal" as separate labeled sections.
const splitReasonAndAppeal = (reasonText) => {
  if (!reasonText || !reasonText.includes(APPEAL_MARKER)) {
    return { reason: reasonText || '', appeal: null };
  }
  const idx = reasonText.indexOf(APPEAL_MARKER);
  const reason = reasonText.slice(0, idx).trim();
  const appeal = reasonText.slice(idx + APPEAL_MARKER.length).trim();
  return { reason, appeal };
};

const UCRequests = () => {
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [showSuggestConfirmModal, setShowSuggestConfirmModal] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedSession, setSelectedSession] = useState('');
  const [availableSessions, setAvailableSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState('');

  const [pendingRequests, setPendingRequests] = useState([]);
  const [processedRequests, setProcessedRequests] = useState([]);

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

  const formatSessionSuggestion = (session) => {
    const time = [session.startTime, session.endTime].filter(Boolean).join(' - ');
    const room = session.location || session.campus || 'Location TBC';
    return {
      id: session.id,
      day: session.day || 'TBC',
      time: time || 'Time TBC',
      room,
      value: `${session.day || 'TBC'} ${time || 'Time TBC'} ${room}`
    };
  };

  const handleSuggest = async (request) => {
    setSelectedRequest(request);
    setSelectedSession('');
    setAvailableSessions([]);
    setSessionLoadError('');
    setShowSuggestModal(true);

    if (!request.unitId) {
      setSessionLoadError('This request is missing unit information.');
      return;
    }

    setIsLoadingSessions(true);
    try {
      const sessions = await sessionsAPI.getAll(request.unitId);
      setAvailableSessions(sessions.map(formatSessionSuggestion));
    } catch (error) {
      console.error('Error loading unit sessions for suggestion:', error);
      setSessionLoadError('Could not load sessions for this unit.');
    } finally {
      setIsLoadingSessions(false);
    }
  };

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
      setAvailableSessions([]);
    } catch (error) { console.error('Error suggesting session:', error); }
  };

  const isUrgent = (req) => (req.priority || '').toLowerCase() === 'urgent';

  const renderReasonSections = (req) => {
    const { reason, appeal } = splitReasonAndAppeal(req.reason);
    return (
      <>
        <div className="uc-reason-box">
          <div className="uc-reason-label">Reason</div>
          <p className="uc-reason-text">{reason}</p>
        </div>
        {appeal && (
          <div className="uc-appeal-box">
            <div className="uc-appeal-label">Appeal</div>
            <p className="uc-reason-text">{appeal}</p>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="requests" />

      <main className="uc-main-content">
        <UCPageHeader title="Request & Swap" />

        {/* Pending Status */}
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
                      {request.reason && request.reason.includes(APPEAL_MARKER) && (
                        <span className="uc-badge appealed">APPEALED</span>
                      )}
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
                    {renderReasonSections(request)}
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

        {/* Confirmation Status */}
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
                      {request.reason && request.reason.includes(APPEAL_MARKER) && (
                        <span className="uc-badge appealed">APPEALED</span>
                      )}
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
                    {renderReasonSections(request)}
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
            {isLoadingSessions ? (
              <div className="uc-no-sessions">
                <h3>Loading sessions...</h3>
                <p>Finding sessions for {selectedRequest?.unitCode || 'this unit'}.</p>
              </div>
            ) : sessionLoadError ? (
              <div className="uc-no-sessions">
                <h3>Could not load sessions</h3>
                <p>{sessionLoadError}</p>
              </div>
            ) : availableSessions.length === 0 ? (
              <div className="uc-no-sessions">
                <h3>No sessions found</h3>
                <p>There are no sessions in {selectedRequest?.unitCode || 'this unit'} to suggest.</p>
              </div>
            ) : (
              <div className="uc-sessions-list">
                {availableSessions.map((session, index) => {
                  const sessionValue = session.value;
                  return (
                    <div key={session.id || index}
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
