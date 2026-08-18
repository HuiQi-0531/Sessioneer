import React, { useState, useEffect, useMemo } from 'react';
import { sessionsAPI } from '../config/api';
import html2canvas from 'html2canvas';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/UCRequests.css';
import '../styles/TutorSchedule.css';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_LABELS = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' };
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 21;
const HOUR_LABELS = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => {
  const hour = GRID_START_HOUR + i;
  if (hour === 12) return '12pm';
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
});

const getStatus = (session) => {
  if (session.tutorConfirmed === true) return 'confirmed';
  if (session.tutorConfirmed === false) return 'declined';
  return 'pending';
};

const TutorSchedule = () => {
  const { allUnits, isLoading: unitLoading } = useActiveUnit();

  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [view, setView] = useState('list');

  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const gridRef = React.useRef(null);

  const tutorUnits = useMemo(
    () => allUnits.filter(unit => unit.roles?.includes('tutor')),
    [allUnits]
  );

  useEffect(() => {
    if (unitLoading) return;

    if (tutorUnits.length === 0) {
      setIsLoadingSessions(false);
      setSessions([]);
      return;
    }
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitLoading, tutorUnits]);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const results = await Promise.all(
        tutorUnits.map(async (unit) => {
          const data = await sessionsAPI.getMyAssigned(unit.id);
          return data.map(session => ({
            ...session,
            unitId: unit.id,
            unitCode: unit.unitCode
          }));
        })
      );
      const merged = results
        .flat()
        .sort((a, b) => {
          const unitCompare = String(a.unitCode || '').localeCompare(String(b.unitCode || ''));
          if (unitCompare !== 0) return unitCompare;
          const dayCompare = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
          if (dayCompare !== 0) return dayCompare;
          return String(a.startTime || '').localeCompare(String(b.startTime || ''));
        });
      setSessions(merged);
    } catch (err) {
      console.error('Error loading assigned sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleConfirm = async (session) => {
    try {
      await sessionsAPI.confirmSession(session.unitId, session.id, true, null);
      await loadSessions();
    } catch (err) {
      alert(err.message || 'Failed to confirm session.');
    }
  };

  const openDeclineModal = (session) => {
    setDeclineTarget(session);
    setDeclineReason('');
    setDeclineError('');
  };

  const submitDecline = async () => {
    if (!declineReason.trim()) {
      setDeclineError('Please provide a reason for declining.');
      return;
    }
    setIsSubmitting(true);
    setDeclineError('');
    try {
      await sessionsAPI.confirmSession(declineTarget.unitId, declineTarget.id, false, declineReason.trim());
      setDeclineTarget(null);
      await loadSessions();
    } catch (err) {
      setDeclineError(err.message || 'Failed to decline session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimeRange = (start, end) => `${start.slice(0, 5)} - ${end.slice(0, 5)}`;

  const handleExportCsv = () => {
  const headers = ['Unit', 'Day', 'Start Time', 'End Time', 'Location', 'Type', 'Status'];

  const rows = sessions.map(session => {
    const status = getStatus(session);

    return [
      session.unitCode || '',
      session.day,
      session.startTime.slice(0, 5),
      session.endTime.slice(0, 5),
      session.location || '',
      session.sessionType || '',
      status === 'pending'
        ? 'Awaiting response'
        : status.charAt(0).toUpperCase() + status.slice(1),
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row =>
      row
        .map(value => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute(
    'download',
    'Tutor_Schedule.csv'
  );

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.URL.revokeObjectURL(url);
};

const handleExportPng = async () => {
    if (!gridRef.current) return;
    const canvas = await html2canvas(gridRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const link = document.createElement('a');
    link.download = 'Tutor_Schedule.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    setShowExportMenu(false);
  };

  const hourFromTime = (timeStr) => parseInt(timeStr.split(':')[0], 10);
  const gridSessions = sessions.filter(s =>
    DAYS.includes(s.day) &&
    hourFromTime(s.startTime) >= GRID_START_HOUR &&
    hourFromTime(s.endTime) <= GRID_END_HOUR
  );
  const hiddenFromGridCount = sessions.length - gridSessions.length;

  const renderGrid = () => (
    <div className="ts-grid-wrapper" ref={gridRef}>
      <div className="ts-grid" style={{ gridTemplateRows: `auto repeat(${HOUR_LABELS.length}, 44px)` }}>
        <div className="ts-grid-corner" />
        {DAYS.map(day => (
          <div key={day} className="ts-grid-day-header">{DAY_LABELS[day]}</div>
        ))}

        {HOUR_LABELS.map((label, i) => (
          <div key={label} className="ts-grid-time-label" style={{ gridRow: i + 2 }}>{label}</div>
        ))}

        {gridSessions.map(session => {
          const dayIndex = DAYS.indexOf(session.day);
          const startHour = hourFromTime(session.startTime);
          const endHour = hourFromTime(session.endTime);
          const rowStart = (startHour - GRID_START_HOUR) + 2;
          const rowEnd = (endHour - GRID_START_HOUR) + 2;
          const status = getStatus(session);

          return (
            <div
              key={session.id}
              className={`ts-grid-block ${status}`}
              style={{ gridColumn: dayIndex + 2, gridRow: `${rowStart} / ${rowEnd}` }}
            >
              <div className="ts-grid-block-time">{formatTimeRange(session.startTime, session.endTime)}</div>
              <div className="ts-grid-block-type">{session.unitCode} - {session.sessionType || 'Session'}</div>
              <div className="ts-grid-block-status">{status === 'pending' ? 'Awaiting your response' : status}</div>
            </div>
          );
        })}
      </div>
      {hiddenFromGridCount > 0 && (
        <p className="ts-grid-note">
          {hiddenFromGridCount} session{hiddenFromGridCount > 1 ? 's' : ''} not shown here (outside Mon-Fri 8am-9pm).
          Use List View to see everything.
        </p>
      )}
    </div>
  );

  if (unitLoading) {
    return (
      <div className="uc-dashboard-container">
        <TutorSidebar activePage="schedule" />
        <main className="uc-main-content">
          <UCPageHeader title="Schedule" />
          <div className="ts-content"><div className="ts-empty-state">Loading...</div></div>
        </main>
      </div>
    );
  }

  if (tutorUnits.length === 0) {
    return (
      <div className="uc-dashboard-container">
        <TutorSidebar activePage="schedule" />
        <main className="uc-main-content">
          <UCPageHeader title="Schedule" />
          <div className="ts-content">
            <div className="ts-empty-state">Once you're linked to a tutor unit, your schedule will show up here.</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <TutorSidebar activePage="schedule" />

      <main className="uc-main-content">
        <UCPageHeader title="Schedule" />

        <div className="ts-content">
          <div className="ts-view-toggle">
  <button
    className={`ts-toggle-btn ${view === 'list' ? 'active' : ''}`}
    onClick={() => setView('list')}
  >
    List View
  </button>

  <button
    className={`ts-toggle-btn ${view === 'grid' ? 'active' : ''}`}
    onClick={() => setView('grid')}
  >
    Grid View
  </button>

<div style={{ position: 'relative', display: 'inline-block' }}>
    <button
      className="ts-toggle-btn"
      onClick={() => setShowExportMenu(prev => !prev)}
      disabled={sessions.length === 0}
    >
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
          disabled={view !== 'grid'}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'none', cursor: view !== 'grid' ? 'not-allowed' : 'pointer', opacity: view !== 'grid' ? 0.5 : 1 }}
        >
          Export as PNG {view !== 'grid' && '(switch to Grid View)'}
        </button>
      </div>
    )}
  </div>
</div>

          {isLoadingSessions ? (
            <div className="ts-empty-state">Loading your schedule...</div>
          ) : sessions.length === 0 ? (
            <div className="ts-empty-state">You haven't been assigned to any sessions yet.</div>
          ) : view === 'grid' ? (
            <>
              <div className="ts-grid-legend">
                <span className="ts-legend-item"><span className="ts-legend-dot confirmed"></span>Confirmed</span>
                <span className="ts-legend-item"><span className="ts-legend-dot pending"></span>Awaiting your response</span>
                <span className="ts-legend-item"><span className="ts-legend-dot declined"></span>Declined</span>
              </div>
              {renderGrid()}
            </>
          ) : (
            <table className="ts-table">
              <colgroup>
                <col style={{ width: '10%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => {
                  const status = getStatus(session);
                  return (
                    <tr key={session.id}>
                      <td>{session.unitCode || '-'}</td>
                      <td>{session.day}</td>
                      <td>{formatTimeRange(session.startTime, session.endTime)}</td>
                      <td>{session.location || '-'}</td>
                      <td>{session.sessionType || '-'}</td>
                      <td>
                        <span className={`ts-status-badge ${status}`}>
                          {status === 'pending' ? 'Awaiting response' : status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                        {status === 'declined' && session.tutorRejectReason && (
                          <div className="ts-reject-reason">"{session.tutorRejectReason}"</div>
                        )}
                      </td>
                      <td>
                        {status === 'pending' && (
                          <div className="ts-action-row">
                            <button className="ts-confirm-btn" onClick={() => handleConfirm(session)}>Confirm</button>
                            <button className="ts-decline-btn" onClick={() => openDeclineModal(session)}>Decline</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {declineTarget && (
        <div className="ts-modal-overlay" onClick={() => setDeclineTarget(null)}>
          <div className="ts-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Decline this session?</h3>
            <p className="ts-modal-session-info">
              {declineTarget.day}, {formatTimeRange(declineTarget.startTime, declineTarget.endTime)}
              {declineTarget.location ? ` at ${declineTarget.location}` : ''}
            </p>
            <textarea
              placeholder="Please explain why you can't take this session..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
            {declineError && <p className="ts-modal-error">{declineError}</p>}
            <div className="ts-modal-buttons">
              <button className="cancel" onClick={() => setDeclineTarget(null)}>Cancel</button>
              <button className="confirm" onClick={submitDecline} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorSchedule;
