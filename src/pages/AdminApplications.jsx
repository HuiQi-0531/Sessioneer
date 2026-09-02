import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from './AdminShell';
import { adminAPI } from '../config/api';

const statusOptions = ['pending', 'invited', 'accepted', 'rejected'];

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

const getStatusClass = (status) => String(status || 'pending').toLowerCase().replace(/\s+/g, '-');

const AdminApplications = () => {
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [resumeLoadingId, setResumeLoadingId] = useState(null);

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
            <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
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
              <th>Submitted</th>
              <th>Invite</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="7" className="admin-empty-cell">Loading applications...</td>
              </tr>
            ) : filteredApplications.length === 0 ? (
              <tr>
                <td colSpan="7" className="admin-empty-cell">No applications match your filters.</td>
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
                    <div className="admin-strong-cell">
                      <strong>{application.unitCode || 'No unit'}</strong>
                      <span>{application.unitName || '-'}</span>
                    </div>
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
                      {application.status}
                    </span>
                  </td>
                  <td>{formatDateTime(application.appliedAt)}</td>
                  <td>
                    <div className="admin-strong-cell">
                      <strong>{application.invitedAt ? formatDateTime(application.invitedAt) : '-'}</strong>
                      <span>{application.invitedByName || application.invitedByEmail || 'No invite yet'}</span>
                    </div>
                  </td>
                  <td>
                    {application.hasResume ? (
                      <button
                        className="admin-text-btn"
                        onClick={() => handleDownloadResume(application)}
                        disabled={resumeLoadingId === application.id}
                      >
                        {resumeLoadingId === application.id ? 'Opening...' : 'View resume'}
                      </button>
                    ) : (
                      <span className="admin-muted">No resume</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
};

export default AdminApplications;
