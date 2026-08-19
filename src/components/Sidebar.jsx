import React, { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { AgentGlyph } from './AgentIcons.jsx'
import { api } from '../api.js'

function UsageChip () {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => api.getUsage().then(u => { if (alive) setItems(u.items) }).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  const credits = items?.find(i => i.kind === 'credits')
  const subs = (items || []).filter(i => i.kind === 'subscription')
  if (!items || (!credits && !subs.length)) return null
  const fmtReset = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
  const subTitle = s => {
    if (!s.windows?.length) return `${s.label}: signed in (usage not reported)`
    return `${s.label}:\n` + s.windows.map(w => `  ${w.name}: ${w.usedPct != null ? w.usedPct + '% used' : 'active'}${w.resetAt ? ` · resets ${fmtReset(w.resetAt)}` : ''}`).join('\n')
  }
  return (
    <div className='usage-chip' title={credits ? `${credits.label}: $${credits.remaining} left of $${credits.total} ($${credits.used} used)` : ''}>
      {credits && <span className='usage-line'><span className='usage-dot' /> ${credits.remaining} <span className='usage-sub'>OpenRouter</span></span>}
      {subs.map(s => {
        const primary = s.windows?.[0]
        const pct = primary?.usedPct
        return (
          <span key={s.provider} className='usage-line' title={subTitle(s)}>
            <span className={'usage-dot' + (pct != null && pct >= 90 ? ' warn' : ' ok')} /> {s.label}
            <span className='usage-sub'>{pct != null ? `${pct}% used` : 'plan'}</span>
          </span>
        )
      })}
    </div>
  )
}

const MIN_W = 190
const MAX_W = 460

export default function Sidebar ({ sessions, activeId, working, onOpen, onNew, onDelete, onRename, onPin, agents = [], onSettings, mode, onToggleMode, updateInfo, onUpdate }) {
  const agentOf = id => agents.find(a => a.id === id)
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem('radiant.sidebarWidth'))
    return saved >= MIN_W && saved <= MAX_W ? saved : 248
  })
  const dragging = useRef(false)

  useEffect(() => {
    const move = e => {
      if (!dragging.current) return
      const w = Math.min(MAX_W, Math.max(MIN_W, e.clientX))
      setWidth(w)
    }
    const up = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        localStorage.setItem('radiant.sidebarWidth', String(width))
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [width])

  const startDrag = () => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const [view, setView] = useState('chats')
  const [collapsed, setCollapsed] = useState({})
  const toggleGroup = id => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  const SessionRow = ({ s, showAgent = true }) => {
    const ag = agentOf(s.agentId)
    return (
      <div
        className={'session-item' + (s.id === activeId ? ' active' : '') + (s.pinned ? ' pinned' : '')}
        onClick={() => onOpen(s.id)}
        title={s.title}
      >
        <div className='session-title'>
          {showAgent && ag && <span className='session-agent' style={{ color: `oklch(0.7 0.15 ${ag.hue ?? 258})` }}><AgentGlyph agent={ag} size={13} /></span>}
          <span className='session-title-text'>{s.title}</span>
        </div>
        <span className='session-meta'>{s.model || 'no model'} · {s.messageCount} msg</span>
        <div className='session-actions'>
          <button title={s.pinned ? 'Unpin' : 'Pin to top'} onClick={e => { e.stopPropagation(); onPin(s.id, !s.pinned) }}>{s.pinned ? '★' : '☆'}</button>
          <button title='Rename' onClick={e => { e.stopPropagation(); const t = window.prompt('Rename session:', s.title); if (t && t.trim()) onRename(s.id, t.trim()) }}>✎</button>
          <button title='Delete' onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${s.title}"?`)) onDelete(s.id) }}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <nav className='sidebar' style={{ width }}>
      <div className='brand'>
        <div className={'logo-mark brand-mark' + (working ? ' working' : '')} aria-hidden />
        <span className='wordmark brand-word'>Radiant</span>
      </div>
      <div className='sidebar-switch'>
        <button className={view === 'chats' ? 'on' : ''} onClick={() => setView('chats')}>Chats</button>
        <button className={view === 'bots' ? 'on' : ''} onClick={() => setView('bots')}>Agents</button>
      </div>
      <button className='new-session' onClick={() => onNew()}>+ New session</button>

      {view === 'chats' ? (
        <div className='session-list'>
          {sessions.map(s => <SessionRow key={s.id} s={s} />)}
          {!sessions.length && <div style={{ padding: '10px 12px', color: 'var(--text-faint)', fontSize: 12 }}>No sessions yet.</div>}
        </div>
      ) : (
        <div className='session-list'>
          {agents.map(a => {
            const own = sessions.filter(s => s.agentId === a.id)
            const isCollapsed = collapsed[a.id]
            return (
              <div key={a.id} className='bot-group'>
                <div className='bot-head'>
                  <button className='bot-head-toggle' onClick={() => toggleGroup(a.id)} title={isCollapsed ? 'Show sessions' : 'Hide sessions'}>
                    <span className='bot-head-caret'>{own.length ? (isCollapsed ? '▸' : '▾') : ''}</span>
                    <span className='bot-head-icon' style={{ color: `oklch(0.7 0.16 ${a.hue ?? 258})` }}><AgentGlyph agent={a} size={16} /></span>
                    <span className='bot-head-name'>{a.name}</span>
                    <span className='bot-head-count'>{own.length}</span>
                  </button>
                  <button className='bot-new' title={`New session with ${a.name}`} onClick={() => onNew(a.id)}>+</button>
                </div>
                {!isCollapsed && own.map(s => <SessionRow key={s.id} s={s} showAgent={false} />)}
              </div>
            )
          })}
          {(() => { const orphans = sessions.filter(s => !agentOf(s.agentId)); return orphans.length > 0 && (
            <div className='bot-group'>
              <div className='bot-head'><span className='bot-head-name' style={{ color: 'var(--text-faint)' }}>No agent</span><span className='bot-head-count'>{orphans.length}</span></div>
              {orphans.map(s => <SessionRow key={s.id} s={s} />)}
            </div>
          )})()}
        </div>
      )}
      {updateInfo && (
        <button className='update-pill' onClick={onUpdate} title={`Radiant ${updateInfo.latest} is available`}>
          ↑ Update to {updateInfo.latest}
        </button>
      )}
      <UsageChip />
      <div className='sidebar-foot'>
        <button className='icon-btn' onClick={onSettings} title='Open settings'><Icon.settings /> Settings</button>
        <button className='icon-btn' onClick={onToggleMode} title={`Appearance: ${mode}`} data-tip={`Theme: ${mode} — click to cycle\nlight / medium / dark`}>
          {mode === 'light' ? <Icon.sun /> : mode === 'medium' ? <Icon.contrast /> : <Icon.moon />}
        </button>
      </div>
      <div className='sidebar-resize' onMouseDown={startDrag} title='Drag to resize' />
    </nav>
  )
}
