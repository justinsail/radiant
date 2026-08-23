// Which Radiant server to talk to. Empty base = this app's own bundled server
// (same origin). A remote base + token points at a shared server on another Mac.
let SERVER = (() => { try { return JSON.parse(localStorage.getItem('radiant.server')) || {} } catch { return {} } })()
export function getServer () { return { ...SERVER } }
export function setServer (s) {
  // A token with no base is valid: the page is served by the shared server
  // itself, so the address is this origin and only the token is needed.
  if (!s || (!s.base && !s.token)) SERVER = {}
  else SERVER = { base: s.base ? String(s.base).replace(/\/$/, '') : '', token: s.token || '' }
  localStorage.setItem('radiant.server', JSON.stringify(SERVER))
}
export function apiUrl (path) { return (SERVER.base || '') + path }
export function authHeaders (extra = {}) { return SERVER.token ? { ...extra, 'x-radiant-token': SERVER.token } : { ...extra } }
// WebSocket URL for the terminal, honoring a remote server + token.
export function wsUrl (path) {
  if (!SERVER.base) { const p = location.protocol === 'https:' ? 'wss' : 'ws'; return `${p}://${location.host}${path}` }
  const u = new URL(SERVER.base)
  const proto = u.protocol === 'https:' ? 'wss' : 'ws'
  const sep = path.includes('?') ? '&' : '?'
  return `${proto}://${u.host}${path}${SERVER.token ? `${sep}token=${encodeURIComponent(SERVER.token)}` : ''}`
}
// Verify a remote server is reachable with the given token (used by the connect UI).
// Is this page being served BY a Radiant server? Then it already knows the
// address — only the token is missing, and asking a phone to retype an IP it
// is literally connected to is busywork.
export function servedByRadiant () {
  return !SERVER.base && location.protocol.startsWith('http')
}
// Sign in against the server that served this page (the phone case).
export async function connectHere (token) {
  await testServer(location.origin, token)
  setServer({ base: '', token })
  return true
}
export async function testServer (base, token) {
  let res
  try {
    res = await fetch(String(base).replace(/\/$/, '') + '/api/config', {
      headers: token ? { 'x-radiant-token': token } : {},
      credentials: 'same-origin'
    })
  } catch {
    throw new Error("Couldn't reach that server. Check the address is right, Radiant is running and shared on the host (v0.6.9+), and both devices are on Tailscale.")
  }
  if (res.status === 401) throw new Error('Reached the server, but the access token is wrong or missing.')
  if (!res.ok) throw new Error(`Server responded ${res.status}`)
  return true
}

