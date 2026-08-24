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
      // testServer returns the NORMALIZED address — what was actually reached,
      // which is not always what was typed (a bare hostname gains https://).
      // Storing the raw input instead would save an address that works only by
      // accident.
      const reached = await testServer(address, token.trim())
      setServer({ base: reached, token: token.trim() })
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
    // inherited from .is-native body, which declares the system keyword
    // literally — a var() indirection would risk dropping it
    fontFamily: 'inherit'
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
        {/* ⚠️ EXPLAIN TAILSCALE, DO NOT JUST NAME IT. The old text named
            "Tailscale Serve" and "a real certificate" at someone who has opened
            a chat app — and then promised an http check that did not exist. This
            says what the two cases are and what Tailscale is for, in the order
            someone meets them. */}
        <div className="rx-section-footer">
          Both on the same Wi-Fi? Use the address your Mac shows — nothing else
          to install.
          {'\n\n'}
          Away from home? That needs Tailscale. iPhone will only reach your Mac
          over an encrypted connection, and Tailscale creates one — a free
          private link between your own devices, so your Mac is reachable from
          anywhere without being exposed to the internet. Install it on both,
          sign in with the same account, and Radiant sets up the rest. Your Mac
          then shows an address beginning https.
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
