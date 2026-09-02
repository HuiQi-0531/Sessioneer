import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, ListChecks, RefreshCw, MessageSquare, LayoutGrid } from 'lucide-react';
import { tutorDashboardAPI, notificationsAPI } from '../config/api';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { formatTimeAgo } from '../utils/time';
import { getDisplayName } from '../utils/userName';
import '../styles/UCRequests.css';
import '../styles/TutorDashboard.css';



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
                <h3>Quick Links</h3>
                <div className="td-quicklinks-grid">
                  <Link to="/tutor-sessions" className="td-quicklink-card">
                    <ListChecks size={22} />
                    <span>Sessions</span>
                  </Link>
                  <Link to="/availability" className="td-quicklink-card">
                    <Clock size={22} />
                    <span>Availability</span>
                  </Link>
                  <Link to="/tutor-schedule" className="td-quicklink-card">
                    <CalendarDays size={22} />
                    <span>Schedule</span>
                  </Link>
                  <Link to="/requests" className="td-quicklink-card">
                    <RefreshCw size={22} />
                    <span>Requests</span>
                  </Link>
                  <Link to="/tutor-messages" className="td-quicklink-card">
                    <MessageSquare size={22} />
                    <span>Messages</span>
                  </Link>
                  <Link to="/tutor-units" className="td-quicklink-card td-quicklink-highlight">
                    <LayoutGrid size={22} />
                    <span>View All Units</span>
                  </Link>
                </div>
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