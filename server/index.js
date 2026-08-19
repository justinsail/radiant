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
    if (p.auth === 'key' && !config.keys[p.id]) return []
    const models = await listModels(p, config.keys[p.id])
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
      // skip vision projectors / adapters — they're companion files, not weights,
      // and their tiny size mislabels the quant list (e.g. a 0.9 GB "F16")
      if (/mmproj|projector|\bproj\b|lora|adapter/i.test(f)) continue
      const parts = f.split('/')
      let label = null
      if (parts.length > 1 && /^(i?q\d|f16|f32|bf16)/i.test(parts[0])) label = parts[0]
      else {
        const m = f.match(/[.\-_](I?Q\d[\w]*?|F16|F32|BF16)(?:[.\-_]\d+-of-\d+)?\.gguf$/i)
        label = m ? m[1] : 'default'
      }
      label = label.toUpperCase()
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
  const session = {
    id: crypto.randomUUID(),
    title: req.body.title || 'New session',
    provider: req.body.provider || null,
    model: req.body.model || config.settings.defaultModel,
    cwd: req.body.cwd || config.settings.defaultCwd || os.homedir(),
    useTools: req.body.useTools !== false,
    computerControl: Boolean(req.body.computerControl),
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
  for (const k of ['title', 'model', 'provider', 'cwd', 'useTools', 'computerControl']) {
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
  const { sessionId, content } = req.body
  const session = loadSession(sessionId)
  if (!session) return res.status(404).json({ error: 'session not found' })
  if (activeTurns.has(sessionId)) return res.status(409).json({ error: 'a turn is already running' })

  const provider = config.providers.find(p => p.id === session.provider)
  if (!provider) return res.status(400).json({ error: 'Pick a model first — no provider set on this session.' })
  const apiKey = config.keys[provider.id]
  const hasOAuth = Boolean(config.oauth[provider.id])
  if (provider.auth === 'key' && !apiKey && !hasOAuth) return res.status(400).json({ error: `No API key or subscription sign-in for ${provider.name}. Add one in Settings.` })

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
