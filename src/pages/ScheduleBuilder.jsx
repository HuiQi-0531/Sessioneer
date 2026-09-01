import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { sessionsAPI, scheduleAPI, unitsAPI } from '../config/api';
import html2canvas from 'html2canvas';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/ScheduleBuilder.css';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_LABELS = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' };
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 21;
const STUDENTS_PER_TUTOR = 30;
const suggestedTutorCount = (capacity) => Math.floor((capacity || 0) / STUDENTS_PER_TUTOR) + 1;const HOUR_LABELS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => {
  const hour = GRID_START_HOUR + i;
  if (hour === 12) return '12pm';
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
});

const getSessionState = (session) => {
  const tutors = session.tutors || [];
  if (tutors.length === 0) return 'unassigned';
  const anyConfirmed = tutors.some(t => t.confirmed === true);
  return anyConfirmed ? 'confirmed' : 'pending';
};

const getTutorDisplayLines = (session) => {
  const tutors = session.tutors || [];
  if (tutors.length === 0) return ['Unassigned'];
  return tutors.map(t => t.confirmed === true ? t.tutorName : `${t.tutorName} (pending)`);
};

const ScheduleBuilder = () => {
  const { unitId: unitIdFromUrl } = useParams();
  const { activeUnit, activeUnitId, setActiveUnitId, isLoading: unitLoading, refreshUnits } = useActiveUnit();

  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'grid' | 'finalise'

  const [modalSession, setModalSession] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [modalError, setModalError] = useState('');

  const [lockError, setLockError] = useState(null);
  const [isLocking, setIsLocking] = useState(false);
  const [showForceLockModal, setShowForceLockModal] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const gridRef = React.useRef(null);

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

  const isLocked = activeUnit?.scheduleLocked;

  const openAssignModal = async (session) => {
    if (isLocked) return;
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

  const handleUnassign = async (tutorId) => {
    if (!modalSession) return;
    setIsAssigning(true);
    setModalError('');
    try {
      await scheduleAPI.unassignTutor(activeUnit.id, modalSession.id, tutorId);
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
  const confirmedSessions = sessions.filter(s => getSessionState(s) === 'confirmed');
  const pendingSessions = sessions.filter(s => getSessionState(s) === 'pending');

  const hourFromTime = (timeStr) => parseInt(timeStr.split(':')[0], 10);
  const gridSessions = sessions.filter(s =>
    DAYS.includes(s.day) &&
    hourFromTime(s.startTime) >= GRID_START_HOUR &&
    hourFromTime(s.endTime) <= GRID_END_HOUR
  );
  const hiddenFromGridCount = sessions.length - gridSessions.length;

  const renderThreeColorGrid = () => (
    <div className="sb-grid-wrapper" ref={gridRef}>
      <div className="sb-grid" style={{ gridTemplateRows: `auto repeat(${HOUR_LABELS.length}, 44px)` }}>
        <div className="sb-grid-corner" />
        {DAYS.map(day => (
          <div key={day} className="sb-grid-day-header">{DAY_LABELS[day]}</div>
        ))}

        {HOUR_LABELS.map((label, i) => (
          <div key={label} className="sb-grid-time-label" style={{ gridRow: i + 2 }}>{label}</div>
        ))}

        {DAYS.map(day => {
          const dayIndex = DAYS.indexOf(day);
          const dayGroups = [];
          const daySessions = gridSessions
            .filter(s => s.day === day)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          daySessions.forEach(session => {
            const startMin = hourFromTime(session.startTime) * 60 + parseInt(session.startTime.split(':')[1], 10);
            const endMin = hourFromTime(session.endTime) * 60 + parseInt(session.endTime.split(':')[1], 10);
            let placed = false;
            for (const group of dayGroups) {
              if (group.some(s => {
                const sStart = hourFromTime(s.startTime) * 60 + parseInt(s.startTime.split(':')[1], 10);
                const sEnd = hourFromTime(s.endTime) * 60 + parseInt(s.endTime.split(':')[1], 10);
                return startMin < sEnd && endMin > sStart;
              })) {
                group.push(session);
                placed = true;
                break;
              }
            }
            if (!placed) dayGroups.push([session]);
          });

          return dayGroups.flatMap(group =>
            group.map((session, colIdx) => {
              const startHour = hourFromTime(session.startTime);
              const endHour = hourFromTime(session.endTime);
              const rowStart = (startHour - GRID_START_HOUR) + 2;
              const rowEnd = (endHour - GRID_START_HOUR) + 2;
              const state = getSessionState(session);
              const colCount = group.length;
              const widthPct = 100 / colCount;

              return (
                <button
                  key={session.id}
                  className={`sb-grid-block ${state === 'confirmed' ? 'assigned' : state === 'pending' ? 'pending' : 'unassigned'}`}
                  style={{
                    gridColumn: dayIndex + 2,
                    gridRow: `${rowStart} / ${rowEnd}`,
                    justifySelf: 'start',
                    width: `${widthPct}%`,
                    marginLeft: `${widthPct * colIdx}%`
                  }}
                  onClick={() => openAssignModal(session)}
                  disabled={isLocked}
                >
                  <div className="sb-grid-block-time">{formatTimeRange(session.startTime, session.endTime)}</div>
                  <div className="sb-grid-block-type">
                    {session.sessionCode ? `${session.sessionCode}` : (session.sessionType || 'Session')}
                   {session.location ? ` · ${session.location}` : ''}
                  </div>
                  <div className="sb-grid-block-tutor">
                    {getTutorDisplayLines(session).map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </button>
              );
            })
          );
        })}
      </div>
      {hiddenFromGridCount > 0 && (
        <p className="sb-grid-note">
          {hiddenFromGridCount} session{hiddenFromGridCount > 1 ? 's' : ''} not shown here (outside Mon-Fri 8am-9pm).
        </p>
      )}
    </div>
  );

  const handleExportCsv = () => {
    const header = ['Day', 'Start Time', 'End Time', 'Location', 'Campus', 'Type', 'Capacity', 'Status', 'Assigned Tutor', 'Confirmation'];
    const rows = sessions.map(s => {
      const tutors = s.tutors || [];
      const tutorNames = tutors.map(t => t.tutorName).join('; ');
      const confirmation = tutors.length === 0
        ? 'Unassigned'
        : tutors.map(t => `${t.tutorName}: ${t.confirmed === true ? 'Confirmed' : 'Awaiting confirmation'}`).join('; ');      return [
        s.day, s.startTime.slice(0, 5), s.endTime.slice(0, 5),
        s.location || '', s.campus || '', s.sessionType || '',
        s.capacity ?? '', s.status || '', tutorNames, confirmation
      ];
    });

    const escapeCsv = (val) => {
      const str = String(val);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const csvContent = [header, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeUnit.unitCode}_schedule.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

    const handleExportPng = async () => {
    if (!gridRef.current) return;
    const canvas = await html2canvas(gridRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const link = document.createElement('a');
    link.download = `${activeUnit.unitCode}_schedule.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setShowExportMenu(false);
  };

  const handleLockClick = async (force = false) => {
    setIsLocking(true);
    setLockError(null);
    try {
      await unitsAPI.lockSchedule(activeUnit.id, force);
      setShowForceLockModal(false);
      await refreshUnits();
    } catch (err) {
      if (err.details && (err.details.unassignedCount > 0 || err.details.pendingCount > 0)) {
        setLockError(err.details);
        setShowForceLockModal(true);
      } else {
        alert(err.message || 'Failed to lock schedule.');
      }
    } finally {
      setIsLocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!window.confirm('Unlock this schedule so changes can be made again?')) return;
    setIsLocking(true);
    try {
      await unitsAPI.unlockSchedule(activeUnit.id);
      await refreshUnits();
    } catch (err) {
      alert(err.message || 'Failed to unlock schedule.');
    } finally {
      setIsLocking(false);
    }
  };

  const handleReleaseToggle = async () => {
   setIsReleasing(true);
   try {
     if (activeUnit.draftReleased) {
       if (!window.confirm("Un-release the draft? Tutors won't be able to see the timetable until it's released again (or finalised).")) {
         setIsReleasing(false);
         return;
       }
       await unitsAPI.unreleaseDraft(activeUnit.id);
     } else {
       await unitsAPI.releaseDraft(activeUnit.id);
     }
     await refreshUnits();
   } catch (err) {
     alert(err.message || 'Failed to update draft release status.');
   } finally {
     setIsReleasing(false);
   }
 };

  if (unitLoading || (isLoadingSessions && sessions.length === 0)) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="schedule-builder" />
        <main className="uc-main-content">
          <UCPageHeader title="Schedule Builder" />
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
          {isLocked && (
            <div className="sb-locked-banner">
              This schedule is finalised and locked. Unlock it from the Finalise tab to make changes.
            </div>
          )}

          <div className="sb-stats-row">
            <div className="sb-stat-card unassigned">
              <div className="sb-stat-number">{unassignedSessions.length}</div>
              <div className="sb-stat-label">Unassigned Sessions</div>
            </div>
            <div className="sb-stat-card assigned">
              <div className="sb-stat-number">{confirmedSessions.length}</div>
              <div className="sb-stat-label">Confirmed Sessions</div>
            </div>
            <div className="sb-stat-card">
              <div className="sb-stat-number">{pendingSessions.length}</div>
              <div className="sb-stat-label">Awaiting Confirmation</div>
            </div>
            <div className="sb-stat-card">
              <div className="sb-stat-number">{sessions.length}</div>
              <div className="sb-stat-label">Total Sessions</div>
            </div>
          </div>

          <div className="sb-view-toggle">
            <button className={`sb-toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
              List View
            </button>
            <button className={`sb-toggle-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>
              Grid View
            </button>
            <button className={`sb-toggle-btn ${view === 'finalise' ? 'active' : ''}`} onClick={() => setView('finalise')}>
              Finalise
            </button>
          </div>

          {view === 'grid' && (
            <div className="sb-section">
              <div className="sb-grid-legend">
                <span className="sb-legend-item"><span className="sb-legend-dot assigned"></span>Confirmed</span>
                <span className="sb-legend-item"><span className="sb-legend-dot pending"></span>Awaiting confirmation</span>
                <span className="sb-legend-item"><span className="sb-legend-dot unassigned"></span>Unassigned</span>
              </div>
            {renderThreeColorGrid()}
            </div>
          )}

          {view === 'list' && (
            <>
              <div className="sb-section">
                <h2>Unassigned</h2>
                {unassignedSessions.length === 0 ? (
                  <div className="sb-empty-state">All sessions have a tutor assigned.</div>
                ) : (
                  <table className="sb-table">
                     <colgroup>
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '13%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th>Capacity</th>
                        <th></th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedSessions.map(session => {
                        const suggested = suggestedTutorCount(session.capacity);
                       return (
                         <tr key={session.id} className={isLocked ? '' : 'sb-row-clickable'} onClick={() => openAssignModal(session)}>
                           <td>{session.sessionCode || '-'}</td>
                           <td>{session.day}</td>
                           <td>{formatTimeRange(session.startTime, session.endTime)}</td>
                           <td>{session.location || '-'}</td>
                           <td>{session.sessionType || '-'}</td>
                           <td>
                             {session.capacity ?? '-'}
                             {suggested > 1 && (
                               <span className="sb-capacity-flag" title={`~1 tutor per ${STUDENTS_PER_TUTOR} students suggests ${suggested} tutors`}>
                                 Suggest {suggested} tutors
                               </span>
                             )}
                           </td>
                           <td></td>
                           <td>
                             <button
                               className="sb-assign-btn"
                               onClick={(e) => { e.stopPropagation(); openAssignModal(session); }}
                               disabled={isLocked}
                             >
                               Assign Tutor
                             </button>
                           </td>
                         </tr>
                       );
                     })}
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
                    <colgroup>
                      <col style={{ width: '9%' }} />
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '13%' }} />
                      <col style={{ width: '13%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Location</th>
                        <th>Type</th>
                        <th>Capacity</th>
                        <th>Tutor</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedSessions.map(session => {
                       const suggested = suggestedTutorCount(session.capacity);
                       return (
                         <tr key={session.id}>
                           <td>{session.sessionCode || '-'}</td>
                           <td>{session.day}</td>
                           <td>{formatTimeRange(session.startTime, session.endTime)}</td>
                           <td>{session.location || '-'}</td>
                           <td>{session.sessionType || '-'}</td>
                           <td>
                             {session.capacity ?? '-'}
                             {suggested > 1 && (
                               <span className="sb-capacity-flag" title={`~1 tutor per ${STUDENTS_PER_TUTOR} students suggests ${suggested} tutors`}>
                                 Suggest {suggested} tutors
                               </span>
                             )}
                           </td>
                           <td>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                               {(session.tutors || []).map(t => (
                                 <span key={t.tutorId} className="sb-assigned-pill">{t.tutorName}</span>
                               ))}
                             </div>                            </td>
                            <td>
                             {!isLocked && (
                               <button className="sb-change-link" onClick={() => openAssignModal(session)}>
                                 Change
                               </button>
                             )}
                           </td>
                         </tr>
                       );
                     })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {view === 'finalise' && (
            <div className="sb-section">
              <div className="sb-finalise-toolbar">
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button className="sb-toggle-btn" onClick={() => setShowExportMenu(prev => !prev)}>
                    Export ▾
                  </button>
                  {showExportMenu && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 4,
                      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 160, zIndex: 10
                    }}>
                      <button
                        onClick={() => { handleExportCsv(); setShowExportMenu(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer' }}
                      >
                        Export as CSV
                      </button>
                      <button
                        onClick={handleExportPng}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer' }}
                      >
                        Export as PNG
                      </button>
                    </div>
                  )}
                </div>
                {isLocked ? (
                  <>
                   <span className="sb-release-note">Finalised schedules are always visible to tutors.</span>
                   <button className="sb-toggle-btn active" onClick={handleUnlock} disabled={isLocking}>
                     {isLocking ? 'Unlocking...' : 'Unlock Schedule'}
                   </button>
                 </>
                ) : (
                  <>
                   <button className="sb-toggle-btn" onClick={handleReleaseToggle} disabled={isReleasing}>
                     {isReleasing
                       ? 'Updating...'
                       : activeUnit.draftReleased
                         ? 'Un-release Draft'
                         : 'Release Draft to Tutors'}
                   </button>
                   <button className="sb-toggle-btn active" onClick={() => handleLockClick(false)} disabled={isLocking}>
                     {isLocking ? 'Locking...' : 'Lock & Finalise Schedule'}
                   </button>
                 </>
                )}
              </div>

              <div className="sb-grid-legend">
                <span className="sb-legend-item"><span className="sb-legend-dot assigned"></span>Confirmed</span>
                <span className="sb-legend-item"><span className="sb-legend-dot pending"></span>Awaiting confirmation</span>
                <span className="sb-legend-item"><span className="sb-legend-dot unassigned"></span>Unassigned</span>
              </div>

              {renderThreeColorGrid()}
            </div>
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
            <p className="sb-modal-session-info">
              {modalSession.sessionCode ? `${modalSession.sessionCode} · ` : ''}
              {formatSession(modalSession)}{modalSession.sessionType ? ` - ${modalSession.sessionType}` : ''}
            </p>
            {suggestedTutorCount(modalSession.capacity) > 1 && (
             <p className="sb-modal-suggestion-line">
               Suggested: {suggestedTutorCount(modalSession.capacity)} tutors (capacity {modalSession.capacity})
             </p>
            )}

            {modalError && <p className="sb-warning-text" style={{ marginBottom: 16 }}>{modalError}</p>}

            {isLoadingCandidates ? (
              <div className="sb-loading">Loading tutors...</div>
            ) : (
              candidates.map((candidate, index) => {
                const isTopPick = index === 0 && !candidate.hardBlocked && !candidate.isAssignedToThisSession;
                return (
                  <div
                    key={candidate.id}
                    className={`sb-candidate-row ${candidate.hardBlocked ? 'blocked' : ''} ${isTopPick ? 'top-pick' : ''} ${candidate.isAssignedToThisSession ? 'top-pick' : ''}`}
                  >
                    <div className="sb-candidate-info">
                      <div className="sb-candidate-name">
                        {candidate.name}
                        {candidate.starred && (
                          <span className="sb-candidate-star" title="Starred tutor">★</span>
                        )}
                        {candidate.flagged && (
                          <span className="sb-candidate-flag" title="Flagged tutor">⚑</span>
                        )}
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
                      disabled={candidate.hardBlocked || isAssigning || candidate.isAssignedToThisSession}
                      onClick={() => handleAssign(candidate.id)}
                    >
                      {candidate.isAssignedToThisSession ? 'Assigned' : 'Assign'}
                    </button>
                  </div>
                );
              })
            )}

              {modalSession.tutors && modalSession.tutors.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Currently assigned:</p>
                {modalSession.tutors.map(t => (
                  <div key={t.tutorId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span>{t.tutorName}</span>
                    <button
                      className="sb-unassign-btn"
                      onClick={() => handleUnassign(t.tutorId)}
                      disabled={isAssigning}
                      style={{ fontSize: 13, padding: '4px 10px' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showForceLockModal && lockError && (
        <div className="sb-modal-overlay" onClick={() => setShowForceLockModal(false)}>
          <div className="sb-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="sb-modal-close" onClick={() => setShowForceLockModal(false)}>&times;</button>
            <div className="sb-modal-header">
              <h2>Schedule isn't fully ready</h2>
            </div>
            <p className="sb-modal-session-info">
              {lockError.unassignedCount > 0 && `${lockError.unassignedCount} session(s) still unassigned. `}
              {lockError.pendingCount > 0 && `${lockError.pendingCount} session(s) awaiting tutor confirmation.`}
            </p>
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
              You can still lock it now, but those sessions will stay as they are and tutors won't be able to confirm pending ones after locking.
            </p>
            <div className="sb-modal-buttons" style={{ display: 'flex', gap: 12 }}>
              <button className="is-btn-secondary" style={{ flex: 1 }} onClick={() => setShowForceLockModal(false)}>
                Go back
              </button>
              <button className="sb-toggle-btn active" style={{ flex: 1 }} onClick={() => handleLockClick(true)} disabled={isLocking}>
                {isLocking ? 'Locking...' : 'Lock anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleBuilder;
