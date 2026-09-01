import React, { useState, useEffect, useCallback } from 'react';
import { tutorApplicationsAPI } from '../config/api';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { useActiveUnit } from '../context/ActiveUnitContext';
import '../styles/UCRequests.css';
import '../styles/TutorApplications.css';

const TutorApplications = () => {
  const { activeUnit, isLoading: unitLoading } = useActiveUnit();
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [inviteLinkInfo, setInviteLinkInfo] = useState(null);
  const [isInviting, setIsInviting] = useState(null);

  const [showDirectInviteModal, setShowDirectInviteModal] = useState(false);
  const [directInviteForm, setDirectInviteForm] = useState({ email: '', role: 'tutor' });
  const [directInviteError, setDirectInviteError] = useState('');
  const [isDirectInviting, setIsDirectInviting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [directInviteSuccess, setDirectInviteSuccess] = useState(null);

  // Which application is mid-invite, and which role the UC picked for it.
  const [inviteRoleModal, setInviteRoleModal] = useState(null);
  const [inviteRoleChoice, setInviteRoleChoice] = useState('tutor');

  const loadApplications = useCallback(async () => {
    if (!activeUnit?.id) {
      setApplications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await tutorApplicationsAPI.getAll(activeUnit.id);
      setApplications(data);
    } catch (err) {
      console.error('Error loading applications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeUnit?.id]);

  useEffect(() => {
    if (unitLoading) return;
    loadApplications();
  }, [unitLoading, loadApplications]);

  const buildInviteUrl = (token) => `${window.location.origin}/activate/${token}`;

  const handleCopyApplyLink = () => {
    if (!activeUnit?.id) return;
    const applyUrl = `${window.location.origin}/apply?unitId=${encodeURIComponent(activeUnit.id)}`;
    navigator.clipboard.writeText(applyUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleInvite = async (application, role) => {
    setIsInviting(application.id);
    try {
      const result = await tutorApplicationsAPI.invite(application.id, activeUnit.id, role);
      setInviteRoleModal(null);
      setInviteLinkInfo({ name: result.fullName || result.name, url: buildInviteUrl(result.inviteToken) });
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
    if (!directInviteForm.email.trim()) {
      setDirectInviteError('Tutor email is required.');
      return;
    }
    setIsDirectInviting(true);
    try {
      const roleLabel = directInviteForm.role === 'super_tutor' ? 'Super Tutor' : 'tutor';
      const result = await tutorApplicationsAPI.directInvite(directInviteForm.email.trim(), activeUnit.id, directInviteForm.role);
      setShowDirectInviteModal(false);
      setDirectInviteForm({ email: '', role: 'tutor' });
      if (result.addedExistingUser) {
        setDirectInviteSuccess({
          title: result.alreadyTutor ? 'Already added' : 'Tutor added',
          message: result.alreadyTutor
            ? `${result.fullName || result.email} is already a ${roleLabel} for ${activeUnit.unitCode}.`
            : `${result.fullName || result.email} has been added as a ${roleLabel} for ${activeUnit.unitCode}.`
        });
      } else {
        setInviteLinkInfo({ name: result.fullName || result.name || result.email, url: buildInviteUrl(result.inviteToken) });
      }
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
          <button className="tap-direct-invite-btn" onClick={handleCopyApplyLink}>
            {linkCopied ? 'Link copied!' : 'Copy application link'}
         </button>
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
                      <div className="tap-card-name">{app.fullName || app.name || 'Pending profile'}</div>
                      <div className="tap-card-email">{app.email}</div>
                    </div>
                    <span className={`tap-badge ${app.status}`}>{app.status}</span>
                  </div>

                
                  <div className="tap-card-details">
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
                    {app.maximumHours != null && (
                      <div className="tap-card-detail-row">
                        <span className="tap-card-detail-label">Max hours</span>{app.maximumHours} hrs/week
                      </div>
                    )}
                    {app.contractType && (
                      <div className="tap-card-detail-row">
                        <span className="tap-card-detail-label">Contract</span>{app.contractType}
                      </div>
                    )}
                    <div className="tap-card-detail-row">
                      <span className="tap-card-detail-label">Applied</span>{formatDate(app.appliedAt)}
                    </div>
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
                        onClick={() => { setInviteRoleChoice('tutor'); setInviteRoleModal(app); }}
                        disabled={isInviting === app.id}
                      >
                        {isInviting === app.id ? 'Generating...' : 'Invite'}
                      </button>
                    )}
                    {app.status === 'invited' && (
                      <span className="tap-badge" style={{ marginLeft: 8 }}>
                        Invited as {app.invitedRole === 'super_tutor' ? 'Super Tutor' : 'Tutor'}
                      </span>
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
            <p>Enter the tutor's email. Existing users are added to this unit; new users receive an activation link to complete their own profile.</p>

            <div className="tap-form-field">
              <label>Tutor email</label>
              <input
                type="email"
                value={directInviteForm.email}
                onChange={(e) => setDirectInviteForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className="tap-form-field">
              <label>Invite as</label>
              <select
                value={directInviteForm.role}
                onChange={(e) => setDirectInviteForm(prev => ({ ...prev, role: e.target.value }))}
              >
                <option value="tutor">Tutor</option>
                <option value="super_tutor">Super Tutor</option>
              </select>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Super Tutors can also be assigned to Lecture and Consultation sessions.
              </p>
            </div>

            {directInviteError && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{directInviteError}</p>}

            <button className="tap-btn tap-btn-invite" style={{ width: '100%' }} onClick={handleDirectInviteSubmit} disabled={isDirectInviting}>
              {isDirectInviting ? 'Creating...' : 'Create Invite Link'}
            </button>
          </div>
        </div>
      )}

      {inviteRoleModal && (
        <div className="tap-modal-overlay" onClick={() => setInviteRoleModal(null)}>
          <div className="tap-modal-content" onClick={e => e.stopPropagation()}>
            <h2>Invite {inviteRoleModal.fullName || inviteRoleModal.name || 'applicant'}</h2>
            <p>Choose what role to invite them as for {activeUnit?.unitCode}.</p>

            <div className="tap-form-field">
              <label>Invite as</label>
              <select
                value={inviteRoleChoice}
                onChange={(e) => setInviteRoleChoice(e.target.value)}
              >
                <option value="tutor">Tutor</option>
                <option value="super_tutor">Super Tutor</option>
              </select>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Super Tutors can also be assigned to Lecture and Consultation sessions.
              </p>
            </div>

            <button
              className="tap-btn tap-btn-invite"
              style={{ width: '100%' }}
              disabled={isInviting === inviteRoleModal.id}
              onClick={() => handleInvite(inviteRoleModal, inviteRoleChoice)}
            >
              {isInviting === inviteRoleModal.id ? 'Generating...' : 'Generate Invite Link'}
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

      {directInviteSuccess && (
        <div className="tap-modal-overlay" onClick={() => setDirectInviteSuccess(null)}>
          <div className="tap-modal-content" onClick={e => e.stopPropagation()}>
            <h2>{directInviteSuccess.title}</h2>
            <p>{directInviteSuccess.message}</p>
            <button className="tap-modal-close-btn" onClick={() => setDirectInviteSuccess(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorApplications;