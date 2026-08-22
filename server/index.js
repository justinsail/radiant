import express from 'express'
import http from 'http'
import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import { execSync, spawn } from 'child_process'
import { loadConfig, saveConfig, publicConfig, listSessions, loadSession, saveSession, deleteSession, searchSessions, upsertCredential, activateAccount, removeAccount, SESSIONS_DIR } from './config.js'
import { runTurn, listModels } from './providers.js'
import { OAUTH_PROVIDERS, buildAuthUrl, completePaste, startLoopback, validAccessToken, startDevice, pollDevice } from './oauth.js'
import { checkForUpdate } from './updater.js'
import { ollamaBin, SPAWN_ENV } from './ollama.js'
import { commandRisk } from './util.js'
import { listFacts, addFacts, addFactManual, deleteFact, clearFacts, relevantFacts } from './memory.js'
import { shouldReflect, reflectionPrompt, parseProposal, addSuggestion } from './skillsmith.js'

const PORT = Number(process.env.RADIANT_PORT || 5834)
const app = express()

// CORS: a remote client (another Mac's app, or a phone browser) talks to this
// server from a different origin. Allow it and answer preflight BEFORE auth — the
// custom x-radiant-token header triggers a preflight OPTIONS that carries no token.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-radiant-token, authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '10mb' }))

const __dirname0 = path.dirname(fileURLToPath(import.meta.url))
const APP_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname0, '..', 'package.json'), 'utf8')).version } catch { return '0.0.0' }
})()

let config = loadConfig()

// ---- network sharing --------------------------------------------------------
// Normally the server binds to localhost only. On an always-on "host" Mac you can
// share it so other Macs and phones connect as clients. When shared it binds to
// all interfaces and requires an access token on every /api and /term request
// (loopback — the app on the host machine itself — is exempt). Reachability is
// expected to go over Tailscale; the token is a second lock.
const share0 = config.settings.share || {}
const SHARE_ENABLED = process.env.RADIANT_SHARE === '1' || Boolean(share0.enabled)
const SHARE_TOKEN = process.env.RADIANT_TOKEN || share0.token || null
const BIND_HOST = SHARE_ENABLED ? '0.0.0.0' : '127.0.0.1'
const isLoopback = ra => !ra || ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1'
function tokenOk (req) {
  if (isLoopback(req.socket?.remoteAddress)) return true
  if (!SHARE_TOKEN) return false
  const tok = req.headers['x-radiant-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return tok === SHARE_TOKEN
}
// LAN / Tailscale addresses this host is reachable at
function hostAddresses () {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      const tailscale = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address)
      out.push({ address: a.address, label: tailscale ? 'Tailscale' : name })
    }
  }
  out.sort((x, y) => (x.label === 'Tailscale' ? -1 : 0) - (y.label === 'Tailscale' ? -1 : 0))
  return out
}

// in-flight turn state
const activeTurns = new Map() // sessionId -> { controller }
const pendingApprovals = new Map() // callId -> resolve(bool)
const pendingQuestions = new Map() // questionId -> resolve(answer string)

// Reload config from disk before handling config-touching requests, so a second
// instance (or a stale in-memory copy) can't clobber another's keys/oauth when
// it saves. Skips long-lived streams that captured config at their start.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') &&
      !/^\/api\/(chat|pull|quantize|abort|approve)/.test(req.path)) {
    config = loadConfig()
  }
  next()
})

// Access-token gate for remote clients (loopback is always allowed). Only /api and
// the terminal socket are gated; the static UI loads freely so a phone can reach
// the token-entry screen.
app.use('/api', (req, res, next) => {
  if (tokenOk(req)) return next()
  res.status(401).json({ error: 'This Radiant server requires an access token.' })
})

// ---------- config ----------
app.get('/api/config', (req, res) => res.json(publicConfig(config)))

app.put('/api/settings', (req, res) => {
  config.settings = { ...config.settings, ...req.body }
  saveConfig(config)
  res.json(publicConfig(config))
})

// current sharing state + the addresses/token other devices use to connect
app.get('/api/share', (req, res) => {
  res.json({
    enabled: SHARE_ENABLED,      // reflects the RUNNING server (needs relaunch to change)
    desired: Boolean(config.settings.share?.enabled),
    token: SHARE_TOKEN,
    port: PORT,
    addresses: hostAddresses()
  })
})

// toggle sharing (applies on next launch, since the bind host is fixed at boot)
app.post('/api/share', (req, res) => {
  const enabled = Boolean(req.body?.enabled)
  const cur = config.settings.share || {}
  const token = cur.token || crypto.randomBytes(24).toString('base64url')
  config.settings.share = { enabled, token }
  saveConfig(config)
  res.json({ desired: enabled, enabled: SHARE_ENABLED, token, needsRelaunch: enabled !== SHARE_ENABLED, port: PORT, addresses: hostAddresses() })
})

app.post('/api/providers/:id/key', (req, res) => {
  const { key, newAccount, label } = req.body
  if (key) upsertCredential(config, req.params.id, { key }, { label, newAccount })
  else { const a = config.activeAccount?.[req.params.id]; if (a) removeAccount(config, req.params.id, a); else delete config.keys[req.params.id] }
  saveConfig(config)
  res.json(publicConfig(config))
})

// which providers are mid-way through adding a NEW account (vs replacing active)
const addingAccount = new Set()
app.post('/api/providers/:id/accounts/activate', (req, res) => {
  activateAccount(config, req.params.id, req.body.accountId)
  saveConfig(config)
  res.json(publicConfig(config))
})
app.delete('/api/providers/:id/accounts/:acctId', (req, res) => {
  removeAccount(config, req.params.id, req.params.acctId)
  saveConfig(config)
  res.json(publicConfig(config))
})

app.post('/api/providers', (req, res) => {
  const { name, baseUrl, type = 'openai', auth = 'key' } = req.body
  if (!name || !baseUrl) return res.status(400).json({ error: 'name and baseUrl required' })
  const id = 'custom-' + crypto.randomBytes(4).toString('hex')
  config.providers.push({ id, name, type, baseUrl: baseUrl.replace(/\/$/, ''), auth, removable: true })
  saveConfig(config)
  res.json(publicConfig(config))
})

app.delete('/api/providers/:id', (req, res) => {
  const p = config.providers.find(p => p.id === req.params.id)
  if (p && p.removable) {
    config.providers = config.providers.filter(x => x.id !== p.id)
    delete config.keys[p.id]
    // remember removed built-in/preset providers so the merge doesn't re-add them
    if (!p.id.startsWith('custom-')) {
      config.removedProviders = config.removedProviders || []
      if (!config.removedProviders.includes(p.id)) config.removedProviders.push(p.id)
    }
    saveConfig(config)
  }
  res.json(publicConfig(config))
})

// ---------- quantization ----------
app.get('/api/quantize/candidates', async (req, res) => {
  try {
    const { quantizableModels, QUANT_TYPES } = await import('./quantize.js')
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })
    const data = await r.json()
    const local = (data.models || []).map(m => ({ name: m.name, sizeGB: +(m.size / 1024 ** 3).toFixed(1) }))
    res.json({ models: await quantizableModels(local), quants: QUANT_TYPES })
  } catch (e) {
    res.status(502).json({ error: e.message, models: [], quants: [] })
  }
})

