import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI } from '../config/api';
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

  // If we arrived via a direct link like /sessions/:unitId, make sure that
  // becomes the active unit (e.g. clicked "Sessions" from the unit list).
  useEffect(() => {
    if (unitIdFromUrl && unitIdFromUrl !== activeUnitId) {
      setActiveUnitId(unitIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the active unit changes (via the sidebar dropdown or the effect
  // above), keep the URL in sync and reload sessions for that unit.
  useEffect(() => {
    if (!activeUnit) return;

    if (unitIdFromUrl !== activeUnit.id) {
      navigate(`/sessions/${activeUnit.id}`, { replace: true });
    }
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

  if (unitLoading) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="sessions" />
        <main className="uc-main-content">
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
            <button className="ss-btn ss-btn-secondary" onClick={() => navigate(`/sessions/${activeUnit.id}/import`)}>
              Upload Session
            </button>
            <button className="ss-btn ss-btn-primary" onClick={openAddForm}>
              Add Session
            </button>
          </div>

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
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th>Campus</th>
                  <th>Type</th>
                  <th>Capacity</th>
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