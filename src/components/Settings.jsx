import React, { useEffect, useRef, useState } from 'react'
import { api, startDownload, getDownloads, cancelDownload, streamQuantize, getServer, setServer, testServer } from '../api.js'
import { THEMES, MODES, FONTS, UI_SCALES, applyTheme, hexToOklch, accentHex } from '../theme.js'
import { MOTIONS } from './MotionBackground.jsx'
import { Icon } from './Icons.jsx'
import { AGENT_ICONS, AGENT_ICON_IDS, AgentGlyph } from './AgentIcons.jsx'
import { AGENT_TEMPLATES, AGENT_TEMPLATE_CATS } from '../agentTemplates.js'

// strip a leading "You are (a|an|the) …" so descriptions read as a role, not a command
function cleanDesc (s) {
  const t = (s || '').trim().replace(/^you(?:'re| are)\s+(?:an?|the)?\s*/i, '')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

// ---------- Providers ----------

function ProviderRow ({ provider, oauthInfo, onConfig }) {
  const [draft, setDraft] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [device, setDevice] = useState(null) // { userCode, verificationUrl } for device-code sign-in
  const pollRef = useRef(null)

  const [addingKey, setAddingKey] = useState(false) // paste-a-second-key mode
  const accounts = provider.accounts || []

  const save = async (newAccount) => {
    if (!draft.trim()) return
    const cfg = await api.setKey(provider.id, draft.trim(), { newAccount })
    setDraft(''); setAddingKey(false)
    onConfig(cfg)
  }
  const clear = async () => onConfig(await api.setKey(provider.id, ''))
  const remove = async () => onConfig(await api.removeProvider(provider.id))
  const signOut = async () => onConfig(await api.oauthSignout(provider.id))
  const switchAccount = async id => onConfig(await api.activateAccount(provider.id, id))
  const removeAcct = async id => onConfig(await api.removeAccount(provider.id, id))

  const startSignIn = async (newAccount) => {
    setBusy(true)
    try {
      if (oauthInfo.mode === 'device') {
        const d = await api.oauthDeviceStart(provider.id, { newAccount })
        setDevice(d)
        window.open(d.verificationUrl, '_blank', 'noopener')
        const started = Date.now()
        pollRef.current = setInterval(async () => {
          try {
            const r = await api.oauthDevicePoll(provider.id)
            if (r.done) { clearInterval(pollRef.current); onConfig(r.config); setDevice(null); setBusy(false) }
            else if (Date.now() - started > (d.expiresIn || 600) * 1000) { clearInterval(pollRef.current); setDevice(null); setBusy(false); window.alert('Sign-in timed out — try again.') }
          } catch (e) { clearInterval(pollRef.current); setDevice(null); setBusy(false); window.alert('Sign-in failed: ' + e.message) }
        }, (d.interval || 5) * 1000)
        return
      }
      const { url, mode } = await api.oauthStart(provider.id, { newAccount })
      window.open(url, '_blank', 'noopener')
      if (mode === 'paste') {
        setSigningIn(true)
      } else {
        // loopback: poll until the vendor redirect lands on our local listener
        pollRef.current = setInterval(async () => {
          const { signedIn } = await api.oauthStatus(provider.id)
          if (signedIn) {
            clearInterval(pollRef.current)
            onConfig(await api.getConfig())
            setBusy(false)
          }
        }, 1500)
      }
    } catch (e) { window.alert('Sign-in failed to start: ' + e.message); setBusy(false) }
  }
  const finishSignIn = async () => {
    if (!code.trim()) return
    try {
      const cfg = await api.oauthComplete(provider.id, code.trim())
      onConfig(cfg)
      setSigningIn(false); setCode(''); setBusy(false)
    } catch (e) { window.alert('Sign-in failed: ' + e.message) }
  }
  useEffect(() => () => clearInterval(pollRef.current), [])

  return (
    <div className='provider-row-wrap'>
      <div className='provider-row'>
        <div className='p-name'>{provider.name}</div>
        <div className='p-url'>{provider.baseUrl}</div>
        {provider.signedIn
          ? <>
              <span className='key-ok'>✓ subscription</span>
              <button className='small-btn' onClick={signOut}>Sign out</button>
            </>
          : provider.auth === 'none'
            ? <span className='key-ok'>no key needed</span>
            : provider.auth === 'oauth'
              ? <span className='v-meta'>Sign in below ↓</span>
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
                  <button className='small-btn primary' onClick={() => save()} disabled={!draft.trim()}>Save</button>
                </>}
        {provider.removable && <button className='small-btn danger' onClick={remove}>✕</button>}
      </div>
      {(provider.hasKey || provider.signedIn) && accounts.length > 0 && (
        <div className='account-row'>
          {accounts.map(a => (
            <span key={a.id} className={'account-chip' + (a.active ? ' active' : '')}>
              <button className='account-switch' onClick={() => !a.active && switchAccount(a.id)} title={a.active ? 'Active account' : 'Switch to this account'}>
                <span className='account-dot'>{a.active ? '●' : '○'}</span>{a.label}
              </button>
              <button className='account-x' onClick={() => removeAcct(a.id)} title='Remove this account'>✕</button>
            </span>
          ))}
          {addingKey && provider.auth !== 'oauth'
            ? <span className='account-add-key'>
                <input autoFocus type='password' placeholder='Paste another key' value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && save(true)} />
                <button className='small-btn primary' onClick={() => save(true)} disabled={!draft.trim()}>Add</button>
                <button className='small-btn' onClick={() => { setAddingKey(false); setDraft('') }}>Cancel</button>
              </span>
            : !device && !signingIn && <button className='account-add' onClick={() => oauthInfo ? startSignIn(true) : setAddingKey(true)} disabled={busy}>+ Add account</button>}
        </div>
      )}
      {provider.hint && !provider.hasKey && !provider.signedIn && <div className='provider-hint'>{provider.hint}</div>}
      {oauthInfo && !provider.signedIn && !provider.hasKey && (
        <div className='provider-oauth'>
          {device
            ? <span className='oauth-device'>
                <span>Enter code <code className='device-code'>{device.userCode}</code> at the page that opened, then approve.</span>
                <button className='small-btn' onClick={() => window.open(device.verificationUrl, '_blank', 'noopener')}>Reopen page</button>
                <span className='v-meta'>Waiting for you to approve…</span>
                <button className='small-btn' onClick={() => { clearInterval(pollRef.current); setDevice(null); setBusy(false) }}>Cancel</button>
              </span>
            : !signingIn
              ? <button className='small-btn subscribe' onClick={() => startSignIn()} disabled={busy}>
                  {busy ? 'Waiting…' : `Sign in with ${oauthInfo.label} subscription`}
                </button>
              : <span className='oauth-paste'>
                  <input placeholder='Paste the code from the page' value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && finishSignIn()} />
                  <button className='small-btn primary' onClick={finishSignIn} disabled={!code.trim()}>Finish</button>
                  <button className='small-btn' onClick={() => { setSigningIn(false); setBusy(false) }}>Cancel</button>
                </span>}
          <span className='oauth-note'>Uses your paid plan — unofficial, may break, small account risk.</span>
        </div>
      )}
    </div>
  )
}

function ProvidersPane ({ config, onConfigChange }) {
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [oauthMap, setOauthMap] = useState({})
  useEffect(() => {
    api.oauthProviders().then(list => {
      const m = {}
      for (const o of list) m[o.id] = o
      setOauthMap(m)
    }).catch(() => {})
  }, [])
  const addProvider = async () => {
    if (!newName.trim() || !newUrl.trim()) return
    const cfg = await api.addProvider({ name: newName.trim(), baseUrl: newUrl.trim(), type: 'openai', auth: 'key' })
    setNewName(''); setNewUrl('')
    onConfigChange(cfg)
  }
  return (
    <div className='set-section'>
      <h3>Providers &amp; keys</h3>
      {config.providers.map(p => (
        <ProviderRow key={p.id} provider={p} oauthInfo={oauthMap[p.id]} onConfig={onConfigChange} />
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
  )
}

// ---------- Models (local, via Ollama) ----------

function fitClass (ramGB, systemRam) {
  if (!systemRam) return ''
  if (ramGB <= systemRam * 0.75) return 'fit-ok'
  if (ramGB <= systemRam * 0.95) return 'fit-tight'
  return 'fit-no'
}
const FIT_LABEL = { 'fit-ok': 'runs well', 'fit-tight': 'tight fit', 'fit-no': 'too big' }

function ramNeededGB (fileSizeGB) {
  return Math.round(fileSizeGB * 1.15 + 1.5)
}

function fmtCount (n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n)
}

function HFRepoRow ({ repo, installedCheck, pulls, onPull, onCancel, systemRam, diskFree }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState(null)
  const [failed, setFailed] = useState(false)
  const toggle = async () => {
    setOpen(o => !o)
    if (!files && !failed) {
      try { setFiles(await api.registryFiles(repo.id)) } catch { setFailed(true) }
    }
  }
  return (
    <div className='model-family'>
      <button className='mf-head hf-head' onClick={toggle}>
        <span className='mf-name mono' style={{ fontSize: 12.5 }}>{repo.id}</span>
        <span className='v-meta'>{fmtCount(repo.downloads)} downloads · {fmtCount(repo.likes)} likes</span>
        <span className='tool-status' style={{ color: 'var(--text-faint)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && !files && !failed && <div className='variant-row'><span className='v-meta'>Loading quantizations…</span></div>}
      {open && failed && <div className='variant-row'><span className='v-meta'>Could not load file list.</span></div>}
      {open && files && !files.quants.length && <div className='variant-row'><span className='v-meta'>No GGUF files in this repo.</span></div>}
      {open && files && files.quants.map(qt => {
        const model = qt.model
        const ram = ramNeededGB(qt.sizeGB)
        const fit = fitClass(ram, systemRam)
        const noDisk = diskFree != null && qt.sizeGB > diskFree - 2 // keep ~2 GB headroom
        const pull = pulls[model]
        const pct = pull && pull.total ? Math.round((pull.completed / pull.total) * 100) : null
        return (
          <div key={qt.label} className='variant-row'>
            <span className='v-tag mono'>{qt.label.toLowerCase()}{qt.sharded ? ` · ${qt.files.length} parts` : ''}</span>
            <span className='v-meta'>{qt.sizeGB} GB download · ~{ram} GB RAM</span>
            <span className={'fit-badge ' + fit}>{FIT_LABEL[fit] || ''}</span>
            {noDisk && <span className='fit-badge fit-no' title={`Only ${diskFree} GB free on disk`}>not enough disk</span>}
            <span className='v-action'>
              {installedCheck(model)
                ? <span className='key-ok'>✓ installed</span>
                : pull
                  ? <span className='pull-progress'>
                      <span className='pull-bar'><span style={{ width: (pct ?? 5) + '%' }} /></span>
                      {pct != null ? pct + '%' : (pull.status || 'starting…')}
                      <button className='pull-stop' title='Stop download' onClick={() => onCancel(model)}>✕</button>
                    </span>
                  : <button className='small-btn' onClick={() => onPull({ repo: repo.id, files: qt.files, model })} disabled={fit === 'fit-no' || noDisk} title={noDisk ? `Not enough free disk (${diskFree} GB free, needs ${qt.sizeGB} GB)` : ''}>Download</button>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function QuantizeBlock ({ systemRam, onDone }) {
  const [data, setData] = useState(null) // {models, quants}
  const [source, setSource] = useState('')
  const [quant, setQuant] = useState('q4_K_M')
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState([])
  const [err, setErr] = useState(null)

  const load = () => api.quantizeCandidates().then(d => {
    setData(d)
    if (d.models?.length && !source) setSource(d.models[0].name)
  }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  const srcModel = data?.models?.find(m => m.name === source)
  const quantInfo = data?.quants?.find(q => q.id === quant)
  const estGB = srcModel && quantInfo ? +(srcModel.sizeGB * quantInfo.factor).toFixed(1) : null
  const targetName = source ? `${source.split(':')[0]}:${quant.toLowerCase()}` : ''

  const run = async () => {
    setRunning(true); setLog([]); setErr(null)
    try {
      await streamQuantize({ source, target: targetName, quant }, ev => {
        if (ev.error) setErr(ev.error)
        else if (ev.line) setLog(l => [...l.slice(-6), ev.line])
      })
    } catch (e) { setErr(e.message) }
    setRunning(false)
    load(); onDone()
  }

  if (data && !data.models.length) {
    return (
      <div className='quant-block'>
        <div className='quant-title'>Shrink a model (quantize)</div>
        <div className='hf-note'>
          Quantizing turns a full-precision model into a smaller one that needs less RAM.
          You don't have a full-precision model yet — download an <strong>F16</strong> or <strong>BF16</strong> GGUF
          from Hugging Face below, then come back here to shrink it.
        </div>
      </div>
    )
  }
  if (!data) return null

  return (
    <div className='quant-block'>
      <div className='quant-title'>Shrink a model (quantize)</div>
      <div className='hf-note'>Turn a full-precision model into a smaller one that runs on less RAM.</div>
      <div className='quant-row'>
        <label>Model</label>
        <select className='text-input' value={source} onChange={e => setSource(e.target.value)} disabled={running}>
          {data.models.map(m => <option key={m.name} value={m.name}>{m.name} ({m.quant}, {m.sizeGB} GB)</option>)}
        </select>
      </div>
      <div className='quant-row'>
        <label>Quant</label>
        <select className='text-input' value={quant} onChange={e => setQuant(e.target.value)} disabled={running}>
          {data.quants.map(q => <option key={q.id} value={q.id}>{q.label} — {q.note}</option>)}
        </select>
      </div>
      <div className='quant-est'>
        Result: <span className='mono'>{targetName}</span>
        {estGB != null && <> · about {estGB} GB{systemRam && <> · <span className={estGB <= systemRam * 0.75 ? 'key-ok' : 'fit-badge fit-tight'}>{estGB <= systemRam * 0.75 ? 'runs well here' : 'tight fit'}</span></>}</>}
      </div>
      <button className='small-btn primary' onClick={run} disabled={running || !source}>
        {running ? 'Quantizing…' : 'Quantize'}
      </button>
      {log.length > 0 && <pre className='quant-log'>{log.join('\n')}</pre>}
      {err && <div className='error-note'>⚠ {err}</div>}
      {!running && !err && log.length > 0 && <div className='update-none'>Done — {targetName} is ready in your model list.</div>}
    </div>
  )
}

function ModelsPane ({ onModelsChanged }) {
  const [system, setSystem] = useState(null)
  const [local, setLocal] = useState({ running: true, models: [] })
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('downloads')
  const [hfResults, setHfResults] = useState(null)
  const [hfError, setHfError] = useState(null)
  const [pulls, setPulls] = useState({}) // model -> {status, completed, total, error, done}
  const seenDone = useRef(new Set())
  const hfTimer = useRef(null)

  useEffect(() => {
    clearTimeout(hfTimer.current)
    hfTimer.current = setTimeout(() => {
      setHfResults(null)
      setHfError(null)
      api.registrySearch(q, sort).then(setHfResults).catch(e => setHfError(e.message))
    }, q ? 400 : 0)
    return () => clearTimeout(hfTimer.current)
  }, [q, sort])

  const refreshLocal = () => api.getLocalModels().then(setLocal).catch(() => {})
  useEffect(() => {
    api.getSystem().then(setSystem).catch(() => {})
    refreshLocal()
  }, [])

  // Downloads run detached on the server — poll their status so leaving and
  // re-opening this screen never interrupts an in-flight download.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const list = await getDownloads().catch(() => [])
      if (!alive) return
      const map = {}
      for (const d of list) {
        map[d.model] = d
        // when a download finishes, refresh the installed list once
        if ((d.done || d.error) && !seenDone.current.has(d.model)) {
          seenDone.current.add(d.model)
          if (d.error) window.alert(`Download failed: ${d.error}`)
          refreshLocal(); onModelsChanged()
        }
        if (!d.done && !d.error) seenDone.current.delete(d.model)
      }
      setPulls(map)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const installedSet = new Set(local.models.map(m => m.name.replace(/:latest$/, '')))
  const isInstalled = tag => installedSet.has(tag) || installedSet.has(tag.replace(/:latest$/, ''))

  // item: { repo, files, model } — download exact GGUF file(s) from HF, import via Ollama
  const startPull = async item => {
    seenDone.current.delete(item.model)
    setPulls(p => ({ ...p, [item.model]: { status: 'starting', completed: 0, total: 0 } }))
    try { await startDownload(item) } catch (e) { window.alert(`Couldn't start download: ${e.message}`) }
  }

  const cancelPull = model => { cancelDownload(model); setPulls(p => { const n = { ...p }; delete n[model]; return n }) }

  const remove = async tag => {
    if (!window.confirm(`Remove ${tag} from disk?`)) return
    await api.deleteLocalModel(tag)
    refreshLocal()
    onModelsChanged()
  }

  return (
    <div className='set-section'>
      <h3>Local models</h3>
      {system && (
        <div className='spec-card'>
          <div className='spec-chip-name'>{system.chip}</div>
          <div className='spec-detail'>
            {system.ramGB} GB unified memory · {system.cores} cores · macOS {system.osVersion}
            {system.diskFreeGB != null && <> · <span className={system.diskFreeGB < 20 ? 'fit-badge fit-tight' : ''}>{system.diskFreeGB} GB free on disk</span></>}
          </div>
          <div className='spec-note'>
            Badges show what fits: <span className='fit-badge fit-ok'>runs well</span> under {Math.round(system.ramGB * 0.75)} GB,
            <span className='fit-badge fit-tight'> tight fit</span> near the limit,
            <span className='fit-badge fit-no'> too big</span> for this Mac.
          </div>
        </div>
      )}
      {!local.running && (
        <div className='error-note'>⚠ Ollama isn't running — start it to download and run local models.</div>
      )}

      {local.models.length > 0 && (
        <div className='installed-block'>
          <div className='installed-label'>On this Mac · {local.models.length} installed</div>
          {[...local.models].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(m => (
            <div key={m.name} className='installed-row'>
              <span className='v-tag mono'>{m.name}</span>
              <span className='v-meta'>{m.sizeGB} GB</span>
              <button className='small-btn danger' title='Remove from disk' onClick={() => remove(m.name)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <QuantizeBlock systemRam={system?.ramGB} onDone={() => { refreshLocal(); onModelsChanged() }} />

      <div className='model-filter-row'>
        <input
          className='text-input' style={{ fontFamily: 'inherit' }}
          placeholder='Search Hugging Face for downloadable models…'
          value={q} onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className='model-filter-row'>
        <span className='sort-label'>Sort</span>
        {[['downloads', 'Most downloaded'], ['likes', 'Most liked'], ['trending', 'Trending'], ['updated', 'Recently updated'], ['created', 'Newest']].map(([id, label]) => (
          <button key={id} className={'pill-toggle' + (sort === id ? ' on' : '')} onClick={() => setSort(id)}>{label}</button>
        ))}
      </div>
      <div className='hf-note'>
        Downloads come from Hugging Face (the same source LM Studio and Unsloth use), pulled through Ollama.
        Expand a model to pick a quantization.
      </div>
      <div className='model-catalog'>
        {hfError && <div className='error-note'>⚠ Registry search failed: {hfError}</div>}
        {!hfResults && !hfError && <div className='activity-empty'>Searching Hugging Face…</div>}
        {hfResults && hfResults.map(r => (
          <HFRepoRow
            key={r.id}
            repo={r}
            installedCheck={tag => isInstalled(tag)}
            pulls={pulls}
            onPull={startPull}
            onCancel={cancelPull}
            systemRam={system?.ramGB}
            diskFree={system?.diskFreeGB}
          />
        ))}
        {hfResults && !hfResults.length && <div className='activity-empty'>No GGUF models match.</div>}
      </div>
    </div>
  )
}

// ---------- MCP ----------

function McpPane ({ config, onConfigChange }) {
  const servers = config.mcpServers || []
  const [status, setStatus] = useState([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')

  const loadStatus = () => api.mcpStatus().then(r => setStatus(r.servers || [])).catch(() => {})
  useEffect(() => { loadStatus() }, [servers.length])

  const add = async () => {
    if (!name.trim() || !command.trim()) return
    const [cmd, ...args] = command.trim().split(/\s+/)
    const cfg = await api.addMcp({ name: name.trim(), command: cmd, args })
    setName(''); setCommand(''); setAdding(false)
    onConfigChange(cfg); setTimeout(loadStatus, 500)
  }
  const toggle = async (id, enabled) => { onConfigChange(await api.updateMcp(id, { enabled })); setTimeout(loadStatus, 500) }
  const remove = async id => { if (window.confirm('Remove this MCP server?')) onConfigChange(await api.deleteMcp(id)) }

  const st = id => status.find(s => s.id === id)
  return (
    <div className='set-section'>
      <h3>MCP servers</h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
        Model Context Protocol servers give agents extra tools — databases, APIs, file systems, and more.
        Add a server by its launch command; its tools become available to the agent (each call asks approval).
      </p>

      {servers.map(s => {
        const info = st(s.id)
        return (
          <div key={s.id} className='mcp-row'>
            <label className='skill-toggle'><input type='checkbox' checked={s.enabled !== false} onChange={e => toggle(s.id, e.target.checked)} /></label>
            <div className='skill-main'>
              <div className='skill-name'>{s.name} {info && (info.connected ? <span className='key-ok'>✓ {info.toolCount} tools</span> : <span className='fit-badge fit-no'>{info.error ? 'error' : 'off'}</span>)}</div>
              <div className='skill-body mono'>{s.url || `${s.command} ${(s.args || []).join(' ')}`}</div>
              {info?.error && <div className='error-note' style={{ fontSize: 11 }}>{info.error}</div>}
              {info?.connected && info.tools?.length > 0 && <div className='skill-body'>Tools: {info.tools.slice(0, 8).join(', ')}{info.tools.length > 8 ? '…' : ''}</div>}
            </div>
            <button className='small-btn danger' onClick={() => remove(s.id)}>✕</button>
          </div>
        )
      })}
      {!servers.length && <div className='activity-empty' style={{ marginTop: 8 }}>No MCP servers yet.</div>}

      {adding
        ? <div className='skill-add'>
            <input className='text-input' style={{ fontFamily: 'inherit', marginBottom: 8 }} placeholder='Name (e.g. Filesystem)' value={name} onChange={e => setName(e.target.value)} />
            <input className='text-input' style={{ marginBottom: 4 }} placeholder='Launch command (e.g. npx -y @modelcontextprotocol/server-filesystem ~/Projects)' value={command} onChange={e => setCommand(e.target.value)} />
            <div className='oauth-note'>Runs as a local process. Only add servers you trust.</div>
            <div className='row' style={{ marginTop: 8 }}>
              <button className='small-btn primary' onClick={add} disabled={!name.trim() || !command.trim()}>Add server</button>
              <button className='small-btn' onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        : <button className='small-btn' style={{ marginTop: 12 }} onClick={() => setAdding(true)}>+ Add MCP server</button>}
    </div>
  )
}

// ---------- Agents ----------

function AgentEditor ({ agent, skills, models, onSave, onDelete, onClose, onDuplicate }) {
  const [a, setA] = useState({ ...agent })
  const set = patch => setA(prev => ({ ...prev, ...patch }))
  const accentHue = Math.round(Number(getComputedStyle(document.documentElement).getPropertyValue('--accent-h')) || 258)
  const [docker, setDocker] = useState(null)
  useEffect(() => { api.dockerStatus().then(setDocker).catch(() => {}) }, [])
  const toggleSkill = id => set({ skills: (a.skills || []).includes(id) ? a.skills.filter(s => s !== id) : [...(a.skills || []), id] })
  return (
    <div className='agent-editor'>
      <div className='agent-editor-head'>
        <span className='agent-emoji-input' style={{ color: `oklch(0.65 0.15 ${a.hue ?? 'var(--accent-h)'})` }}><AgentGlyph agent={a} size={22} /></span>
        <input className='text-input' style={{ fontFamily: 'inherit', flex: 1 }} placeholder='Agent name' value={a.name} onChange={e => set({ name: e.target.value })} />
      </div>
      <div className='agent-field'>Icon
        <div className='icon-picker'>
          {AGENT_ICON_IDS.map(id => (
            <button key={id} type='button' className={'icon-choice' + (a.icon === id ? ' sel' : '')} style={{ '--ah': a.hue ?? 'var(--accent-h)' }} onClick={() => set({ icon: id })} title={id}>
              {AGENT_ICONS[id]({ size: 18 })}
            </button>
          ))}
        </div>
      </div>
      <label className='agent-field'>Personality / instructions
        <textarea className='text-input' style={{ fontFamily: 'inherit', minHeight: 90, resize: 'vertical' }} placeholder="e.g. You are a meticulous code reviewer…" value={a.persona || ''} onChange={e => set({ persona: e.target.value })} />
      </label>
      <label className='agent-field'>Model
        <select className='text-input' style={{ fontFamily: 'inherit' }} value={a.model || ''} onChange={e => {
          const m = models.find(x => x.id === e.target.value)
          set({ model: e.target.value || null, provider: m ? m.provider : null })
        }}>
          <option value=''>Session default (pick per chat)</option>
          {models.map(m => <option key={m.provider + m.id} value={m.id}>{m.providerName} · {m.id}</option>)}
        </select>
      </label>
      <label className='agent-field'>Planner model <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>— optional lead model that plans first, then the model above executes</span>
        <select className='text-input' style={{ fontFamily: 'inherit' }} value={a.plannerModel || ''} onChange={e => {
          const m = models.find(x => x.id === e.target.value)
          set({ plannerModel: e.target.value || null, plannerProvider: m ? m.provider : null })
        }}>
          <option value=''>None (no separate planning step)</option>
          {models.map(m => <option key={m.provider + m.id} value={m.id}>{m.providerName} · {m.id}</option>)}
        </select>
      </label>
      <label className='agent-field'>Color
        <span className='agent-color-row'>
          <input type='range' min='0' max='360' className='hue-slider' value={a.hue ?? accentHue} onChange={e => set({ hue: Number(e.target.value) })} />
          <span className='agent-color-dot' style={{ background: `oklch(0.7 0.16 ${a.hue ?? 'var(--accent-h)'})` }} />
          {a.hue == null
            ? <span className='agent-color-note'>Accent</span>
            : <button type='button' className='agent-color-reset' onClick={() => set({ hue: null })}>Use accent</button>}
        </span>
      </label>
      {skills.length > 0 && (
        <div className='agent-field'>Skills for this agent
          <span className='agent-field-hint'>Turns a skill on for just this agent. Ones tagged “all agents” are already on everywhere (from Settings → Skills).</span>
          <div className='agent-skills'>
            {skills.map(sk => (
              <label key={sk.id} className='agent-skill-chk'>
                <input type='checkbox' checked={(a.skills || []).includes(sk.id)} onChange={() => toggleSkill(sk.id)} /> {sk.name}
                {sk.enabled && <span className='skill-global-tag' title='Enabled globally in Settings → Skills'>all agents</span>}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className='agent-field-row'>
        <label className='agent-skill-chk'><input type='checkbox' checked={a.useTools !== false} onChange={e => set({ useTools: e.target.checked })} /> Agent tools</label>
        <label className='agent-skill-chk'><input type='checkbox' checked={Boolean(a.computerControl)} onChange={e => set({ computerControl: e.target.checked })} /> Computer control</label>
      </div>
      <div className='sandbox-field'>
        <label className='agent-skill-chk'><input type='checkbox' checked={Boolean(a.sandbox)} onChange={e => set({ sandbox: e.target.checked })} /> Give this agent its own computer <span className='sandbox-tag'>sandbox</span></label>
        <div className='sandbox-note'>
          The agent works on its <strong>own private Linux desktop</strong> in a container — it can click, type, and run apps freely and <strong>never touches this Mac</strong>.
          {' '}
          {docker == null ? 'Checking Docker…'
            : docker.running ? <span className='key-ok'>✓ Docker is running — ready.</span>
              : docker.installed ? <span className='fit-badge fit-tight'>Docker is installed but not running — start Docker Desktop or Colima.</span>
                : <span className='fit-badge fit-no'>Requires Docker Desktop (or Colima) — not detected.</span>}
        </div>
        <div className='sandbox-note' style={{ color: 'var(--text-faint)' }}>
          Requirements: Docker running · a one-time ~2 GB Linux desktop download · ~1–2 GB RAM while active. The sandbox desktop is provisioned the first time the agent uses its computer.
        </div>
      </div>
      <div className='row' style={{ marginTop: 10 }}>
        <button className='small-btn primary' onClick={() => onSave(a)} disabled={!a.name?.trim()}>Save</button>
        <button className='small-btn' onClick={onClose}>Cancel</button>
        {agent.id && onDuplicate && <button className='small-btn' onClick={() => onDuplicate(a)} title='Make an editable copy of this agent'>Duplicate</button>}
        {!agent.builtin && agent.id && <button className='small-btn danger' style={{ marginLeft: 'auto' }} onClick={() => onDelete(agent.id)}>Delete</button>}
      </div>
    </div>
  )
}

function AgentsPane ({ config, onConfigChange, initialView }) {
  const agents = config.agents || []
  const skills = config.skills || []
  const [models, setModels] = useState([])
  const [editing, setEditing] = useState(null) // agent object or null
  const [editNonce, setEditNonce] = useState(0) // bump to remount the editor with fresh state
  const [browsing, setBrowsing] = useState(initialView === 'library') // template library open
  const [libQuery, setLibQuery] = useState('')
  const importFileRef = useRef(null)
  useEffect(() => { api.getModels().then(setModels).catch(() => {}) }, [])
  const openEditor = obj => { setEditNonce(n => n + 1); setEditing(obj) }
  const fromTemplate = t => { setBrowsing(false); openEditor({ name: t.name, icon: t.icon, hue: null, persona: t.persona, model: null, provider: null, skills: [], useTools: true }) }

  const saveAgent = async a => {
    const cfg = a.id && agents.find(x => x.id === a.id)
      ? await api.updateAgent(a.id, a)
      : await api.addAgent(a)
    setEditing(null)
    onConfigChange(cfg)
  }
  const del = async id => { onConfigChange(await api.deleteAgent(id)); setEditing(null) }
  const duplicate = a => { const { id, builtin, ...copy } = a; openEditor({ ...copy, name: (a.name || 'Agent') + ' copy' }) }

  if (editing) {
    return (
      <div className='set-section'>
        <button className='back-link' onClick={() => setEditing(null)}>← All agents</button>
        <h3 style={{ marginTop: 6 }}>{editing.id ? `Edit ${editing.name || 'agent'}` : 'New agent'}</h3>
        <AgentEditor key={editNonce} agent={editing} skills={skills} models={models} onSave={saveAgent} onDelete={del} onClose={() => setEditing(null)} onDuplicate={duplicate} />
      </div>
    )
  }

  if (browsing) {
    const have = new Set(agents.map(a => a.name.toLowerCase()))
    const q = libQuery.trim().toLowerCase()
    const matches = t => !q || `${t.name} ${t.blurb} ${t.cat} ${t.persona || ''}`.toLowerCase().includes(q)
    const shownCats = AGENT_TEMPLATE_CATS.filter(cat => AGENT_TEMPLATES.some(t => t.cat === cat && matches(t)))
    const total = AGENT_TEMPLATES.filter(matches).length
    return (
      <div className='set-section'>
        <button className='back-link' onClick={() => setBrowsing(false)}>← All agents</button>
        <h3 style={{ marginTop: 6 }}>Agent library</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
          Ready-made expert agents. Pick one to review and add — you can change the model, name, and skills before saving.
        </p>
        <input className='session-search' style={{ marginBottom: 4 }} placeholder={`Filter ${AGENT_TEMPLATES.length} agents…`} value={libQuery} onChange={e => setLibQuery(e.target.value)} />
        {shownCats.map(cat => (
          <div key={cat} className='tmpl-cat'>
            <div className='tmpl-cat-label'>{cat}</div>
            <div className='tmpl-grid'>
              {AGENT_TEMPLATES.filter(t => t.cat === cat && matches(t)).map(t => (
                <button key={t.name} className='tmpl-card' onClick={() => fromTemplate(t)}>
                  <span className='tmpl-ico'>{(AGENT_ICONS[t.icon] || AGENT_ICONS.bot)({ size: 18 })}</span>
                  <span className='tmpl-body'>
                    <span className='tmpl-name'>{t.name}{have.has(t.name.toLowerCase()) && <span className='tmpl-have'>✓ added</span>}</span>
                    <span className='tmpl-blurb'>{t.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!total && <p style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>No agents match “{libQuery}”.</p>}
      </div>
    )
  }

  const exportAgents = () => {
    const custom = agents.filter(a => !a.builtin).map(({ id, builtin, ...a }) => a)
    if (!custom.length) { window.alert('No custom agents to export yet. Build or add some from the library first.'); return }
    const blob = new Blob([JSON.stringify({ radiantAgents: 1, agents: custom }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'radiant-agents.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const importAgents = async fileList => {
    let cfg = null; let added = 0; let skipped = 0
    const have = new Set(agents.map(a => (a.name || '').trim().toLowerCase())) // dedupe by name so re-import doesn't clone
    let found = 0
    for (const file of Array.from(fileList).slice(0, 5)) {
      try {
        const data = JSON.parse(await file.text())
        const list = Array.isArray(data) ? data : (data.agents || [])
        for (const a of list) {
          if (!a || !a.name) continue
          found++
          const key = a.name.trim().toLowerCase()
          if (have.has(key)) { skipped++; continue }
          have.add(key)
          const { id, builtin, ...clean } = a
          cfg = await api.addAgent({ ...clean, skills: clean.skills || [] }); added++
        }
      } catch {}
    }
    if (cfg) onConfigChange(cfg)
    const msg = !found
      ? 'No agents found in that file.'
      : `Imported ${added} agent${added === 1 ? '' : 's'}.` + (skipped ? ` Skipped ${skipped} already in your list (same name).` : '')
    window.alert(msg)
  }

  return (
    <div className='set-section'>
      <div className='row' style={{ alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Agents</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className='small-btn' onClick={exportAgents} title='Download your custom agents as a shareable file'>Export</button>
          <button className='small-btn' onClick={() => importFileRef.current?.click()} title='Import agents from a file'>Import</button>
          <input ref={importFileRef} type='file' accept='.json' multiple hidden onChange={e => { if (e.target.files.length) importAgents(e.target.files); e.target.value = '' }} />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
        Agents are named personas with their own personality, model, and skills — start a session with one to give the agent a role. <strong>Export</strong> shares your custom agents as a file; <strong>Import</strong> loads a pack.
      </p>
      <div className='agent-grid'>
        {agents.map(a => (
          <button key={a.id} className='agent-card' style={{ '--ah': a.hue ?? 'var(--accent-h)' }} onClick={() => openEditor(a)}>
            <span className='agent-avatar' style={{ color: `oklch(0.68 0.16 ${a.hue ?? 'var(--accent-h)'})` }}><AgentGlyph agent={a} size={20} /></span>
            <span className='agent-card-name'>{a.name}</span>
            <span className='agent-card-desc'>{(() => { const d = cleanDesc(a.persona); return d ? d.slice(0, 70) + (d.length > 70 ? '…' : '') : 'General assistant' })()}</span>
          </button>
        ))}
        <button className='agent-card agent-card-new' onClick={() => openEditor({ name: '', emoji: '🤖', hue: null, persona: '', model: null, provider: null, skills: [], useTools: true })}>
          <span className='agent-avatar'>+</span>
          <span className='agent-card-name'>New agent</span>
        </button>
        <button className='agent-card agent-card-new' onClick={() => setBrowsing(true)}>
          <span className='agent-avatar'>◎</span>
          <span className='agent-card-name'>Browse library</span>
          <span className='agent-card-desc'>{AGENT_TEMPLATES.length} ready-made agents</span>
        </button>
      </div>
    </div>
  )
}

// ---------- Skills ----------

// parse a dropped skill file: SKILL.md-style frontmatter (name/description) + body
function parseSkillFile (filename, text) {
  let name = filename.replace(/\.(md|markdown|txt|skill)$/i, '').replace(/[-_]/g, ' ')
  let description = ''
  let content = text
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (fm) {
    const meta = fm[1]
    const nm = meta.match(/^name:\s*(.+)$/mi)
    const desc = meta.match(/^description:\s*(.+)$/mi)
    if (nm) name = nm[1].trim().replace(/^["']|["']$/g, '')
    if (desc) description = desc[1].trim().replace(/^["']|["']$/g, '')
    content = fm[2].trim()
  }
  return { name: name.trim(), description, content: content.trim() }
}

function SkillsPane ({ config, onConfigChange }) {
  const skills = config.skills || []
  const suggestions = config.skillSuggestions || []
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const fileRef = useRef(null)

  const acceptSuggestion = async id => onConfigChange(await api.acceptSkillSuggestion(id))
  const rejectSuggestion = async id => onConfigChange(await api.rejectSkillSuggestion(id))
  const toggle = async (id, enabled) => onConfigChange(await api.updateSkill(id, { enabled }))
  const remove = async id => { if (window.confirm('Delete this skill?')) onConfigChange(await api.deleteSkill(id)) }
  const add = async () => {
    if (!name.trim() || !content.trim()) return
    const cfg = await api.addSkill({ name: name.trim(), content: content.trim() })
    setName(''); setContent(''); setAdding(false)
    onConfigChange(cfg)
  }

  const importFiles = async fileList => {
    let cfg = null
    for (const file of Array.from(fileList).slice(0, 10)) {
      try {
        const text = await file.text()
        const sk = parseSkillFile(file.name, text)
        if (sk.content) cfg = await api.addSkill({ ...sk, enabled: true })
      } catch {}
    }
    if (cfg) onConfigChange(cfg)
  }

  return (
    <div className='set-section'>
      <h3>Skills</h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
        Skills are reusable instructions an agent follows — coding conventions, a house style, a workflow.
        Checking a skill here turns it on for <strong>every</strong> agent and session. To use one with a
        single agent only, leave it off here and enable it in that agent's settings instead.
      </p>

      {suggestions.length > 0 && (
        <div className='skill-suggestions'>
          <div className='skill-suggestions-head'><Icon.sparkle size={14} /> Suggested for you <span className='skill-suggest-count'>{suggestions.length}</span></div>
          <div className='skill-suggestions-sub'>The agent noticed these while you worked. Nothing is added until you approve it.</div>
          {suggestions.map(s => (
            <div key={s.id} className='sug-card'>
              <div className='sug-top'>
                <div className='sug-main'>
                  <div className='sug-name'>{s.name}</div>
                  <div className='sug-desc'>{s.description}</div>
                  {s.rationale && <div className='sug-why'>Why: {s.rationale}</div>}
                </div>
                <div className='sug-actions'>
                  <button className='small-btn primary' onClick={() => acceptSuggestion(s.id)}>Add skill</button>
                  <button className='small-btn' onClick={() => rejectSuggestion(s.id)}>Reject</button>
                </div>
              </div>
              <button className='sug-preview-toggle' onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                {expanded === s.id ? '▾ Hide' : '▸ Preview'} what it does
              </button>
              {expanded === s.id && <pre className='sug-preview'>{s.content}</pre>}
            </div>
          ))}
        </div>
      )}

      <div
        className={'skill-drop' + (dragOver ? ' over' : '')}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files) }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type='file' accept='.md,.markdown,.txt,.skill' multiple hidden onChange={e => { if (e.target.files.length) importFiles(e.target.files); e.target.value = '' }} />
        <Icon.download size={20} />
        <div>Drop a skill file here <span style={{ color: 'var(--text-faint)' }}>— or click to browse</span></div>
        <div className='skill-drop-hint'>Markdown (.md) files with optional <span className='mono'>name:</span> / <span className='mono'>description:</span> frontmatter</div>
      </div>

      {skills.length > 0 && <div className='skill-list-head'>On for all agents</div>}
      {skills.map(sk => (
        <div key={sk.id} className='skill-row'>
          <label className='skill-toggle' title='On for every agent and session'>
            <input type='checkbox' checked={Boolean(sk.enabled)} onChange={e => toggle(sk.id, e.target.checked)} />
          </label>
          <div className='skill-main'>
            <div className='skill-name'>{sk.name}</div>
            <div className='skill-body'>{sk.description || sk.content}</div>
          </div>
          <button className='small-btn danger' onClick={() => remove(sk.id)} title='Delete skill'>✕</button>
        </div>
      ))}
      {!skills.length && <div className='activity-empty' style={{ marginTop: 8 }}>No skills yet.</div>}

      {adding
        ? <div className='skill-add'>
            <input className='text-input' style={{ fontFamily: 'inherit', marginBottom: 8 }} placeholder='Skill name (e.g. House style)' value={name} onChange={e => setName(e.target.value)} />
            <textarea className='text-input' style={{ fontFamily: 'inherit', minHeight: 90, resize: 'vertical' }} placeholder='Instructions the agent should follow…' value={content} onChange={e => setContent(e.target.value)} />
            <div className='row' style={{ marginTop: 8 }}>
              <button className='small-btn primary' onClick={add} disabled={!name.trim() || !content.trim()}>Add skill</button>
              <button className='small-btn' onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        : <button className='small-btn' style={{ marginTop: 12 }} onClick={() => setAdding(true)}>+ New skill</button>}
    </div>
  )
}

// ---------- Appearance ----------

function AppearancePane ({ config, onSettings }) {
  const s = config.settings
  const isCustom = !THEMES.find(t => t.id === s.themeId)
  const preview = patch => {
    applyTheme({ ...s, ...patch })
    onSettings(patch)
  }
  const pickColor = hex => {
    const { C, H } = hexToOklch(hex)
    // clamp chroma into the range the palette expects
    preview({ themeId: 'custom', customHue: Math.round(H), customChroma: Math.min(0.25, Math.max(0.02, +C.toFixed(3))) })
  }
  const currentAccentHex = accentHex(
    isCustom ? (s.customHue ?? 258) : THEMES.find(t => t.id === s.themeId).hue,
    isCustom ? (s.customChroma ?? 0.11) : THEMES.find(t => t.id === s.themeId).chroma
  )

  return (
    <div className='set-section'>
      <h3>Appearance</h3>

      <div className='sub-label'>Mode</div>
      <div className='mode-row'>
        {MODES.map(m => (
          <button key={m.id} className={'mode-btn' + (s.mode === m.id ? ' selected' : '')} onClick={() => preview({ mode: m.id })}>
            <span className='mode-swatch' data-mode={m.id} />
            <span>{m.icon} {m.name}</span>
          </button>
        ))}
      </div>

      <div className='sub-label'>Theme</div>
      <div className='theme-grid'>
        {THEMES.map(t => (
          <button
            key={t.id}
            className={'theme-swatch' + (s.themeId === t.id ? ' selected' : '')}
            onClick={() => preview({ themeId: t.id, bgTint: t.tint })}
          >
            <span className='dot' style={{ background: accentHex(t.hue, t.chroma) }} />
            {t.name}
          </button>
        ))}
      </div>

      <div className='sub-label'>Accent color</div>
      <div className='accent-picker'>
        <label className='color-well' style={{ background: currentAccentHex }}>
          <input type='color' value={currentAccentHex} onChange={e => pickColor(e.target.value)} />
        </label>
        <div className='accent-picker-text'>
          <div className='mono' style={{ fontSize: 12 }}>{currentAccentHex}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Click the swatch to open the full palette{isCustom ? ' · custom' : ''}</div>
        </div>
        {isCustom && (
          <input
            type='range' min='0' max='0.25' step='0.005' className='chroma-slider' style={{ flex: 1 }}
            value={s.customChroma ?? 0.11}
            onChange={e => preview({ customChroma: Number(e.target.value) })}
            title='Accent vividness'
          />
        )}
      </div>

      <div className='sub-label'>Background tint</div>
      <div className='hue-row'>
        <label htmlFor='bgtint'>Amount</label>
        <input
          id='bgtint' type='range' min='0' max='5' step='0.1' className='tint-slider'
          value={s.bgTint != null ? s.bgTint : (THEMES.find(t => t.id === s.themeId)?.tint ?? 1)}
          onChange={e => preview({ bgTint: Number(e.target.value) })}
        />
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)', width: 88 }}>
          {(s.bgTint != null ? s.bgTint : (THEMES.find(t => t.id === s.themeId)?.tint ?? 1)) < 0.4 ? 'neutral' : 'how much the accent colors the background'}
        </span>
      </div>

      <div className='sub-label'>Animated background</div>
      <div className='accent-picker' style={{ gap: 10 }}>
        <select className='text-input' style={{ fontFamily: 'inherit', maxWidth: 240 }}
          value={s.motionBg || 'off'} onChange={e => preview({ motionBg: e.target.value })}>
          {MOTIONS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Moving backdrop behind the app (respects reduced-motion)</span>
      </div>

      <div className='sub-label'>Font</div>
      <div className='theme-grid'>
        {FONTS.map(f => (
          <button
            key={f.id}
            className={'theme-swatch' + ((s.fontFamily || 'inter') === f.id ? ' selected' : '')}
            style={{ fontFamily: f.stack }}
            onClick={() => preview({ fontFamily: f.id })}
          >
            {f.name}
          </button>
        ))}
      </div>

      <div className='sub-label'>Text size</div>
      <div className='theme-grid'>
        {UI_SCALES.map(u => (
          <button
            key={u.id}
            className={'theme-swatch' + ((s.uiScale || 1) === u.id ? ' selected' : '')}
            onClick={() => preview({ uiScale: u.id })}
          >
            {u.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Agent ----------

function AgentPane ({ config, onSettings }) {
  const s = config.settings
  const [cwdDraft, setCwdDraft] = useState(s.defaultCwd || '')
  const [comp, setComp] = useState(null)
  useEffect(() => { api.computerStatus().then(setComp).catch(() => {}) }, [])
  return (
    <div className='set-section'>
      <h3>Agent</h3>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Shell command approval</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 8px' }}>File edits always run automatically. This is about <em>shell commands</em>.</div>
        <div className='seg-control'>
          {[['ask', 'Ask every time'], ['auto', 'Auto (risky only)'], ['off', 'Never ask']].map(([id, label]) => {
            const cur = s.approvalMode || (s.approveCommands === false ? 'off' : 'ask')
            return <button key={id} className={'seg-btn' + (cur === id ? ' on' : '')} onClick={() => onSettings({ approvalMode: id, approveCommands: id !== 'off' })}>{label}</button>
          })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
          <strong>Auto</strong> runs safe commands (ls, grep, tests, git status…) silently and only asks before risky ones — deletes, sudo, network fetches, pushes, chmod.
        </div>
      </div>
      <label className='check-row'>
        <input
          type='checkbox'
          checked={s.autoCompact !== false}
          onChange={e => onSettings({ autoCompact: e.target.checked })}
        />
        <span>Auto-compact long conversations <span className='desc'>— when a chat fills the model's context, summarize older messages so it can keep going</span></span>
      </label>
      <label className='check-row'>
        <input
          type='checkbox'
          checked={s.suggestSkills !== false}
          onChange={e => onSettings({ suggestSkills: e.target.checked })}
        />
        <span>Suggest skills from your activity <span className='desc'>— when the agent notices a repeatable, multi-step process or a workflow you set, it drafts a skill and asks you to approve it in Settings → Skills (cloud models only)</span></span>
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

      <h3 style={{ marginTop: 22 }}>Computer control</h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
        Turn on the <strong>computer</strong> toggle in the chat bar to let the agent drive a browser and your desktop.
        Use a vision-capable model (Claude, GPT-4o, or a local VL model) so it can see what it's doing.
      </p>
      <label className='check-row'>
        <input type='checkbox' checked={Boolean(s.fullAutomation)} onChange={e => onSettings({ fullAutomation: e.target.checked })} />
        <span>Full automation <span className='desc'>— let agents click, type, and run apps <strong>without approving each step</strong></span></span>
      </label>
      <div className={'automation-note' + (s.fullAutomation ? ' warn' : '')}>
        {s.fullAutomation
          ? '⚠ On — computer actions run automatically. An agent can act on your Mac as you would, including actions that can\'t be undone. Use only with models and tasks you trust.'
          : 'Basic (recommended) — every computer action pauses for your approval before it runs.'}
      </div>
      <div className='spec-card' style={{ marginTop: 4 }}>
        <div className='comp-stat'>
          <span className={comp?.browser ? 'key-ok' : 'fit-badge fit-no'}>{comp?.browser ? '✓' : '—'} Browser control</span>
          <span className='desc'>drives your system Chrome — ready to use</span>
        </div>
        <div className='comp-stat'>
          <span className={comp?.desktop ? 'key-ok' : 'fit-badge fit-no'}>{comp?.desktop ? '✓' : '—'} Desktop control</span>
          <span className='desc'>needs macOS permissions granted to Radiant</span>
        </div>
        <div className='spec-note' style={{ marginTop: 10 }}>
          For desktop control, grant Radiant <strong>Screen Recording</strong> (to see the screen) and
          <strong> Accessibility</strong> (to click and type) in System Settings → Privacy &amp; Security.
          macOS prompts on first use. Browser control needs no permissions.
        </div>
      </div>
    </div>
  )
}

// ---------- About & updates ----------

function AboutPane ({ config, onSettings }) {
  const s = config.settings
  const [version, setVersion] = useState(null)
  const [status, setStatus] = useState(null) // { hasUpdate, latest, current } | { error }
  const [checking, setChecking] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | downloading | ready
  const [progress, setProgress] = useState(0)
  const native = typeof window !== 'undefined' && window.radiantUpdater
  const [storage, setStorage] = useState(null)

  useEffect(() => { api.getVersion().then(v => setVersion(v.version)).catch(() => {}) }, [])
  useEffect(() => { api.getStorage().then(setStorage).catch(() => {}) }, [])
  const clearOld = async days => {
    const label = days === 0 ? 'ALL saved chat sessions' : `chat sessions older than ${days} days`
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return
    const r = await api.clearSessions(days)
    api.getStorage().then(setStorage).catch(() => {})
    window.alert(`Removed ${r.removed} session${r.removed === 1 ? '' : 's'}.`)
  }

  // listen to auto-updater events in the packaged app
  useEffect(() => {
    if (!native) return
    return native.onEvent(ev => {
      if (ev.type === 'progress') { setPhase('downloading'); setProgress(ev.data.percent || 0) }
      else if (ev.type === 'downloaded') setPhase('ready')
      else if (ev.type === 'error') { setStatus({ error: ev.data.message }); setPhase('idle') }
    })
  }, [native])

  const check = async () => {
    setChecking(true); setStatus(null)
    try {
      if (native) {
        const r = await native.check()
        if (r.error) setStatus({ error: r.error })
        else setStatus({ hasUpdate: r.hasUpdate, latest: r.version, current: r.current })
      } else {
        const r = await api.updateCheck()
        setStatus({ hasUpdate: r.hasUpdate, latest: r.latest, current: r.current, dmgUrl: r.dmgUrl })
      }
    } catch (e) { setStatus({ error: e.message }) }
    setChecking(false)
  }

  const startDownload = () => { setPhase('downloading'); setProgress(0); native.download() }
  const restart = () => native.install()
  const openReleasePage = () => window.open(status?.dmgUrl || 'https://github.com/templetongroup/radiant/releases/latest', '_blank', 'noopener')

  return (
    <div className='set-section'>
      <h3>About Radiant</h3>
      <div className='about-row'>
        <div className='logo-mark' style={{ width: 40, height: 40 }} aria-hidden />
        <div>
          <div className='wordmark' style={{ fontSize: 18 }}>Radiant</div>
          <div className='about-ver'>Version {version || '…'}</div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <button className='small-btn primary' onClick={check} disabled={checking || phase !== 'idle'}>
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>

      {status && !status.error && (
        status.hasUpdate
          ? <div className='update-avail'>
              <div><strong>Radiant {status.latest}</strong> is available (you have {status.current}).</div>
              {native
                ? (phase === 'ready'
                    ? <div className='row' style={{ marginTop: 8, alignItems: 'center', gap: 10 }}>
                        <button className='small-btn primary' onClick={restart}>Restart &amp; install</button>
                        <span className='oauth-note'>Downloaded — Radiant will relaunch on the new version.</span>
                      </div>
                    : phase === 'downloading'
                      ? <div style={{ marginTop: 10 }}>
                          <div className='pull-bar' style={{ width: '100%' }}><span style={{ width: progress + '%' }} /></div>
                          <div className='oauth-note' style={{ marginTop: 6 }}>Downloading… {progress}%</div>
                        </div>
                      : <div className='row' style={{ marginTop: 8 }}>
                          <button className='small-btn primary' onClick={startDownload}>Download &amp; install</button>
                        </div>)
                : <div className='row' style={{ marginTop: 8 }}>
                    <button className='small-btn primary' onClick={openReleasePage}>Download</button>
                    <span className='oauth-note' style={{ marginLeft: 8 }}>Opens the release page (auto-install works in the installed app).</span>
                  </div>}
            </div>
          : <div className='update-none'>You're on the latest version ({status.current}).</div>
      )}
      {status?.error && <div className='error-note'>⚠ Couldn't check: {status.error}</div>}

      <label className='check-row' style={{ marginTop: 14 }}>
        <input
          type='checkbox'
          checked={s.autoUpdateCheck !== false}
          onChange={e => onSettings({ autoUpdateCheck: e.target.checked })}
        />
        <span>Automatically check for updates on launch</span>
      </label>
      <div className='oauth-note'>
        The desktop app also has <span className='mono'>Radiant → Check for Updates…</span> in the menu bar.
        Updates download in the background and install when you restart.
      </div>

      <h3 style={{ marginTop: 22 }}>Storage</h3>
      <p className='oauth-note' style={{ marginTop: 0 }}>
        {storage
          ? <>Radiant is keeping <strong>{storage.sessions}</strong> chat session{storage.sessions === 1 ? '' : 's'} ({storage.sizeMB} MB) in <span className='mono'>~/.radiant</span>. Old sessions add up — clear ones you no longer need.</>
          : 'Reading local storage…'}
      </p>
      <div className='row' style={{ gap: 12, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        <button className='small-btn' onClick={() => clearOld(90)}>Clear older than 90 days</button>
        <button className='small-btn' onClick={() => clearOld(30)}>Older than 30 days</button>
        <button className='small-btn danger' style={{ marginLeft: 'auto' }} onClick={() => clearOld(0)}>Delete all sessions</button>
      </div>

      <div className='about-footer' style={{ marginTop: 22 }}>
        <div className='about-footer-text'>A Templeton Technologies Product</div>
        <img
          className='about-footer-logo'
          src='/templeton-tech.png'
          alt='Templeton Technologies'
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      </div>
    </div>
  )
}

// ---------- shell ----------

function DevicesPane () {
  const [share, setShare] = useState(null)
  const server = getServer()
  const [base, setBase] = useState(server.base || '')
  const [token, setToken] = useState(server.token || '')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.getShare().then(setShare).catch(() => {}) }, [])
  const copy = t => { try { navigator.clipboard?.writeText(t) } catch {} }

  const toggleShare = async () => {
    try { const r = await api.setShare(!(share?.desired)); setShare(s => ({ ...s, ...r })) } catch (e) { setMsg(e.message) }
  }
  const connect = async () => {
    setBusy(true); setMsg(null)
    try {
      let url = base.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'http://' + url
      await testServer(url, token.trim())
      setServer({ base: url, token: token.trim() }); location.reload()
    } catch (e) { setMsg(e.message); setBusy(false) }
  }
  const useLocal = () => { setServer(null); location.reload() }

  return (
    <div className='set-section'>
      <h3>Devices &amp; sharing</h3>

      <div className='set-block'>
        <div className='set-block-title'>Share this Mac's server</div>
        <p className='hint' style={{ marginTop: 2 }}>Let your other Macs and your phone use this machine's models, agents, and sessions. Best on an always-on Mac; reach it over Tailscale. Changing this needs a Radiant relaunch.</p>
        <label className='agent-skill-chk'><input type='checkbox' checked={Boolean(share?.desired)} onChange={toggleShare} /> Share on my network</label>
        {share && share.desired !== share.enabled && <div className='error-note' style={{ marginTop: 6 }}>Quit and reopen Radiant to {share.desired ? 'start' : 'stop'} sharing.</div>}
        {share?.desired && share?.token && (
          <div style={{ marginTop: 10 }}>
            <div className='connect-field'>Access token
              <div className='row'><code className='mono share-token'>{share.token}</code><button className='small-btn' onClick={() => copy(share.token)}>Copy</button></div>
            </div>
            <div className='connect-field' style={{ marginTop: 8 }}>Other devices connect to:
              {(share.addresses || []).length
                ? share.addresses.map(a => (
                    <div key={a.address} className='row' style={{ marginTop: 4 }}>
                      <code className='mono'>{a.address}:{share.port}</code>
                      <span className='fit-badge' style={{ opacity: 0.8 }}>{a.label}</span>
                      <button className='small-btn' onClick={() => copy(`${a.address}:${share.port}`)}>Copy</button>
                    </div>))
                : <div className='v-meta'>No network address found — is Tailscale running?</div>}
            </div>
          </div>
        )}
      </div>

      <div className='set-block' style={{ marginTop: 16 }}>
        <div className='set-block-title'>Connect this app to another Radiant</div>
        <p className='hint' style={{ marginTop: 2 }}>Point this app at a shared Radiant on another Mac (e.g. your always-on host). It'll use that server's models, agents, and sessions instead of its own.</p>
        <label className='connect-field'>Server address
          <input className='text-input' placeholder='100.x.y.z:5834 (Tailscale) or host.local:5834' value={base} onChange={e => setBase(e.target.value)} />
        </label>
        <label className='connect-field' style={{ marginTop: 8 }}>Access token
          <input className='text-input' type='password' placeholder='Token from the host Mac' value={token} onChange={e => setToken(e.target.value)} />
        </label>
        {msg && <div className='error-note' style={{ marginTop: 6 }}>⚠ {msg}</div>}
        <div className='row' style={{ marginTop: 10 }}>
          <button className='small-btn primary' onClick={connect} disabled={busy || !base.trim()}>{busy ? 'Connecting…' : 'Connect & reload'}</button>
          {server.base && <button className='small-btn' onClick={useLocal}>Use this Mac's own server</button>}
        </div>
        {server.base
          ? <div className='v-meta' style={{ marginTop: 6 }}>Currently connected to <code className='mono'>{server.base}</code></div>
          : <div className='v-meta' style={{ marginTop: 6 }}>Currently using this Mac's own server.</div>}
      </div>
    </div>
  )
}

const GUIDE = [
  {
    title: 'Chat & agents',
    items: [
      ['Agents', 'Named personas with their own model, personality, and skills. Pick one from the welcome screen; the Agents sidebar view groups your sessions by agent. Edit them in Settings → Agents.'],
      ['Agents consult each other', 'Any agent can call the ask_agent tool to get a second opinion from another agent (e.g. Reviewer asks Architect) and fold the answer in.'],
      ['Plan mode (📋)', 'Toggle it in the composer. The agent researches and proposes a step-by-step plan for your approval before changing anything — then builds once you approve.'],
      ['The agent can ask you', 'When a decision is genuinely yours, the agent pauses and asks a multiple-choice question (you can also type your own answer) instead of guessing.'],
      ['Task checklists', 'On multi-step work the agent keeps a live to-do list above the composer (done / in-progress / pending).'],
      ['Files changed', 'After a turn, the files the agent created or edited appear as clickable chips — click to open them.'],
      ['Loop-breaker', 'If an agent gets stuck repeating the same action, Radiant nudges it to change approach — without blocking legitimate repeats.'],
      ['Auto titles', 'New chats name themselves from your first message. Rename to pin your own title.']
    ]
  },
  {
    title: 'Models & providers',
    items: [
      ['Subscriptions', 'Sign in with your Claude, ChatGPT, or Nous Portal subscription (Settings → Providers) — no API key needed. Or paste an API key for any provider.'],
      ['Any OpenAI-compatible provider', 'Add Groq, Mistral, Together, a remote server, etc. with a name + base URL.'],
      ['Local models', 'Run models from Ollama or LM Studio with no key. Search Hugging Face and download GGUFs straight from Settings → Models.'],
      ['Compare', 'Run one prompt against two models side by side (command palette → Compare).']
    ]
  },
  {
    title: 'Tools the agent can use',
    items: [
      ['Files & commands', 'Read, write, and edit files and run shell commands in the workspace folder. Toggle with the “tools” pill; command runs ask for approval.'],
      ['Background jobs', 'Long builds, test watchers, and dev servers run in the background so the agent keeps working and checks on them.'],
      ['Terminal', 'A real terminal in the activity panel (top-right icon).'],
      ['Computer control (🖥)', 'Let a vision model drive the browser and desktop (needs macOS permissions).'],
      ['MCP', 'Connect Model Context Protocol servers in Settings → MCP to give agents extra tools.'],
      ['Skills', 'Drop a skill file into Settings → Skills (or type one) to inject house rules / instructions the agent follows.']
    ]
  },
  {
    title: 'Your devices',
    items: [
      ['One server, all your devices', 'Run Radiant’s server on an always-on Mac (Settings → Devices → Share on my network) and connect your other Macs and phone to it — they share the same agents, models, and sessions.'],
      ['On your phone', 'Open the host’s address in Safari (over Tailscale) and Add to Home Screen — it installs like an app.']
    ]
  },
  {
    title: 'Look & feel',
    items: [
      ['Themes', 'A dozen palettes plus a custom accent, in light / medium / dark (bottom-left toggle).'],
      ['Motion backgrounds', 'Ten animated backgrounds in Settings → Appearance.'],
      ['Usage meters', 'Live remaining quota for your subscriptions and OpenRouter balance at the bottom of the sidebar.'],
      ['Command palette', 'Press ⌘K for quick actions, model switching, and jumping between sessions.']
    ]
  }
]

function MemoryPane ({ config, onSettings }) {
  const [facts, setFacts] = useState(null)
  const [draft, setDraft] = useState('')
  const on = config.settings.memory !== false
  const load = () => api.getMemory().then(d => setFacts(d.facts)).catch(() => setFacts([]))
  useEffect(() => { load() }, [])
  const add = async () => { if (!draft.trim()) return; setFacts((await api.addMemory(draft.trim())).facts); setDraft('') }
  const del = async id => setFacts((await api.deleteMemory(id)).facts)
  const clear = async () => { if (window.confirm('Forget everything Radiant has remembered?')) setFacts((await api.clearMemory()).facts) }
  return (
    <div className='set-section'>
      <h3>Memory</h3>
      <p className='hint' style={{ marginTop: 0 }}>Radiant remembers durable facts about you and your projects across sessions, and gives the relevant ones to the agent. Everything is stored locally in <code className='mono'>~/.radiant/memory.json</code>.</p>
      <label className='check-row'>
        <input type='checkbox' checked={on} onChange={e => onSettings({ memory: e.target.checked })} />
        <span>Remember across sessions <span className='desc'>— learn from each chat and recall it later</span></span>
      </label>
      <div className='row' style={{ marginTop: 12 }}>
        <input className='text-input' style={{ flex: 1 }} placeholder='Add something to remember…' value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className='small-btn primary' onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
      <div style={{ marginTop: 14 }}>
        {facts === null ? <div className='v-meta'>Loading…</div>
          : !facts.length ? <div className='v-meta'>Nothing remembered yet — Radiant will learn as you chat.</div>
          : <>
              <div className='row' style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <span className='v-meta'>{facts.length} remembered</span>
                <button className='small-btn danger' onClick={clear}>Forget all</button>
              </div>
              {facts.slice().reverse().map(f => (
                <div key={f.id} className='memory-item'>
                  <span className='memory-text'>{f.text}</span>
                  <button className='memory-del' title='Forget this' onClick={() => del(f.id)}>✕</button>
                </div>
              ))}
            </>}
      </div>
    </div>
  )
}

function GuidePane () {
  return (
    <div className='set-section guide'>
      <h3>Read me — what Radiant can do</h3>
      <p className='hint' style={{ marginTop: 0 }}>A quick tour of the features. Everything here is configured in the other tabs.</p>
      {GUIDE.map(sec => (
        <div key={sec.title} className='guide-section'>
          <div className='guide-title'>{sec.title}</div>
          {sec.items.map(([name, desc]) => (
            <div key={name} className='guide-item'>
              <span className='guide-name'>{name}</span>
              <span className='guide-desc'>{desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const TABS = [
  { id: 'guide', label: 'Read me' },
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'memory', label: 'Memory' },
  { id: 'devices', label: 'Devices' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'agent', label: 'Automation' },
  { id: 'about', label: 'About' }
]

export default function Settings ({ config, initialTab = 'providers', initialAgentView = null, embedded = false, onClose, onSettings, onConfigChange, onModelsChanged }) {
  const [tab, setTab] = useState(initialTab)
  const body = (
    <div className={'modal wide' + (embedded ? ' embedded' : '')} role='dialog' aria-label='Settings'>
      <div className='modal-head'>
        Settings
        {!embedded && <button className='icon-btn' onClick={onClose} title='Close settings'><Icon.close /></button>}
      </div>
      <div className='modal-split'>
        <nav className='set-nav'>
          {TABS.map(t => (
            <button key={t.id} className={'set-nav-item' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className='modal-body'>
          {tab === 'guide' && <GuidePane />}
          {tab === 'providers' && <ProvidersPane config={config} onConfigChange={onConfigChange} />}
          {tab === 'models' && <ModelsPane onModelsChanged={onModelsChanged} />}
          {tab === 'agents' && <AgentsPane config={config} onConfigChange={onConfigChange} initialView={initialAgentView} />}
          {tab === 'skills' && <SkillsPane config={config} onConfigChange={onConfigChange} />}
          {tab === 'mcp' && <McpPane config={config} onConfigChange={onConfigChange} />}
          {tab === 'memory' && <MemoryPane config={config} onSettings={onSettings} />}
          {tab === 'devices' && <DevicesPane />}
          {tab === 'appearance' && <AppearancePane config={config} onSettings={onSettings} />}
          {tab === 'agent' && <AgentPane config={config} onSettings={onSettings} />}
          {tab === 'about' && <AboutPane config={config} onSettings={onSettings} />}
        </div>
      </div>
    </div>
  )
  if (embedded) return body
  return (
    <div className='modal-backdrop' onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      {body}
    </div>
  )
}
