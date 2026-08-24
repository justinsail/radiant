import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as GaugeModule from './Gauge.jsx'

// Picking a model is the first thing a new user does, so this screen has one
// job: make the obvious choice obvious. A recommended model gets the hero —
// the gauge at 96pt and a single filled capsule — and the other four sit under
// it as an ordinary inset grouped list. Five plain-English rows is not the wall
// of quantisation suffixes the Swift catalog comment warns about, and hiding
// four of them behind a second tap would be dishonest, so they stay visible and
// simply weigh less.
//
// Everything here is state the phone can actually report. The plugin emits
// downloadStarted / downloadDone / downloadFailed and nothing in between
// (TG-221), so there is no percentage and no byte counter anywhere on this
// screen. An indeterminate gauge that is telling the truth beats a bar creeping
// to 90% and hanging.

// The gauge is the app's only loading indicator and it is drawn once, in
// Gauge.jsx. Read through a namespace import so a default or a named export
// both work; if the module ever resolves to neither we render a hole rather
// than take the whole first-run screen down with a null-component crash.
// (spread first so the bundler does not statically warn about whichever of the
// two export names Gauge.jsx turns out not to use)
const GaugeExports = { ...GaugeModule }
const SharedGauge = GaugeExports.default || GaugeExports.Gauge || (() => null)

const LM = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LocalModels : null)
const PLUGIN = name => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.[name] : null)

// Haptics are reached off the bridge rather than imported, so the JS wrapper
// never enters the root package.json and the Mac bundle stays untouched.
// NOTE FOR INTEGRATION: the spec puts these in src/mobile/haptics.js. That file
// belongs to another agent and its export shape is not settled yet, so these
// three guarded calls live here for now; swapping them for the shared module is
// a one-line change per call site.
const hapt = {
  light: () => PLUGIN('Haptics')?.impact?.({ style: 'LIGHT' }),
  medium: () => PLUGIN('Haptics')?.impact?.({ style: 'MEDIUM' }),
  ok: () => PLUGIN('Haptics')?.notification?.({ type: 'SUCCESS' }),
  err: () => PLUGIN('Haptics')?.notification?.({ type: 'ERROR' })
}

// Qwen 3 1.7B is the recommendation because its blurb is the only one that
// promises a good result without qualification ("a good all-rounder on any
// recent iPhone"). If the native catalog ever drops it we fall through to the
// first entry rather than rendering a picker with no hero.
const RECOMMENDED_ID = 'qwen3-1.7b'

// Decimal GB, matching how Apple reports storage in Settings. Using 2^30 here
// would make every size on screen disagree with the number the user can check.
const GB = 1e9
const fmtGB = bytes => `${(bytes / GB).toFixed(1)} GB`

/* ------------------------------------------------------------------ styles */

