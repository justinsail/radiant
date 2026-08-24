/**
 * ModelsScreen — the root. The shell owns the scroller, the large title and the
 * nav bar, so this file starts at the hero and ends at the storage line.
 *
 * Information architecture IS the argument here: the gauge owns the top of the
 * screen in every state, the catalog is one ordinary inset grouped list, and
 * "Connect to a Mac" is a single plain row two sections down. On-device is the
 * product; the Mac is one tap away and weighs nothing.
 *
 * ⚠️ THREE THINGS ON THIS SCREEN HAVE BEEN ROUND-TRIPPED. Read before changing:
 *
 * 1. THE ROW IS NAME OVER BLURB, AND THE SIZE IS IN THE TRAILING COLUMN.
 *    The size was welded onto the front of the blurb once ("0.7 GB · Fastest…",
 *    the App Store idiom) to get it out of --rx-label-3. Every one of the five
 *    blurbs then wrapped, the rows measured 84.9pt against Settings' 44 on the
 *    same device, and the privacy footer and the Mac row fell below the fold —
 *    which is to say the load-bearing product claim became invisible on launch.
 *    The contrast fix was --rx-label-2, not the relocation. Rows are 60pt now
 *    and the blurb is one line; it reflows only at AX sizes.
 *
 * 2. THERE IS NO LEADING GAUGE ON A CATALOG ROW. Five of them taught the mark
 *    in the first two seconds — in theory. Measured, the three-ring spiral has
 *    no legibility budget under about 26pt: at 29 the radial gap between the A
 *    and B strokes is 1.3pt and the whole thing renders as a smudge. Five
 *    smudges down the left edge is worse than no mark. The gauge now appears at
 *    64 in the hero, 26 in a downloading row's accessory (where it is moving,
 *    which is what makes it legible), 120 on the sheet and 128 on first run.
 *
 * 3. THE HERO IS LEFT-ALIGNED AND SMALL. A 96pt centred gauge over centred text
 *    above a left-aligned list is two competing alignment axes, and in the
 *    ABSENT state a 96pt --rx-label-3 ring reads as a broken image. It is one
 *    horizontal unit on the same 20pt axis as the cards now. It is still drawn
 *    in both states and it is still a tap target in both — deleting the empty
 *    hero once left the launch screen with no gauge on it at all.
 */
import React from 'react'
import Gauge from './Gauge.jsx'
import StorageLine from './StorageLine.jsx'
import usePress from './usePress.js'
import { GB } from './useLocalModels.js'

const fmtGB = (gb) => `${Number(gb || 0).toFixed(1)} GB`

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
      <Gauge size={64} state={resident ? 'resident' : 'absent'} />
      <div className="rx-hero-label">
        <div className="rx-title-3">{resident ? model.name : 'No model yet'}</div>
        <div className={'rx-footnote' + (resident ? ' rx-tabular' : '')}>
          {resident
            ? `Ready on this iPhone · ${fmtGB(model.sizeGB)}`
            : 'Choose a model to run on this iPhone'}
        </div>
      </div>
      {resident && <Chevron />}
    </div>
  )
}

/* ── one catalog row ──────────────────────────────────────────────────────── */

function ModelRow ({ model, state, progress, unavailable, shortBy, onTap, onAccessory }) {
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
    // the trailing control is a glyph; without this it is announced as
    // "button" five times down the screen
    label: model.downloaded ? `Chat with ${model.name}` : `Download ${model.name}`
  })

  const downloading = state === 'downloading'

  // The trailing column: glyph over the size, both quiet. The one moment the
  // gauge appears in a row is mid-download, at 26pt, where it is turning — and
  // motion is what carries a mark this small, not stroke weight.
  const glyph = model.downloaded
    ? <span className="rx-tinted"><Checkmark /></span>
    : downloading
      ? <Gauge size={26} state="working" progress={typeof progress === 'number' ? progress : null} />
      : <span className={state === 'failed' ? 'rx-destructive' : undefined}><ArrowDownCircle /></span>

  // Always the weight, because that is the decision the row is asking for —
  // except mid-download, where the percentage is the only thing worth reading.
  const caption = downloading
    ? (pct === null ? '' : `${pct}%`)
    : fmtGB(model.sizeGB)

  return (
    <div
      className={'rx-row rx-row-2line' + row.className}
      {...row.handlers}
      data-unavailable={unavailable ? 'true' : undefined}
    >
      <div className="rx-row-text">
        <div className="rx-headline">{model.name}</div>
        <div className="rx-row-blurb">
          {state === 'failed'
            ? 'That download did not finish. Tap to try again.'
            : unavailable
              ? <span className="rx-warm">Needs {fmtGB(shortBy / GB)} more room</span>
              : model.blurb}
        </div>
      </div>
      <div
        className={'rx-accessory rx-pressable' + acc.className}
        {...(model.downloaded ? { 'aria-hidden': 'true' } : acc.handlers)}
      >
        {glyph}
        <span className="rx-row-size" aria-hidden="true">{caption}</span>
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
    bytesOf, fits, shortfall, download
  } = local
  const connect = usePress(() => onConnectMac?.(), { label: 'Connect to a Mac' })

  const canFit = (m) => (typeof fits === 'function' ? fits(m) : true)
  const shortBy = (m) => (typeof shortfall === 'function' ? shortfall(m) : 0)

  const stateOf = (m) => (
    jobs[m.id] === 'downloading' ? 'downloading' : failures[m.id] ? 'failed' : 'idle'
  )

  const pick = recommend(models)
  // The strip earns its place only once there is a segment to draw. An empty
  // 4pt track over "0 GB of 995 GB used by models." reads as a stuck download,
  // in the most valuable strip on the screen.
  const showStorage = !!(disk && disk.total && downloaded.length > 0)

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
      <div style={{ height: showStorage ? 76 : 24 }} aria-hidden="true" />

      {showStorage && (
        <StorageLine downloaded={downloaded} disk={disk} usedBytes={usedBytes} bytesOf={bytesOf} />
      )}
    </>
  )
}

export { ModelsScreen }
