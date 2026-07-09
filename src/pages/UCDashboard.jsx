import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { notificationsAPI, ucDashboardAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/UCDashboard.css';

const timeAgo = (isoString) => {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

const UCDashboard = () => {
  const { isLoading: unitsLoading } = useActiveUnit();

  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);
  const displayName = currentUser?.name || 'Guest';

  const [summary, setSummary] = useState(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadSummary();
    loadNotifications();
  }, []);

  const loadSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const data = await ucDashboardAPI.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('Error loading dashboard summary:', err);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const loadNotifications = async () => {
    try {
      const data = await notificationsAPI.getAll();
      setNotifications(data.notifications.slice(0, 5));
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="dashboard" />

      <main className="uc-main-content">
        <UCPageHeader title="Dashboard" />

        <div className="ucd-content">
          <div className="ucd-welcome">
            <h2>Welcome back, {displayName}</h2>
          </div>

          {unitsLoading || isLoadingSummary ? (
            <div className="ucd-loading">Loading your dashboard...</div>
          ) : !summary ? (
            <div className="ucd-loading">Could not load your dashboard. Please refresh.</div>
          ) : (
            <>
              <div className="ucd-stats-grid">
                <div className="ucd-stat-card">
                  <div className="ucd-stat-number">{summary.activeUnitCount}</div>
                  <div className="ucd-stat-label">Active Units</div>
                  <div className="ucd-stat-sublabel">of {summary.totalUnits} total</div>
                </div>

                <div className={`ucd-stat-card ${summary.pendingRequestsCount > 0 ? 'warn' : ''}`}>
                  <div className="ucd-stat-number">{summary.pendingRequestsCount}</div>
                  <div className="ucd-stat-label">Pending Requests</div>
                  <div className="ucd-stat-sublabel">Waiting for your review</div>
                </div>

                <div className={`ucd-stat-card ${summary.unassignedSessions > 0 ? 'warn' : ''}`}>
                  <div className="ucd-stat-number">{summary.unassignedSessions}</div>
                  <div className="ucd-stat-label">Unassigned Sessions</div>
                  <div className="ucd-stat-sublabel">of {summary.totalSessions} total</div>
                </div>

                <div className={`ucd-stat-card ${summary.pendingConfirmations > 0 ? 'warn' : ''}`}>
                  <div className="ucd-stat-number">{summary.pendingConfirmations}</div>
                  <div className="ucd-stat-label">Awaiting Tutor Confirmation</div>
                  <div className="ucd-stat-sublabel">Sessions assigned, not yet confirmed</div>
                </div>
              </div>

              <section className="ucd-section">
                <div className="ucd-section-header">
                  <h3>Your Units</h3>
                  <Link to="/unit-setup" className="ucd-section-link">Manage units</Link>
                </div>
                {summary.unitStatuses.length === 0 ? (
                  <div className="ucd-empty">You haven't created any units yet.</div>
                ) : (
                  <table className="ucd-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Sessions</th>
                        <th>Unassigned</th>
                        <th>Tutors Submitted Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.unitStatuses.map(u => (
                        <tr key={u.unitId} className={!u.isActive ? 'inactive' : ''}>
                          <td>{u.unitCode}{!u.isActive && ' (inactive)'}</td>
                          <td>{u.sessionCount}</td>
                          <td>
                            {u.unassignedCount > 0 ? (
                              <span className="ucd-badge warn">{u.unassignedCount} unassigned</span>
                            ) : (
                              <span className="ucd-badge ok">All assigned</span>
                            )}
                          </td>
                          <td>{u.tutorsSubmittedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="ucd-section">
                <h3>Notifications</h3>
                {notifications.length === 0 ? (
                  <div className="ucd-empty">No notifications yet.</div>
                ) : (
                  <div className="ucd-notification-list">
                    {notifications.map(n => (
                      <div key={n.id} className="ucd-notification-item">
                        <p className="ucd-notification-text">{n.title}</p>
                        <p className="ucd-notification-time">{timeAgo(n.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default UCDashboard;