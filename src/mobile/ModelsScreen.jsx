/**
 * ModelsScreen — the root. The shell owns the scroller, the large title and the
 * nav bar, so this file starts at the hero and ends at the storage line.
 *
 * Information architecture IS the argument here: the gauge owns the top of the
 * screen in every state, the catalog is one ordinary inset grouped list, and
 * "Connect to a Mac" is a single plain row two sections down. On-device is the
 * product; the Mac is one tap away and weighs nothing.
 *
 * ⚠️ FOUR THINGS ON THIS SCREEN HAVE BEEN ROUND-TRIPPED. Read before changing:
 *
 * 1. THE ROW IS NAME OVER BLURB, AND THERE IS NO SIZE IN THE ROW AT ALL.
 *    The size was welded onto the front of the blurb once ("0.7 GB · Fastest…",
 *    the App Store idiom); every blurb then wrapped, the rows measured 84.9pt
 *    against Settings' 44, and the privacy footer fell below the fold. It then
 *    sat under the download glyph in a trailing column — where it stole enough
 *    width that three of the five blurbs truncated mid-word ("and r…", "on p…",
 *    "with h…") and, being a variable-width string under a fixed-width glyph,
 *    left the row's right margin ragged down the list. Both are gone: the
 *    trailing column is the arrow.down.circle alone, which is the iCloud idiom
 *    Apple ships with no label, and the weight is stated in the sheet the row
 *    opens. The blurb now has the width to wrap to two lines instead.
 *
 * 2. THERE IS NO LEADING GAUGE ON A CATALOG ROW. Five of them taught the mark
 *    in the first two seconds — in theory. Measured, the three-ring spiral has
 *    no legibility budget under about 26pt: at 29 the radial gap between the A
 *    and B strokes is 1.3pt and the whole thing renders as a smudge. Five
 *    smudges down the left edge is worse than no mark. The gauge appears at
 *    96 in the hero, 26 in a downloading row's accessory (where it is moving,
 *    which is what makes it legible), 120 on the sheet and 128 on first run.
 *
 * 3. THE HERO IS A LEFT-ALIGNED VERTICAL STACK ON THE 20pt LAYOUT MARGIN.
 *    It has been centred (two competing alignment axes against a left-aligned
 *    list) and it has been a horizontal gauge-then-text row, which put the mark
 *    at an optical 28pt and its label at 100pt while the title, the cards and
 *    the footer all sat at 20 — three left edges, and the hero aligned to none
 *    of them. Vertical gives the screen exactly two: 20pt for everything at
 *    screen level, 36pt for text inside a card. The gauge is optically aligned,
 *    not box-aligned: its outermost stroke sits 12.15% of the box in from the
 *    left, so the box carries a negative margin of that fraction.
 *
 * 4. THE STORAGE LINE IS DRAWN EVEN WITH NOTHING DOWNLOADED. It used to hide
 *    until the first model landed, which left the launch screen with a dead
 *    lower third and no statement of the product argument. With no segments it
 *    draws no track — an empty 4pt rail reads as a stuck download — and states
 *    the free space instead.
 */
import React from 'react'
import Gauge from './Gauge.jsx'
import BrandSpinner, { BrandMark } from './BrandSpinner.jsx'
import StorageLine from './StorageLine.jsx'
import usePress from './usePress.js'
import { GB } from './useLocalModels.js'

const fmtGB = (gb) => `${Number(gb || 0).toFixed(1)} GB`
// What to print while a download runs. A percent when the total is known; the
// megabytes when it is not — never "0%" for ten minutes, which is what a
// fraction-only relay produced.
export const progressText = (p) => {
  if (!p) return null
  if (typeof p.pct === 'number') return `${Math.round(p.pct * 100)}%`
  if (p.done > 0) return p.done >= 1e9
    ? `${(p.done / 1e9).toFixed(1)} GB`
    : `${Math.round(p.done / 1e6)} MB`
  return null
}

