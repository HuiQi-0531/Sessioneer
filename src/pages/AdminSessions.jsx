import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from './AdminShell';
import { adminAPI } from '../config/api';

const emptyForm = {
  unitId: '',
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

const dayOptions = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const campusOptions = ['GP', 'KG', 'ONL'];
const sessionTypeOptions = ['Lecture', 'Tutorial', 'Practical', 'Workshop', 'Consultation', 'FRI'];
const statusOptions = ['Draft', 'Tentative', 'Confirmed', 'Cancelled'];

const toTimeInput = (time) => time ? String(time).slice(0, 5) : '';
const toApiTime = (time) => time && time.length === 5 ? `${time}:00` : time;
const formatUnitTerm = (unit) => [unit?.semester, unit?.year].filter(Boolean).join(', ');

const AdminSessions = () => {
  const [sessions, setSessions] = useState([]);
  const [units, setUnits] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalSession, setModalSession] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [sessionData, unitData] = await Promise.all([
        adminAPI.getSessions(),
        adminAPI.getUnits()
      ]);
      setSessions(sessionData);
      setUnits(unitData);
    } catch (err) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSessions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return sessions.filter((session) => {
      const matchesSearch = !term || [
        session.unitCode,
        session.unitName,
        session.semester,
        session.year,
        session.day,
        session.location,
        session.campus,
        session.sessionType,
        session.assignedTutors
      ].some(value => String(value || '').toLowerCase().includes(term));

      const matchesUnit = unitFilter === 'all' || session.unitCode === unitFilter;
      const matchesSemester = semesterFilter === 'all' || formatUnitTerm(session) === semesterFilter;
      const matchesStatus = statusFilter === 'all'
        || String(session.status || '').toLowerCase() === statusFilter
        || String(session.tutorConfirmationState || '').toLowerCase().replace(/\s+/g, '-') === statusFilter;

      return matchesSearch && matchesUnit && matchesSemester && matchesStatus;
    });
  }, [sessions, searchTerm, unitFilter, semesterFilter, statusFilter]);

  const semesterOptions = useMemo(() => {
    const terms = units
      .map(formatUnitTerm)
      .filter(Boolean);
    return Array.from(new Set(terms)).sort((a, b) => b.localeCompare(a));
  }, [units]);

  const unitOptions = useMemo(() => {
    const unitMap = new Map();
    units.forEach((unit) => {
      if (!unit.unitCode || unitMap.has(unit.unitCode)) return;
      unitMap.set(unit.unitCode, unit);
    });
    return Array.from(unitMap.values()).sort((a, b) => a.unitCode.localeCompare(b.unitCode));
  }, [units]);

  const openCreateModal = () => {
    setModalSession(null);
    setFormData({
      ...emptyForm,
      unitId: ''
    });
    setIsModalOpen(true);
    setError('');
  };

  const openEditModal = (session) => {
    setModalSession(session);
    setFormData({
      unitId: session.unitId || '',
      day: session.day || '',
      startTime: toTimeInput(session.startTime),
      endTime: toTimeInput(session.endTime),
      location: session.location || '',
      campus: session.campus || '',
      sessionType: session.sessionType || '',
      capacity: session.capacity || '',
      requiredTutors: session.requiredTutors || 1,
      status: session.status || 'Confirmed'
    });
    setIsModalOpen(true);
    setError('');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalSession(null);
    setFormData(emptyForm);
    setError('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    const payload = {
      ...formData,
      startTime: toApiTime(formData.startTime),
      endTime: toApiTime(formData.endTime),
      capacity: Number(formData.capacity),
      requiredTutors: Number(formData.requiredTutors)
    };

    try {
      if (modalSession) {
        await adminAPI.updateSession(modalSession.id, payload);
      } else {
        await adminAPI.createSession(payload);
      }
      closeModal();
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    setError('');

    try {
      await adminAPI.deleteSession(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimeRange = (session) => {
    if (!session.startTime || !session.endTime) return '-';
    return `${toTimeInput(session.startTime)} - ${toTimeInput(session.endTime)}`;
  };

  const getTutorCell = (session) => {
    if (!session.assignedTutors) return <span className="admin-muted">Unassigned</span>;
    return session.assignedTutors;
  };

  return (
    <AdminShell activePage="sessions" title="Session Management" eyebrow="Schedules and allocation">
      {error && (
        <div className="admin-alert error">
          <span>{error}</span>
          <button className="admin-text-btn" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search sessions"
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
        <select value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} aria-label="Semester filter">
          <option value="all">All semesters</option>
          {semesterOptions.map(term => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status filter">
          <option value="all">All status</option>
          <option value="unassigned">Unassigned</option>
          <option value="awaiting-confirmation">Awaiting confirmation</option>
          <option value="confirmed">Confirmed</option>
          <option value="draft">Draft</option>
          <option value="tentative">Tentative</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="admin-primary-btn admin-toolbar-action" onClick={openCreateModal}>
          Add session
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Semester</th>
              <th>Day</th>
              <th>Time</th>
              <th>Location</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Tutor</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="10" className="admin-empty-cell">Loading sessions...</td></tr>
            ) : filteredSessions.length === 0 ? (
              <tr><td colSpan="10" className="admin-empty-cell">No sessions found.</td></tr>
            ) : filteredSessions.map(session => (
              <tr key={session.id}>
                <td>
                  <div className="admin-strong-cell">
                    <strong>{session.unitCode}</strong>
                    <span>{session.unitName}</span>
                  </div>
                </td>
                <td>{formatUnitTerm(session) || '-'}</td>
                <td>{session.day}</td>
                <td>{formatTimeRange(session)}</td>
                <td>{session.location || '-'}{session.campus ? ` (${session.campus})` : ''}</td>
                <td>{session.sessionType || '-'}</td>
                <td>
                  <div className="admin-unit-summary">
                    <strong>{session.capacity || 0}</strong>
                    <span>{session.requiredTutors || 1} tutor{Number(session.requiredTutors || 1) === 1 ? '' : 's'}</span>
                  </div>
                </td>
                <td>{getTutorCell(session)}</td>
                <td>
                  <div className="admin-pill-row">
                    <span className={`admin-pill ${(session.status || '').toLowerCase()}`}>{session.status || 'Draft'}</span>
                    <span className={`admin-pill ${(session.tutorConfirmationState || '').toLowerCase().replace(/\s+/g, '-')}`}>
                      {session.tutorConfirmationState}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-text-btn" onClick={() => openEditModal(session)}>Modify</button>
                    <button className="admin-text-btn danger" onClick={() => setDeleteTarget(session)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="admin-modal-backdrop">
          <form className="admin-modal wide" onSubmit={handleSubmit}>
            <div className="admin-modal-header">
              <h2>{modalSession ? 'Modify Session' : 'Add Session'}</h2>
              <button type="button" className="admin-icon-btn light" onClick={closeModal}>x</button>
            </div>

            <label>
              Unit
              <select name="unitId" value={formData.unitId} onChange={handleChange} required>
                <option value="">Select unit</option>
                {units.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    {unit.unitCode} - {unit.unitName}{formatUnitTerm(unit) ? ` (${formatUnitTerm(unit)})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="admin-form-grid">
              <label>
                Day
                <select name="day" value={formData.day} onChange={handleChange} required>
                  <option value="">Select day</option>
                  {dayOptions.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
              </label>
              <label>
                Type
                <select name="sessionType" value={formData.sessionType} onChange={handleChange} required>
                  <option value="">Select type</option>
                  {sessionTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Start time
                <input type="time" name="startTime" value={formData.startTime} onChange={handleChange} required />
              </label>
              <label>
                End time
                <input type="time" name="endTime" value={formData.endTime} onChange={handleChange} required />
              </label>
              <label>
                Location
                <input name="location" value={formData.location} onChange={handleChange} placeholder="e.g. GP-P-419" required />
              </label>
              <label>
                Campus
                <select name="campus" value={formData.campus} onChange={handleChange} required>
                  <option value="">Select campus</option>
                  {campusOptions.map(campus => <option key={campus} value={campus}>{campus}</option>)}
                </select>
              </label>
              <label>
                Capacity
                <input type="number" name="capacity" min="1" value={formData.capacity} onChange={handleChange} required />
              </label>
              <label>
                Tutors required
                <input type="number" name="requiredTutors" min="1" value={formData.requiredTutors} onChange={handleChange} required />
              </label>
              <label>
                Status
                <select name="status" value={formData.status} onChange={handleChange} required>
                  {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-btn" onClick={closeModal}>Cancel</button>
              <button type="submit" className="admin-primary-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save session'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h2>Delete Session</h2>
              <button type="button" className="admin-icon-btn light" onClick={() => setDeleteTarget(null)}>x</button>
            </div>
            <p className="admin-modal-copy">
              Delete {deleteTarget.unitCode} {deleteTarget.day} {formatTimeRange(deleteTarget)} at {deleteTarget.location}? This cannot be undone.
            </p>
            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="admin-primary-btn danger" onClick={confirmDelete} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Delete session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default AdminSessions;
