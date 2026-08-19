import { useState, useEffect, useMemo, useCallback } from "react";
import { availabilityAPI, unitsAPI } from "../config/api";
import { useActiveUnit } from "../context/ActiveUnitContext";
import UCSidebar from "../components/UCSidebar";
import UCPageHeader from "../components/UCPageHeader";
import "../styles/UCAvailability.css";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
const TIME_SLOTS = ["8:00am","9:00am","10:00am","11:00am","12:00pm","1:00pm","2:00pm","3:00pm","4:00pm","5:00pm","6:00pm","7:00pm","8:00pm","9:00pm"];
const BADGE_MAP = {
  preferred: { label: "PREFERRED", cls: "badge--preferred" },
  available: { label: "AVAILABLE", cls: "badge--available" },
  avoid:     { label: "AVOID",     cls: "badge--avoid" },
};

function StarIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function FlagIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>;
}
function BellIcon({ isActive = true }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill={isActive?"#f59e0b":"#adb5bd"} stroke={isActive?"#f59e0b":"#adb5bd"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function FullscreenIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>;
}
function ExitFullscreenIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>;
}
function LockIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function UnlockIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>;
}
function SearchIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function TutorIcon({ type }) {
  if (type === "star") return <StarIcon />;
  if (type === "flag") return <FlagIcon />;
  return null;
}

export default function UCAvailability({ onSendReminder }) {
  const { activeUnit, isLoading: unitLoading, refreshUnits } = useActiveUnit();

  const [activeDay,      setActiveDay]      = useState("MON");
  const [zoom,           setZoom]           = useState(100);
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [remindersSent,  setRemindersSent]  = useState(new Set());
  const [tutors,           setTutors]           = useState([]);
  const [availability,     setAvailability]     = useState({});
  const [submissionStatus, setSubmissionStatus] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadError, setLoadError] = useState("");

  const loadAvailabilityData = useCallback(async () => {
    if (!activeUnit) {
      setTutors([]);
      setAvailability({});
      setSubmissionStatus([]);
      setLoadError("");
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    setLoadError("");
    try {
      const data = await availabilityAPI.get(activeUnit.unitCode);
      setTutors(data.tutors ?? []);
      setAvailability(data.availability ?? {});
      setSubmissionStatus(data.submissionStatus ?? []);
    } catch (err) {
      console.error('Could not load availability data:', err);
      setTutors([]);
      setAvailability({});
      setSubmissionStatus([]);
      setLoadError('Could not load availability. Please try again.');
    } finally {
      setIsLoadingData(false);
    }
  }, [activeUnit]);

  useEffect(() => {
    loadAvailabilityData();
  }, [loadAvailabilityData]);

  const zoomIn    = () => setZoom(z => Math.min(z + 10, 200));
  const zoomOut   = () => setZoom(z => Math.max(z - 10, 50));
  const zoomReset = () => setZoom(100);

  const toggleFullscreen = () => {
    const gridCard = document.querySelector('.uca-card');
    if (!gridCard) return;
    if (!document.fullscreenElement) { gridCard.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const handleReminderClick = (tutorId) => {
    if (!remindersSent.has(tutorId)) {
      setRemindersSent(prev => new Set(prev).add(tutorId));
      if (onSendReminder) onSendReminder(tutorId);
    }
  };

  const isDeadlinePassed = activeUnit?.availabilityDeadline &&
    new Date() > new Date(activeUnit.availabilityDeadline);
  const isWindowClosed = activeUnit?.availabilityLocked || isDeadlinePassed;

  const handleToggleLock = async () => {
    if (!activeUnit) return;
    setIsTogglingLock(true);
    try {
      if (activeUnit.availabilityLocked) {
        await unitsAPI.unlockAvailability(activeUnit.id);
      } else {
        await unitsAPI.lockAvailability(activeUnit.id);
      }
      await refreshUnits();
    } catch (err) {
      alert(err.message || 'Failed to update lock status.');
    } finally {
      setIsTogglingLock(false);
    }
  };

  const dayData = availability[activeDay] ?? {};
  const getCellBadge = (tutorId, slot) => {
    const val = dayData[tutorId]?.[slot];
    return val ? BADGE_MAP[val] : null;
  };

  // Tutor IDs who HAVE submitted, derived from submissionStatus. Anyone not
  // in this set (including tutors with no submissionStatus entry at all) is
  // treated as "not yet submitted" and gets a reminder bell in their header.
  const submittedIds = useMemo(() => {
    return new Set(submissionStatus.filter(s => s.submitted).map(s => s.tutorId));
  }, [submissionStatus]);

  // Filter tutors by search query (name match), used for the grid columns only.
  // Matches from the START of the full name or the start of any word in the
  // name (so typing "j" matches "Jayden Biden" / "John Wick", not "Charles
  // Oden" or anyone with a "j" buried mid-word).
  const filteredTutors = useMemo(() => {
    if (!searchQuery.trim()) return tutors;
    const q = searchQuery.trim().toLowerCase();
    return tutors.filter(t =>
      t.name
        .toLowerCase()
        .split(/\s+/)
        .some(word => word.startsWith(q))
    );
  }, [tutors, searchQuery]);

  if (unitLoading) {
    return (
      <div className="uca-root">
        <UCSidebar activePage="availability" />
        <main className="uca-main">
          <UCPageHeader title="Tutor Availability" />
          <div className="uca-content"><p style={{ padding: 24 }}>Loading...</p></div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="uca-root">
        <UCSidebar activePage="availability" />
        <main className="uca-main">
          <UCPageHeader title="Tutor Availability" />
          <div className="uca-content">
            <p style={{ padding: 24 }}>No unit selected. Choose one from the Active Unit menu, or create one first.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="uca-root">
      <UCSidebar activePage="availability" />

      <main className="uca-main">
        <UCPageHeader title="Tutor Availability" />

        <div className="uca-content">
          {isWindowClosed && (
            <div style={{
              backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
              borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600
            }}>
              Submissions are closed for this unit{activeUnit.availabilityLocked ? ' (locked manually)' : ` (deadline passed: ${new Date(activeUnit.availabilityDeadline).toLocaleDateString()})`}.
            </div>
          )}

          <div className={`uca-card ${isFullscreen ? 'uca-card--fullscreen' : ''}`}>
            <div className="uca-controls-row">
              <div className="uca-controls-left">
                <div className="uca-day-tabs">
                  {DAYS.map(day => (
                    <button key={day} className={`uca-day-tab${activeDay === day ? " uca-day-tab--active" : ""}`} onClick={() => setActiveDay(day)}>{day}</button>
                  ))}
                </div>
                <div className="uca-legend">
                  <span className="uca-legend__dot uca-legend__dot--preferred" /><span className="uca-legend__label">Preferred</span>
                  <span className="uca-legend__dot uca-legend__dot--available" /><span className="uca-legend__label">Available</span>
                  <span className="uca-legend__dot uca-legend__dot--avoid" /><span className="uca-legend__label">Avoid</span>
                </div>
              </div>
              <div className="uca-toolbar">
                <div className="uca-search">
                  <span className="uca-search__icon"><SearchIcon /></span>
                  <input
                    type="text"
                    className="uca-search__input"
                    placeholder="Search tutor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search tutor by name"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="uca-search__clear"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
                <button
                  className="uca-toolbar__btn uca-toolbar__btn--text"
                  onClick={handleToggleLock}
                  disabled={isTogglingLock}
                  style={activeUnit.availabilityLocked ? { backgroundColor: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' } : {}}
                >
                  {activeUnit.availabilityLocked ? <UnlockIcon /> : <LockIcon />}
                  <span style={{ marginLeft: 6 }}>
                    {isTogglingLock ? 'Updating...' : activeUnit.availabilityLocked ? 'Unlock Submissions' : 'Lock Submissions'}
                  </span>
                </button>
                <button className="uca-toolbar__btn" onClick={zoomOut} aria-label="Zoom out">−</button>
                <span className="uca-toolbar__zoom">{zoom}%</span>
                <button className="uca-toolbar__btn" onClick={zoomIn} aria-label="Zoom in">+</button>
                <button className="uca-toolbar__btn uca-toolbar__btn--text" onClick={zoomReset}>Reset</button>
                <button className="uca-toolbar__btn uca-toolbar__btn--icon" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                  {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
                </button>
              </div>
            </div>

            {isLoadingData ? (
              <div className="uca-empty">Loading availability...</div>
            ) : loadError ? (
              <div className="uca-empty">
                <p>{loadError}</p>
                <button type="button" className="uca-toolbar__btn uca-toolbar__btn--text" onClick={loadAvailabilityData}>
                  Retry
                </button>
              </div>
            ) : filteredTutors.length === 0 ? (
              <div className="uca-empty">No tutors match "{searchQuery}"</div>
            ) : (
              <div className="uca-grid-outer">
                <div className="uca-grid-scroller">
                  <table
                    className="uca-grid"
                    style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}
                  >
                    <thead>
                      <tr>
                        <th className="uca-grid__corner" />
                        {filteredTutors.map(tutor => {
                          const hasSubmitted  = submittedIds.has(tutor.id);
                          const reminderSent  = remindersSent.has(tutor.id);
                          return (
                            <th key={tutor.id} className="uca-grid__tutor-header">
                              <span className="uca-grid__tutor-namerow">
                                <span className="uca-grid__tutor-name">{tutor.name}</span>
                                {tutor.icon && <span className="uca-grid__tutor-icon"><TutorIcon type={tutor.icon} /></span>}
                                {!hasSubmitted && (
                                  <button
                                    type="button"
                                    className={`uca-bell uca-bell--header ${reminderSent ? "uca-bell--sent" : ""}`}
                                    aria-label={reminderSent ? `Reminder sent to ${tutor.name}` : `Send reminder to ${tutor.name}`}
                                    title={reminderSent ? "Reminder sent" : "Not yet submitted — send reminder"}
                                    onClick={() => handleReminderClick(tutor.id)}
                                    disabled={reminderSent}
                                  >
                                    <BellIcon isActive={!reminderSent} />
                                  </button>
                                )}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(slot => (
                        <tr key={slot}>
                          <td className="uca-grid__time">{slot}</td>
                          {filteredTutors.map(tutor => {
                            const badge = getCellBadge(tutor.id, slot);
                            return (
                              <td key={tutor.id} className="uca-grid__cell">
                                {badge && <span className={`uca-badge ${badge.cls}`}>{badge.label}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
