import React, { useState, useEffect } from 'react';
import { requestsAPI, sessionsAPI, coverAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorRequests.css';
import '../styles/CoverRequests.css';

const labelFromValue = (value) => {
  if (!value) return '';
  const parts = value.split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

const unitCodeFromSession = (value) => {
  if (!value) return '';
  return value.split('::')[0] || '';
};

const sessionLabel = (s) => `${s.day} ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)} | ${s.location || 'TBA'} | ${s.sessionType || 'Session'}`;
const sessionLabelWithCode = (s) => `${s.sessionCode ? s.sessionCode + ' | ' : ''}${sessionLabel(s)}`;
const sessionValue = (s, unitCode) => `${unitCode}::${s.day} ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}|${s.location || 'TBA'}`;

const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
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

const isActive = (s) => ['pending', 'suggested'].includes((s || '').toLowerCase());
const isProcessed = (s) => ['accepted', 'rejected'].includes((s || '').toLowerCase());
const statusKey = (s) => (s || '').toLowerCase();

const INITIAL_FORM = {
  selectedUnit: '', requestType: 'Session swap',
  priority: 'Normal', currentSession: '', preferredSwapTo: '', reason: '',
};

const TutorRequests = () => {
  const { allUnits, isLoading: unitsLoading } = useActiveUnit();

  const [showModal, setShowModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requests, setRequests] = useState([]);
  const [errors, setErrors] = useState({});
  const [showSuggestedModal, setShowSuggestedModal] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [suggestionAction, setSuggestionAction] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);

  const [unitSessions, setUnitSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealRequest, setAppealRequest] = useState(null);
  const [appealText, setAppealText] = useState('');
  const [appealError, setAppealError] = useState('');
  const [isAppealing, setIsAppealing] = useState(false);

  const activeRequests = requests.filter(r => isActive(r.status));
  const processedRequests = requests.filter(r => isProcessed(r.status));

  // Cover requests: sessions other tutors can't make, broadcast on a
  // first-come-first-served basis. Lives here since it's still "requests
  // that involve my schedule", just initiated by the UC instead of by me.
  const [coverRequests, setCoverRequests] = useState([]);
  const [isLoadingCover, setIsLoadingCover] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [coverMessage, setCoverMessage] = useState(null);

  const fetchCoverRequests = async () => {
    setIsLoadingCover(true);
    try {
      const data = await coverAPI.getOpen();
      setCoverRequests(data);
    } catch (err) {
      console.error('Error loading cover requests:', err);
    } finally {
      setIsLoadingCover(false);
    }
  };

  const handleClaimCover = async (request) => {
    setClaimingId(request.id);
    setCoverMessage(null);
    try {
      await coverAPI.claim(request.id);
      const rangeText = request.startDate && request.endDate
        ? `${formatShortDate(request.startDate)} - ${formatShortDate(request.endDate)}`
        : null;
      const occurrenceText = request.occurrenceCount
        ? ` (${request.occurrenceCount} session${request.occurrenceCount === 1 ? '' : 's'})`
        : '';
      const codePrefix = request.sessionCode ? `${request.sessionCode} · ` : '';
      setCoverMessage({
        type: 'success',
        text: rangeText
          ? `You're now covering ${codePrefix}${request.unitCode} on ${request.day} ${request.startTime.slice(0, 5)}-${request.endTime.slice(0, 5)}, ${rangeText}${occurrenceText}.`
          : `You're now covering ${codePrefix}${request.unitCode} on ${request.day} ${request.startTime.slice(0, 5)}-${request.endTime.slice(0, 5)}.`
      });      setCoverRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (err) {
      if (err.status === 409) {
        setCoverMessage({ type: 'error', text: 'Too slow — someone else already claimed that session.' });
        setCoverRequests(prev => prev.filter(r => r.id !== request.id));
      } else {
        setCoverMessage({ type: 'error', text: err.message || 'Failed to claim session.' });
      }
    } finally {
      setClaimingId(null);
    }
  };

  useEffect(() => { fetchRequests(); }, []);
  useEffect(() => { fetchCoverRequests(); }, []);

  useEffect(() => {
    if (!formData.selectedUnit) {
      setUnitSessions([]);
      return;
    }
    loadSessionsForUnit(formData.selectedUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.selectedUnit]);

  const loadSessionsForUnit = async (unitId) => {
    setIsLoadingSessions(true);
    try {
      const data = await sessionsAPI.getMyAssigned(unitId);
      setUnitSessions(data);
    } catch (err) {
      console.error('Error loading your sessions for this unit:', err);
      setUnitSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const fetchRequests = async () => {
    try {
      const data = await requestsAPI.getAll();
      const sorted = [...data].sort((a, b) => {
        const ua = (a.priority || a.Priority || '').toLowerCase() === 'urgent' ? 0 : 1;
        const ub = (b.priority || b.Priority || '').toLowerCase() === 'urgent' ? 0 : 1;
        if (ua !== ub) return ua - ub;
        return new Date(b.submittedDate) - new Date(a.submittedDate);
      });
      setRequests(sorted);
    } catch (err) { console.error('Error fetching requests:', err); }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'selectedUnit') { next.currentSession = ''; next.preferredSwapTo = ''; }
      return next;
    });
  };

  const selectedUnitObj = allUnits.find(u => u.id === formData.selectedUnit);

  const handleSubmit = async () => {
    const errs = {};
    if (!formData.selectedUnit) errs.selectedUnit = 'Please select a unit';
    if (!formData.currentSession) errs.currentSession = 'Please select a current session';
    if (!formData.reason.trim()) errs.reason = 'Please provide a reason';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    try {
      await requestsAPI.create({
        unitCode: selectedUnitObj?.unitCode,
        requestType: formData.requestType,
        priority: formData.priority,
        currentSession: formData.currentSession,
        preferredSwapTo: formData.preferredSwapTo,
        reason: formData.reason,
      });
      await fetchRequests();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setShowModal(false);
      setFormData(INITIAL_FORM);
    } catch (err) { alert('Failed to submit request. Please try again.'); }
  };

  const handleCancel = () => { setShowModal(false); setErrors({}); setFormData(INITIAL_FORM); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this request?')) return;
    try {
      await requestsAPI.delete(id);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch (err) { alert('Failed to delete request.'); }
  };

  const confirmSuggestionResponse = async () => {
    if (!selectedSuggestion || !suggestionAction) return;
    try {
      await requestsAPI.update(selectedSuggestion.id, { status: suggestionAction === 'accept' ? 'accepted' : 'rejected' });
      await fetchRequests();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setShowSuggestedModal(false);
      setSelectedSuggestion(null);
      setSuggestionAction(null);
    } catch (err) { alert(`Failed to respond: ${err.message}`); }
  };

  const handleOpenAppeal = (req) => {
    setAppealRequest(req);
    setAppealText('');
    setAppealError('');
    setShowAppealModal(true);
  };

  const handleCancelAppeal = () => {
    setShowAppealModal(false);
    setAppealRequest(null);
    setAppealText('');
    setAppealError('');
  };

  const submitAppeal = async () => {
    if (!appealRequest) return;
    if (!appealText.trim()) {
      setAppealError('Please explain why you\'re appealing this decision.');
      return;
    }
    setIsAppealing(true);
    try {
      const combinedReason = `${appealRequest.reason}\n\n--- Appeal ---\n${appealText.trim()}`;
      await requestsAPI.update(appealRequest.id, {
        status: 'Pending',
        reason: combinedReason,
      });
      await fetchRequests();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      handleCancelAppeal();
    } catch (err) {
      setAppealError(err.message || 'Failed to submit appeal. Please try again.');
    } finally {
      setIsAppealing(false);
    }
  };

  const getTimeAgo = (ts) => {
    const d = Date.now() - new Date(ts);
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (dy < 7) return `${dy}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusBadgeClass = (status) => {
    switch (statusKey(status)) {
      case 'pending': return 'pending-badge';
      case 'accepted': return 'swap-badge';
      case 'rejected': return 'urgent-badge';
      case 'suggested': return 'suggested-badge';
      default: return 'pending-badge';
    }
  };

  const renderCardBody = (req) => {
    if (statusKey(req.status) === 'suggested' && req.reviewNotes) {
      return (
        <>
          <div className="session-info">
            <div className="session-label">Current Session</div>
            <div className="session-time">{labelFromValue(req.currentSession) || 'Not specified'}</div>
          </div>
          <div className="swap-arrow">↓</div>
          <div className="session-info suggested-session">
            <div className="session-label">UC Suggested Session</div>
            <div className="session-time">{req.reviewNotes}</div>
          </div>
          {(() => {
            const { reason, appeal } = splitReasonAndAppeal(req.reason);
            return (
              <>
                <div className="reason-section">
                  <div className="reason-label">Reason</div>
                  <div className="reason-text">{reason}</div>
                </div>
                {appeal && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', textAlign: 'left' }}>Appeal</div>
                    <div className="reason-text">{appeal}</div>
                  </div>
                )}
              </>
            );
          })()}
          <div className="suggestion-actions">
            <button className="btn-accept-suggestion" onClick={() => { setSelectedSuggestion(req); setSuggestionAction('accept'); setShowSuggestedModal(true); }}>Accept Suggestion</button>
            <button className="btn-reject-suggestion" onClick={() => { setSelectedSuggestion(req); setSuggestionAction('reject'); setShowSuggestedModal(true); }}>Reject Suggestion</button>
          </div>
        </>
      );
    }
    if ((req.requestType || '').toLowerCase().includes('change')) {
      return (
        <>
          <div className="session-info">
            <div className="session-label">Current Session Will Be Removed</div>
            <div className="session-time">{labelFromValue(req.currentSession) || req.currentSession}</div>
          </div>
          {(() => {
            const { reason, appeal } = splitReasonAndAppeal(req.reason);
            return (
              <>
                <div className="reason-section">
                  <div className="reason-label">Reason</div>
                  <div className="reason-text">{reason}</div>
                </div>
                {appeal && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', textAlign: 'left' }}>Appeal</div>
                    <div className="reason-text">{appeal}</div>
                  </div>
                )}
              </>
            );
          })()}
          {statusKey(req.status) === 'rejected' && (
            <div className="appeal-actions">
              <button className="btn-appeal" onClick={() => handleOpenAppeal(req)}>Appeal decision</button>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        <div className="session-info">
          <div className="session-label">Current Session</div>
          <div className="session-time">{labelFromValue(req.currentSession) || req.currentSession}</div>
        </div>
        {req.preferredSwapTo && (
          <>
            <div className="swap-arrow">↓</div>
            <div className="session-info">
              <div className="session-label">Preferred Swap To</div>
              <div className="session-time">{labelFromValue(req.preferredSwapTo) || req.preferredSwapTo}</div>
            </div>
          </>
        )}
        {(() => {
          const { reason, appeal } = splitReasonAndAppeal(req.reason);
          return (
            <>
              <div className="reason-section">
                <div className="reason-label">Reason</div>
                <div className="reason-text">{reason}</div>
              </div>
              {appeal && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', textAlign: 'left' }}>Appeal</div>
                  <div className="reason-text">{appeal}</div>
                </div>
              )}
            </>
          );
        })()}
        {statusKey(req.status) === 'rejected' && (
          <div className="appeal-actions">
            <button className="btn-appeal" onClick={() => handleOpenAppeal(req)}>Appeal decision</button>
          </div>
        )}
      </>
    );
  };

  const renderCard = (req) => {
    const priority = (req.priority || req.Priority || '').toLowerCase();
    const isUrgent = priority === 'urgent';
    return (
      <div key={req.id} className={`request-card ${isUrgent ? 'urgent-card' : ''}`}>
        <div className="request-card-header">
          <div>
            <p className="request-card-unit">{req.unitCode || unitCodeFromSession(req.currentSession)}</p>
            <p className="request-date">Submitted {getTimeAgo(req.submittedDate)}</p>
          </div>
          <div className="header-actions">
            <div className="request-badges">
              {isUrgent && <span className="badge urgent-badge">URGENT</span>}
              <span className={`badge ${(req.requestType || '').toLowerCase().includes('swap') ? 'swap-badge' : 'change-badge'}`}>
                {(req.requestType || '').toLowerCase().includes('swap') ? 'SWAP REQUEST' : 'CHANGE REQUEST'}
              </span>
              <span className={`badge ${getStatusBadgeClass(req.status)}`}>
                {req.status}
              </span>
            </div>
            <button className="delete-btn" onClick={() => handleDelete(req.id)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="request-card-body">
          {renderCardBody(req)}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <TutorSidebar activePage="requests" />

      <main className="main-content">
        <UCPageHeader title="Request & Swap" />

        <section className="requests-section">
          <div className="requests-header">
            <div>
              <h2 className="section-title">Cover Requests</h2>
              <p className="section-count">Sessions other tutors can't make — first come, first served.</p>
            </div>
          </div>

          {coverMessage && (
            <p className={coverMessage.type === 'success' ? 'cvr-success' : 'cvr-error'}>{coverMessage.text}</p>
          )}

          {isLoadingCover ? (
            <div className="empty-state"><p className="empty-title">Loading...</p></div>
          ) : coverRequests.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">Nothing needs cover right now</p>
              <p className="empty-subtitle">Check back later, or you'll be notified when one opens up</p>
            </div>
          ) : (
            <div className="cvr-list">
              {coverRequests.map(request => (
                <div key={request.id} className="cvr-card">
                  <div className="cvr-card-main">
                    <div className="cvr-card-unit">{request.unitCode}{request.unitName ? ` — ${request.unitName}` : ''}</div>
                    {request.sessionCode && (
                      <div className="cvr-card-code">{request.sessionCode}</div>
                    )}
                    <div className="cvr-card-time">{request.day}, {request.startTime.slice(0, 5)} - {request.endTime.slice(0, 5)}</div>
                    {request.startDate && request.endDate && (
                      <div className="cvr-card-daterange">
                        {formatShortDate(request.startDate)} - {formatShortDate(request.endDate)}
                        {request.occurrenceCount ? ` · ${request.occurrenceCount} session${request.occurrenceCount === 1 ? '' : 's'}` : ''}
                      </div>
                    )}               
                    <div className="cvr-card-details">
                      {request.location ? `${request.location} · ` : ''}{request.sessionType || 'Session'}
                    </div>
                    {request.originalTutorName && (
                      <div className="cvr-card-original">Originally {request.originalTutorName}</div>
                    )}
                    {request.reason && (
                      <div className="cvr-card-reason">"{request.reason}"</div>
                    )}
                  </div>
                  <button
                    className="cvr-claim-btn"
                    onClick={() => handleClaimCover(request)}
                    disabled={claimingId === request.id}
                  >
                    {claimingId === request.id ? 'Claiming...' : 'Claim This Session'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="requests-section">
          <div className="requests-header">
            <div>
              <div className="section-title-row">
                <h2 className="section-title">Pending Status</h2>
                <div className="status-legend">
                  <div className="legend-item"><span className="legend-dot changed"></span>Changed</div>
                  <div className="legend-item"><span className="legend-dot swap"></span>Swap</div>
                  <div className="legend-item"><span className="legend-dot pending"></span>Pending</div>
                </div>
              </div>
              <p className="section-count">{activeRequests.length} pending review...</p>
            </div>
            <button className="add-request-btn" onClick={() => setShowModal(true)}>+ Request</button>
          </div>

          {activeRequests.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No active requests</p>
              <p className="empty-subtitle">Click "+ Request" to submit a swap or change request</p>
            </div>
          ) : (
            <div className="requests-list">
              {activeRequests.map(renderCard)}
            </div>
          )}
        </section>

        <section className="requests-section">
          <div className="requests-header">
            <h2 className="section-title">Confirmation Status</h2>
          </div>

          {processedRequests.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No confirmed requests yet</p>
              <p className="empty-subtitle">Accepted and rejected requests will appear here</p>
            </div>
          ) : (
            <div className="requests-list">
              {processedRequests.map(renderCard)}
            </div>
          )}
        </section>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={handleCancel}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Request session swap and change</h2>
                <p className="modal-subtitle">Submit a request to swap or modify your assigned sessions</p>
              </div>
              <button className="modal-close-btn" onClick={handleCancel}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Request type</label>
                  <select name="requestType" value={formData.requestType} onChange={handleInputChange} className="form-select">
                    <option value="Session swap">Session swap</option>
                    <option value="Session change">Session change</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select name="priority" value={formData.priority} onChange={handleInputChange} className="form-select">
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Unit <span className="required">*</span></label>
                <select name="selectedUnit" value={formData.selectedUnit} onChange={handleInputChange}
                  className={`form-select ${errors.selectedUnit ? 'error' : ''}`}>
                  <option value="">
                    {unitsLoading ? '— Loading units —' : '— Select a unit —'}
                  </option>
                  {allUnits.map(u => <option key={u.id} value={u.id}>{u.unitCode}</option>)}
                </select>
                {errors.selectedUnit && <p className="error-message">{errors.selectedUnit}</p>}
              </div>
              <div className="form-group">
                <label>Current session <span className="required">*</span></label>
                <select name="currentSession" value={formData.currentSession} onChange={handleInputChange}
                  disabled={!formData.selectedUnit || isLoadingSessions}
                  className={`form-select ${errors.currentSession ? 'error' : ''}`}>
                  <option value="">
                    {!formData.selectedUnit ? '— Select a unit first —' : isLoadingSessions ? '— Loading —' : unitSessions.length === 0 ? '— No sessions assigned to you —' : '— Select a session —'}
                  </option>
                  {unitSessions.map(s => (
                    <option key={s.id} value={sessionValue(s, selectedUnitObj?.unitCode)}>{sessionLabelWithCode(s)}</option>
                  ))}
                </select>
                {errors.currentSession && <p className="error-message">{errors.currentSession}</p>}
              </div>
              <div className="form-group">
                <label>Preferred swap to <span className="helper-text">(optional)</span></label>
                <select name="preferredSwapTo" value={formData.preferredSwapTo} onChange={handleInputChange}
                  disabled={!formData.selectedUnit || isLoadingSessions} className="form-select">
                  <option value="">
                    {!formData.selectedUnit ? '— Select a unit first —' : '— Select a session —'}
                  </option>
                  {unitSessions.filter(s => sessionValue(s, selectedUnitObj?.unitCode) !== formData.currentSession)
                    .map(s => <option key={s.id} value={sessionValue(s, selectedUnitObj?.unitCode)}>{sessionLabelWithCode(s)}</option>)}                </select>
              </div>
              <div className="form-group">
                <label>Reason for request <span className="required">*</span></label>
                <textarea name="reason" value={formData.reason} onChange={handleInputChange} rows={4}
                  className={`form-textarea ${errors.reason ? 'error' : ''}`}
                  placeholder="Please provide a detailed reason for your swap/change request..." />
                {errors.reason && <p className="error-message">{errors.reason}</p>}
                <p className="helper-text">Be specific about conflicts, commitments, or circumstances requiring this change.</p>
              </div>
              <div className="info-note">
                <span className="note-icon">⚠</span>
                <span className="note-text"><strong>Note:</strong> All requests require Unit Coordinator approval. You will be notified once reviewed.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleCancel}>Cancel</button>
              <button className="btn-submit" onClick={handleSubmit}>Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {showSuggestedModal && (
        <div className="modal-overlay" onClick={() => setShowSuggestedModal(false)}>
          <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{suggestionAction === 'accept' ? 'Accept Suggestion?' : 'Reject Suggestion?'}</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setShowSuggestedModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="suggestion-detail">
                <div className="suggestion-detail-row">
                  <span className="suggestion-detail-label">Current Session</span>
                  <span className="suggestion-detail-value">{labelFromValue(selectedSuggestion?.currentSession) || selectedSuggestion?.currentSession}</span>
                </div>
                <div className="suggestion-detail-row">
                  <span className="suggestion-detail-label">UC Suggested</span>
                  <span className="suggestion-detail-value">{selectedSuggestion?.reviewNotes}</span>
                </div>
              </div>
              <p className="suggestion-confirm-text">
                {suggestionAction === 'accept'
                  ? 'You will be assigned to the suggested session. Your current session will be removed.'
                  : 'The suggestion will be rejected. Your request will remain pending for UC review.'}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowSuggestedModal(false)}>Cancel</button>
              <button className={suggestionAction === 'accept' ? 'btn-submit' : 'btn-submit reject-btn'}
                onClick={confirmSuggestionResponse}>
                {suggestionAction === 'accept' ? 'Accept' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAppealModal && (
        <div className="modal-overlay" onClick={handleCancelAppeal}>
          <div className="modal-content modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Appeal this decision</h2>
                <p className="modal-subtitle">Add more context and resubmit this request for review.</p>
              </div>
              <button className="modal-close-btn" onClick={handleCancelAppeal}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Original reason</label>
                <p className="appeal-original-reason">{splitReasonAndAppeal(appealRequest?.reason).reason}</p>
              </div>
              {appealRequest?.reviewNotes && (
                <div className="form-group">
                  <label>Rejection note</label>
                  <p className="appeal-original-reason">{appealRequest.reviewNotes}</p>
                </div>
              )}
              <div className="form-group">
                <label>Why are you appealing? <span className="required">*</span></label>
                <textarea
                  rows={4}
                  className={`form-textarea ${appealError ? 'error' : ''}`}
                  value={appealText}
                  onChange={(e) => { setAppealText(e.target.value); setAppealError(''); }}
                  placeholder="Explain what's changed or why you'd like this reconsidered..."
                />
                {appealError && <p className="error-message">{appealError}</p>}
              </div>
              <div className="info-note">
                <span className="note-icon">⚠</span>
                <span className="note-text"><strong>Note:</strong> This will move your request back to Pending and notify your Unit Coordinator.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={handleCancelAppeal}>Cancel</button>
              <button className="btn-submit" onClick={submitAppeal} disabled={isAppealing}>
                {isAppealing ? 'Submitting...' : 'Submit appeal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && <div className="success-toast">✓ Request submitted successfully!</div>}
    </div>
  );
};

export default TutorRequests;