// One injected stylesheet instead of rules in mobile.css, because mobile.css is
// written by another agent who cannot know these class names. Every value
// resolves from the shared --rx-* tokens when they exist and falls back to the
// literal from the spec when they do not, so this screen is correct on its own
// and can never drift from the shared palette once the tokens land.
const CSS = `
.rx-mp{
  --mp-bg:var(--rx-bg-grouped,#F2F2F7);
  --mp-cell:var(--rx-cell,#FFFFFF);
  --mp-sep:var(--rx-separator,rgba(60,60,67,0.29));
  --mp-label:var(--rx-label,#000000);
  --mp-label-2:var(--rx-label-2,rgba(60,60,67,0.60));
  --mp-label-3:var(--rx-label-3,rgba(60,60,67,0.30));
  --mp-fill-1:var(--rx-fill-1,rgba(120,120,128,0.20));
  --mp-fill-3:var(--rx-fill-3,rgba(120,120,128,0.12));
  --mp-tint:var(--rx-tint,#3F69A7);
  --mp-tint-pressed:var(--rx-tint-pressed,#35588C);
  --mp-on-tint:var(--rx-on-tint,#FFFFFF);
  --mp-amber:var(--rx-amber,#B25E00);
  --mp-red:var(--rx-red-text,#D70015);
  --mp-green:var(--rx-green,#248A3D);

  --mp-font:var(--rx-font,-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif);
  --mp-mono:var(--rx-mono,ui-monospace,'SF Mono',Menlo,monospace);
  --mp-r-cell:var(--rx-r-cell,10px);
  --mp-r-button:var(--rx-r-button,14px);

  /* pre-solved springs; never an ease */
  --mp-press:var(--rx-press,linear(0,.096,.311,.548,.763,.924,1.025,1.078,1.094,1.086,1.066,1.044,1.024,1.008,.998,.993,.991,.992,.994,.996,.998,.999,1));
  --mp-dur-press:var(--rx-dur-press,322ms);
  --mp-down:var(--rx-down,cubic-bezier(.2,0,0,1));
  --mp-dur-down:var(--rx-dur-down,110ms);
  --mp-pop:var(--rx-pop,linear(0,.06,.198,.361,.525,.668,.786,.874,.939,.982,1.008,1.022,1.027,1.027,1.024,1.02,1.015,1.011,1.007,1.005,1.002,1.001,1));
  --mp-dur-pop:var(--rx-dur-pop,316ms);

  --mp-dt:1;

  display:flex; flex-direction:column; min-height:100%;
  background:var(--mp-bg); color:var(--mp-label);
  font-family:var(--mp-font); letter-spacing:normal;
  -webkit-tap-highlight-color:transparent; touch-action:manipulation;
  -webkit-user-select:none; user-select:none; -webkit-touch-callout:none;
}
@media (prefers-color-scheme:dark){
  .rx-mp{
    --mp-bg:var(--rx-bg-grouped,#000000);
    --mp-cell:var(--rx-cell,#1C1C1E);
    --mp-sep:var(--rx-separator,rgba(84,84,88,0.65));
    --mp-label:var(--rx-label,#FFFFFF);
    --mp-label-2:var(--rx-label-2,rgba(235,235,245,0.60));
    --mp-label-3:var(--rx-label-3,rgba(235,235,245,0.30));
    --mp-fill-1:var(--rx-fill-1,rgba(120,120,128,0.36));
    --mp-fill-3:var(--rx-fill-3,rgba(120,120,128,0.24));
    --mp-tint:var(--rx-tint,#79A6E9);
    --mp-tint-pressed:var(--rx-tint-pressed,#6791CE);
    /* the flip: near-black labels on a light tint fill. White here measures
       ~2.4:1 and is the fastest way to make an iOS button look amateur. */
    --mp-on-tint:var(--rx-on-tint,#050911);
    --mp-amber:var(--rx-amber,#FF9F0A);
    --mp-red:var(--rx-red-text,#FF453A);
    --mp-green:var(--rx-green,#30D158);
  }
}

/* the scroller bounces (a list that cannot rubber-band feels dead) but never
   shows a bar — a visible scrollbar is a webview tell */
.rx-mp-scroll{flex:1 1 auto; overflow-y:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none}
.rx-mp-scroll::-webkit-scrollbar{display:none}
.rx-mp-inner{padding:0 16px max(20px,env(safe-area-inset-bottom)); margin:0 auto; width:100%; max-width:34em; box-sizing:border-box}

.rx-mp-title{
  font-family:var(--mp-font); font-size:calc(34px*var(--mp-dt)); line-height:1.21;
  font-weight:700; letter-spacing:-0.4px; margin:8px 0 0; color:var(--mp-label);
}
.rx-mp-lede{font-size:calc(15px*var(--mp-dt)); font-weight:400; font:-apple-system-subheadline; color:var(--mp-label-2); margin:6px 0 0; line-height:1.33}

/* ---- hero: the recommended model, no card and no plate. The gauge on the
   grouped background IS the hero; a bordered box would make it a settings
   row with ambitions. ---- */
.rx-mp-hero{display:flex; flex-direction:column; align-items:center; text-align:center; padding:24px 0 4px}
.rx-mp-hero-gauge{display:block; height:96px; color:var(--mp-tint)}
.rx-mp-hero-name{font-family:var(--mp-font); font-size:calc(22px*var(--mp-dt)); line-height:1.27; font-weight:600; margin:16px 0 0}
.rx-mp-hero-blurb{font-size:calc(15px*var(--mp-dt)); font-weight:400; font:-apple-system-subheadline; color:var(--mp-label-2); margin:4px 0 0; line-height:1.33; max-width:26em}
.rx-mp-hero-note{font-size:calc(13px*var(--mp-dt)); font-weight:400; font:-apple-system-footnote; margin:10px 0 0; line-height:1.38}
.rx-mp-hero-note.is-amber{color:var(--mp-amber)}
.rx-mp-hero-note.is-red{color:var(--mp-red)}

.rx-mp-cta{
  -webkit-appearance:none; appearance:none; border:0; display:flex; align-items:center;
  justify-content:center; gap:8px; width:100%; min-height:50px; margin:20px 0 0;
  border-radius:var(--mp-r-button); background:var(--mp-tint); color:var(--mp-on-tint);
  font-size:calc(17px*var(--mp-dt)); font:-apple-system-headline; font-weight:600;
  transition:transform var(--mp-dur-press) var(--mp-press), background-color 200ms linear;
}
.rx-mp-cta.is-pressed{background:var(--mp-tint-pressed); transform:scale(.96); transition:transform var(--mp-dur-down) var(--mp-down), background-color 0s}
/* a disabled control is never a faded tint — it is a neutral fill with a
   quiet glyph, the way Apple does it */
.rx-mp-cta[disabled]{background:var(--mp-fill-3); color:var(--mp-label-3); transform:none}
.rx-mp-cta-gauge{color:var(--mp-amber); display:block; height:22px; flex:0 0 auto}

.rx-mp-secondary{
  -webkit-appearance:none; appearance:none; border:0; background:none; display:block;
  width:100%; min-height:44px; margin:4px 0 0;
  font-size:calc(17px*var(--mp-dt)); font-weight:400; font:-apple-system-body;
  color:var(--mp-tint); transition:opacity var(--mp-dur-press) var(--mp-press);
}
.rx-mp-secondary.is-pressed{opacity:.4; transition:opacity var(--mp-dur-down) var(--mp-down)}

.rx-mp-sechead{font-size:calc(13px*var(--mp-dt)); font-weight:400; font:-apple-system-footnote; color:var(--mp-label-2); margin:20px 0 6px; padding:0 4px}
.rx-mp-secfoot{font-family:var(--mp-font); font-size:calc(12px*var(--mp-dt)); line-height:1.33; color:var(--mp-label-2); margin:6px 0 0; padding:0 4px}

.rx-mp-group{list-style:none; margin:0; padding:0; background:var(--mp-cell); border-radius:var(--mp-r-cell); overflow:hidden}

.rx-mp-row{
  position:relative; display:flex; align-items:center; gap:12px;
  min-height:60px; padding:12px 16px; box-sizing:border-box;
  background:transparent; transition:background-color 250ms linear;
}
/* rows never scale, and the fill lands with no fade-in — any ease on touchdown
   reads as lag */
.rx-mp-row.is-pressed{background:var(--mp-fill-1); transition:none}
.rx-mp-row.is-blocked{opacity:1}
.rx-mp-row.is-blocked .rx-mp-row-name{color:var(--mp-label-3)}
/* separators are inset to the text column: 16 margin + 29 glyph + 12 gutter.
   Full-bleed rules between grouped cells read as not-Apple instantly. */
.rx-mp-row + .rx-mp-row::before{
  content:''; position:absolute; top:0; left:57px; right:0; height:0.5px; background:var(--mp-sep);
}
.rx-mp-row-lead{flex:0 0 29px; height:29px; display:block}
.rx-mp-row-lead > *{display:block; height:29px; color:inherit}
.rx-mp-row-text{flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:1px}
.rx-mp-row-name{font-size:calc(17px*var(--mp-dt)); font-weight:600; font:-apple-system-headline; color:var(--mp-label)}
.rx-mp-row-sub{
  font-size:calc(15px*var(--mp-dt)); font-weight:400; font:-apple-system-subheadline;
  color:var(--mp-label-2); line-height:1.33;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.rx-mp-row-sub.is-amber{color:var(--mp-amber); white-space:normal}
.rx-mp-row-sub.is-red{color:var(--mp-red); white-space:normal}
/* at accessibility sizes a truncated model name is useless, so the row stops
   clipping and grows instead */
.rx-mp.is-ax .rx-mp-row-sub{white-space:normal}
.rx-mp.is-ax .rx-mp-row{align-items:flex-start}
.rx-mp.is-ax .rx-mp-row-lead{margin-top:2px}
.rx-mp-row-acc{flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:2px; min-width:44px}
/* 44pt of hit area from padding around a 28pt glyph. Getting it from
   width:44px instead swells the glyph and unbalances the row. */
.rx-mp-row-glyph{display:flex; align-items:center; justify-content:center; width:28px; height:28px; padding:8px; box-sizing:content-box; color:var(--mp-tint)}
.rx-mp-row-glyph.is-quiet{color:var(--mp-label-3)}
.rx-mp-row-glyph.is-green{color:var(--mp-green)}
.rx-mp-row-glyph.is-amber{color:var(--mp-amber)}
.rx-mp-row-glyph > *{display:block; height:28px}
.rx-mp-row-size{
  font-size:calc(13px*var(--mp-dt)); font-weight:400; font:-apple-system-footnote;
  color:var(--mp-label-3); font-variant-numeric:tabular-nums; font-feature-settings:'tnum';
}
.rx-mp-row-retry{font-size:calc(13px*var(--mp-dt)); font-weight:400; font:-apple-system-footnote; color:var(--mp-tint); padding:4px 0}

.rx-mp-note{font-size:calc(13px*var(--mp-dt)); font-weight:400; font:-apple-system-footnote; color:var(--mp-label-2); text-align:center; padding:32px 8px; line-height:1.38}

/* the completion beat: one 500ms pop, then the row settles back to tint.
   Green is a confirmation here, never a state. */
.rx-mp-pop{animation:rx-mp-pop var(--rx-dur-complete,444ms) var(--rx-complete,linear(0,.149,.471,.803,1.049,1.177,1.203,1.162,1.094,1.029,.983,.961,.959,.969,.984,.996,1.005,1.008,1.008,1.006,1.003,1,1)) both}
@keyframes rx-mp-pop{from{transform:scale(.6)}to{transform:scale(1)}}
.rx-mp-fade-in{animation:rx-mp-fade var(--mp-dur-pop) var(--mp-pop) both}
@keyframes rx-mp-fade{from{opacity:0; transform:translateY(4px)}to{opacity:1; transform:none}}

@media (prefers-reduced-motion:reduce){
  .rx-mp-pop,.rx-mp-fade-in{animation:none}
  /* press states are feedback, not decoration — they stay */
}
`

