import React, { useEffect, useRef, useState } from 'react'

const MIN_W = 190
const MAX_W = 460

export default function Sidebar ({ sessions, activeId, working, onOpen, onNew, onDelete, onSettings, mode, onToggleMode, updateInfo, onUpdate }) {
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
        {sessions.map(s => (
          <button
            key={s.id}
            className={'session-item' + (s.id === activeId ? ' active' : '')}
            onClick={() => onOpen(s.id)}
            onContextMenu={e => {
              e.preventDefault()
              if (window.confirm(`Delete "${s.title}"?`)) onDelete(s.id)
            }}
            title={`${s.title}\n(right-click to delete)`}
          >
            {s.title}
            <span className='session-meta'>{s.model || 'no model'} · {s.messageCount} msg</span>
          </button>
        ))}
        {!sessions.length && <div style={{ padding: '10px 12px', color: 'var(--text-faint)', fontSize: 12 }}>No sessions yet.</div>}
      </div>
      {updateInfo && (
        <button className='update-pill' onClick={onUpdate} title={`Radiant ${updateInfo.latest} is available`}>
          ↑ Update to {updateInfo.latest}
        </button>
      )}
      <div className='sidebar-foot'>
        <button className='icon-btn' onClick={onSettings} title='Settings'>⚙ Settings</button>
        <button className='icon-btn' onClick={onToggleMode} title='Toggle light/dark'>{mode === 'dark' ? '☀' : '☾'}</button>
      </div>
      <div className='sidebar-resize' onMouseDown={startDrag} title='Drag to resize' />
    </nav>
  )
}
