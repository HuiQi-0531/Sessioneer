import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { unitsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/UnitSetup.css';

const SEMESTER_OPTIONS = ['Semester 1', 'Semester 2'];

const UnitSetup = () => {
  const navigate = useNavigate();
  const { allUnits, activeUnit, activeUnitId, setActiveUnitId, refreshUnits, isLoading } = useActiveUnit();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateForm, setDuplicateForm] = useState({ unitCode: '', unitName: '', semester: '', year: '' });
  const [duplicateError, setDuplicateError] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  const coordinatorUnits = allUnits.filter(unit => unit.roles?.includes('coordinator'));
  const activeUnits = coordinatorUnits.filter(unit => unit.isActive);
  const inactiveUnits = coordinatorUnits.filter(unit => !unit.isActive);
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

  const handleDuplicateClick = () => {
    if (!selectedUnit) return;
    setDuplicateForm({
      unitCode: selectedUnit.unitCode,
      unitName: selectedUnit.unitName,
      semester: '',
      year: ''
    });
    setDuplicateError('');
    setShowDuplicateModal(true);
  };

  const confirmDuplicate = async () => {
    if (!selectedUnit) return;

    if (!duplicateForm.unitCode.trim()) {
      setDuplicateError('Unit code is required');
      return;
    }
    if (!duplicateForm.semester) {
      setDuplicateError('Semester is required');
      return;
    }
    if (!duplicateForm.year) {
      setDuplicateError('Year is required');
      return;
    }

    setIsDuplicating(true);
    setDuplicateError('');
    try {
      const created = await unitsAPI.duplicate(selectedUnit.id, {
        unitCode: duplicateForm.unitCode.trim(),
        unitName: duplicateForm.unitName.trim(),
        semester: duplicateForm.semester,
        year: Number(duplicateForm.year)
      });
      setShowDuplicateModal(false);
      await refreshUnits({ preferUnitId: created.id });
    } catch (error) {
      console.error('Error duplicating unit:', error);
      setDuplicateError(error?.response?.data?.error || 'Failed to duplicate unit. Please try again.');
    } finally {
      setIsDuplicating(false);
    }
  };

  const renderUnitRow = (unit) => (
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
  );

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
              <section className="us-group">
                <h3 className="us-group-title">Active Units</h3>
                {activeUnits.length === 0 ? (
                  <div className="us-empty-state us-group-empty">
                    <p>No active units this semester.</p>
                  </div>
                ) : (
                  <div className="us-list">
                    {activeUnits.map(renderUnitRow)}
                  </div>
                )}
              </section>

              <section className="us-group">
                <h3 className="us-group-title">Inactive Units</h3>
                {inactiveUnits.length === 0 ? (
                  <div className="us-empty-state us-group-empty">
                    <p>No inactive units.</p>
                  </div>
                ) : (
                  <div className="us-list">
                    {inactiveUnits.map(renderUnitRow)}
                  </div>
                )}
              </section>

              <div className="us-actions-row">
                <button className="us-action-btn edit" onClick={handleViewSessions} disabled={!selectedUnit}>
                  Sessions
                </button>
                <button className="us-action-btn edit" onClick={handleEdit} disabled={!selectedUnit}>
                  Edit
                </button>
                <button className="us-action-btn edit" onClick={handleDuplicateClick} disabled={!selectedUnit}>
                  Duplicate
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

      {showDuplicateModal && (
        <div className="us-modal-overlay" onClick={() => !isDuplicating && setShowDuplicateModal(false)}>
          <div className="us-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Duplicate {selectedUnit?.unitCode}</h3>
            <p>Sessions and tutors will be copied to the new unit. Everything else starts fresh.</p>

            <div className="us-form-field">
              <label htmlFor="dup-unit-code">Unit code</label>
              <input
                id="dup-unit-code"
                type="text"
                value={duplicateForm.unitCode}
                onChange={e => setDuplicateForm({ ...duplicateForm, unitCode: e.target.value })}
              />
            </div>

            <div className="us-form-field">
              <label htmlFor="dup-unit-name">Unit name</label>
              <input
                id="dup-unit-name"
                type="text"
                value={duplicateForm.unitName}
                onChange={e => setDuplicateForm({ ...duplicateForm, unitName: e.target.value })}
              />
            </div>

            <div className="us-form-row">
              <div className="us-form-field">
                <label htmlFor="dup-semester">Semester</label>
                <select
                  id="dup-semester"
                  value={duplicateForm.semester}
                  onChange={e => setDuplicateForm({ ...duplicateForm, semester: e.target.value })}
                >
                  <option value="">Select</option>
                  {SEMESTER_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="us-form-field">
                <label htmlFor="dup-year">Year</label>
                <input
                  id="dup-year"
                  type="number"
                  value={duplicateForm.year}
                  onChange={e => setDuplicateForm({ ...duplicateForm, year: e.target.value })}
                />
              </div>
            </div>

            {duplicateError && <p className="us-form-error">{duplicateError}</p>}

            <div className="us-modal-buttons">
              <button className="cancel" onClick={() => setShowDuplicateModal(false)} disabled={isDuplicating}>
                Cancel
              </button>
              <button className="confirm" onClick={confirmDuplicate} disabled={isDuplicating}>
                {isDuplicating ? 'Duplicating...' : 'Duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnitSetup;