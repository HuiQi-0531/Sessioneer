import React, { useEffect, useMemo, useState } from 'react';
import { messagesAPI } from '../config/api';
import { groupMessageUnits, messageUnitLabel } from '../utils/messageUnits';

const POLL_INTERVAL_MS = 30000;

// Unit column on the Messages page:
//   > Past semesters   (collapsed, read-only chats)
//   > Upcoming         (collapsed, shows "N new" when someone posts)
//   Current semester
//   #DAB201 · S2 2026
// A group with nothing in it is not shown at all.
const MessageUnitList = ({ units, selectedUnitId, onSelect }) => {
  const groups = useMemo(() => groupMessageUnits(units), [units]);
  const [openGroups, setOpenGroups] = useState({ past: false, upcoming: false });
  const [upcomingUnread, setUpcomingUnread] = useState(0);

  // The open chat already has its own badge in the inbox, so leave it out here.
  const upcomingIdsKey = groups.upcoming
    .map(unit => unit.id)
    .filter(id => id !== selectedUnitId)
    .join('|');

  useEffect(() => {
    const ids = upcomingIdsKey ? upcomingIdsKey.split('|') : [];
    if (!ids.length) {
      setUpcomingUnread(0);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      const counts = await Promise.all(ids.map(id =>
        messagesAPI.getGroupUnreadCount(id)
          .then(data => data.unreadCount || 0)
          .catch(() => 0)
      ));
      if (!cancelled) setUpcomingUnread(counts.reduce((sum, n) => sum + n, 0));
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [upcomingIdsKey]);

  // A group always opens if the selected chat is inside it, otherwise the
  // highlighted unit would be hidden.
  const isOpen = (key) => openGroups[key] || groups[key].some(unit => unit.id === selectedUnitId);
  const toggle = (key) => setOpenGroups(prev => ({ ...prev, [key]: !isOpen(key) }));

  const renderUnit = (unit) => (
    <div
      key={unit.id}
      className={`msg-unit-item ${selectedUnitId === unit.id ? 'active' : ''}`}
      onClick={() => onSelect(unit.id)}
    >
      {messageUnitLabel(unit, units)}
    </div>
  );

  const renderGroup = (key, title, badge) => {
    if (!groups[key].length) return null;
    const open = isOpen(key);
    return (
      <div className="msg-unit-group">
        <button
          type="button"
          className="msg-unit-group-toggle"
          onClick={() => toggle(key)}
          aria-expanded={open}
        >
          <span className={`msg-unit-group-arrow ${open ? 'open' : ''}`} aria-hidden="true">&#8250;</span>
          <span className="msg-unit-group-title">{title}</span>
          {badge}
        </button>
        {open && <div className={`msg-unit-group-list ${key}`}>{groups[key].map(renderUnit)}</div>}
      </div>
    );
  };

  return (
    <div className="msg-units-col">
      {renderGroup('past', 'Past semesters', (
        <span className="msg-unit-group-count">{groups.past.length}</span>
      ))}
      {renderGroup('upcoming', 'Upcoming', upcomingUnread > 0 ? (
        <span className="msg-unit-group-new">{upcomingUnread} new</span>
      ) : (
        <span className="msg-unit-group-count">{groups.upcoming.length}</span>
      ))}
      {groups.current.length > 0 && (
        <>
          <div className="msg-unit-section-label">Current semester</div>
          {groups.current.map(renderUnit)}
        </>
      )}
    </div>
  );
};

export default MessageUnitList;