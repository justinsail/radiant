import os from 'os'
import { TOOL_DEFS, runTool } from './tools.js'

const MAX_ROUNDS = 30

function systemPrompt (cwd, useTools) {
  return `You are Radiant, a coding agent running on the user's ${os.type() === 'Darwin' ? 'Mac' : os.type()} (${os.platform()} ${os.release()}).
Workspace directory: ${cwd}
${useTools ? 'You have tools to read, write, and edit files and to run shell commands in the workspace. Use them to investigate before answering and to make changes when asked. Prefer edit_file for small changes and write_file for new files. After making changes, verify them when practical (run the code, run tests).' : 'Tools are disabled for this conversation; answer from knowledge and the conversation only.'}
Be direct and concise. Use markdown; fence code blocks with a language tag. When you finish a task, summarize what changed in a sentence or two.`
}

// ---------- internal message format -> provider wire formats ----------
// session.messages: [{role:'user', text} | {role:'assistant', parts:[{type:'text',text}|{type:'tool',id,name,args,result}]}]

function toAnthropic (messages) {
  const out = []
  for (const m of messages) {
    if (m.role === 'user') { out.push({ role: 'user', content: [{ type: 'text', text: m.text }] }); continue }
    let blocks = []
    let pendingTools = []
    const flush = () => {
      if (pendingTools.length) {
        out.push({ role: 'assistant', content: [...blocks, ...pendingTools.map(t => ({ type: 'tool_use', id: t.id, name: t.name, input: t.args }))] })
        out.push({ role: 'user', content: pendingTools.map(t => ({ type: 'tool_result', tool_use_id: t.id, content: String(t.result ?? '') })) })
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
    if (m.role === 'user') { out.push({ role: 'user', content: m.text }); continue }
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
async function anthropicRound ({ baseUrl, apiKey, model, messages, system, tools, emit, signal }) {
  const body = { model, max_tokens: 8192, system, messages, stream: true }
  if (tools) body.tools = TOOL_DEFS.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)

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

async function openaiRound ({ baseUrl, apiKey, model, messages, tools, emit, signal }) {
  const body = { model, messages, stream: true }
  if (tools) {
    body.tools = TOOL_DEFS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  }
  const headers = { 'content-type': 'application/json' }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`
  const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)

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
export async function runTurn ({ provider, model, apiKey, session, useTools, emit, requestApproval, signal }) {
  const cwd = session.cwd || os.homedir()
  const system = systemPrompt(cwd, useTools)
  const assistant = { role: 'assistant', parts: [] }
  session.messages.push(assistant)

  let toolsEnabled = useTools
  for (let round = 0; round < MAX_ROUNDS; round++) {
    emit({ type: 'round_start', round })
    const args = {
      baseUrl: provider.baseUrl,
      apiKey,
      model,
      system,
      tools: toolsEnabled,
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
      let approved = true
      if (call.name === 'run_command' && requestApproval) {
        approved = await requestApproval(call)
      }
      if (signal.aborted) return
      part.result = approved
        ? await runTool(call.name, call.args, cwd)
        : 'The user declined to run this command. Ask them how they would like to proceed, or try a different approach.'
      if (!approved) part.denied = true
      emit({ type: 'tool_result', id: call.id, result: part.result, denied: !approved })
    }
  }
  emit({ type: 'notice', text: `Stopped after ${MAX_ROUNDS} tool rounds.` })
  emit({ type: 'done' })
}

// ---------- model listing ----------
export async function listModels (provider, apiKey) {
  const headers = {}
  try {
    if (provider.type === 'anthropic') {
      const res = await fetch(`${provider.baseUrl}/v1/models?limit=100`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(6000)
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []).map(m => ({ id: m.id, label: m.display_name || m.id }))
    }
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    const res = await fetch(`${provider.baseUrl}/models`, { headers, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map(m => ({ id: m.id, label: m.name || m.id }))
  } catch {
    return [] // provider offline / unreachable
  }
}
