import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useActiveUnit } from '../context/ActiveUnitContext';
import '../styles/UCSidebar.css';

const TutorSidebar = ({ activePage }) => {
  const { activeUnit, allUnits, setActiveUnitId, isLoading } = useActiveUnit();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);

  const displayName = currentUser?.name || 'Guest';
  const avatarLetter = displayName.charAt(0).toUpperCase();

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

  const navItem = (label, path, key) => {
    if (activePage === key) {
      return <span className="uc-nav-item active">{label}</span>;
    }
    return <Link to={path} className="uc-nav-item">{label}</Link>;
  };

  return (
    <aside className="uc-sidebar">
      <div className="uc-logo-section">
        <div className="uc-logo"><span className="uc-logo-icon">S</span></div>
        <h2 className="uc-brand-name">Sessioneer</h2>
      </div>

      <div className="ucs-active-unit-wrapper" ref={dropdownRef}>
        <button
          className="ucs-active-unit-btn"
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isLoading || allUnits.length === 0}
        >
          <div className="ucs-active-unit-text">
            <p className="uc-active-label">Active Unit</p>
            <p className="uc-unit-code">
              {isLoading ? 'Loading...' : (activeUnit ? activeUnit.unitCode : 'No unit yet')}
            </p>
            {activeUnit && (
              <p className="uc-unit-semester">{activeUnit.semester}, {activeUnit.year}</p>
            )}
          </div>
          {allUnits.length > 0 && <span className="ucs-dropdown-arrow">&#9662;</span>}
        </button>

        {showDropdown && (
          <div className="ucs-dropdown">
            {allUnits.map(unit => (
              <button
                key={unit.id}
                className={`ucs-dropdown-item ${unit.id === activeUnit?.id ? 'selected' : ''} ${!unit.isActive ? 'inactive' : ''}`}
                onClick={() => handleSelectUnit(unit.id)}
              >
                <span className="ucs-dropdown-code">{unit.unitCode}</span>
                <span className="ucs-dropdown-meta">{unit.semester}, {unit.year}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="uc-navigation">
        {navItem('Dashboard', '/', 'dashboard')}
        {navItem('Sessions', activeUnit ? `/tutor-sessions/${activeUnit.id}` : '#sessions', 'sessions')}
        {navItem('Availability', '/availability', 'availability')}
        {navItem('Schedule', activeUnit ? `/tutor-schedule/${activeUnit.id}` : '#schedule', 'schedule')}
        {navItem('Requests', '/requests', 'requests')}
        {navItem('Messages', '/tutor-messages', 'messages')}
      </nav>

      <div className="uc-user-footer-row">
        <Link to="/profile" className="uc-user-profile" style={{ textDecoration: 'none' }}>
          <div className="uc-user-avatar">{avatarLetter}</div>
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