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
const semesterRank = { Summer: 3, 'Semester 2': 2, 'Semester 1': 1 };
const staffRoleLabel = { coordinator: 'Unit Coordinator', super_tutor: 'Super Tutor', tutor: 'Tutor' };

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
  const [modalTab, setModalTab] = useState('details');
  const [assignmentData, setAssignmentData] = useState(null);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [isAssignmentLoading, setIsAssignmentLoading] = useState(false);
  const [isAssignmentSubmitting, setIsAssignmentSubmitting] = useState(false);
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
    const terms = units.filter(unit => unit.semester && unit.year);
    const uniqueTerms = Array.from(new Map(terms.map(unit => [formatUnitTerm(unit), unit])).values());
    return uniqueTerms
      .sort((a, b) => Number(b.year) - Number(a.year)
        || (semesterRank[b.semester] || 0) - (semesterRank[a.semester] || 0))
      .map(formatUnitTerm);
  }, [units]);

  const availableStaff = useMemo(() => {
    if (!assignmentData) return [];
    const assignedIds = new Set(
      assignmentData.assigned.filter(item => item.confirmed !== false).map(item => item.id)
    );
    const query = assignmentSearch.trim().toLowerCase();
    return assignmentData.candidates.filter(item =>
      !assignedIds.has(item.id)
      && (!query || `${item.name} ${item.email}`.toLowerCase().includes(query))
    );
  }, [assignmentData, assignmentSearch]);

  const activeAssignmentCount = assignmentData
    ? assignmentData.assigned.filter(item => item.confirmed !== false).length
    : 0;

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
    setModalTab('details');
    setAssignmentData(null);
    setError('');
  };

  const loadAssignments = async (sessionId) => {
    setIsAssignmentLoading(true);
    setAssignmentError('');
    try {
      setAssignmentData(await adminAPI.getSessionAssignments(sessionId));
    } catch (err) {
      setAssignmentError(err.message || 'Failed to load session assignments');
    } finally {
      setIsAssignmentLoading(false);
    }
  };

  const openEditModal = (session, initialTab = 'details') => {
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
    setModalTab(initialTab);
    setAssignmentData(null);
    setAssignmentSearch('');
    setSelectedStaffId('');
    setAssignmentError('');
    if (initialTab === 'tutors') loadAssignments(session.id);
    setError('');
  };

  const openTutorsTab = () => {
    setModalTab('tutors');
    if (modalSession && !assignmentData) loadAssignments(modalSession.id);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalSession(null);
    setFormData(emptyForm);
    setModalTab('details');
    setAssignmentData(null);
    setAssignmentSearch('');
    setSelectedStaffId('');
    setAssignmentError('');
    setError('');
  };

  const refreshAssignmentViews = async (sessionId) => {
    await loadAssignments(sessionId);
    setSessions(await adminAPI.getSessions());
  };

  const assignStaff = async () => {
    if (!modalSession || !selectedStaffId) return;
    setIsAssignmentSubmitting(true);
    setAssignmentError('');
    try {
      await adminAPI.assignSessionTutor(modalSession.id, selectedStaffId);
      setSelectedStaffId('');
      await refreshAssignmentViews(modalSession.id);
    } catch (err) {
      setAssignmentError(err.message || 'Failed to assign staff member');
    } finally {
      setIsAssignmentSubmitting(false);
    }
  };

  const unassignStaff = async (staffId) => {
    if (!modalSession) return;
    setIsAssignmentSubmitting(true);
    setAssignmentError('');
    try {
      await adminAPI.unassignSessionTutor(modalSession.id, staffId);
      await refreshAssignmentViews(modalSession.id);
    } catch (err) {
      setAssignmentError(err.message || 'Failed to unassign staff member');
    } finally {
      setIsAssignmentSubmitting(false);
    }
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
              <th>Session</th>
              <th>When</th>
              <th>Location</th>
              <th>Capacity</th>
              <th>Tutor</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="7" className="admin-empty-cell">Loading sessions...</td></tr>
            ) : filteredSessions.length === 0 ? (
              <tr><td colSpan="7" className="admin-empty-cell">No sessions found.</td></tr>
            ) : filteredSessions.map(session => (
              <tr key={session.id}>
                <td>
                  <div className="admin-strong-cell">
                    <strong>
                      {session.unitCode}
                      {session.unitName ? ` · ${session.unitName}` : ''}
                    </strong>
                    <span>
                      {[
                        session.sessionType,
                        [String(session.semester || '').replace('Semester ', 'Sem '), session.year]
                          .filter(Boolean)
                          .join(', ')
                      ].filter(Boolean).join(' · ') || '-'}
                    </span>
                  </div>
                </td>
                <td>
                  {session.day ? `${session.day} ${formatTimeRange(session)}` : formatTimeRange(session)}
                </td>
                <td>
                  {session.location || '-'}
                  {session.campus ? ` (${session.campus})` : ''}
                </td>
                <td>
                  <div className="admin-strong-cell">
                  <strong>{session.capacity || 0}</strong>
                  <span>{session.requiredTutors || 1} tutor{Number(session.requiredTutors || 1) === 1 ? '' : 's'}</span>
                </div>
                </td>
                <td>{getTutorCell(session)}</td>
                <td>
                  <span className={`admin-pill ${(session.tutorConfirmationState || '').toLowerCase().replace(/\s+/g, '-')}`}>
                    {session.tutorConfirmationState}
                  </span>
                </td>
                <td>
                  <div className="admin-actions-cell admin-user-actions">
                    <button className="admin-action-btn primary" onClick={() => openEditModal(session)}>Modify</button>
                    <button className="admin-action-btn danger" onClick={() => setDeleteTarget(session)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-session-title">
          <div className="admin-modal wide admin-session-modal">
            <div className="admin-modal-header">
              <h2 id="admin-session-title">{modalSession ? 'Modify Session' : 'Add Session'}</h2>
              <button type="button" className="admin-icon-btn light" onClick={closeModal} aria-label="Close">x</button>
            </div>

            {modalSession && (
              <div className="admin-session-tabs" role="tablist" aria-label="Session editor sections">
                <button type="button" role="tab" aria-selected={modalTab === 'details'} className={modalTab === 'details' ? 'active' : ''} onClick={() => setModalTab('details')}>Details</button>
                <button type="button" role="tab" aria-selected={modalTab === 'tutors'} className={modalTab === 'tutors' ? 'active' : ''} onClick={openTutorsTab}>Tutors</button>
              </div>
            )}

            {modalTab === 'details' ? (
            <form onSubmit={handleSubmit}>

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
            ) : (
              <div className="admin-session-assignments">
                {assignmentError && <div className="admin-alert error">{assignmentError}</div>}
                {isAssignmentLoading && !assignmentData ? (
                  <p className="admin-muted">Loading tutors...</p>
                ) : assignmentData ? (
                  <>
                    <div className="admin-session-assignment-heading">
                      <h3>Assigned staff</h3>
                      <span className="admin-count-pill">{activeAssignmentCount} of {assignmentData.requiredTutors}</span>
                    </div>
                    {assignmentData.scheduleLocked && (
                      <div className="admin-alert error">This schedule is locked. Unlock it before changing assignments.</div>
                    )}
                    <div className="admin-session-assignment-list">
                      {assignmentData.assigned.length === 0 ? (
                        <p className="admin-muted">No staff assigned.</p>
                      ) : assignmentData.assigned.map(staff => (
                        <div className="admin-session-assignment-row" key={staff.id}>
                          <div className="admin-strong-cell">
                            <strong>{staff.name}</strong>
                            <span>{staffRoleLabel[staff.role] || 'No unit access'} · {staff.confirmed === true ? 'Confirmed' : staff.confirmed === false ? 'Declined' : 'Awaiting confirmation'}</span>
                          </div>
                          <button type="button" className="admin-action-btn danger" onClick={() => unassignStaff(staff.id)} disabled={isAssignmentSubmitting || assignmentData.scheduleLocked}>Unassign</button>
                        </div>
                      ))}
                    </div>
                    <div className="admin-session-assignment-heading">
                      <h3>Assign staff</h3>
                    </div>
                    <div className="admin-session-assignment-form">
                      <input type="search" value={assignmentSearch} onChange={event => { setAssignmentSearch(event.target.value); setSelectedStaffId(''); }} placeholder="Search unit staff" aria-label="Search unit staff" />
                      <select value={selectedStaffId} onChange={event => setSelectedStaffId(event.target.value)} aria-label="Staff to assign" disabled={assignmentData.scheduleLocked || isAssignmentSubmitting || activeAssignmentCount >= assignmentData.requiredTutors}>
                        <option value="">Select staff</option>
                        {availableStaff.map(staff => (
                          <option key={staff.id} value={staff.id}>{staff.name} · {staffRoleLabel[staff.role]}</option>
                        ))}
                      </select>
                      <button type="button" className="admin-primary-btn" onClick={assignStaff} disabled={!selectedStaffId || isAssignmentSubmitting || assignmentData.scheduleLocked || activeAssignmentCount >= assignmentData.requiredTutors}>
                        {isAssignmentSubmitting ? 'Saving...' : 'Assign'}
                      </button>
                    </div>
                    <div className="admin-modal-actions">
                      <button type="button" className="admin-secondary-btn" onClick={closeModal}>Done</button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="admin-secondary-btn" onClick={() => loadAssignments(modalSession.id)}>Retry</button>
                )}
              </div>
            )}
          </div>
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
              {deleteTarget.scheduleLocked
                ? 'This schedule is locked. Unlock it before deleting the session.'
                : deleteTarget.assignedTutorCount > 0
                  ? 'This session has assigned staff. Unassign them before deleting the session.'
                  : `Delete ${deleteTarget.unitCode} ${deleteTarget.day} ${formatTimeRange(deleteTarget)} at ${deleteTarget.location}? This cannot be undone.`}
            </p>
            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              {deleteTarget.assignedTutorCount > 0 && !deleteTarget.scheduleLocked ? (
                <button type="button" className="admin-primary-btn" onClick={() => { const session = deleteTarget; setDeleteTarget(null); openEditModal(session, 'tutors'); }}>Manage tutors</button>
              ) : !deleteTarget.scheduleLocked ? (
                <button type="button" className="admin-primary-btn danger" onClick={confirmDelete} disabled={isSubmitting}>
                  {isSubmitting ? 'Deleting...' : 'Delete session'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default AdminSessions;