async function json (method, path, body) {
  const res = await fetch(apiUrl(path), {
    method,
    headers: authHeaders(body ? { 'content-type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    let msg = `${res.status}`
    try { msg = (await res.json()).error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  getConfig: () => json('GET', '/api/config'),
  saveSettings: s => json('PUT', '/api/settings', s),
  setKey: (providerId, key, opts) => json('POST', `/api/providers/${providerId}/key`, { key, ...(opts || {}) }),
  addProvider: p => json('POST', '/api/providers', p),
  removeProvider: id => json('DELETE', `/api/providers/${id}`),
  activateAccount: (providerId, accountId) => json('POST', `/api/providers/${providerId}/accounts/activate`, { accountId }),
  removeAccount: (providerId, acctId) => json('DELETE', `/api/providers/${providerId}/accounts/${acctId}`),
  designOpen: url => json('POST', '/api/design/open', { url }),
  designPick: () => json('POST', '/api/design/pick'),
  dockerStatus: () => json('GET', '/api/docker-status'),
  getStorage: () => json('GET', '/api/storage'),
  clearSessions: days => json('POST', '/api/storage/clear-sessions', { days }),
  getModels: () => json('GET', '/api/models'),
  listSessions: () => json('GET', '/api/sessions'),
  searchSessions: q => json('GET', `/api/sessions-search?q=${encodeURIComponent(q)}`),
  createSession: body => json('POST', '/api/sessions', body || {}),
  getSession: id => json('GET', `/api/sessions/${id}`),
  patchSession: (id, body) => json('PATCH', `/api/sessions/${id}`, body),
  deleteSession: id => json('DELETE', `/api/sessions/${id}`),
  truncateSession: (id, index) => json('POST', `/api/sessions/${id}/truncate`, { index }),
  approve: (id, approved) => json('POST', '/api/approve', { id, approved }),
  abort: sessionId => json('POST', '/api/abort', { sessionId }),
  getSystem: () => json('GET', '/api/system'),
  getLocalModels: () => json('GET', '/api/local-models'),
  deleteLocalModel: name => json('DELETE', `/api/local-models/${encodeURIComponent(name)}`),
  registrySearch: (q, sort = 'downloads') => json('GET', `/api/registry-search?q=${encodeURIComponent(q)}&sort=${sort}`),
  registryFiles: repo => json('GET', `/api/registry-files?repo=${encodeURIComponent(repo)}`),
  oauthProviders: () => json('GET', '/api/oauth/providers'),
  oauthStart: (id, opts) => json('POST', `/api/oauth/${id}/start`, opts || {}),
  oauthComplete: (id, code) => json('POST', `/api/oauth/${id}/complete`, { code }),
  oauthStatus: id => json('GET', `/api/oauth/${id}/status`),
  oauthSignout: id => json('POST', `/api/oauth/${id}/signout`),
  oauthDeviceStart: (id, opts) => json('POST', `/api/oauth/${id}/device/start`, opts || {}),
  oauthDevicePoll: id => json('POST', `/api/oauth/${id}/device/poll`),
  getVersion: () => json('GET', '/api/version'),
  updateCheck: () => json('GET', '/api/update-check'),
  computerStatus: () => json('GET', '/api/computer-status'),
  quantizeCandidates: () => json('GET', '/api/quantize/candidates'),
  getUsage: () => json('GET', '/api/usage'),
  searchFiles: (cwd, q) => json('GET', `/api/files?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`),
  addSkill: skill => json('POST', '/api/skills', skill),
  updateSkill: (id, patch) => json('PATCH', `/api/skills/${id}`, patch),
  deleteSkill: id => json('DELETE', `/api/skills/${id}`),
  acceptSkillSuggestion: id => json('POST', `/api/skill-suggestions/${id}/accept`),
  rejectSkillSuggestion: id => json('POST', `/api/skill-suggestions/${id}/reject`),
  addRecipe: r => json('POST', '/api/recipes', r),
  updateRecipe: (id, patch) => json('PATCH', `/api/recipes/${id}`, patch),
  deleteRecipe: id => json('DELETE', `/api/recipes/${id}`),
  externalAgents: () => json('GET', '/api/external-agents'),
  addAgent: agent => json('POST', '/api/agents', agent),
  updateAgent: (id, patch) => json('PATCH', `/api/agents/${id}`, patch),
  deleteAgent: id => json('DELETE', `/api/agents/${id}`),
  mcpStatus: () => json('GET', '/api/mcp/status'),
  addMcp: server => json('POST', '/api/mcp', server),
  updateMcp: (id, patch) => json('PATCH', `/api/mcp/${id}`, patch),
  deleteMcp: id => json('DELETE', `/api/mcp/${id}`),
  getShare: () => json('GET', '/api/share'),
  setShare: enabled => json('POST', '/api/share', { enabled }),
  openFile: p => json('POST', '/api/open', { path: p }),
  answerQuestion: (id, answer) => json('POST', '/api/answer-question', { id, answer }),
  getMemory: () => json('GET', '/api/memory'),
  addMemory: text => json('POST', '/api/memory', { text }),
  deleteMemory: id => json('DELETE', `/api/memory/${id}`),
  clearMemory: () => json('POST', '/api/memory/clear')
}

// POST /api/quantize streams progress lines back on the response body.
export async function streamQuantize (body, onEvent) {
  const res = await fetch(apiUrl('/api/quantize'), {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      try { onEvent(JSON.parse(line.slice(5))) } catch {}
    }
  }
}

// POST /api/pull streams SSE progress events back on the response body.
export async function streamPull (model, onEvent, signal) {
  const res = await fetch(apiUrl('/api/pull'), {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ model }),
    signal
  })
  if (!res.ok) throw new Error(`${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      try { onEvent(JSON.parse(line.slice(5))) } catch {}
    }
  }
}

// Downloads run detached on the server; start one, then poll getDownloads().
export async function startDownload ({ repo, files, model }) {
  const res = await fetch(apiUrl('/api/download'), {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ repo, files, model })
  })
  if (!res.ok) { let m = `${res.status}`; try { m = (await res.json()).error || m } catch {}; throw new Error(m) }
  return res.json()
}
export async function getDownloads () {
  const res = await fetch(apiUrl('/api/downloads'), { headers: authHeaders() })
  return res.ok ? res.json() : []
}
export async function cancelDownload (model) {
  await fetch(apiUrl('/api/download/cancel'), { method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ model }) })
}

// POST /api/chat streams SSE back on the response body.
export async function streamChat (sessionId, content, onEvent) {
  const res = await fetch(apiUrl('/api/chat'), {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ sessionId, content })
  })
  if (!res.ok) {
    let msg = `${res.status}`
    try { msg = (await res.json()).error || msg } catch {}
    throw new Error(msg)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      try { onEvent(JSON.parse(line.slice(5))) } catch {}
    }
  }
}
