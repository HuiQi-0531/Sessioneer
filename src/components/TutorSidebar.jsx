import React, { useState, useRef, useEffect, useCallback} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActiveUnit } from '../context/ActiveUnitContext';
import { getSocket } from '../utils/socket';
import { getCachedHasUnreadMessages, invalidateMessageUnreadCache } from '../utils/messageUnreadCache';
import { getAvatarLetter, getDisplayName } from '../utils/userName';
import '../styles/UCSidebar.css';

const TutorSidebar = ({ activePage }) => {
  const {
    activeUnit,
    allUnits,
    setActiveUnitId,
    isLoading,
    activeViewRole,
    activeUnitRoles,
    canSwitchRole,
    setActiveViewRole
  } = useActiveUnit();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const readCurrentUser = () => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  };
  const [currentUser, setCurrentUser] = useState(readCurrentUser);

const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

useEffect(() => {
  const handleUserUpdate = () => setCurrentUser(readCurrentUser());
  window.addEventListener('sessioneer-user-updated', handleUserUpdate);
  window.addEventListener('storage', handleUserUpdate);
  return () => {
    window.removeEventListener('sessioneer-user-updated', handleUserUpdate);
    window.removeEventListener('storage', handleUserUpdate);
  };
}, []);

const checkUnreadMessages = useCallback(async () => {
  if (!allUnits || allUnits.length === 0) {
    setHasUnreadMessages(false);
    return;
  }

  try {
    const hasUnread = await getCachedHasUnreadMessages(allUnits);
    setHasUnreadMessages(hasUnread);
  } catch (err) {
    console.error('Error checking unread messages:', err);
  }
}, [allUnits]);

useEffect(() => {
  checkUnreadMessages();
}, [checkUnreadMessages]);

useEffect(() => {
  const socket = getSocket();
  if (!socket) return;

  const handleNewMessage = () => {
    invalidateMessageUnreadCache();
    checkUnreadMessages();
  };

  socket.on('direct-message', handleNewMessage);
  socket.on('group-message', handleNewMessage);

  return () => {
    socket.off('direct-message', handleNewMessage);
    socket.off('group-message', handleNewMessage);
  };
}, [checkUnreadMessages]);

  const displayName = getDisplayName(currentUser);
  const avatarLetter = getAvatarLetter(currentUser);
  const tutorUnits = allUnits.filter(unit => unit.roles?.includes('tutor'));
  const displayActiveUnit = activeUnit?.roles?.includes('tutor')
    ? activeUnit
    : tutorUnits[0] || null;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUnit = (unitId) => {
    setActiveUnitId(unitId);
    setShowDropdown(false);
  };

  const handleRoleSwitch = (role) => {
    setActiveViewRole(role);
    navigate(role === 'coordinator' ? '/uc-requests' : '/tutor-dashboard', { replace: true });
  };

  const navItem = (label, path, key, showDot = false) => {
  const content = (
    <>
        {label}
        {showDot && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#ef4444',
              marginLeft: 6,
              verticalAlign: 'middle',
            }}
          />
        )}
      </>
    );

    if (activePage === key) {
      return <span className="uc-nav-item active">{content}</span>;
    }
    return <Link to={path} className="uc-nav-item">{content}</Link>;
  };

  return (
    <aside className="uc-sidebar">
      <Link to="/tutor-dashboard" className="uc-logo-section" style={{ textDecoration: 'none', cursor: 'pointer' }}>
        <div className="uc-logo"><span className="uc-logo-icon">S</span></div>
        <h2 className="uc-brand-name">Sessioneer</h2>
      </Link>

      <div className="ucs-active-unit-wrapper" ref={dropdownRef}>
        <button
          className="ucs-active-unit-btn"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isLoading || tutorUnits.length === 0}
          type="button"
        >
          <div className="ucs-active-unit-text">
            <p className="uc-active-label">Active Unit</p>
            <p className="uc-unit-code">
              {isLoading ? 'Loading...' : (displayActiveUnit ? displayActiveUnit.unitCode : 'No tutor unit yet')}
            </p>
            {displayActiveUnit && (
              <p className="uc-unit-semester">{displayActiveUnit.semester}, {displayActiveUnit.year}</p>
            )}
          </div>
          {tutorUnits.length > 0 && <span className="ucs-dropdown-arrow">&#9662;</span>}
        </button>

        {showDropdown && (
          <div className="ucs-dropdown">
            {tutorUnits.map(unit => (
              <button
                key={unit.id}
                className={`ucs-dropdown-item ${unit.id === displayActiveUnit?.id ? 'selected' : ''} ${!unit.isActive ? 'inactive' : ''}`}
                onClick={() => handleSelectUnit(unit.id)}
                type="button"
              >
                <span className="ucs-dropdown-code">{unit.unitCode}</span>
                <span className="ucs-dropdown-meta">{unit.semester}, {unit.year}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {canSwitchRole && (
        <div className="ucs-role-switcher" aria-label="Viewing role">
          {activeUnitRoles.map(role => (
            <button
              key={role}
              className={`ucs-role-option ${activeViewRole === role ? 'active' : ''}`}
              onClick={() => handleRoleSwitch(role)}
              type="button"
            >
              {role === 'coordinator' ? 'UC' : 'Tutor'}
            </button>
          ))}
        </div>
      )}

      <nav className="uc-navigation">
        {navItem('Dashboard', '/tutor-dashboard', 'dashboard')}
        {navItem('Sessions', displayActiveUnit ? '/tutor-sessions' : '#sessions', 'sessions')}
        {navItem('Availability', '/availability', 'availability')}
        {navItem('Schedule', displayActiveUnit ? '/tutor-schedule' : '#schedule', 'schedule')}
        {navItem('Requests', '/requests', 'requests')}
        {navItem('Messages', '/tutor-messages', 'messages', hasUnreadMessages)}
      </nav>

      <div className="uc-user-footer-row">
        <Link to="/profile" className="uc-user-profile" style={{ textDecoration: 'none' }}>
          <div className="uc-user-avatar">
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={displayName} className="uc-user-avatar-img" />
            ) : (
              avatarLetter
            )}
          </div>
          <div className="uc-user-info">
            <p className="uc-user-name">{displayName}</p>
            <p className="uc-user-role">Tutor</p>
          </div>
        </Link>
        <Link to="/logout" className="uc-logout-btn" aria-label="Log out" title="Log out">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </Link>
      </div>
    </aside>
  );
};

export default TutorSidebar;
