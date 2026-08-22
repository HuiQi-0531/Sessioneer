import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { unitsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/UnitSetup.css';

const UnitSetup = () => {
  const navigate = useNavigate();
  const { allUnits, activeUnit, activeUnitId, setActiveUnitId, refreshUnits, isLoading } = useActiveUnit();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const coordinatorUnits = allUnits.filter(unit => unit.roles?.includes('coordinator'));
  const selectedUnit = activeUnit?.roles?.includes('coordinator')
    ? activeUnit
    : coordinatorUnits.find(unit => unit.id === activeUnitId) || null;

  const handleSelectUnit = (unit) => {
    setActiveUnitId(unit.id === activeUnitId ? null : unit.id);
  };

  const handleEdit = () => {
    if (!selectedUnit) return;
    navigate(`/unit-setup/edit/${selectedUnit.id}`);
  };

  const handleViewSessions = () => {
    if (!selectedUnit) return;
    navigate('/sessions');
  };

  const handleDeleteClick = () => {
    if (!selectedUnit) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedUnit) return;
    try {
      await unitsAPI.delete(selectedUnit.id);
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
        <UCPageHeader title="Unit" />

        <div className="us-content">
          <div className="us-top-row">
            <button className="us-create-btn" onClick={() => navigate('/unit-setup/create')}>
              Create Unit
            </button>
          </div>

          {isLoading ? (
            <div className="us-empty-state"><p>Loading units...</p></div>
          ) : coordinatorUnits.length === 0 ? (
            <div className="us-empty-state">
              <p>No units yet. Click "Create Unit" to add your first one.</p>
            </div>
          ) : (
            <>
              <div className="us-list">
                {coordinatorUnits.map(unit => (
                  <div
                    key={unit.id}
                    className={`us-unit-row ${selectedUnit?.id === unit.id ? 'selected' : ''} ${!unit.isActive ? 'inactive' : ''}`}
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
                <button className="us-action-btn edit" onClick={handleViewSessions} disabled={!selectedUnit}>
                  Sessions
                </button>
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
