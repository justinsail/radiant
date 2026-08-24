/**
 * Gauge — the iris from the app icon, redrawn in SVG, and the only loading
 * indicator in this app. There is no spinner anywhere; adding one is a
 * regression.
 *
 * Geometry is measured off apps/ios/AppIcon-1024.png: three concentric bands at
 * mid-radii 360 / 259 / 162.5 px with stroke widths 54 / 58 / 47 on a 1024
 * canvas, normalised here to a 100×100 viewBox centred on 50,50. The gaps start
 * at −90° / −50° / −10° so they spiral — that spiral is what makes it read as
 * the mark rather than as three rings.
 *
 * States (one prop):
 *   absent      not downloaded — static, rest coverage, no core dot
 *   resident    downloaded and idle — static, tint, core dot
 *   working     indeterminate — narrow arcs, differential rotation (mobile.css)
 *   generating  rest coverage, whole group turning, dot breathing, amber
 *   failed      holds its geometry, desaturates
 * `progress` (0–1) switches WORKING to determinate when TG-221 lands: arcs fill
 * outside in, A 0→0.34, B 0.34→0.70, C 0.70→1. Same component, no new art.
 *
 * Colour and motion live in mobile.css, keyed off data-state — this file owns
 * geometry only, so the hue rule (tint ↔ amber and nothing else) is enforced in
 * one place.
 */
import React, { useEffect, useRef, useState } from 'react'

// r, stroke-width, circumference, rest coverage, start angle
const RINGS = [
  { key: 'a', r: 35.2, w: 5.3, c: 221.17, rest: 0.94, busy: 0.30, from: -90, span: [0, 0.34] },
  { key: 'b', r: 25.3, w: 5.7, c: 158.96, rest: 0.86, busy: 0.26, from: -50, span: [0.34, 0.70] },
  { key: 'c', r: 15.9, w: 4.6, c: 99.90, rest: 0.78, busy: 0.22, from: -10, span: [0.70, 1] }
]
const DOT_R = 6.4

const clamp01 = n => Math.min(1, Math.max(0, n))

export default function Gauge ({
  size = 96,
  state = 'resident',
  progress = null,
  className = '',
  style,
  title
}) {
  const determinate = state === 'working' && typeof progress === 'number'

  // Deceleration: nothing spinning in the physical world stops instantly, so
  // when rotation ends the component holds a settling beat and mobile.css eases
  // the transform back to rest over 700ms.
  const [settling, setSettling] = useState(false)
  const prev = useRef(state)
  useEffect(() => {
    const was = prev.current
    prev.current = state
    const spun = was === 'working' || was === 'generating'
    const spins = state === 'working' || state === 'generating'
    if (!spun || spins) return
    setSettling(true)
    const t = setTimeout(() => setSettling(false), 700)
    return () => clearTimeout(t)
  }, [state])

  const dot = state === 'resident' || state === 'generating'

  return (
    <svg
      className={'rx-gauge' + (className ? ' ' + className : '')}
      data-state={state}
      data-settling={settling ? 'true' : undefined}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      style={{ width: size, height: size, flex: '0 0 auto', ...style }}
    >
      <g className="rx-gauge-group">
        {RINGS.map(ring => {
          const coverage = determinate
            ? clamp01((clamp01(progress) - ring.span[0]) / (ring.span[1] - ring.span[0])) * ring.rest
            : state === 'working'
              ? ring.busy
              : ring.rest
          const on = ring.c * coverage
          return (
            <g key={ring.key} className="rx-gauge-ring" data-ring={ring.key}>
              <circle
                className="rx-gauge-arc"
                cx="50" cy="50" r={ring.r}
                fill="none"
                stroke="currentColor"
                strokeWidth={ring.w}
                strokeLinecap="round"
                strokeDasharray={`${on.toFixed(2)} ${(ring.c - on).toFixed(2)}`}
                transform={`rotate(${ring.from} 50 50)`}
              />
            </g>
          )
        })}
        {dot && (
          <circle className="rx-gauge-dot" cx="50" cy="50" r={DOT_R} fill="currentColor" />
        )}
      </g>
    </svg>
  )
}

export { Gauge }
