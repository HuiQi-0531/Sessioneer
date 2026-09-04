import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from './AdminShell';
import { adminAPI } from '../config/api';

const SEMESTER_OPTIONS = ['Semester 1', 'Semester 2', 'Summer'];

const emptyForm = {
  unitCode: '',
  unitName: '',
  semester: 'Semester 1',
  year: new Date().getFullYear(),
  enrolmentSize: '',
  availabilityDeadline: '',
  coordinatorEmail: ''
};

const formatSemester = (unit) => {
  return [unit.semester, unit.year].filter(Boolean).join(', ');
};

const formatDateInput = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const getMainCoordinatorDisplay = (unit) => {
  if (unit.mainCoordinatorName) {
    return unit.mainCoordinatorName;
  }

  return unit.mainCoordinatorEmail || 'Not set';
};

const AdminUnits = () => {
  const [units, setUnits] = useState([]);
  const [query, setQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalUnit, setModalUnit] = useState(undefined);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [tutorUnit, setTutorUnit] = useState(null);
  const [unitTutors, setUnitTutors] = useState([]);
  const [tutorEmail, setTutorEmail] = useState('');
  const [tutorRole, setTutorRole] = useState('tutor');
  const [tutorError, setTutorError] = useState('');
  const [isTutorLoading, setIsTutorLoading] = useState(false);

  const loadUnits = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await adminAPI.getUnits();
      setUnits(data);
    } catch (err) {
      setError(err.message || 'Failed to load units');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUnits();
  }, []);

  const semesterOptions = useMemo(() => {
    return [...new Set(units.map(formatSemester).filter(Boolean))];
  }, [units]);

  const filteredUnits = useMemo(() => {
    const search = query.trim().toLowerCase();

    return units.filter(unit => {
      const semesterLabel = formatSemester(unit);
      const matchesSemester = semesterFilter === 'all' || semesterLabel === semesterFilter;
      const matchesSearch = !search ||
        unit.unitCode?.toLowerCase().includes(search) ||
        unit.unitName?.toLowerCase().includes(search) ||
        unit.coordinators?.toLowerCase().includes(search) ||
        unit.mainCoordinatorName?.toLowerCase().includes(search) ||
        unit.mainCoordinatorEmail?.toLowerCase().includes(search);

      return matchesSemester && matchesSearch;
    });
  }, [query, semesterFilter, units]);

  const openCreateModal = () => {
    setModalUnit(null);
    setFormData(emptyForm);
    setFormError('');
  };

  const openEditModal = (unit) => {
    setModalUnit(unit);
    setFormData({
      unitCode: unit.unitCode || '',
      unitName: unit.unitName || '',
      semester: unit.semester || 'Semester 1',
      year: unit.year || new Date().getFullYear(),
      enrolmentSize: unit.enrolmentSize || '',
      availabilityDeadline: formatDateInput(unit.availabilityDeadline),
      coordinatorEmail: unit.mainCoordinatorEmail || ''
    });
    setFormError('');
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalUnit(undefined);
    setFormError('');
  };

  const updateForm = (event) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const saveUnit = async (event) => {
    event.preventDefault();
    setFormError('');

    const payload = {
      unitCode: formData.unitCode.trim(),
      unitName: formData.unitName.trim(),
      semester: formData.semester,
      year: Number(formData.year),
      enrolmentSize: formData.enrolmentSize ? Number(formData.enrolmentSize) : null,
      availabilityDeadline: formData.availabilityDeadline || null,
      coordinatorEmail: formData.coordinatorEmail.trim()
    };

    if (!payload.unitCode || !payload.unitName || !payload.semester || !payload.year || !payload.coordinatorEmail) {
      setFormError('Please complete all required fields.');
      return;
    }

    try {
      setIsSaving(true);
      const savedUnit = modalUnit
        ? await adminAPI.updateUnit(modalUnit.id, payload)
        : await adminAPI.createUnit(payload);

      setUnits(prevUnits => {
        if (!modalUnit) return [savedUnit, ...prevUnits];
        return prevUnits.map(unit => unit.id === savedUnit.id ? savedUnit : unit);
      });
      setModalUnit(undefined);
      setFormError('');
    } catch (err) {
      setFormError(err.message || 'Failed to save unit');
    } finally {
      setIsSaving(false);
    }
  };

  const openTutorModal = async (unit) => {
    setTutorUnit(unit);
    setUnitTutors([]);
    setTutorEmail('');
    setTutorRole('tutor');
    setTutorError('');
    setIsTutorLoading(true);

    try {
      const tutors = await adminAPI.getUnitTutors(unit.id);
      setUnitTutors(tutors);
    } catch (err) {
      setTutorError(err.message || 'Failed to load tutors');
    } finally {
      setIsTutorLoading(false);
    }
  };

  const closeTutorModal = () => {
    if (isTutorLoading) return;
    setTutorUnit(null);
    setUnitTutors([]);
    setTutorEmail('');
    setTutorRole('tutor');
    setTutorError('');
  };

  const refreshTutorCount = (unitId, tutorCount) => {
    setUnits(prevUnits => prevUnits.map(unit => (
      unit.id === unitId ? { ...unit, tutorCount } : unit
    )));
  };

  const addTutorToUnit = async (event) => {
    event.preventDefault();
    if (!tutorUnit) return;

    const email = tutorEmail.trim();
    if (!email) {
      setTutorError('Tutor email is required.');
      return;
    }

    setTutorError('');
    setIsTutorLoading(true);

    try {
      const addedTutor = await adminAPI.addUnitTutor(tutorUnit.id, email, tutorRole);
      setUnitTutors(prevTutors => {
        const nextTutors = [
          ...prevTutors.filter(tutor => tutor.id !== addedTutor.id),
          addedTutor
        ].sort((a, b) => (
          `${a.firstName || ''} ${a.lastName || ''} ${a.email || ''}`.localeCompare(`${b.firstName || ''} ${b.lastName || ''} ${b.email || ''}`)
        ));
        refreshTutorCount(tutorUnit.id, nextTutors.length);
        return nextTutors;
      });
      setTutorEmail('');
    } catch (err) {
      setTutorError(err.message || 'Failed to add tutor');
    } finally {
      setIsTutorLoading(false);
    }
  };

  const changeTutorRole = async (tutor, nextRole) => {
    if (!tutorUnit || (tutor.membershipRole || 'tutor') === nextRole) return;

    setTutorError('');
    setIsTutorLoading(true);

    try {
      const updatedTutor = await adminAPI.updateUnitTutorRole(tutorUnit.id, tutor.id, nextRole);
      setUnitTutors(prevTutors => prevTutors.map(item => (
        item.id === updatedTutor.id ? updatedTutor : item
      )));
    } catch (err) {
      setTutorError(err.message || 'Failed to update tutor access');
    } finally {
      setIsTutorLoading(false);
    }
  };

  const removeTutorFromUnit = async (tutor) => {
    if (!tutorUnit) return;

    setTutorError('');
    setIsTutorLoading(true);

    try {
      await adminAPI.removeUnitTutor(tutorUnit.id, tutor.id);
      setUnitTutors(prevTutors => {
        const nextTutors = prevTutors.filter(item => item.id !== tutor.id);
        refreshTutorCount(tutorUnit.id, nextTutors.length);
        return nextTutors;
      });
    } catch (err) {
      setTutorError(err.message || 'Failed to remove tutor');
    } finally {
      setIsTutorLoading(false);
    }
  };

  const isModalOpen = modalUnit !== undefined;

  return (
    <AdminShell
      activePage="units"
      title="Unit Management"
      eyebrow="Teaching units"
      actions={<button className="admin-primary-btn" onClick={openCreateModal}>Add Unit</button>}
    >
      <div className="admin-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search units" />
        <select aria-label="Semester filter" value={semesterFilter} onChange={event => setSemesterFilter(event.target.value)}>
          <option value="all">All semesters</option>
          {semesterOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="admin-alert error">
          <span>{error}</span>
          <button className="admin-text-btn" onClick={loadUnits}>Retry</button>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Main Coordinator</th>
              <th>Semester</th>
              <th>Enrolment</th>
              <th>Tutors</th>
              <th>Sessions</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan="8" className="admin-empty-cell">Loading units...</td>
              </tr>
            )}

            {!isLoading && filteredUnits.length === 0 && (
              <tr>
                <td colSpan="8" className="admin-empty-cell">No units found.</td>
              </tr>
            )}

            {!isLoading && filteredUnits.map(unit => (
              <tr key={unit.id}>
                <td>
                  <div className="admin-strong-cell">
                    <strong>{unit.unitCode}</strong>
                    <span>{unit.unitName}</span>
                  </div>
                </td>
                <td>
                  <div className="admin-strong-cell">
                    <strong>{getMainCoordinatorDisplay(unit)}</strong>
                    <span>{unit.coordinatorCount} coordinator{unit.coordinatorCount === 1 ? '' : 's'}</span>
                  </div>
                </td>
                <td>{formatSemester(unit)}</td>
                <td>{unit.enrolmentSize || '-'}</td>
                <td>{unit.tutorCount}</td>
                <td>{unit.sessionCount}</td>
                <td>
                  <div className="admin-pill-row">
                    {unit.availabilityLocked && <span className="admin-pill neutral">Availability locked</span>}
                    {unit.scheduleLocked && <span className="admin-pill neutral">Schedule locked</span>}
                    {!unit.availabilityLocked && !unit.scheduleLocked && <span className="admin-pill draft">Open</span>}
                  </div>
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-text-btn" onClick={() => openEditModal(unit)}>Modify</button>
                    <button className="admin-text-btn" onClick={() => openTutorModal(unit)}>Tutors</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-unit-title">
          <form className="admin-modal" onSubmit={saveUnit}>
            <div className="admin-modal-header">
              <h2 id="admin-unit-title">{modalUnit ? 'Modify Unit' : 'Add Unit'}</h2>
              <button type="button" className="admin-icon-btn light" onClick={closeModal} aria-label="Close">x</button>
            </div>

            {formError && <div className="admin-alert error">{formError}</div>}

            <div className="admin-form-grid">
              <label>Unit code<input name="unitCode" value={formData.unitCode} onChange={updateForm} required /></label>
              <label>Year<input name="year" type="number" min="2020" max="2100" value={formData.year} onChange={updateForm} required /></label>
            </div>

            <label>Unit name<input name="unitName" value={formData.unitName} onChange={updateForm} required /></label>
            <label>Main coordinator email<input name="coordinatorEmail" type="email" value={formData.coordinatorEmail} onChange={updateForm} required /></label>

            <div className="admin-form-grid">
              <label>
                Semester
                <select name="semester" value={formData.semester} onChange={updateForm}>
                  {SEMESTER_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>Enrolment size<input name="enrolmentSize" type="number" min="0" value={formData.enrolmentSize} onChange={updateForm} /></label>
            </div>

            <label>Availability deadline<input name="availabilityDeadline" type="date" value={formData.availabilityDeadline} onChange={updateForm} /></label>

            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-btn" onClick={closeModal}>Cancel</button>
              <button type="submit" className="admin-primary-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Unit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tutorUnit && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-unit-tutors-title">
          <div className="admin-modal wide admin-tutor-modal">
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title-row">
                  <h2 id="admin-unit-tutors-title">Manage Tutors</h2>
                  <span className="admin-count-pill">{unitTutors.length} tutors</span>
                </div>
                <p className="admin-modal-copy">{tutorUnit.unitCode} - {tutorUnit.unitName}</p>
              </div>
              <button type="button" className="admin-icon-btn light" onClick={closeTutorModal} aria-label="Close">x</button>
            </div>

            {tutorError && <div className="admin-alert error">{tutorError}</div>}

            <form className="admin-inline-form admin-tutor-add-form" onSubmit={addTutorToUnit}>
              <label>
                Tutor email
                <input
                  type="email"
                  value={tutorEmail}
                  onChange={(event) => setTutorEmail(event.target.value)}
                  placeholder="Enter existing user email"
                  disabled={isTutorLoading}
                />
              </label>
              <label className="admin-tutor-role-field">
                Access
                <select
                  value={tutorRole}
                  onChange={(event) => setTutorRole(event.target.value)}
                  disabled={isTutorLoading}
                >
                  <option value="tutor">Tutor</option>
                  <option value="super_tutor">Super Tutor</option>
                </select>
              </label>
              <button type="submit" className="admin-primary-btn" disabled={isTutorLoading}>
                Add Tutor
              </button>
            </form>

            <div className="admin-tutor-list-header">
              <span>Tutor</span>
              <span>Assigned</span>
              <span>Action</span>
            </div>

            <div className="admin-list bordered admin-tutor-list">
              {isTutorLoading && unitTutors.length === 0 ? (
                <div className="admin-empty-cell compact">Loading tutors...</div>
              ) : unitTutors.length === 0 ? (
                <div className="admin-empty-cell compact">No tutors added to this unit yet.</div>
              ) : (
                unitTutors.map(tutor => {
                  const membershipRole = tutor.membershipRole || 'tutor';
                  const membershipLabel = membershipRole === 'super_tutor' ? 'Super Tutor' : 'Tutor';

                  return (
                    <div className="admin-list-row admin-tutor-row" key={tutor.id}>
                      <div className="admin-user-cell">
                        <span className="admin-avatar small">
                          {tutor.avatarUrl ? (
                            <img src={tutor.avatarUrl} alt="" />
                          ) : (
                            (tutor.firstName || tutor.email || '?').charAt(0).toUpperCase()
                          )}
                        </span>
                        <div className="admin-strong-cell">
                          <div className="admin-tutor-name-line">
                            <strong>{[tutor.firstName, tutor.lastName].filter(Boolean).join(' ') || tutor.email}</strong>
                            <span className={`admin-pill role-${membershipRole}`}>
                              {membershipLabel}
                            </span>
                          </div>
                          <span>{tutor.email}</span>
                        </div>
                      </div>
                      <span className="admin-session-count">
                        {tutor.assignedSessionCount} assigned session{tutor.assignedSessionCount === 1 ? '' : 's'}
                      </span>
                      <div className="admin-row-actions">
                        <select
                          className="admin-compact-select"
                          value={membershipRole}
                          onChange={(event) => changeTutorRole(tutor, event.target.value)}
                          disabled={isTutorLoading}
                          aria-label={`Change ${tutor.email} tutor access`}
                        >
                          <option value="tutor">Tutor</option>
                          <option value="super_tutor">Super Tutor</option>
                        </select>
                        <button
                          type="button"
                          className="admin-outline-danger-btn"
                          onClick={() => removeTutorFromUnit(tutor)}
                          disabled={isTutorLoading}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-secondary-btn" onClick={closeTutorModal} disabled={isTutorLoading}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default AdminUnits;
