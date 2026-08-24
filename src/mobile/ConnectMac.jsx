/**
 * ConnectMac — the secondary path, and deliberately a pushed screen rather than
 * a sheet: it is a settings task with two text fields, and iOS pushes those.
 *
 * ConnectGate.jsx is not reused: it is styled by styles.css, which is never
 * loaded on the phone. This talks to src/api.js directly.
 */
import React, { useCallback, useState } from 'react'
import usePress from './usePress.js'
import { getServer, setServer, testServer } from '../api.js'

export default function ConnectMac ({ onConnected }) {
  const existing = (() => { try { return getServer() } catch { return {} } })()
  const [base, setBase] = useState(existing.base || '')
  const [token, setToken] = useState(existing.token || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const connect = useCallback(async () => {
    const address = base.trim()
    if (!address || busy) return
    setBusy(true)
    setError(null)
    try {
      await testServer(address, token.trim())
      setServer({ base: address, token: token.trim() })
      onConnected?.()
    } catch (e) {
      setError(e?.message || 'Could not reach that Mac.')
    } finally {
      setBusy(false)
    }
  }, [base, token, busy, onConnected])

  const go = usePress(connect, { disabled: busy || !base.trim() })

  const field = {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 44,
    background: 'transparent',
    border: 0,
    color: 'var(--rx-label)',
    // 17px minimum, never reduced: below 16px iOS zooms the page on focus
    fontSize: 17,
    fontFamily: 'var(--rx-font)'
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div className="rx-section">
        <div className="rx-group">
          <div className="rx-row">
            <input
              style={field}
              value={base}
              onChange={e => setBase(e.target.value)}
              placeholder="https://mac.tailnet.ts.net"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              enterKeyHint="next"
            />
          </div>
          <div className="rx-row">
            <input
              style={field}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Access token"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
        </div>
        <div className="rx-section-footer">
          The Mac must be reachable over https — Tailscale Serve puts a real
          certificate in front of Radiant. A plain http address is blocked before
          it leaves the app.
        </div>
      </div>

      {error && (
        <div className="rx-section">
          <div className="rx-footnote rx-destructive" style={{ padding: '0 16px' }}>{error}</div>
        </div>
      )}

      <div style={{ padding: '20px 20px 0' }}>
        <button
          type="button"
          className={'rx-primary rx-pressable' + go.className}
          {...go.handlers}
          disabled={busy || !base.trim()}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

export { ConnectMac }
