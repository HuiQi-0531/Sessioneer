import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/TutorSession.css';
import '../styles/ScheduleBuilder.css';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_LABELS = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' };
// Same range as the UC's Schedule Builder grid (8am-9pm), so the two views line up exactly.
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 21;
const HOUR_LABELS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => {
  const hour = GRID_START_HOUR + i;
  if (hour === 12) return '12pm';
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
});

const getBlockState = (session) => {
  if (!session.isAssigned) return 'unassigned';
  if (session.tutorConfirmed === true) return 'confirmed';
  return 'pending';
};

const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
};

const computeOverlapPlacements = (sessions) => {
  const sorted = [...sessions].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const placements = {};
  let columnEnds = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const finalizeCluster = () => {
    if (cluster.length === 0) return;
    const maxCol = Math.max(...cluster.map(s => placements[s.id].col)) + 1;
    cluster.forEach(s => { placements[s.id].total = maxCol; });
    cluster = [];
  };

  sorted.forEach(s => {
    const start = timeToMinutes(s.startTime);
    const end = timeToMinutes(s.endTime);

    if (start >= clusterEnd) {
      finalizeCluster();
      columnEnds = [];
      clusterEnd = -Infinity;
    }

    let colIndex = columnEnds.findIndex(endTime => start >= endTime);
    if (colIndex === -1) {
      colIndex = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[colIndex] = end;
    }

    placements[s.id] = { col: colIndex };
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, end);
  });

  finalizeCluster();
  return placements;
};

