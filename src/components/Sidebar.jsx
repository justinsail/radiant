import React, { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
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
  return (
    <div className='usage-chip' title={
      (credits ? `${credits.label}: $${credits.remaining} left of $${credits.total} ($${credits.used} used)\n` : '') +
      (subs.length ? subs.map(s => `${s.label}: subscription (usage limits not exposed)`).join('\n') : '')
    }>
      {credits && <span className='usage-line'><span className='usage-dot' /> ${credits.remaining} <span className='usage-sub'>OpenRouter</span></span>}
      {subs.map(s => <span key={s.provider} className='usage-line'><span className='usage-dot ok' /> {s.label} <span className='usage-sub'>plan</span></span>)}
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

  return (
    <nav className='sidebar' style={{ width }}>
      <div className='brand'>
        <div className={'logo-mark brand-mark' + (working ? ' working' : '')} aria-hidden />
        <span className='wordmark brand-word'>Radiant</span>
      </div>
      <button className='new-session' onClick={onNew}>+ New session</button>
      <div className='session-list'>
        {sessions.map(s => {
          const ag = agentOf(s.agentId)
          return (
            <div
              key={s.id}
              className={'session-item' + (s.id === activeId ? ' active' : '') + (s.pinned ? ' pinned' : '')}
              onClick={() => onOpen(s.id)}
              title={s.title}
            >
              <div className='session-title'>
                {ag && <span className='session-agent'>{ag.emoji || '🤖'}</span>}
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
        })}
        {!sessions.length && <div style={{ padding: '10px 12px', color: 'var(--text-faint)', fontSize: 12 }}>No sessions yet.</div>}
      </div>
      {updateInfo && (
        <button className='update-pill' onClick={onUpdate} title={`Radiant ${updateInfo.latest} is available`}>
          ↑ Update to {updateInfo.latest}
        </button>
      )}
      <UsageChip />
      <div className='sidebar-foot'>
        <button className='icon-btn' onClick={onSettings} title='Open settings'><Icon.settings /> Settings</button>
        <button className='icon-btn' onClick={onToggleMode} title={`Appearance: ${mode} — click to cycle light / medium / dark`}>
          {mode === 'light' ? <Icon.sun /> : mode === 'medium' ? <Icon.contrast /> : <Icon.moon />}
        </button>
      </div>
      <div className='sidebar-resize' onMouseDown={startDrag} title='Drag to resize' />
    </nav>
  )
}
