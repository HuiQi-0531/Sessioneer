// A "block" is one table within the CSV: a section title (optional),
// a header row, and the data rows underneath it.
// Real university timetable exports often stack several of these in one
// file (e.g. TUTORIALS, then CONSULTATIONS), separated by blank rows.

const isBlankRow = (row) => row.every(cell => !cell || cell.toString().trim() === '');

// Maps a section title like "TUTORIALS" to a singular session type like "Tutorial".
const guessSessionTypeFromTitle = (title) => {
  if (!title) return '';
  const clean = title.trim().toLowerCase();
  const map = {
    tutorials: 'Tutorial',
    tutorial: 'Tutorial',
    consultations: 'Consultation',
    consultation: 'Consultation',
    lectures: 'Lecture',
    lecture: 'Lecture',
    workshops: 'Workshop',
    workshop: 'Workshop',
    practicals: 'Practical',
    practical: 'Practical',
    labs: 'Practical',
    lab: 'Practical',
  };
  if (map[clean]) return map[clean];
  // Fallback: strip a trailing "s" and capitalise the first letter
  const singular = clean.endsWith('s') ? clean.slice(0, -1) : clean;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
};

/**
 * Splits raw parsed CSV rows (array of arrays of strings) into blocks.
 * Each block is { sectionTitle, suggestedSessionType, headers, rows }.
 */
export const parseCsvIntoBlocks = (rawRows) => {
  const blocks = [];
  let pendingTitle = null;
  let i = 0;

  while (i < rawRows.length) {
    // Skip blank rows
    if (isBlankRow(rawRows[i])) {
      i++;
      continue;
    }

    // Collect a run of consecutive non-blank rows
    const runStart = i;
    while (i < rawRows.length && !isBlankRow(rawRows[i])) {
      i++;
    }
    const run = rawRows.slice(runStart, i);

    // A run with exactly one row, where only the first cell has content,
    // is treated as a standalone section title (e.g. "TUTORIALS").
    const nonEmptyCells = run[0].filter(c => c && c.toString().trim() !== '');
    if (run.length === 1 && nonEmptyCells.length === 1) {
      pendingTitle = nonEmptyCells[0];
      continue;
    }

    // Otherwise this run is a table: first row is headers, rest is data.
    const headers = run[0].map(h => (h || '').toString().trim());
    const dataRows = run.slice(1).filter(row => !isBlankRow(row));

    blocks.push({
      sectionTitle: pendingTitle,
      suggestedSessionType: guessSessionTypeFromTitle(pendingTitle),
      headers,
      rows: dataRows
    });

    pendingTitle = null;
  }

  return blocks;
};

// Guesses which CSV column corresponds to each system field, based on
// common header wording. Returns a map like { day: 'Day', startTime: 'Start Time' }.
export const guessColumnMapping = (headers) => {
  const mapping = {};
  const used = new Set();

  const findHeader = (predicate) => {
    return headers.find(h => !used.has(h) && predicate(h.toLowerCase()));
  };

  const dayHeader = findHeader(h => h === 'day' || (h.includes('day') && !h.includes('order')));
  if (dayHeader) { mapping.day = dayHeader; used.add(dayHeader); }

  const startHeader = findHeader(h => h.includes('start'));
  if (startHeader) { mapping.startTime = startHeader; used.add(startHeader); }

  const endHeader = findHeader(h => h.includes('end'));
  if (endHeader) { mapping.endTime = endHeader; used.add(endHeader); }

  const locationHeader = findHeader(h => h.includes('location') || h.includes('room'));
  if (locationHeader) { mapping.location = locationHeader; used.add(locationHeader); }

  const campusHeader = findHeader(h => h.includes('campus'));
  if (campusHeader) { mapping.campus = campusHeader; used.add(campusHeader); }

  const staffHeader = findHeader(h => h.includes('staff') || h.includes('tutor'));
  if (staffHeader) { mapping.staffNote = staffHeader; used.add(staffHeader); }

  const capacityHeader = findHeader(h => h.includes('capacity') || h.includes('size'));
  if (capacityHeader) { mapping.capacity = capacityHeader; used.add(capacityHeader); }

  const typeHeader = findHeader(h => h.includes('type') || h.includes('class'));
  if (typeHeader) { mapping.sessionType = typeHeader; used.add(typeHeader); }

  return mapping;
};