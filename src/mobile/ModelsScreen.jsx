/**
 * ModelsScreen — the root. The shell owns the scroller and the large title, so
 * this file starts at the hero and ends at the storage line.
 *
 * Information architecture IS the argument here: a resident model gets the
 * whole top of the screen with no card and no plate, the catalog is an ordinary
 * inset grouped list, and "Connect to a Mac" is one plain row two sections
 * down. On-device is the product; the Mac is one tap away and weighs nothing.
 *
 * ⚠️ THREE THINGS ON THIS SCREEN ARE DELIBERATE REVERSALS OF THE SPEC, all from
 * measuring it beside Settings on the same simulator:
 *
 * 1. NO LEADING GAUGE ON AN UNDOWNLOADED ROW. At 29pt the iris's three strokes
 *    render sub-pixel and collapse into a pale grey blob ~22pt wide. Five of
 *    them down the left edge read as broken image placeholders next to
 *    Settings' crisp 30pt icons, and they carried zero information because
 *    every row was in the same state. The gauge now appears only when it has
 *    something to say — resident, or downloading — and the trailing accessory
 *    carries state for the rest. That also returns ~41pt to the text column.
 *
 * 2. THE SIZE LEADS THE BLURB. It used to sit under the trailing accessory in
 *    --rx-label-3 (2.4:1 on white — it fails AA and reads as disabled) and ate
 *    ~90pt of the width the blurb needed. "0.7 GB · Fastest…" is the App
 *    Store/Podcasts idiom and leaves the trailing column as one 44pt target.
 *
 * 3. NO GREY-DONUT EMPTY HERO. With nothing downloaded the largest object on
 *    the launch screen was a 96pt mid-grey ring resolving to "No model yet".
 *    Settings puts its highest-value actionable content in that slot, so this
 *    does too: the recommended model, in its own section, with a Get capsule.
 */
import React from 'react'
import Gauge from './Gauge.jsx'
import StorageLine from './StorageLine.jsx'
import usePress from './usePress.js'
import { GB } from './useLocalModels.js'

const fmtGB = (gb) => `${Number(gb || 0).toFixed(1)} GB`

// The one model the sheet also pre-highlights. Falls back to the smallest entry
// so a catalog change can never leave this screen with no recommendation.
const RECOMMENDED_ID = 'qwen3-1.7b'
const recommend = (models) =>
  models.find(m => m.id === RECOMMENDED_ID) ||
  [...models].sort((a, b) => (a.sizeGB || 0) - (b.sizeGB || 0))[0] ||
  null

/* ── glyphs: SF Symbols geometry, drawn rather than imported ─────────────── */

const ArrowDownCircle = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="12.6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M14 7.8v11.2M9.4 14.6 14 19.2l4.6-4.6" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Checkmark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M3.6 11.6 8.4 16.4 18.4 5.6" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Chevron = () => (
  <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" className="rx-chevron">
    <path d="M1.4 1.4 6.6 6.5 1.4 11.6" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ── the hero: only ever drawn when a model is actually resident ──────────── */

function Hero ({ model, onOpen }) {
  const press = usePress(() => onOpen?.(model.id), {
    label: `Chat with ${model.name}, ready on this iPhone`
  })
  return (
    <div className={'rx-hero rx-pressable' + press.className} {...press.handlers}>
      {/* 64pt, not 96: at 96 the ring took ~28% of the first screen and pushed
          the list — the thing you came for — below the fold. */}
      <Gauge size={64} state="resident" />
      <div className="rx-hero-label">
        <div className="rx-headline" style={{ textAlign: 'center' }}>{model.name}</div>
        <div className="rx-footnote rx-tabular" style={{ textAlign: 'center' }}>
          Ready on this iPhone · {fmtGB(model.sizeGB)}
        </div>
      </div>
    </div>
  )
}

/* ── one catalog row ──────────────────────────────────────────────────────── */

