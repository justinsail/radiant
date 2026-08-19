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
  abort: sessionId => json('POST', '/api/abort', { sessionId })
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