app.post('/api/quantize', async (req, res) => {
  const { source, target, quant } = req.body
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const emit = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`)
  try {
    const { runQuantize } = await import('./quantize.js')
    await runQuantize({ source, target, quant }, line => emit({ line }))
    emit({ done: true })
  } catch (e) {
    emit({ error: e.message })
  } finally {
    res.end()
  }
})

// ---------- MCP servers ----------
app.get('/api/mcp/status', async (req, res) => {
  try {
    const { mcpStatus } = await import('./mcp.js')
    res.json({ servers: await mcpStatus(config.mcpServers || []) })
  } catch (e) {
    res.json({ servers: [], error: e.message })
  }
})

app.post('/api/mcp', (req, res) => {
  const { name, transport, command, args, env, url } = req.body
  if (!name || (!command && !url)) return res.status(400).json({ error: 'name and a command or url required' })
  config.mcpServers = config.mcpServers || []
  config.mcpServers.push({
    id: 'mcp-' + crypto.randomBytes(4).toString('hex'),
    name, transport: transport || (url ? 'http' : 'stdio'),
    command: command || null, args: Array.isArray(args) ? args : (args ? String(args).split(' ').filter(Boolean) : []),
    env: env || {}, url: url || null, enabled: true
  })
  saveConfig(config)
  res.json(publicConfig(config))
})

app.patch('/api/mcp/:id', async (req, res) => {
  const s = (config.mcpServers || []).find(x => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  for (const k of ['name', 'command', 'args', 'env', 'url', 'enabled']) if (k in req.body) s[k] = req.body[k]
  try { const { disconnect } = await import('./mcp.js'); await disconnect(s.id) } catch {}
  saveConfig(config)
  res.json(publicConfig(config))
})

app.delete('/api/mcp/:id', async (req, res) => {
  try { const { disconnect } = await import('./mcp.js'); await disconnect(req.params.id) } catch {}
  config.mcpServers = (config.mcpServers || []).filter(x => x.id !== req.params.id)
  saveConfig(config)
  res.json(publicConfig(config))
})

// ---------- workspace file search (for @-mentions) ----------
const FILE_SKIP = new Set(['node_modules', '.git', 'dist', 'release', '.next', 'build', '.cache', 'vendor', '__pycache__'])
app.get('/api/files', (req, res) => {
  const cwd = String(req.query.cwd || os.homedir())
  const q = String(req.query.q || '').toLowerCase()
  const out = []
  const walk = (dir, rel, depth) => {
    if (out.length >= 60 || depth > 6) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (out.length >= 60) return
      if (e.name.startsWith('.') && e.name !== '.env') continue
      const rp = rel ? rel + '/' + e.name : e.name
      if (e.isDirectory()) {
        if (!FILE_SKIP.has(e.name)) walk(path.join(dir, e.name), rp, depth + 1)
      } else if (!q || rp.toLowerCase().includes(q)) {
        out.push(rp)
      }
    }
  }
  walk(cwd, '', 0)
  // prioritise shallower + name matches
  out.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)
  res.json(out.slice(0, 30))
})

// ---------- agents ----------
app.post('/api/agents', (req, res) => {
  const { name, emoji, icon, hue, persona, model, provider, skills, useTools, computerControl, sandbox, plannerModel, plannerProvider, avatar, relay, source } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  config.agents = config.agents || []
  config.agents.push({
    id: 'ag-' + crypto.randomBytes(4).toString('hex'),
    name, emoji: emoji || '🤖', icon: icon || null, hue: hue ?? null, persona: persona || '',
    model: model || null, provider: provider || null, skills: skills || [],
    useTools: useTools !== false, computerControl: Boolean(computerControl), sandbox: Boolean(sandbox),
    plannerModel: plannerModel || null, plannerProvider: plannerProvider || null,
    avatar: avatar || null, relay: relay || null, source: source || null
  })
  saveConfig(config)
  res.json(publicConfig(config))
})

app.patch('/api/agents/:id', (req, res) => {
  const a = (config.agents || []).find(x => x.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'not found' })
  for (const k of ['name', 'emoji', 'icon', 'hue', 'persona', 'model', 'provider', 'skills', 'useTools', 'computerControl', 'sandbox', 'plannerModel', 'plannerProvider', 'avatar', 'relay', 'source']) {
    if (k in req.body) a[k] = req.body[k]
  }
  saveConfig(config)
  res.json(publicConfig(config))
})

app.delete('/api/agents/:id', (req, res) => {
  const a = (config.agents || []).find(x => x.id === req.params.id)
  if (a && a.builtin) return res.status(400).json({ error: 'built-in agents cannot be deleted' })
  config.agents = (config.agents || []).filter(x => x.id !== req.params.id)
  saveConfig(config)
  res.json(publicConfig(config))
})

// ---------- connected agents (import from Hermes / OpenClaw on this Mac) ----------
const HERMES_AVATAR = 'data:image/png;base64,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'
function hexToHue (hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return null
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = Math.round(h * 60); return h < 0 ? h + 360 : h
}

function discoverExternalAgents () {
  const home = os.homedir()
  const out = []
  // Hermes — its "profiles" are agents; the persona lives in SOUL.md
  try {
    const hDir = path.join(home, '.hermes')
    const soulPath = path.join(hDir, 'SOUL.md')
    if (fs.existsSync(soulPath)) {
      const persona = fs.readFileSync(soulPath, 'utf8').trim()
      let title = 'Hermes', color = null, modelNote = ''
      try {
        const py = fs.readFileSync(path.join(hDir, 'profile.yaml'), 'utf8')
        const tm = /title:\s*['"]?([^'"\n]+)/i.exec(py); if (tm) title = tm[1].trim()
        const cm = /color:\s*['"]?(#[0-9a-fA-F]{6})/i.exec(py); if (cm) color = cm[1]
      } catch {}
      try {
        const cy = fs.readFileSync(path.join(hDir, 'config.yaml'), 'utf8')
        const pm = /provider:\s*([a-z0-9_-]+)/i.exec(cy); if (pm) modelNote = pm[1]
      } catch {}
      if (persona) out.push({
        source: 'hermes', sourceLabel: 'Hermes', name: title, emoji: '🪽', avatar: HERMES_AVATAR,
        hue: hexToHue(color), persona, model: null, relay: 'hermes',
        note: modelNote ? `Hermes profile · ${modelNote}` : 'Hermes profile',
        personaChars: persona.length, importable: true
      })
    }
  } catch {}
  // OpenClaw — a local/remote gateway; detected but no local persona to import (yet)
  try {
    const ocPath = path.join(home, '.openclaw', 'openclaw.json')
    if (fs.existsSync(ocPath)) {
      let mode = ''
      try { mode = (JSON.parse(fs.readFileSync(ocPath, 'utf8')).gateway || {}).mode || '' } catch {}
      out.push({
        source: 'openclaw', sourceLabel: 'OpenClaw', name: 'OpenClaw', emoji: '🦞',
        hue: null, persona: '', model: null,
        note: `Gateway detected${mode ? ` · ${mode}` : ''} — live connect coming soon`, importable: false
      })
    }
  } catch {}
  return out
}

app.get('/api/external-agents', (req, res) => {
  try { res.json({ agents: discoverExternalAgents() }) }
  catch (e) { res.json({ agents: [], error: String((e && e.message) || e) }) }
})

// Live relay to the real Hermes agent (its own model, skills, memory). Runs the
// Hermes CLI non-interactively (`hermes -z <text>`, no shell) and streams its
// stdout to the client as text_delta events so the reply lands in the normal
// chat bubble. Returns the full accumulated reply (persisted as the assistant turn).
function runHermesRelay ({ text, emit, signal, session }) {
  return new Promise(resolve => {
    let acc = ''
    let stderrTail = ''
    let settled = false
    const finish = () => { if (!settled) { settled = true; resolve(acc) } }
    let child
    try {
      child = spawn('hermes', ['-z', String(text || '')], {
        env: process.env,
        cwd: (session && session.cwd) || undefined,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e) {
      const msg = `⚠️ Hermes could not respond (${e.message}).`
      acc += msg; emit({ type: 'text_delta', text: msg }); return finish()
    }
    const onAbort = () => { try { child.kill('SIGTERM') } catch {} }
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    child.stdout.on('data', d => {
      const chunk = d.toString()
      acc += chunk
      emit({ type: 'text_delta', text: chunk })
    })
    child.stderr.on('data', d => { stderrTail = (stderrTail + d.toString()).slice(-800) })
    child.on('error', e => {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (!acc.trim() && !(signal && signal.aborted)) {
        const msg = `⚠️ Hermes could not respond (${e.message}).`
        acc += msg; emit({ type: 'text_delta', text: msg })
      }
      finish()
    })
    child.on('close', code => {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (code !== 0 && !acc.trim() && !(signal && signal.aborted)) {
        const tail = stderrTail.trim().split('\n').slice(-3).join(' ').slice(-300)
        const msg = `⚠️ Hermes could not respond (exit ${code}${tail ? `: ${tail}` : ''}).`
        acc += msg; emit({ type: 'text_delta', text: msg })
      }
      finish()
    })
  })
}

// ---------- usage / credits ----------
app.get('/api/usage', async (req, res) => {
  const out = []
  // OpenRouter exposes remaining credits
  if (config.keys.openrouter) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { authorization: `Bearer ${config.keys.openrouter}` },
        signal: AbortSignal.timeout(6000)
      })
      if (r.ok) {
        const d = (await r.json()).data || {}
        const remaining = (d.total_credits ?? 0) - (d.total_usage ?? 0)
        out.push({ provider: 'openrouter', label: 'OpenRouter', kind: 'credits', remaining: +remaining.toFixed(2), used: +(d.total_usage ?? 0).toFixed(2), total: +(d.total_credits ?? 0).toFixed(2) })
      }
    } catch {}
  }
  // subscription sign-ins expose usage via their CLIs' private endpoints
  for (const id of ['anthropic', 'openai']) {
    if (!config.oauth[id]) continue
    const label = id === 'anthropic' ? 'Claude' : 'ChatGPT'
    let windows = null
    try {
      const token = await validAccessToken(id, config, saveConfig)
      windows = id === 'anthropic' ? await claudeUsage(token) : await chatgptUsage(token)
    } catch {}
    out.push({ provider: id, label, kind: 'subscription', windows })
  }
  res.json({ items: out })
})

// Normalize a vendor's rate-limit "window" objects into {name, usedPct, resetAt}.
function normWindows (pairs) {
  const windows = []
  for (const [name, w] of pairs) {
    if (!w || typeof w !== 'object') continue
    const used = w.used ?? w.used_tokens ?? w.usage
    const limit = w.limit ?? w.limit_tokens ?? w.max ?? w.quota
    let pct = null
    if (typeof w.used_percent === 'number') pct = w.used_percent
    else if (typeof w.utilization === 'number') pct = w.utilization <= 1 ? w.utilization * 100 : w.utilization
    else if (typeof w.percent_used === 'number') pct = w.percent_used
    else if (typeof used === 'number' && typeof limit === 'number' && limit > 0) pct = (used / limit) * 100
    let resetAt = w.resets_at || w.reset_at || w.resets || w.reset
    if (!resetAt && w.resets_in_seconds) resetAt = new Date(Date.now() + w.resets_in_seconds * 1000).toISOString()
    if (pct != null || resetAt) windows.push({ name, usedPct: pct != null ? Math.round(pct) : null, resetAt: resetAt || null })
  }
  return windows.length ? windows : null
}

async function chatgptUsage (token) {
  const r = await fetch('https://chatgpt.com/backend-api/wham/usage', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(6000)
  })
  if (!r.ok) return null
  const d = await r.json()
  const rl = d.rate_limit || d
  return normWindows([['5h', rl.primary_window], ['weekly', rl.secondary_window]])
}

async function claudeUsage (token) {
  const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', accept: 'application/json' }, signal: AbortSignal.timeout(6000)
  })
  if (!r.ok) return null
  const d = await r.json()
  return normWindows([['5h', d.five_hour], ['weekly', d.seven_day]])
}

// open a file/folder in the OS default app (for the "files changed" chips)
app.post('/api/open', (req, res) => {
  const p = String(req.body?.path || '')
  if (!p || !fs.existsSync(p)) return res.status(400).json({ error: 'no such file' })
  try { spawn('open', [p], { detached: true, stdio: 'ignore' }).unref(); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: e.message }) }
})

// ---------- recipes (parameterized task templates) ----------
app.post('/api/recipes', (req, res) => {
  const { name, desc, template, params } = req.body
  if (!name || !template) return res.status(400).json({ error: 'name and template required' })
  config.recipes = config.recipes || []
  config.recipes.push({ id: 'rec-' + crypto.randomBytes(4).toString('hex'), name, desc: desc || '', template, params: Array.isArray(params) ? params : [] })
  saveConfig(config)
  res.json(publicConfig(config))
})
app.patch('/api/recipes/:id', (req, res) => {
  const r = (config.recipes || []).find(x => x.id === req.params.id)
  if (!r) return res.status(404).json({ error: 'not found' })
  for (const k of ['name', 'desc', 'template', 'params']) if (k in req.body) r[k] = req.body[k]
  saveConfig(config)
  res.json(publicConfig(config))
})
app.delete('/api/recipes/:id', (req, res) => {
  config.recipes = (config.recipes || []).filter(x => x.id !== req.params.id)
  saveConfig(config)
  res.json(publicConfig(config))
})

// ---------- memory ----------
app.get('/api/memory', (req, res) => res.json({ facts: listFacts() }))
app.post('/api/memory', (req, res) => { addFactManual(String(req.body?.text || '')); res.json({ facts: listFacts() }) })
app.delete('/api/memory/:id', (req, res) => { deleteFact(req.params.id); res.json({ facts: listFacts() }) })
app.post('/api/memory/clear', (req, res) => { clearFacts(); res.json({ facts: [] }) })

// ---------- skills ----------
app.post('/api/skills', (req, res) => {
  const { name, description, content } = req.body
  if (!name || !content) return res.status(400).json({ error: 'name and content required' })
  config.skills = config.skills || []
  config.skills.push({ id: 'sk-' + crypto.randomBytes(4).toString('hex'), name, description: description || '', content, enabled: true })
  saveConfig(config)
  res.json(publicConfig(config))
})

app.patch('/api/skills/:id', (req, res) => {
  const sk = (config.skills || []).find(s => s.id === req.params.id)
  if (!sk) return res.status(404).json({ error: 'not found' })
  for (const k of ['name', 'description', 'content', 'enabled']) {
    if (k in req.body) sk[k] = req.body[k]
  }
  saveConfig(config)
  res.json(publicConfig(config))
})

app.delete('/api/skills/:id', (req, res) => {
  const id = req.params.id
  config.skills = (config.skills || []).filter(s => s.id !== id)
  // seeded skills get re-merged on load; remember the deletion so they stay gone
  if (id.startsWith('seed-')) {
    config.removedSkills = config.removedSkills || []
    if (!config.removedSkills.includes(id)) config.removedSkills.push(id)
  }
  saveConfig(config)
  res.json(publicConfig(config))
})

// ---------- suggested skills (from skillsmith) ----------
app.post('/api/skill-suggestions/:id/accept', (req, res) => {
  const sug = (config.skillSuggestions || []).find(s => s.id === req.params.id)
  if (!sug) return res.status(404).json({ error: 'not found' })
  config.skills = config.skills || []
  config.skills.push({ id: 'sk-' + crypto.randomBytes(4).toString('hex'), name: sug.name, description: sug.description || '', content: sug.content, enabled: true, fromSuggestion: true })
  config.skillSuggestions = (config.skillSuggestions || []).filter(s => s.id !== sug.id)
  saveConfig(config)
  res.json(publicConfig(config))
})

app.post('/api/skill-suggestions/:id/reject', (req, res) => {
  const sug = (config.skillSuggestions || []).find(s => s.id === req.params.id)
  if (sug) {
    const key = (sug.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    config.rejectedSkills = config.rejectedSkills || []
    if (key && !config.rejectedSkills.includes(key)) config.rejectedSkills.push(key)
    config.skillSuggestions = (config.skillSuggestions || []).filter(s => s.id !== sug.id)
    saveConfig(config)
  }
  res.json(publicConfig(config))
})

// ---------- computer control status ----------
app.get('/api/computer-status', async (req, res) => {
  try {
    const { computerStatus } = await import('./computer-tools.js')
    res.json(await computerStatus())
  } catch (e) {
    res.json({ desktop: false, browser: false, error: e.message })
  }
})

// ---------- design mode (point at a page element, capture it) ----------
app.post('/api/design/open', async (req, res) => {
  try {
    const { web } = await import('./browser.js')
    res.json(await web.navigate(req.body.url))
  } catch (e) { res.status(400).json({ error: e.message }) }
})
app.post('/api/design/pick', async (req, res) => {
  try {
    const { web } = await import('./browser.js')
    const capture = await web.pickElement()
    res.json({ capture })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ---------- version & updates ----------
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }))

app.get('/api/update-check', async (req, res) => {
  try {
    res.json(await checkForUpdate(APP_VERSION))
  } catch (e) {
    res.status(502).json({ error: e.message, current: APP_VERSION })
  }
})

// ---------- subscription sign-in (OAuth) ----------
app.get('/api/oauth/providers', (req, res) => {
  res.json(Object.entries(OAUTH_PROVIDERS).map(([id, p]) => ({ id, label: p.label, mode: p.mode })))
})

// begin a sign-in: returns the URL to open in a browser
app.post('/api/oauth/:id/start', (req, res) => {
  try {
    if (req.body?.newAccount) addingAccount.add(req.params.id)
    const { url, mode } = buildAuthUrl(req.params.id)
    if (mode === 'loopback') {
      startLoopback(req.params.id, (err, tok) => {
        if (!err && tok) { upsertCredential(config, req.params.id, { oauth: tok }, { newAccount: addingAccount.delete(req.params.id) }); saveConfig(config) }
      })
    }
    res.json({ url, mode })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// finish a paste-mode sign-in with the code from the callback page
app.post('/api/oauth/:id/complete', async (req, res) => {
  try {
    const tok = await completePaste(req.params.id, req.body.code)
    upsertCredential(config, req.params.id, { oauth: tok }, { newAccount: addingAccount.delete(req.params.id) })
    saveConfig(config)
    res.json(publicConfig(config))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// device-code sign-in (Nous): start returns a code + URL to open
app.post('/api/oauth/:id/device/start', async (req, res) => {
  try {
    if (req.body?.newAccount) addingAccount.add(req.params.id)
    res.json(await startDevice(req.params.id))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// device-code sign-in: poll until the user approves on the Portal
app.post('/api/oauth/:id/device/poll', async (req, res) => {
  try {
    const r = await pollDevice(req.params.id)
    if (r.done) { upsertCredential(config, req.params.id, { oauth: r.token }, { newAccount: addingAccount.delete(req.params.id) }); saveConfig(config) }
    res.json({ done: r.done, config: r.done ? publicConfig(config) : undefined })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// poll whether a loopback sign-in has landed
app.get('/api/oauth/:id/status', (req, res) => {
  res.json({ signedIn: Boolean(config.oauth[req.params.id]) })
})

app.post('/api/oauth/:id/signout', (req, res) => {
  const activeId = config.activeAccount?.[req.params.id]
  if (activeId) removeAccount(config, req.params.id, activeId)
  else delete config.oauth[req.params.id]
  saveConfig(config)
  res.json(publicConfig(config))
})

// ---------- models ----------
app.get('/api/models', async (req, res) => {
  const results = await Promise.all(config.providers.map(async p => {
    const hasKey = Boolean(config.keys[p.id])
    const hasOAuth = Boolean(config.oauth[p.id])
    if ((p.auth === 'key' || p.auth === 'oauth') && !hasKey && !hasOAuth) return []
    const accessToken = hasOAuth ? await validAccessToken(p.id, config, saveConfig).catch(() => null) : null
    const prov = (p.id === 'qwen' && config.oauth.qwen?.apiBase) ? { ...p, baseUrl: config.oauth.qwen.apiBase } : p
    const models = await listModels(prov, config.keys[p.id], accessToken, hasOAuth ? config.oauth[p.id]?.accountId : null)
    models.sort((a, b) => a.id.localeCompare(b.id))
    return models.map(m => ({ ...m, provider: p.id, providerName: p.name }))
  }))
  res.json(results.flat())
})

// ---------- local models (Ollama) ----------
const OLLAMA = 'http://127.0.0.1:11434'

app.get('/api/system', (req, res) => {
  let chip = os.cpus()[0]?.model || 'Unknown CPU'
  try { chip = execSync('sysctl -n machdep.cpu.brand_string', { timeout: 2000 }).toString().trim() } catch {}
  let osVersion = ''
  try { osVersion = execSync('sw_vers -productVersion', { timeout: 2000 }).toString().trim() } catch {}
  // real free space on the volume that actually holds the models (follows the
  // ~/.ollama symlink if models live on an external drive) — the number a
  // download really gets, not Finder's purgeable-inflated figure.
  let diskFreeGB = null
  try {
    const modelsPath = path.join(os.homedir(), '.ollama', 'models')
    const target = fs.existsSync(modelsPath) ? modelsPath : os.homedir()
    const out = execSync(`df -k "${target}"`, { timeout: 3000 }).toString().trim().split('\n').pop().split(/\s+/)
    diskFreeGB = Math.round(Number(out[3]) / (1024 * 1024))
  } catch {}
  res.json({
    chip,
    ramGB: Math.round(os.totalmem() / (1024 ** 3)),
    cores: os.cpus().length,
    arch: os.arch(),
    platform: os.platform(),
    osVersion,
    diskFreeGB
  })
})

// ---------- docker status (for the agent sandbox) ----------
app.get('/api/docker-status', (req, res) => {
  const probe = cmd => { try { return execSync(cmd, { timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
  const installed = Boolean(probe('command -v docker || command -v colima'))
  const running = Boolean(probe('docker info --format "{{.ServerVersion}}"'))
  const version = running ? probe('docker --version') : null
  res.json({ installed, running, version })
})

// ---------- local storage (Radiant's own data) ----------
app.get('/api/storage', (req, res) => {
  const dir = SESSIONS_DIR
  let count = 0; let bytes = 0
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      count++; try { bytes += fs.statSync(path.join(dir, f)).size } catch {}
    }
  } catch {}
  res.json({ sessions: count, sizeMB: Math.round(bytes / (1024 * 1024) * 10) / 10 })
})
// delete sessions older than `days` (0 = all)
app.post('/api/storage/clear-sessions', (req, res) => {
  const days = Number(req.body?.days ?? 30)
  const cutoff = days > 0 ? Date.now() - days * 86400000 : Infinity
  let removed = 0
  try {
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      if (!f.endsWith('.json')) continue
      const p = path.join(SESSIONS_DIR, f)
      let mt = 0; try { mt = fs.statSync(p).mtimeMs } catch {}
      if (days === 0 || mt < cutoff) { try { fs.unlinkSync(p); removed++ } catch {} }
    }
  } catch {}
  res.json({ removed })
})

// live registry search: GGUF repos on Hugging Face, pullable via `ollama pull hf.co/{repo}:{quant}`
app.get('/api/registry-search', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 100)
  const SORTS = { downloads: 'downloads', likes: 'likes', trending: 'trendingScore', updated: 'lastModified', created: 'createdAt' }
  const sort = SORTS[req.query.sort] || 'downloads'
  try {
    const url = `https://huggingface.co/api/models?filter=gguf&sort=${sort}&direction=-1&limit=30${q ? `&search=${encodeURIComponent(q)}` : ''}`
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`registry ${r.status}`)
    const data = await r.json()
    res.json(data.map(m => ({
      id: m.id,
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      updatedAt: m.lastModified
    })))
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.get('/api/registry-files', async (req, res) => {
  const repo = String(req.query.repo || '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return res.status(400).json({ error: 'bad repo' })
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`registry ${r.status}`)
    const data = await r.json()
    const base = repo.split('/')[1].toLowerCase().replace(/[._-]?gguf$/i, '').replace(/[^a-z0-9._-]+/g, '-').replace(/(^-|-$)/g, '')
    const quants = {} // label -> { bytes, files:[{name,size}] }
    for (const s of data.siblings || []) {
      const f = s.rfilename
      if (!/\.gguf$/i.test(f)) continue
      // top-level weight files only — skip subfolder files and companions
      // (projectors, vision/clip encoders, drafts, LoRA/adapters, MTP heads).
      if (f.includes('/')) continue
      if (/mmproj|projector|\bproj\b|vision|\bclip\b|encoder|lora|adapter|draft|\bmtp\b/i.test(f)) continue
      // Group sharded parts (…-00001-of-00003.gguf) under one quant. We download
      // files directly from HF and `ollama create` from them, so shards are fine.
      const stem = f.replace(/-\d+-of-\d+\.gguf$/i, '.gguf')
      const m = stem.match(/[.\-_](I?Q\d[\w]*?|F16|F32|BF16|FP16|FP32)\.gguf$/i)
      const label = (m ? m[1] : 'default').toUpperCase().replace(/^FP(16|32)$/, 'F$1')
      quants[label] = quants[label] || { bytes: 0, files: [] }
      quants[label].bytes += s.size || 0
      quants[label].files.push(f)
    }
    res.json({
      repo,
      quants: Object.entries(quants)
        .map(([label, v]) => ({
          label,
          sizeGB: +(v.bytes / 1024 ** 3).toFixed(1),
          files: v.files.sort(),
          sharded: v.files.length > 1,
          model: `${base}:${label.toLowerCase()}`
        }))
        .sort((a, b) => a.sizeGB - b.sizeGB)
    })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.get('/api/local-models', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })
    const data = await r.json()
    res.json({ running: true, models: (data.models || []).map(m => ({ name: m.name, sizeGB: +(m.size / 1024 ** 3).toFixed(1) })) })
  } catch {
    res.json({ running: false, models: [] })
  }
})

