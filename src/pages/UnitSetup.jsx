import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { unitsAPI } from '../config/api';
import '../styles/UCRequests.css';
import '../styles/UnitSetup.css';

const UnitSetup = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);

  const displayName = currentUser?.name || 'Guest';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUnits = async () => {
    setIsLoading(true);
    try {
      const data = await unitsAPI.getAll();
      setUnits(data);
    } catch (error) {
      console.error('Error fetching units:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId);

  const handleSelectUnit = (unit) => {
    setSelectedUnitId(unit.id === selectedUnitId ? null : unit.id);
  };

  const handleEdit = () => {
    if (!selectedUnit) return;
    navigate(`/unit-setup/edit/${selectedUnit.id}`);
  };

  const handleDeleteClick = () => {
    if (!selectedUnit) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedUnit) return;
    try {
      await unitsAPI.delete(selectedUnit.id);
      setSelectedUnitId(null);
      setShowDeleteModal(false);
      await fetchUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert('Failed to delete unit. Please try again.');
    }
  };

  return (
    <div className="uc-dashboard-container">
      <aside className="uc-sidebar">
        <div className="uc-logo-section">
          <div className="uc-logo"><span className="uc-logo-icon">S</span></div>
          <h2 className="uc-brand-name">Sessioneer</h2>
        </div>

        <div className="uc-active-unit">
          <p className="uc-active-label">Active Unit</p>
          <p className="uc-unit-code">{selectedUnit ? selectedUnit.unitCode : 'None selected'}</p>
          <p className="uc-unit-semester">
            {selectedUnit ? `${selectedUnit.semester}, ${selectedUnit.year}` : ''}
          </p>
        </div>

        <nav className="uc-navigation">
          <a href="#dashboard" className="uc-nav-item">Dashboard</a>
          <Link to="/unit-setup" className="uc-nav-item active">Unit Setup</Link>
          <a href="#sessions" className="uc-nav-item">Sessions</a>
          <a href="#tutors" className="uc-nav-item">Tutors</a>
          <Link to="/uc-availability" className="uc-nav-item">Availability</Link>
          <a href="#schedule-builder" className="uc-nav-item">Schedule Builder</a>
          <Link to="/uc-requests" className="uc-nav-item">Requests</Link>
          <a href="#messages" className="uc-nav-item">Messages</a>
        </nav>

        <div className="uc-user-profile">
          <div className="uc-user-avatar">{avatarLetter}</div>
          <div className="uc-user-info">
            <p className="uc-user-name">{displayName}</p>
            <p className="uc-user-role">Unit Coordinator</p>
          </div>
        </div>
      </aside>

      <main className="uc-main-content">
        <header className="uc-header">
          <h1>Unit</h1>
          <button className="uc-notification-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </header>

        <div className="us-content">
          <div className="us-top-row">
            <button className="us-create-btn" onClick={() => navigate('/unit-setup/create')}>
              Create Unit
            </button>
          </div>

          {isLoading ? (
            <div className="us-empty-state"><p>Loading units...</p></div>
          ) : units.length === 0 ? (
            <div className="us-empty-state">
              <p>No units yet. Click "Create Unit" to add your first one.</p>
            </div>
          ) : (
            <>
              <div className="us-list">
                {units.map(unit => (
                  <div
                    key={unit.id}
                    className={`us-unit-row ${selectedUnitId === unit.id ? 'selected' : ''} ${!unit.isActive ? 'inactive' : ''}`}
                    onClick={() => handleSelectUnit(unit)}
                  >
                    <div>
                      <div className="us-unit-code">{unit.unitCode}</div>
                      <div className="us-unit-meta">{unit.unitName} - {unit.semester}, {unit.year}</div>
                    </div>
                    {!unit.isActive && <span className="us-inactive-badge">INACTIVE</span>}
                  </div>
                ))}
              </div>

              <div className="us-actions-row">
                <button className="us-action-btn edit" onClick={handleEdit} disabled={!selectedUnit}>
                  Edit
                </button>
                <button className="us-action-btn delete" onClick={handleDeleteClick} disabled={!selectedUnit}>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {showDeleteModal && (
        <div className="us-modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="us-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Delete {selectedUnit?.unitCode}?</h3>
            <p>This will permanently remove the unit and cannot be undone.</p>
            <div className="us-modal-buttons">
              <button className="cancel" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="confirm" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitSetup;