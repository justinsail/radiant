import os from 'os'
import { TOOL_DEFS, runTool } from './tools.js'
import { COMPUTER_TOOL_DEFS, COMPUTER_TOOL_NAMES, COMPUTER_SAFE, runComputerTool } from './computer-tools.js'

const MAX_ROUNDS = 30

function systemPrompt (cwd, useTools, model, computerControl, skills, persona) {
  const personaText = persona ? `\n\n${persona}` : ''
  const skillText = (skills && skills.length)
    ? `\n\nActive skills (follow these):\n${skills.map(s => `• ${s.name}: ${s.content}`).join('\n')}`
    : ''
  return `You are a coding agent running inside Radiant, a local coding harness on the user's ${os.type() === 'Darwin' ? 'Mac' : os.type()} (${os.platform()} ${os.release()}). Radiant is the app, not you: you are the model "${model}". If asked what model you are, answer with your actual model name and maker.${personaText}
Workspace directory: ${cwd}
${useTools ? 'You have tools to read, write, and edit files and to run shell commands in the workspace. Use them to investigate before answering and to make changes when asked. Prefer edit_file for small changes and write_file for new files. After making changes, verify them when practical (run the code, run tests).' : 'Tools are disabled for this conversation; answer from knowledge and the conversation only.'}${computerControl ? `
You can also control the computer. browser_* tools drive an automated browser; screen_* tools control the whole desktop. ALWAYS take a screenshot first (browser_screenshot / screen_screenshot) and look at it before clicking or typing — click coordinates are pixel positions read from the most recent screenshot. Work in small steps: screenshot, act, screenshot again to confirm. Prefer browser_* for web tasks.` : ''}
Be direct and concise. Use markdown; fence code blocks with a language tag. When you finish a task, summarize what changed in a sentence or two.${skillText}`
}

// ---------- internal message format -> provider wire formats ----------
// session.messages: [{role:'user', text, attachments} | {role:'assistant', parts:[{type:'text',text}|{type:'tool',id,name,args,result}]}]
// attachment: { name, mime, dataB64, kind:'image'|'text' }

// text-file attachments get inlined into the prompt; images stay as data.
function userText (m) {
  let t = m.text || ''
  for (const a of m.attachments || []) {
    if (a.kind === 'text') {
      const body = Buffer.from(a.dataB64, 'base64').toString('utf8')
      t += `\n\n--- attached file: ${a.name} ---\n${body}`
    }
  }
  return t
}
const imageAttachments = m => (m.attachments || []).filter(a => a.kind === 'image')

function toAnthropic (messages) {
  const out = []
  for (const m of messages) {
    if (m.role === 'user') {
      const content = []
      const txt = userText(m)
      if (txt) content.push({ type: 'text', text: txt })
      for (const a of imageAttachments(m)) {
        content.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.dataB64 } })
      }
      out.push({ role: 'user', content: content.length ? content : [{ type: 'text', text: '(empty)' }] })
      continue
    }
    let blocks = []
    let pendingTools = []
    const flush = () => {
      if (pendingTools.length) {
        out.push({ role: 'assistant', content: [...blocks, ...pendingTools.map(t => ({ type: 'tool_use', id: t.id, name: t.name, input: t.args }))] })
        out.push({
          role: 'user',
          content: pendingTools.map(t => {
            const c = [{ type: 'text', text: String(t.result ?? '') }]
            if (t.resultImage) c.push({ type: 'image', source: { type: 'base64', media_type: t.resultImage.mime, data: t.resultImage.dataB64 } })
            return { type: 'tool_result', tool_use_id: t.id, content: c }
          })
        })
        blocks = []; pendingTools = []
      }
    }
    for (const p of m.parts) {
      if (p.type === 'text') { flush(); if (p.text) blocks.push({ type: 'text', text: p.text }) }
      else if (p.type === 'tool') pendingTools.push(p)
    }
    flush()
    if (blocks.length) out.push({ role: 'assistant', content: blocks })
  }
  return out
}

function toOpenAI (messages, system) {
  const out = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') {
      const imgs = imageAttachments(m)
      if (imgs.length) {
        const content = [{ type: 'text', text: userText(m) }]
        for (const a of imgs) content.push({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.dataB64}` } })
        out.push({ role: 'user', content })
      } else {
        out.push({ role: 'user', content: userText(m) })
      }
      continue
    }
    let text = ''
    let pendingTools = []
    const flush = () => {
      if (pendingTools.length) {
        out.push({
          role: 'assistant',
          content: text || null,
          tool_calls: pendingTools.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } }))
        })
        for (const t of pendingTools) out.push({ role: 'tool', tool_call_id: t.id, content: String(t.result ?? '') })
        // OpenAI tool results can't carry images; surface any screenshots as a
        // follow-up user message so vision models can see them
        const imgs = pendingTools.filter(t => t.resultImage)
        if (imgs.length) {
          out.push({ role: 'user', content: imgs.map(t => ({ type: 'image_url', image_url: { url: `data:${t.resultImage.mime};base64,${t.resultImage.dataB64}` } })) })
        }
        text = ''; pendingTools = []
      }
    }
    for (const p of m.parts) {
      if (p.type === 'text') { flush(); text += p.text || '' }
      else if (p.type === 'tool') pendingTools.push(p)
    }
    flush()
    if (text) out.push({ role: 'assistant', content: text })
  }
  return out
}

// Turn a provider HTTP error body into a short, actionable message.
async function httpErr (res) {
  let raw = ''
  try { raw = await res.text() } catch {}
  let msg = raw
  try { msg = JSON.parse(raw).error?.message || msg } catch {}
  if (/missing_scope|model\.request|insufficient permissions/i.test(raw)) {
    return new Error(`${res.status}: This API key is restricted and can't call models. Create a new key with default (full) permissions — or ensure the "model.request" scope and a Writer/Owner role — then paste it in Settings → Providers.`)
  }
  if (res.status === 401) return new Error(`401: Authentication failed — check the API key (or re-sign-in) for this provider in Settings → Providers.`)
  if (res.status === 402 || /insufficient|quota|billing|credit/i.test(raw)) return new Error(`${res.status}: ${msg} — this usually means the account is out of credit/quota.`)
  return new Error(`${res.status}: ${msg || 'request failed'}`)
}

// ---------- SSE line reader ----------
async function * sseEvents (response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      try { yield JSON.parse(data) } catch { /* partial or keepalive */ }
    }
  }
}

// ---------- single API round, streaming; returns {parts, stopOnTools} ----------
async function anthropicRound ({ baseUrl, apiKey, accessToken, model, messages, system, tools, toolDefs, emit, signal }) {
  // Subscription (OAuth) requests must present as Claude Code: the first system
  // block is the CLI's identity, auth is Bearer, and the oauth beta is set.
  const CLAUDE_CODE_ID = "You are Claude Code, Anthropic's official CLI for Claude."
  const sys = accessToken
    ? [{ type: 'text', text: CLAUDE_CODE_ID }, { type: 'text', text: system }]
    : system
  const body = { model, max_tokens: 8192, system: sys, messages, stream: true }
  if (tools) body.tools = (toolDefs || TOOL_DEFS).map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`
    headers['anthropic-beta'] = 'oauth-2025-04-20,claude-code-20250219'
  } else {
    headers['x-api-key'] = apiKey
  }
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) throw await httpErr(res)

  const parts = []
  let current = null // {type:'text',text} or {type:'tool',id,name,json}
  let stopReason = null
  for await (const ev of sseEvents(res)) {
    if (ev.type === 'message_start' && ev.message?.usage) emit({ type: 'usage', input: ev.message.usage.input_tokens, output: 0 })
    else if (ev.type === 'content_block_start') {
      const b = ev.content_block
      if (b.type === 'text') current = { type: 'text', text: '' }
      else if (b.type === 'thinking') current = { type: 'thinking' }
      else if (b.type === 'tool_use') current = { type: 'tool', id: b.id, name: b.name, json: '' }
      else current = { type: 'skip' }
    } else if (ev.type === 'content_block_delta') {
      const d = ev.delta
      if (d.type === 'text_delta' && current?.type === 'text') { current.text += d.text; emit({ type: 'text_delta', text: d.text }) }
      else if (d.type === 'thinking_delta') emit({ type: 'thinking_delta', text: d.thinking })
      else if (d.type === 'input_json_delta' && current?.type === 'tool') current.json += d.partial_json
    } else if (ev.type === 'content_block_stop') {
      if (current?.type === 'text' && current.text) parts.push({ type: 'text', text: current.text })
      else if (current?.type === 'tool') {
        let args = {}
        try { args = current.json ? JSON.parse(current.json) : {} } catch {}
        parts.push({ type: 'tool', id: current.id, name: current.name, args })
      }
      current = null
    } else if (ev.type === 'message_delta') {
      stopReason = ev.delta?.stop_reason || stopReason
      if (ev.usage) emit({ type: 'usage', output: ev.usage.output_tokens })
    } else if (ev.type === 'error') {
      throw new Error(ev.error?.message || 'stream error')
    }
  }
  return { parts, stopOnTools: stopReason === 'tool_use' }
}

async function openaiRound ({ baseUrl, apiKey, accessToken, model, messages, tools, toolDefs, emit, signal }) {
  const body = { model, messages, stream: true }
  if (tools) {
    body.tools = (toolDefs || TOOL_DEFS).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  }
  const headers = { 'content-type': 'application/json' }
  const bearer = accessToken || apiKey
  if (bearer) headers.authorization = `Bearer ${bearer}`
  const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!res.ok) throw await httpErr(res)

  let text = ''
  const calls = [] // by index: {id, name, args:''}
  let finish = null
  for await (const chunk of sseEvents(res)) {
    const choice = chunk.choices?.[0]
    if (chunk.usage) emit({ type: 'usage', input: chunk.usage.prompt_tokens, output: chunk.usage.completion_tokens })
    if (!choice) continue
    const d = choice.delta || {}
    const reasoning = d.reasoning_content ?? d.reasoning
    if (reasoning) emit({ type: 'thinking_delta', text: reasoning })
    if (d.content) { text += d.content; emit({ type: 'text_delta', text: d.content }) }
    for (const tc of d.tool_calls || []) {
      const i = tc.index ?? 0
      calls[i] = calls[i] || { id: tc.id || `call_${i}_${calls.length}`, name: '', args: '' }
      if (tc.id) calls[i].id = tc.id
      if (tc.function?.name) calls[i].name += tc.function.name
      if (tc.function?.arguments) calls[i].args += tc.function.arguments
    }
    if (choice.finish_reason) finish = choice.finish_reason
  }
  const parts = []
  if (text) parts.push({ type: 'text', text })
  for (const c of calls.filter(Boolean)) {
    let args = {}
    try { args = c.args ? JSON.parse(c.args) : {} } catch {}
    parts.push({ type: 'tool', id: c.id, name: c.name, args })
  }
  return { parts, stopOnTools: finish === 'tool_calls' || calls.filter(Boolean).length > 0 }
}

// ---------- the agent loop ----------
export async function runTurn ({ provider, model, apiKey, getAccessToken, session, useTools, computerControl, skills, persona, mcpTools, callMcp, emit, requestApproval, signal }) {
  const cwd = session.cwd || os.homedir()
  const system = systemPrompt(cwd, useTools, model, computerControl, skills, persona)
  const assistant = { role: 'assistant', model, parts: [] }
  session.messages.push(assistant)

  const accessToken = getAccessToken ? await getAccessToken() : null
  const toolDefs = [
    ...TOOL_DEFS,
    ...(computerControl ? COMPUTER_TOOL_DEFS : []),
    ...(mcpTools || [])
  ]

  let toolsEnabled = useTools
  for (let round = 0; round < MAX_ROUNDS; round++) {
    emit({ type: 'round_start', round })
    const args = {
      baseUrl: provider.baseUrl,
      apiKey,
      accessToken,
      model,
      system,
      tools: toolsEnabled,
      toolDefs,
      emit,
      signal
    }
    let result
    try {
      result = provider.type === 'anthropic'
        ? await anthropicRound({ ...args, messages: toAnthropic(session.messages) })
        : await openaiRound({ ...args, messages: toOpenAI(session.messages, system) })
    } catch (e) {
      // Model doesn't support tools (common with local models) -> retry once without them.
      if (toolsEnabled && round === 0 && /tool/i.test(e.message) && /support|invalid|unknown|400/i.test(e.message)) {
        toolsEnabled = false
        emit({ type: 'notice', text: 'This model does not support tools — continuing in chat-only mode.' })
        continue
      }
      throw e
    }

    const toolParts = result.parts.filter(p => p.type === 'tool')
    for (const p of result.parts) {
      if (p.type === 'text') assistant.parts.push(p)
    }
    if (!toolParts.length || !result.stopOnTools) { emit({ type: 'done' }); return }

    for (const call of toolParts) {
      const part = { type: 'tool', id: call.id, name: call.name, args: call.args }
      assistant.parts.push(part)
      emit({ type: 'tool_start', id: call.id, name: call.name, args: call.args })
      const isComputer = COMPUTER_TOOL_NAMES.has(call.name)
      const isMcp = call.name.startsWith('mcp__')
      const needsApproval = requestApproval && (call.name === 'run_command' || isMcp || (isComputer && !COMPUTER_SAFE.has(call.name)))
      const approved = needsApproval ? await requestApproval(call) : true
      if (signal.aborted) return
      if (!approved) {
        part.denied = true
        part.result = 'The user declined this action. Ask them how they would like to proceed, or try a different approach.'
      } else if (isMcp) {
        part.result = callMcp ? await callMcp(call.name, call.args) : 'MCP tool unavailable.'
      } else if (isComputer) {
        const r = await runComputerTool(call.name, call.args)
        part.result = r.content
        if (r.image) part.resultImage = r.image
      } else {
        part.result = await runTool(call.name, call.args, cwd)
      }
      emit({ type: 'tool_result', id: call.id, result: part.result, denied: !approved, hasImage: Boolean(part.resultImage) })
    }
  }
  emit({ type: 'notice', text: `Stopped after ${MAX_ROUNDS} tool rounds.` })
  emit({ type: 'done' })
}

// Fallback model lists for subscription sign-ins whose model endpoints aren't
// reachable with an OAuth token (e.g. ChatGPT). Keeps the picker usable.
const SUBSCRIPTION_MODELS = {
  anthropic: ['claude-opus-4-1', 'claude-sonnet-4-5', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  openai: ['gpt-5', 'gpt-5-codex', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini']
}

// ---------- model listing ----------
// apiKey OR accessToken (OAuth subscription). For OAuth, auth is Bearer.
export async function listModels (provider, apiKey, accessToken) {
  try {
    if (provider.type === 'anthropic') {
      const headers = { 'anthropic-version': '2023-06-01' }
      if (accessToken) { headers.authorization = `Bearer ${accessToken}`; headers['anthropic-beta'] = 'oauth-2025-04-20' }
      else headers['x-api-key'] = apiKey
      const res = await fetch(`${provider.baseUrl}/v1/models?limit=100`, { headers, signal: AbortSignal.timeout(6000) })
      if (!res.ok) return fallback(provider, accessToken, apiKey)
      const data = await res.json()
      const list = (data.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }))
      return list.length ? list : fallback(provider, accessToken)
    }
    const headers = {}
    const bearer = accessToken || apiKey
    if (bearer) headers.authorization = `Bearer ${bearer}`
    const res = await fetch(`${provider.baseUrl}/models`, { headers, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return fallback(provider, accessToken, apiKey)
    const data = await res.json()
    const list = (data.data || []).map(m => ({ id: m.id, label: m.name || m.id }))
    return list.length ? list : fallback(provider, accessToken)
  } catch {
    return fallback(provider, accessToken, apiKey)
  }
}

// shown if a key provider's /models call fails but a key is present
const KEY_FALLBACK_MODELS = {
  nousresearch: ['Hermes-4-405B', 'Hermes-4-70B', 'Hermes-4.3-36B']
}

function fallback (provider, accessToken, apiKey) {
  if (accessToken && SUBSCRIPTION_MODELS[provider.id]) {
    return SUBSCRIPTION_MODELS[provider.id].map(id => ({ id, label: id }))
  }
  if (apiKey && KEY_FALLBACK_MODELS[provider.id]) {
    return KEY_FALLBACK_MODELS[provider.id].map(id => ({ id, label: id }))
  }
  return []
}
