const { buildSystemPrompt, filterRecentHistory, formatToolReply } = require('../../utils/botRules');
const { tokenize, searchKnowledge } = require('../../bot/knowledge');

describe('buildSystemPrompt', () => {
  test('LG-436: a follow-up question also searches the previous question', () => {
    const prompt = buildSystemPrompt('and then?', [{ role: 'user', content: 'how do I request cover' }], 'coordinator');
    expect(prompt).toContain('### Request cover for a tutor (UC)');
  });
  test('LG-437: the user\'s role is named in the prompt', () => {
    expect(buildSystemPrompt('dashboard', [], 'coordinator')).toContain('The user is logged in as: Unit Coordinator.');
  });
  test('LG-438: nothing matched → the bot is told to use only the overview', () => {
    expect(buildSystemPrompt('xyzzy', [], 'tutor')).toContain('(No specific section matched this question. Only use the overview above.)');
  });
});

describe('filterRecentHistory', () => {
  test('LG-439: keeps only the last 10 turns', () => {
    const history = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const kept = filterRecentHistory(history);
    expect(kept).toHaveLength(10);
    expect(kept[0].content).toBe('m4');
  });
  test('LG-440: drops turns that are not from user or assistant', () => {
    expect(filterRecentHistory([{ role: 'system', content: 'x' }, { role: 'user', content: 'hi' }])).toEqual([{ role: 'user', content: 'hi' }]);
  });
  test('LG-441: drops turns whose content is not text', () => {
    expect(filterRecentHistory([{ role: 'user', content: { a: 1 } }])).toEqual([]);
  });
});

describe('formatToolReply', () => {
  test('LG-442: an error is shown as the reply', () => {
    expect(formatToolReply({ error: "Couldn't find a unit called \"X\"" })).toBe("Couldn't find a unit called \"X\"");
  });
  test('LG-443: lists the tutors who have not submitted', () => {
    expect(formatToolReply({ unitCode: 'CAB201', unsubmittedTutors: ['Amy', 'Ben'] }))
      .toBe("Tutors on CAB201 who haven't submitted availability: Amy, Ben");
  });
  test('LG-444: everyone submitted', () => {
    expect(formatToolReply({ unitCode: 'CAB201', unsubmittedTutors: [] })).toBe('Everyone on CAB201 has submitted their availability.');
  });
});

describe('tokenize', () => {
  test('LG-445: lowercases and splits on anything that is not a letter or number', () => {
    expect(tokenize('Request-Cover NOW')).toEqual(['request', 'cover', 'now']);
  });
  test('LG-446: common words are removed', () => {
    expect(tokenize('how do I add a session')).toEqual(['add', 'session']);
  });
  test('LG-447: one-letter words are removed', () => {
    expect(tokenize('x y session')).toEqual(['session']);
  });
});

describe('searchKnowledge', () => {
  const ids = (q, role, limit = 4) => searchKnowledge(q, role, limit).map(s => s.id);

  test('LG-448: an English keyword finds its section', () => {
    expect(ids('how do I upload a csv', 'coordinator')).toContain('uc_upload_session');
  });
  test('LG-449: a Chinese keyword finds its section', () => {
    expect(ids('怎么代课', 'coordinator')).toContain('uc_request_cover');
  });
  test('LG-450: a multi-word keyword ranks above a single word', () => {
    expect(ids('request cover', 'coordinator')[0]).toBe('uc_request_cover');
  });
  test('LG-451: on a tie, the asker\'s own role comes first', () => {
    expect(ids('dashboard', 'tutor')[0]).toBe('tutor_dashboard');
    expect(ids('dashboard', 'coordinator')[0]).toBe('uc_dashboard');
  });
  test('LG-452: the result limit is respected', () => {
    expect(searchKnowledge('request cover swap', 'coordinator', 1)).toHaveLength(1);
  });
  test('LG-453: nothing matching gives no sections', () => {
    expect(searchKnowledge('xyzzy', 'coordinator')).toEqual([]);
  });
  test('LG-454: an admin question does not pull in Messages because "dm" is inside "admin" (LOGIC-B18)', () => {
    expect(ids('How do I disable a user in admin?', 'coordinator')).not.toContain('uc_messages');
  });
});