app.delete('/api/local-models/:name', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA}/api/delete`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: req.params.name })
    })
    res.json({ ok: r.ok })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// Ollama pulls `hf.co/repo:TAG` by matching TAG as a case-insensitive substring
// of exactly one filename. It errors with a cryptic "file does not exist" when the
// quant is only published as a multi-part split, when the file was renamed, or when
// the tag matches more than one file. Preflight against HF so we can either fix the
// tag or give the user an actionable message instead of Ollama's cryptic one.
const IS_SHARD = f => /-\d+-of-\d+\.gguf$/i.test(f)
const IS_COMPANION = f => /mmproj|projector|\bproj\b|vision|\bclip\b|encoder|lora|adapter|draft|\bmtp\b/i.test(f)
const IS_SINGLE = f => !f.includes('/') && !IS_SHARD(f) && !IS_COMPANION(f)

async function resolveHfPull (model) {
  const m = model.match(/^hf\.co\/([\w.-]+\/[\w.-]+)(?::(.+))?$/i)
  if (!m) return { model } // ollama library name, not an HF pull — pass through
  const repo = m[1]
  const tag = m[2] || null
  let siblings
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repo}?blobs=true`, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) return { model } // registry hiccup — let Ollama try anyway
    siblings = ((await r.json()).siblings || []).map(s => s.rfilename).filter(f => /\.gguf$/i.test(f))
  } catch { return { model } }
  const single = siblings.filter(IS_SINGLE)
  if (!tag) return single.length ? { model } : { error: `No downloadable single-file GGUF found in ${repo}.` }
  const t = tag.toLowerCase()
  const singleHits = single.filter(f => f.toLowerCase().includes(t))
  // Ollama matches the tag against EVERY file in the repo (including shards). If a
  // sharded set shares this tag, Ollama tries to pull the shards and fails with
  // "sharded GGUF" — even when a valid single file also exists — so catch it here.
  const shardHits = siblings.filter(f => IS_SHARD(f) && f.toLowerCase().includes(t))
  if (shardHits.length) {
    return { error: `“${tag}” is published as a multi-part sharded GGUF in ${repo}, which Ollama can’t download from the registry. Pick a single-file quantization (one without a “…-00001-of-000NN” split), or a different repo.` }
  }
  if (singleHits.length === 1) return { model } // unique single-file match — good to pull
  if (singleHits.length > 1) {
    // Ambiguous among single files: find the shortest unique substring tag.
    const exact = singleHits.find(f => new RegExp(`[.\\-_]${t}\\.gguf$`, 'i').test(f)) || singleHits.sort((a, b) => a.length - b.length)[0]
    const stem = exact.replace(/\.gguf$/i, '')
    for (let n = 2; n <= 5; n++) {
      const sub = stem.split(/[.\-_]/).slice(-n).join('-')
      if (single.filter(f => f.toLowerCase().includes(sub.toLowerCase())).length === 1) {
        return { model: `hf.co/${repo}:${sub}`, note: `Matched ${exact}` }
      }
    }
    return { error: `“${tag}” matches ${singleHits.length} files in ${repo} and Ollama can’t tell them apart. Pick a more specific quantization.` }
  }
  return { error: `No “${tag}” GGUF in ${repo}. It may be a projector/adapter or was renamed — collapse and reopen the repo to refresh the list.` }
}