function ModelRow ({ model, state, progress, unavailable, shortBy, prominent, onTap, onAccessory }) {
  const pct = typeof progress === 'number' ? Math.round(progress * 100) : null
  const row = usePress(() => onTap?.(model), {
    label: `${model.name}, ${fmtGB(model.sizeGB)}` + (
      model.downloaded ? ', on this iPhone'
        : state === 'downloading' ? `, downloading${pct === null ? '' : `, ${pct} percent`}`
          : unavailable ? ', not enough room' : ''
    )
  })
  const acc = usePress((e) => { e.stopPropagation?.(); onAccessory?.(model) }, {
    haptic: 'MEDIUM',
    // the trailing control is a glyph or a two-letter capsule; without this it
    // is announced as "button" five times down the screen
    label: model.downloaded ? `Chat with ${model.name}` : `Download ${model.name}`
  })

  const downloading = state === 'downloading'
  // The leading slot only appears when it has something to say.
  const leading = model.downloaded
    ? <Gauge size={29} state="resident" />
    : downloading
      ? <Gauge size={29} state="working" progress={progress} />
      : null

  const trailing = model.downloaded
    ? <span className="rx-tinted"><Checkmark /></span>
    : downloading
      ? null   // the leading gauge is already spinning; exactly one at a time
      : prominent
        ? <span className="rx-get">{state === 'failed' ? 'Retry' : 'Get'}</span>
        : <span className={state === 'failed' ? 'rx-destructive' : undefined}><ArrowDownCircle /></span>

  return (
    <div
      className={'rx-row rx-row-2line' + row.className}
      {...row.handlers}
      data-unavailable={unavailable ? 'true' : undefined}
      // The separator aligns with this row's own text column: 16pt margin plus
      // the leading glyph and its 12pt gutter when there is one, plain 16pt
      // when there is not.
      style={{ '--rx-sep-inset': leading ? '57px' : '16px' }}
    >
      {leading}
      <div className="rx-row-text">
        <div className="rx-headline">{model.name}</div>
        <div className="rx-row-blurb">
          <span className="rx-row-size">{fmtGB(model.sizeGB)}</span>
          {' · '}
          {state === 'failed'
            ? 'That download did not finish. Tap to try again.'
            : downloading
              // A 2.4 GB download over a phone connection is the longest wait in
              // the app. The blurb is worth nothing here; the number is worth
              // everything. Spoken by the row's own label, so aria-hidden.
              ? <span className="rx-tabular" aria-hidden="true">
                  {pct === null ? 'Downloading…' : `Downloading… ${pct}%`}
                </span>
              : model.blurb}
        </div>
        {unavailable && (
          <div className="rx-footnote rx-warm">Needs {fmtGB(shortBy / GB)} more room</div>
        )}
      </div>
      {trailing && (
        <div
          className={(prominent && !model.downloaded ? 'rx-get-hit' : 'rx-accessory') +
            ' rx-pressable' + acc.className}
          {...(model.downloaded ? { 'aria-hidden': 'true' } : acc.handlers)}
        >
          {trailing}
        </div>
      )}
    </div>
  )
}

/* ── the screen ───────────────────────────────────────────────────────────── */

export default function ModelsScreen ({
  local = {},
  models = [],
  activeModel,
  onOpenChat,
  onGetModel,
  onConnectMac
}) {
  const {
    jobs = {}, failures = {}, progress = {}, disk, downloaded = [], usedBytes = 0,
    bytesOf, fits, shortfall, download
  } = local
  const connect = usePress(() => onConnectMac?.(), { label: 'Connect to a Mac' })

  const canFit = (m) => (typeof fits === 'function' ? fits(m) : true)
  const shortBy = (m) => (typeof shortfall === 'function' ? shortfall(m) : 0)

  const stateOf = (m) => (
    jobs[m.id] === 'downloading' ? 'downloading' : failures[m.id] ? 'failed' : 'idle'
  )

  const rowFor = (m, prominent) => {
    const blocked = !m.downloaded && !canFit(m)
    return (
      <ModelRow
        key={m.id}
        model={m}
        state={stateOf(m)}
        progress={progress[m.id]}
        unavailable={blocked}
        shortBy={shortBy(m)}
        prominent={prominent}
        onTap={() => (blocked ? null : onGetModel?.(m.id))}
        onAccessory={() => {
          if (blocked) return
          if (m.downloaded) onOpenChat?.(m.id)
          else download?.(m.id)
        }}
      />
    )
  }

  // Nothing on the phone yet: lead with one recommendation rather than an empty
  // hero, and keep the other four one section below — five plain-English rows
  // is not the wall of quantization suffixes anybody was worried about.
  const nothingYet = downloaded.length === 0 && models.length > 0
  const pick = nothingYet ? recommend(models) : null
  const rest = nothingYet ? models.filter(m => m !== pick) : models

  return (
    <>
      {activeModel && <Hero model={activeModel} onOpen={onOpenChat} />}

      {pick && (
        <div className="rx-section">
          <div className="rx-section-header">Recommended</div>
          <div className="rx-group">{rowFor(pick, true)}</div>
        </div>
      )}

      <div className="rx-section">
        <div className="rx-section-header">{nothingYet ? 'All models' : 'Available'}</div>
        <div className="rx-group">
          {rest.map(m => rowFor(m, false))}
          {models.length === 0 && (
            <div className="rx-row">
              <div className="rx-row-text">
                <div className="rx-row-blurb">
                  {local.ready ? 'No models are available on this device.' : 'Reading the catalog…'}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* the privacy claim, in the quietest text on the screen. A banner would
            cheapen it, and this one happens to be literally true. */}
        <div className="rx-section-footer">
          Models run on this iPhone. Nothing you type leaves it.
        </div>
      </div>

      <div className="rx-section">
        <div className="rx-group">
          <div className={'rx-row' + connect.className} {...connect.handlers}>
            <div className="rx-row-text"><div className="rx-body">Connect to a Mac</div></div>
            <Chevron />
          </div>
        </div>
      </div>

      {/* room for the storage line, which is pinned over the scroller */}
      <div style={{ height: 76 }} aria-hidden="true" />

      <StorageLine downloaded={downloaded} disk={disk} usedBytes={usedBytes} bytesOf={bytesOf} />
    </>
  )
}

export { ModelsScreen }
