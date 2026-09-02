import React from 'react';
import { Link } from 'react-router-dom';
import { getAvatarLetter, getDisplayName } from '../utils/userName';
import '../styles/Admin.css';

const adminLinks = [
  { key: 'dashboard', label: 'Home', path: '/admin-dashboard', icon: 'home' },
  { key: 'users', label: 'Users', path: '/admin/users', icon: 'users' },
  { key: 'units', label: 'Units', path: '/admin/units', icon: 'units' },
  { key: 'sessions', label: 'Sessions', path: '/admin/sessions', icon: 'calendar' },
  { key: 'applications', label: 'Applications', path: '/admin/applications', icon: 'file' },
  { key: 'requests', label: 'Requests', path: '/admin/requests', icon: 'swap' },
  { key: 'settings', label: 'Settings', path: '/admin/settings', icon: 'settings' }
];

const adminNavIcons = {
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="4" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  units: (
    <>
      <path d="M4 19.5V5.75A2.75 2.75 0 0 1 6.75 3H20v17H6.75A2.75 2.75 0 0 1 4 17.25" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  swap: (
    <>
      <path d="M7 7h10v10H7z" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 16 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.37.16.7.36 1 .6.32.25.7.4 1.1.4h.5a2 2 0 1 1 0 4h-.5a1.7 1.7 0 0 0-1.1.4c-.3.24-.63.44-1 .6z" />
    </>
  )
};

const AdminNavIcon = ({ type }) => (
  <span className="admin-nav-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {adminNavIcons[type]}
    </svg>
  </span>
);

const readCurrentUser = () => {
  const savedUser = localStorage.getItem('currentUser');
  return savedUser ? JSON.parse(savedUser) : null;
};

const AdminSidebar = ({ activePage }) => {
  const currentUser = readCurrentUser();
  const displayName = getDisplayName(currentUser, 'Admin User');
  const avatarLetter = getAvatarLetter(currentUser, 'A');

  return (
    <aside className="admin-sidebar">
      <Link to="/admin-dashboard" className="admin-brand" aria-label="Admin dashboard">
        <span className="admin-brand-mark">S</span>
        <span>
          <strong>Sessioneer</strong>
          <small>Admin Console</small>
        </span>
      </Link>

      <nav className="admin-nav" aria-label="Admin navigation">
        {adminLinks.map(link => (
          activePage === link.key ? (
            <span key={link.key} className="admin-nav-link active">
              <AdminNavIcon type={link.icon} />
              <span>{link.label}</span>
            </span>
          ) : (
            <Link key={link.key} to={link.path} className="admin-nav-link">
              <AdminNavIcon type={link.icon} />
              <span>{link.label}</span>
            </Link>
          )
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <Link to="/admin/settings" className="admin-profile-link">
          <span className="admin-avatar">
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={displayName} />
            ) : (
              avatarLetter
            )}
          </span>
          <span className="admin-profile-text">
            <strong>{displayName}</strong>
            <small>Administrator</small>
          </span>
        </Link>
        <Link to="/logout" className="admin-logout" aria-label="Log out" title="Log out">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </Link>
      </div>
    </aside>
  );
};

export default AdminSidebar;
