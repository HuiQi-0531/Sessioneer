import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from './AdminShell';
import { adminAPI } from '../config/api';

const ROLE_OPTIONS = [
  { value: 'tutor', label: 'Tutor' },
  { value: 'coordinator', label: 'Unit Coordinator' },
  { value: 'admin', label: 'Administrator' }
];

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'disabled', label: 'Disabled' }
];

const MEMBERSHIP_ROLE_OPTIONS = [
  { value: 'tutor', label: 'Tutor' },
  { value: 'coordinator', label: 'Unit Coordinator' }
];

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'tutor',
  accountStatus: 'active',
  sendSetupLink: true
};

const getRoleLabel = (role) => {
  return ROLE_OPTIONS.find(option => option.value === role)?.label || role;
};

const getStatusLabel = (status) => {
  return ACCOUNT_STATUS_OPTIONS.find(option => option.value === status)?.label || status || 'Active';
};

const formatDate = (value) => {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getUnitAccessPreview = (unitSummary) => {
  if (!unitSummary) {
    return 'No access yet';
  }

  const unitCodes = unitSummary
    .split(',')
    .map(unitCode => unitCode.trim())
    .filter(Boolean);

  if (unitCodes.length <= 3) {
    return unitCodes.join(', ');
  }

  return `${unitCodes.slice(0, 3).join(', ')} +${unitCodes.length - 3} more`;
};

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [units, setUnits] = useState([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalUser, setModalUser] = useState(undefined);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoadingId, setResetLoadingId] = useState('');
  const [unitModalUser, setUnitModalUser] = useState(null);
  const [userUnits, setUserUnits] = useState([]);
  const [unitForm, setUnitForm] = useState({ unitId: '', role: 'tutor' });
  const [unitSearch, setUnitSearch] = useState('');
  const [unitError, setUnitError] = useState('');
  const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);
  const [isUnitLoading, setIsUnitLoading] = useState(false);
  const [isUnitSaving, setIsUnitSaving] = useState(false);

  const loadPageData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const [userData, unitData] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getUnits()
      ]);
      setUsers(userData);
      setUnits(unitData);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  const filteredUsers = useMemo(() => {
    const search = query.trim().toLowerCase();
    const selectedUnit = units.find(unit => unit.id === unitFilter);

    return users.filter(user => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || (user.accountStatus || 'active') === statusFilter;
      const matchesUnit = unitFilter === 'all' || user.unitSummary?.split(', ').includes(selectedUnit?.unitCode);
      const matchesSearch = !search ||
        user.displayName?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search) ||
        user.unitSummary?.toLowerCase().includes(search) ||
        getRoleLabel(user.role).toLowerCase().includes(search);

      return matchesRole && matchesStatus && matchesUnit && matchesSearch;
    });
  }, [query, roleFilter, statusFilter, unitFilter, units, users]);

  const refreshUser = async (userId) => {
    const data = await adminAPI.getUsers();
    setUsers(data);
    return data.find(user => user.id === userId);
  };

  const openCreateModal = () => {
    setModalUser(null);
    setFormData(emptyForm);
    setFormError('');
  };

  const openEditModal = (user) => {
    setModalUser(user);
    setFormData({
      firstName: user.firstName || user.name || '',
      lastName: user.lastName || '',
      email: user.email || '',
      role: user.role || 'tutor',
      accountStatus: user.accountStatus || 'active',
      sendSetupLink: false
    });
    setFormError('');
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalUser(undefined);
    setFormError('');
  };

  const updateForm = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const saveUser = async (event) => {
    event.preventDefault();
    setFormError('');
    setResetMessage('');

    const payload = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      role: formData.role,
      accountStatus: formData.accountStatus,
      sendSetupLink: formData.sendSetupLink
    };

    if (!payload.firstName || !payload.lastName || !payload.email) {
      setFormError('Please complete all required fields.');
      return;
    }

    try {
      setIsSaving(true);
      const savedUser = modalUser
        ? await adminAPI.updateUser(modalUser.id, payload)
        : await adminAPI.createUser(payload);

      setUsers(prevUsers => {
        if (!modalUser) return [savedUser, ...prevUsers];
        return prevUsers.map(user => user.id === savedUser.id ? savedUser : user);
      });
      setModalUser(undefined);
      setFormError('');
      if (!modalUser && payload.sendSetupLink) {
        setResetMessage(`Setup link sent to ${savedUser.email}.`);
      }
    } catch (err) {
      setFormError(err.message || 'Failed to save user');
    } finally {
      setIsSaving(false);
    }
  };

  const sendResetLink = async (user) => {
    try {
      setResetLoadingId(user.id);
      setResetMessage('');
      const result = await adminAPI.sendUserResetLink(user.id);
      setResetMessage(result.message || `Password reset link sent to ${user.email}.`);
    } catch (err) {
      setResetMessage(err.message || 'Failed to send reset link');
    } finally {
      setResetLoadingId('');
    }
  };

  const openUnitAccessModal = async (user) => {
    setUnitModalUser(user);
    setUserUnits([]);
    setUnitForm({ unitId: units[0]?.id || '', role: 'tutor' });
    setUnitSearch('');
    setUnitError('');
    setIsUnitLoading(true);

    try {
      const data = await adminAPI.getUserUnits(user.id);
      setUserUnits(data);
    } catch (err) {
      setUnitError(err.message || 'Failed to load unit access');
    } finally {
      setIsUnitLoading(false);
    }
  };

  const closeUnitAccessModal = () => {
    if (isUnitSaving) return;
    setUnitModalUser(null);
    setUnitError('');
    setIsAddUnitModalOpen(false);
  };

  const openAddUnitModal = () => {
    setUnitForm({ unitId: units[0]?.id || '', role: 'tutor' });
    setUnitSearch('');
    setUnitError('');
    setIsAddUnitModalOpen(true);
  };

  const closeAddUnitModal = () => {
    if (isUnitSaving) return;
    setUnitError('');
    setIsAddUnitModalOpen(false);
  };

  const addUnitAccess = async (event) => {
    event.preventDefault();
    if (!unitModalUser || !unitForm.unitId) return;
    setUnitError('');

    try {
      setIsUnitSaving(true);
      const result = await adminAPI.addUserUnit(unitModalUser.id, unitForm.unitId, unitForm.role);
      if (result.access) {
        setUserUnits(prev => {
          const withoutDuplicate = prev.filter(item => !(item.unitId === result.access.unitId && item.role === result.access.role));
          return [...withoutDuplicate, result.access].sort((a, b) => a.unitCode.localeCompare(b.unitCode));
        });
      }
      const refreshed = await refreshUser(unitModalUser.id);
      if (refreshed) setUnitModalUser(refreshed);
      setIsAddUnitModalOpen(false);
    } catch (err) {
      setUnitError(err.message || 'Failed to add unit access');
    } finally {
      setIsUnitSaving(false);
    }
  };

  const removeUnitAccess = async (access) => {
    if (!unitModalUser) return;
    setUnitError('');

    try {
      setIsUnitSaving(true);
      await adminAPI.removeUserUnit(unitModalUser.id, access.unitId, access.role);
      setUserUnits(prev => prev.filter(item => !(item.unitId === access.unitId && item.role === access.role)));
      const refreshed = await refreshUser(unitModalUser.id);
      if (refreshed) setUnitModalUser(refreshed);
    } catch (err) {
      setUnitError(err.message || 'Failed to remove unit access');
    } finally {
      setIsUnitSaving(false);
    }
  };

  const isModalOpen = modalUser !== undefined;

  const groupedUnitAccess = useMemo(() => {
    const grouped = new Map();

    userUnits.forEach(access => {
      const existing = grouped.get(access.unitId);

      if (!existing) {
        grouped.set(access.unitId, {
          unitId: access.unitId,
          unitCode: access.unitCode,
          unitName: access.unitName,
          semester: access.semester,
          year: access.year,
          roles: [access]
        });
        return;
      }

      const alreadyHasRole = existing.roles.some(roleAccess => roleAccess.role === access.role);
      if (!alreadyHasRole || access.isPrimaryCoordinator) {
        existing.roles = existing.roles
          .filter(roleAccess => !(roleAccess.role === access.role && access.isPrimaryCoordinator))
          .concat(access);
      }
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const byCode = a.unitCode.localeCompare(b.unitCode);
      if (byCode !== 0) return byCode;
      return `${a.year}-${a.semester}`.localeCompare(`${b.year}-${b.semester}`);
    });
  }, [userUnits]);

  const filteredAddUnits = useMemo(() => {
    const search = unitSearch.trim().toLowerCase();

    return units.filter(unit => {
      if (!search) return true;
      return [
        unit.unitCode,
        unit.unitName,
        unit.semester,
        unit.year
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(search));
    });
  }, [unitSearch, units]);

  const selectedAddUnit = units.find(unit => unit.id === unitForm.unitId);

  return (
    <AdminShell
      activePage="users"
      title="User Management"
      eyebrow="Accounts and roles"
      actions={<button className="admin-primary-btn" onClick={openCreateModal}>Add User</button>}
    >
      <div className="admin-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users, emails or units" />
        <select aria-label="Role filter" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
          <option value="all">All roles</option>
          {ROLE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select aria-label="Status filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {ACCOUNT_STATUS_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select aria-label="Unit filter" value={unitFilter} onChange={event => setUnitFilter(event.target.value)}>
          <option value="all">All units</option>
          {units.map(unit => (
            <option key={unit.id} value={unit.id}>{unit.unitCode}</option>
          ))}
        </select>
      </div>

      {resetMessage && (
        <div className={`admin-alert ${resetMessage.toLowerCase().includes('failed') ? 'error' : 'success'}`}>
          {resetMessage}
        </div>
      )}

      {error && (
        <div className="admin-alert error">
          <span>{error}</span>
          <button className="admin-text-btn" onClick={loadPageData}>Retry</button>
        </div>
      )}

      <div className="admin-table-wrap">
        <table className="admin-table admin-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Unit Access</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan="6" className="admin-empty-cell">Loading users...</td>
              </tr>
            )}

            {!isLoading && filteredUsers.length === 0 && (
              <tr>
                <td colSpan="6" className="admin-empty-cell">No users found.</td>
              </tr>
            )}

            {!isLoading && filteredUsers.map(user => (
              <tr key={user.id}>
                <td>
                  <div className="admin-user-cell">
                    <span className="admin-avatar small">
                      {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user.displayName || user.email).charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <strong>{user.displayName || user.email}</strong>
                      <span className="admin-muted-line">{user.email}</span>
                    </span>
                  </div>
                </td>
                <td><span className={`admin-pill role-${user.role}`}>{getRoleLabel(user.role)}</span></td>
                <td><span className={`admin-pill ${user.accountStatus || 'active'}`}>{getStatusLabel(user.accountStatus || 'active')}</span></td>
                <td>
                  <div className="admin-unit-summary vertical">
                    <span className="admin-unit-count-line">
                      <strong>{user.unitCount}</strong>
                      <span>{user.unitCount === 1 ? 'unit' : 'units'}</span>
                    </span>
                    <small title={user.unitSummary || 'No access yet'}>{getUnitAccessPreview(user.unitSummary)}</small>
                  </div>
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>
                  <div className="admin-actions-cell admin-user-actions">
                    <button className="admin-action-btn primary" onClick={() => openEditModal(user)}>Modify</button>
                    <button className="admin-action-btn secondary" onClick={() => openUnitAccessModal(user)}>Units</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-user-title">
          <form className="admin-modal" onSubmit={saveUser}>
            <div className="admin-modal-header">
              <h2 id="admin-user-title">{modalUser ? 'Modify User' : 'Add User'}</h2>
              <button type="button" className="admin-icon-btn light" onClick={closeModal} aria-label="Close">x</button>
            </div>

            {formError && <div className="admin-alert error">{formError}</div>}

            <div className="admin-form-grid">
              <label>First name<input name="firstName" value={formData.firstName} onChange={updateForm} required /></label>
              <label>Last name<input name="lastName" value={formData.lastName} onChange={updateForm} required /></label>
            </div>

            <label>Email<input name="email" type="email" value={formData.email} onChange={updateForm} required /></label>
            <div className="admin-form-grid">
              <label>
                Role
                <select name="role" value={formData.role} onChange={updateForm}>
                  {ROLE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Account status
                <select name="accountStatus" value={formData.accountStatus} onChange={updateForm}>
                  {ACCOUNT_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {!modalUser && (
              <label className="admin-checkbox-row">
                <input
                  type="checkbox"
                  name="sendSetupLink"
                  checked={formData.sendSetupLink}
                  onChange={updateForm}
                />
                <span>Email setup link to this user</span>
              </label>
            )}

            <p className="admin-modal-copy">
              Admins cannot set user passwords directly. Use the setup or reset email so the user creates their own password securely.
            </p>

            <div className="admin-modal-actions">
              {modalUser ? (
                <button
                  type="button"
                  className="admin-secondary-btn"
                  onClick={() => sendResetLink(modalUser)}
                  disabled={resetLoadingId === modalUser.id}
                >
                  {resetLoadingId === modalUser.id ? 'Sending reset...' : 'Send reset link'}
                </button>
              ) : (
                <span />
              )}
              <div className="admin-modal-action-group">
                <button type="button" className="admin-secondary-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="admin-primary-btn" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save User'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {unitModalUser && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-user-units-title">
          <div className="admin-modal wide admin-user-unit-modal">
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title-row">
                  <h2 id="admin-user-units-title">Manage Unit Access</h2>
                  <span className="admin-count-pill">{groupedUnitAccess.length} units</span>
                </div>
                <p className="admin-modal-copy">{unitModalUser.displayName} - {unitModalUser.email}</p>
              </div>
              <button type="button" className="admin-icon-btn light" onClick={closeUnitAccessModal} aria-label="Close">x</button>
            </div>

            {unitError && <div className="admin-alert error">{unitError}</div>}

            <div className="admin-user-unit-list">
              <div className="admin-user-unit-list-header">
                <span>Unit</span>
                <span>Access</span>
                <span>Assigned</span>
                <span>Action</span>
              </div>

              {isUnitLoading && <div className="admin-empty-panel">Loading unit access...</div>}
              {!isUnitLoading && groupedUnitAccess.length === 0 && <div className="admin-empty-panel">No unit access yet.</div>}

              {!isUnitLoading && groupedUnitAccess.map(accessGroup => {
                const coordinatorAccess = accessGroup.roles.find(access => access.role === 'coordinator');
                const tutorAccess = accessGroup.roles.find(access => access.role === 'tutor');

                return (
                  <div className="admin-user-unit-row" key={accessGroup.unitId}>
                    <div>
                      <strong>{accessGroup.unitCode}</strong>
                      <span>{accessGroup.unitName}</span>
                      <small>{accessGroup.semester}, {accessGroup.year}</small>
                    </div>

                    <div className="admin-access-badge-group">
                      {coordinatorAccess && <span className="admin-pill role-coordinator">Unit Coordinator</span>}
                      {tutorAccess && <span className="admin-pill role-tutor">Tutor</span>}
                    </div>

                    <div className="admin-access-badge-group">
                      {coordinatorAccess && (
                        <span className="admin-pill inactive">
                          {coordinatorAccess.isPrimaryCoordinator ? 'Main coordinator' : 'Coordinator access'}
                        </span>
                      )}
                      {tutorAccess && (
                        <span className="admin-pill inactive">
                          {`${tutorAccess.assignedSessionCount} assigned ${tutorAccess.assignedSessionCount === 1 ? 'session' : 'sessions'}`}
                        </span>
                      )}
                    </div>

                    <div className="admin-access-actions">
                      {coordinatorAccess && (
                        <button
                          type="button"
                          className="admin-danger-btn subtle"
                          onClick={() => removeUnitAccess(coordinatorAccess)}
                          disabled={isUnitSaving || coordinatorAccess.isPrimaryCoordinator}
                        >
                          {coordinatorAccess.isPrimaryCoordinator ? 'Locked' : 'Remove UC'}
                        </button>
                      )}
                      {tutorAccess && (
                        <button
                          type="button"
                          className="admin-danger-btn subtle"
                          onClick={() => removeUnitAccess(tutorAccess)}
                          disabled={isUnitSaving}
                        >
                          Remove Tutor
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-primary-btn" onClick={openAddUnitModal} disabled={isUnitSaving || !units.length}>
                Add Unit
              </button>
              <button type="button" className="admin-secondary-btn" onClick={closeUnitAccessModal}>Done</button>
            </div>

            {isAddUnitModalOpen && (
              <div className="admin-nested-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-add-unit-access-title">
                <form className="admin-modal admin-add-unit-modal" onSubmit={addUnitAccess}>
                  <div className="admin-modal-header">
                    <div>
                      <h2 id="admin-add-unit-access-title">Add Unit Access</h2>
                      <p className="admin-modal-copy">{unitModalUser.displayName} - {unitModalUser.email}</p>
                    </div>
                    <button type="button" className="admin-icon-btn light" onClick={closeAddUnitModal} aria-label="Close">x</button>
                  </div>

                  <label>
                    Search unit
                    <input
                      value={unitSearch}
                      onChange={event => setUnitSearch(event.target.value)}
                      placeholder="Search code, name, semester or year"
                    />
                  </label>

                  <div className="admin-unit-picker" role="listbox" aria-label="Units">
                    {filteredAddUnits.length === 0 && (
                      <div className="admin-empty-panel compact">No units found.</div>
                    )}

                    {filteredAddUnits.map(unit => (
                      <button
                        key={unit.id}
                        type="button"
                        className={`admin-unit-picker-option ${unitForm.unitId === unit.id ? 'selected' : ''}`}
                        onClick={() => setUnitForm(prev => ({ ...prev, unitId: unit.id }))}
                      >
                        <span>
                          <strong>{unit.unitCode}</strong>
                          <small>{unit.unitName}</small>
                        </span>
                        <em>{unit.semester}, {unit.year}</em>
                      </button>
                    ))}
                  </div>

                  {selectedAddUnit && (
                    <div className="admin-selected-unit-note">
                      Selected: <strong>{selectedAddUnit.unitCode}</strong> - {selectedAddUnit.unitName} ({selectedAddUnit.semester}, {selectedAddUnit.year})
                    </div>
                  )}

                  <label>
                    Access
                    <select value={unitForm.role} onChange={event => setUnitForm(prev => ({ ...prev, role: event.target.value }))}>
                      {MEMBERSHIP_ROLE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <div className="admin-modal-actions">
                    <button type="button" className="admin-secondary-btn" onClick={closeAddUnitModal}>Cancel</button>
                    <button className="admin-primary-btn" type="submit" disabled={isUnitSaving || !unitForm.unitId}>
                      {isUnitSaving ? 'Adding...' : 'Add Access'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default AdminUsers;
