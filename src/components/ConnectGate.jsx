import React, { useState } from 'react'
import { getServer, setServer, testServer } from '../api.js'

// Shown when the app can't reach its Radiant server — lets the user point at a
// remote shared server (e.g. the always-on host Mac) or fall back to local.
export default function ConnectGate ({ error }) {
  const cur = getServer()
  const [base, setBase] = useState(cur.base || '')
  const [token, setToken] = useState(cur.token || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const connect = async () => {
    setBusy(true); setMsg(null)
    try {
      let url = base.trim()
      if (url && !/^https?:\/\//i.test(url)) url = 'http://' + url
      await testServer(url, token.trim())
      setServer({ base: url, token: token.trim() })
      location.reload()
    } catch (e) { setMsg(e.message); setBusy(false) }
  }
  const useLocal = () => { setServer(null); location.reload() }

  return (
    <div className='app'>
      <div className='connect-gate'>
        <div className='logo-mark big-mark' aria-hidden />
        <h2>Connect to Radiant</h2>
        <p className='hint'>{error || "Couldn't reach a Radiant server."}</p>
        <label className='connect-field'>Server address
          <input className='text-input' placeholder='e.g. 100.x.y.z:5834 (Tailscale) or a Mac on your network' value={base} onChange={e => setBase(e.target.value)} />
        </label>
        <label className='connect-field'>Access token
          <input className='text-input' type='password' placeholder='Token from the host Mac (Settings → Devices)' value={token} onChange={e => setToken(e.target.value)} />
        </label>
        {msg && <div className='error-note'>⚠ {msg}</div>}
        <div className='row' style={{ marginTop: 12 }}>
          <button className='small-btn primary' onClick={connect} disabled={busy || !base.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
          <button className='small-btn' onClick={useLocal}>Use this Mac's own server</button>
        </div>
      </div>
    </div>
  )
}
