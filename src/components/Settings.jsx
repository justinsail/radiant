import React, { useEffect, useRef, useState } from 'react'
import { api, streamPull, streamQuantize } from '../api.js'
import { THEMES, FONTS, UI_SCALES, applyTheme } from '../theme.js'

// ---------- Providers ----------

function ProviderRow ({ provider, oauthInfo, onConfig }) {
  const [draft, setDraft] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const pollRef = useRef(null)

  const save = async () => {
    if (!draft.trim()) return
    const cfg = await api.setKey(provider.id, draft.trim())
    setDraft('')
    onConfig(cfg)
  }
  const clear = async () => onConfig(await api.setKey(provider.id, ''))
  const remove = async () => onConfig(await api.removeProvider(provider.id))
  const signOut = async () => onConfig(await api.oauthSignout(provider.id))

  const startSignIn = async () => {
    setBusy(true)
    try {
      const { url, mode } = await api.oauthStart(provider.id)
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
      {oauthInfo && !provider.signedIn && !provider.hasKey && (
        <div className='provider-oauth'>
          {!signingIn
            ? <button className='small-btn subscribe' onClick={startSignIn} disabled={busy}>
                {busy ? 'Waiting for browser…' : `Sign in with ${oauthInfo.label} subscription`}
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

function HFRepoRow ({ repo, installedCheck, pulls, onPull, systemRam }) {
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
        const tag = qt.label === 'DEFAULT' ? `hf.co/${repo.id}` : `hf.co/${repo.id}:${qt.label}`
        const ram = ramNeededGB(qt.sizeGB)
        const fit = fitClass(ram, systemRam)
        const pull = pulls[tag]
        const pct = pull && pull.total ? Math.round((pull.completed / pull.total) * 100) : null
        return (
          <div key={qt.label} className='variant-row'>
            <span className='v-tag mono'>{qt.label.toLowerCase()}</span>
            <span className='v-meta'>{qt.sizeGB} GB download · ~{ram} GB RAM</span>
            <span className={'fit-badge ' + fit}>{FIT_LABEL[fit] || ''}</span>
            <span className='v-action'>
              {installedCheck(tag)
                ? <span className='key-ok'>✓ installed</span>
                : pull
                  ? <span className='pull-progress'>
                      <span className='pull-bar'><span style={{ width: (pct ?? 5) + '%' }} /></span>
                      {pct != null ? pct + '%' : (pull.status || 'starting…')}
                    </span>
                  : <button className='small-btn' onClick={() => onPull(tag)} disabled={fit === 'fit-no'}>Download</button>}
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
  const [pulls, setPulls] = useState({}) // tag -> {status, completed, total}
  const pullsRef = useRef({})
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

  const installedSet = new Set(local.models.map(m => m.name.replace(/:latest$/, '')))
  const isInstalled = tag => installedSet.has(tag) || installedSet.has(tag.replace(/:latest$/, ''))

  const startPull = async tag => {
    pullsRef.current = { ...pullsRef.current, [tag]: { status: 'starting' } }
    setPulls({ ...pullsRef.current })
    try {
      await streamPull(tag, ev => {
        if (ev.error) {
          pullsRef.current = { ...pullsRef.current, [tag]: undefined }
          window.alert(`Download failed: ${ev.error}`)
        } else {
          pullsRef.current = { ...pullsRef.current, [tag]: ev.status === 'done' ? undefined : ev }
        }
        setPulls({ ...pullsRef.current })
      })
    } finally {
      pullsRef.current = { ...pullsRef.current, [tag]: undefined }
      setPulls({ ...pullsRef.current })
      refreshLocal()
      onModelsChanged()
    }
  }

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
          {local.models.map(m => (
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
            systemRam={system?.ramGB}
          />
        ))}
        {hfResults && !hfResults.length && <div className='activity-empty'>No GGUF models match.</div>}
      </div>
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
  return (
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
            <span className='dot' style={{ background: `oklch(0.62 ${t.chroma} ${t.hue})` }} />
            {t.name}
          </button>
        ))}
        <button
          className={'theme-swatch' + (isCustom ? ' selected' : '')}
          onClick={() => preview({ themeId: 'custom' })}
        >
          <span className='dot' style={{ background: `oklch(0.62 ${s.customChroma} ${s.customHue})` }} />
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

      <h3 style={{ marginTop: 22 }}>Computer control</h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 0 }}>
        Turn on the <strong>computer</strong> toggle in the chat bar to let the agent drive a browser and your desktop.
        Use a vision-capable model (Claude, GPT-4o, or a local VL model) so it can see what it's doing.
      </p>
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
  const [status, setStatus] = useState(null) // update-check result or {error}
  const [checking, setChecking] = useState(false)

  useEffect(() => { api.getVersion().then(v => setVersion(v.version)).catch(() => {}) }, [])

  const check = async () => {
    setChecking(true); setStatus(null)
    try { setStatus(await api.updateCheck()) } catch (e) { setStatus({ error: e.message }) }
    setChecking(false)
  }
  const download = () => { if (status?.dmgUrl) window.open(status.dmgUrl, '_blank', 'noopener') }

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
        <button className='small-btn primary' onClick={check} disabled={checking}>
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>

      {status && !status.error && (
        status.hasUpdate
          ? <div className='update-avail'>
              <div><strong>Radiant {status.latest}</strong> is available (you have {status.current}).</div>
              <div className='row' style={{ marginTop: 8 }}>
                <button className='small-btn primary' onClick={download}>Download</button>
              </div>
              <div className='oauth-note' style={{ marginTop: 8 }}>
                Download the new .dmg and drag Radiant into Applications to replace this copy.
              </div>
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
        Auto-install requires a signed build; for now updates are one-click downloads.
      </div>

      <div className='about-footer'>
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

const TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'agent', label: 'Agent' },
  { id: 'about', label: 'About' }
]

export default function Settings ({ config, initialTab = 'providers', onClose, onSettings, onConfigChange, onModelsChanged }) {
  const [tab, setTab] = useState(initialTab)
  return (
    <div className='modal-backdrop' onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className='modal wide' role='dialog' aria-label='Settings'>
        <div className='modal-head'>
          Settings
          <button className='icon-btn' onClick={onClose}>✕</button>
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
            {tab === 'providers' && <ProvidersPane config={config} onConfigChange={onConfigChange} />}
            {tab === 'models' && <ModelsPane onModelsChanged={onModelsChanged} />}
            {tab === 'appearance' && <AppearancePane config={config} onSettings={onSettings} />}
            {tab === 'agent' && <AgentPane config={config} onSettings={onSettings} />}
            {tab === 'about' && <AboutPane config={config} onSettings={onSettings} />}
          </div>
        </div>
      </div>
    </div>
  )
}
