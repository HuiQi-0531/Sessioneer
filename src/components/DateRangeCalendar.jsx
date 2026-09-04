import React, { useState } from 'react';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const toISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseISO = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

// Monday-first weekday index (0 = Monday ... 6 = Sunday)
const mondayIndex = (date) => (date.getDay() + 6) % 7;

// Flight-booking-style range picker: first click sets the start date,
// second click sets the end date (swapping if it's before the start),
// third click starts a new range. startDate/endDate are 'yyyy-mm-dd'
// strings so they drop straight into the existing coverStartDate/coverEndDate state.
const DateRangeCalendar = ({ startDate, endDate, onChange }) => {
  const [viewMonth, setViewMonth] = useState(
    startOfMonth(parseISO(startDate) || new Date())
  );

  const goToPrevMonth = () => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayClick = (date) => {
    const iso = toISO(date);
    if (!startDate || (startDate && endDate)) {
      onChange(iso, '');
      return;
    }
    if (iso < startDate) {
      onChange(iso, startDate);
    } else {
      onChange(startDate, iso);
    }
  };

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const leadingBlanks = mondayIndex(viewMonth);
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
  }

  const monthLabel = viewMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const rangeText = !startDate
    ? 'Select a start date'
    : !endDate
      ? `${startDate} \u2192 select an end date`
      : `${startDate} \u2192 ${endDate}`;

  return (
    <div className="ss-cal">
      <p className="ss-cal-range-label">{rangeText}</p>
      <div className="ss-cal-header">
        <button type="button" onClick={goToPrevMonth} aria-label="Previous month" className="ss-cal-nav-btn">‹</button>
        <span className="ss-cal-month-label">{monthLabel}</span>
        <button type="button" onClick={goToNextMonth} aria-label="Next month" className="ss-cal-nav-btn">›</button>
      </div>
      <div className="ss-cal-weekday-row">
        {DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="ss-cal-grid">
        {cells.map((date, i) => {
          if (!date) return <span key={i} />;
          const iso = toISO(date);
          const isStart = iso === startDate;
          const isEnd = iso === endDate;
          const inRange = startDate && endDate && iso > startDate && iso < endDate;
          const classes = ['ss-cal-day'];
          if (isStart || isEnd) classes.push('selected');
          if (inRange) classes.push('in-range');
          return (
            <button
              type="button"
              key={i}
              className={classes.join(' ')}
              onClick={() => handleDayClick(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DateRangeCalendar;