const {
  suggestedTutorCount,
  codePrefixForType,
  nextSessionCode,
  isBlank,
  getMissingSessionFields,
  getMissingAdminSessionFields,
  validateSessionInput,
  formatSessionRow,
  formatCoveringSessionRow,
  buildConfirmationUpdate,
  checkAssignSlot
} = require('../../utils/sessionRules');

describe('suggestedTutorCount (1 tutor per 30 students, starting at 1)', () => {
  test('LG-145: no capacity gives 1 tutor', () => {
    expect(suggestedTutorCount(0)).toBe(1);
    expect(suggestedTutorCount(null)).toBe(1);
  });
  test('LG-146: 29 students gives 1 tutor', () => {
    expect(suggestedTutorCount(29)).toBe(1);
  });
  test('LG-147: 30 students gives 2 tutors', () => {
    expect(suggestedTutorCount(30)).toBe(2);
  });
  test('LG-148: 60 students gives 3 tutors', () => {
    expect(suggestedTutorCount(60)).toBe(3);
  });
  test('LG-149: capacity as text from a CSV ("45") gives 2 tutors', () => {
    expect(suggestedTutorCount('45')).toBe(2);
  });
});

describe('codePrefixForType', () => {
  test('LG-150: Tutorial gets TUT', () => {
    expect(codePrefixForType('Tutorial')).toBe('TUT');
  });
  test('LG-151: Lecture gets LEC', () => {
    expect(codePrefixForType('Lecture')).toBe('LEC');
  });
  test('LG-152: unknown or missing type gets SES', () => {
    expect(codePrefixForType('Seminar')).toBe('SES');
    expect(codePrefixForType(null)).toBe('SES');
  });
  test('LG-153: lowercase "tutorial" from a CSV gets TUT (LOGIC-B9)', () => {
    expect(codePrefixForType('tutorial')).toBe('TUT');
  });
});

describe('nextSessionCode', () => {
  test('LG-154: no codes yet gives 01', () => {
    expect(nextSessionCode('TUT', [])).toBe('TUT01');
  });
  test('LG-155: TUT01 to TUT03 used gives TUT04', () => {
    expect(nextSessionCode('TUT', ['TUT01', 'TUT02', 'TUT03'])).toBe('TUT04');
  });
  test('LG-156: with a gap, continues after the highest number', () => {
    expect(nextSessionCode('TUT', ['TUT01', 'TUT05'])).toBe('TUT06');
  });
  test('LG-157: codes that are not PREFIX + number are ignored', () => {
    expect(nextSessionCode('TUT', ['TUT01A', 'TUTX', null, 'LEC07'])).toBe('TUT01');
  });
  test('LG-158: after TUT99 comes TUT100', () => {
    expect(nextSessionCode('TUT', ['TUT99'])).toBe('TUT100');
  });
});

describe('isBlank', () => {
  test('LG-159: undefined, null, empty and spaces are blank', () => {
    [undefined, null, '', '   '].forEach(v => expect(isBlank(v)).toBe(true));
  });
  test('LG-160: 0 is a value, not blank', () => {
    expect(isBlank(0)).toBe(false);
  });
  test('LG-161: normal text is not blank', () => {
    expect(isBlank('a')).toBe(false);
  });
});

describe('getMissingSessionFields', () => {
  const full = {
    day: 'MON', startTime: '10:00', endTime: '12:00', location: 'GP-P512', campus: 'GP',
    sessionType: 'Tutorial', capacity: 30, requiredTutors: 2, status: 'Confirmed'
  };

  test('LG-162: all fields filled gives no missing fields', () => {
    expect(getMissingSessionFields(full)).toEqual([]);
  });
  test('LG-163: missing day is reported as "Day"', () => {
    expect(getMissingSessionFields({ ...full, day: '' })).toEqual(['Day']);
  });
  test('LG-164: capacity 0 is not treated as missing', () => {
    expect(getMissingSessionFields({ ...full, capacity: 0 })).toEqual([]);
  });
  test('LG-165: a field with only spaces is missing', () => {
    expect(getMissingSessionFields({ ...full, location: '   ' })).toEqual(['Location']);
  });
  test('LG-166: several missing fields keep the form order', () => {
    expect(getMissingSessionFields({ ...full, status: null, day: undefined, campus: '' }))
      .toEqual(['Day', 'Campus', 'Status']);
  });
  test('LG-167: admin version also requires the unit', () => {
    expect(getMissingAdminSessionFields(full)).toEqual(['Unit']);
  });
  test('LG-168: admin version with unit given has nothing missing', () => {
    expect(getMissingAdminSessionFields({ ...full, unitId: 'u1' })).toEqual([]);
  });
});

describe('validateSessionInput (creating one session)', () => {
  const input = {
    day: 'MON', startTime: '10:00', endTime: '12:00', location: 'GP-P512', campus: 'GP',
    sessionType: 'Tutorial', capacity: '30', requiredTutors: '2', status: 'Confirmed'
  };

  test('LG-169: valid input passes and numbers are read', () => {
    expect(validateSessionInput(input)).toEqual({ error: null, capacityNumber: 30, requiredTutorsNumber: 2 });
  });
  test('LG-170: missing fields are listed in the error', () => {
    expect(validateSessionInput({ ...input, day: '', location: '' }).error)
      .toBe('Please fill in all fields before saving: Day, Location');
  });
  test('LG-171: capacity 0 or not a number is rejected', () => {
    expect(validateSessionInput({ ...input, capacity: '0' }).error).toBe('Capacity must be at least 1');
    expect(validateSessionInput({ ...input, capacity: 'abc' }).error).toBe('Capacity must be at least 1');
  });
  test('LG-172: tutor count below 1 is rejected', () => {
    expect(validateSessionInput({ ...input, requiredTutors: '0' }).error).toBe('Tutor must be at least 1');
  });
  test('LG-173: end time before start time is rejected (LOGIC-B4)', () => {
    expect(validateSessionInput({ ...input, startTime: '11:00', endTime: '10:00' }).error).toBeTruthy();
  });
  test('LG-174: end time equal to start time is rejected (LOGIC-B4)', () => {
    expect(validateSessionInput({ ...input, startTime: '10:00', endTime: '10:00' }).error).toBeTruthy();
  });
});

