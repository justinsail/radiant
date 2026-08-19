import React, { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown.jsx'
import { Icon } from './Icons.jsx'
import { AgentGlyph } from './AgentIcons.jsx'
import { api } from '../api.js'

// short one-line blurb shown under an agent on the splash screen
const AGENT_BLURBS = {
  'agent-radiant': 'General-purpose coding assistant',
  'agent-reviewer': 'Finds bugs, edge cases & security issues',
  'agent-architect': 'Designs the structure before writing code',
  'agent-explainer': 'Explains code in plain language',
  'agent-pair': 'Writes and ships working code'
}
function agentBlurb (a) {
  if (AGENT_BLURBS[a.id]) return AGENT_BLURBS[a.id]
  const p = (a.persona || '').trim()
  if (!p) return 'General assistant'
  const first = p.split(/(?<=[.!?])\s/)[0]
  return first.length > 64 ? first.slice(0, 61).trimEnd() + '…' : first
}

// agent task checklist (from the todo_write tool)
function TodoChecklist ({ todos }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!todos?.length) return null
  const done = todos.filter(t => t.status === 'done').length
  const all = done === todos.length
  return (
    <div className={'todo-panel' + (all ? ' complete' : '')}>
      <button className='todo-head' onClick={() => setCollapsed(c => !c)}>
        <span className='todo-caret'>{collapsed ? '▸' : '▾'}</span>
        Tasks <span className='todo-count'>{done}/{todos.length}</span>
      </button>
      {!collapsed && todos.map((t, i) => (
        <div key={i} className={'todo-item ' + t.status}>
          <span className='todo-box' aria-hidden>{t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◐' : '○'}</span>
          <span className='todo-text'>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

// files this turn created or edited, as clickable chips
function Deliverables ({ parts }) {
  const files = []
  const seen = new Set()
  for (const p of parts) {
    if (p.type === 'tool' && (p.name === 'write_file' || p.name === 'edit_file') && !p.denied && p.result && !/^Error/i.test(String(p.result))) {
      const fp = p.args?.path
      if (fp && !seen.has(fp)) { seen.add(fp); files.push(fp) }
    }
  }
  if (!files.length) return null
  return (
    <div className='deliverables'>
      <span className='deliverables-label'>Files changed</span>
      {files.map(f => (
        <button key={f} className='deliverable' title={f} onClick={() => api.openFile(f).catch(() => {})}>
          <span className='deliverable-ico' aria-hidden>✎</span>{f.split('/').pop()}
        </button>
      ))}
    </div>
  )
}

// the agent paused to ask the user something (ask_user / plan approval)
function QuestionCard ({ question, onAnswer }) {
  const [other, setOther] = useState('')
  return (
    <div className='question-card'>
      <div className='q'>{question.question}</div>
      <div className='question-options'>
        {(question.options || []).map((o, i) => (
          <button key={i} className='small-btn primary' onClick={() => onAnswer(o)}>{o}</button>
        ))}
      </div>
      <div className='question-other'>
        <input placeholder='Or type your own answer…' value={other} onChange={e => setOther(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && other.trim()) onAnswer(other.trim()) }} />
        <button className='small-btn' onClick={() => other.trim() && onAnswer(other.trim())} disabled={!other.trim()}>Send</button>
      </div>
    </div>
  )
}

const TOOL_ICONS = {
  run_command: '⌘',
  read_file: '≡',
  write_file: '✎',
  edit_file: '✎',
  list_dir: '▤'
}

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
        <span className='tool-ico' aria-hidden>{TOOL_ICONS[part.name] || '·'}</span>
        <span className='tool-name'>{part.name.replace('_', ' ')}</span>
        <span className='tool-arg'>{argSummary(part.name, part.args)}</span>
        <span className={'tool-status' + (part.pending ? ' pending' : '')}>
          {part.pending ? '⋯' : part.denied ? '✕ denied' : '✓'}
        </span>
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

function ThinkingTrace ({ thinking, active, seconds }) {
  const [open, setOpen] = useState(false)
  const bodyRef = useRef(null)
  const show = open || active
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [thinking])
  return (
    <div className='thinking-trace'>
      <button className={'thinking-head' + (show ? ' open' : '')} onClick={() => setOpen(o => !o)}>
        <span className='chev' aria-hidden>▶</span>
        {active
          ? <span className='shimmer'>Thinking…</span>
          : <span>Thought{seconds ? ` for ${seconds}s` : ''}</span>}
      </button>
      {show && <div className='thinking-body' ref={bodyRef}>{thinking}</div>}
    </div>
  )
}

function AssistantMessage ({ parts, thinking, thinkingActive, thinkingSecs, streaming, model, agent }) {
  return (
    <div className='msg msg-assistant'>
      <div className='who'>
        {agent
          ? <><span className='who-agent-emoji' style={{ '--ah': agent.hue ?? 258, color: `oklch(0.7 0.16 ${agent.hue ?? 258})` }}><AgentGlyph agent={agent} size={14} /></span><span className='who-word'>{agent.name}</span></>
          : <><span className='logo-mark' aria-hidden /><span className='wordmark who-word'>Radiant</span></>}
        {model && <span className='who-model'>{model}</span>}
        {streaming && <span className='who-model'>· working</span>}
      </div>
      {thinking ? <ThinkingTrace thinking={thinking} active={Boolean(thinkingActive)} seconds={thinkingSecs} /> : null}
      {parts.map((p, i) => {
        if (p.type === 'text') return <Markdown key={i} text={p.text} />
        if (p.type === 'tool') return (p.name === 'todo_write' || p.hidden) ? null : <ToolChip key={p.id || i} part={p} />
        if (p.type === 'notice') return <div key={i} className='notice'>{p.text}</div>
        return null
      })}
      {!streaming && <Deliverables parts={parts} />}
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
  const current = models.find(m => m.id === session?.model && m.provider === session?.provider)

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <button className='model-btn' onClick={() => { setOpen(o => !o); onRefresh() }}>
        {session?.model
          ? <>
              <span className='provider-tag'>{current?.providerName || session.provider}</span>
              <span className='model-name'>{session.model}</span>
            </>
          : 'Pick a model'}
        <span aria-hidden style={{ fontSize: 9 }}>▲</span>
      </button>
      {open && (
        <div className='model-menu'>
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

const SLASH_COMMANDS = [
  { cmd: '/explain', desc: 'Explain how the code works', prompt: 'Explain how this code works, starting from the entry point. Read the files you need.' },
  { cmd: '/review', desc: 'Review for bugs & improvements', prompt: 'Review the code in this workspace for bugs, edge cases, and improvements. Be specific and cite files.' },
  { cmd: '/fix', desc: 'Find and fix a bug', prompt: 'Find and fix the bug: ' },
  { cmd: '/test', desc: 'Write and run tests', prompt: 'Write tests for the recent changes and run them.' },
  { cmd: '/refactor', desc: 'Refactor for clarity', prompt: 'Refactor this code for clarity without changing behavior: ' },
  { cmd: '/commit', desc: 'Commit current changes', prompt: 'Stage and commit the current changes with a clear, conventional commit message.' },
  { cmd: '/doc', desc: 'Document the code', prompt: 'Add clear documentation and comments to: ' }
]

function exportSessionMarkdown (session) {
  const lines = [`# ${session.title}`, '', `_${session.model || 'model'} · exported from Radiant_`, '']
  for (const m of session.messages) {
    if (m.role === 'user') {
      lines.push('## You', '', m.text || '', '')
    } else {
      lines.push(`## Radiant${m.model ? ` (${m.model})` : ''}`, '')
      for (const p of m.parts || []) {
        if (p.type === 'text') lines.push(p.text, '')
        else if (p.type === 'tool') lines.push(`> 🔧 \`${p.name}\` ${p.args?.command || p.args?.path || ''}`.trim(), '')
      }
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (session.title || 'session').replace(/[^\w-]+/g, '-').slice(0, 40) + '.md'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function readFileAsAttachment (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataB64 = String(reader.result).split(',')[1]
      const isImage = IMAGE_TYPES.includes(file.type)
      resolve({
        name: file.name,
        mime: file.type || 'application/octet-stream',
        kind: isImage ? 'image' : 'text',
        dataB64
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const MenuIcon = () => <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M4 6h16M4 12h16M4 18h16' /></svg>

export default function Chat ({ session, live, todos = [], approval, question, onAnswer, usage, error, models, agents = [], onSend, onStop, onApproval, onPickModel, onToggleTools, onToggleComputer, onTogglePlan, onSetCwd, onNew, onRefreshModels, rightOpen, onToggleRight, onMenu }) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const scrollRef = useRef(null)
  const streaming = Boolean(live?.streaming)

  const slashQuery = /^\/[\w-]*$/.test(draft) ? draft : null
  const slashMatches = slashQuery ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(slashQuery)) : []
  const applySlash = c => {
    setDraft(c.prompt)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  // @-mention workspace files
  const atMatch = draft.match(/@([\w./-]*)$/)
  const [fileMatches, setFileMatches] = useState([])
  useEffect(() => {
    if (!atMatch || !session?.cwd) { setFileMatches([]); return }
    const t = setTimeout(() => api.searchFiles(session.cwd, atMatch[1]).then(setFileMatches).catch(() => setFileMatches([])), 150)
    return () => clearTimeout(t)
  }, [draft, session?.cwd])
  const applyFile = path => {
    setDraft(d => d.replace(/@[\w./-]*$/, '@' + path + ' '))
    setFileMatches([])
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session?.messages?.length, live, approval])

  const addFiles = async fileList => {
    const files = Array.from(fileList).slice(0, 8)
    const next = await Promise.all(files.map(readFileAsAttachment))
    setAttachments(a => [...a, ...next].slice(0, 8))
  }

  // voice dictation via the Web Speech API
  const submit = () => {
    const text = draft.trim()
    if ((!text && !attachments.length) || streaming || !session) return
    setDraft('')
    onSend({ text, attachments })
    setAttachments([])
  }

  if (!session) {
    return (
      <main className='main'>
        <button className='menu-btn' onClick={onMenu} title='Menu' aria-label='Open menu'><MenuIcon /></button>
        <div className='float-toggle'>
          <button className={'icon-btn' + (rightOpen ? ' on' : '')} onClick={onToggleRight} title='Show activity & terminal panel' data-tip={'Activity & terminal panel'} data-tip-below data-tip-end><Icon.panel /></button>
        </div>
        <div className='chat-scroll'>
          <div className='welcome'>
            <div className='logo-mark big-mark' aria-hidden />
            <div className='wordmark welcome-word'>Radiant</div>
            <div className='welcome-tagline'>A Templeton Technologies Product</div>
            {agents.length > 0
              ? <>
                  <p className='hint' style={{ marginTop: 22 }}>Start a session with an agent</p>
                  <div className='welcome-agents'>
                    {agents.map(a => (
                      <button key={a.id} className='welcome-agent' style={{ '--ah': a.hue ?? 258 }} onClick={() => onNew(a.id)} title={a.persona || a.name}>
                        <span className='agent-avatar' style={{ color: `oklch(0.68 0.16 ${a.hue ?? 258})` }}><AgentGlyph agent={a} size={21} /></span>
                        <span className='welcome-agent-name'>{a.name}</span>
                        <span className='welcome-agent-desc'>{agentBlurb(a)}</span>
                      </button>
                    ))}
                  </div>
                </>
              : <p style={{ marginTop: 26 }}><button className='small-btn primary' onClick={() => onNew()}>Start a session</button></p>}
          </div>
        </div>
      </main>
    )
  }

  const toolsOn = session.useTools !== false
  const sessionAgent = agents.find(a => a.id === session.agentId) || null

  return (
    <main className='main'>
      <div className='topbar'>
        <button className='menu-btn' onClick={onMenu} title='Menu' aria-label='Open menu'><MenuIcon /></button>
        <div className='title'>{session.title}</div>
        <div className='spacer' />
        <button
          className='cwd-chip'
          title={`Workspace folder for this session (the agent reads/writes here):\n${session.cwd}\nClick to change`}
          onClick={() => {
            const next = window.prompt('Workspace folder for this session:', session.cwd)
            if (next) onSetCwd(next)
          }}
        >
          <Icon.folder size={13} />
          {session.cwd?.replace(/^\/Users\/[^/]+/, '~')}
        </button>
        <button className='icon-btn' onClick={() => exportSessionMarkdown(session)} title='Export this conversation as a Markdown file' data-tip='Export chat as Markdown' data-tip-below data-tip-end><Icon.download /></button>
        <button className={'icon-btn' + (rightOpen ? ' on' : '')} onClick={onToggleRight} title='Show activity & terminal panel' data-tip={'Activity & terminal panel\n(tool runs, output, terminal)'} data-tip-below data-tip-end><Icon.panel /></button>
      </div>

      <div className='chat-scroll' ref={scrollRef}>
        <div className='chat-inner'>
          {session.messages.map((m, i) =>
            m.role === 'user'
              ? <div key={i} className='msg msg-user'>
                  <div className='bubble'>
                    {(m.attachments || []).length > 0 && (
                      <div className='msg-attach'>
                        {m.attachments.map((a, j) => a.kind === 'image'
                          ? <img key={j} src={`data:${a.mime};base64,${a.dataB64}`} alt={a.name} />
                          : <span key={j} className='msg-attach-file'>📄 {a.name}</span>)}
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              : <AssistantMessage key={i} parts={m.parts || []} model={m.model} agent={sessionAgent} />
          )}
          {live && (
            <AssistantMessage
              agent={sessionAgent}
              model={session.model}
              parts={live.parts}
              thinking={live.thinking}
              thinkingActive={live.thinkingActive}
              thinkingSecs={live.thinkingSecs}
              streaming={live.streaming}
            />
          )}
          {approval && (
            <div className='approval-card'>
              <div className='q'>Run this command in <span className='mono'>{session.cwd?.replace(/^\/Users\/[^/]+/, '~')}</span>?</div>
              <code>{approval.args?.command}</code>
              <div className='row'>
                <button className='small-btn primary' onClick={() => onApproval(approval.id, true)}>Run it</button>
                <button className='small-btn danger' onClick={() => onApproval(approval.id, false)}>Deny</button>
              </div>
            </div>
          )}
          {question && <QuestionCard question={question} onAnswer={onAnswer} />}
          {error && <div className='error-note'>⚠ {error}</div>}
        </div>
      </div>

      <div className='composer'>
        <TodoChecklist todos={todos} />
        <div
          className={'composer-box' + (dragOver ? ' drag-over' : '')}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
        >
          {attachments.length > 0 && (
            <div className='attach-strip'>
              {attachments.map((a, i) => (
                <div key={i} className='attach-chip' title={a.name}>
                  {a.kind === 'image'
                    ? <img src={`data:${a.mime};base64,${a.dataB64}`} alt={a.name} />
                    : <span className='attach-file'>📄</span>}
                  <span className='attach-name'>{a.name}</span>
                  <button className='attach-x' onClick={() => setAttachments(list => list.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
          {slashMatches.length > 0 && (
            <div className='slash-menu'>
              {slashMatches.map(c => (
                <button key={c.cmd} className='slash-item' onMouseDown={e => { e.preventDefault(); applySlash(c) }}>
                  <span className='slash-cmd'>{c.cmd}</span>
                  <span className='slash-desc'>{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          {atMatch && fileMatches.length > 0 && (
            <div className='slash-menu'>
              {fileMatches.map(f => (
                <button key={f} className='slash-item' onMouseDown={e => { e.preventDefault(); applyFile(f) }}>
                  <span className='slash-cmd' style={{ minWidth: 0 }}>@</span>
                  <span className='slash-desc mono' style={{ fontSize: 12 }}>{f}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder={dragOver ? 'Drop files to attach…' : toolsOn ? 'Ask the agent to build, fix, or explain something…  (type / for commands)' : 'Chat (tools off)…'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPaste={e => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); addFiles(files) } }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (slashMatches.length) { e.preventDefault(); applySlash(slashMatches[0]); return }
                e.preventDefault(); submit()
              }
            }}
          />
          <div className='composer-row'>
            <input
              ref={fileInputRef} type='file' multiple hidden
              onChange={e => { if (e.target.files.length) addFiles(e.target.files); e.target.value = '' }}
            />
            <button className='attach-btn' onClick={() => fileInputRef.current?.click()} title='Attach files or images' data-tip='Attach files or images'><Icon.plus size={17} /></button>
            <ModelPicker session={session} models={models} onPick={onPickModel} onRefresh={onRefreshModels} />
            <button
              className={'pill-toggle' + (toolsOn ? ' on' : '')}
              onClick={onToggleTools}
              data-tip={'Agent tools: read/write files and run\ncommands in the workspace folder.\nClick to turn ' + (toolsOn ? 'off' : 'on') + '.'}
            >
              <span className='logo-mark' aria-hidden />
              tools {toolsOn ? 'on' : 'off'}
            </button>
            <button
              className={'pill-toggle' + (session.computerControl ? ' on' : '')}
              onClick={onToggleComputer}
              data-tip={'Computer control: let the model drive the\nbrowser & desktop (needs a vision model +\nmacOS permissions). Click to turn ' + (session.computerControl ? 'off' : 'on') + '.'}
            >
              🖥 computer {session.computerControl ? 'on' : 'off'}
            </button>
            <button
              className={'pill-toggle' + (session.planMode ? ' on' : '')}
              onClick={onTogglePlan}
              data-tip={'Plan mode: the agent researches and proposes a\nplan for your approval before changing anything.\nClick to turn ' + (session.planMode ? 'off' : 'on') + '.'}
            >
              📋 plan {session.planMode ? 'on' : 'off'}
            </button>
            <div className='grow' />
            {usage && (usage.input || usage.output) ? (
              <span className='usage-note'>{usage.input ?? '–'} in · {usage.output ?? '–'} out</span>
            ) : null}
            {streaming
              ? <button className='send-btn stop' onClick={onStop} title='Stop generating'><Icon.stop size={15} /></button>
              : <button className='send-btn' onClick={submit} disabled={!draft.trim() && !attachments.length} title='Send message'><Icon.arrowUp size={17} /></button>}
          </div>
        </div>
      </div>
    </main>
  )
}
