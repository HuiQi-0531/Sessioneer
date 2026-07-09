import React, { useState, useEffect } from 'react';
import { tutorApplicationsAPI } from '../config/api';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorApplications.css';

const TutorApplications = () => {
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [inviteLinkInfo, setInviteLinkInfo] = useState(null);
  const [isInviting, setIsInviting] = useState(null);

  const [showDirectInviteModal, setShowDirectInviteModal] = useState(false);
  const [directInviteForm, setDirectInviteForm] = useState({ name: '', email: '' });
  const [directInviteError, setDirectInviteError] = useState('');
  const [isDirectInviting, setIsDirectInviting] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setIsLoading(true);
    try {
      const data = await tutorApplicationsAPI.getAll();
      setApplications(data);
    } catch (err) {
      console.error('Error loading applications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const buildInviteUrl = (token) => `${window.location.origin}/activate/${token}`;

  const handleInvite = async (application) => {
    setIsInviting(application.id);
    try {
      const result = await tutorApplicationsAPI.invite(application.id);
      setInviteLinkInfo({ name: result.name, url: buildInviteUrl(result.inviteToken) });
      await loadApplications();
    } catch (err) {
      alert(err.message || 'Failed to generate invite link.');
    } finally {
      setIsInviting(null);
    }
  };

  const handleDownloadResume = async (application) => {
    try {
      await tutorApplicationsAPI.downloadResume(application.id, application.resumeFilename);
    } catch (err) {
      alert(err.message || 'Failed to download resume.');
    }
  };

  const handleDirectInviteSubmit = async () => {
    setDirectInviteError('');
    if (!directInviteForm.name.trim() || !directInviteForm.email.trim()) {
      setDirectInviteError('Name and email are required.');
      return;
    }
    setIsDirectInviting(true);
    try {
      const result = await tutorApplicationsAPI.directInvite(directInviteForm.name.trim(), directInviteForm.email.trim());
      setShowDirectInviteModal(false);
      setDirectInviteForm({ name: '', email: '' });
      setInviteLinkInfo({ name: result.name, url: buildInviteUrl(result.inviteToken) });
      await loadApplications();
    } catch (err) {
      setDirectInviteError(err.message || 'Failed to create invite.');
    } finally {
      setIsDirectInviting(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteLinkInfo) return;
    navigator.clipboard.writeText(inviteLinkInfo.url);
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="applications" />

      <main className="uc-main-content">
        <UCPageHeader title="Tutor Applications" />

        <div className="tap-content">
          <div className="tap-top-row">
            <button className="tap-direct-invite-btn" onClick={() => setShowDirectInviteModal(true)}>
              + Invite a known tutor directly
            </button>
          </div>

          {isLoading ? (
            <div className="tap-empty-state">Loading...</div>
          ) : applications.length === 0 ? (
            <div className="tap-empty-state">No applications yet.</div>
          ) : (
            <div className="tap-card-list">
              {applications.map(app => (
                <div key={app.id} className="tap-card">
                  <div className="tap-card-top">
                    <div>
                      <div className="tap-card-name">{app.name}</div>
                      <div className="tap-card-email">{app.email}</div>
                    </div>
                    <span className={`tap-badge ${app.status}`}>{app.status}</span>
                  </div>

                  {app.phoneNumber && (
                    <div className="tap-card-detail-row">
                      <span className="tap-card-detail-label">Phone</span>{app.phoneNumber}
                    </div>
                  )}
                  {app.workExperience && (
                    <div className="tap-card-detail-row">
                      <span className="tap-card-detail-label">Experience</span>{app.workExperience}
                    </div>
                  )}
                  <div className="tap-card-detail-row">
                    <span className="tap-card-detail-label">Applied</span>{formatDate(app.appliedAt)}
                  </div>

                  <div className="tap-card-actions">
                    {app.hasResume && (
                      <button className="tap-btn tap-btn-resume" onClick={() => handleDownloadResume(app)}>
                        View Resume
                      </button>
                    )}
                    {app.status === 'pending' && (
                      <button
                        className="tap-btn tap-btn-invite"
                        onClick={() => handleInvite(app)}
                        disabled={isInviting === app.id}
                      >
                        {isInviting === app.id ? 'Generating...' : 'Invite'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showDirectInviteModal && (
        <div className="tap-modal-overlay" onClick={() => setShowDirectInviteModal(false)}>
          <div className="tap-modal-content" onClick={e => e.stopPropagation()}>
            <h2>Invite a known tutor</h2>
            <p>For returning tutors you already know — this skips the application step and generates an invite link right away.</p>

            <div className="tap-form-field">
              <label>Name</label>
              <input
                type="text"
                value={directInviteForm.name}
                onChange={(e) => setDirectInviteForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="tap-form-field">
              <label>Email</label>
              <input
                type="email"
                value={directInviteForm.email}
                onChange={(e) => setDirectInviteForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>

            {directInviteError && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{directInviteError}</p>}

            <button className="tap-btn tap-btn-invite" style={{ width: '100%' }} onClick={handleDirectInviteSubmit} disabled={isDirectInviting}>
              {isDirectInviting ? 'Generating...' : 'Generate Invite Link'}
            </button>
          </div>
        </div>
      )}

      {inviteLinkInfo && (
        <div className="tap-modal-overlay" onClick={() => setInviteLinkInfo(null)}>
          <div className="tap-modal-content" onClick={e => e.stopPropagation()}>
            <h2>Invite link ready</h2>
            <p>Copy this link and send it to {inviteLinkInfo.name} yourself (e.g. via email). It expires in 7 days.</p>

            <div className="tap-link-box">
              <input type="text" value={inviteLinkInfo.url} readOnly onClick={(e) => e.target.select()} />
              <button className="tap-copy-btn" onClick={handleCopyLink}>Copy</button>
            </div>

            <button className="tap-modal-close-btn" onClick={() => setInviteLinkInfo(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorApplications;