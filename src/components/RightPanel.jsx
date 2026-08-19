import React from 'react'
import Terminal from './Terminal.jsx'

export default function RightPanel ({ tab, onTab, activity, cwd, mode, onClose }) {
  return (
    <aside className='right-panel'>
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
