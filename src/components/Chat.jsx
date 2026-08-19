import React, { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown.jsx'

function argSummary (name, args) {
  if (!args) return ''
  if (name === 'run_command') return args.command || ''
  if (name === 'edit_file' || name === 'read_file' || name === 'write_file') return args.path || ''
  if (name === 'list_dir') return args.path || '.'
  return JSON.stringify(args)
}

function ToolChip ({ part }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={'tool-chip' + (part.denied ? ' denied' : '')} onClick={() => setOpen(o => !o)}>
        <span className='tool-name'>{part.name}</span>
        <span className='tool-arg'>{argSummary(part.name, part.args)}</span>
        <span className='tool-status'>{part.pending ? '⋯' : part.denied ? 'denied' : open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className='tool-detail'>
          {JSON.stringify(part.args, null, 2)}
          {part.result != null && '\n\n— result —\n' + part.result}
        </div>
      )}
    </>
  )
}

function AssistantMessage ({ parts, thinking, streaming }) {
  return (
    <div className='msg msg-assistant'>
      <div className='who'>Radiant{streaming ? ' · working' : ''}</div>
      {thinking ? (
        <div className='thinking-block'>
          <div className='thinking-label'>thinking</div>
          {thinking}
        </div>
      ) : null}
      {parts.map((p, i) => {
        if (p.type === 'text') return <Markdown key={i} text={p.text} />
        if (p.type === 'tool') return <ToolChip key={p.id || i} part={p} />
        if (p.type === 'notice') return <div key={i} className='notice'>{p.text}</div>
        return null
      })}
      {streaming && !parts.length && !thinking && <div className='notice'>…</div>}
    </div>
  )
}

function ModelPicker ({ session, models, onPick, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = models.filter(m => (m.id + m.providerName).toLowerCase().includes(q.toLowerCase()))
  const groups = {}
  for (const m of filtered) (groups[m.providerName] = groups[m.providerName] || []).push(m)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className='model-btn' onClick={() => { setOpen(o => !o); onRefresh() }}>
        {session?.model
          ? <>
              <span className='provider-tag'>{models.find(m => m.id === session.model && m.provider === session.provider)?.providerName || session.provider}</span>
              <span className='model-name'>{session.model}</span>
            </>
          : 'Pick a model'}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className='model-menu' style={{ position: 'absolute', top: 40, right: 0 }}>
          <input autoFocus placeholder='Search models…' value={q} onChange={e => setQ(e.target.value)} />
          <div className='model-groups'>
            {Object.entries(groups).map(([g, ms]) => (
              <div key={g}>
                <div className='model-group-label'>{g}</div>
                {ms.map(m => (
                  <button
                    key={m.provider + m.id}
                    className={'model-option' + (m.id === session?.model && m.provider === session?.provider ? ' selected' : '')}
                    onClick={() => { onPick(m); setOpen(false) }}
                  >
                    {m.id}
                  </button>
                ))}
              </div>
            ))}
            {!filtered.length && (
              <div className='empty'>
                No models. Add an API key in Settings, or start Ollama / LM Studio for local models.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Chat ({ session, live, approval, usage, error, models, onSend, onStop, onApproval, onPickModel, onToggleTools, onSetCwd, onNew, onRefreshModels }) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)
  const streaming = Boolean(live?.streaming)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session?.messages?.length, live, approval])

  const submit = () => {
    const text = draft.trim()
    if (!text || streaming || !session) return
    setDraft('')
    onSend(text)
  }

  if (!session) {
    return (
      <main className='main'>
        <div className='chat-scroll'>
          <div className='welcome'>
            <div className='big-mark' aria-hidden>✦</div>
            <h1>Bright ideas, <em>shipped</em></h1>
            <p>Radiant is your local coding harness — cloud models or your own, side by side.</p>
            <p className='hint'>Start a session, pick a model, and put an agent to work in any folder on this Mac.</p>
            <p style={{ marginTop: 24 }}>
              <button className='small-btn primary' onClick={onNew}>Start a session</button>
            </p>
          </div>
        </div>
      </main>
    )
  }

  const toolsOn = session.useTools !== false

  return (
    <main className='main'>
      <div className='topbar'>
        <div className='title'>{session.title}</div>
        <div className='spacer' />
        <button
          className='cwd-chip'
          title='Workspace folder — click to change'
          onClick={() => {
            const next = window.prompt('Workspace folder for this session:', session.cwd)
            if (next) onSetCwd(next)
          }}
        >
          {session.cwd?.replace(/^\/Users\/[^/]+/, '~')}
        </button>
        <ModelPicker session={session} models={models} onPick={onPickModel} onRefresh={onRefreshModels} />
      </div>

      <div className='chat-scroll' ref={scrollRef}>
        <div className='chat-inner'>
          {session.messages.map((m, i) =>
            m.role === 'user'
              ? <div key={i} className='msg msg-user'><div className='bubble'>{m.text}</div></div>
              : <AssistantMessage key={i} parts={m.parts || []} />
          )}
          {live && <AssistantMessage parts={live.parts} thinking={live.thinking} streaming={live.streaming} />}
          {approval && (
            <div className='approval-card'>
              <div className='q'>The agent wants to run a command in <span className='mono'>{session.cwd}</span>:</div>
              <code>{approval.args?.command}</code>
              <div className='row'>
                <button className='small-btn primary' onClick={() => onApproval(approval.id, true)}>Run it</button>
                <button className='small-btn danger' onClick={() => onApproval(approval.id, false)}>Deny</button>
              </div>
            </div>
          )}
          {error && <div className='error-note'>⚠ {error}</div>}
        </div>
      </div>

      <div className='composer'>
        <div className='composer-box'>
          <textarea
            rows={2}
            placeholder={toolsOn ? 'Ask the agent to build, fix, or explain something…' : 'Chat (tools off)…'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
          />
          <div className='composer-row'>
            <button
              className={'pill-toggle' + (toolsOn ? ' on' : '')}
              onClick={onToggleTools}
              title='When on, the model can read/write files and run commands in the workspace'
            >
              ✦ agent tools {toolsOn ? 'on' : 'off'}
            </button>
            <div className='grow' />
            {usage && (usage.input || usage.output) ? (
              <span className='usage-note'>{usage.input ?? '–'} in · {usage.output ?? '–'} out</span>
            ) : null}
            {streaming
              ? <button className='send-btn stop' onClick={onStop} title='Stop'>■</button>
              : <button className='send-btn' onClick={submit} disabled={!draft.trim()} title='Send'>↑</button>}
          </div>
        </div>
      </div>
    </main>
  )
}
