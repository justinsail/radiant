import React, { useEffect, useState } from 'react'
import { api } from './api.js'
import { applyTheme } from './theme.js'
import Settings from './components/Settings.jsx'

// Standalone settings, rendered full-window in its own Electron window
// (opened at #settings). Saves to the shared server; the main window refreshes
// when this window closes.
export default function SettingsWindow ({ initialTab = 'providers' }) {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    api.getConfig().then(c => { setConfig(c); applyTheme(c.settings) }).catch(() => {})
  }, [])

  const saveSettings = async patch => {
    const c = await api.saveSettings(patch)
    setConfig(c)
    applyTheme(c.settings)
  }

  if (!config) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div className='settings-window'>
      <Settings
        config={config}
        embedded
        initialTab={initialTab}
        onSettings={saveSettings}
        onConfigChange={setConfig}
        onModelsChanged={() => {}}
        onClose={() => {}}
      />
    </div>
  )
}
