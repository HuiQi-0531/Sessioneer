// Helpers that talk to the database, checked with a fake client so no real
// database is needed: unit lookup by code, deleting a unit, the edit-clash
// check, and applying an approved swap without touching old columns.
jest.mock('../../db', () => ({ query: jest.fn() }));
const { resolveUnitForUser, isTutorLinkedToUnit } = require('../../utils/unitAccess');
const { deleteUnitCascade } = require('../../utils/unitRules');
const { findEditClash } = require('../../utils/allocationRules');
const { applyApprovedChangeRequest } = require('../../utils/applyChangeRequest');

const fakeClient = (handler) => {
  const calls = [];
  return {
    calls,
    query: jest.fn(async (sql, params) => {
      calls.push({ sql, params });
      return handler ? handler(sql, params) : { rows: [] };
    }),
    release: jest.fn()
  };
};

describe('resolveUnitForUser', () => {
  test('LG-559: a unitId is looked up directly', async () => {
    const client = fakeClient(() => ({ rows: [{ id: 'u-id', unit_code: 'CAB201' }] }));
    const unit = await resolveUnitForUser({ unitId: 'u-id', unitCode: 'IGNORED' }, 'user', client);
    expect(unit.id).toBe('u-id');
    expect(client.calls[0].params).toEqual(['u-id']);
  });
  test('LG-560: a unit code prefers units the user belongs to, newest first', async () => {
    const client = fakeClient(() => ({ rows: [{ id: 'mine' }] }));
    await resolveUnitForUser({ unitCode: 'cab201' }, 'user-1', client);
    expect(client.calls[0].sql).toMatch(/ORDER BY is_linked DESC, u\.year DESC/);
    expect(client.calls[0].params).toEqual(['cab201', 'user-1']);
  });
  test('LG-561: no id and no code gives null without a query', async () => {
    const client = fakeClient();
    expect(await resolveUnitForUser({}, 'user', client)).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('isTutorLinkedToUnit', () => {
  test('LG-562: reads assignments from session_tutors, not sessions.assigned_tutor_id', async () => {
    const client = fakeClient(() => ({ rows: [{ '?column?': 1 }] }));
    expect(await isTutorLinkedToUnit('t1', 'u1', client)).toBe(true);
    expect(client.calls[0].sql).toMatch(/session_tutors/);
    expect(client.calls[0].sql).not.toMatch(/assigned_tutor_id/);
  });
  test('LG-563: missing ids are not linked', async () => {
    expect(await isTutorLinkedToUnit(null, 'u1', fakeClient())).toBe(false);
  });
});

describe('deleteUnitCascade', () => {
  test('LG-564: children are deleted before the unit, inside one transaction', async () => {
    const client = fakeClient((sql) => (sql.startsWith('SELECT to_regclass') ? { rows: [{ t: 'x' }] } : { rows: [] }));
    await deleteUnitCascade(client, 'unit-1');
    const statements = client.calls.map(c => c.sql).filter(sql => !sql.startsWith('SELECT to_regclass'));
    const order = (pattern) => statements.findIndex(sql => pattern.test(sql));
    expect(order(/DELETE FROM session_tutors/)).toBeLessThan(order(/DELETE FROM sessions/));
    expect(order(/DELETE FROM cover_requests/)).toBeLessThan(order(/DELETE FROM sessions/));
    expect(order(/DELETE FROM availability/)).toBeLessThan(order(/DELETE FROM units/));
    expect(statements[statements.length - 1]).toBe('DELETE FROM units WHERE id = $1');
  });
  test('LG-565: tables that do not exist are skipped', async () => {
    const client = fakeClient((sql, params) => {
      if (sql.startsWith('SELECT to_regclass')) {
        return { rows: [{ t: /swap_requests|session_assign/.test(params[0]) ? null : 'x' }] };
      }
      return { rows: [] };
    });
    await deleteUnitCascade(client, 'unit-1');
    expect(client.calls.some(c => /DELETE FROM swap_requests/.test(c.sql))).toBe(false);
  });
  test('LG-566: when given a pool it opens, commits and releases its own client', async () => {
    const client = fakeClient((sql) => (sql.startsWith('SELECT to_regclass') ? { rows: [{ t: 'x' }] } : { rows: [] }));
    delete client.release;
    const inner = { ...client, release: jest.fn() };
    const pool = { connect: jest.fn(async () => inner) };
    await deleteUnitCascade(pool, 'unit-1');
    expect(client.calls[0].sql).toBe('BEGIN');
    expect(client.calls[client.calls.length - 1].sql).toBe('COMMIT');
    expect(inner.release).toHaveBeenCalled();
  });
  test('LG-567: an error rolls back and is passed on', async () => {
    const client = fakeClient((sql) => {
      if (sql.startsWith('SELECT to_regclass')) return { rows: [{ t: 'x' }] };
      if (/DELETE FROM sessions/.test(sql)) throw new Error('boom');
      return { rows: [] };
    });
    delete client.release;
    const inner = { ...client, release: jest.fn() };
    await expect(deleteUnitCascade({ connect: async () => inner }, 'unit-1')).rejects.toThrow('boom');
    expect(client.calls.some(c => c.sql === 'ROLLBACK')).toBe(true);
    expect(inner.release).toHaveBeenCalled();
  });
});

describe('findEditClash (moving a session that already has tutors)', () => {
  test('LG-568: moving onto a tutor\'s other session is reported with their name', async () => {
    const client = fakeClient(() => ({
      rows: [{ day: 'TUE', start_time: '10:00:00', end_time: '11:00:00', unit_code: 'IFB102', tutor_name: 'Sarah Kim' }]
    }));
    expect(await findEditClash(client, 's1', 'TUE', '10:30', '11:30'))
      .toBe('Sarah Kim already has an overlapping session in IFB102 at that time');
  });
  test('LG-569: a free slot is fine', async () => {
    const client = fakeClient(() => ({
      rows: [{ day: 'TUE', start_time: '10:00:00', end_time: '11:00:00', unit_code: 'IFB102', tutor_name: 'Sarah Kim' }]
    }));
    expect(await findEditClash(client, 's1', 'WED', '10:30', '11:30')).toBeNull();
  });
});

describe('applyApprovedChangeRequest only uses session_tutors', () => {
  test('LG-570: a "change" request removes the tutor without writing to sessions', async () => {
    const client = fakeClient((sql) => {
      if (/schedule_locked/.test(sql)) return { rows: [{ schedule_locked: false }] };
      if (/SELECT tutor_id\s+FROM session_tutors/.test(sql)) return { rows: [{ tutor_id: 't1' }] };
      return { rows: [] };
    });
    const result = await applyApprovedChangeRequest(client, {
      tutor_id: 't1', unit_id: 'u1', request_type: 'Session change', current_session_id: 's1'
    });
    expect(result).toEqual({ action: 'unassigned', fromSessionId: 's1' });
    expect(client.calls.some(c => /UPDATE sessions/.test(c.sql))).toBe(false);
    expect(client.calls.some(c => /DELETE FROM session_tutors/.test(c.sql))).toBe(true);
  });
});
