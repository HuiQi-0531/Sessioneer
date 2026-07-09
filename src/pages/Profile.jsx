import React, { useState, useEffect, useMemo } from 'react';
import { profileAPI } from '../config/api';
import UCSidebar from '../components/UCSidebar';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/Profile.css';

const Profile = () => {
  const currentUser = useMemo(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  }, []);
  const isTutor = currentUser?.role === 'tutor';
  const Sidebar = isTutor ? TutorSidebar : UCSidebar;

  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({ name: '', phoneNumber: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const data = await profileAPI.get();
      setProfile(data);
      setFormData({ name: data.name || '', phoneNumber: data.phoneNumber || '' });
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSave = async () => {
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const updated = await profileAPI.update(formData);
      setProfile(updated);

      // Keep the sidebar's cached name in sync
      const saved = localStorage.getItem('currentUser');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.name = updated.name;
        localStorage.setItem('currentUser', JSON.stringify(parsed));
      }

      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async () => {
    setPasswordMessage(null);
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: "New password and confirmation don't match." });
      return;
    }
    setIsSavingPassword(true);
    try {
      await profileAPI.changePassword(passwordData.currentPassword, passwordData.newPassword);
      setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleToggleNotification = async (key) => {
    if (!profile) return;
    const next = { ...profile, [key]: !profile[key] };
    setProfile(next);
    setIsSavingNotifications(true);
    try {
      await profileAPI.updateNotifications(next.notifySessionUpdates, next.notifyRequestUpdates);
    } catch (err) {
      console.error('Error updating notification preferences:', err);
      alert('Failed to save notification preference. Please try again.');
      loadProfile();
    } finally {
      setIsSavingNotifications(false);
    }
  };

  if (isLoading) {
    return (
      <div className="uc-dashboard-container">
        <Sidebar activePage="profile" />
        <main className="uc-main-content">
          <div className="pf-content">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <Sidebar activePage="profile" />

      <main className="uc-main-content">
        <UCPageHeader title="Profile & Settings" />

        <div className="pf-content">
          <div className="pf-avatar-row">
            <div className="pf-avatar">{profile?.name?.charAt(0).toUpperCase()}</div>
            <div>
              <div className="pf-avatar-name">{profile?.name}</div>
              <div className="pf-avatar-role">{isTutor ? 'Tutor' : 'Unit Coordinator'}</div>
            </div>
          </div>

          <div className="pf-card">
            <h3>Profile Details</h3>

            <div className="pf-field">
              <label>Email</label>
              <input type="email" value={profile?.email || ''} disabled />
              <p className="pf-field-hint">Your email is your login and can't be changed here.</p>
            </div>

            <div className="pf-row">
              <div className="pf-field">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="pf-field">
                <label>Phone number</label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="e.g. 0400 123 456"
                />
              </div>
            </div>

            {isTutor && (
              <>
                <div className="pf-field">
                  <label>Work experience</label>
                  <input type="text" value={profile?.workExperience || 'Not set'} disabled />
                  <p className="pf-field-hint">Editable from the Availability page in a future update.</p>
                </div>
                <div className="pf-row">
                  <div className="pf-field">
                    <label>Maximum hours / week</label>
                    <input type="text" value={profile?.maximumHours ?? 'Not set'} disabled />
                  </div>
                  <div className="pf-field">
                    <label>Contract type</label>
                    <input type="text" value={profile?.contractType || 'Not set'} disabled />
                  </div>
                </div>
              </>
            )}

            <button className="pf-save-btn" onClick={handleProfileSave} disabled={isSavingProfile}>
              {isSavingProfile ? 'Saving...' : 'Save Profile'}
            </button>
            {profileMessage && (
              <p className={profileMessage.type === 'success' ? 'pf-success' : 'pf-error'}>{profileMessage.text}</p>
            )}
          </div>

          <div className="pf-card">
            <h3>Change Password</h3>

            <div className="pf-field">
              <label>Current password</label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
              />
            </div>
            <div className="pf-row">
              <div className="pf-field">
                <label>New password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                />
              </div>
              <div className="pf-field">
                <label>Confirm new password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                />
              </div>
            </div>

            <button
              className="pf-save-btn"
              onClick={handlePasswordSave}
              disabled={isSavingPassword || !passwordData.currentPassword || !passwordData.newPassword}
            >
              {isSavingPassword ? 'Updating...' : 'Update Password'}
            </button>
            {passwordMessage && (
              <p className={passwordMessage.type === 'success' ? 'pf-success' : 'pf-error'}>{passwordMessage.text}</p>
            )}
          </div>

          <div className="pf-card">
            <h3>Notifications</h3>

            <div className="pf-toggle-row">
              <div className="pf-toggle-info">
                <div className="pf-toggle-label">Schedule & session updates</div>
                <div className="pf-toggle-sublabel">New assignments, confirmations, and declines</div>
              </div>
              <label className="pf-switch">
                <input
                  type="checkbox"
                  checked={profile?.notifySessionUpdates ?? true}
                  onChange={() => handleToggleNotification('notifySessionUpdates')}
                  disabled={isSavingNotifications}
                />
                <span className="pf-switch-slider" />
              </label>
            </div>

            <div className="pf-toggle-row">
              <div className="pf-toggle-info">
                <div className="pf-toggle-label">Swap & change requests</div>
                <div className="pf-toggle-sublabel">New requests and their approval status</div>
              </div>
              <label className="pf-switch">
                <input
                  type="checkbox"
                  checked={profile?.notifyRequestUpdates ?? true}
                  onChange={() => handleToggleNotification('notifyRequestUpdates')}
                  disabled={isSavingNotifications}
                />
                <span className="pf-switch-slider" />
              </label>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;