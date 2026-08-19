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
  settings: {
    mode: 'dark',
    themeId: 'steel',
    customHue: 45,
    customChroma: 0.19,
    approveCommands: true,
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
        return { id: s.id, title: s.title, model: s.model, provider: s.provider, cwd: s.cwd, updatedAt: s.updatedAt, messageCount: s.messages.length }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
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
