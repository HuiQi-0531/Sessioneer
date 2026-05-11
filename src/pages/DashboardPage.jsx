import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Dashboard.css';

const DashboardPage = () => {
  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo">
            <span className="logo-icon">S</span>
          </div>
          <h2 className="brand-name">Sessioneer</h2>
        </div>

        <nav className="navigation">
          <a href="#dashboard" className="nav-item active">Dashboard</a>
          <a href="#sessions" className="nav-item">Sessions</a>
          <Link to="/availability" className="nav-item">Availability</Link>
          <a href="#schedule-builder" className="nav-item">Schedule Builder</a>
          <a href="#requests" className="nav-item">Requests</a>
          <a href="#messages" className="nav-item">Messages</a>
        </nav>

        <div className="user-profile">
          <div className="user-avatar">L</div>
          <div className="user-info">
            <p className="user-name">Elaine Lee</p>
            <p className="user-role">Tutor</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <h1>Dashboard</h1>
          <button className="notification-btn">🔔</button>
        </header>

        <div className="welcome-section">
          <h2>Welcome back, Miss Lee 👋</h2>
          <p className="course-info">
            IFB422 Software Engineering: Architecture and Design · QUT-YOU-001: The art of pitching · Semester 1 2025
          </p>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="stat-number">7</div>
            <div className="stat-label">Availability Submitted</div>
            <div className="stat-sublabel">of 2 units</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon orange">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-number">1</div>
            <div className="stat-label">Pending Requests</div>
            <div className="stat-sublabel">Waiting for approval</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon green">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M3 9H21M8 2V6M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="stat-number">6</div>
            <div className="stat-label">Sessions</div>
            <div className="stat-sublabel">3 confirmed</div>
          </div>
        </div>

        {/* Tutor Unit Status Table */}
        <section className="unit-status-section">
          <div className="section-header">
            <h3>Tutor Unit Status Overview</h3>
            <a href="#view-all" className="view-all-link">View all →</a>
          </div>

          <table className="status-table">
            <thead>
              <tr>
                <th>TUTOR UNIT STATUS OVERVIEW</th>
                <th>STATUS</th>
                <th>AVAILABILITY</th>
                <th>ASSIGNED</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>IFB301</td>
                <td><span className="badge active">active</span></td>
                <td><span className="badge submitted">Submitted</span></td>
                <td>2 sessions</td>
              </tr>
              <tr>
                <td>CAB123</td>
                <td><span className="badge active">active</span></td>
                <td><span className="badge submitted">Submitted</span></td>
                <td>1 sessions</td>
              </tr>
              <tr>
                <td>CAB679</td>
                <td><span className="badge active">active</span></td>
                <td><span className="badge submitted">Submitted</span></td>
                <td>2 sessions</td>
              </tr>
              <tr>
                <td>AMB001</td>
                <td><span className="badge pending">pending</span></td>
                <td><span className="badge pending-status">Pending</span></td>
                <td>0 sessions</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Notifications */}
        <section className="notifications-section">
          <h3>Notifications</h3>
          <div className="notification-list">
            <div className="notification-item blue-border">
              <div className="notification-content">
                <p className="notification-text">New swap request from Sarah Chen</p>
                <p className="notification-time">2 hours ago</p>
              </div>
            </div>
            <div className="notification-item red-border">
              <div className="notification-content">
                <p className="notification-text">Conflict detected in IFN503-T02</p>
                <p className="notification-time">5 hours ago</p>
              </div>
            </div>
            <div className="notification-item green-border">
              <div className="notification-content">
                <p className="notification-text">Emma Wilson updated availability</p>
                <p className="notification-time">1 day ago</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DashboardPage;