if (typeof document !== 'undefined' && !document.querySelector('style[data-rx="model-picker"]')) {
  const tag = document.createElement('style')
  tag.setAttribute('data-rx', 'model-picker')
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/* ------------------------------------------------------------------- glyphs */

// SF Symbols geometry, drawn rather than imported: Icons.jsx is styled by
// styles.css, which this build never loads.
const ArrowDownCircle = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="12.1" stroke="currentColor" strokeWidth="1.7" />
    <path d="M14 8.2v11.6M9.4 15.3 14 19.9l4.6-4.6" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Checkmark = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true">
    <path d="M5.8 14.6 11.2 20 22.2 8.4" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* -------------------------------------------------------------- dynamic type */

// Two mechanisms, per the type spec: WebKit's system text styles carry the
// user's Text Size for free, and everything hand-sized is multiplied by this.
// Read --rx-dt first so that if Phone.jsx already measured it we agree with it
// exactly rather than probing a second, slightly different number.
function measureDynamicType () {
  if (typeof document === 'undefined') return 1
  const shared = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rx-dt'))
  if (Number.isFinite(shared) && shared > 0) return shared
  const p = document.createElement('span')
  p.style.font = '-apple-system-body'
  p.style.position = 'fixed'
  p.style.visibility = 'hidden'
  p.style.pointerEvents = 'none'
  p.textContent = 'M'
  document.body.appendChild(p)
  const raw = parseFloat(getComputedStyle(p).fontSize) / 17
  p.remove()
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 1, 0.82), 1.6)
}