// pull a model through Ollama, streaming progress back as SSE
app.post('/api/pull', async (req, res) => {
  let { model } = req.body
  if (!model || !/^[\w.\/:-]+$/.test(model)) return res.status(400).json({ error: 'bad model tag' })
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const emit = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`)
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const resolved = await resolveHfPull(model)
    if (resolved.error) { emit({ error: resolved.error }); return }
    if (resolved.model !== model) { model = resolved.model; emit({ status: resolved.note || `resolved to ${model}` }) }
    const r = await fetch(`${OLLAMA}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal: controller.signal
    })
    if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const j = JSON.parse(line)
          // Enrich Ollama's cryptic "file does not exist" with what it usually means.
          const err = j.error && /file does not exist|does not exist|not found/i.test(j.error)
            ? `${j.error} — this quant may be split-only or renamed on Hugging Face. Try a different quantization or repo.`
            : j.error
          emit({ status: j.status, completed: j.completed, total: j.total, error: err })
        } catch {}
      }
    }
    emit({ status: 'done' })
  } catch (e) {
    if (!controller.signal.aborted) emit({ error: e.message })
  } finally {
    res.end()
  }
})

// Download exact GGUF file(s) straight from Hugging Face (the way LM Studio does),
// then register them with Ollama via `ollama create`. This sidesteps Ollama's
// fragile registry tag-matching entirely and handles sharded quants too.
const DL_DIR = path.join(os.homedir(), '.radiant', 'downloads')
const hfUrl = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(file)}?download=true`

// Downloads run detached from the request that starts them and are tracked here,
// so navigating away from (or closing) the Models screen never stops a download.
// key = model name -> { repo, files, model, status, completed, total, error, done }
const downloads = new Map()

async function runDownload (entry) {
  const controller = new AbortController()
  entry._abort = () => controller.abort()
  const dir = path.join(DL_DIR, crypto.randomUUID())
  let child = null
  entry._kill = () => { controller.abort(); child?.kill('SIGKILL') }
  try {
    fs.mkdirSync(dir, { recursive: true })
    let sizeByFile = {}
    try {
      const meta = await fetch(`https://huggingface.co/api/models/${entry.repo}?blobs=true`, { signal: controller.signal })
      if (meta.ok) for (const s of (await meta.json()).siblings || []) sizeByFile[s.rfilename] = s.size || 0
    } catch {}
    entry.total = entry.files.reduce((a, f) => a + (sizeByFile[f] || 0), 0)
    let done = 0
    for (let i = 0; i < entry.files.length; i++) {
      const f = entry.files[i]
      entry.status = entry.files.length > 1 ? `downloading part ${i + 1}/${entry.files.length}` : 'downloading'
      const r = await fetch(hfUrl(entry.repo, f), { redirect: 'follow', signal: controller.signal })
      if (!r.ok) throw new Error(`Couldn't download ${f} (HTTP ${r.status})`)
      const out = fs.createWriteStream(path.join(dir, f))
      const reader = r.body.getReader()
      while (true) {
        const { done: fin, value } = await reader.read()
        if (fin) break
        done += value.length
        entry.completed = done
        if (!out.write(Buffer.from(value))) await new Promise(rs => out.once('drain', rs))
      }
      out.end()
      await new Promise((rs, rj) => { out.on('finish', rs); out.on('error', rj) })
    }
    entry.status = 'importing into Ollama…'; entry.completed = entry.total
    const modelfile = path.join(dir, 'Modelfile')
    fs.writeFileSync(modelfile, `FROM ${path.join(dir, entry.files[0])}\n`)
    await new Promise((resolve, reject) => {
      child = spawn(ollamaBin(), ['create', entry.model, '-f', modelfile], { env: SPAWN_ENV })
      let err = ''
      const strip = s => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\r\x00-\x08\x0e-\x1f]/g, '').trim()
      const feed = b => b.toString().split('\n').forEach(raw => { const l = strip(raw); if (l) entry.status = l })
      child.stdout.on('data', feed)
      child.stderr.on('data', d => { err += d.toString(); feed(d) })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ollama create exited ${code}`)))
    })
    entry.status = 'done'; entry.done = true
  } catch (e) {
    if (controller.signal.aborted) { downloads.delete(entry.model); return }
    entry.error = e.message; entry.done = true
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {})
    // keep finished/errored entries briefly so the UI can show the final state
    if (entry.done) setTimeout(() => downloads.delete(entry.model), 60000)
  }
}

// start a download (idempotent per model) — returns immediately, runs in background
app.post('/api/download', (req, res) => {
  const { repo, files, model } = req.body || {}
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) return res.status(400).json({ error: 'bad repo' })
  if (!Array.isArray(files) || !files.length || !files.every(f => /^[A-Za-z0-9._-]+\.gguf$/i.test(f))) return res.status(400).json({ error: 'bad files' })
  if (!/^[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/i.test(model || '')) return res.status(400).json({ error: 'bad model name' })
  const existing = downloads.get(model)
  if (existing && !existing.done) return res.json({ ok: true, already: true })
  const entry = { repo, files, model, status: 'starting', completed: 0, total: 0, error: null, done: false }
  downloads.set(model, entry)
  runDownload(entry) // detached — survives client disconnect
  res.json({ ok: true })
})

// snapshot of active/recent downloads for the UI to poll
app.get('/api/downloads', (req, res) => {
  res.json([...downloads.values()].map(({ repo, files, model, status, completed, total, error, done }) =>
    ({ repo, files, model, status, completed, total, error, done })))
})

app.post('/api/download/cancel', (req, res) => {
  const entry = downloads.get(req.body?.model)
  if (entry) { entry._kill?.(); downloads.delete(entry.model) }
  res.json({ ok: true })
})

// ---------- sessions ----------
app.get('/api/sessions', (req, res) => res.json(listSessions()))

app.post('/api/sessions', (req, res) => {
  const agent = req.body.agentId ? (config.agents || []).find(a => a.id === req.body.agentId) : null
  const participants = Array.isArray(req.body.participants) ? req.body.participants.filter(id => (config.agents || []).some(a => a.id === id)) : null
  const isGroup = Boolean(participants && participants.length >= 2)
  const session = {
    id: crypto.randomUUID(),
    title: req.body.title || (isGroup ? 'Group chat' : 'New session'),
    agentId: agent ? agent.id : null,
    group: isGroup,
    participants: isGroup ? participants : undefined,
    // agent picks the model/tools unless the request overrides them
    provider: req.body.provider || (agent && agent.provider) || null,
    model: req.body.model || (agent && agent.model) || config.settings.defaultModel,
    cwd: req.body.cwd || config.settings.defaultCwd || os.homedir(),
    useTools: req.body.useTools !== undefined ? req.body.useTools !== false : (agent ? agent.useTools !== false : true),
    computerControl: req.body.computerControl !== undefined ? Boolean(req.body.computerControl) : Boolean(agent && agent.computerControl),
    createdAt: new Date().toISOString(),
    messages: []
  }
  saveSession(session)
  res.json(session)
})

app.get('/api/sessions-search', (req, res) => res.json(searchSessions(req.query.q, 30)))

app.get('/api/sessions/:id', (req, res) => {
  const s = loadSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  res.json(s)
})

app.patch('/api/sessions/:id', (req, res) => {
  const s = loadSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  for (const k of ['title', 'model', 'provider', 'cwd', 'useTools', 'computerControl', 'agentId', 'pinned', 'planMode']) {
    if (k in req.body) s[k] = req.body[k]
  }
  if ('title' in req.body) s.autoTitle = false // manual rename pins the title
  saveSession(s)
  res.json(s)
})

app.delete('/api/sessions/:id', (req, res) => {
  deleteSession(req.params.id)
  res.json({ ok: true })
})

// rewind: drop all messages from `index` onward (branch the conversation)
app.post('/api/sessions/:id/truncate', (req, res) => {
  const s = loadSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  const idx = Number(req.body?.index)
  if (Number.isInteger(idx) && idx >= 0 && idx <= s.messages.length) {
    s.messages = s.messages.slice(0, idx)
    saveSession(s)
  }
  res.json(s)
})

// ---------- chat (SSE) ----------
app.post('/api/chat', async (req, res) => {
  config = loadConfig() // see the latest keys/oauth before the turn
  const { sessionId, content } = req.body
  const session = loadSession(sessionId)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (activeTurns.has(sessionId)) return res.status(409).json({ error: 'a turn is already running' })

  // agent (persona + its skills) plus globally-enabled skills
  const agent = session.agentId ? (config.agents || []).find(a => a.id === session.agentId) : null

  // Live relay: some agents bridge to a real external agent (e.g. Hermes) with its
  // own model, skills, and memory. They need no Radiant provider — stream the
  // external agent's reply straight through and skip provider/skills/mcp/runTurn.
  if (agent && agent.relay === 'hermes') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    })
    const emit = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`)
    const text = typeof content === 'string' ? content : (content.text || '')
    const attachments = (typeof content === 'object' && content.attachments) || []
    session.messages.push({ role: 'user', text, attachments })
    if (session.messages.length === 1 && session.autoTitle !== false) {
      session.title = text.length > 48 ? text.slice(0, 48) + '…' : (text || `${attachments.length} file(s)`)
      session.autoTitle = true
      emit({ type: 'title', title: session.title })
    }
    saveSession(session)
    const controller = new AbortController()
    activeTurns.set(sessionId, { controller })
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    const assistant = { role: 'assistant', parts: [] }
    if (agent.id) assistant.agentId = agent.id
    session.messages.push(assistant)
    try {
      const reply = await runHermesRelay({ text, emit, signal: controller.signal, session })
      if (reply) assistant.parts.push({ type: 'text', text: reply })
      emit({ type: 'done' })
    } catch (e) {
      if (!controller.signal.aborted) emit({ type: 'error', message: e.message })
    } finally {
      activeTurns.delete(sessionId)
      saveSession(session)
      emit({ type: 'closed' })
      res.end()
    }
    return
  }

  let provider = config.providers.find(p => p.id === session.provider)
  if (!provider) return res.status(400).json({ error: 'Pick a model first — no provider set on this session.' })
  // Qwen's OAuth token names the API host to use; honour it over the default.
  if (provider.id === 'qwen' && config.oauth.qwen?.apiBase) provider = { ...provider, baseUrl: config.oauth.qwen.apiBase }
  const apiKey = config.keys[provider.id]
  const hasOAuth = Boolean(config.oauth[provider.id])
  if (provider.auth === 'key' && !apiKey && !hasOAuth) return res.status(400).json({ error: `No API key or subscription sign-in for ${provider.name}. Add one in Settings.` })

  // agent (persona + its skills, resolved above) plus globally-enabled skills
  const allSkills = config.skills || []
  const agentSkillIds = new Set(agent?.skills || [])
  const mergedSkills = allSkills.filter(s => s.enabled || agentSkillIds.has(s.id))

  // MCP tools from enabled servers, bridged into the tool set
  let mcpTools = []
  let callMcp = null
  if ((config.mcpServers || []).some(s => s.enabled)) {
    try {
      const mcp = await import('./mcp.js')
      mcpTools = await mcp.mcpToolDefs(config.mcpServers)
      callMcp = (name, args) => mcp.callMcpTool(name, args, config.mcpServers)
    } catch (e) { console.error('[mcp]', e.message) }
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  })
  const emit = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`)

  // content is either a string or { text, attachments:[{name,mime,dataB64,kind}] }
  const text = typeof content === 'string' ? content : (content.text || '')
  const attachments = (typeof content === 'object' && content.attachments) || []
  session.messages.push({ role: 'user', text, attachments })
  if (session.messages.length === 1 && session.autoTitle !== false) {
    // instant placeholder; upgraded to a nicer title after the turn (see below)
    session.title = text.length > 48 ? text.slice(0, 48) + '…' : (text || `${attachments.length} file(s)`)
    session.autoTitle = true
    emit({ type: 'title', title: session.title })
  }
  saveSession(session)

  const controller = new AbortController()
  activeTurns.set(sessionId, { controller })
  // res 'close' fires on client disconnect (req 'close' fires once the body is
  // consumed in modern Node, which would abort the turn immediately)
  res.on('close', () => { if (!res.writableEnded) controller.abort() })

  const requestApproval = call => new Promise(resolve => {
    // approval mode: 'ask' = confirm every command, 'auto' = only risky ones, 'off' = never
    const mode = config.settings.approvalMode || (config.settings.approveCommands === false ? 'off' : 'ask')
    if (mode === 'off') return resolve(true)
    // in Auto mode, run low-risk shell commands silently (a quick notice); still ask
    // for risky commands and always for MCP / desktop control.
    if (mode === 'auto' && call.name === 'run_command' && commandRisk(call.args?.command) === 'low') {
      emit({ type: 'notice', text: `Ran: ${call.args.command}` })
      return resolve(true)
    }
    pendingApprovals.set(call.id, resolve)
    emit({ type: 'approval_request', id: call.id, name: call.name, args: call.args })
    setTimeout(() => {
      if (pendingApprovals.delete(call.id)) resolve(false)
    }, 10 * 60 * 1000)
  })

  // pause the turn and ask the user a multiple-choice question (ask_user tool)
  const requestUserChoice = (question, options) => new Promise(resolve => {
    const id = crypto.randomUUID()
    pendingQuestions.set(id, resolve)
    emit({ type: 'question_request', id, question, options: Array.isArray(options) ? options : [] })
    setTimeout(() => { if (pendingQuestions.delete(id)) resolve('(no answer — the user did not respond in time)') }, 10 * 60 * 1000)
  })

  // let this agent consult the OTHER agents (peers) via the ask_agent tool
  const peers = (config.agents || []).filter(a => a.id !== session.agentId)
  const peerAgents = peers.map(a => ({ name: a.name, blurb: (a.persona || '').split(/(?<=[.!?])\s/)[0].slice(0, 90) || 'general assistant' }))
  const askAgent = async (agentRef, question) => {
    const target = peers.find(a => a.id === agentRef || a.name.toLowerCase() === String(agentRef || '').toLowerCase())
    if (!target) return `No agent named "${agentRef}". You can ask: ${peers.map(a => a.name).join(', ') || '(none available)'}.`
    if (!question || !String(question).trim()) return 'Provide a question for the agent.'
    let tProvider = provider, tApiKey = apiKey, tHasOAuth = hasOAuth, tModel = session.model
    if (target.model && target.provider) {
      const p = config.providers.find(x => x.id === target.provider)
      if (p) { tProvider = p; tApiKey = config.keys[p.id]; tHasOAuth = Boolean(config.oauth[p.id]); tModel = target.model }
    }
    const tmp = { cwd: session.cwd, messages: [{ role: 'user', text: String(question) }] }
    let answer = ''
    try {
      await runTurn({
        provider: tProvider, model: tModel, apiKey: tApiKey,
        getAccessToken: tHasOAuth ? () => validAccessToken(tProvider.id, config, saveConfig) : null,
        getAccountId: tHasOAuth ? () => config.oauth[tProvider.id]?.accountId || null : null,
        session: tmp, useTools: false, computerControl: false,
        persona: target.persona || '', skills: [],
        emit: ev => { if (ev.type === 'text_delta') answer += ev.text },
        requestApproval: null, signal: controller.signal
      })
    } catch (e) { return `(${target.name} couldn't respond: ${e.message})` }
    return `${target.name} says:\n${answer.trim() || '(no answer)'}`
  }

  // one-shot summarizer used by auto-compaction (runs on the session's model, no tools)
  const summarize = async text => {
    const tmp = { cwd: session.cwd, messages: [{ role: 'user', text: `Summarize this conversation so it can continue without losing context. Preserve: decisions made, files created or edited, the current task and its state, and any open questions or next steps. Be concise but complete; use short bullet points.\n\n${text}` }] }
    let out = ''
    try {
      await runTurn({
        provider, model: session.model, apiKey,
        getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
        getAccountId: hasOAuth ? () => config.oauth[provider.id]?.accountId || null : null,
        session: tmp, useTools: false, computerControl: false, persona: '', skills: [],
        emit: ev => { if (ev.type === 'text_delta') out += ev.text },
        requestApproval: null, signal: controller.signal
      })
    } catch {}
    return out
  }

  const memoryOn = config.settings.memory !== false
  const memory = memoryOn ? relevantFacts(text, session.cwd) : []

  // lead/worker: if this agent has a planner model, have the (stronger) lead model
  // outline the approach first; the (session) model then executes it.
  let plannedPersona = agent?.persona || ''
  if (agent?.plannerModel && agent?.plannerProvider && session.useTools !== false && !session.group) {
    const pProvider = config.providers.find(p => p.id === agent.plannerProvider)
    if (pProvider) {
      const pOAuth = Boolean(config.oauth[pProvider.id])
      emit({ type: 'notice', text: `Planning with ${agent.plannerModel}…` })
      const tmp = { cwd: session.cwd, messages: [{ role: 'user', text: `You are the planning lead. Produce a brief numbered plan (3–6 steps, no code) that a coding agent will follow to handle this request in the workspace. Be concrete.\n\nRequest: ${text}` }] }
      let plan = ''
      try {
        await runTurn({
          provider: pProvider, model: agent.plannerModel, apiKey: config.keys[pProvider.id],
          getAccessToken: pOAuth ? () => validAccessToken(pProvider.id, config, saveConfig) : null,
          getAccountId: pOAuth ? () => config.oauth[pProvider.id]?.accountId || null : null,
          session: tmp, useTools: false, computerControl: false, persona: '', skills: [],
          emit: ev => { if (ev.type === 'text_delta') plan += ev.text },
          requestApproval: null, signal: controller.signal
        })
      } catch {}
      if (plan.trim()) plannedPersona = `${plannedPersona}\n\n[A lead model has planned the approach below — follow it, adapting as needed:]\n${plan.trim()}`
    }
  }

  const common = {
    provider,
    model: session.model,
    apiKey,
    getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
    getAccountId: hasOAuth ? () => config.oauth[provider.id]?.accountId || null : null,
    session,
    memory,
    summarize,
    autoCompact: config.settings.autoCompact !== false,
    autoApproveComputer: config.settings.fullAutomation === true,
    mcpTools,
    callMcp,
    emit,
    requestApproval,
    requestUserChoice,
    signal: controller.signal
  }

  try {
    const participants = (session.group && Array.isArray(session.participants)) ? session.participants : null
    if (participants && participants.length) {
      // group chat: each participant agent responds in turn, seeing the others' replies
      const names = participants.map(id => (config.agents || []).find(a => a.id === id)?.name).filter(Boolean)
      const groupNames = Object.fromEntries(participants.map(id => [id, (config.agents || []).find(a => a.id === id)?.name || 'Agent']))
      for (const pid of participants) {
        if (controller.signal.aborted) break
        const ag = (config.agents || []).find(a => a.id === pid)
        if (!ag) continue
        emit({ type: 'agent_turn', agentId: pid, name: ag.name })
        const groupPersona = `${ag.persona || ''}\n\nThis is a group discussion between ${names.join(', ')}. You are ${ag.name}. The other participants' messages are shown to you tagged like "[Name]: …". Speak only as yourself, in the first person, briefly. Add something new — build on or respectfully challenge what the others said; do not repeat them or role-play the other participants.`
        await runTurn({ ...common, agentId: pid, groupSpeakerId: pid, groupNames, persona: groupPersona, skills: [], useTools: false, computerControl: false })
      }
    } else {
      await runTurn({
        ...common,
        useTools: session.useTools !== false,
        computerControl: Boolean(session.computerControl),
        persona: plannedPersona,
        skills: mergedSkills,
        askAgent,
        peerAgents,
        planMode: Boolean(session.planMode),
        onPlanExit: () => { session.planMode = false; emit({ type: 'plan_mode', on: false }) }
      })
    }
    // auto-title a still-unnamed session from its first user message
    const firstUser = session.messages.find(m => m.role === 'user')
    if (firstUser?.text && session.autoTitle !== false && !controller.signal.aborted) {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim().replace(/^["'#\s]+|["'.…\s]+$/g, '').slice(0, 56)
      // fast heuristic fallback: first several words of the request
      let t = clean(firstUser.text.split(' ').slice(0, 8).join(' '))
      // nicer LLM title, but only for cloud models (local ones are slow / echo the prompt)
      const cloud = ['anthropic', 'openai', 'openrouter', 'nousresearch'].includes(provider.id)
      if (cloud) {
        try {
          const tmp = { cwd: session.cwd, messages: [{ role: 'user', text: `Reply with ONLY a 3-6 word title (no quotes, no punctuation) summarizing this coding request:\n\n${firstUser.text.slice(0, 600)}` }] }
          let out = ''
          await runTurn({
            provider, model: session.model, apiKey,
            getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
            getAccountId: hasOAuth ? () => config.oauth[provider.id]?.accountId || null : null,
            session: tmp, useTools: false, computerControl: false, persona: '', skills: [],
            emit: ev => { if (ev.type === 'text_delta') out += ev.text },
            requestApproval: null, signal: controller.signal
          })
          out = clean(out.split('\n').find(l => l.trim()) || '')
          // use it unless the model just echoed the request
          if (out && !firstUser.text.toLowerCase().startsWith(out.toLowerCase().slice(0, 20))) t = out
        } catch {}
      }
      if (t) { session.title = t; emit({ type: 'title', title: t }) }
    }
    // distill durable facts into long-term memory (best-effort, after the turn)
    if (memoryOn && !session.group && !controller.signal.aborted) {
      try {
        const lastUser = [...session.messages].reverse().find(m => m.role === 'user')
        const lastAsst = [...session.messages].reverse().find(m => m.role === 'assistant')
        const exchange = `User: ${(lastUser?.text || '').slice(0, 1500)}\n\nAssistant: ${(lastAsst?.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ').slice(0, 1500)}`
        const tmp = { cwd: session.cwd, messages: [{ role: 'user', text: `From this exchange, extract any NEW durable facts worth remembering long-term about the USER or their PROJECT — preferences, decisions, names, conventions, tools/environment, or goals. Only lasting facts, not task-specific chatter or one-off requests. Write each as a short standalone sentence, one per line. If there is nothing durable, reply exactly "none".\n\n${exchange}` }] }
        let out = ''
        await runTurn({
          provider, model: session.model, apiKey,
          getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
          getAccountId: hasOAuth ? () => config.oauth[provider.id]?.accountId || null : null,
          session: tmp, useTools: false, computerControl: false, persona: '', skills: [],
          emit: ev => { if (ev.type === 'text_delta') out += ev.text },
          requestApproval: null, signal: controller.signal
        })
        if (out && !/^\s*none\b/i.test(out.trim())) {
          const n = addFacts(out.split('\n').map(l => l.trim()).filter(Boolean), session.cwd)
          if (n) emit({ type: 'memory_added', count: n })
        }
      } catch {}
    }
    // skillsmith: draft a reusable-skill proposal from procedural work (best-effort,
    // cloud models only, and only when the turn looks skill-worthy). Never auto-saves.
    const suggestOn = config.settings.suggestSkills !== false
    const cloud = ['anthropic', 'openai', 'openrouter', 'nousresearch'].includes(provider.id)
    if (suggestOn && cloud && !session.group && !controller.signal.aborted) {
      try {
        const lastUser = [...session.messages].reverse().find(m => m.role === 'user')
        const lastAsst = [...session.messages].reverse().find(m => m.role === 'assistant')
        const alreadyPending = (config.skillSuggestions || []).some(s => s.sessionId === session.id)
        if (!alreadyPending && shouldReflect(lastUser, lastAsst)) {
          const asstText = (lastAsst?.parts || []).filter(p => p.type === 'text').map(p => p.text).join(' ')
          const toolNames = [...new Set((lastAsst?.parts || []).filter(p => p.type === 'tool' && p.name).map(p => p.name))].join(', ')
          const exchange = `User: ${(lastUser?.text || '').slice(0, 1800)}\n\nAssistant (tools used: ${toolNames || 'none'}): ${asstText.slice(0, 1800)}`
          const tmp = { cwd: session.cwd, messages: [{ role: 'user', text: reflectionPrompt(exchange, config.skills || []) }] }
          let out = ''
          await runTurn({
            provider, model: session.model, apiKey,
            getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
            getAccountId: hasOAuth ? () => config.oauth[provider.id]?.accountId || null : null,
            session: tmp, useTools: false, computerControl: false, persona: '', skills: [],
            emit: ev => { if (ev.type === 'text_delta') out += ev.text },
            requestApproval: null, signal: controller.signal
          })
          const proposal = parseProposal(out)
          if (proposal) {
            const sug = addSuggestion(config, proposal, session.id)
            if (sug) { saveConfig(config); emit({ type: 'skill_suggested', suggestion: { id: sug.id, name: sug.name, description: sug.description, rationale: sug.rationale } }) }
          }
        }
      } catch {}
    }
  } catch (e) {
    if (!controller.signal.aborted) emit({ type: 'error', message: e.message })
  } finally {
    activeTurns.delete(sessionId)
    saveSession(session)
    emit({ type: 'closed' })
    res.end()
  }
})

