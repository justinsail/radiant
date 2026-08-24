/**
 * BrandSpinner — the Radiant mark, turning, as the download indicator.
 *
 * This replaces Gauge's amber iris while a model downloads. Gauge is the app's
 * own status object and its working state was `--rx-amber-glyph`; Tony, seeing
 * it on the phone: "for the downloading the swirling should be our logo not a
 * random orange swirl." So the thing that spins is the actual mark from
 * src/assets/brand/, and the ring around it is brand blue.
 *
 * The ring is determinate whenever a percentage exists, and simply absent when
 * it does not — a ring that sweeps forever while the number beside it is a byte
 * count would be telling two different stories.
 */
import React from 'react'
import markUrl from '../assets/brand/radiant-mark.png'

/** The mark, still. Anything that means "this is Radiant" uses this. */
export function BrandMark ({ size = 29, className = '' }) {
  return (
    <img
      className={'rx-brand-static ' + className}
      src={markUrl} alt="" width={size} height={size}
      style={{ width: size, height: size }}
    />
  )
}

export default function BrandSpinner ({ size = 26, progress = null }) {
  const known = typeof progress === 'number' && isFinite(progress)
  const r = size / 2 - 1.25
  const c = 2 * Math.PI * r
  return (
    <span className="rx-brand-spin" style={{ width: size, height: size }}>
      <img src={markUrl} alt="" width={size} height={size} />
      {known && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={`${c * Math.min(Math.max(progress, 0), 1)} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
      )}
    </span>
  )
}

export { BrandSpinner }
