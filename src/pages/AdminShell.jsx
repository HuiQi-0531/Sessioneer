import React from 'react';
import AdminSidebar from '../components/AdminSidebar';
import '../styles/Admin.css';

const AdminShell = ({ activePage, title, eyebrow, children, actions }) => {
  return (
    <div className="admin-layout">
      <AdminSidebar activePage={activePage} />
      <main className="admin-main">
        <header className="admin-header">
          <div>
            {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
          </div>
          {actions && <div className="admin-header-actions">{actions}</div>}
        </header>
        <div className="admin-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminShell;
