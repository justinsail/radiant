/**
 * Providers — API keys, kept in the Keychain.
 *
 * The key itself is written straight to the native SecureStore plugin and is
 * never read back into this screen. The UI only ever knows WHICH providers have
 * a key, never what it is: a secret that is never rendered cannot be leaked by
 * a screenshot, a log line, or a crash report.
 *
 * Adding a key expands the row rather than pushing a screen. Pasting a key is
 * one field and one button, and a whole screen for that would be ceremony.
 */
import React, { useCallback, useEffect, useState } from 'react'
import usePress from './usePress.js'
import { PROVIDERS, connectedProviders, saveKey, removeKey, looksWrong } from './providers.js'

function Provider ({ p, connected, onChanged }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const head = usePress(() => { setOpen(o => !o); setError(null); setValue('') }, {
    label: `${p.name}${connected ? ', connected' : ''}`,
    expanded: open
  })

  const save = useCallback(async () => {
    const problem = looksWrong(p, value)
    if (problem) { setError(problem); return }
    setBusy(true)
    try {
      await saveKey(p.id, value)
      setValue(''); setOpen(false); setError(null)
      await onChanged()
    } catch (e) {
      setError(e?.message || 'Could not save that key.')
    } finally { setBusy(false) }
  }, [p, value, onChanged])

  const forget = useCallback(async () => {
    setBusy(true)
    try { await removeKey(p.id); setOpen(false); await onChanged() } finally { setBusy(false) }
  }, [p, onChanged])

  const saveBtn = usePress(save, { label: 'Save key', disabled: busy || !value.trim() })
  const forgetBtn = usePress(forget, { label: `Remove ${p.name} key`, disabled: busy })

  return (
    <>
      <div className={'rx-row rx-pressable' + head.className} {...head.handlers}>
        <div className="rx-row-text">
          <div className="rx-headline">{p.name}</div>
          <div className="rx-row-blurb">{p.hint}</div>
        </div>
        {connected && <span className="rx-provider-on">Connected</span>}
      </div>

      {open && (
        <div className="rx-provider-edit">
          <input
            className="rx-field"
            type="password"
            value={value}
            onChange={e => { setValue(e.target.value); setError(null) }}
            placeholder={connected ? 'Paste a new key to replace' : 'Paste your API key'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            /* a key is not a password to remember; offering to save it in the
               password manager just puts a second copy somewhere else */
            autoComplete="off"
          />
          {error && <p className="rx-provider-error">{error}</p>}
          <div className="rx-provider-buttons">
            <span className={'rx-provider-save' + saveBtn.className} {...saveBtn.handlers}>
              {busy ? 'Saving…' : connected ? 'Replace key' : 'Save key'}
            </span>
            {connected && (
              <span className={'rx-provider-forget' + forgetBtn.className} {...forgetBtn.handlers}>
                Remove
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default function ProvidersScreen () {
  const [connected, setConnected] = useState([])

  const refresh = useCallback(async () => {
    setConnected(await connectedProviders())
  }, [])
  useEffect(() => { refresh() }, [refresh])

  return (
    <>
      <p className="rx-section-footer rx-provider-intro">
        Keys are held in the iPhone&rsquo;s Keychain, never in the app&rsquo;s own
        storage, and never leave the device except to the provider they belong to.
      </p>

      <div className="rx-group">
        {PROVIDERS.map(p => (
          <Provider
            key={p.id}
            p={p}
            connected={connected.includes(p.id)}
            onChanged={refresh}
          />
        ))}
      </div>

      <h2 className="rx-section-header">Not here yet</h2>
      <p className="rx-section-footer">
        ChatGPT Plus and GitHub Copilot sign in through a flow that redirects to
        the machine running it, which a phone cannot answer — reach those by
        connecting to your Mac. Claude Pro and Nous Portal subscriptions can work
        on iPhone and are not built yet.
      </p>
    </>
  )
}

export { ProvidersScreen }