// The one model the sheet also pre-highlights. Falls back to the smallest entry
// so a catalog change can never leave the empty hero with nothing to open.
const RECOMMENDED_ID = 'qwen3-1.7b'
const recommend = (models) =>
  models.find(m => m.id === RECOMMENDED_ID) ||
  [...models].sort((a, b) => (a.sizeGB || 0) - (b.sizeGB || 0))[0] ||
  null

/* ── glyphs: SF Symbols geometry, drawn rather than imported ─────────────── */

// arrow.down.circle at SF Symbol Regular optical weight. The ring used to be a
// hairline with a small arrowhead rattling inside it, which reads as a generic
// web download icon; the stroke is 1.7pt at 22 and the arrow fills the ring.
const ArrowDownCircle = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="9.7" stroke="currentColor" strokeWidth="1.7" />
    <path d="M11 5.9v10.2M6.6 11.7 11 16.1l4.4-4.4" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Checkmark = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M3.6 11.6 8.4 16.4 18.4 5.6" stroke="currentColor" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Chevron = () => (
  <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true" className="rx-chevron">
    <path d="M1.4 1.4 6.6 6.5 1.4 11.6" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* ── the hero: the mark, in whichever state is true, on the layout margin ─── */

function Hero ({ model, onOpen, onChoose, canChoose }) {
  const resident = !!model
  const press = usePress(
    () => (resident ? onOpen?.(model.id) : onChoose?.()),
    {
      label: resident
        ? `${model.name}, ready on this iPhone, ${fmtGB(model.sizeGB)}. Opens the conversation.`
        : 'No model yet. Choose a model to download.'
    }
  )
  const interactive = resident || canChoose
  const handlers = interactive ? press.handlers : {}

  return (
    <div
      className={'rx-hero' + (interactive ? ' rx-pressable' + press.className : '')}
      data-absent={resident ? undefined : 'true'}
      {...handlers}
    >
      {/* optical alignment, not box alignment: ring A's outer stroke reaches
          12.15% of the viewBox from the edge (r 35.2 + half of stroke 5.3, on a
          100-unit box), so the box is pulled left by that fraction of 96 and the
          ink lands on the same 20pt margin as the title and the cards. */}
      <BrandMark size={96} className="rx-hero-gauge" />
      <div className="rx-hero-label">
        <div className="rx-title-2">{resident ? model.name : 'No model yet'}</div>
        <div className={'rx-hero-state rx-footnote' + (resident ? ' rx-tabular' : '')}>
          {resident
            ? `Ready on this iPhone · ${fmtGB(model.sizeGB)}`
            : 'Choose a model to run on this iPhone'}
          <Chevron />
        </div>
      </div>
    </div>
  )
}

/* ── one catalog row ──────────────────────────────────────────────────────── */

