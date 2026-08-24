/**
 * Settings — the phone's own, not a port of the Mac's.
 *
 * The Mac's Settings is enormous and most of it is meaningless here: MCP
 * servers, model providers, agent editors and window behaviour all assume a
 * desktop with a filesystem. What DOES carry across is everything about how the
 * app looks, what it is holding, and where it connects — so that is this first
 * pass, and the rest of parity (providers and API keys, agents, subscription
 * usage) lands on top of this screen rather than beside it.
 *
 * Sections are the iOS grouped-list idiom because Settings is the one screen
 * where matching the platform IS the design — a person looking for a control
 * should find it where every other app puts it.
 */
import React, { useCallback, useState } from 'react'
import usePress from './usePress.js'
import { BrandMark } from './BrandSpinner.jsx'
import { THEMES, TEXT_SIZES, applyAppearance, swatch } from './theme.js'

const GB = 1e9
const fmt = (b) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)

function Row ({ label, value, onTap, destructive }) {
  const press = usePress(() => onTap?.(), { label, disabled: !onTap })
  return (
    <div
      className={'rx-row' + (onTap ? ' rx-pressable' : '') + press.className}
      {...(onTap ? press.handlers : {})}
    >
      <div className="rx-row-text">
        <div className={'rx-headline' + (destructive ? ' rx-destructive' : '')}>{label}</div>
      </div>
      {value != null && <span className="rx-set-value">{value}</span>}
    </div>
  )
}

function Swatch ({ theme, selected, onPick }) {
  const press = usePress(() => onPick(theme.id), {
    label: `${theme.name}${selected ? ', selected' : ''}`,
    haptic: 'selection'
  })
  return (
    <span
      className={'rx-swatch' + (selected ? ' is-on' : '') + press.className}
      {...press.handlers}
      style={{ '--sw': swatch(theme) }}
    >
      <span className="rx-swatch-dot" aria-hidden="true" />
      <span className="rx-swatch-name">{theme.name}</span>
    </span>
  )
}

export default function SettingsScreen ({
  appearance, onAppearance, local = {}, models = [], onConnectMac, onReadMe, version
}) {
  const [busy, setBusy] = useState(false)
  const downloaded = models.filter(m => m?.downloaded)
  const used = downloaded.reduce((n, m) => n + Math.round((Number(m.sizeGB) || 0) * GB), 0)

  const pick = useCallback((themeId) => {
    const next = { ...appearance, themeId }
    applyAppearance(next)
    onAppearance?.(next)
  }, [appearance, onAppearance])

  const size = useCallback((textScale) => {
    const next = { ...appearance, textScale }
    applyAppearance(next)
    onAppearance?.(next)
  }, [appearance, onAppearance])

  const clearAll = useCallback(async () => {
    if (!downloaded.length || busy) return
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove ${downloaded.length} model${downloaded.length > 1 ? 's' : ''} and free ${fmt(used)}?`)) return
    setBusy(true)
    for (const m of downloaded) { await local.remove?.(m.id) }
    setBusy(false)
  }, [downloaded, used, local, busy])

  return (
    <>
      <h2 className="rx-section-header">Appearance</h2>
      <div className="rx-group rx-swatches">
        {THEMES.map(t => (
          <Swatch key={t.id} theme={t} selected={t.id === appearance.themeId} onPick={pick} />
        ))}
      </div>
      <p className="rx-section-footer">
        The colour runs through the whole app — buttons, the glow behind the
        logo, and the ring while a model downloads.
      </p>

      <h2 className="rx-section-header">Text size</h2>
      <div className="rx-group rx-seg">
        {TEXT_SIZES.map(t => {
          const on = t.id === appearance.textScale
          return <SegItem key={t.id} label={t.name} on={on} onPick={() => size(t.id)} />
        })}
      </div>
      <p className="rx-section-footer">
        Rides on top of the system text size rather than replacing it, so
        Accessibility settings still win.
      </p>

      <h2 className="rx-section-header">Models</h2>
      <div className="rx-group">
        <Row label="On this iPhone" value={`${downloaded.length} · ${fmt(used)}`} />
        {downloaded.map(m => (
          <Row
            key={m.id}
            label={m.name}
            value={`${Number(m.sizeGB).toFixed(1)} GB`}
            onTap={() => local.remove?.(m.id)}
          />
        ))}
        {downloaded.length > 0 && (
          <Row label={busy ? 'Removing…' : 'Remove all models'} destructive onTap={clearAll} />
        )}
      </div>
      {downloaded.length === 0 && (
        <p className="rx-section-footer">Nothing downloaded yet.</p>
      )}

      <h2 className="rx-section-header">Your Mac</h2>
      <div className="rx-group">
        <Row label="Connect to a Mac" onTap={onConnectMac} />
      </div>
      <p className="rx-section-footer">
        Reach the models, agents and sessions on your Mac from this phone.
      </p>

      <h2 className="rx-section-header">About</h2>
      <div className="rx-group">
        <Row label="Read me" onTap={onReadMe} />
        <Row label="Version" value={version || '—'} />
      </div>
      <div className="rx-about-mark">
        <BrandMark size={44} />
        <p className="rx-about-line">Radiant is a Templeton&nbsp;Technologies product.</p>
      </div>
    </>
  )
}

function SegItem ({ label, on, onPick }) {
  const press = usePress(onPick, { label, haptic: 'selection' })
  return (
    <span className={'rx-seg-item' + (on ? ' is-on' : '') + press.className} {...press.handlers}>
      {label}
    </span>
  )
}

export { SettingsScreen }
