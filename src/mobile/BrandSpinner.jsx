/**
 * The Radiant swirl, in whatever colour the app is themed.
 *
 * ⚠️ IT IS A MASK, NOT A PICTURE. The Mac paints the mark by masking
 * src/assets/logo-mark.png — a white swirl on transparent — with the current
 * accent (see `.logo-mark` in src/styles.css). This does the same, so picking a
 * theme recolours the swirl everywhere, exactly as it does on the Mac.
 *
 * That is why this uses logo-mark.png and NOT brand/radiant-mark.png. The brand
 * PNG is a filled disc: masking with it would give a plain circle, because its
 * alpha is the whole disc rather than the linework. The white-on-transparent
 * file's alpha IS the swirl.
 *
 * The launch image still uses the finished brand artwork in brand blue — a
 * native PNG cannot follow a theme chosen inside the app.
 */
import React from 'react'
import maskUrl from '../assets/logo-mark.png'

const maskStyle = (size) => ({
  width: size,
  height: size,
  background: 'currentColor',
  WebkitMask: `url(${maskUrl}) center / contain no-repeat`,
  mask: `url(${maskUrl}) center / contain no-repeat`
})

/** The mark, still. Anything that means "this is Radiant" uses this. */
export function BrandMark ({ size = 29, className = '' }) {
  return (
    <span
      className={'rx-brand-static ' + className}
      style={maskStyle(size)}
      aria-hidden="true"
    />
  )
}

export default function BrandSpinner ({ size = 26, progress = null }) {
  const known = typeof progress === 'number' && isFinite(progress)
  const r = size / 2 - 1.25
  const c = 2 * Math.PI * r
  return (
    <span className="rx-brand-spin" style={{ width: size, height: size }}>
      <span className="rx-brand-spin-mark" style={maskStyle(size)} aria-hidden="true" />
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
