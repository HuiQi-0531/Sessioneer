import React, { useState, useEffect } from 'react';
import { requestsAPI, sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorRequests.css';

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
const sessionValue = (s, unitCode) => `${unitCode}::${s.day} ${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}|${s.location || 'TBA'}`;

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

  const activeRequests = requests.filter(r => isActive(r.status));
  const processedRequests = requests.filter(r => isProcessed(r.status));

  useEffect(() => { fetchRequests(); }, []);

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
          <div className="reason-section">
            <div className="reason-label">Reason</div>
            <div className="reason-text">{req.reason}</div>
          </div>
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
          <div className="reason-section">
            <div className="reason-label">Reason</div>
            <div className="reason-text">{req.reason}</div>
          </div>
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
        <div className="reason-section">
          <div className="reason-label">Reason</div>
          <div className="reason-text">{req.reason}</div>
        </div>
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
                    <option key={s.id} value={sessionValue(s, selectedUnitObj?.unitCode)}>{sessionLabel(s)}</option>
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
                    .map(s => <option key={s.id} value={sessionValue(s, selectedUnitObj?.unitCode)}>{sessionLabel(s)}</option>)}
                </select>
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

      {showSuccess && <div className="success-toast">✓ Request submitted successfully!</div>}
    </div>
  );
};

export default TutorRequests;