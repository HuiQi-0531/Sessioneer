// The Sessions page shows every tutor on a session and any running cover,
// both read from the API's tutors[] and activeCovers (session_tutors and
// cover_requests), never from a single "assigned tutor" field.
import { getTutorNames, getTutorLabel, formatCoverNote } from './sessionDisplay';

test('FE-10 all tutors on a two-tutor session are listed', () => {
  const s = { tutors: [{ tutorName: 'Ann Lee' }, { tutorName: 'Ben Wu' }] };
  expect(getTutorNames(s)).toEqual(['Ann Lee', 'Ben Wu']);
  expect(getTutorLabel(s)).toBe('Ann Lee, Ben Wu');
});

test('FE-11 a session with no tutors gives an empty label', () => {
  expect(getTutorLabel({})).toBe('');
  expect(getTutorLabel({ tutors: null })).toBe('');
});

test('FE-12 a running cover is described with who and when', () => {
  const s = { activeCovers: [{ claimedByName: 'Cam Ng', startDate: '2026-10-05', endDate: '2026-10-09' }] };
  expect(formatCoverNote(s)).toBe('Cover: Cam Ng (5 Oct - 9 Oct)');
});

test('FE-13 no cover means no note', () => {
  expect(formatCoverNote({ activeCovers: [] })).toBe('');
  expect(formatCoverNote({})).toBe('');
});