/* --------------------------------------------------------------- press state */

// Press is JS-driven, never `:active` and never `:hover`. On iOS a :hover rule
// sticks after a tap and the row stays lit, which is disqualifying on its own.
// The commit fires on pointerup inside the bounds, so a finger that slides off
// cancels the way it does in every Apple list.
function usePress (onCommit, disabled) {
  const [pressed, setPressed] = useState(false)
  const origin = useRef(null)

  const end = useCallback(commit => {
    const started = origin.current
    origin.current = null
    setPressed(false)
    if (commit && started && !disabled) onCommit?.()
  }, [onCommit, disabled])

  const handlers = useMemo(() => ({
    onPointerDown: e => {
      if (disabled || e.button > 0) return
      origin.current = { x: e.clientX, y: e.clientY }
      setPressed(true)
    },
    onPointerMove: e => {
      if (!origin.current) return
      // 10pt of slop, then the press is a scroll and the highlight must go
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) end(false)
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onLostPointerCapture: () => end(false)
  }), [disabled, end])

  return [pressed, handlers]
}

/* ---------------------------------------------------------------- the screen */

/**
 * The model picker.
 *
 * @param {(model) => void}  onChoose      a model is on the device and the user wants to use it
 * @param {() => void}      [onConnectMac] renders the secondary Mac escape hatch when supplied
 * @param {string}          [heading]      "Choose a model" reads right in the first-run cover and in the sheet
 * @param {React.Component} [Gauge]        override for the shared iris, for tests
 */
