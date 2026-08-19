import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, streamChat } from './api.js'
import { applyTheme } from './theme.js'
import Sidebar from './components/Sidebar.jsx'
import Chat from './components/Chat.jsx'
import RightPanel from './components/RightPanel.jsx'
import Settings from './components/Settings.jsx'

export default function App () {
  const [config, setConfig] = useState(null)
  const [models, setModels] = useState([])
  const [sessions, setSessions] = useState([])
  const [session, setSession] = useState(null) // full active session {id,...,messages}
  const [live, setLive] = useState(null) // in-flight assistant message view {parts, thinking, streaming}
  const [approval, setApproval] = useState(null) // {id, name, args}
  const [activity, setActivity] = useState([]) // tool feed for right panel
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [rightTab, setRightTab] = useState('activity')
  const streamingSessionRef = useRef(null)

  const refreshSessions = useCallback(() => api.listSessions().then(setSessions).catch(() => {}), [])
  const refreshModels = useCallback(() => api.getModels().then(setModels).catch(() => {}), [])

  useEffect(() => {
    api.getConfig().then(cfg => {
      setConfig(cfg)
      applyTheme(cfg.settings)
    }).catch(e => setError('Cannot reach the Radiant server: ' + e.message))
    refreshSessions()
    refreshModels()
  }, [refreshSessions, refreshModels])

  const saveSettings = async patch => {
    const cfg = await api.saveSettings(patch)
    setConfig(cfg)
    applyTheme(cfg.settings)
  }

  const openSession = async id => {
    const s = await api.getSession(id)
    setSession(s)
    setError(null)
    if (streamingSessionRef.current !== id) { setLive(null); setApproval(null) }
  }

  const newSession = async () => {
    const best = models[0]
    const s = await api.createSession(best ? { provider: best.provider, model: best.id } : {})
    setSession(s)
    setLive(null)
    setApproval(null)
    setError(null)
    refreshSessions()
  }

  const removeSession = async id => {
    await api.deleteSession(id)
    if (session?.id === id) setSession(null)
    refreshSessions()
  }

  const patchSession = async patch => {
    if (!session) return
    const s = await api.patchSession(session.id, patch)
    setSession(prev => ({ ...prev, ...s, messages: prev.messages }))
    refreshSessions()
  }

  const send = async content => {
    if (!session || live?.streaming) return
    let target = session
    if (!target.provider || !target.model) {
      setError('Pick a model first (top right).')
      return
    }
    setError(null)
    setUsage(null)
    const sessionId = target.id
    streamingSessionRef.current = sessionId
    setSession(prev => ({ ...prev, messages: [...prev.messages, { role: 'user', text: content }] }))
    const liveMsg = { parts: [], thinking: '', streaming: true }
    setLive({ ...liveMsg })

    const pushText = text => {
      const last = liveMsg.parts[liveMsg.parts.length - 1]
      if (last?.type === 'text') last.text += text
      else liveMsg.parts.push({ type: 'text', text })
    }

    try {
      await streamChat(sessionId, content, ev => {
        if (streamingSessionRef.current !== sessionId) return
        switch (ev.type) {
          case 'text_delta': pushText(ev.text); break
          case 'thinking_delta': liveMsg.thinking += ev.text; break
          case 'tool_start':
            liveMsg.parts.push({ type: 'tool', id: ev.id, name: ev.name, args: ev.args, pending: true })
            setActivity(a => [...a, { id: ev.id, name: ev.name, args: ev.args, at: Date.now() }])
            setRightOpen(true)
            break
          case 'tool_result': {
            const t = liveMsg.parts.find(p => p.type === 'tool' && p.id === ev.id)
            if (t) { t.result = ev.result; t.pending = false; t.denied = ev.denied }
            setActivity(a => a.map(x => x.id === ev.id ? { ...x, result: ev.result, denied: ev.denied } : x))
            setApproval(null)
            break
          }
          case 'approval_request': setApproval({ id: ev.id, name: ev.name, args: ev.args }); break
          case 'usage': setUsage(u => ({ input: ev.input ?? u?.input, output: ev.output ?? u?.output })); break
          case 'notice': liveMsg.parts.push({ type: 'notice', text: ev.text }); break
          case 'title': refreshSessions(); break
          case 'error': setError(ev.message); break
          default: break
        }
        setLive({ ...liveMsg, parts: [...liveMsg.parts] })
      })
    } catch (e) {
      setError(e.message)
    }

    if (streamingSessionRef.current === sessionId) {
      streamingSessionRef.current = null
      setApproval(null)
      setLive(null)
      try {
        const fresh = await api.getSession(sessionId)
        setSession(prev => (prev && prev.id === sessionId ? fresh : prev))
      } catch {}
      refreshSessions()
    }
  }

  const stop = () => { if (session) api.abort(session.id) }
  const answerApproval = async (id, approved) => {
    setApproval(null)
    await api.approve(id, approved)
  }

  if (!config) {
    return <div className='app'><div style={{ margin: 'auto', color: 'var(--text-muted)' }}>{error || 'Warming up…'}</div></div>
  }

  return (
    <div className='app'>
      <Sidebar
        sessions={sessions}
        activeId={session?.id}
        working={Boolean(live?.streaming)}
        onOpen={openSession}
        onNew={newSession}
        onDelete={removeSession}
        onSettings={() => setSettingsOpen(true)}
        mode={config.settings.mode}
        onToggleMode={() => saveSettings({ mode: config.settings.mode === 'dark' ? 'light' : 'dark' })}
        rightOpen={rightOpen}
        onToggleRight={() => setRightOpen(o => !o)}
      />
      <Chat
        session={session}
        live={live}
        approval={approval}
        usage={usage}
        error={error}
        models={models}
        onSend={send}
        onStop={stop}
        onApproval={answerApproval}
        onPickModel={m => patchSession({ provider: m.provider, model: m.id })}
        onToggleTools={() => patchSession({ useTools: !(session.useTools !== false) })}
        onSetCwd={cwd => patchSession({ cwd })}
        onNew={newSession}
        onRefreshModels={refreshModels}
      />
      {rightOpen && (
        <RightPanel
          tab={rightTab}
          onTab={setRightTab}
          activity={activity}
          cwd={session?.cwd}
          mode={config.settings.mode}
          onClose={() => setRightOpen(false)}
        />
      )}
      {settingsOpen && (
        <Settings
          config={config}
          onClose={() => { setSettingsOpen(false); refreshModels() }}
          onSettings={saveSettings}
          onConfigChange={setConfig}
        />
      )}
    </div>
  )
}
