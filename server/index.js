import express from 'express'
import http from 'http'
import crypto from 'crypto'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import pty from 'node-pty'
import { execSync } from 'child_process'
import { loadConfig, saveConfig, publicConfig, listSessions, loadSession, saveSession, deleteSession } from './config.js'
import { runTurn, listModels } from './providers.js'
import { OAUTH_PROVIDERS, buildAuthUrl, completePaste, startLoopback, validAccessToken } from './oauth.js'
import { checkForUpdate } from './updater.js'

const PORT = Number(process.env.RADIANT_PORT || 5834)
const app = express()
app.use(express.json({ limit: '10mb' }))

const __dirname0 = path.dirname(fileURLToPath(import.meta.url))
const APP_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname0, '..', 'package.json'), 'utf8')).version } catch { return '0.0.0' }
})()

let config = loadConfig()

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

// ---------- config ----------
app.get('/api/config', (req, res) => res.json(publicConfig(config)))

app.put('/api/settings', (req, res) => {
  config.settings = { ...config.settings, ...req.body }
  saveConfig(config)
  res.json(publicConfig(config))
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
  // subscription sign-ins: limits aren't exposed via a stable API, note them
  for (const id of ['anthropic', 'openai']) {
    if (config.oauth[id]) out.push({ provider: id, label: id === 'anthropic' ? 'Claude' : 'ChatGPT', kind: 'subscription' })
  }
  res.json({ items: out })
})

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
    const quants = {} // label -> {bytes, files}
    for (const s of data.siblings || []) {
      const f = s.rfilename
      if (!/\.gguf$/i.test(f)) continue
      // only top-level, single-file quants are pullable via `ollama pull hf.co/…:TAG`.
      // skip: subfolder files (shards + companion drafts like MTP/), sharded
      // multi-part quants (Ollama can't pull those), and non-weight companions.
      if (f.includes('/')) continue
      if (/-\d+-of-\d+\.gguf$/i.test(f)) continue
      if (/mmproj|projector|\bproj\b|lora|adapter|draft|\bmtp\b/i.test(f)) continue
      const m = f.match(/[.\-_](I?Q\d[\w]*?|F16|F32|BF16)\.gguf$/i)
      const label = (m ? m[1] : 'default').toUpperCase()
      quants[label] = quants[label] || { bytes: 0, files: 0 }
      quants[label].bytes += s.size || 0
      quants[label].files += 1
    }
    res.json({
      repo,
      quants: Object.entries(quants)
        .map(([label, v]) => ({ label, sizeGB: +(v.bytes / 1024 ** 3).toFixed(1), files: v.files }))
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

// pull a model through Ollama, streaming progress back as SSE
app.post('/api/pull', async (req, res) => {
  const { model } = req.body
  if (!model || !/^[\w.\/:-]+$/.test(model)) return res.status(400).json({ error: 'bad model tag' })
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  const emit = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`)
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
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
          emit({ status: j.status, completed: j.completed, total: j.total, error: j.error })
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

  try {
    await runTurn({
      provider,
      model: session.model,
      apiKey,
      getAccessToken: hasOAuth ? () => validAccessToken(provider.id, config, saveConfig) : null,
      session,
      useTools: session.useTools !== false,
      computerControl: Boolean(session.computerControl),
      persona: agent?.persona || '',
      skills: mergedSkills,
      mcpTools,
      callMcp,
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
      server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    } else {
      reject(err)
    }
  })
  server.listen(PORT, '127.0.0.1', () => resolve(server.address().port))
})
ready.then(port => console.log(`radiant server listening on http://127.0.0.1:${port}`))
