import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from './AdminShell';
import { adminAPI } from '../config/api';

const getStatusClass = (status) => String(status || '').toLowerCase().replace(/\s+/g, '-');

const formatDateTime = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const labelFromSessionValue = (value) => {
  if (!value) return '-';
  const parts = String(value).split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

const formatSuggestion = (session) => {
  const start = session.startTime ? String(session.startTime).slice(0, 5) : 'TBC';
  const end = session.endTime ? String(session.endTime).slice(0, 5) : 'TBC';
  const room = session.location || session.campus || 'Location TBC';
  const type = session.sessionType ? `${session.sessionType} - ` : '';

  return {
    id: session.id,
    label: `${type}${session.day || 'TBC'} ${start} - ${end} | ${room}`,
    availabilityLabel: session.availabilityLabel || 'Available'
  };
};

const AdminRequests = () => {
  const [requests, setRequests] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionRequest, setActionRequest] = useState(null);
  const [actionType, setActionType] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [suggestionSessions, setSuggestionSessions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadRequests = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await adminAPI.getRequests();
      setRequests(data);
    } catch (err) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const statusOptions = useMemo(() => {
    const values = new Set();
    requests.forEach(request => {
      const status = getStatusClass(request.status);
      if (status) values.add(status);
    });
    return Array.from(values).sort();
  }, [requests]);

  const unitOptions = useMemo(() => {
    const unitMap = new Map();

    requests.forEach((request) => {
      const unitCode = String(request.unitCode || '').trim();
      if (!unitCode || unitMap.has(unitCode)) return;

      unitMap.set(unitCode, {
        unitCode,
        unitName: request.unitName || ''
      });
    });

    return Array.from(unitMap.values()).sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesSearch = !term || [
        request.requestGroup,
        request.requestType,
        request.unitCode,
        request.unitName,
        request.tutorName,
        request.tutorEmail,
        request.coordinatorName,
        request.status,
        request.priority,
        request.reason,
        request.sessionLabel,
        request.location
      ].some(value => String(value || '').toLowerCase().includes(term));

      const matchesUnit = unitFilter === 'all' || request.unitCode === unitFilter;
      const matchesType = typeFilter === 'all' || request.requestGroup === typeFilter;
      const matchesStatus = statusFilter === 'all' || getStatusClass(request.status) === statusFilter;

      return matchesSearch && matchesUnit && matchesType && matchesStatus;
    });
  }, [requests, searchTerm, unitFilter, typeFilter, statusFilter]);

  const getPrimarySessionLabel = (request) => {
    if (request.requestGroup === 'Cover') {
      return request.sessionLabel || '-';
    }

    return labelFromSessionValue(request.currentSession);
  };

  const getSecondarySessionLabel = (request) => {
    if (request.requestGroup === 'Cover') {
      if (request.claimedByName || request.claimedByEmail) {
        return `Claimed by ${request.claimedByName || request.claimedByEmail}`;
      }
      return request.location || 'Open for eligible tutors';
    }

    return request.preferredSwapTo
      ? `Preferred: ${labelFromSessionValue(request.preferredSwapTo)}`
      : request.reviewNotes || 'No alternative recorded';
  };

  const closeActionModal = () => {
    setActionRequest(null);
    setActionType('');
    setReviewNotes('');
    setSuggestionSessions([]);
    setSelectedSuggestion('');
    setActionError('');
  };

  const openActionModal = async (request, type) => {
    setActionRequest(request);
    setActionType(type);
    setReviewNotes(type === 'approve' ? 'Approved by administrator' : '');
    setSuggestionSessions([]);
    setSelectedSuggestion('');
    setActionError('');

    if (type !== 'suggest') return;

    setIsActionLoading(true);
    try {
      const sessions = await adminAPI.getRequestSuggestionSessions(request.id);
      setSuggestionSessions(sessions.map(formatSuggestion));
    } catch (err) {
      setActionError(err.message || 'Failed to load suggestion sessions');
    } finally {
      setIsActionLoading(false);
    }
  };

  const submitAction = async () => {
    if (!actionRequest || !actionType) return;

    setIsActionLoading(true);
    setActionError('');

    try {
      if (actionType === 'cancel-cover') {
        await adminAPI.cancelCoverRequest(actionRequest.id);
      } else {
        const statusMap = {
          approve: 'accepted',
          reject: 'rejected',
          suggest: 'suggested'
        };
        const note = actionType === 'suggest' ? selectedSuggestion : reviewNotes;

        if (actionType === 'suggest' && !selectedSuggestion) {
          setActionError('Choose an alternative session first.');
          return;
        }

        await adminAPI.reviewRequest(actionRequest.id, statusMap[actionType], note);
      }

      await loadRequests();
      closeActionModal();
    } catch (err) {
      setActionError(err.message || 'Action failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const renderActionButtons = (request) => {
    const status = getStatusClass(request.status);

    if (request.requestGroup === 'Swap/Change' && status === 'pending') {
      return (
        <div className="admin-row-actions">
          <button className="admin-text-btn" onClick={() => openActionModal(request, 'approve')}>Approve</button>
          <button className="admin-text-btn" onClick={() => openActionModal(request, 'suggest')}>Suggest</button>
          <button className="admin-text-btn danger" onClick={() => openActionModal(request, 'reject')}>Reject</button>
        </div>
      );
    }

    if (request.requestGroup === 'Cover' && status === 'open') {
      return (
        <button className="admin-text-btn danger" onClick={() => openActionModal(request, 'cancel-cover')}>
          Cancel
        </button>
      );
    }

    return <span className="admin-muted">No action</span>;
  };

  const actionTitle = {
    approve: 'Approve Request',
    reject: 'Reject Request',
    suggest: 'Suggest Alternative Session',
    'cancel-cover': 'Cancel Cover Request'
  }[actionType] || 'Request Action';

  const actionButtonLabel = {
    approve: 'Approve',
    reject: 'Reject',
    suggest: 'Send Suggestion',
    'cancel-cover': 'Cancel Request'
  }[actionType] || 'Confirm';

  return (
    <AdminShell activePage="requests" title="Request Monitor" eyebrow="Swap, cover and change requests">
      {error && (
        <div className="admin-alert error">
          <span>{error}</span>
          <button className="admin-text-btn" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search requests"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} aria-label="Unit filter">
          <option value="all">All units</option>
          {unitOptions.map(unit => (
            <option key={unit.unitCode} value={unit.unitCode}>
              {unit.unitCode}{unit.unitName ? ` - ${unit.unitName}` : ''}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Request type filter">
          <option value="all">All request types</option>
          <option value="Swap/Change">Swap/change</option>
          <option value="Cover">Cover</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status filter">
          <option value="all">All status</option>
          {statusOptions.map(status => (
            <option key={status} value={status}>
              {status.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')}
            </option>
          ))}
        </select>
        <button className="admin-secondary-btn admin-toolbar-action" onClick={loadRequests} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Unit</th>
              <th>Tutor</th>
              <th>Session</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Review</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="8" className="admin-empty-cell">Loading requests...</td>
              </tr>
            ) : filteredRequests.length === 0 ? (
              <tr>
                <td colSpan="8" className="admin-empty-cell">No requests match your filters.</td>
              </tr>
            ) : (
              filteredRequests.map(request => (
                <tr key={`${request.requestGroup}-${request.id}`}>
                  <td>
                    <div className="admin-strong-cell">
                      <strong>{request.requestType || request.requestGroup}</strong>
                      <span>{request.reason || 'No reason provided'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-strong-cell">
                      <strong>{request.unitCode || 'No unit'}</strong>
                      <span>{request.unitName || '-'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-strong-cell">
                      <strong>{request.tutorName}</strong>
                      <span>{request.tutorEmail || '-'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-strong-cell">
                      <strong>{getPrimarySessionLabel(request)}</strong>
                      <span>{getSecondarySessionLabel(request)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-pill-row">
                      <span className={`admin-pill ${getStatusClass(request.status)}`}>
                        {request.status || 'Unknown'}
                      </span>
                      {String(request.priority || '').toLowerCase() === 'urgent' && (
                        <span className="admin-pill urgent">Urgent</span>
                      )}
                      <span className="admin-pill neutral">{request.requestGroup}</span>
                    </div>
                  </td>
                  <td>{formatDateTime(request.submittedAt)}</td>
                  <td>
                    <div className="admin-strong-cell">
                      <strong>{request.reviewedAt ? formatDateTime(request.reviewedAt) : request.claimedAt ? formatDateTime(request.claimedAt) : '-'}</strong>
                      <span>{request.coordinatorName || request.coordinatorEmail || 'No reviewer yet'}</span>
                    </div>
                  </td>
                  <td>{renderActionButtons(request)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {actionRequest && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h2>{actionTitle}</h2>
              <button className="admin-text-btn" onClick={closeActionModal} disabled={isActionLoading}>Close</button>
            </div>

            <p className="admin-modal-copy">
              {actionRequest.tutorName} - {actionRequest.unitCode || 'No unit'} - {getPrimarySessionLabel(actionRequest)}
            </p>

            {actionType === 'suggest' ? (
              <label>
                Alternative session
                <select
                  value={selectedSuggestion}
                  onChange={(event) => setSelectedSuggestion(event.target.value)}
                  disabled={isActionLoading}
                >
                  <option value="">{isActionLoading ? 'Loading sessions...' : 'Choose a session'}</option>
                  {suggestionSessions.map(session => (
                    <option key={session.id} value={session.label}>
                      {session.label} ({session.availabilityLabel})
                    </option>
                  ))}
                </select>
              </label>
            ) : actionType === 'cancel-cover' ? (
              <p className="admin-modal-copy">
                This will mark the open cover request as cancelled and notify the original tutor.
              </p>
            ) : (
              <label>
                Note
                <textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  placeholder="Add a short note for the tutor"
                  disabled={isActionLoading}
                />
              </label>
            )}

            {actionError && <div className="admin-alert error">{actionError}</div>}

            <div className="admin-modal-actions">
              <button className="admin-secondary-btn" onClick={closeActionModal} disabled={isActionLoading}>
                Back
              </button>
              <button
                className={`admin-primary-btn ${['reject', 'cancel-cover'].includes(actionType) ? 'danger' : ''}`}
                onClick={submitAction}
                disabled={isActionLoading}
              >
                {isActionLoading ? 'Saving...' : actionButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default AdminRequests;
