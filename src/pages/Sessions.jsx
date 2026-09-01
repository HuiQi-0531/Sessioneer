import React, { useState, useEffect, useRef} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI, coverAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/Sessions.css';

// Same rule as ScheduleBuilder.jsx's suggestion badge — keep both in sync.
const STUDENTS_PER_TUTOR = 30;
const suggestedTutorCount = (capacity) => Math.floor((capacity || 0) / STUDENTS_PER_TUTOR) + 1;

const emptyForm = {
  day: '',
  startTime: '',
  endTime: '',
  location: '',
  campus: '',
  sessionType: '',
  capacity: '',
  requiredTutors: 1,
  sessionCode: '',
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

    // Tracks whether the UC has manually typed into the "Tutor" field this
  // time the form is open. While false, changing Capacity auto-fills a
  // suggested tutor count; once the UC touches it directly, we stop
  // overwriting their choice.
  const [requiredTutorsTouched, setRequiredTutorsTouched] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [tutorSortDirection, setTutorSortDirection] = useState(null);
  const [showTutorSortMenu, setShowTutorSortMenu] = useState(false);
  const [tutorSortMenuPos, setTutorSortMenuPos] = useState({ top: 0, left: 0 });
  const tutorSortButtonRef = useRef(null);  

  // Cover-request broadcast: instead of ticking rows in the main table, the
  // UC opens a small modal, picks WHICH tutor can't make it, then ticks
  // just that tutor's sessions inside the modal. Keeps the table itself
  // untouched - no checkbox column cluttering the day-to-day view.
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverTutorId, setCoverTutorId] = useState('');
  const [coverSelectedIds, setCoverSelectedIds] = useState(new Set());
  const [coverReason, setCoverReason] = useState('');
  const [coverStartDate, setCoverStartDate] = useState('');
  const [coverEndDate, setCoverEndDate] = useState('');
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

  const tutorSortMenuRef = useRef(null);

  useEffect(() => {
    if (!showTutorSortMenu) return;

    const handleClickOutside = (event) => {
      if (tutorSortMenuRef.current && !tutorSortMenuRef.current.contains(event.target)) {
        setShowTutorSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTutorSortMenu]);

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
    setRequiredTutorsTouched(false);
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
      sessionCode: session.sessionCode || '',
      status: session.status || 'Confirmed'
    });
    setError('');
    setRequiredTutorsTouched(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingSessionId(null);
    setFormData(emptyForm);
    setError('');
    setRequiredTutorsTouched(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'requiredTutors') {
      setRequiredTutorsTouched(true);
      setFormData({ ...formData, requiredTutors: value });
      return;
    }

    if (name === 'capacity' && !requiredTutorsTouched) {
      setFormData({
        ...formData,
        capacity: value,
        requiredTutors: suggestedTutorCount(value ? parseInt(value, 10) : null)
      });
      return;
    }

    setFormData({ ...formData, [name]: value });
   };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const requiredFields = [
      { value: formData.day, label: 'Day' },
      { value: formData.startTime, label: 'Start time' },
      { value: formData.endTime, label: 'End time' },
      { value: formData.location, label: 'Location' },
      { value: formData.campus, label: 'Campus' },
      { value: formData.sessionType, label: 'Type' },
      { value: formData.capacity, label: 'Capacity' },
      { value: formData.requiredTutors, label: 'Tutor' },
      { value: formData.status, label: 'Status' }
    ];

    const missingFields = requiredFields
      .filter(field => String(field.value ?? '').trim() === '')
      .map(field => field.label);

    if (missingFields.length > 0) {
      setError(`Please fill in all fields before saving: ${missingFields.join(', ')}.`);
      return;
    }

    const capacityNumber = parseInt(formData.capacity, 10);
    const requiredTutorsNumber = parseInt(formData.requiredTutors, 10);

    if (Number.isNaN(capacityNumber) || capacityNumber < 1) {
      setError('Capacity must be at least 1.');
      return;
    }

    if (Number.isNaN(requiredTutorsNumber) || requiredTutorsNumber < 1) {
      setError('Tutor must be at least 1.');
      return;
    }

    const payload = {
      day: formData.day,
      startTime: `${formData.startTime}:00`,
      endTime: `${formData.endTime}:00`,
      location: formData.location.trim(),
      campus: formData.campus,
      sessionType: formData.sessionType,
      capacity: capacityNumber,
      requiredTutors: requiredTutorsNumber,
      sessionCode: formData.sessionCode.trim() || null,
      status: formData.status
    };

    if (enrolmentSize > 0 && payload.sessionType && payload.capacity && payload.status !== 'Cancelled') {
      const existingCapacityForType = sessions
        .filter(session => session.id !== editingSessionId)
        .filter(session => (session.status || '').toLowerCase() !== 'cancelled')
        .filter(session => (session.sessionType || '') === payload.sessionType)
        .reduce((total, session) => total + Number(session.capacity || 0), 0);

      const newTotalCapacity = existingCapacityForType + payload.capacity;

      if (newTotalCapacity > enrolmentSize) {
        const remainingCapacity = Math.max(enrolmentSize - existingCapacityForType, 0);
        setError(
          `${payload.sessionType} capacity is already ${existingCapacityForType}/${enrolmentSize}. ` +
          `You can add up to ${remainingCapacity} more for this teaching type.`
        );
        return;
      }
    }

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

  const applyTutorSort = (direction) => {
    setTutorSortDirection(direction);
    setShowTutorSortMenu(false);
  };

