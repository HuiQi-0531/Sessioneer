import React from 'react';
import { Link } from 'react-router-dom';
import AdminShell from './AdminShell';

const adminAreas = [
  {
    title: 'User Management',
    icon: 'users',
    description: 'Create accounts, update roles, and maintain user details for tutors, coordinators, and admins.',
    path: '/admin/users',
    action: 'Manage users'
  },
  {
    title: 'Unit Management',
    icon: 'units',
    description: 'Create and update units, manage coordinators, and check unit setup across the system.',
    path: '/admin/units',
    action: 'Manage units'
  },
  {
    title: 'Session Management',
    icon: 'sessions',
    description: 'View, add, edit, and remove session records across all units when admin support is needed.',
    path: '/admin/sessions',
    action: 'Manage sessions'
  },
  {
    title: 'Applications',
    icon: 'applications',
    description: 'Review tutor applications and invited tutor records without opening the database manually.',
    path: '/admin/applications',
    action: 'View applications'
  },
  {
    title: 'Requests',
    icon: 'requests',
    description: 'Monitor and action swap, change, and cover requests across all teaching units.',
    path: '/admin/requests',
    action: 'Manage requests'
  },
  {
    title: 'System Settings',
    icon: 'settings',
    description: 'Keep admin-only system controls and configuration notes in one place as the project grows.',
    path: '/admin/settings',
    action: 'Open settings'
  }
];

const iconPaths = {
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
  sessions: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
      <path d="M8 14h4" />
      <path d="M8 18h7" />
    </>
  ),
  applications: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </>
  ),
  requests: (
    <>
      <path d="M7 7h10v10H7z" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="M12 4v3" />
      <path d="M12 17v3" />
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

const AdminAreaIcon = ({ type }) => (
  <span className={`admin-home-icon admin-home-icon-${type}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[type]}
    </svg>
  </span>
);

const AdminDashboard = () => {
  return (
    <AdminShell activePage="dashboard" title="Admin Home" eyebrow="System control">
      <section className="admin-home-grid" aria-label="Admin management areas">
        {adminAreas.map(area => (
          <Link key={area.title} to={area.path} className="admin-home-card">
            <div className="admin-home-card-body">
              <AdminAreaIcon type={area.icon} />
              <div>
                <h3>{area.title}</h3>
                <p>{area.description}</p>
              </div>
            </div>
            <span className="admin-home-action">
              {area.action}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        ))}
      </section>
    </AdminShell>
  );
};

export default AdminDashboard;
