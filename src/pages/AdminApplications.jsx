import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from './AdminShell';
import { adminAPI } from '../config/api';

const statusOptions = ['pending', 'invited', 'accepted', 'rejected'];

// Same words as the UC's Tutor Applications page. The stored values don't change.
const STATUS_LABELS = { pending: 'Pending', invited: 'Invited', accepted: 'Joined', rejected: 'Declined' };
const statusLabel = (status) => STATUS_LABELS[status] || status;

const getStatusClass = (status) => String(status || 'pending').toLowerCase().replace(/\s+/g, '-');

const formatDate = (iso) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

const buildInviteUrl = (token) => `${window.location.origin}/activate/${token}`;


const AdminApplications = () => {
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [resumeLoadingId, setResumeLoadingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // One modal for Invite / Decline / Delete: { type, application }
  const [action, setAction] = useState(null);
  const [inviteRole, setInviteRole] = useState('tutor');
  const [declineNote, setDeclineNote] = useState('');
  const [actionError, setActionError] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  // Shown after an invite: the new link, or that an existing account was added.
  const [inviteResult, setInviteResult] = useState(null);

  const loadApplications = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await adminAPI.getApplications();
      setApplications(data);
    } catch (err) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const units = useMemo(() => {
    const unitMap = new Map();
    applications.forEach((application) => {
      if (application.unitId) {
        unitMap.set(application.unitId, {
          id: application.unitId,
          label: application.unitCode || 'Unknown unit'
        });
      }
    });
    return Array.from(unitMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesSearch = !term || [
        application.fullName,
        application.email,
        application.phoneNumber,
        application.unitCode,
        application.unitName,
        application.status,
        application.contractType,
        application.coordinatorName,
        application.invitedByName
      ].some(value => String(value || '').toLowerCase().includes(term));

      const matchesUnit = unitFilter === 'all' || application.unitId === unitFilter;
      const matchesStatus = statusFilter === 'all' || getStatusClass(application.status) === statusFilter;

      return matchesSearch && matchesUnit && matchesStatus;
    });
  }, [applications, searchTerm, unitFilter, statusFilter]);

  const handleDownloadResume = async (application) => {
    setResumeLoadingId(application.id);
    setError('');

    try {
      await adminAPI.downloadApplicationResume(application.id);
    } catch (err) {
      setError(err.message || 'Failed to open resume');
    } finally {
      setResumeLoadingId(null);
    }
  };

  const openAction = (type, application) => {
    setInviteRole('tutor');
    setDeclineNote('');
    setActionError('');
    setAction({ type, application });
  };

  const closeAction = () => {
    if (isActionLoading) return;
    setAction(null);
  };

  const submitAction = async () => {
    if (!action) return;
    const { type, application } = action;
    setIsActionLoading(true);
    setActionError('');
    try {
      if (type === 'invite') {
        const result = await adminAPI.inviteApplication(application.id, inviteRole);
        setInviteResult(result.addedExistingUser
          ? { title: 'Tutor added', message: `${application.fullName} already has a Sessioneer account and has been added to ${application.unitCode || 'the unit'}.` }
          : { title: 'Invite link ready', message: `Copy this link and send it to ${application.fullName} yourself. It expires in 7 days.`, url: buildInviteUrl(result.inviteToken) });
      } else if (type === 'decline') {
        await adminAPI.declineApplication(application.id, declineNote.trim());
      } else if (type === 'delete') {
        await adminAPI.deleteApplication(application.id);
      }
      setAction(null);
      await loadApplications();
    } catch (err) {
      setActionError(err.message || 'Something went wrong');
      // The row may be out of date (e.g. the UC already handled it).
      await loadApplications();
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCopyLink = (application) => {
    if (!application.inviteToken) return;
    navigator.clipboard.writeText(buildInviteUrl(application.inviteToken));
    setCopiedId(application.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const actionTitles = {
    invite: 'Invite applicant',
    decline: 'Decline application',
    delete: 'Delete application'
  };


  return (
    <AdminShell activePage="applications" title="Tutor Applications" eyebrow="Invites and applications">
      {error && (
        <div className="admin-alert error">
          <span>{error}</span>
          <button className="admin-text-btn" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search applications"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} aria-label="Unit filter">
          <option value="all">All units</option>
          {units.map(unit => (
            <option key={unit.id} value={unit.id}>{unit.label}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status filter">
          <option value="all">All status</option>
          {statusOptions.map(status => (
            <option key={status} value={status}>{statusLabel(status)}</option>
          ))}
        </select>
        <button className="admin-secondary-btn admin-toolbar-action" onClick={loadApplications} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="admin-table-wrap">
<table className="admin-table">
  <thead>
    <tr>
      <th>Applicant</th>
      <th>Unit</th>
      <th>Details</th>
      <th>Status</th>
      <th>Invite</th>
      <th>Action</th>
    </tr>
  </thead>
  <tbody>
    {isLoading ? (
      <tr>
        <td colSpan="6" className="admin-empty-cell">Loading applications...</td>
      </tr>
    ) : filteredApplications.length === 0 ? (
      <tr>
        <td colSpan="6" className="admin-empty-cell">No applications match your filters.</td>
      </tr>
    ) : (
      filteredApplications.map(application => (
        <tr key={application.id}>
          <td>
            <div className="admin-strong-cell">
              <strong>{application.fullName}</strong>
              <span>{application.email}</span>
            </div>
          </td>
          <td>
            {application.unitCode || 'No unit'}
            {application.unitName ? ` · ${application.unitName}` : ''}
          </td>
          <td>
            <div className="admin-strong-cell">
              <strong>{application.contractType || 'Not provided'}</strong>
              <span>
                {application.maximumHours != null
                  ? `${application.maximumHours} hrs/week`
                  : 'Hours not provided'}
              </span>
            </div>
          </td>
          <td>
            <span className={`admin-pill ${getStatusClass(application.status)}`}>
              {statusLabel(application.status)}
            </span>
          </td>
          <td>
            {application.status === 'rejected' ? (
              <div className="admin-strong-cell">
                <strong>{application.reviewedAt ? `Declined ${formatDate(application.reviewedAt)}` : 'Declined'}</strong>
                {application.reviewNote && <span className="admin-app-note" title={application.reviewNote}>{application.reviewNote}</span>}
              </div>
            ) : application.invitedAt ? (
              <div className="admin-strong-cell">
                <strong>
                  {new Date(application.invitedAt).toLocaleDateString([], {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </strong>
                <span>{application.invitedByName || application.invitedByEmail || 'Unknown'}</span>
              </div>
            ) : (
              <span className="admin-muted">No invite yet</span>
            )}
          </td>
          <td>
            <div className="admin-app-actions">
              {application.hasResume && (
                <button
                  className="admin-app-action grey"
                  onClick={() => handleDownloadResume(application)}
                  disabled={resumeLoadingId === application.id}
                >
                  {resumeLoadingId === application.id ? 'Opening...' : 'Resume'}
                </button>
              )}
              {application.status === 'pending' && (
                <>
                  <button className="admin-app-action primary" onClick={() => openAction('invite', application)}>Invite</button>
                  <button className="admin-app-action red" onClick={() => openAction('decline', application)}>Decline</button>
                </>
              )}
              {application.status === 'invited' && (
                application.inviteToken ? (
                  <button className="admin-app-action soft" onClick={() => handleCopyLink(application)}>
                    {copiedId === application.id ? 'Copied!' : 'Copy link'}
                  </button>
                ) : (
                  <span className="admin-app-tag">Link expired</span>
                )
              )}
              {application.status === 'rejected' && (
                <button className="admin-app-action red" onClick={() => openAction('delete', application)}>Delete</button>
              )}
              {!application.hasResume && !['pending', 'invited', 'rejected'].includes(application.status) && (
                <span className="admin-muted">No action</span>
              )}
            </div>
          </td>
        </tr>
      ))
    )}
  </tbody>
</table>
      </div>

      {action && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h2>{actionTitles[action.type]}</h2>
              <button className="admin-text-btn" onClick={closeAction} disabled={isActionLoading}>Close</button>
            </div>

            <p className="admin-modal-copy">
              {action.application.fullName} - {action.application.unitCode || 'No unit'}
            </p>

            {action.type === 'invite' && (
              <label>
                Invite as
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={isActionLoading}>
                  <option value="tutor">Tutor</option>
                  <option value="super_tutor">Super Tutor</option>
                </select>
              </label>
            )}

            {action.type === 'decline' && (
              <>
                <p className="admin-modal-copy">The application moves to Declined. The applicant won't be notified.</p>
                <label>
                  Note (optional, only UC and admin see this)
                  <textarea
                    value={declineNote}
                    maxLength={500}
                    onChange={(event) => setDeclineNote(event.target.value)}
                    placeholder="e.g. Availability doesn't match any tutorial times"
                    disabled={isActionLoading}
                  />
                </label>
              </>
            )}

            {action.type === 'delete' && (
              <p className="admin-modal-copy">
                This application and its resume will be permanently removed. This can't be undone.
              </p>
            )}

            {actionError && <div className="admin-alert error">{actionError}</div>}

            <div className="admin-modal-actions">
              <button className="admin-secondary-btn" onClick={closeAction} disabled={isActionLoading}>
                Back
              </button>
              <button
                className={`admin-primary-btn ${action.type === 'invite' ? '' : 'danger'}`}
                onClick={submitAction}
                disabled={isActionLoading}
              >
                {isActionLoading
                  ? 'Saving...'
                  : action.type === 'invite' ? 'Invite' : action.type === 'decline' ? 'Decline' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteResult && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h2>{inviteResult.title}</h2>
            </div>
            <p className="admin-modal-copy">{inviteResult.message}</p>
            {inviteResult.url && (
              <div className="admin-app-link-box">
                <input type="text" value={inviteResult.url} readOnly onClick={(event) => event.target.select()} />
                <button className="admin-app-action soft" onClick={() => navigator.clipboard.writeText(inviteResult.url)}>Copy</button>
              </div>
            )}
            <div className="admin-modal-actions">
              <span />
              <button className="admin-primary-btn" onClick={() => setInviteResult(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
};

export default AdminApplications;