export default function ModelPicker ({ onChoose, onConnectMac, heading = 'Choose a model', Gauge = SharedGauge }) {
  const [models, setModels] = useState(null)   // null = still asking the plugin
  const [error, setError] = useState(null)     // list() blew up
  const [jobs, setJobs] = useState({})         // id -> { state:'downloading'|'failed', message }
  const [justDone, setJustDone] = useState(null)
  const [freeBytes, setFreeBytes] = useState(null) // null = Device unavailable, so no shortfall claims

  const rootRef = useRef(null)
  const scrollRef = useRef(null)
  const [dt, setDt] = useState(1)

  // Auto-advance bookkeeping. If the user scrolled or backgrounded the app
  // while a download ran we do not yank them into the chat when it lands.
  const pendingRef = useRef(null)
  const interruptedRef = useRef(false)

  const plugin = LM()
  const downloadingId = useMemo(
    () => Object.keys(jobs).find(id => jobs[id]?.state === 'downloading') || null,
    [jobs]
  )

  /* -- dynamic type ------------------------------------------------------- */
  useEffect(() => {
    const apply = () => {
      const v = measureDynamicType()
      setDt(v)
      rootRef.current?.style.setProperty('--mp-dt', String(v))
    }
    apply()
    // the Text Size setting can change while the app is in the background
    window.addEventListener('resize', apply)
    document.addEventListener('visibilitychange', apply)
    return () => {
      window.removeEventListener('resize', apply)
      document.removeEventListener('visibilitychange', apply)
    }
  }, [])

  /* -- catalog ------------------------------------------------------------ */
  const refresh = useCallback(async () => {
    const lm = LM()
    if (!lm) return
    try {
      const res = await lm.list()
      setModels(res?.models || [])
      setError(null)
    } catch (e) {
      setError(e?.message || 'Could not read the model list.')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Free space, so a 2.3 GB pull that cannot possibly fit is refused up front
  // instead of failing at 90%. If Device is not there we make no claim at all.
  const refreshDisk = useCallback(async () => {
    const dev = PLUGIN('Device')
    if (!dev?.getInfo) return
    try {
      const info = await dev.getInfo()
      setFreeBytes(typeof info?.realDiskFree === 'number' ? info.realDiskFree : null)
    } catch { setFreeBytes(null) }
  }, [])

  useEffect(() => { refreshDisk() }, [refreshDisk])

  /* -- plugin events ------------------------------------------------------ */
  useEffect(() => {
    const lm = LM()
    if (!lm?.addListener) return

    const on = {
      // downloadStarted also arrives for a download we did not initiate (a
      // retry from the sheet, say), so the reducer is idempotent.
      downloadStarted: ({ id }) => setJobs(j => ({ ...j, [id]: { state: 'downloading' } })),
      downloadDone: ({ id }) => {
        setJobs(j => { const n = { ...j }; delete n[id]; return n })
        setModels(ms => (ms || []).map(m => (m.id === id ? { ...m, downloaded: true } : m)))
        setJustDone(id)
        hapt.ok()
        refreshDisk()
      },
      downloadFailed: ({ id, message }) => {
        setJobs(j => ({ ...j, [id]: { state: 'failed', message: message || 'The download did not finish.' } }))
        if (pendingRef.current === id) pendingRef.current = null
        hapt.err()
      }
    }

    // addListener resolves to the handle in Capacitor 7; if the component
    // unmounts before it settles, tear the listener down on arrival.
    let dead = false
    const handles = []
    for (const [ev, fn] of Object.entries(on)) {
      Promise.resolve(lm.addListener(ev, fn))
        .then(h => { if (dead) h?.remove?.(); else handles.push(h) })
        .catch(() => {})
    }
    return () => { dead = true; handles.forEach(h => h?.remove?.()) }
  }, [refreshDisk])

  /* -- the completion beat and the auto-advance --------------------------- */
  useEffect(() => {
    if (!justDone) return
    const model = (models || []).find(m => m.id === justDone)
    // 500ms of green, then the tick settles back to tint.
    const settle = setTimeout(() => setJustDone(null), 500)
    // Only advance for the download this session started, and only if the user
    // is still watching. Never yank the UI out from under someone.
    const advance = setTimeout(() => {
      if (pendingRef.current === justDone && !interruptedRef.current && model) {
        pendingRef.current = null
        onChoose?.(model)
      }
    }, 700)
    return () => { clearTimeout(settle); clearTimeout(advance) }
  }, [justDone, models, onChoose])

  useEffect(() => {
    const scroller = scrollRef.current
    const mark = () => { if (pendingRef.current) interruptedRef.current = true }
    const onVis = () => { if (document.hidden) mark() }
    scroller?.addEventListener('scroll', mark, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    return () => {
      scroller?.removeEventListener('scroll', mark)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  /* -- actions ------------------------------------------------------------ */
  const startDownload = useCallback(async model => {
    const lm = LM()
    if (!lm) return
    hapt.medium()
    pendingRef.current = model.id
    interruptedRef.current = false
    setJobs(j => ({ ...j, [model.id]: { state: 'downloading' } }))
    try {
      await lm.download({ id: model.id })
    } catch (e) {
      // The plugin emits downloadFailed before rejecting, so this only has work
      // to do for the rejections that carry no event (an unknown id).
      setJobs(j => (j[model.id]?.state === 'downloading'
        ? { ...j, [model.id]: { state: 'failed', message: e?.message || 'The download did not finish.' } }
        : j))
    }
  }, [])

  const commit = useCallback(model => {
    hapt.light()
    if (model.downloaded) { onChoose?.(model); return }
    // Exactly one gauge animates at a time, and two multi-GB pulls at once
    // would only make both slower — so a second tap while one runs is a no-op.
    if (downloadingId) return
    startDownload(model)
  }, [downloadingId, onChoose, startDownload])

  /* -- derived ------------------------------------------------------------ */
  const list = models || []
  const hero = list.find(m => m.id === RECOMMENDED_ID) || list[0] || null
  const rest = hero ? list.filter(m => m.id !== hero.id) : list

  const shortfallFor = useCallback(model => {
    if (freeBytes == null) return 0
    const need = model.sizeGB * GB
    return need > freeBytes ? need - freeBytes : 0
  }, [freeBytes])

  /* -- render ------------------------------------------------------------- */
  if (!plugin) {
    return (
      <div className="rx-mp" ref={rootRef}>
        <div className="rx-mp-scroll"><div className="rx-mp-inner">
          <h1 className="rx-mp-title">{heading}</h1>
          <p className="rx-mp-note">Downloading a model needs the Radiant app on iPhone.</p>
        </div></div>
      </div>
    )
  }

  return (
    <div className={`rx-mp${dt > 1.2 ? ' is-ax' : ''}`} ref={rootRef}>
      <div className="rx-mp-scroll" ref={scrollRef}>
        <div className="rx-mp-inner">
          <h1 className="rx-mp-title">{heading}</h1>
          <p className="rx-mp-lede">It runs on this iPhone — no account, and no network once it&rsquo;s here.</p>

          {error && <p className="rx-mp-note">{error}</p>}

          {hero && (
            <Hero
              model={hero}
              Gauge={Gauge}
              job={jobs[hero.id]}
              done={justDone === hero.id}
              busyElsewhere={!!downloadingId && downloadingId !== hero.id}
              shortfall={shortfallFor(hero)}
              onCommit={() => commit(hero)}
            />
          )}

          {rest.length > 0 && (
            <>
              <h2 className="rx-mp-sechead">All models</h2>
              <ul className="rx-mp-group">
                {rest.map(m => (
                  <Row
                    key={m.id}
                    model={m}
                    Gauge={Gauge}
                    job={jobs[m.id]}
                    done={justDone === m.id}
                    busyElsewhere={!!downloadingId && downloadingId !== m.id}
                    shortfall={shortfallFor(m)}
                    onCommit={() => commit(m)}
                  />
                ))}
              </ul>
            </>
          )}

          {list.length > 0 && (
            <p className="rx-mp-secfoot">
              Models run entirely on this iPhone. Nothing you type leaves the device.
            </p>
          )}

          {onConnectMac && (
            <SecondaryButton onCommit={onConnectMac}>Connect to a Mac instead</SecondaryButton>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- pieces */

// The gauge never changes hue except tint <-> amber. Absent is a neutral, not a
// faded tint, so an undownloaded model reads as empty rather than as broken.
const gaugeColor = state => (
  state === 'working' ? 'var(--mp-amber)'
    : state === 'resident' ? 'var(--mp-tint)'
      : 'var(--mp-label-3)'
)

function Hero ({ model, Gauge, job, done, busyElsewhere, shortfall, onCommit }) {
  const downloading = job?.state === 'downloading'
  const failed = job?.state === 'failed'
  const blocked = shortfall > 0 && !model.downloaded && !downloading
  const disabled = downloading || busyElsewhere || blocked

  const gaugeState = downloading ? 'working'
    : failed ? 'failed'
      : model.downloaded ? 'resident' : 'absent'

  let label
  if (downloading) label = 'Downloading…'
  else if (blocked) label = 'Not enough room'
  else if (model.downloaded) label = 'Start chatting'
  else if (failed) label = 'Try again'
  else label = `Download · ${model.sizeGB.toFixed(1)} GB`

  const [pressed, handlers] = usePress(onCommit, disabled)

  return (
    <div className="rx-mp-hero">
      {/* currentColor is set here as well as inside Gauge, so the mark is right
          whether Gauge paints its own stroke or inherits. Amber only ever means
          the phone is spending something. */}
      <span
        className={`rx-mp-hero-gauge${done ? ' rx-mp-pop' : ''}`}
        style={{ color: gaugeColor(gaugeState) }}
      >
        <Gauge state={gaugeState} size={96} />
      </span>
      <div className="rx-mp-hero-name">{model.name}</div>
      <p className="rx-mp-hero-blurb">{model.blurb}</p>

      <button
        type="button"
        className={`rx-mp-cta${pressed ? ' is-pressed' : ''}`}
        disabled={disabled}
        {...handlers}
      >
        {downloading && (
          <span className="rx-mp-cta-gauge"><Gauge state="working" size={22} /></span>
        )}
        {label}
      </button>

      {/* Amber means the device itself is spending something. It shows up while
          a download runs and nowhere else on this screen. */}
      {downloading && (
        <p className="rx-mp-hero-note is-amber rx-mp-fade-in">Keep Radiant open while this downloads.</p>
      )}
      {failed && !downloading && (
        <p className="rx-mp-hero-note is-red">{job.message}</p>
      )}
      {blocked && (
        <p className="rx-mp-hero-note is-amber">Needs {fmtGB(shortfall)} more room on this iPhone.</p>
      )}
    </div>
  )
}

function Row ({ model, Gauge, job, done, busyElsewhere, shortfall, onCommit }) {
  const downloading = job?.state === 'downloading'
  const failed = job?.state === 'failed'
  const blocked = shortfall > 0 && !model.downloaded && !downloading
  const disabled = downloading || busyElsewhere || blocked

  const [pressed, handlers] = usePress(onCommit, disabled)

  const gaugeState = downloading ? 'working'
    : failed ? 'failed'
      : model.downloaded ? 'resident' : 'absent'

  let sub = model.blurb
  let subClass = ''
  if (failed) { sub = job.message; subClass = ' is-red' }
  else if (downloading) { sub = 'Downloading…'; subClass = ' is-amber' }
  else if (blocked) { sub = `Needs ${fmtGB(shortfall)} more room`; subClass = ' is-amber' }

  // The iCloud-download idiom needs no label: an arrow in a circle becomes a
  // spinning iris becomes a tick, and everyone already knows that story.
  let accessory
  if (downloading) {
    accessory = <span className="rx-mp-row-glyph is-amber"><Gauge state="working" size={28} /></span>
  } else if (failed) {
    accessory = <span className="rx-mp-row-retry">Try again</span>
  } else if (model.downloaded) {
    accessory = (
      <span className={`rx-mp-row-glyph${done ? ' is-green rx-mp-pop' : ''}`}><Checkmark /></span>
    )
  } else {
    accessory = <span className={`rx-mp-row-glyph${blocked ? ' is-quiet' : ''}`}><ArrowDownCircle /></span>
  }

  return (
    <li
      className={`rx-mp-row${pressed ? ' is-pressed' : ''}${blocked ? ' is-blocked' : ''}`}
      {...handlers}
    >
      <span className="rx-mp-row-lead" style={{ color: gaugeColor(gaugeState) }}>
        <Gauge state={gaugeState} size={29} />
      </span>
      <span className="rx-mp-row-text">
        <span className="rx-mp-row-name">{model.name}</span>
        <span className={`rx-mp-row-sub${subClass}`}>{sub}</span>
      </span>
      <span className="rx-mp-row-acc">
        {accessory}
        {!failed && <span className="rx-mp-row-size">{model.sizeGB.toFixed(1)} GB</span>}
      </span>
    </li>
  )
}

function SecondaryButton ({ children, onCommit }) {
  const [pressed, handlers] = usePress(onCommit, false)
  return (
    <button type="button" className={`rx-mp-secondary${pressed ? ' is-pressed' : ''}`} {...handlers}>
      {children}
    </button>
  )
}
