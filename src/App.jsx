import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, streamChat } from './api.js'
import { applyTheme } from './theme.js'
import Sidebar from './components/Sidebar.jsx'
import Chat from './components/Chat.jsx'
import RightPanel from './components/RightPanel.jsx'
import Settings from './components/Settings.jsx'
import MotionBackground from './components/MotionBackground.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import ComparePanel from './components/ComparePanel.jsx'
import ConnectGate from './components/ConnectGate.jsx'

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
  const [settingsTab, setSettingsTab] = useState('providers')
  const [rightOpen, setRightOpen] = useState(false)
  const [rightTab, setRightTab] = useState('activity')
  const [updateInfo, setUpdateInfo] = useState(null) // {latest, dmgUrl} when an update exists
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false) // mobile sidebar drawer
  const [todos, setTodos] = useState([]) // agent checklist for the active session
  const [question, setQuestion] = useState(null) // { id, question, options } when the agent asks
  const [stats, setStats] = useState(null) // cumulative session stats
  const streamingSessionRef = useRef(null)

  const refreshSessions = useCallback(() => api.listSessions().then(setSessions).catch(() => {}), [])
  const refreshModels = useCallback(() => api.getModels().then(setModels).catch(() => {}), [])

  useEffect(() => {
    api.getConfig().then(cfg => {
      setConfig(cfg)
      applyTheme(cfg.settings)
      if (cfg.settings.autoUpdateCheck !== false) {
        api.updateCheck().then(u => { if (u.hasUpdate) setUpdateInfo(u) }).catch(() => {})
      }
    }).catch(e => setError('Cannot reach the Radiant server: ' + e.message))
    refreshSessions()
    refreshModels()
  }, [refreshSessions, refreshModels])

  const saveSettings = async patch => {
    const cfg = await api.saveSettings(patch)
    setConfig(cfg)
    applyTheme(cfg.settings)
  }

  const openSettings = () => {
    if (window.radiantNative?.openSettings) window.radiantNative.openSettings()
    else setSettingsOpen(true)
  }

  // when the separate settings window closes, pull in any changes it made
  useEffect(() => {
    if (!window.radiantNative?.onSettingsClosed) return
    return window.radiantNative.onSettingsClosed(() => {
      api.getConfig().then(cfg => { setConfig(cfg); applyTheme(cfg.settings) }).catch(() => {})
      refreshModels()
    })
  }, [refreshModels])

  const openSession = async id => {
    const s = await api.getSession(id)
    setSession(s)
    setTodos(s.todos || [])
    setStats(s.stats || null)
    setQuestion(null)
    setError(null)
    if (streamingSessionRef.current !== id) { setLive(null); setApproval(null) }
  }

  const newSession = async (agentId) => {
    const agent = agentId ? (config.agents || []).find(a => a.id === agentId) : null
    const body = agentId ? { agentId } : {}
    // if the agent has no fixed model, seed with the first available model
    if (!(agent && agent.model)) {
      const best = models[0]
      if (best) { body.provider = best.provider; body.model = best.id }
    }
    const s = await api.createSession(body)
    setSession(s)
    setTodos([])
    setQuestion(null)
    setStats(null)
    setLive(null)
    setApproval(null)
    setError(null)
    refreshSessions()
  }

  const newGroup = async (participantIds) => {
    const body = { participants: participantIds }
    const best = models[0]
    if (best) { body.provider = best.provider; body.model = best.id }
    const s = await api.createSession(body)
    setSession(s); setTodos([]); setQuestion(null); setStats(null); setLive(null); setApproval(null); setError(null); setNavOpen(false)
    refreshSessions()
  }

  const removeSession = async id => {
    await api.deleteSession(id)
    if (session?.id === id) setSession(null)
    refreshSessions()
  }

  const renameSession = async (id, title) => {
    await api.patchSession(id, { title })
    if (session?.id === id) setSession(prev => ({ ...prev, title }))
    refreshSessions()
  }

  const pinSession = async (id, pinned) => {
    await api.patchSession(id, { pinned })
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
    // content is { text, attachments } from the composer
    const text = typeof content === 'string' ? content : content.text
    const attachments = (typeof content === 'object' && content.attachments) || []
    let target = session
    if (!target.provider || !target.model) {
      setError('Pick a model first (top right).')
      return
    }
    setError(null)
    setUsage(null)
    const sessionId = target.id
    streamingSessionRef.current = sessionId
    setSession(prev => ({ ...prev, messages: [...prev.messages, { role: 'user', text, attachments }] }))
    const liveMsg = { parts: [], thinking: '', thinkingActive: false, thinkingSecs: 0, streaming: true }
    setLive({ ...liveMsg })

    const endThinking = () => {
      if (liveMsg.thinkingActive) {
        liveMsg.thinkingActive = false
        liveMsg.thinkingSecs = Math.max(1, Math.round((Date.now() - liveMsg.thinkingStartedAt) / 1000))
      }
    }
    const pushText = text => {
      endThinking()
      const last = liveMsg.parts[liveMsg.parts.length - 1]
      if (last?.type === 'text') last.text += text
      else liveMsg.parts.push({ type: 'text', text })
    }

    try {
      await streamChat(sessionId, content, ev => {
        if (streamingSessionRef.current !== sessionId) return
        switch (ev.type) {
          case 'text_delta': pushText(ev.text); break
          case 'thinking_delta':
            if (!liveMsg.thinkingActive && !liveMsg.thinking) liveMsg.thinkingStartedAt = Date.now()
            liveMsg.thinkingActive = true
            liveMsg.thinking += ev.text
            break
          case 'tool_start':
            endThinking()
            if (ev.name === 'todo_write') break // rendered as the checklist, not a chip
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
          case 'question_request': setQuestion({ id: ev.id, question: ev.question, options: ev.options || [] }); break
          case 'plan_mode': setSession(s => (s && s.id === sessionId ? { ...s, planMode: ev.on } : s)); break
          case 'stats': setStats(ev.stats); break
          case 'agent_turn': {
            // group chat: finalize the previous speaker's message, start the next
            endThinking()
            if (liveMsg.parts.length || liveMsg.thinking) {
              const finished = { role: 'assistant', parts: [...liveMsg.parts], model: target.model, agentId: liveMsg.agentId }
              setSession(prev => (prev && prev.id === sessionId ? { ...prev, messages: [...prev.messages, finished] } : prev))
            }
            liveMsg.parts = []; liveMsg.thinking = ''; liveMsg.thinkingActive = false; liveMsg.thinkingSecs = 0
            liveMsg.agentId = ev.agentId
            break
          }
          case 'usage': setUsage(u => ({ input: ev.input ?? u?.input, output: ev.output ?? u?.output })); break
          case 'notice': liveMsg.parts.push({ type: 'notice', text: ev.text }); break
          case 'todos': setTodos(ev.todos || []); break
          case 'title': setSession(s => (s && s.id === sessionId ? { ...s, title: ev.title } : s)); refreshSessions(); break
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

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o) }
      else if (meta && e.key.toLowerCase() === 'n') { e.preventDefault(); newSession() }
      else if (meta && e.key === ',') { e.preventDefault(); openSettings() }
      else if (e.key === 'Escape' && live?.streaming) { stop() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const answerApproval = async (id, approved) => {
    setApproval(null)
    await api.approve(id, approved)
  }

  if (!config) {
    if (error) return <ConnectGate error={error} />
    return <div className='app'><div style={{ margin: 'auto', color: 'var(--text-muted)' }}>Warming up…</div></div>
  }

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '')}>
      <MotionBackground kind={config.settings.motionBg} />
      <div className='nav-backdrop' onClick={() => setNavOpen(false)} />
      <Sidebar
        sessions={sessions}
        activeId={session?.id}
        working={Boolean(live?.streaming)}
        onOpen={id => { openSession(id); setNavOpen(false) }}
        onNew={(...a) => { newSession(...a); setNavOpen(false) }}
        onDelete={removeSession}
        onRename={renameSession}
        onPin={pinSession}
        agents={config.agents || []}
        onSettings={openSettings}
        mode={config.settings.mode}
        onToggleMode={() => {
          const order = ['light', 'medium', 'dark']
          const next = order[(order.indexOf(config.settings.mode) + 1) % 3] || 'dark'
          saveSettings({ mode: next })
        }}
        updateInfo={updateInfo}
        onUpdate={() => { if (window.radiantNative?.openSettings) window.radiantNative.openSettings('about'); else { setSettingsTab('about'); setSettingsOpen(true) } }}
      />
      <Chat
        rightOpen={rightOpen}
        onToggleRight={() => setRightOpen(o => !o)}
        onMenu={() => setNavOpen(true)}
        onNewGroup={newGroup}
        agents={config.agents || []}
        session={session}
        todos={todos}
        stats={stats}
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
        onToggleComputer={() => patchSession({ computerControl: !session.computerControl })}
        onTogglePlan={() => patchSession({ planMode: !session.planMode })}
        question={question}
        onAnswer={answer => { if (question) { api.answerQuestion(question.id, answer).catch(() => {}); setQuestion(null) } }}
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
      {paletteOpen && (
        <CommandPalette
          sessions={sessions}
          agents={config.agents || []}
          models={models}
          session={session}
          onClose={() => setPaletteOpen(false)}
          actions={{
            newSession,
            openSettings,
            openSession,
            compare: () => setCompareOpen(true),
            toggleRight: () => setRightOpen(o => !o),
            toggleMode: () => {
              const order = ['light', 'medium', 'dark']
              saveSettings({ mode: order[(order.indexOf(config.settings.mode) + 1) % 3] || 'dark' })
            },
            pickModel: m => session && patchSession({ provider: m.provider, model: m.id })
          }}
        />
      )}
      {compareOpen && <ComparePanel models={models} onClose={() => setCompareOpen(false)} />}
      {settingsOpen && (
        <Settings
          config={config}
          initialTab={settingsTab}
          onClose={() => { setSettingsOpen(false); setSettingsTab('providers'); refreshModels() }}
          onSettings={saveSettings}
          onConfigChange={setConfig}
          onModelsChanged={refreshModels}
        />
      )}
    </div>
  )
}
