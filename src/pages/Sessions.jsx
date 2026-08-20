import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI, coverAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/Sessions.css';

const emptyForm = {
  day: '',
  startTime: '',
  endTime: '',
  location: '',
  campus: '',
  sessionType: '',
  capacity: '',
  requiredTutors: 1,
  status: 'Confirmed'
};

const Sessions = () => {
  const { unitId: unitIdFromUrl } = useParams();
  const navigate = useNavigate();
  const { activeUnit, activeUnitId, setActiveUnitId, isLoading: unitLoading } = useActiveUnit();

  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);

  // Cover-request broadcast: instead of ticking rows in the main table, the
  // UC opens a small modal, picks WHICH tutor can't make it, then ticks
  // just that tutor's sessions inside the modal. Keeps the table itself
  // untouched - no checkbox column cluttering the day-to-day view.
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverTutorId, setCoverTutorId] = useState('');
  const [coverSelectedIds, setCoverSelectedIds] = useState(new Set());
  const [coverReason, setCoverReason] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [coverSuccess, setCoverSuccess] = useState('');

  // If we arrived via a direct link like /sessions/:unitId, make sure that
  // becomes the active unit (e.g. clicked "Sessions" from the unit list).
  useEffect(() => {
    if (unitIdFromUrl && unitIdFromUrl !== activeUnitId) {
      setActiveUnitId(unitIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the active unit changes (via the sidebar dropdown or the effect
  // above), reload sessions for that unit without exposing the unit ID in the URL.
  useEffect(() => {
    if (!activeUnit) return;
    loadSessions(activeUnit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  const loadSessions = async (unitId) => {
    setIsLoadingSessions(true);
    try {
      const data = await sessionsAPI.getAll(unitId);
      setSessions(data);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const openAddForm = () => {
    setEditingSessionId(null);
    setFormData(emptyForm);
    setError('');
    setShowForm(true);
  };

  const openEditForm = (session) => {
    setEditingSessionId(session.id);
    setFormData({
      day: session.day || '',
      startTime: session.startTime ? session.startTime.slice(0, 5) : '',
      endTime: session.endTime ? session.endTime.slice(0, 5) : '',
      location: session.location || '',
      campus: session.campus || '',
      sessionType: session.sessionType || '',
      capacity: session.capacity || '',
      requiredTutors: session.requiredTutors || 1,
      status: session.status || 'Confirmed'
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingSessionId(null);
    setFormData(emptyForm);
    setError('');
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.day || !formData.startTime || !formData.endTime) {
      setError('Day, start time, and end time are required.');
      return;
    }

    const payload = {
      day: formData.day,
      startTime: `${formData.startTime}:00`,
      endTime: `${formData.endTime}:00`,
      location: formData.location || null,
      campus: formData.campus || null,
      sessionType: formData.sessionType || null,
      capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
      requiredTutors: formData.requiredTutors ? parseInt(formData.requiredTutors, 10) : 1,
      status: formData.status
    };

    setIsSubmitting(true);
    setError('');

    try {
      if (editingSessionId) {
        await sessionsAPI.update(activeUnit.id, editingSessionId, payload);
      } else {
        await sessionsAPI.create(activeUnit.id, payload);
      }
      closeForm();
      await loadSessions(activeUnit.id);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await sessionsAPI.delete(activeUnit.id, deleteTarget.id);
      setDeleteTarget(null);
      await loadSessions(activeUnit.id);
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Failed to delete session. Please try again.');
    }
  };

  const formatTimeRange = (start, end) => {
    const shorten = (t) => t.slice(0, 5);
    return `${shorten(start)} - ${shorten(end)}`;
  };

  // Every tutor who currently has at least one session, for the "who's out" dropdown.
  const tutorsWithSessions = Array.from(
    new Map(
      sessions
        .filter(s => s.assignedTutorId)
        .map(s => [s.assignedTutorId, s.assignedTutorName])
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const tutorSessions = sessions.filter(s => s.assignedTutorId === coverTutorId);
  const coverSelectedSessions = tutorSessions.filter(s => coverSelectedIds.has(s.id));
  const enrolmentSize = Number(activeUnit?.enrolmentSize || 0);

  const capacitySummary = useMemo(() => {
    if (!enrolmentSize || sessions.length === 0) return [];

    const byType = new Map();
    sessions
      .filter(session => (session.status || '').toLowerCase() !== 'cancelled')
      .forEach(session => {
        const type = session.sessionType || 'Unspecified';
        const capacity = Number(session.capacity || 0);
        const current = byType.get(type) || { type, capacity: 0, sessionCount: 0 };
        current.capacity += Number.isFinite(capacity) ? capacity : 0;
        current.sessionCount += 1;
        byType.set(type, current);
      });

    return Array.from(byType.values())
      .map(item => ({
        ...item,
        shortage: Math.max(enrolmentSize - item.capacity, 0),
        isEnough: item.capacity >= enrolmentSize
      }))
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [enrolmentSize, sessions]);

  const hasCapacityShortage = capacitySummary.some(item => !item.isEnough);

  const openCoverModal = () => {
    setCoverTutorId('');
    setCoverSelectedIds(new Set());
    setCoverReason('');
    setCoverError('');
    setCoverSuccess('');
    setShowCoverModal(true);
  };

  const handleCoverTutorChange = (tutorId) => {
    setCoverTutorId(tutorId);
    setCoverSelectedIds(new Set());
  };

  const toggleCoverSession = (sessionId) => {
    setCoverSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleCoverSelectAll = () => {
    if (coverSelectedIds.size === tutorSessions.length) {
      setCoverSelectedIds(new Set());
    } else {
      setCoverSelectedIds(new Set(tutorSessions.map(s => s.id)));
    }
  };

  const submitCoverBroadcast = async () => {
    if (coverSelectedSessions.length === 0) return;
    setIsBroadcasting(true);
    setCoverError('');
    try {
      const result = await coverAPI.broadcast(coverSelectedSessions.map(s => s.id), coverReason.trim());
      setCoverSuccess(`Broadcast sent to ${result.notifiedCount} tutor${result.notifiedCount === 1 ? '' : 's'}. First to claim each session gets it.`);
      setShowCoverModal(false);
    } catch (err) {
      setCoverError(err.message || 'Failed to broadcast cover request.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  if (unitLoading) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="sessions" />
        <main className="uc-main-content">
          <UCPageHeader title="Sessions" />
          <div className="ss-content">
            <div className="ss-empty-state"><p>Loading...</p></div>
          </div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="sessions" />
        <main className="uc-main-content">
          <UCPageHeader title="Sessions" />
          <div className="ss-content">
            <div className="ss-empty-state">
              <p>No unit selected. Choose one from the Active Unit menu, or create one first.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="sessions" />

      <main className="uc-main-content">
        <UCPageHeader title="Sessions" />

        <div className="ss-content">
          <div className="ss-top-row">
            <button className="ss-btn ss-btn-cover" onClick={openCoverModal}>
              Request Cover
            </button>
            <button className="ss-btn ss-btn-secondary" onClick={() => navigate('/sessions/import')}>
              Upload Session
            </button>
            <button className="ss-btn ss-btn-primary" onClick={openAddForm}>
              Add Session
            </button>
          </div>

          {coverSuccess && !showCoverModal && (
            <p className="ss-cover-success">{coverSuccess}</p>
          )}

          {!isLoadingSessions && enrolmentSize > 0 && capacitySummary.length > 0 && (
            <section className={`ss-capacity-card ${hasCapacityShortage ? 'warning' : 'ok'}`}>
              <div className="ss-capacity-header">
                <div>
                  <h2>Capacity Check</h2>
                  <p>
                    Enrolment size: {enrolmentSize}. Session capacity is checked separately for each teaching type in this unit.
                  </p>
                </div>
                <span className={`ss-capacity-overall ${hasCapacityShortage ? 'warning' : 'ok'}`}>
                  {hasCapacityShortage ? 'Needs review' : 'All good'}
                </span>
              </div>

              <div className="ss-capacity-grid">
                {capacitySummary.map(item => (
                  <div key={item.type} className="ss-capacity-item">
                    <div>
                      <div className="ss-capacity-type">{item.type}</div>
                      <div className="ss-capacity-meta">
                        {item.sessionCount} session{item.sessionCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="ss-capacity-numbers">
                      <strong>{item.capacity}</strong> / {enrolmentSize}
                      <span className={`ss-capacity-status ${item.isEnough ? 'ok' : 'warning'}`}>
                        {item.isEnough ? 'OK' : `Need ${item.shortage} more`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showForm && (
            <div className="ss-form-card">
              <h3>{editingSessionId ? 'Edit Session' : 'Add Session'}</h3>

              {error && <p className="ss-error">{error}</p>}

              <form onSubmit={handleSubmit}>
                <div className="ss-form-grid">
                  <div className="ss-field">
                    <label>Day</label>
                    <select name="day" value={formData.day} onChange={handleChange}>
                      <option value="">-- Select day --</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                    </select>
                  </div>

                  <div className="ss-field">
                    <label>Start Time</label>
                    <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} />
                  </div>

                  <div className="ss-field">
                    <label>End Time</label>
                    <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} />
                  </div>

                  <div className="ss-field">
                    <label>Location</label>
                    <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. GP-P-419" />
                  </div>

                  <div className="ss-field">
                    <label>Campus</label>
                    <select name="campus" value={formData.campus} onChange={handleChange}>
                      <option value="">-- Select --</option>
                      <option value="GP">Gardens Point (GP)</option>
                      <option value="KG">Kelvin Grove (KG)</option>
                      <option value="ONL">Online (ONL)</option>
                    </select>
                  </div>

                  <div className="ss-field">
                    <label>Type</label>
                    <select name="sessionType" value={formData.sessionType} onChange={handleChange}>
                      <option value="">-- Select --</option>
                      <option value="Lecture">Lecture</option>
                      <option value="Tutorial">Tutorial</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Practical">Practical</option>
                      <option value="Consultation">Consultation</option>
                    </select>
                  </div>

                  <div className="ss-field">
                    <label>Capacity</label>
                    <input type="number" name="capacity" value={formData.capacity} onChange={handleChange} min="0" placeholder="e.g. 25" />
                  </div>

                  <div className="ss-field">
                    <label>Tutor</label>
                    <input type="number" name="requiredTutors" value={formData.requiredTutors} onChange={handleChange} min="1" placeholder="e.g. 1" />
                  </div>

                  <div className="ss-field">
                    <label>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange}>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Tentative">Tentative</option>
                      <option value="Draft">Draft</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="ss-form-buttons">
                  <button type="submit" className="ss-btn ss-btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="ss-btn ss-btn-secondary" onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {isLoadingSessions ? (
            <div className="ss-empty-state"><p>Loading sessions...</p></div>
          ) : sessions.length === 0 ? (
            <div className="ss-empty-state"><p>No session available.</p></div>
          ) : (
            <table className="ss-table">
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th>Campus</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Tutor</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id}>
                    <td>{session.day}</td>
                    <td>{formatTimeRange(session.startTime, session.endTime)}</td>
                    <td>{session.location || '-'}</td>
                    <td>{session.campus || '-'}</td>
                    <td>{session.sessionType || '-'}</td>
                    <td>{session.capacity || '-'}</td>
                    <td>{session.assignedTutorName || <span className="ss-unassigned">Unassigned</span>}</td>
                    <td>
                      <span className={`ss-status-badge ${(session.status || '').toLowerCase()}`}>
                        {session.status}
                      </span>
                    </td>
                    <td>
                      <div className="ss-row-actions">
                        <button className="ss-icon-btn" onClick={() => openEditForm(session)} aria-label="Edit session">
                          Edit
                        </button>
                        <button className="ss-icon-btn delete" onClick={() => setDeleteTarget(session)} aria-label="Delete session">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showCoverModal && (
        <div className="ss-modal-overlay" onClick={() => !isBroadcasting && setShowCoverModal(false)}>
          <div className="ss-modal-content ss-cover-modal" onClick={e => e.stopPropagation()}>
            <h3>Request Cover</h3>
            <p>Pick the tutor who can't make it, tick which of their sessions need covering, and every other tutor on the unit gets notified. First to claim each session gets it.</p>

            <div className="ss-cover-field">
              <label>Which tutor?</label>
              <select value={coverTutorId} onChange={(e) => handleCoverTutorChange(e.target.value)}>
                <option value="">-- Select a tutor --</option>
                {tutorsWithSessions.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {coverTutorId && (
              tutorSessions.length === 0 ? (
                <p className="ss-cover-empty">This tutor has no sessions in this unit.</p>
              ) : (
                <>
                  <div className="ss-cover-list-header">
                    <label className="ss-cover-select-all">
                      <input
                        type="checkbox"
                        checked={coverSelectedIds.size === tutorSessions.length}
                        onChange={toggleCoverSelectAll}
                      />
                      Select all ({tutorSessions.length})
                    </label>
                  </div>
                  <ul className="ss-cover-session-list ss-cover-session-list-checkable">
                    {tutorSessions.map(s => (
                      <li key={s.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={coverSelectedIds.has(s.id)}
                            onChange={() => toggleCoverSession(s.id)}
                          />
                          {s.day}, {formatTimeRange(s.startTime, s.endTime)}
                          {s.location ? ` at ${s.location}` : ''}
                        </label>
                      </li>
                    ))}
                  </ul>

                  <textarea
                    placeholder="Reason (optional) — e.g. Alex is on leave this week"
                    value={coverReason}
                    onChange={(e) => setCoverReason(e.target.value)}
                  />
                </>
              )
            )}

            {coverError && <p className="ss-error">{coverError}</p>}

            <div className="ss-modal-buttons">
              <button className="cancel" onClick={() => setShowCoverModal(false)} disabled={isBroadcasting}>
                Cancel
              </button>
              <button
                className="confirm"
                onClick={submitCoverBroadcast}
                disabled={isBroadcasting || coverSelectedSessions.length === 0}
              >
                {isBroadcasting ? 'Sending...' : `Send (${coverSelectedSessions.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="ss-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="ss-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Delete this session?</h3>
            <p>{deleteTarget.day}, {formatTimeRange(deleteTarget.startTime, deleteTarget.endTime)} at {deleteTarget.location || 'no location set'}. This cannot be undone.</p>
            <div className="ss-modal-buttons">
              <button className="cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="confirm" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sessions;
