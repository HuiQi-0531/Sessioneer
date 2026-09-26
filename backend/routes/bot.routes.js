const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getCoordinatorUnitId } = require('../utils/unitAccess');

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';

const { OVERVIEW, searchKnowledge } = require('../bot/knowledge');

// How the bot should behave. The facts about Sessioneer come from
// backend/bot/knowledge.js (written from the User Manual) - edit that file to
// teach the bot new things.
const RULES = `You are Sessioneer Bot, the help assistant built into Sessioneer.

Rules:
- Answer ONLY using the "Sessioneer facts" below. Never invent pages, buttons or features that are not in them.
- If the facts don't cover the question, say you're not sure and suggest where in the sidebar to look or to ask an admin. Do not guess.
- Give step-by-step directions using the exact page and button names in quotes, e.g. Sessions -> "Request Cover".
- If the user wants to know which tutors haven't submitted availability, call the list_unsubmitted_tutors tool.
- If the question is vague (which unit? which session?), ask one short follow-up question.
- Keep replies short and friendly: a few lines or a short numbered list, not an essay.
- Reply in the same language the user wrote in (English or Chinese). Keep page and button names in English.`;

const ROLE_NAMES = { coordinator: 'Unit Coordinator', tutor: 'Tutor', admin: 'Admin' };

// Build the system prompt for this question: rules + overview + the few manual
// sections that match what the user asked.
const buildSystemPrompt = (message, history, role) => {
  // Include the previous user message too, so follow-ups like "and then?" still find the right topic
  const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
  const query = lastUserMsg ? `${message} ${lastUserMsg.content}` : message;
  const sections = searchKnowledge(query, role, 4);

  const facts = sections.length
    ? sections.map(s => `### ${s.title}\n${s.content}`).join('\n\n')
    : '(No specific section matched this question. Only use the overview above.)';

  return `${RULES}

The user is logged in as: ${ROLE_NAMES[role] || role}.

Sessioneer facts - overview:
${OVERVIEW}

Sessioneer facts - relevant manual sections:
${facts}`;
};

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

const listUnsubmittedTutors = async (unitCode, coordinatorId) => {
  const unitResult = await pool.query(
    'SELECT id FROM units WHERE unit_code = $1 LIMIT 1',
    [unitCode]
  );
  const unit = unitResult.rows[0];
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
      SELECT DISTINCT tutor_id FROM availability WHERE is_submitted = TRUE
    ) sub ON sub.tutor_id = u.id
    WHERE sub.tutor_id IS NULL
    ORDER BY name
    `,
    [unit.id]
  );

  return { unitCode, unsubmittedTutors: result.rows.map(r => r.name) };
};

const executeTool = async (name, args, req) => {
  if (name === 'list_unsubmitted_tutors') return listUnsubmittedTutors(args.unitCode, req.user.id);
  return { error: `Unknown tool: ${name}` };
};

// POST /bot/chat
// Body: { message: "...", history: [{ role: 'user'|'assistant', content: '...' }, ...] }
// `history` is the past turns of THIS conversation, sent by the frontend each
// time - Ollama itself has no memory between requests, so we resend it.
router.post('/chat', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Only keep the last 10 turns so the prompt stays small for the local model
    const recentHistory = history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10);

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
    const msg = data.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const call = msg.tool_calls[0];
      const result = await executeTool(call.function.name, call.function.arguments, req);
      // Turn the raw tool result into a short natural-language reply so the
      // widget always shows plain text, not a JSON blob.
      const reply = result.error
        ? result.error
        : ((result.unsubmittedTutors
            ? (result.unsubmittedTutors.length
                ? `Tutors on ${result.unitCode} who haven't submitted availability: ${result.unsubmittedTutors.join(', ')}`
                : `Everyone on ${result.unitCode} has submitted their availability.`)
            : JSON.stringify(result)));
      return res.json({ reply });
    }

    return res.json({ reply: msg.content });
  } catch (error) {
    console.error('Bot chat error:', error);
    res.status(500).json({ error: 'Something went wrong on the bot side' });
  }
});

module.exports = router;