const TutorSession = () => {
  const { unitId: unitIdFromUrl } = useParams();
  const navigate = useNavigate();
  const { activeUnit, activeUnitId, allUnits, setActiveUnitId, isLoading: unitLoading } = useActiveUnit();

  const [fullscreen, setFullscreen] = useState(false);
  const [rawSessions, setRawSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [notReleased, setNotReleased] = useState(false);

  const tutorUnits = useMemo(
    () => allUnits.filter(unit => unit.roles?.includes('tutor')),
    [allUnits]
  );

  useEffect(() => {
    if (!unitIdFromUrl || unitLoading) {
      return;
    }

    const targetTutorUnit = tutorUnits.find(unit => unit.id === unitIdFromUrl);
    if (targetTutorUnit && targetTutorUnit.id !== activeUnitId) {
      setActiveUnitId(targetTutorUnit.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIdFromUrl, unitLoading, tutorUnits, activeUnitId]);

  useEffect(() => {
    if (unitLoading || tutorUnits.length === 0) {
      return;
    }

    if (!activeUnit || !activeUnit.roles?.includes('tutor')) {
      setActiveUnitId(tutorUnits[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitLoading, tutorUnits, activeUnit]);

  useEffect(() => {
    if (!activeUnit || !activeUnit.roles?.includes('tutor')) {
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
      if (Array.isArray(data)) {
        setNotReleased(false);
        setRawSessions(data);
      } else {
        // Backend returns { released: false, sessions: [] } when the UC hasn't
        // released the draft/final schedule yet (and this tutor has no early access).
        setNotReleased(true);
        setRawSessions([]);
      }
    } catch (err) {
      console.error('Error loading unit sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const formatTimeRange = (start, end) => `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
  const hourFromTime = (timeStr) => parseInt(timeStr.split(':')[0], 10);

  const gridSessions = rawSessions.filter(s =>
    DAYS.includes(s.day) &&
    hourFromTime(s.startTime) >= GRID_START_HOUR &&
    hourFromTime(s.endTime) <= GRID_END_HOUR
  );

  const overlapPlacements = useMemo(() => {
  const byDay = {};
  DAYS.forEach(day => {
    const daySessions = gridSessions.filter(s => s.day === day);
    byDay[day] = computeOverlapPlacements(daySessions);
  });
  return byDay;
}, [gridSessions]);

  const hiddenFromGridCount = rawSessions.length - gridSessions.length;
  const activeUnitIndex = tutorUnits.findIndex(unit => unit.id === activeUnit?.id);
  const hasMultipleUnits = tutorUnits.length > 1 && activeUnitIndex !== -1;

  const handleUnitStep = (direction) => {
    if (!hasMultipleUnits) return;
    const nextIndex = (activeUnitIndex + direction + tutorUnits.length) % tutorUnits.length;
    const nextUnit = tutorUnits[nextIndex];
    setActiveUnitId(nextUnit.id);
    navigate('/tutor-sessions');
  };

  if (unitLoading) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="sessions" />
        <main className="main-content">
          <UCPageHeader title="Sessions" />
          <div style={{ padding: 32 }}>Loading sessions...</div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="sessions" />
        <main className="main-content">
          <UCPageHeader title="Sessions" />
          <div style={{ padding: 32 }}>No unit selected. Once you're linked to a unit, it'll show up here.</div>
        </main>
      </div>
    );
  }

  if (!activeUnit.roles?.includes('tutor')) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="sessions" />
        <main className="main-content">
          <UCPageHeader title="Sessions" />
          <div style={{ padding: 32 }}>Loading your tutor units...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {!fullscreen && <TutorSidebar activePage="sessions" />}

      <main className={`main-content ${fullscreen ? 'fullscreen-main' : ''}`}>
        {!fullscreen && <UCPageHeader title="Sessions" />}

        <div className={`sessions-wrapper ${fullscreen ? 'fullscreen-wrapper' : ''}`}>
          <div className={`sessions-card ${fullscreen ? 'fullscreen-card' : ''}`}>
            <div className="sessions-top">
              <div>
                <h3 className="sessions-title">{activeUnit.unitCode} - Session Schedule</h3>
                <p className="sessions-subtitle">View all classes and tutoring sessions in this unit</p>
              </div>
              {hasMultipleUnits && (
                <div className="sessions-unit-switcher" aria-label="Switch unit sessions">
                  <button
                    type="button"
                    className="sessions-unit-arrow"
                    onClick={() => handleUnitStep(-1)}
                    aria-label="Previous unit"
                  >
                    &lsaquo;
                  </button>
                  <span className="sessions-unit-position">
                    {activeUnitIndex + 1} / {tutorUnits.length}
                  </span>
                  <button
                    type="button"
                    className="sessions-unit-arrow"
                    onClick={() => handleUnitStep(1)}
                    aria-label="Next unit"
                  >
                    &rsaquo;
                  </button>
                </div>
              )}
            </div>

            {isLoadingSessions ? (
              <p style={{ padding: 20, color: '#6b7280' }}>Loading sessions...</p>
            ) : notReleased ? (
              <div className="sessions-not-released">
                Your unit coordinator hasn't released the schedule yet. Check back once the draft
                or final schedule has been released.
              </div>
            ) : rawSessions.length === 0 ? (
              <p style={{ padding: 20, color: '#6b7280' }}>No sessions have been added to this unit yet.</p>
            ) : (
              <>
                <div className="sb-grid-legend">
                  <span className="sb-legend-item"><span className="sb-legend-dot assigned"></span>Confirmed</span>
                  <span className="sb-legend-item"><span className="sb-legend-dot pending"></span>Awaiting confirmation</span>
                  <span className="sb-legend-item"><span className="sb-legend-dot unassigned"></span>Unassigned</span>
                </div>
                <div className="sb-grid-wrapper">
                  <div
                    className="sb-grid"
                    style={{ gridTemplateRows: `auto repeat(${HOUR_LABELS.length}, ${fullscreen ? 60 : 44}px)` }}
                  >
                    <div className="sb-grid-corner" />
                    {DAYS.map(day => (
                      <div key={day} className="sb-grid-day-header">{DAY_LABELS[day]}</div>
                    ))}

                    {HOUR_LABELS.map((label, i) => (
                      <div key={label} className="sb-grid-time-label" style={{ gridRow: i + 2 }}>{label}</div>
                    ))}

                    {HOUR_LABELS.map((label, i) => (
                      <div
                        key={`gridline-${label}`}
                        className="sb-grid-hour-line"
                        style={{ gridRow: i + 2, gridColumn: '1 / -1' }}
                      />
                    ))}

                    {gridSessions.map(session => {
                    const dayIndex = DAYS.indexOf(session.day);
                    const startHour = hourFromTime(session.startTime);
                    const endHour = hourFromTime(session.endTime);
                    const rowStart = (startHour - GRID_START_HOUR) + 2;
                    const rowEnd = (endHour - GRID_START_HOUR) + 2;
                    const state = getBlockState(session);

                    const placement = overlapPlacements[session.day]?.[session.id] || { col: 0, total: 1 };
                    const widthPct = 100 / placement.total;
                    const leftPct = widthPct * placement.col;

                    return (
                      <div
                        key={session.id}
                        className={`sb-grid-block ${state === 'confirmed' ? 'assigned' : state === 'pending' ? 'pending' : 'unassigned'}`}
                        style={{
                          gridColumn: dayIndex + 2,
                          gridRow: `${rowStart} / ${rowEnd}`,
                          width: `calc(${widthPct}% - 4px)`,
                          marginLeft: `calc(${leftPct}% + 2px)`,
                          boxSizing: 'border-box',
                        }}
                      >
                          <div className="sb-grid-block-time">{formatTimeRange(session.startTime, session.endTime)}</div>
                          <div className="sb-grid-block-type">
                            {session.sessionType || 'Session'}{session.location ? ` - ${session.location}` : ''}
                          </div>
                          <div className="sb-grid-block-tutor">
                            {state === 'unassigned' ? 'Unassigned' : `${session.assignedTutorName}${state === 'pending' ? ' (pending)' : ''}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {hiddenFromGridCount > 0 && (
                    <p className="sb-grid-note">
                      {hiddenFromGridCount} session{hiddenFromGridCount > 1 ? 's' : ''} not shown here (outside Mon-Fri 8am-9pm).
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="fullscreen-btn-container">
              <button className="fullscreen-btn" onClick={() => setFullscreen(!fullscreen)}>
                {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TutorSession;
