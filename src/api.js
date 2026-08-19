async function json (method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
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
  setKey: (providerId, key) => json('POST', `/api/providers/${providerId}/key`, { key }),
  addProvider: p => json('POST', '/api/providers', p),
  removeProvider: id => json('DELETE', `/api/providers/${id}`),
  getModels: () => json('GET', '/api/models'),
  listSessions: () => json('GET', '/api/sessions'),
  createSession: body => json('POST', '/api/sessions', body || {}),
  getSession: id => json('GET', `/api/sessions/${id}`),
  patchSession: (id, body) => json('PATCH', `/api/sessions/${id}`, body),
  deleteSession: id => json('DELETE', `/api/sessions/${id}`),
  approve: (id, approved) => json('POST', '/api/approve', { id, approved }),
  abort: sessionId => json('POST', '/api/abort', { sessionId }),
  getSystem: () => json('GET', '/api/system'),
  getLocalModels: () => json('GET', '/api/local-models'),
  deleteLocalModel: name => json('DELETE', `/api/local-models/${encodeURIComponent(name)}`),
  registrySearch: (q, sort = 'downloads') => json('GET', `/api/registry-search?q=${encodeURIComponent(q)}&sort=${sort}`),
  registryFiles: repo => json('GET', `/api/registry-files?repo=${encodeURIComponent(repo)}`),
  oauthProviders: () => json('GET', '/api/oauth/providers'),
  oauthStart: id => json('POST', `/api/oauth/${id}/start`),
  oauthComplete: (id, code) => json('POST', `/api/oauth/${id}/complete`, { code }),
  oauthStatus: id => json('GET', `/api/oauth/${id}/status`),
  oauthSignout: id => json('POST', `/api/oauth/${id}/signout`),
  getVersion: () => json('GET', '/api/version'),
  updateCheck: () => json('GET', '/api/update-check'),
  computerStatus: () => json('GET', '/api/computer-status'),
  quantizeCandidates: () => json('GET', '/api/quantize/candidates'),
  getUsage: () => json('GET', '/api/usage'),
  searchFiles: (cwd, q) => json('GET', `/api/files?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`),
  addSkill: skill => json('POST', '/api/skills', skill),
  updateSkill: (id, patch) => json('PATCH', `/api/skills/${id}`, patch),
  deleteSkill: id => json('DELETE', `/api/skills/${id}`),
  addAgent: agent => json('POST', '/api/agents', agent),
  updateAgent: (id, patch) => json('PATCH', `/api/agents/${id}`, patch),
  deleteAgent: id => json('DELETE', `/api/agents/${id}`),
  mcpStatus: () => json('GET', '/api/mcp/status'),
  addMcp: server => json('POST', '/api/mcp', server),
  updateMcp: (id, patch) => json('PATCH', `/api/mcp/${id}`, patch),
  deleteMcp: id => json('DELETE', `/api/mcp/${id}`)
}

// POST /api/quantize streams progress lines back on the response body.
export async function streamQuantize (body, onEvent) {
  const res = await fetch('/api/quantize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  const res = await fetch('/api/pull', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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

// POST /api/chat streams SSE back on the response body.
export async function streamChat (sessionId, content, onEvent) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
