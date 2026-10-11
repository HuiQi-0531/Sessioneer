import React, { useState } from 'react';
import AdminShell from './AdminShell';
import { profileAPI } from '../config/api';
import { passwordRuleError, PASSWORD_HINT } from '../utils/passwordRules';

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

// The admin's own password lives here: admins have no Profile page
// (that page belongs to tutors and coordinators).
const AdminPasswordPanel = () => {
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [message, setMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setMessage(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    const ruleError = passwordRuleError(form.newPassword);
    if (ruleError) {
      setMessage({ type: 'error', text: ruleError });
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setMessage({ type: 'error', text: "New password and confirmation don't match." });
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setMessage({ type: 'error', text: 'The new password must be different from the current one.' });
      return;
    }
    setIsSaving(true);
    try {
      await profileAPI.changePassword(form.currentPassword, form.newPassword);
      setForm(EMPTY_PASSWORDS);
      setMessage({ type: 'success', text: 'Password updated. Other browsers signed in as this admin have been signed out.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="admin-panel admin-password-panel">
      <div className="admin-panel-header">
        <h2>Change Password</h2>
      </div>
      <p className="admin-setting-note">Update the password for this admin account.</p>
      <form className="admin-password-form" onSubmit={handleSubmit}>
        <label>
          Current password
          <input type="password" name="currentPassword" value={form.currentPassword} onChange={handleChange} autoComplete="current-password" required />
        </label>
        <label>
          New password
          <input type="password" name="newPassword" value={form.newPassword} onChange={handleChange} autoComplete="new-password" required />
          <small className="admin-field-hint">{PASSWORD_HINT}</small>
        </label>
        <label>
          Confirm new password
          <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" required />
        </label>
        {message && (
          <div className={`admin-alert ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
            {message.text}
          </div>
        )}
        <div>
          <button
            type="submit"
            className="admin-primary-btn"
            disabled={isSaving || !form.currentPassword || !form.newPassword || !form.confirmPassword}
          >
            {isSaving ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>
    </article>
  );
};

const AdminSettings = () => {
  return (
    <AdminShell activePage="settings" title="System Settings" eyebrow="Rules and configuration">
      <section className="admin-settings-grid">
        <article className="admin-panel">
          <div className="admin-panel-header">
            <h2>Access Rules</h2>
            <span className="admin-setting-status">Active</span>
          </div>
          <p className="admin-setting-note">
            Controls how users reach admin, coordinator, and tutor areas after login.
          </p>
          <div className="admin-setting-row">
            <span>Role-based routing</span>
            <strong>Enabled</strong>
          </div>
          <div className="admin-setting-row">
            <span>Admin console access</span>
            <strong>Admin only</strong>
          </div>
          <div className="admin-setting-row">
            <span>Unit coordinator access</span>
            <strong>Unit membership</strong>
          </div>
        </article>

        <article className="admin-panel">
          <div className="admin-panel-header">
            <h2>Semester Controls</h2>
            <span className="admin-setting-status">Active</span>
          </div>
          <p className="admin-setting-note">
            Core rules used by unit setup, availability submission, and session assignment.
          </p>
          <div className="admin-setting-row">
            <span>Duplicate unit code per semester</span>
            <strong>Blocked</strong>
          </div>
          <div className="admin-setting-row">
            <span>Availability scope</span>
            <strong>All tutor units</strong>
          </div>
          <div className="admin-setting-row">
            <span>Assignment reminder</span>
            <strong>3 days</strong>
          </div>
        </article>

        <AdminPasswordPanel />
      </section>
    </AdminShell>
  );
};

export default AdminSettings;