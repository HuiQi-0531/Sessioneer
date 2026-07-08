import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI } from '../config/api';
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
  const { unitId: unitIdFromUrl } = useParams();
  const navigate = useNavigate();
  const { activeUnit, activeUnitId, setActiveUnitId, isLoading: unitLoading } = useActiveUnit();

  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [view, setView] = useState('list');

  const [declineTarget, setDeclineTarget] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      navigate(`/tutor-schedule/${activeUnit.id}`, { replace: true });
    }
    loadSessions(activeUnit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  const loadSessions = async (unitId) => {
    setIsLoadingSessions(true);
    try {
      const data = await sessionsAPI.getMyAssigned(unitId);
      setSessions(data);
    } catch (err) {
      console.error('Error loading assigned sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleConfirm = async (session) => {
    try {
      await sessionsAPI.confirmSession(activeUnit.id, session.id, true, null);
      await loadSessions(activeUnit.id);
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
      await sessionsAPI.confirmSession(activeUnit.id, declineTarget.id, false, declineReason.trim());
      setDeclineTarget(null);
      await loadSessions(activeUnit.id);
    } catch (err) {
      setDeclineError(err.message || 'Failed to decline session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTimeRange = (start, end) => `${start.slice(0, 5)} - ${end.slice(0, 5)}`;

  const hourFromTime = (timeStr) => parseInt(timeStr.split(':')[0], 10);
  const gridSessions = sessions.filter(s =>
    DAYS.includes(s.day) &&
    hourFromTime(s.startTime) >= GRID_START_HOUR &&
    hourFromTime(s.endTime) <= GRID_END_HOUR
  );
  const hiddenFromGridCount = sessions.length - gridSessions.length;

  const renderGrid = () => (
    <div className="ts-grid-wrapper">
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
              <div className="ts-grid-block-type">{session.sessionType || 'Session'}</div>
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
          <div className="ts-content"><div className="ts-empty-state">Loading...</div></div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="uc-dashboard-container">
        <TutorSidebar activePage="schedule" />
        <main className="uc-main-content">
          <UCPageHeader title="Schedule" />
          <div className="ts-content">
            <div className="ts-empty-state">No unit selected yet. Once you're linked to a unit, it'll show up here.</div>
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
            <button className={`ts-toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
              List View
            </button>
            <button className={`ts-toggle-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')}>
              Grid View
            </button>
          </div>

          {isLoadingSessions ? (
            <div className="ts-empty-state">Loading your schedule...</div>
          ) : sessions.length === 0 ? (
            <div className="ts-empty-state">You haven't been assigned to any sessions in this unit yet.</div>
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
              <thead>
                <tr>
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