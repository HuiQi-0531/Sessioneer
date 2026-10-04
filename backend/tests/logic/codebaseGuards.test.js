// Guards for the two structural problems found in the code review.
//
// 1. "Testing a copy": many utils said "moved here unchanged" but no route
//    used them, so the logic tests checked a copy while the app ran another.
//    Every utils module must now be required by the app itself.
// 2. "Two calendars": nothing may read or write the old tutor columns on
//    sessions; session_tutors is the only record of who teaches what.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const list = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js')).map(f => `${dir}/${f}`);

const appFiles = ['server.js', 'db.js', ...list('routes'), ...list('middleware'), ...list('utils'), 'scripts/migrate.js'];
const appSource = appFiles.map(f => ({ file: f, text: read(f) }));

describe('every utils module is used by the running app (no untested copies)', () => {
  const utilNames = list('utils').map(f => path.basename(f, '.js'));
  test.each(utilNames)('LG-571: utils/%s is required by a route, server, middleware or another used util', (name) => {
    const users = appSource.filter(({ file, text }) =>
      file !== `utils/${name}.js` && new RegExp(`require\\(['"][./]*(?:utils/)?${name}['"]\\)`).test(text)
    );
    expect(users.map(u => u.file)).not.toHaveLength(0);
  });

  test('LG-572: no route still defines its own copy of a shared helper', () => {
    const shared = ['formatProfile', 'formatApplication', 'normaliseInvitedRole', 'formatNotification',
      'formatMessage', 'verifyCronSecret', 'formatAdminUser', 'formatAdminSession', 'normaliseSessionLabel',
      'getSessionComparableLabel', 'labelFromSessionValue', 'formatUnit', 'isAvailabilityLocked', 'buildSystemPrompt'];
    const copies = [];
    list('routes').forEach(file => {
      const text = read(file);
      shared.forEach(name => {
        if (new RegExp(`^const ${name} = `, 'm').test(text)) copies.push(`${file}: ${name}`);
      });
    });
    expect(copies).toEqual([]);
  });
});

describe('one assignment table (the paper calendar is gone)', () => {
  const legacy = /\b(assigned_tutor_id|is_assigned)\b|sessions\s+SET\s+[^;]*tutor_confirmed/i;
  test('LG-573: no backend code reads or writes the old sessions tutor columns', () => {
    const offenders = appSource
      .filter(({ file }) => file !== 'scripts/migrate.js')
      .filter(({ text }) => legacy.test(text.replace(/\/\/.*$/gm, '')))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
  test('LG-574: setup-db.sql has no tutor columns on sessions', () => {
    const sql = read('setup-db.sql');
    const sessionsTable = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS sessions ('), sql.indexOf(');', sql.indexOf('CREATE TABLE IF NOT EXISTS sessions (')));
    expect(sessionsTable).not.toMatch(/assigned_tutor_id|is_assigned|tutor_confirmed/);
  });
  test('LG-575: the migration removes the old columns from existing databases', () => {
    const sql = read('db/migrations/001_single_assignment_table.sql');
    ['assigned_tutor_id', 'is_assigned', 'tutor_confirmed', 'tutor_reject_reason'].forEach(col => {
      expect(sql).toMatch(new RegExp(`ALTER TABLE sessions DROP COLUMN IF EXISTS ${col}`));
    });
  });
  test('LG-576: server.js no longer changes the schema at start-up', () => {
    expect(read('server.js')).not.toMatch(/ALTER TABLE|CREATE TABLE/);
  });
});
