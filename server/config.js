import fs from 'fs'
import path from 'path'
import os from 'os'

export const RADIANT_DIR = path.join(os.homedir(), '.radiant')
export const SESSIONS_DIR = path.join(RADIANT_DIR, 'sessions')
const CONFIG_PATH = path.join(RADIANT_DIR, 'config.json')

const DEFAULT_CONFIG = {
  providers: [
    { id: 'anthropic', name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com', auth: 'key', removable: false },
    { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', auth: 'key', removable: false },
    { id: 'ollama', name: 'Ollama (local)', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', auth: 'none', removable: false },
    { id: 'lmstudio', name: 'LM Studio (local)', type: 'openai', baseUrl: 'http://127.0.0.1:1234/v1', auth: 'none', removable: false },
    { id: 'openrouter', name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', auth: 'key', removable: false },
    { id: 'nousresearch', name: 'Nous Portal', type: 'openai', baseUrl: 'https://inference-api.nousresearch.com/v1', auth: 'key', removable: false, hint: 'Sign in with your Nous Portal subscription below — or paste an API key from portal.nousresearch.com → API Keys.' }
  ],
  keys: {},
  oauth: {},
  mcpServers: [],
  skills: [
    { id: 'seed-commits', name: 'Conventional commits', description: 'Commit messages in Conventional Commits format.', content: 'When writing git commit messages, use Conventional Commits format (feat:, fix:, docs:, refactor:, chore:, test:) — a concise summary line, and a short body only when it adds value.', enabled: false },
    { id: 'seed-plan', name: 'Plan before acting', description: 'State a brief plan before non-trivial changes.', content: 'Before making non-trivial changes, state your plan in 1–2 sentences, then carry it out. Keep the user oriented on what you are about to do.', enabled: false },
    { id: 'seed-minimal', name: 'Minimal diffs', description: 'Smallest change that solves the problem.', content: 'Make the smallest change that solves the problem. Match the surrounding code style and conventions. Do not refactor or reformat unrelated code.', enabled: false }
  ],
  agents: [
    { id: 'agent-radiant', name: 'Radiant', emoji: '✦', icon: 'radiant', hue: 258, persona: '', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-reviewer', name: 'Reviewer', emoji: '🔍', icon: 'search', hue: 25, persona: 'You are a meticulous senior code reviewer. Hunt for bugs, edge cases, security issues, race conditions, and unclear code. Be specific — cite files and lines. Prioritize correctness over style, and call out what you are NOT sure about.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-architect', name: 'Architect', emoji: '📐', icon: 'compass', hue: 200, persona: 'You are a software architect. Before writing code, think about structure, boundaries, data flow, and tradeoffs. Propose a design, note alternatives, and only then implement. Favor simple, evolvable designs.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-explainer', name: 'Explainer', emoji: '💡', icon: 'bulb', hue: 90, persona: 'You explain code and concepts clearly for someone learning. Use plain language, small examples, and analogies. Read the code first, then teach it top-down. Prefer clarity over completeness.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-pair', name: 'Coder', emoji: '🧑‍💻', icon: 'code', hue: 300, persona: 'You are a hands-on implementer. Given a task, write the code and make it work. Follow the existing patterns and style in the repo, keep changes small and focused, add or update tests, and run/verify your changes when practical. Unlike the Architect, you optimize for shipping working code now, not for exploring the design space — if the approach is unclear, pick the simplest one that fits and note the tradeoff briefly.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-security', name: 'Security', emoji: '🛡️', icon: 'shield', hue: 15, persona: 'You are an application security engineer. Review code and designs for vulnerabilities — injection, broken auth/authorization, secrets handling, SSRF, XSS/CSRF, insecure dependencies, unsafe deserialization, path traversal. For each issue explain the risk, how it could be exploited, and the concrete fix. Cite OWASP categories where relevant, and be clear about what you are and are not sure about.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-sales', name: 'Sales', emoji: '📣', icon: 'megaphone', hue: 40, persona: 'You help with sales and go-to-market. Write clear, persuasive outreach, positioning, and proposals; qualify leads; and reason about value propositions, objections, and pricing. Keep it concise and benefit-focused, tailor to the audience, and avoid hype and jargon.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-design', name: 'Design', emoji: '🎨', icon: 'palette', hue: 325, persona: 'You are a product and UI/UX designer. Think about clarity, hierarchy, spacing, and flow before aesthetics. Give concrete, actionable feedback and propose specific layouts, components, states, and copy. Favor simple, accessible, consistent design; explain the reasoning behind each choice.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-education', name: 'Education', emoji: '🎓', icon: 'cap', hue: 130, persona: 'You are a patient teacher. Break topics into small steps, use plain language and concrete examples, and build from the fundamentals. Check the learner\'s understanding, adapt to their level, and prefer clarity over completeness. Encourage, and never make the learner feel behind.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-finance', name: 'Finance', emoji: '📈', icon: 'chart', hue: 160, persona: 'You help with finance and quantitative analysis — budgets, models, unit economics, forecasts, and tradeoffs. State your assumptions, show the calculations, sanity-check the numbers, flag risks, and give a clear bottom line. You are not a licensed financial advisor; say so if asked for personalized investment advice.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-devops', name: 'DevOps', emoji: '⚙️', icon: 'wrench', hue: 195, persona: 'You are a DevOps / SRE engineer. Handle builds, CI/CD, containers, infrastructure-as-code, deployment, monitoring, and reliability. Prefer reproducible, automated, observable setups; think about failure modes, rollbacks, and least privilege; and give exact commands and config.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-data', name: 'Data', emoji: '📊', icon: 'flask', hue: 175, persona: 'You are a data analyst. Explore data, write correct SQL and analysis code, verify your assumptions, and explain findings plainly with their caveats and confidence. Prefer reproducible analysis; when you make a chart, keep it simple and labeled.', model: null, provider: null, skills: [], useTools: true, builtin: true },
    { id: 'agent-docs', name: 'Docs', emoji: '📖', icon: 'book', hue: 65, persona: 'You are a technical writer. Produce clear, accurate documentation — READMEs, API references, guides, and inline comments. Read the code first, write for the reader\'s level, use examples, and keep it concise and well-structured with good headings.', model: null, provider: null, skills: [], useTools: true, builtin: true }
  ],
  settings: {
    mode: 'dark',
    themeId: 'steel',
    customHue: 45,
    customChroma: 0.19,
    fontFamily: 'inter',
    uiScale: 1,
    customTint: 1,
    motionBg: 'off',
    approveCommands: true,
    autoUpdateCheck: true,
    defaultModel: null,
    defaultCwd: os.homedir()
  }
}

function ensureDirs () {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

export function loadConfig () {
  ensureDirs()
  let cfg = structuredClone(DEFAULT_CONFIG)
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    // merge: keep default providers up to date, preserve user additions and keys
    const byId = Object.fromEntries((saved.providers || []).map(p => [p.id, p]))
    cfg.providers = cfg.providers.map(p => ({ ...p, ...(byId[p.id] ? { baseUrl: byId[p.id].baseUrl } : {}) }))
    for (const p of saved.providers || []) {
      if (!cfg.providers.find(d => d.id === p.id)) cfg.providers.push(p)
    }
    cfg.keys = saved.keys || {}
    cfg.oauth = saved.oauth || {}
    if (saved.skills) cfg.skills = saved.skills
    if (saved.agents) {
      // backfill new built-in fields (e.g. icon) onto saved built-in agents
      const defById = Object.fromEntries(cfg.agents.map(a => [a.id, a]))
      cfg.agents = saved.agents.map(a => {
        if (!(a.builtin && defById[a.id])) return a
        const def = defById[a.id]
        // one-time migration: the Radiant agent now wears the swirl logo, not sparkles
        const icon = (a.id === 'agent-radiant' && a.icon === 'sparkles') ? 'radiant' : (a.icon || def.icon)
        // one-time migration: "Pair" became "Coder" (only if the user hasn't renamed it)
        const migratePair = a.id === 'agent-pair' && a.name === 'Pair'
        const name = migratePair ? def.name : a.name
        const persona = (migratePair && /^You are a pair-programming partner/.test(a.persona || '')) ? def.persona : a.persona
        return { ...a, icon, name, persona }
      })
      // add any new built-in agents that didn't exist when this config was saved
      const haveIds = new Set(cfg.agents.map(a => a.id))
      for (const def of Object.values(defById)) if (!haveIds.has(def.id)) cfg.agents.push(def)
    }
    if (saved.mcpServers) cfg.mcpServers = saved.mcpServers
    cfg.settings = { ...cfg.settings, ...(saved.settings || {}) }
  } catch { /* first run */ }
  return cfg
}

export function saveConfig (cfg) {
  ensureDirs()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

// Public view: never expose key material to the browser.
export function publicConfig (cfg) {
  return {
    providers: cfg.providers.map(p => ({
      ...p,
      hasKey: p.auth === 'none' || Boolean(cfg.keys[p.id]),
      signedIn: Boolean(cfg.oauth[p.id])
    })),
    skills: cfg.skills || [],
    agents: cfg.agents || [],
    mcpServers: cfg.mcpServers || [],
    settings: cfg.settings
  }
}

// ---- sessions ----
export function listSessions () {
  ensureDirs()
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'))
        return { id: s.id, title: s.title, model: s.model, provider: s.provider, cwd: s.cwd, agentId: s.agentId || null, pinned: Boolean(s.pinned), updatedAt: s.updatedAt, messageCount: s.messages.length }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

// Full-text search across all past sessions (title + message text).
export function searchSessions (query, limit = 30) {
  ensureDirs()
  const q = String(query || '').toLowerCase().trim()
  if (!q) return []
  const out = []
  for (const f of fs.readdirSync(SESSIONS_DIR)) {
    if (!f.endsWith('.json')) continue
    let s
    try { s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')) } catch { continue }
    const texts = []
    for (const m of s.messages || []) {
      if (m.text) texts.push(m.text)
      for (const p of m.parts || []) if (p.type === 'text' && p.text) texts.push(p.text)
    }
    const hay = ((s.title || '') + '\n' + texts.join('\n')).toLowerCase()
    const idx = hay.indexOf(q)
    if (idx === -1) continue
    const snippet = hay.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, ' ').trim()
    out.push({ id: s.id, title: s.title || 'Untitled', snippet, updatedAt: s.updatedAt, messageCount: (s.messages || []).length })
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, limit)
}

export function loadSession (id) {
  if (!/^[a-z0-9-]+$/.test(id)) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id + '.json'), 'utf8'))
  } catch { return null }
}

export function saveSession (session) {
  ensureDirs()
  session.updatedAt = new Date().toISOString()
  fs.writeFileSync(path.join(SESSIONS_DIR, session.id + '.json'), JSON.stringify(session, null, 2))
}

export function deleteSession (id) {
  if (!/^[a-z0-9-]+$/.test(id)) return
  try { fs.unlinkSync(path.join(SESSIONS_DIR, id + '.json')) } catch {}
}
