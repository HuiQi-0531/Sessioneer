import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { tutorDashboardAPI, notificationsAPI } from '../config/api';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { formatTimeAgo } from '../utils/time';
import { getDisplayName } from '../utils/userName';
import '../styles/UCRequests.css';
import '../styles/TutorDashboard.css';

// "Semester 2" + 2026 -> "Sem2 2026". Falls back to whatever was given
// if the semester string doesn't contain a recognisable number.
const formatUnitDate = (semester, year) => {
  if (!semester || !year) return '—';
  const match = String(semester).match(/\d/);
  const semNumber = match ? match[0] : String(semester).trim();
  return `Sem${semNumber} ${year}`;
};

const TutorDashboard = () => {
  const navigate = useNavigate();
  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);
  const displayName = getDisplayName(currentUser);

  const [summary, setSummary] = useState(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [notifications, setNotifications] = useState([]);
  // Same concept as the UC dashboard: default to only the current
  // semester's units, with a toggle to reveal inactive ones.
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);

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

  const handleNotificationClick = async (notification) => {
    if (!notification.actionUrl) {
      return;
    }

    if (!notification.isRead) {
      try {
        await notificationsAPI.markRead(notification.id);
        setNotifications(prev =>
          prev.map(item =>
            item.id === notification.id ? { ...item, isRead: true } : item
          )
        );
      } catch (err) {
        console.error('Error marking notification read:', err);
      }
    }

    navigate(notification.actionUrl);
  };

  const visibleUnitStatuses = useMemo(() => {
    if (!summary) return [];
    return showInactiveUnits
      ? summary.unitStatuses
      : summary.unitStatuses.filter(u => u.isActive);
  }, [summary, showInactiveUnits]);

  const inactiveUnitCount = summary
    ? summary.unitStatuses.filter(u => !u.isActive).length
    : 0;

  return (
    <div className="uc-dashboard-container">
      <TutorSidebar activePage="dashboard" />

      <main className="uc-main-content">
        <UCPageHeader title="Dashboard" />

        <div className="td-content">
          <div className="td-welcome">
            <h2>Welcome back, {displayName}</h2>
          </div>

          {isLoadingSummary ? (
            <div className="td-loading">Loading your dashboard...</div>
          ) : !summary ? (
            <div className="td-loading">Could not load your dashboard. Please refresh.</div>
          ) : (
            <>
              <div className="td-stats-grid">
                <Link to="/availability" className="td-stat-card">
                  <div className="td-stat-number">
                    {summary.availabilitySubmittedCount > 0 ? 'Submitted' : 'Not yet submitted'}
                  </div>
                  <div className="td-stat-label">Availability</div>
                </Link>

                <Link to="/requests" className="td-stat-card">
                  <div className="td-stat-number">{summary.pendingRequestsCount}</div>
                  <div className="td-stat-label">Pending Requests</div>
                  <div className="td-stat-sublabel">Waiting for approval</div>
                </Link>

                <Link to="/tutor-schedule" className="td-stat-card">
                  <div className="td-stat-number">{summary.totalSessions}</div>
                  <div className="td-stat-label">Sessions</div>
                  <div className="td-stat-sublabel">{summary.confirmedSessions} confirmed</div>
                </Link>
              </div>

              <section className="td-section">
                <div className="td-section-header">
                  <h3>Your Units</h3>
                  {inactiveUnitCount > 0 && (
                    <label className="td-filter-toggle">
                      <input
                        type="checkbox"
                        checked={showInactiveUnits}
                        onChange={(e) => setShowInactiveUnits(e.target.checked)}
                      />
                      Show inactive units ({inactiveUnitCount})
                    </label>
                  )}
                </div>
                {summary.unitStatuses.length === 0 ? (
                  <div className="td-empty">You're not linked to any units yet.</div>
                ) : visibleUnitStatuses.length === 0 ? (
                  <div className="td-empty">
                    No active units right now.{' '}
                    <button
                      type="button"
                      className="td-empty-action"
                      onClick={() => setShowInactiveUnits(true)}
                    >
                      Show {inactiveUnitCount} inactive unit{inactiveUnitCount === 1 ? '' : 's'}
                    </button>
                  </div>
                ) : (
                  <table className="td-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Date</th>
                        <th>Availability</th>
                        <th>Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUnitStatuses.map(u => (
                        <tr key={u.unitId} className={!u.isActive ? 'inactive' : ''}>
                          <td>{u.unitCode}{!u.isActive && ' (inactive)'}</td>
                          <td>{formatUnitDate(u.semester, u.year)}</td>
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
                      <button
                        key={n.id}
                        type="button"
                        className={`td-notification-item ${n.actionUrl ? 'clickable' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                        disabled={!n.actionUrl}
                      >
                        <p className="td-notification-text">{n.title}</p>
                        <p className="td-notification-time">{formatTimeAgo(n.createdAt)}</p>
                      </button>
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