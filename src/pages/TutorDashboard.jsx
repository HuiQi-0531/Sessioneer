import React, { useState, useEffect, useMemo } from 'react';
import { tutorDashboardAPI, notificationsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorDashboard.css';

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

const TutorDashboard = () => {
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
      const data = await tutorDashboardAPI.getSummary();
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
      <TutorSidebar activePage="dashboard" />

      <main className="uc-main-content">
        <UCPageHeader title="Dashboard" />

        <div className="td-content">
          <div className="td-welcome">
            <h2>Welcome back, {displayName}</h2>
          </div>

          {unitsLoading || isLoadingSummary ? (
            <div className="td-loading">Loading your dashboard...</div>
          ) : !summary ? (
            <div className="td-loading">Could not load your dashboard. Please refresh.</div>
          ) : (
            <>
              <div className="td-stats-grid">
                <div className="td-stat-card">
                  <div className="td-stat-number">{summary.availabilitySubmittedCount}</div>
                  <div className="td-stat-label">Availability Submitted</div>
                  <div className="td-stat-sublabel">of {summary.totalUnits} unit{summary.totalUnits !== 1 ? 's' : ''}</div>
                </div>

                <div className="td-stat-card">
                  <div className="td-stat-number">{summary.pendingRequestsCount}</div>
                  <div className="td-stat-label">Pending Requests</div>
                  <div className="td-stat-sublabel">Waiting for approval</div>
                </div>

                <div className="td-stat-card">
                  <div className="td-stat-number">{summary.totalSessions}</div>
                  <div className="td-stat-label">Sessions</div>
                  <div className="td-stat-sublabel">{summary.confirmedSessions} confirmed</div>
                </div>
              </div>

              <section className="td-section">
                <h3>Your Units</h3>
                {summary.unitStatuses.length === 0 ? (
                  <div className="td-empty">You're not linked to any units yet.</div>
                ) : (
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Availability</th>
                        <th>Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.unitStatuses.map(u => (
                        <tr key={u.unitId}>
                          <td>{u.unitCode}</td>
                          <td>
                            <span className={`td-badge ${u.availabilitySubmitted ? 'submitted' : 'pending'}`}>
                              {u.availabilitySubmitted ? 'Submitted' : 'Not submitted'}
                            </span>
                          </td>
                          <td>{u.assignedSessionCount} session{u.assignedSessionCount !== 1 ? 's' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="td-section">
                <h3>Notifications</h3>
                {notifications.length === 0 ? (
                  <div className="td-empty">No notifications yet.</div>
                ) : (
                  <div className="td-notification-list">
                    {notifications.map(n => (
                      <div key={n.id} className="td-notification-item">
                        <p className="td-notification-text">{n.title}</p>
                        <p className="td-notification-time">{timeAgo(n.createdAt)}</p>
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

export default TutorDashboard;