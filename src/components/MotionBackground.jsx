import React, { useMemo } from 'react'

// Ten selectable animated backgrounds. Each sits behind the app (semi-transparent
// surfaces float over it). Particle styles generate randomized elements; all use
// the theme accent hue so they match whatever theme is active.

export const MOTIONS = [
  { id: 'off', name: 'Off' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'clouds', name: 'Drifting clouds' },
  { id: 'starfield', name: 'Starfield' },
  { id: 'waves', name: 'Waves' },
  { id: 'orbs', name: 'Rising orbs' },
  { id: 'nebula', name: 'Nebula swirl' },
  { id: 'grid', name: 'Neon grid' },
  { id: 'rain', name: 'Rain' },
  { id: 'snow', name: 'Snowfall' },
  { id: 'fireflies', name: 'Fireflies' }
]

const rnd = (a, b) => a + Math.random() * (b - a)

function particles (n, make) {
  return Array.from({ length: n }, (_, i) => make(i))
}

export default function MotionBackground ({ kind }) {
  // recompute particle layout only when the style changes
  const nodes = useMemo(() => {
    switch (kind) {
      case 'aurora':
        return ['b1', 'b2', 'b3', 'b4'].map(c => <span key={c} className={'m-aurora ' + c} />)
      case 'clouds':
        return particles(7, i => (
          <span key={i} className='m-cloud' style={{
            top: rnd(2, 78) + '%', transform: `scale(${rnd(0.7, 1.6)})`,
            animationDuration: rnd(38, 80) + 's', animationDelay: -rnd(0, 60) + 's', opacity: rnd(0.25, 0.6)
          }} />
        ))
      case 'starfield':
        return particles(90, i => (
          <span key={i} className='m-star' style={{
            top: rnd(0, 100) + '%', left: rnd(0, 100) + '%',
            width: rnd(1, 2.6) + 'px', height: rnd(1, 2.6) + 'px',
            animationDuration: rnd(2, 6) + 's', animationDelay: -rnd(0, 6) + 's'
          }} />
        ))
      case 'waves':
        return ['w1', 'w2', 'w3'].map(c => <span key={c} className={'m-wave ' + c} />)
      case 'orbs':
        return particles(16, i => (
          <span key={i} className='m-orb' style={{
            left: rnd(0, 100) + '%', width: rnd(14, 60) + 'px', height: rnd(14, 60) + 'px',
            animationDuration: rnd(14, 32) + 's', animationDelay: -rnd(0, 24) + 's', opacity: rnd(0.15, 0.4)
          }} />
        ))
      case 'nebula':
        return ['n1', 'n2', 'n3'].map(c => <span key={c} className={'m-neb ' + c} />)
      case 'grid':
        return <span className='m-grid' />
      case 'rain':
        return particles(70, i => (
          <span key={i} className='m-rain' style={{
            left: rnd(0, 100) + '%', height: rnd(40, 110) + 'px',
            animationDuration: rnd(0.5, 1.1) + 's', animationDelay: -rnd(0, 2) + 's', opacity: rnd(0.15, 0.45)
          }} />
        ))
      case 'snow':
        return particles(70, i => (
          <span key={i} className='m-snow' style={{
            left: rnd(0, 100) + '%', width: rnd(2, 6) + 'px', height: rnd(2, 6) + 'px',
            animationDuration: rnd(6, 16) + 's', animationDelay: -rnd(0, 16) + 's', opacity: rnd(0.3, 0.8),
            '--sway': rnd(10, 60) + 'px'
          }} />
        ))
      case 'fireflies':
        return particles(40, i => (
          <span key={i} className='m-fly' style={{
            top: rnd(0, 100) + '%', left: rnd(0, 100) + '%',
            animationDuration: rnd(4, 9) + 's, ' + rnd(6, 14) + 's', animationDelay: `-${rnd(0, 9)}s, -${rnd(0, 14)}s`
          }} />
        ))
      default:
        return null
    }
  }, [kind])

  if (!kind || kind === 'off') return null
  return <div className={'motion-bg motion-' + kind} aria-hidden>{nodes}</div>
}