describe('formatSessionRow', () => {
  const session = { id: 's1', day: 'MON', start_time: '10:00:00', end_time: '12:00:00', required_tutors: 1 };
  const pending = { tutorId: 't1', tutorName: 'Amy', confirmed: null, rejectReason: null };
  const accepted = { tutorId: 't2', tutorName: 'Ben', confirmed: true, rejectReason: null };
  const declined = { tutorId: 't3', tutorName: 'Cat', confirmed: false, rejectReason: 'Clash' };

  test('LG-175: no tutors means not assigned', () => {
    const row = formatSessionRow({ ...session, tutors: [] });
    expect(row.isAssigned).toBe(false);
    expect(row.tutors).toEqual([]);
    expect(row.assignedTutorId).toBeNull();
  });
  test('LG-176: a pending tutor still fills the session', () => {
    expect(formatSessionRow({ ...session, tutors: [pending] }).isAssigned).toBe(true);
  });
  test('LG-177: a declined tutor is moved to declinedTutors and does not fill the session', () => {
    const row = formatSessionRow({ ...session, tutors: [declined] });
    expect(row.isAssigned).toBe(false);
    expect(row.tutors).toEqual([]);
    expect(row.declinedTutors).toEqual([declined]);
  });
  test('LG-178: legacy fields show the first tutor who has not declined', () => {
    const row = formatSessionRow({ ...session, tutors: [declined, accepted] });
    expect(row.assignedTutorId).toBe('t2');
    expect(row.assignedTutorName).toBe('Ben');
  });
  test('LG-179: tutorConfirmed follows the first active tutor, null when there is none', () => {
    expect(formatSessionRow({ ...session, tutors: [accepted] }).tutorConfirmed).toBe(true);
    expect(formatSessionRow({ ...session, tutors: [] }).tutorConfirmed).toBeNull();
  });
  test('LG-180: a session with 1 of 2 tutors still counts as assigned (Unassigned = no tutor, as in the User Manual)', () => {
    const row = formatSessionRow({ ...session, required_tutors: 2, tutors: [accepted] });
    expect(row.isAssigned).toBe(true);
  });
});

describe('formatCoveringSessionRow', () => {
  const s = {
    id: 's1', day: 'MON', start_time: '10:00:00', end_time: '12:00:00', tutors: [],
    cover_start_date: '2026-10-05', cover_end_date: '2026-10-18'
  };

  test('LG-181: marks the row as covering and keeps the cover dates', () => {
    const row = formatCoveringSessionRow(s);
    expect(row.isCovering).toBe(true);
    expect(row.coverStartDate).toBe('2026-10-05');
    expect(row.coverEndDate).toBe('2026-10-18');
  });
  test('LG-182: counts how many Mondays the cover period includes', () => {
    expect(formatCoveringSessionRow(s).coverOccurrenceCount).toBe(2);
  });
});

describe('buildConfirmationUpdate (tutor accepts or declines)', () => {
  test('LG-190: accepting needs no reason', () => {
    expect(buildConfirmationUpdate(true)).toEqual({ error: null, confirmed: true, rejectReason: null });
  });
  test('LG-191: declining with a reason keeps the trimmed reason', () => {
    expect(buildConfirmationUpdate(false, '  Clash with lab  ').rejectReason).toBe('Clash with lab');
  });
  test('LG-192: declining without a reason is rejected', () => {
    expect(buildConfirmationUpdate(false).error).toBe('Please provide a reason for declining');
  });
  test('LG-193: declining with only spaces is rejected', () => {
    expect(buildConfirmationUpdate(false, '   ').error).toBe('Please provide a reason for declining');
  });
  test('LG-194: missing "confirmed" value gives an error, not a crash (LOGIC-B6)', () => {
    expect(() => buildConfirmationUpdate(undefined, undefined)).not.toThrow();
    expect(buildConfirmationUpdate(undefined, undefined).error).toBeTruthy();
  });
});

describe('checkAssignSlot (room for one more tutor?)', () => {
  test('LG-195: the same tutor cannot be assigned twice', () => {
    const rows = [{ tutor_id: 't1', tutor_confirmed: null }];
    expect(checkAssignSlot(rows, 't1', 2)).toBe('This tutor is already assigned to this session');
  });
  test('LG-196: a full session is refused (declined tutors do not count)', () => {
    const rows = [{ tutor_id: 't1', tutor_confirmed: true }, { tutor_id: 't2', tutor_confirmed: false }];
    expect(checkAssignSlot(rows, 't3', 1)).toBe('This session already has its required 1 tutor(s) assigned');
    expect(checkAssignSlot(rows, 't3', 2)).toBeNull();
  });
  test('LG-197: missing required_tutors counts as 1', () => {
    expect(checkAssignSlot([], 't1', null)).toBeNull();
    expect(checkAssignSlot([{ tutor_id: 't1', tutor_confirmed: null }], 't2', null))
      .toBe('This session already has its required 1 tutor(s) assigned');
  });
});