function ModelRow ({ model, state, progress, unavailable, shortBy, onTap, onAccessory }) {
  const shown = progressText(progress)
  const pct = progress && typeof progress.pct === 'number' ? Math.round(progress.pct * 100) : null
  const row = usePress(() => onTap?.(model), {
    label: `${model.name}, ${fmtGB(model.sizeGB)}` + (
      model.downloaded ? ', on this iPhone'
        : state === 'downloading' ? `, downloading${pct === null ? '' : `, ${pct} percent`}`
          : unavailable ? ', not enough room' : ''
    )
  })
  const downloading = state === 'downloading'
  const acc = usePress((e) => { e.stopPropagation?.(); onAccessory?.(model) }, {
    haptic: 'MEDIUM',
    // the trailing control is a glyph; without this it is announced as
    // "button" five times down the screen
    label: model.downloaded
      ? `Chat with ${model.name}`
      : downloading
        ? `Stop downloading ${model.name}${shown === null ? '' : `, ${shown} done`}`
        : `Download ${model.name}`
  })

  // The trailing column is ONE fixed-width glyph and nothing else, so every
  // row's right edge agrees. The one moment the gauge appears in a row is
  // mid-download, at 26pt, where it is turning — and motion is what carries a
  // mark this small, not stroke weight.
  const glyph = model.downloaded
    ? <span className="rx-tinted"><Checkmark /></span>
    : downloading
      // The turning arc is also the stop button, with a square inside it — the
      // iCloud idiom, where the progress indicator IS the cancel target. A
      // separate ✕ elsewhere in the row would break the single-glyph trailing
      // column every other row keeps.
      ? <span className="rx-stoppable">
          <BrandSpinner size={26} progress={progress && typeof progress.pct === 'number' ? progress.pct : null} />
          <span className="rx-stop-square" aria-hidden="true" />
        </span>
      : <span className={state === 'failed' ? 'rx-destructive' : undefined}><ArrowDownCircle /></span>

  return (
    <div
      className={'rx-row rx-row-2line' + row.className}
      {...row.handlers}
      data-unavailable={unavailable ? 'true' : undefined}
      style={{ '--rx-sep-inset': downloading ? '57px' : '16px' }}
    >
      {/* While it downloads, the logo turns beside the name — Tony: "i want the
          blue logo to rotate next to the model name to show its downloading."
          It appears only then, so an idle list keeps its clean single column. */}
      {downloading && (
        <span className="rx-row-lead">
          <BrandSpinner size={29} progress={progress && typeof progress.pct === 'number' ? progress.pct : null} />
        </span>
      )}
      <div className="rx-row-text">
        <div className="rx-headline">{model.name}</div>
        <div className="rx-row-blurb">
          {state === 'failed'
            ? 'That download did not finish. Tap to try again.'
            : unavailable
              ? <span className="rx-warm">Needs {fmtGB(shortBy / GB)} more room</span>
              : downloading
                // Not the size — see the .rx-accessory note in mobile.css, that
                // string is always present and always costs the blurb its
                // width. This one exists only while the download runs, and it
                // replaces a blurb nobody is reading at that moment: a
                // determinate arc still does not answer "how much longer".
                ? <span className="rx-tabular" aria-hidden="true">
                    {shown ? `Downloading… ${shown}` : 'Downloading…'}
                  </span>
                : model.blurb}
        </div>
      </div>
      <div
        className={'rx-accessory rx-pressable' + acc.className}
        {...(model.downloaded ? { 'aria-hidden': 'true' } : acc.handlers)}
      >
        {glyph}
      </div>
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
    bytesOf, fits, shortfall, download, cancel
  } = local
  const connect = usePress(() => onConnectMac?.(), { label: 'Connect to a Mac' })

  const canFit = (m) => (typeof fits === 'function' ? fits(m) : true)
  const shortBy = (m) => (typeof shortfall === 'function' ? shortfall(m) : 0)

  const stateOf = (m) => (
    jobs[m.id] === 'downloading' ? 'downloading' : failures[m.id] ? 'failed' : 'idle'
  )

  const pick = recommend(models)
  // Drawn whenever the device will tell us its disk, downloaded models or not.
  // Hiding it until the first download left the launch screen — the one screen
  // every judge sees — with a dead lower third and no statement of the argument
  // the whole app is making. The zero state draws no rail (an empty 4pt track
  // reads as a stuck download); StorageLine states the free space instead.
  const showStorage = !!(disk && disk.total)

  return (
    <>
      <Hero
        model={activeModel}
        onOpen={onOpenChat}
        canChoose={!!pick}
        onChoose={() => onGetModel?.(pick?.id)}
      />

      <div className="rx-section">
        <div className="rx-section-header">Available</div>
        <div className="rx-group">
          {models.map(m => {
            const blocked = !m.downloaded && !canFit(m)
            return (
              <ModelRow
                key={m.id}
                model={m}
                state={stateOf(m)}
                progress={progress[m.id]}
                unavailable={blocked}
                shortBy={shortBy(m)}
                onTap={() => (blocked ? null : onGetModel?.(m.id))}
                onAccessory={() => {
                  if (blocked) return
                  if (m.downloaded) onOpenChat?.(m.id)
                  else if (stateOf(m) === 'downloading') cancel?.(m.id)
                  else download?.(m.id)
                }}
              />
            )
          })}
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
      <div style={{ height: showStorage ? 72 : 24 }} aria-hidden="true" />

      {showStorage && (
        <StorageLine downloaded={downloaded} disk={disk} usedBytes={usedBytes} bytesOf={bytesOf} />
      )}
    </>
  )
}

export { ModelsScreen }
