const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getCoordinatorUnitId, resolveUnitForUser, isUnitCoordinatorSql } = require('../utils/unitAccess');

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

const { buildSystemPrompt, filterRecentHistory, formatToolReply } = require('../utils/botRules');

// ---- Tools the bot is allowed to call ----
const tools = [
  {
    type: 'function',
    function: {
      name: 'list_unsubmitted_tutors',
      description: 'Look up which tutors on a unit have not submitted their availability yet. Only use when the user asks who has not submitted availability.',
      parameters: {
        type: 'object',
        properties: {
          unitCode: { type: 'string', description: 'Unit code, e.g. CAB201' }
        },
        required: ['unitCode']
      }
    }
  }
];

const listUnsubmittedTutors = async (unitCode, coordinatorId, activeUnitId) => {
  // The same code can exist in several semesters. If the UC is looking at a
  // unit with this code right now, use that one; otherwise prefer their newest.
  let unit = null;
  if (activeUnitId) {
    const active = await resolveUnitForUser({ unitId: activeUnitId }, coordinatorId);
    if (active && String(active.unit_code).trim().toUpperCase() === String(unitCode || '').trim().toUpperCase()) {
      unit = active;
    }
  }
  if (!unit) unit = await resolveUnitForUser({ unitCode }, coordinatorId);
  if (!unit) return { error: `Couldn't find a unit called "${unitCode}"` };

  const ownedUnitId = await getCoordinatorUnitId(unit.id, coordinatorId);
  if (!ownedUnitId) return { error: `You're not the coordinator for ${unitCode}, so you can't view this.` };

  const result = await pool.query(
    `
    SELECT TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name
    FROM users u
    JOIN unit_memberships um
      ON um.user_id = u.id AND um.unit_id = $1 AND um.role IN ('tutor', 'super_tutor')
    LEFT JOIN (
      SELECT DISTINCT tutor_id FROM availability WHERE is_submitted = TRUE AND unit_id = $1
    ) sub ON sub.tutor_id = u.id
    WHERE sub.tutor_id IS NULL
      AND NOT ${isUnitCoordinatorSql('u.id', '$1')}
    ORDER BY name
    `,
    [unit.id]
  );

  return { unitCode, unsubmittedTutors: result.rows.map(r => r.name) };
};

const executeTool = async (name, args, req) => {
  if (name === 'list_unsubmitted_tutors') return listUnsubmittedTutors(args.unitCode, req.user.id, req.body.activeUnitId);
  return { error: `Unknown tool: ${name}` };
};

// POST /bot/chat
// Body: { message: "...", history: [{ role: 'user'|'assistant', content: '...' }, ...] }
// `history` is the past turns of THIS conversation, sent by the frontend each
// time - Ollama itself has no memory between requests, so we resend it.
router.post('/chat', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Only keep the last 10 turns so the prompt stays small for the local model
    const recentHistory = filterRecentHistory(Array.isArray(history) ? history : []);

    const messages = [
      { role: 'system', content: buildSystemPrompt(message, recentHistory, req.user.role) },
      ...recentHistory,
      { role: 'user', content: message }
    ];

    const ollamaRes = await fetch(OLLAMA_URL, {
      method: 'POST',
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        tools,
        stream: false,
        options: {
          temperature: 0.2, // low = sticks to the facts instead of making things up
          num_ctx: 8192     // Ollama's default window is too small for the manual sections
        }
      })
    });

    if (!ollamaRes.ok) {
      return res.status(502).json({ error: 'Bot is unavailable right now - is Ollama running?' });
    }

    const data = await ollamaRes.json();
    const msg = data.message || {};

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const call = msg.tool_calls[0];
      const args = typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments || '{}')
        : (call.function.arguments || {});
      const result = await executeTool(call.function.name, args, req);
      const reply = formatToolReply(result);
      return res.json({ reply });
    }

    return res.json({ reply: msg.content });
  } catch (error) {
    console.error('Bot chat error:', error);
    res.status(500).json({ error: 'Something went wrong on the bot side' });
  }
});

module.exports = router;