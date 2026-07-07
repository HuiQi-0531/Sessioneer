import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { unitsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import '../styles/UCRequests.css';
import '../styles/UnitSetup.css';

const UnitSetup = () => {
  const navigate = useNavigate();
  const { allUnits, activeUnit, activeUnitId, setActiveUnitId, refreshUnits, isLoading } = useActiveUnit();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSelectUnit = (unit) => {
    setActiveUnitId(unit.id === activeUnitId ? null : unit.id);
  };

  const handleEdit = () => {
    if (!activeUnit) return;
    navigate(`/unit-setup/edit/${activeUnit.id}`);
  };

  const handleViewSessions = () => {
    if (!activeUnit) return;
    navigate(`/sessions/${activeUnit.id}`);
  };

  const handleDeleteClick = () => {
    if (!activeUnit) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!activeUnit) return;
    try {
      await unitsAPI.delete(activeUnit.id);
      setShowDeleteModal(false);
      await refreshUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert('Failed to delete unit. Please try again.');
    }
  };

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="unit-setup" />

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
          ) : allUnits.length === 0 ? (
            <div className="us-empty-state">
              <p>No units yet. Click "Create Unit" to add your first one.</p>
            </div>
          ) : (
            <>
              <div className="us-list">
                {allUnits.map(unit => (
                  <div
                    key={unit.id}
                    className={`us-unit-row ${activeUnitId === unit.id ? 'selected' : ''} ${!unit.isActive ? 'inactive' : ''}`}
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
                <button className="us-action-btn edit" onClick={handleViewSessions} disabled={!activeUnit}>
                  Sessions
                </button>
                <button className="us-action-btn edit" onClick={handleEdit} disabled={!activeUnit}>
                  Edit
                </button>
                <button className="us-action-btn delete" onClick={handleDeleteClick} disabled={!activeUnit}>
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
            <h3>Delete {activeUnit?.unitCode}?</h3>
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