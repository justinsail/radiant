import React from 'react'

// Minimal line icons (Lucide-style): 24×24, currentColor stroke, round caps.
function Svg ({ children, size = 16, fill = 'none' }) {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill={fill} stroke='currentColor'
      strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden focusable='false'>
      {children}
    </svg>
  )
}

export const Icon = {
  download: p => <Svg {...p}><path d='M12 3v12M7 10l5 5 5-5M5 21h14' /></Svg>,
  panel: p => <Svg {...p}><rect x='3' y='4' width='18' height='16' rx='2' /><path d='M15 4v16' /></Svg>,
  settings: p => <Svg {...p}><circle cx='12' cy='12' r='3' /><path d='M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-.3-2.7 1.6 1.6 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1.1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z' /></Svg>,
  sun: p => <Svg {...p}><circle cx='12' cy='12' r='4' /><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' /></Svg>,
  moon: p => <Svg {...p}><path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' /></Svg>,
  contrast: p => <Svg {...p}><circle cx='12' cy='12' r='9' /><path d='M12 3a9 9 0 0 0 0 18z' fill='currentColor' /></Svg>,
  plus: p => <Svg {...p}><path d='M12 5v14M5 12h14' /></Svg>,
  arrowUp: p => <Svg {...p}><path d='M12 19V5M5 12l7-7 7 7' /></Svg>,
  stop: p => <Svg {...p}><rect x='6' y='6' width='12' height='12' rx='2' /></Svg>,
  close: p => <Svg {...p}><path d='M18 6 6 18M6 6l12 12' /></Svg>,
  folder: p => <Svg {...p}><path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' /></Svg>,
  trash: p => <Svg {...p}><path d='M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14' /></Svg>,
  mic: p => <Svg {...p}><rect x='9' y='2' width='6' height='12' rx='3' /><path d='M5 11a7 7 0 0 0 14 0M12 18v4' /></Svg>
}
