import crypto from 'crypto'

// Skillsmith: after a turn, look at what just happened and — if the user did
// something reusable — draft a SKILL proposal for them to approve. Inspired by
// Hermes' background skill review and OpenClaw's "skill workshop": skills are
// procedural know-how (how to do a thing), distinct from memory (facts). Unlike
// those, Radiant never writes a skill without the user's explicit approval — a
// proposal waits in Settings → Skills until the user clicks Add or Reject.

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Is this turn worth reflecting on? Cheap gate before spending an LLM call.
// Worth it when the turn was procedural (used tools / multiple steps) or when
// the user corrected the agent's approach (a strong "capture this" signal).
export function shouldReflect (lastUser, lastAsst) {
  const toolCalls = (lastAsst?.parts || []).filter(p => p.type === 'tool' && !p.widget && p.name !== 'todo_write')
  if (toolCalls.length >= 2) return true
  const t = (lastUser?.text || '').toLowerCase()
  if (/\b(no,|don'?t|stop|actually|instead|always|never|not like that|that'?s wrong|from now on)\b/.test(t)) return true
  return false
}

export function reflectionPrompt (exchange, existingSkills) {
  const have = existingSkills.length
    ? existingSkills.map(s => `- ${s.name}: ${s.description || ''}`).join('\n')
    : '(none yet)'
  return `You review a coding assistant's work and decide whether a REUSABLE SKILL should be captured. A skill is procedural know-how — HOW to do a recurring task — that the assistant can reuse later. This is different from a one-off memory fact.

Propose a skill ONLY when the exchange shows one of:
- a multi-step process worth turning into a repeatable playbook,
- the user correcting the assistant's workflow or style ("stop doing X", "always Y", "just give me Z"),
- a non-trivial technique, workaround, or debugging path that emerged,
- the user clearly repeating something they do often.

Do NOT propose a skill for trivial Q&A, a truly one-off request, or anything already covered by an existing skill below.

Existing skills:
${have}

Recent exchange:
${exchange}

If a skill is genuinely warranted, respond with ONLY a JSON object (no prose, no code fence):
{"name":"short-kebab-case-name","description":"one line, under 80 chars, what the skill does","rationale":"one sentence: what you noticed that makes this worth saving","content":"the skill as markdown — a short intro, a **When to use** line, then numbered steps for the procedure, and a **Watch out for** note if relevant"}

Otherwise respond with exactly: none`
}

// Parse the model's reply into a proposal, or null.
export function parseProposal (text) {
  if (!text) return null
  const t = text.trim()
  if (/^none\b/i.test(t)) return null
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  let obj
  try { obj = JSON.parse(m[0]) } catch { return null }
  const name = (obj.name || '').trim()
  const description = (obj.description || '').trim()
  const content = (obj.content || '').trim()
  const rationale = (obj.rationale || '').trim()
  if (!name || !content) return null
  return { name, description, content, rationale }
}

// Store a proposal as a pending suggestion, deduped against existing skills,
// already-pending suggestions, and things the user has rejected before.
export function addSuggestion (config, proposal, sessionId) {
  const key = norm(proposal.name)
  config.skills = config.skills || []
  config.skillSuggestions = config.skillSuggestions || []
  config.rejectedSkills = config.rejectedSkills || []
  if (config.rejectedSkills.includes(key)) return null
  if (config.skills.some(s => norm(s.name) === key)) return null
  if (config.skillSuggestions.some(s => norm(s.name) === key)) return null
  const suggestion = {
    id: 'sug-' + crypto.randomBytes(4).toString('hex'),
    name: proposal.name,
    description: proposal.description,
    content: proposal.content,
    rationale: proposal.rationale,
    sessionId: sessionId || null,
    createdAt: new Date().toISOString(),
    status: 'pending'
  }
  config.skillSuggestions.push(suggestion)
  return suggestion
}
