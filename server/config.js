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
    { id: 'openrouter', name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', auth: 'key', removable: false }
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
    { id: 'agent-pair', name: 'Pair', emoji: '🧑‍💻', icon: 'code', hue: 300, persona: 'You are a pair-programming partner. Think out loud, suggest approaches before coding, keep changes small and reversible, and check in when a decision has real tradeoffs.', model: null, provider: null, skills: [], useTools: true, builtin: true }
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
        // one-time migration: the Radiant bot now wears the swirl logo, not sparkles
        const icon = (a.id === 'agent-radiant' && a.icon === 'sparkles') ? 'radiant' : (a.icon || defById[a.id].icon)
        return { ...a, icon }
      })
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
