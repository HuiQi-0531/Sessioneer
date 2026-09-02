import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, CalendarDays, Users, FileText, Clock, ListChecks, RefreshCw, MessageSquare } from 'lucide-react';
import { notificationsAPI, ucDashboardAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { formatTimeAgo } from '../utils/time';
import { getDisplayName } from '../utils/userName';
import '../styles/UCRequests.css';
import '../styles/UCDashboard.css';



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
                <h3>Quick Links</h3>
                <div className="ucd-quicklinks-grid">
                  <Link to="/sessions" className="ucd-quicklink-card">
                    <ListChecks size={22} />
                    <span>Sessions</span>
                  </Link>
                  <Link to="/tutors" className="ucd-quicklink-card">
                    <Users size={22} />
                    <span>Tutors</span>
                  </Link>
                  <Link to="/tutor-applications" className="ucd-quicklink-card">
                    <FileText size={22} />
                    <span>Applications</span>
                  </Link>
                  <Link to="/uc-availability" className="ucd-quicklink-card">
                    <Clock size={22} />
                    <span>Availability</span>
                  </Link>
                  <Link to="/schedule-builder" className="ucd-quicklink-card">
                    <CalendarDays size={22} />
                    <span>Schedule Builder</span>
                  </Link>
                  <Link to="/uc-requests" className="ucd-quicklink-card">
                    <RefreshCw size={22} />
                    <span>Requests</span>
                  </Link>
                  <Link to="/messages" className="ucd-quicklink-card">
                    <MessageSquare size={22} />
                    <span>Messages</span>
                  </Link>
                  <Link to="/unit-setup" className="ucd-quicklink-card ucd-quicklink-highlight">
                    <LayoutGrid size={22} />
                    <span>View All Units</span>
                  </Link>
                </div>
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