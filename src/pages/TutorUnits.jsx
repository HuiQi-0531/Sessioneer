import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { unitHasTutorAccess } from '../utils/roles';
import '../styles/UCRequests.css';
import '../styles/UnitSetup.css';

const TutorUnits = () => {
  const navigate = useNavigate();
  const { allUnits, activeUnitId, setActiveUnitId, isLoading } = useActiveUnit();

  const tutorUnits = allUnits.filter(unit => unitHasTutorAccess(unit));
  const activeUnits = tutorUnits.filter(unit => unit.isActive);
  const inactiveUnits = tutorUnits.filter(unit => !unit.isActive);

  const handleSelectUnit = (unit) => {
    setActiveUnitId(unit.id);
    navigate('/tutor-dashboard');
  };

  const renderUnitRow = (unit) => (
    <div
      key={unit.id}
      className={`us-unit-row ${activeUnitId === unit.id ? 'selected' : ''} ${!unit.isActive ? 'inactive' : ''}`}
      onClick={() => handleSelectUnit(unit)}
    >
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div className="us-unit-code">{unit.unitCode}</div>
        <div className="us-unit-meta">{unit.unitName} - {unit.semester}, {unit.year}</div>
      </div>
      {!unit.isActive && <span className="us-inactive-badge">INACTIVE</span>}
    </div>
  );

  return (
    <div className="uc-dashboard-container">
      <TutorSidebar activePage="dashboard" />

      <main className="uc-main-content">
        <UCPageHeader title="My Units" />

        <div className="us-content">
          {isLoading ? (
            <div className="us-empty-state"><p>Loading units...</p></div>
          ) : tutorUnits.length === 0 ? (
            <div className="us-empty-state">
              <p>You're not linked to any units yet.</p>
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
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default TutorUnits;