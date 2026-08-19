import React, { useEffect, useRef, useState } from 'react'
import { api, streamPull } from '../api.js'
import { THEMES, applyTheme } from '../theme.js'

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

function VariantRow ({ variant, installed, pull, onPull, onDelete, systemRam }) {
  const fit = fitClass(variant.ramGB, systemRam)
  const pct = pull && pull.total ? Math.round((pull.completed / pull.total) * 100) : null
  return (
    <div className='variant-row'>
      <span className='v-tag mono'>{variant.tag}</span>
      <span className='v-meta'>{variant.params} · {variant.dlGB} GB download · ~{variant.ramGB} GB RAM</span>
      <span className={'fit-badge ' + fit}>{FIT_LABEL[fit] || ''}</span>
      <span className='v-action'>
        {installed
          ? <>
              <span className='key-ok'>✓ installed</span>
              <button className='small-btn danger' title='Remove from disk' onClick={() => onDelete(variant.tag)}>✕</button>
            </>
          : pull
            ? <span className='pull-progress'>
                <span className='pull-bar'><span style={{ width: (pct ?? 5) + '%' }} /></span>
                {pct != null ? pct + '%' : (pull.status || 'starting…')}
              </span>
            : <button className='small-btn' onClick={() => onPull(variant.tag)} disabled={fit === 'fit-no'}>Download</button>}
      </span>
    </div>
  )
}

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

function ModelsPane ({ onModelsChanged }) {
  const [system, setSystem] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [local, setLocal] = useState({ running: true, models: [] })
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [source, setSource] = useState('curated') // 'curated' | 'hf'
  const [hfResults, setHfResults] = useState(null)
  const [hfError, setHfError] = useState(null)
  const [pulls, setPulls] = useState({}) // tag -> {status, completed, total}
  const pullsRef = useRef({})
  const hfTimer = useRef(null)

  useEffect(() => {
    if (source !== 'hf') return
    clearTimeout(hfTimer.current)
    hfTimer.current = setTimeout(() => {
      setHfError(null)
      api.registrySearch(q).then(setHfResults).catch(e => setHfError(e.message))
    }, q ? 400 : 0)
    return () => clearTimeout(hfTimer.current)
  }, [q, source])

  const refreshLocal = () => api.getLocalModels().then(setLocal).catch(() => {})
  useEffect(() => {
    api.getSystem().then(setSystem).catch(() => {})
    api.getCatalog().then(setCatalog).catch(() => {})
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

  const cats = ['all', 'general', 'coding', 'reasoning', 'vision', 'embedding']
  const filtered = catalog.filter(f =>
    (cat === 'all' || f.category === cat) &&
    (f.family + f.desc + f.variants.map(v => v.tag).join(' ')).toLowerCase().includes(q.toLowerCase())
  )

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
      <div className='model-filter-row'>
        <input
          className='text-input' style={{ fontFamily: 'inherit' }}
          placeholder={source === 'hf' ? 'Search all of Hugging Face…' : 'Search models…'}
          value={q} onChange={e => setQ(e.target.value)}
        />
        <button className={'pill-toggle' + (source === 'curated' ? ' on' : '')} onClick={() => setSource('curated')}>curated</button>
        <button className={'pill-toggle' + (source === 'hf' ? ' on' : '')} onClick={() => setSource('hf')}>hugging face</button>
      </div>
      {source === 'curated' && (
        <>
          <div className='model-filter-row'>
            {cats.map(c => (
              <button key={c} className={'pill-toggle' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
          <div className='model-catalog'>
            {filtered.map(f => (
              <div key={f.family} className='model-family'>
                <div className='mf-head'>
                  <span className='mf-name'>{f.family}</span>
                  <span className='mf-cat'>{f.category}</span>
                  <span className='mf-desc'>{f.desc}</span>
                </div>
                {f.variants.map(v => (
                  <VariantRow
                    key={v.tag}
                    variant={v}
                    installed={isInstalled(v.tag)}
                    pull={pulls[v.tag]}
                    onPull={startPull}
                    onDelete={remove}
                    systemRam={system?.ramGB}
                  />
                ))}
              </div>
            ))}
            {!filtered.length && <div className='activity-empty'>No models match.</div>}
          </div>
        </>
      )}
      {source === 'hf' && (
        <div className='model-catalog'>
          {hfError && <div className='error-note'>⚠ Registry search failed: {hfError}</div>}
          {!hfResults && !hfError && <div className='activity-empty'>Searching the registry…</div>}
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
      )}
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
    </div>
  )
}

// ---------- Agent ----------

function AgentPane ({ config, onSettings }) {
  const s = config.settings
  const [cwdDraft, setCwdDraft] = useState(s.defaultCwd || '')
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
    </div>
  )
}

// ---------- shell ----------

const TABS = [
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'agent', label: 'Agent' }
]

export default function Settings ({ config, onClose, onSettings, onConfigChange, onModelsChanged }) {
  const [tab, setTab] = useState('providers')
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
          </div>
        </div>
      </div>
    </div>
  )
}
