import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI, scheduleAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/ScheduleBuilder.css';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_LABELS = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' };
const GRID_START_HOUR = 8;  // 8am
const GRID_END_HOUR = 21;   // 9pm (exclusive)
const HOUR_LABELS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => {
  const hour = GRID_START_HOUR + i;
  if (hour === 12) return '12pm';
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
});

const ScheduleBuilder = () => {
  const { unitId: unitIdFromUrl } = useParams();
  const navigate = useNavigate();
  const { activeUnit, activeUnitId, setActiveUnitId, isLoading: unitLoading } = useActiveUnit();

  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'grid'

  const [modalSession, setModalSession] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (unitIdFromUrl && unitIdFromUrl !== activeUnitId) {
      setActiveUnitId(unitIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeUnit) {
      setIsLoadingSessions(false);
      return;
    }
    if (unitIdFromUrl !== activeUnit.id) {
      navigate(`/schedule-builder/${activeUnit.id}`, { replace: true });
    }
    loadSessions(activeUnit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  const loadSessions = async (unitId) => {
    setIsLoadingSessions(true);
    try {
      const data = await sessionsAPI.getAll(unitId);
      setSessions(data);
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const openAssignModal = async (session) => {
    setModalSession(session);
    setModalError('');
    setIsLoadingCandidates(true);
    try {
      const data = await scheduleAPI.getCandidates(activeUnit.id, session.id);
      setCandidates(data.candidates);
    } catch (err) {
      console.error('Error loading candidates:', err);
      setModalError('Could not load tutor list. Please try again.');
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const closeModal = () => {
    setModalSession(null);
    setCandidates([]);
    setModalError('');
  };

  const handleAssign = async (tutorId) => {
    if (!modalSession) return;
    setIsAssigning(true);
    setModalError('');
    try {
      await scheduleAPI.assignTutor(activeUnit.id, modalSession.id, tutorId);
      closeModal();
      await loadSessions(activeUnit.id);
    } catch (err) {
      setModalError(err.message || 'Failed to assign tutor. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async () => {
    if (!modalSession) return;
    setIsAssigning(true);
    setModalError('');
    try {
      await scheduleAPI.assignTutor(activeUnit.id, modalSession.id, null);
      closeModal();
      await loadSessions(activeUnit.id);
    } catch (err) {
      setModalError(err.message || 'Failed to unassign. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  const formatTimeRange = (start, end) => `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  const formatSession = (s) => `${s.day}, ${formatTimeRange(s.startTime, s.endTime)}${s.location ? ` at ${s.location}` : ''}`;

  const unassignedSessions = sessions.filter(s => !s.isAssigned);
  const assignedSessions = sessions.filter(s => s.isAssigned);

  // Sessions outside Mon-Fri or outside the 8am-9pm grid range can't be
  // placed on the grid; the grid view notes how many are hidden.
  const hourFromTime = (timeStr) => parseInt(timeStr.split(':')[0], 10);
  const gridSessions = sessions.filter(s =>
    DAYS.includes(s.day) &&
    hourFromTime(s.startTime) >= GRID_START_HOUR &&
    hourFromTime(s.endTime) <= GRID_END_HOUR
  );
  const hiddenFromGridCount = sessions.length - gridSessions.length;

  const renderGrid = () => (
    <div className="sb-grid-wrapper">
      <div className="sb-grid" style={{ gridTemplateRows: `auto repeat(${HOUR_LABELS.length}, 44px)` }}>
        <div className="sb-grid-corner" />
        {DAYS.map(day => (
          <div key={day} className="sb-grid-day-header">{DAY_LABELS[day]}</div>
        ))}

        {HOUR_LABELS.map((label, i) => (
          <React.Fragment key={label}>
            <div className="sb-grid-time-label" style={{ gridRow: i + 2 }}>{label}</div>
          </React.Fragment>
        ))}

        {gridSessions.map(session => {
          const dayIndex = DAYS.indexOf(session.day);
          const startHour = hourFromTime(session.startTime);
          const endHour = hourFromTime(session.endTime);
          const rowStart = (startHour - GRID_START_HOUR) + 2;
          const rowEnd = (endHour - GRID_START_HOUR) + 2;

          return (
            <button
              key={session.id}
              className={`sb-grid-block ${session.isAssigned ? 'assigned' : 'unassigned'}`}
              style={{
                gridColumn: dayIndex + 2,
                gridRow: `${rowStart} / ${rowEnd}`
              }}
              onClick={() => openAssignModal(session)}
            >
              <div className="sb-grid-block-time">{formatTimeRange(session.startTime, session.endTime)}</div>
              <div className="sb-grid-block-type">{session.sessionType || 'Session'}</div>
              <div className="sb-grid-block-tutor">
                {session.isAssigned ? session.assignedTutorName : 'Unassigned'}
              </div>
            </button>
          );
        })}
      </div>
      {hiddenFromGridCount > 0 && (
        <p className="sb-grid-note">
          {hiddenFromGridCount} session{hiddenFromGridCount > 1 ? 's' : ''} not shown here (outside Mon-Fri 8am-9pm).
          Use List View to see everything.
        </p>
      )}
    </div>
  );

  if (unitLoading || (isLoadingSessions && sessions.length === 0)) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="schedule-builder" />
        <main className="uc-main-content">
          <div className="sb-content"><div className="sb-loading">Loading...</div></div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="schedule-builder" />
        <main className="uc-main-content">
          <UCPageHeader title="Schedule Builder" />
          <div className="sb-content">
            <div className="sb-empty-state">No unit selected. Choose one from the Active Unit menu, or create one first.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="schedule-builder" />

      <main className="uc-main-content">
        <UCPageHeader title="Schedule Builder" />

        <div className="sb-content">
          <div className="sb-stats-row">
            <div className="sb-stat-card unassigned">
              <div className="sb-stat-number">{unassignedSessions.length}</div>
              <div className="sb-stat-label">Unassigned Sessions</div>
            </div>
            <div className="sb-stat-card assigned">
              <div className="sb-stat-number">{assignedSessions.length}</div>
              <div className="sb-stat-label">Assigned Sessions</div>
            </div>
            <div className="sb-stat-card">
              <div className="sb-stat-number">{sessions.length}</div>
              <div className="sb-stat-label">Total Sessions</div>
            </div>
          </div>

          <div className="sb-view-toggle">
            <button
              className={`sb-toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => setView('list')}
            >
              List View
            </button>
            <button
              className={`sb-toggle-btn ${view === 'grid' ? 'active' : ''}`}
              onClick={() => setView('grid')}
            >
              Grid View
            </button>
          </div>

          {view === 'grid' ? (
            <div className="sb-section">
              <div className="sb-grid-legend">
                <span className="sb-legend-item"><span className="sb-legend-dot assigned"></span>Assigned</span>
                <span className="sb-legend-item"><span className="sb-legend-dot unassigned"></span>Unassigned</span>
              </div>
              {renderGrid()}
            </div>
          ) : (
            <>
              <div className="sb-section">
                <h2>Unassigned</h2>
                {unassignedSessions.length === 0 ? (
                  <div className="sb-empty-state">All sessions have a tutor assigned.</div>
                ) : (
                  <table className="sb-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedSessions.map(session => (
                        <tr key={session.id} className="sb-row-clickable" onClick={() => openAssignModal(session)}>
                          <td>{session.day}</td>
                          <td>{formatTimeRange(session.startTime, session.endTime)}</td>
                          <td>{session.location || '-'}</td>
                          <td>{session.sessionType || '-'}</td>
                          <td>
                            <button className="sb-assign-btn" onClick={(e) => { e.stopPropagation(); openAssignModal(session); }}>
                              Assign Tutor
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="sb-section">
                <h2>Assigned</h2>
                {assignedSessions.length === 0 ? (
                  <div className="sb-empty-state">No sessions have been assigned yet.</div>
                ) : (
                  <table className="sb-table">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th>Tutor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedSessions.map(session => (
                        <tr key={session.id}>
                          <td>{session.day}</td>
                          <td>{formatTimeRange(session.startTime, session.endTime)}</td>
                          <td>{session.location || '-'}</td>
                          <td>{session.sessionType || '-'}</td>
                          <td>
                            <span className="sb-assigned-pill">{session.assignedTutorName}</span>
                            <button className="sb-change-link" onClick={() => openAssignModal(session)}>
                              Change
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {modalSession && (
        <div className="sb-modal-overlay" onClick={closeModal}>
          <div className="sb-modal-content" onClick={e => e.stopPropagation()}>
            <button className="sb-modal-close" onClick={closeModal}>&times;</button>
            <div className="sb-modal-header">
              <h2>Assign a Tutor</h2>
            </div>
            <p className="sb-modal-session-info">{formatSession(modalSession)}{modalSession.sessionType ? ` - ${modalSession.sessionType}` : ''}</p>

            {modalError && <p className="sb-warning-text" style={{ marginBottom: 16 }}>{modalError}</p>}

            {isLoadingCandidates ? (
              <div className="sb-loading">Loading tutors...</div>
            ) : (
              <>
                {candidates.map((candidate, index) => {
                  const isTopPick = index === 0 && !candidate.hardBlocked;
                  return (
                    <div
                      key={candidate.id}
                      className={`sb-candidate-row ${candidate.hardBlocked ? 'blocked' : ''} ${isTopPick ? 'top-pick' : ''}`}
                    >
                      <div className="sb-candidate-info">
                        <div className="sb-candidate-name">
                          {candidate.name}
                          <span className={`sb-priority-badge ${candidate.priorityTag.toLowerCase()}`}>
                            {candidate.priorityTag}
                          </span>
                          {isTopPick && <span className="sb-priority-badge preferred">Top Pick</span>}
                        </div>
                        <div className="sb-candidate-warnings">
                          {candidate.allPreferred && (
                            <span className="sb-availability-text">Marked this whole time as preferred</span>
                          )}
                          {candidate.warnings.map((w, i) => (
                            <span key={i} className="sb-warning-text">{w}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="sb-candidate-btn"
                        disabled={candidate.hardBlocked || isAssigning}
                        onClick={() => handleAssign(candidate.id)}
                      >
                        {modalSession.assignedTutorId === candidate.id ? 'Assigned' : 'Assign'}
                      </button>
                    </div>
                  );
                })}
              </>
            )}

            {modalSession.isAssigned && (
              <button className="sb-unassign-btn" onClick={handleUnassign} disabled={isAssigning}>
                Remove current assignment
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleBuilder;