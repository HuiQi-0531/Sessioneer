import React from 'react';
import AdminShell from './AdminShell';

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
      </section>
    </AdminShell>
  );
};

export default AdminSettings;
