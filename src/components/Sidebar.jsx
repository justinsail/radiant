import React from 'react'

export default function Sidebar ({ sessions, activeId, working, onOpen, onNew, onDelete, onSettings, mode, onToggleMode, rightOpen, onToggleRight }) {
  return (
    <nav className='sidebar'>
      <div className='brand'>
        <div className={'logo-mark brand-mark' + (working ? ' working' : '')} aria-hidden />
        Radiant
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
      <div className='sidebar-foot'>
        <button className='icon-btn' onClick={onSettings} title='Settings'>⚙ Settings</button>
        <button className='icon-btn' onClick={onToggleMode} title='Toggle light/dark'>{mode === 'dark' ? '☀' : '☾'}</button>
        <button className={'icon-btn' + (rightOpen ? ' on' : '')} onClick={onToggleRight} title='Toggle side panel'>▤</button>
      </div>
    </nav>
  )
}
