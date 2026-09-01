import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationsAPI, ucDashboardAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { formatTimeAgo } from '../utils/time';
import { getDisplayName } from '../utils/userName';
import '../styles/UCRequests.css';
import '../styles/UCDashboard.css';

// "Semester 2" + 2026 -> "Sem2 2026". Falls back to whatever was given
// if the semester string doesn't contain a recognisable number.
const formatUnitDate = (semester, year) => {
  if (!semester || !year) return '—';
  const match = String(semester).match(/\d/);
  const semNumber = match ? match[0] : String(semester).trim();
  return `Sem${semNumber} ${year}`;
};

const UCDashboard = () => {
  const navigate = useNavigate();
  const { isLoading: unitsLoading } = useActiveUnit();

  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);
  const displayName = getDisplayName(currentUser);

  const [summary, setSummary] = useState(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [notifications, setNotifications] = useState([]);
  // Dashboard defaults to showing only the current semester's units;
  // this toggle reveals inactive (past/future semester) units too.
  const [showInactiveUnits, setShowInactiveUnits] = useState(false);

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
                <Link to="/unit-setup" className="ucd-stat-card">
                  <div className="ucd-stat-number">{summary.activeUnitCount}</div>
                  <div className="ucd-stat-label">Active Units</div>
                  <div className="ucd-stat-sublabel">of {summary.totalUnits} total</div>
                </Link>

                <Link to="/uc-requests" className={`ucd-stat-card ${summary.pendingRequestsCount > 0 ? 'warn' : ''}`}>
                  <div className="ucd-stat-number">{summary.pendingRequestsCount}</div>
                  <div className="ucd-stat-label">Pending Requests</div>
                  <div className="ucd-stat-sublabel">Waiting for your review</div>
                </Link>

                <Link to="/sessions" className={`ucd-stat-card ${summary.unassignedSessions > 0 ? 'warn' : ''}`}>
                  <div className="ucd-stat-number">{summary.unassignedSessions}</div>
                  <div className="ucd-stat-label">Unassigned Sessions</div>
                  <div className="ucd-stat-sublabel">of {summary.totalSessions} total</div>
                </Link>

                <Link to="/sessions" className={`ucd-stat-card ${summary.pendingConfirmations > 0 ? 'warn' : ''}`}>
                  <div className="ucd-stat-number">{summary.pendingConfirmations}</div>
                  <div className="ucd-stat-label">Awaiting Tutor Confirmation</div>
                  <div className="ucd-stat-sublabel">Sessions assigned, not yet confirmed</div>
                </Link>
              </div>

              <section className="ucd-section">
                <div className="ucd-section-header">
                  <h3>Your Units</h3>
                  <div className="ucd-section-header-actions">
                    <label className="ucd-filter-toggle">
                      <input
                        type="checkbox"
                        checked={showInactiveUnits}
                        onChange={(e) => setShowInactiveUnits(e.target.checked)}
                      />
                      Show inactive units{inactiveUnitCount > 0 ? ` (${inactiveUnitCount})` : ''}
                    </label>
                    <Link to="/unit-setup" className="ucd-section-link">Manage units</Link>
                  </div>
                </div>
                {summary.unitStatuses.length === 0 ? (
                  <div className="ucd-empty">You haven't created any units yet.</div>
                ) : visibleUnitStatuses.length === 0 ? (
                  <div className="ucd-empty">
                    No active units right now.
                    {inactiveUnitCount > 0 && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="ucd-empty-action"
                          onClick={() => setShowInactiveUnits(true)}
                        >
                          Show {inactiveUnitCount} inactive unit{inactiveUnitCount === 1 ? '' : 's'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <table className="ucd-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Date</th>
                        <th>Sessions</th>
                        <th>Unassigned</th>
                        <th>Tutors Submitted Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUnitStatuses.map(u => (
                        <tr key={u.unitId} className={!u.isActive ? 'inactive' : ''}>
                          <td>{u.unitCode}{!u.isActive && ' (inactive)'}</td>
                          <td>{formatUnitDate(u.semester, u.year)}</td>
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
                      <button
                        key={n.id}
                        type="button"
                        className={`ucd-notification-item ${n.actionUrl ? 'clickable' : ''}`}
                        onClick={() => handleNotificationClick(n)}
                        disabled={!n.actionUrl}
                      >
                        <p className="ucd-notification-text">{n.title}</p>
                        <p className="ucd-notification-time">{formatTimeAgo(n.createdAt)}</p>
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

export default UCDashboard;