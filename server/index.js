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
import { loadConfig, saveConfig, publicConfig, listSessions, loadSession, saveSession, deleteSession } from './config.js'
import { runTurn, listModels } from './providers.js'
import { OAUTH_PROVIDERS, buildAuthUrl, completePaste, startLoopback, validAccessToken } from './oauth.js'
import { checkForUpdate } from './updater.js'
import { ollamaBin, SPAWN_ENV } from './ollama.js'

const PORT = Number(process.env.RADIANT_PORT || 5834)
const app = express()
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
  const { key } = req.body
  if (key) config.keys[req.params.id] = key
  else delete config.keys[req.params.id]
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
  const { name, emoji, icon, hue, persona, model, provider, skills, useTools, computerControl } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  config.agents = config.agents || []
  config.agents.push({
    id: 'ag-' + crypto.randomBytes(4).toString('hex'),
    name, emoji: emoji || '🤖', icon: icon || null, hue: hue ?? 258, persona: persona || '',
    model: model || null, provider: provider || null, skills: skills || [],
    useTools: useTools !== false, computerControl: Boolean(computerControl)
  })
  saveConfig(config)
  res.json(publicConfig(config))
})

app.patch('/api/agents/:id', (req, res) => {
  const a = (config.agents || []).find(x => x.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'not found' })
  for (const k of ['name', 'emoji', 'icon', 'hue', 'persona', 'model', 'provider', 'skills', 'useTools', 'computerControl']) {
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
  config.skills = (config.skills || []).filter(s => s.id !== req.params.id)
  saveConfig(config)
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
    const { url, mode } = buildAuthUrl(req.params.id)
    if (mode === 'loopback') {
      startLoopback(req.params.id, (err, tok) => {
        if (!err && tok) { config.oauth[req.params.id] = tok; saveConfig(config) }
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
    config.oauth[req.params.id] = tok
    saveConfig(config)
    res.json(publicConfig(config))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// poll whether a loopback sign-in has landed
app.get('/api/oauth/:id/status', (req, res) => {
  res.json({ signedIn: Boolean(config.oauth[req.params.id]) })
})

app.post('/api/oauth/:id/signout', (req, res) => {
  delete config.oauth[req.params.id]
  saveConfig(config)
  res.json(publicConfig(config))
})

// ---------- models ----------
app.get('/api/models', async (req, res) => {
  const results = await Promise.all(config.providers.map(async p => {
    const hasKey = Boolean(config.keys[p.id])
    const hasOAuth = Boolean(config.oauth[p.id])
    if (p.auth === 'key' && !hasKey && !hasOAuth) return []
    const accessToken = hasOAuth ? await validAccessToken(p.id, config, saveConfig).catch(() => null) : null
    const models = await listModels(p, config.keys[p.id], accessToken)
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
  res.json({
    chip,
    ramGB: Math.round(os.totalmem() / (1024 ** 3)),
    cores: os.cpus().length,
    arch: os.arch(),
    platform: os.platform(),
    osVersion
  })
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
  const session = {
    id: crypto.randomUUID(),
    title: req.body.title || 'New session',
    agentId: agent ? agent.id : null,
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

app.get('/api/sessions/:id', (req, res) => {
  const s = loadSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  res.json(s)
})

app.patch('/api/sessions/:id', (req, res) => {
  const s = loadSession(req.params.id)
  if (!s) return res.status(404).json({ error: 'not found' })
  for (const k of ['title', 'model', 'provider', 'cwd', 'useTools', 'computerControl', 'agentId', 'pinned']) {
    if (k in req.body) s[k] = req.body[k]
  }
  saveSession(s)
  res.json(s)
})

app.delete('/api/sessions/:id', (req, res) => {
  deleteSession(req.params.id)
  res.json({ ok: true })
})

// ---------- chat (SSE) ----------
app.post('/api/chat', async (req, res) => {
  config = loadConfig() // see the latest keys/oauth before the turn
  const { sessionId, content } = req.body
  const session = loadSession(sessionId)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (activeTurns.has(sessionId)) return res.status(409).json({ error: 'a turn is already running' })

  const provider = config.providers.find(p => p.id === session.provider)
  if (!provider) return res.status(400).json({ error: 'Pick a model first — no provider set on this session.' })
  const apiKey = config.keys[provider.id]
  const hasOAuth = Boolean(config.oauth[provider.id])
  if (provider.auth === 'key' && !apiKey && !hasOAuth) return res.status(400).json({ error: `No API key or subscription sign-in for ${provider.name}. Add one in Settings.` })

  // agent (persona + its skills) plus globally-enabled skills
  const agent = session.agentId ? (config.agents || []).find(a => a.id === session.agentId) : null
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
  if (session.messages.length === 1) {
    session.title = text.length > 48 ? text.slice(0, 48) + '…' : (text || `${attachments.length} file(s)`)
    emit({ type: 'title', title: session.title })
  }
  saveSession(session)

  const controller = new AbortController()
  activeTurns.set(sessionId, { controller })
  // res 'close' fires on client disconnect (req 'close' fires once the body is
  // consumed in modern Node, which would abort the turn immediately)
  res.on('close', () => { if (!res.writableEnded) controller.abort() })

  const requestApproval = call => new Promise(resolve => {
    if (!config.settings.approveCommands) return resolve(true)
    pendingApprovals.set(call.id, resolve)
    emit({ type: 'approval_request', id: call.id, name: call.name, args: call.args })
    setTimeout(() => {
      if (pendingApprovals.delete(call.id)) resolve(false)
    }, 10 * 60 * 1000)
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

  try {
    await runTurn({
      provider,
      model: session.model,
      apiKey,
      getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
      getAccountId: hasOAuth ? () => config.oauth[provider.id]?.accountId || null : null,
      session,
      useTools: session.useTools !== false,
      computerControl: Boolean(session.computerControl),
      persona: agent?.persona || '',
      skills: mergedSkills,
      mcpTools,
      callMcp,
      askAgent,
      peerAgents,
      emit,
      requestApproval,
      signal: controller.signal
    })
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
