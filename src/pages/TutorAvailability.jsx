import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/TutorAvailability.css';

const TutorAvailability = () => {
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

  // Load saved data on component mount
  useEffect(() => {
    const savedData = localStorage.getItem('availabilityData');
    if (savedData) {
      setAvailabilityData(JSON.parse(savedData));
      setIsEditable(false);
    }
  }, []);

  // Handle slot click - cycle through states
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

  // Calculate status counts
  const getStatusCounts = () => {
    const counts = { preferred: 0, available: 0, avoid: 0 };
    Object.values(availabilityData).forEach(state => {
      if (counts.hasOwnProperty(state)) {
        counts[state]++;
      }
    });
    return counts;
  };

  // Submit availability
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // POST to backend
      const response = await fetch('http://localhost:5001/availability/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutorEmail: 'elaine.lee@student.edu',
          unitCode: 'FIT3077',
          slots: availabilityData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit');
      }

      // Also save to localStorage as backup
      localStorage.setItem('availabilityData', JSON.stringify(availabilityData));

      setIsEditable(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);

    } catch (error) {
      console.error('Submit error:', error);
      // Fall back to localStorage only so UI still works
      localStorage.setItem('availabilityData', JSON.stringify(availabilityData));
      setIsEditable(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enable editing
  const handleEdit = () => {
    setIsEditable(true);
  };

  // Get slot state
  const getSlotState = (day, time) => {
    const slotKey = `${day}-${time}`;
    return availabilityData[slotKey] || 'unselected';
  };

  const counts = getStatusCounts();

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo">
            <span className="logo-icon">S</span>
          </div>
          <h2 className="brand-name">Sessioneer</h2>
        </div>

        <nav className="navigation">
          <Link to="/" className="nav-item">Dashboard</Link>
          <Link to="/session" className="nav-item">Sessions</Link>
          <Link to="/availability" className="nav-item active">Availability</Link>
          <a href="#schedule-builder" className="nav-item">Schedule</a>
          <Link to="/requests" className="nav-item">Requests</Link>
          <a href="#messages" className="nav-item">Messages</a>
        </nav>

        <div className="user-profile">
          <div className="user-avatar">L</div>
          <div className="user-info">
            <p className="user-name">Elaine Lee</p>
            <p className="user-role">Tutor</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <h1>My availability</h1>
          <button className="notification-icon">
            <span className="notification-badge"></span>
          </button>
        </header>

        <div className="content-area">
          <div className="availability-card">
            <div className="unit-info">My Unit: IFB398 / QUT YOU – OO6</div>

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
                <span className="warning-icon">⚠</span>
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

      {/* Success Message */}
      {showSuccess && (
        <div className="success-message">
          ✓ Availability saved successfully!
        </div>
      )}
    </div>
  );
};

export default TutorAvailability;