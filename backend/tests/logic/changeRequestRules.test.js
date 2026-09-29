const { applyApprovedChangeRequest } = require('../../utils/applyChangeRequest');
const { resolveTutorRequestStatus, shouldApplyChange } = require('../../utils/changeRequestRules');

// A fake database client: answers each query from simple in-memory data and
// records what was written. No real database is used.
const makeClient = ({ tutorsBySession = {}, sessions = {}, maxHours = null, isSuper = false }) => {
  const writes = [];
  const query = jest.fn(async (sql, params) => {
    if (sql.includes('SELECT schedule_locked')) return { rows: [{ schedule_locked: false }] };
    if (sql.includes('SELECT tutor_id') && sql.includes('FROM session_tutors')) {
      return { rows: (tutorsBySession[params[0]] || []).map(tutor_id => ({ tutor_id })) };
    }
    if (sql.startsWith('SELECT * FROM sessions')) return { rows: sessions[params[0]] ? [sessions[params[0]]] : [] };
    if (sql.includes('maximum_hours')) return { rows: [{ maximum_hours: maxHours, is_super_tutor: isSuper }] };
    if (sql.includes('JOIN session_tutors st')) return { rows: [] };
    writes.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
    return { rows: [] };
  });
  return { query, writes };
};
const base = { tutor_id: 't1', unit_id: 'u1', current_session_id: 'A' };
const target = { id: 'B', day: 'WED', start_time: '10:00:00', end_time: '12:00:00', required_tutors: 1, session_type: 'Tutorial' };

describe('applyApprovedChangeRequest (fake database)', () => {
  test('LG-225: a "change" request removes the tutor from their session', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t1'] } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Change' }))
      .resolves.toEqual({ action: 'unassigned', fromSessionId: 'A' });
  });
  test('LG-226: a swap with no target session is refused', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t1'] } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Swap' }))
      .rejects.toThrow('This swap has no target session');
  });
  test('LG-227: target is the same session → nothing changes', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t1'] } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Swap', preferred_session_id: 'A' }))
      .resolves.toEqual({ action: 'unchanged', fromSessionId: 'A' });
  });
  test('LG-228: tutor no longer on the current session is refused', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t9'] } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Swap', preferred_session_id: 'B' }))
      .rejects.toThrow('This tutor is no longer assigned to the current session');
  });
  test('LG-229: tutor already on the target is just removed from the old session', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t1'], B: ['t1'] }, sessions: { B: target } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Swap', preferred_session_id: 'B' }))
      .resolves.toEqual({ action: 'already_on_target', fromSessionId: 'A', toSessionId: 'B' });
  });
  test('LG-230: a full target session is refused (no forced swap)', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t1'], B: ['t2'] }, sessions: { B: target } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Swap', preferred_session_id: 'B' }))
      .rejects.toThrow('This session already has a tutor and is full');
  });
  test('LG-231: a free target session moves the tutor', async () => {
    const client = makeClient({ tutorsBySession: { A: ['t1'], B: [] }, sessions: { B: target } });
    await expect(applyApprovedChangeRequest(client, { ...base, request_type: 'Session Swap', preferred_session_id: 'B' }))
      .resolves.toEqual({ action: 'moved', fromSessionId: 'A', toSessionId: 'B' });
  });
});

describe('resolveTutorRequestStatus', () => {
  test('LG-232: rejecting a coordinator suggestion sends the request back to Pending', () => {
    expect(resolveTutorRequestStatus('Suggested', 'Rejected')).toBe('Pending');
  });
  test('LG-233: any other status is kept as sent', () => {
    expect(resolveTutorRequestStatus('Pending', 'Rejected')).toBe('Rejected');
    expect(resolveTutorRequestStatus('Suggested', 'Accepted')).toBe('Accepted');
  });
  test('LG-234: the check ignores upper/lower case', () => {
    expect(resolveTutorRequestStatus('SUGGESTED', 'rejected')).toBe('Pending');
  });
});

describe('shouldApplyChange', () => {
  test('LG-235: accepting applies the change', () => {
    expect(shouldApplyChange('accepted', 'Suggested')).toBe(true);
  });
  test('LG-236: editing an already-accepted request without a new status does not apply it again (LOGIC-B11)', () => {
    expect(shouldApplyChange(undefined, 'Accepted')).toBe(false);
  });
  test('LG-237: pending does not apply anything', () => {
    expect(shouldApplyChange('Pending', 'Suggested')).toBe(false);
  });
});
