import React, { useEffect, useRef, useState } from 'react'
import Terminal from './Terminal.jsx'

const MIN_W = 300
const MAX_W = 720

export default function RightPanel ({ tab, onTab, activity, cwd, mode, onClose }) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem('radiant.rightWidth'))
    return saved >= MIN_W && saved <= MAX_W ? saved : 400
  })
  const dragging = useRef(false)

  useEffect(() => {
    const move = e => {
      if (!dragging.current) return
      const w = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX))
      setWidth(w)
    }
    const up = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        localStorage.setItem('radiant.rightWidth', String(width))
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
    <aside className='right-panel' style={{ width }}>
      <div className='right-resize' onMouseDown={startDrag} title='Drag to resize' />
      <div className='right-tabs'>
        <button className={'right-tab' + (tab === 'activity' ? ' active' : '')} onClick={() => onTab('activity')}>Activity</button>
        <button className={'right-tab' + (tab === 'terminal' ? ' active' : '')} onClick={() => onTab('terminal')}>Terminal</button>
        <div style={{ flex: 1 }} />
        <button className='icon-btn' onClick={onClose} title='Close panel'>✕</button>
      </div>
      <div className='right-body'>
        {tab === 'activity' && (
          <div className='activity-feed'>
            {!activity.length && <div className='activity-empty'>Agent tool calls will appear here as they run.</div>}
            {activity.map(item => (
              <div key={item.id + item.at} className='activity-item'>
                <div className='head'>
                  <span className='tool-name'>{item.name}</span>
                  <span className='when'>{new Date(item.at).toLocaleTimeString()}</span>
                </div>
                <pre>{item.name === 'run_command' ? '$ ' + (item.args?.command || '') : JSON.stringify(item.args)}
{item.denied ? '\n[denied by user]' : item.result != null ? '\n' + String(item.result).slice(0, 4000) : '\n[running…]'}</pre>
              </div>
            ))}
          </div>
        )}
        {tab === 'terminal' && <Terminal cwd={cwd} mode={mode} />}
      </div>
    </aside>
  )
}
