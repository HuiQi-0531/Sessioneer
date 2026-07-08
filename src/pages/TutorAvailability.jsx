import React, { useState, useEffect } from 'react';
import { availabilityAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorAvailability.css';

const TutorAvailability = () => {
  const { activeUnit, isLoading: unitLoading } = useActiveUnit();

  const [isEditable, setIsEditable] = useState(true);
  const [availabilityData, setAvailabilityData] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = [
    '8:00am', '9:00am', '10:00am', '11:00am', '12:00pm',
    '1:00pm', '2:00pm', '3:00pm', '4:00pm', '5:00pm',
    '6:00pm', '7:00pm', '8:00pm', '9:00pm'
  ];

  // The saved-availability cache is scoped per unit, so switching units
  // via the sidebar doesn't show another unit's selections.
  const storageKey = activeUnit ? `availabilityData_${activeUnit.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      setAvailabilityData(JSON.parse(savedData));
      setIsEditable(false);
    } else {
      setAvailabilityData({});
      setIsEditable(true);
    }
  }, [storageKey]);

  const handleSlotClick = (day, time) => {
    if (!isEditable) return;

    const slotKey = `${day}-${time}`;
    const currentState = availabilityData[slotKey] || 'unselected';

    let nextState;
    switch (currentState) {
      case 'unselected':
        nextState = 'preferred';
        break;
      case 'preferred':
        nextState = 'available';
        break;
      case 'available':
        nextState = 'avoid';
        break;
      case 'avoid':
        nextState = 'unselected';
        break;
      default:
        nextState = 'unselected';
    }

    setAvailabilityData(prev => {
      const newData = { ...prev };
      if (nextState === 'unselected') {
        delete newData[slotKey];
      } else {
        newData[slotKey] = nextState;
      }
      return newData;
    });
  };

  const getStatusCounts = () => {
    const counts = { preferred: 0, available: 0, avoid: 0 };
    Object.values(availabilityData).forEach(state => {
      if (counts.hasOwnProperty(state)) {
        counts[state]++;
      }
    });
    return counts;
  };

  const handleSubmit = async () => {
    if (!activeUnit) return;
    setIsSubmitting(true);
    try {
      await availabilityAPI.submit(activeUnit.unitCode, availabilityData);
      localStorage.setItem(storageKey, JSON.stringify(availabilityData));

      setIsEditable(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to submit availability. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    setIsEditable(true);
  };

  const getSlotState = (day, time) => {
    const slotKey = `${day}-${time}`;
    return availabilityData[slotKey] || 'unselected';
  };

  const counts = getStatusCounts();

  if (unitLoading) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="availability" />
        <main className="main-content">
          <div className="content-area">Loading...</div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="availability" />
        <main className="main-content">
          <UCPageHeader title="My availability" />
          <div className="content-area">
            <p>No unit selected. Once you're linked to a unit, it'll show up here.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <TutorSidebar activePage="availability" />

      <main className="main-content">
        <UCPageHeader title="My availability" />

        <div className="content-area">
          <div className="availability-card">
            <div className="unit-info">My Unit: {activeUnit.unitCode}</div>

            <div className="legend">
              <div className="legend-item">
                <div className="legend-box preferred"></div>
                <span>Preferred</span>
              </div>
              <div className="legend-item">
                <div className="legend-box available"></div>
                <span>Available</span>
              </div>
              <div className="legend-item">
                <div className="legend-box avoid"></div>
                <span>Avoid</span>
              </div>
            </div>

            {isEditable ? (
              <div className="warning-message">
                <span className="warning-icon">!</span>
                <span>Please select your preferred time before the due date!</span>
              </div>
            ) : (
              <div className="status-badges">
                <div className="status-badge unlocked">UNLOCKED</div>
                <div className="status-badge preferred">PREFERRED: {counts.preferred}</div>
                <div className="status-badge available">AVAILABLE: {counts.available}</div>
                <div className="status-badge avoid">AVOID: {counts.avoid}</div>
              </div>
            )}

            <div className="availability-grid">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th></th>
                    {days.map(day => (
                      <th key={day}>{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map(time => (
                    <tr key={time}>
                      <td className="time-label">{time}</td>
                      {days.map(day => {
                        const state = getSlotState(day, time);
                        return (
                          <td key={`${day}-${time}`}>
                            <button
                              className={`time-slot ${state}`}
                              onClick={() => handleSlotClick(day, time)}
                              disabled={!isEditable}
                            >
                              {state.toUpperCase()}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="action-buttons">
              {!isEditable && (
                <button className="btn btn-edit" onClick={handleEdit}>
                  Edit
                </button>
              )}
              {isEditable && (
                <button className="btn btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {showSuccess && (
        <div className="success-message">
          Availability saved successfully!
        </div>
      )}
    </div>
  );
};

export default TutorAvailability;