const displayedSessions = React.useMemo(() => {
  if (!tutorSortDirection) return sessions;

  return [...sessions].sort((a, b) => {
    const nameA = a.assignedTutorName || '';
    const nameB = b.assignedTutorName || '';

    if (!nameA && !nameB) return 0;
    if (!nameA) return 1;
    if (!nameB) return -1;

    return tutorSortDirection === 'asc'
      ? nameA.localeCompare(nameB)
      : nameB.localeCompare(nameA);
  });
}, [sessions, tutorSortDirection]);

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

  const openCoverModal = () => {
    setCoverTutorId('');
    setCoverSelectedIds(new Set());
    setCoverReason('');
    setCoverStartDate('');
    setCoverEndDate('');
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
    if (!coverStartDate || !coverEndDate) {
      setCoverError('Please select the date range this covers.');
      return;
    }
    if (coverStartDate > coverEndDate) {
      setCoverError('Start date must be before the end date.');
      return;
    }
    setIsBroadcasting(true);
    setCoverError('');
    try {
      const result = await coverAPI.broadcast(coverSelectedSessions.map(s => s.id), coverReason.trim(), coverStartDate, coverEndDate);      setCoverSuccess(`Broadcast sent to ${result.notifiedCount} tutor${result.notifiedCount === 1 ? '' : 's'}. First to claim each session gets it.`);
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

            <div className="ss-top-actions">
              <button className="ss-btn ss-btn-secondary" onClick={() => navigate('/sessions/import')}>
                Upload Session
              </button>
              <button className="ss-btn ss-btn-primary" onClick={openAddForm}>
                Add Session
              </button>
            </div>
          </div>

          {coverSuccess && !showCoverModal && (
            <p className="ss-cover-success">{coverSuccess}</p>
          )}

          {showForm && (
            <div className="ss-form-card">
              <h3>{editingSessionId ? 'Edit Session' : 'Add Session'}</h3>

              {error && <p className="ss-error">{error}</p>}

              <form onSubmit={handleSubmit}>
                <div className="ss-form-grid">
                  <div className="ss-field">
                    <label>Day<span className="ss-required">*</span></label>
                    <select name="day" value={formData.day} onChange={handleChange} required>
                      <option value="">-- Select day --</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                    </select>
                  </div>

                  <div className="ss-field">
                    <label>Start Time<span className="ss-required">*</span></label>
                    <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} required />
                  </div>

                  <div className="ss-field">
                    <label>End Time<span className="ss-required">*</span></label>
                    <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} required />
                  </div>

                  <div className="ss-field">
                    <label>Location<span className="ss-required">*</span></label>
                    <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. GP-P-419" required />
                  </div>

                  <div className="ss-field">
                    <label>Campus<span className="ss-required">*</span></label>
                    <select name="campus" value={formData.campus} onChange={handleChange} required>
                      <option value="">-- Select --</option>
                      <option value="GP">Gardens Point (GP)</option>
                      <option value="KG">Kelvin Grove (KG)</option>
                      <option value="ONL">Online (ONL)</option>
                    </select>
                  </div>

                  <div className="ss-field">
                    <label>Type<span className="ss-required">*</span></label>
                    <select name="sessionType" value={formData.sessionType} onChange={handleChange} required>
                      <option value="">-- Select --</option>
                      <option value="Lecture">Lecture</option>
                      <option value="Tutorial">Tutorial</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Practical">Practical</option>
                      <option value="Consultation">Consultation</option>
                    </select>
                  </div>

                  <div className="ss-field">
                    <label>Capacity<span className="ss-required">*</span></label>
                    <input type="number" name="capacity" value={formData.capacity} onChange={handleChange} min="1" placeholder="e.g. 25" required />
                  </div>

                  <div className="ss-field">
                    <label>Tutor<span className="ss-required">*</span></label>
                    <input type="number" name="requiredTutors" value={formData.requiredTutors} onChange={handleChange} min="1" placeholder="e.g. 1" required />
                    {!requiredTutorsTouched && formData.capacity && suggestedTutorCount(parseInt(formData.capacity, 10)) > 1 && (
                      <p className="ss-field-hint">Auto-suggested from capacity - edit if needed</p>
                    )}
                  </div>

                  <div className="ss-field">
                    <label>Session Code <span className="ss-field-hint" style={{ fontWeight: 400 }}>(optional — auto-generated if left blank)</span></label>
                    <input type="text" name="sessionCode" value={formData.sessionCode} onChange={handleChange} placeholder="e.g. TUT01" />
                  </div>

                  <div className="ss-field">
                    <label>Status<span className="ss-required">*</span></label>
                    <select name="status" value={formData.status} onChange={handleChange} required>
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
                <col style={{ width: '7%' }} />
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
                  <th>Code</th>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th>Campus</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th ref={tutorSortMenuRef} style={{ position: 'relative' }}>
                    <span>Tutor</span>
                    <button
                      type="button"
                      ref={tutorSortButtonRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!showTutorSortMenu && tutorSortButtonRef.current) {
                          const rect = tutorSortButtonRef.current.getBoundingClientRect();
                          setTutorSortMenuPos({ top: rect.bottom + 4, left: rect.left });
                        }
                        setShowTutorSortMenu(prev => !prev);
                      }}
                      style={{
                        marginLeft: 6,
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        background: '#fff',
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: '2px 6px',
                        color: tutorSortDirection ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        verticalAlign: 'middle',
                      }}
                      aria-label="Sort by tutor"
                    >
                      ▾
                    </button>

                    {showTutorSortMenu && (
                    <div
                      style={{
                        position: 'fixed',
                        top: tutorSortMenuPos.top,
                        left: tutorSortMenuPos.left,
                        background: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        padding: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        zIndex: 9999,
                        minWidth: 130,
                        textAlign: 'left',
                      }}
                    >
                      
                        <button
                          type="button"
                          onClick={() => applyTutorSort('asc')}
                          style={{
                            border: 'none',
                            background: tutorSortDirection === 'asc' ? '#f0edff' : 'none',
                            textAlign: 'left',
                            padding: '6px 10px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            textTransform: 'none',
                            color: '#333',
                          }}
                        >
                          Ascending (A-Z)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyTutorSort('desc')}
                          style={{
                            border: 'none',
                            background: tutorSortDirection === 'desc' ? '#f0edff' : 'none',
                            textAlign: 'left',
                            padding: '6px 10px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            textTransform: 'none',
                            color: '#333',
                          }}
                        >
                          Descending (Z-A)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyTutorSort(null)}
                          style={{
                            border: 'none',
                            background: 'none',
                            textAlign: 'left',
                            padding: '6px 10px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            textTransform: 'none',
                            color: '#333',
                          }}
                        >
                          Clear sort
                        </button>
                      </div>
                    )}
                  </th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedSessions.map(session => (
                  <tr key={session.id}>
                    <td>{session.sessionCode || '-'}</td>
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
                          {s.sessionCode ? `${s.sessionCode} · ` : ''}
                          {s.day}, {formatTimeRange(s.startTime, s.endTime)}
                          {s.location ? ` at ${s.location}` : ''}
                        </label>
                      </li>
                    ))}
                  </ul>

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Covering from</label>
                      <input type="date" value={coverStartDate} onChange={(e) => setCoverStartDate(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Until</label>
                      <input type="date" value={coverEndDate} onChange={(e) => setCoverEndDate(e.target.value)} min={coverStartDate || undefined} />
                    </div>
                  </div>       
                    
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
