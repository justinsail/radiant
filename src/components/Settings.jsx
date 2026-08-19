import React, { useState } from 'react'
import { api } from '../api.js'
import { THEMES, applyTheme } from '../theme.js'

function ProviderRow ({ provider, onConfig }) {
  const [draft, setDraft] = useState('')
  const save = async () => {
    if (!draft.trim()) return
    const cfg = await api.setKey(provider.id, draft.trim())
    setDraft('')
    onConfig(cfg)
  }
  const clear = async () => onConfig(await api.setKey(provider.id, ''))
  const remove = async () => onConfig(await api.removeProvider(provider.id))
  return (
    <div className='provider-row'>
      <div className='p-name'>{provider.name}</div>
      <div className='p-url'>{provider.baseUrl}</div>
      {provider.auth === 'none'
        ? <span className='key-ok'>no key needed</span>
        : provider.hasKey
          ? <>
              <span className='key-ok'>✓ key saved</span>
              <button className='small-btn' onClick={clear}>Remove key</button>
            </>
          : <>
              <input
                type='password'
                placeholder='Paste API key'
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
              />
              <button className='small-btn primary' onClick={save} disabled={!draft.trim()}>Save</button>
            </>}
      {provider.removable && <button className='small-btn danger' onClick={remove}>✕</button>}
    </div>
  )
}

export default function Settings ({ config, onClose, onSettings, onConfigChange }) {
  const s = config.settings
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [cwdDraft, setCwdDraft] = useState(s.defaultCwd || '')
  const isCustom = !THEMES.find(t => t.id === s.themeId)

  const preview = patch => {
    // live-preview theme changes before they land back from the server
    applyTheme({ ...s, ...patch })
    onSettings(patch)
  }

  const addProvider = async () => {
    if (!newName.trim() || !newUrl.trim()) return
    const cfg = await api.addProvider({ name: newName.trim(), baseUrl: newUrl.trim(), type: 'openai', auth: 'key' })
    setNewName(''); setNewUrl('')
    onConfigChange(cfg)
  }

  return (
    <div className='modal-backdrop' onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className='modal' role='dialog' aria-label='Settings'>
        <div className='modal-head'>
          Settings
          <button className='icon-btn' onClick={onClose}>✕</button>
        </div>
        <div className='modal-body'>

          <div className='set-section'>
            <h3>Providers &amp; keys</h3>
            {config.providers.map(p => (
              <ProviderRow key={p.id} provider={p} onConfig={onConfigChange} />
            ))}
            <div className='add-provider'>
              <input placeholder='Name (e.g. Groq)' value={newName} onChange={e => setNewName(e.target.value)} />
              <input placeholder='Base URL (…/v1, OpenAI-compatible)' style={{ flex: 1, minWidth: 220 }} value={newUrl} onChange={e => setNewUrl(e.target.value)} />
              <button className='small-btn' onClick={addProvider}>Add provider</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 0 }}>
              Keys are stored locally in <span className='mono'>~/.radiant/config.json</span> and never leave this Mac except to call the provider itself.
              Any OpenAI-compatible server works — Groq, Mistral, Together, a remote Ollama box…
            </p>
          </div>

          <div className='set-section'>
            <h3>Appearance</h3>
            <div className='mode-row'>
              <button className={'small-btn' + (s.mode === 'dark' ? ' primary' : '')} onClick={() => preview({ mode: 'dark' })}>☾ Dark</button>
              <button className={'small-btn' + (s.mode === 'light' ? ' primary' : '')} onClick={() => preview({ mode: 'light' })}>☀ Light</button>
            </div>
            <div className='theme-grid'>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={'theme-swatch' + (s.themeId === t.id ? ' selected' : '')}
                  onClick={() => preview({ themeId: t.id })}
                >
                  <span className='dot' style={{ background: `oklch(0.68 ${t.chroma} ${t.hue})` }} />
                  {t.name}
                </button>
              ))}
              <button
                className={'theme-swatch' + (isCustom ? ' selected' : '')}
                onClick={() => preview({ themeId: 'custom' })}
              >
                <span className='dot' style={{ background: `oklch(0.68 ${s.customChroma} ${s.customHue})` }} />
                Custom
              </button>
            </div>
            {isCustom && (
              <>
                <div className='hue-row'>
                  <label htmlFor='hue'>Hue</label>
                  <input
                    id='hue' type='range' min='0' max='360' className='hue-slider'
                    value={s.customHue}
                    onChange={e => preview({ customHue: Number(e.target.value) })}
                  />
                </div>
                <div className='hue-row'>
                  <label htmlFor='chroma'>Vividness</label>
                  <input
                    id='chroma' type='range' min='0' max='0.25' step='0.005' className='chroma-slider'
                    value={s.customChroma}
                    onChange={e => preview({ customChroma: Number(e.target.value) })}
                  />
                </div>
              </>
            )}
          </div>

          <div className='set-section'>
            <h3>Agent</h3>
            <label className='check-row'>
              <input
                type='checkbox'
                checked={s.approveCommands}
                onChange={e => onSettings({ approveCommands: e.target.checked })}
              />
              <span>Ask before running shell commands <span className='desc'>— recommended; file edits stay automatic</span></span>
            </label>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Default workspace folder for new sessions</div>
              <input
                className='text-input'
                value={cwdDraft}
                onChange={e => setCwdDraft(e.target.value)}
                onBlur={() => cwdDraft && onSettings({ defaultCwd: cwdDraft })}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
