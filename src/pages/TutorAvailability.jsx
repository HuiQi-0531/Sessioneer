import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { availabilityAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import { unitHasTutorAccess } from '../utils/roles';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorAvailability.css';

const DAY_CODE_TO_NAME = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday'
};

const TutorAvailability = () => {
  const { allUnits, isLoading: unitLoading } = useActiveUnit();

  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);

  const [isEditable, setIsEditable] = useState(true);
  const [availabilityData, setAvailabilityData] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoadingLatest, setIsLoadingLatest] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const infoIconRef = useRef(null);
  const tooltipRef = useRef(null);

  // "Paint mode": the tutor picks a status first, then just taps cells to
  // apply it — no more cycling through 4 clicks per cell.
  const [paintColor, setPaintColor] = useState('preferred');

  // Bulk fill menu, opened from a day header (fills a whole column) or a
  // time label (fills a whole row). { type: 'day' | 'time', value, top, left }
  const [bulkMenu, setBulkMenu] = useState(null);
  const bulkMenuRef = useRef(null);
  const bulkTriggerRef = useRef(null);

  const toggleTooltip = () => {
    if (!showInfoTooltip && infoIconRef.current) {
      const rect = infoIconRef.current.getBoundingClientRect();
      setTooltipPos({ top: rect.bottom + 6, left: rect.right - 220 });
    }
    setShowInfoTooltip(prev => !prev);
  };

  useEffect(() => {
    if (!showInfoTooltip) return;

    const handleClickOutside = (event) => {
      if (
        infoIconRef.current &&
        !infoIconRef.current.contains(event.target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target)
      ) {
        setShowInfoTooltip(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showInfoTooltip]);

  useEffect(() => {
    if (!bulkMenu) return;

    const handleClickOutside = (event) => {
      if (
        bulkMenuRef.current &&
        !bulkMenuRef.current.contains(event.target) &&
        bulkTriggerRef.current &&
        !bulkTriggerRef.current.contains(event.target)
      ) {
        setBulkMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bulkMenu]);


  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = [
    '8:00am', '9:00am', '10:00am', '11:00am', '12:00pm',
    '1:00pm', '2:00pm', '3:00pm', '4:00pm', '5:00pm',
    '6:00pm', '7:00pm', '8:00pm', '9:00pm'
  ];

  const tutorUnits = useMemo(
    () => allUnits.filter(unit => unitHasTutorAccess(unit)),
    [allUnits]
  );

  // The window is closed if a coordinator locked it manually, or the
  // deadline (if any) has passed.
  const isUnitWindowClosed = useCallback((unit) => (
    unit.availabilityLocked ||
    (unit.availabilityDeadline && new Date() > new Date(unit.availabilityDeadline))
  ), []);

  const openTutorUnits = useMemo(
    () => tutorUnits.filter(unit => !isUnitWindowClosed(unit)),
    [tutorUnits, isUnitWindowClosed]
  );

  const isWindowClosed = tutorUnits.length > 0 && openTutorUnits.length === 0;

  const hydrateTutorAvailability = useCallback((data) => {
    const tutorId = currentUser?.id;
    if (!tutorId || !data?.availability) return {};

    const next = {};
    Object.entries(data.availability).forEach(([dayCode, tutorSlots]) => {
      const dayName = DAY_CODE_TO_NAME[dayCode];
      const slots = tutorSlots?.[tutorId];
      if (!dayName || !slots) return;

      Object.entries(slots).forEach(([time, preference]) => {
        next[`${dayName}-${time}`] = preference;
      });
    });

    return next;
  }, [currentUser?.id]);

  // Availability is tutor-wide. The same submitted grid is saved into every
  // tutor unit so each UC still sees the tutor's availability in their unit.
  const storageKey = currentUser?.id
    ? `availabilityData_${currentUser.id}_shared`
    : null;

  useEffect(() => {
    if (!storageKey || tutorUnits.length === 0) return;

    const loadSavedAvailability = async () => {
      setSubmitError('');
      setLoadError('');
      const savedData = localStorage.getItem(storageKey);

      if (savedData) {
        setAvailabilityData(JSON.parse(savedData));
        setIsEditable(false);
      } else {
        setAvailabilityData({});
        setIsEditable(!isWindowClosed);
      }

      setIsLoadingLatest(true);
      try {
        for (const unit of tutorUnits) {
          const data = await availabilityAPI.get(unit.unitCode);
          const backendAvailability = hydrateTutorAvailability(data);
          const hasSubmittedAvailability = Object.keys(backendAvailability).length > 0;

          if (hasSubmittedAvailability) {
            setAvailabilityData(backendAvailability);
            localStorage.setItem(storageKey, JSON.stringify(backendAvailability));
            setIsEditable(false);
            return;
          }
        }
      } catch (error) {
        console.error('Could not load saved availability:', error);
        setLoadError('Could not load the latest availability from the database. Showing any saved local data.');
      } finally {
        setIsLoadingLatest(false);
      }
    };

    loadSavedAvailability();
  }, [tutorUnits, storageKey, isWindowClosed, hydrateTutorAvailability]);

  // Single tap applies whichever status is currently selected as the
  // "paint color". Tapping a cell that already has that exact status
  // clears it again, so undoing a mistake is still just one tap.
  const handleSlotClick = (day, time) => {
    if (!isEditable || isWindowClosed) return;

    const slotKey = `${day}-${time}`;
    const currentState = availabilityData[slotKey] || 'unselected';
    const nextState = currentState === paintColor ? 'unselected' : paintColor;

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

  const openBulkMenu = (type, value, event) => {
    if (!isEditable || isWindowClosed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    bulkTriggerRef.current = event.currentTarget;
    setBulkMenu({
      type,
      value,
      top: rect.bottom + 6,
      left: rect.left
    });
  };

  // Fills an entire day column ('day') or an entire time row ('time')
  // with one status in a single action.
  const applyBulkFill = (status) => {
    if (!bulkMenu) return;
    const { type, value } = bulkMenu;

    setAvailabilityData(prev => {
      const newData = { ...prev };
      const keys = type === 'day'
        ? timeSlots.map(time => `${value}-${time}`)
        : days.map(day => `${day}-${value}`);

      keys.forEach(key => {
        if (status === 'unselected') {
          delete newData[key];
        } else {
          newData[key] = status;
        }
      });

      return newData;
    });

    setBulkMenu(null);
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
    if (openTutorUnits.length === 0 || isWindowClosed) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await Promise.all(
        openTutorUnits.map(unit => availabilityAPI.submit(unit.unitCode, availabilityData))
      );
      localStorage.setItem(storageKey, JSON.stringify(availabilityData));

      setIsEditable(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Submit error:', error);
      setSubmitError(error.message || 'Failed to submit availability. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    if (isWindowClosed) return;
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
          <UCPageHeader title="My availability" />
          <div className="content-area">Loading...</div>
        </main>
      </div>
    );
  }

  if (tutorUnits.length === 0) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="availability" />
        <main className="main-content">
          <UCPageHeader title="My availability" />
          <div className="content-area">
            <p>Once you're linked to a tutor unit, your availability will show up here.</p>
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
            <div className="unit-info-row">
              <div className="unit-info">
                My Availability
                <span className="unit-info-subtitle">
                  Applies to all tutor units
                </span>
              </div>
              {!isWindowClosed && !isEditable && (
                <button className="btn btn-edit btn-edit-top" onClick={handleEdit}>
                  Edit
                </button>
              )}
            </div>

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

    <div style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        ref={infoIconRef}
        className="info-icon-btn"
        onClick={toggleTooltip}
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1px solid #999',
          background: '#fff',
          color: '#555',
          fontSize: 13,
          fontStyle: 'italic',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="How to use the availability grid"
      >
        i
      </button>

      {showInfoTooltip && (
        <div
          ref={tooltipRef}
          className="info-tooltip"
          style={{
              position: 'fixed',
              top: tooltipPos.top,
              left: tooltipPos.left,
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              padding: '10px 14px',
              fontSize: 13,
              color: '#333',
              width: 220,
              zIndex: 9999,
              textAlign: 'left',
            }}
        >
          <p style={{ margin: '2px 0' }}>1. Pick a status button above the grid.</p>
          <p style={{ margin: '2px 0' }}>2. Tap any time slot to apply it.</p>
          <p style={{ margin: '2px 0' }}>Tap it again to clear that slot.</p>
          <p style={{ margin: '2px 0' }}>Or click a day / time header to fill a whole column or row at once.</p>
        </div>
      )}
    </div>
  </div>

            {isWindowClosed ? (
              <div className="warning-message" style={{ backgroundColor: '#fee2e2', borderLeftColor: '#ef4444' }}>
                <span className="warning-icon" style={{ color: '#ef4444' }}>!</span>
                <span>
                  Submissions are closed for this unit
                  . Contact your unit coordinator if you need to make changes.
                </span>
              </div>
            ) : isEditable ? (
              <div className="warning-message">
                <span className="warning-icon">!</span>
                <span>
                  Please select your preferred time before the due date!
                  {openTutorUnits.length < tutorUnits.length &&
                    ` ${tutorUnits.length - openTutorUnits.length} unit${tutorUnits.length - openTutorUnits.length > 1 ? 's are' : ' is'} already closed and will keep the previous submission.`}
                </span>
              </div>
            ) : (
              <div className="status-badges">
                <div className="status-badge unlocked">SUBMITTED</div>
                <div className="status-badge preferred">PREFERRED: {counts.preferred}</div>
                <div className="status-badge available">AVAILABLE: {counts.available}</div>
                <div className="status-badge avoid">AVOID: {counts.avoid}</div>
              </div>
            )}

            {submitError && (
              <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{submitError}</p>
            )}

            {loadError && (
              <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{loadError}</p>
            )}

            {isLoadingLatest && (
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>Loading latest availability...</p>
            )}

            {!isWindowClosed && isEditable && (
              <div className="paint-toolbar">
                <span className="paint-toolbar-label">1. Pick a status, then tap the times below:</span>
                <div className="paint-toolbar-buttons">
                  <button
                    type="button"
                    className={`paint-btn preferred ${paintColor === 'preferred' ? 'active' : ''}`}
                    onClick={() => setPaintColor('preferred')}
                  >
                    Preferred
                  </button>
                  <button
                    type="button"
                    className={`paint-btn available ${paintColor === 'available' ? 'active' : ''}`}
                    onClick={() => setPaintColor('available')}
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    className={`paint-btn avoid ${paintColor === 'avoid' ? 'active' : ''}`}
                    onClick={() => setPaintColor('avoid')}
                  >
                    Avoid
                  </button>
                  <button
                    type="button"
                    className={`paint-btn clear ${paintColor === 'unselected' ? 'active' : ''}`}
                    onClick={() => setPaintColor('unselected')}
                  >
                    Eraser
                  </button>
                </div>
              </div>
            )}

            <div className="availability-grid">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th></th>
                    {days.map(day => (
                      <th key={day}>
                        <span>{day}</span>
                        {!isWindowClosed && isEditable && (
                          <button
                            type="button"
                            className="bulk-fill-trigger"
                            onClick={(e) => openBulkMenu('day', day, e)}
                            aria-label={`Fill all of ${day}`}
                            title={`Fill all of ${day}`}
                          >
                            ▾
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map(time => (
                    <tr key={time}>
                      <td className="time-label">
                        <span>{time}</span>
                        {!isWindowClosed && isEditable && (
                          <button
                            type="button"
                            className="bulk-fill-trigger"
                            onClick={(e) => openBulkMenu('time', time, e)}
                            aria-label={`Fill all of ${time}`}
                            title={`Fill all of ${time}`}
                          >
                            ▾
                          </button>
                        )}
                      </td>
                      {days.map(day => {
                        const state = getSlotState(day, time);
                        return (
                          <td key={`${day}-${time}`}>
                            <button
                              className={`time-slot ${state}`}
                              onClick={() => handleSlotClick(day, time)}
                              disabled={!isEditable || isWindowClosed}
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
              {!isWindowClosed && isEditable && (
                <button className="btn btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {bulkMenu && (
        <div
          ref={bulkMenuRef}
          className="bulk-fill-menu"
          style={{ top: bulkMenu.top, left: bulkMenu.left }}
        >
          <div className="bulk-fill-menu-title">
            Set all of {bulkMenu.type === 'day' ? bulkMenu.value : bulkMenu.value} to:
          </div>
          <button type="button" className="bulk-fill-option preferred" onClick={() => applyBulkFill('preferred')}>
            Preferred
          </button>
          <button type="button" className="bulk-fill-option available" onClick={() => applyBulkFill('available')}>
            Available
          </button>
          <button type="button" className="bulk-fill-option avoid" onClick={() => applyBulkFill('avoid')}>
            Avoid
          </button>
          <button type="button" className="bulk-fill-option clear" onClick={() => applyBulkFill('unselected')}>
            Clear
          </button>
        </div>
      )}

      {showSuccess && (
        <div className="success-message">
          Availability saved successfully!
        </div>
      )}
    </div>
  );
};

export default TutorAvailability;