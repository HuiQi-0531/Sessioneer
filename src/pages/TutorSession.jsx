import React, { useState, useEffect } from 'react';
import { sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorSidebar from '../components/TutorSidebar';
import UCPageHeader from '../components/UCPageHeader';
import '../styles/TutorSession.css';

const DAY_TO_INDEX = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4 };

const TutorSession = () => {
  const { activeUnit, isLoading: unitLoading } = useActiveUnit();

  const [fullscreen, setFullscreen] = useState(false);
  const [rawSessions, setRawSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const compactTimeSlots = ['8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'];
  const fullTimeSlots = ['8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm'];
  const timeSlots = fullscreen ? fullTimeSlots : compactTimeSlots;

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
      setRawSessions(data);
    } catch (err) {
      console.error('Error loading unit sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Convert real session records into the {title, code, tutor, day, start, duration, color}
  // shape the existing grid renderer expects.
  const sessions = rawSessions
    .filter(s => DAY_TO_INDEX[s.day] !== undefined)
    .map(s => {
      const startHour = parseInt(s.startTime.split(':')[0], 10);
      const endHour = parseInt(s.endTime.split(':')[0], 10);
      let color;
      if (!s.isAssigned) color = 'red';
      else if (s.tutorConfirmed === true) color = 'green';
      else color = 'yellow';

      return {
        title: s.sessionType || 'Session',
        code: s.location || '-',
        tutor: s.isAssigned ? (s.assignedTutorName || 'Assigned') : 'Unassigned',
        day: DAY_TO_INDEX[s.day],
        start: Math.max(0, startHour - 8),
        duration: Math.max(1, endHour - startHour),
        color
      };
    });

  if (unitLoading) {
    return (
      <div className="dashboard-container">
        <TutorSidebar activePage="sessions" />
        <main className="main-content"><div style={{ padding: 32 }}>Loading...</div></main>
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
            </div>

            {isLoadingSessions ? (
              <p style={{ padding: 20, color: '#6b7280' }}>Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <p style={{ padding: 20, color: '#6b7280' }}>No sessions have been added to this unit yet.</p>
            ) : (
              <div className="timetable-wrapper">
                <div className="timetable-days">
                  <div className="time-header"></div>
                  {days.map((day) => (
                    <div key={day} className="day-header">{day}</div>
                  ))}
                </div>

                <div className="timetable-grid">
                  <div className="time-column">
                    {timeSlots.map((time) => (
                      <div key={time} className="time-slot-label">{time}</div>
                    ))}
                  </div>

                  <div className="calendar-grid">
                    {days.map((day, dayIndex) => (
                      <div key={dayIndex} className="calendar-column">
                        {timeSlots.map((time, index) => (
                          <div key={index} className="calendar-cell"></div>
                        ))}

                        {sessions
                          .filter((session) => session.day === dayIndex)
                          .map((session, index) => (
                            <div
                              key={index}
                              className={`session-event-card ${session.color}`}
                              style={{
                                top: `${session.start * (fullscreen ? 50 : 70)}px`,
                                height: `${session.duration * (fullscreen ? 50 : 70)}px`
                              }}
                            >
                              <h4>{session.title}</h4>
                              <p>{session.code}</p>
                              <span>{session.tutor}</span>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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