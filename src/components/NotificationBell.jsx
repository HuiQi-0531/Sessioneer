import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../config/api';
import '../styles/NotificationBell.css';

const POLL_INTERVAL_MS = 15000;

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

const NotificationBell = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await notificationsAPI.getAll();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      await load();
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  const handleItemClick = async (n) => {
    if (!n.isRead) {
      try {
        await notificationsAPI.markRead(n.id);
        await load();
      } catch (err) {
        console.error('Error marking notification read:', err);
      }
    }
    setShowDropdown(false);
    if (n.actionUrl) {
      navigate(n.actionUrl);
    }
  };

  return (
    <div className="nb-wrapper" ref={dropdownRef}>
      <button className="nb-bell-btn" onClick={() => setShowDropdown(!showDropdown)} aria-label="Notifications">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="nb-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {showDropdown && (
        <div className="nb-dropdown">
          <div className="nb-dropdown-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="nb-mark-all-btn" onClick={handleMarkAllRead}>Mark all read</button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="nb-empty">No notifications yet.</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`nb-item ${!n.isRead ? 'unread' : ''}`}
                onClick={() => handleItemClick(n)}
              >
                <span className={`nb-item-dot ${n.isRead ? 'read' : ''}`} />
                <div className="nb-item-body">
                  <div className="nb-item-title">{n.title}</div>
                  <div className="nb-item-content">{n.content}</div>
                  <div className="nb-item-time">{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;