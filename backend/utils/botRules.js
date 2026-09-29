// Bot logic moved here unchanged from bot.routes.js.
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

// Only keep the last 10 turns so the prompt stays small for the local model
const filterRecentHistory = (history) => history
  .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  .slice(-10);

// Turn the raw tool result into a short natural-language reply so the
// widget always shows plain text, not a JSON blob.
const formatToolReply = (result) => (result.error
  ? result.error
  : ((result.unsubmittedTutors
      ? (result.unsubmittedTutors.length
          ? `Tutors on ${result.unitCode} who haven't submitted availability: ${result.unsubmittedTutors.join(', ')}`
          : `Everyone on ${result.unitCode} has submitted their availability.`)
      : JSON.stringify(result))));

module.exports = { RULES, ROLE_NAMES, buildSystemPrompt, filterRecentHistory, formatToolReply };
