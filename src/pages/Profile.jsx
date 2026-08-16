import React, { useState, useEffect, useMemo } from 'react';
import { profileAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { getAvatarLetter, getDisplayName } from '../utils/userName';
import '../styles/UCRequests.css';
import '../styles/Profile.css';

const Profile = () => {
  const currentUser = useMemo(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  }, []);
  const { activeViewRole } = useActiveUnit();
  const effectiveRole = activeViewRole || currentUser?.role;
  const isTutor = effectiveRole === 'tutor';
  const Sidebar = isTutor ? TutorSidebar : UCSidebar;

  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    workExperience: '',
    maximumHours: '',
    contractType: ''
  });  
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
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
      setFormData({
        firstName: data.firstName || data.name || '',
        lastName: data.lastName || '',
        phoneNumber: data.phoneNumber || '',
        workExperience: data.workExperience || '',
        maximumHours: data.maximumHours ?? '',
        contractType: data.contractType || ''
      });    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const syncCurrentUser = (updated) => {
    const saved = localStorage.getItem('currentUser');
    if (!saved) return;

    const parsed = JSON.parse(saved);
    parsed.name = updated.name;
    parsed.firstName = updated.firstName;
    parsed.lastName = updated.lastName;
    parsed.displayName = updated.displayName;
    parsed.avatarUrl = updated.avatarUrl;
    localStorage.setItem('currentUser', JSON.stringify(parsed));
    window.dispatchEvent(new Event('sessioneer-user-updated'));
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMessage({ type: 'error', text: 'Please choose an image file.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage({ type: 'error', text: 'Please choose an image under 2 MB.' });
      return;
    }

    setIsUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const updated = await profileAPI.uploadAvatar(file);
      setProfile(updated);
      syncCurrentUser(updated);
      setProfileMessage({ type: 'success', text: 'Profile picture updated successfully.' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.message || 'Failed to upload profile picture.' });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleProfileSave = async () => {
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const payload = {
        ...formData,
        maximumHours: formData.maximumHours === '' ? null : parseInt(formData.maximumHours, 10)
      };
      const updated = await profileAPI.update(payload);
      setProfile(updated);
      syncCurrentUser(updated);

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
          <UCPageHeader title="Profile & Settings" />
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
            <label className={`pf-avatar-upload ${isUploadingAvatar ? 'uploading' : ''}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
              />
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt={getDisplayName(profile)} className="pf-avatar-img" />
              ) : (
                <span>{getAvatarLetter(profile)}</span>
              )}
              <span className="pf-avatar-overlay">{isUploadingAvatar ? 'Uploading...' : 'Change'}</span>
            </label>
            <div>
              <div className="pf-avatar-name">{getDisplayName(profile)}</div>
              <div className="pf-avatar-role">{isTutor ? 'Tutor' : 'Unit Coordinator'}</div>
              <div className="pf-avatar-hint">Click the picture to upload a JPG, PNG, WEBP, or GIF.</div>
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
                <label>First name</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="pf-field">
                <label>Last name</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="pf-row">
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
                  <input
                    type="text"
                    value={formData.workExperience}
                    onChange={(e) => setFormData(prev => ({ ...prev, workExperience: e.target.value }))}
                    placeholder="e.g. 2 years tutoring first-year programming units"
                  />
                </div>
                <div className="pf-row">
                  <div className="pf-field">
                    <label>Maximum hours / week</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.maximumHours}
                      onChange={(e) => setFormData(prev => ({ ...prev, maximumHours: e.target.value }))}
                      placeholder="e.g. 10"
                    />
                  </div>
                  <div className="pf-field">
                    <label>Contract type</label>
                    <select
                      value={formData.contractType}
                      onChange={(e) => setFormData(prev => ({ ...prev, contractType: e.target.value }))}
                    >
                      <option value="">-- Select --</option>
                      <option value="Casual">Casual</option>
                      <option value="Sessional">Sessional</option>
                      <option value="Fixed-term">Fixed-term (Contract)</option>
                    </select>
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
