/**
 * ModelsScreen — the root. The shell owns the scroller and the large title, so
 * this file starts at the hero and ends at the storage line.
 *
 * Information architecture IS the argument here: the resident model gets the
 * whole top of the screen with no card and no plate, the catalog is an ordinary
 * inset grouped list, and "Connect to a Mac" is one plain row two sections
 * down. On-device is the product; the Mac is one tap away and weighs nothing.
 */
import React from 'react'
import Gauge from './Gauge.jsx'
import StorageLine from './StorageLine.jsx'
import usePress from './usePress.js'
import { GB } from './useLocalModels.js'

const fmtGB = (gb) => `${Number(gb || 0).toFixed(1)} GB`
const fmtMB = (gb) => {
  const n = Number(gb || 0)
  return n < 1 ? `${Math.round(n * 1000)} MB` : `${n.toFixed(1)} GB`
}

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

/* ── the hero ─────────────────────────────────────────────────────────────── */

function Hero ({ model, onOpen, onGet }) {
  const has = !!model
  const press = usePress(() => (has ? onOpen?.(model.id) : onGet?.(null)))
  return (
    <div
      className={'rx-hero rx-pressable' + press.className}
      {...press.handlers}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 10, padding: '0 16px 4px', minHeight: 44
      }}
    >
      <Gauge size={96} state={has ? 'resident' : 'absent'} />
      <div className="rx-headline" style={{ textAlign: 'center' }}>
        {has ? model.name : 'No model yet'}
      </div>
      <div className="rx-footnote rx-l2 rx-tabular" style={{ textAlign: 'center' }}>
        {has
          ? `Ready on this iPhone · ${fmtMB(model.sizeGB)}`
          : 'Choose one below to download'}
      </div>
    </div>
  )
}

/* ── one catalog row ──────────────────────────────────────────────────────── */

function ModelRow ({ model, state, unavailable, shortBy, onTap, onAccessory }) {
  const row = usePress(() => onTap?.(model))
  const acc = usePress((e) => { e.stopPropagation?.(); onAccessory?.(model) }, { haptic: 'MEDIUM' })

  const accessory = model.downloaded
    ? <span className="rx-tinted"><Checkmark /></span>
    : state === 'downloading'
      ? <Gauge size={28} state="working" />
      : state === 'failed'
        ? <span className="rx-destructive"><ArrowDownCircle /></span>
        : <ArrowDownCircle />

  return (
    <div
      className={'rx-row rx-row-2line' + row.className}
      {...row.handlers}
      data-unavailable={unavailable ? 'true' : undefined}
      // 16pt margin + 29pt glyph + 12pt gutter: the separator lines up with the
      // text column, never full bleed
      style={{ '--rx-sep-inset': '57px' }}
    >
      <Gauge size={29} state={model.downloaded ? 'resident' : state === 'downloading' ? 'working' : 'absent'} />
      <div className="rx-row-text">
        <div className="rx-headline">{model.name}</div>
        <div className="rx-row-blurb">
          {state === 'failed' ? 'Tap to try again' : model.blurb}
        </div>
        {unavailable && (
          <div className="rx-footnote rx-warm">Needs {fmtGB(shortBy / GB)} more room</div>
        )}
      </div>
      <div
        className={'rx-accessory rx-pressable' + acc.className}
        {...(model.downloaded ? {} : acc.handlers)}
      >
        {accessory}
        <span className="rx-accessory-size">{fmtGB(model.sizeGB)}</span>
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
  const { jobs = {}, failures = {}, disk, downloaded = [], usedBytes = 0, bytesOf, fits, shortfall, download } = local
  const connect = usePress(() => onConnectMac?.())

  const canFit = (m) => (typeof fits === 'function' ? fits(m) : true)
  const shortBy = (m) => (typeof shortfall === 'function' ? shortfall(m) : 0)

  return (
    <>
      <Hero model={activeModel} onOpen={onOpenChat} onGet={onGetModel} />

      <div className="rx-section">
        <div className="rx-section-header">Available</div>
        <div className="rx-group">
          {models.map(m => {
            const state = jobs[m.id] === 'downloading'
              ? 'downloading'
              : failures[m.id] ? 'failed' : 'idle'
            const blocked = !m.downloaded && !canFit(m)
            return (
              <ModelRow
                key={m.id}
                model={m}
                state={state}
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
          Models run entirely on this iPhone. Nothing you type leaves the device.
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