app.post('/api/approve', (req, res) => {
  const { id, approved } = req.body
  const resolve = pendingApprovals.get(id)
  if (resolve) {
    pendingApprovals.delete(id)
    resolve(Boolean(approved))
  }
  res.json({ ok: true })
})

app.post('/api/answer-question', (req, res) => {
  const { id, answer } = req.body
  const resolve = pendingQuestions.get(id)
  if (resolve) { pendingQuestions.delete(id); resolve(String(answer ?? '')) }
  res.json({ ok: true })
})

app.post('/api/abort', (req, res) => {
  const turn = activeTurns.get(req.body.sessionId)
  if (turn) turn.controller.abort()
  res.json({ ok: true })
})

// ---------- static (production build) ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// ---------- terminal over WebSocket ----------
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/term' })
// ws re-emits the http server's 'error' events here; without a listener an
// EADDRINUSE would throw and kill the port-fallback logic below
wss.on('error', e => console.error('[ws]', e.message))

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  // terminal socket is gated too — browsers can't set headers on a WS, so remote
  // clients pass the token as a query param
  if (!isLoopback(req.socket?.remoteAddress)) {
    const tok = url.searchParams.get('token')
    if (!SHARE_TOKEN || tok !== SHARE_TOKEN) { ws.close(1008, 'unauthorized'); return }
  }
  const cwd = url.searchParams.get('cwd') || os.homedir()
  const shell = process.env.SHELL || '/bin/zsh'
  let term
  try {
    term = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: fs.existsSync(cwd) ? cwd : os.homedir(),
      env: { ...process.env, TERM_PROGRAM: 'radiant' }
    })
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: e.message }))
    ws.close()
    return
  }
  term.onData(data => { if (ws.readyState === 1) ws.send(data) })
  term.onExit(() => ws.close())
  ws.on('message', msg => {
    const text = msg.toString()
    if (text.startsWith('\x00resize:')) {
      const [cols, rows] = text.slice(8).split(',').map(Number)
      if (cols > 0 && rows > 0) term.resize(cols, rows)
    } else {
      term.write(text)
    }
  })
  ws.on('close', () => term.kill())
})

// Resolves with the bound port once listening; falls back to a random free
// port if the default is taken (e.g. a dev instance is already running).
export const ready = new Promise((resolve, reject) => {
  server.once('error', err => {
    if (err.code === 'EADDRINUSE') {
      server.listen(0, BIND_HOST, () => resolve(server.address().port))
    } else {
      reject(err)
    }
  })
  server.listen(PORT, BIND_HOST, () => resolve(server.address().port))
})
ready.then(port => console.log(`radiant server listening on http://${BIND_HOST}:${port}${SHARE_ENABLED ? ' (shared — token required for remote clients)' : ''}`))
