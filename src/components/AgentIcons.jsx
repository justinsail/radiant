import React from 'react'

// Simple line icons (Lucide-style) an agent can use as its identity.
function S ({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor'
      strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden focusable='false'>
      {children}
    </svg>
  )
}

// id -> render function. Keep these recognizable at 16px.
export const AGENT_ICONS = {
  // The Radiant / Templeton swirl mark, tinted to the agent's colour via the mask.
  radiant: ({ size = 16 } = {}) => <span className='logo-mark' style={{ width: size, height: size, background: 'currentColor', verticalAlign: 'middle' }} aria-hidden />,
  bot: p => <S {...p}><rect x='4' y='8' width='16' height='12' rx='2' /><path d='M12 8V4M8 2h8M9 14h.01M15 14h.01' /></S>,
  sparkles: p => <S {...p}><path d='M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z' /></S>,
  code: p => <S {...p}><path d='M16 18l6-6-6-6M8 6l-6 6 6 6' /></S>,
  terminal: p => <S {...p}><path d='M4 17l6-5-6-5M12 19h8' /></S>,
  brain: p => <S {...p}><path d='M12 5a3 3 0 0 0-6 0 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0zM12 5a3 3 0 0 1 6 0 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0z' /></S>,
  wrench: p => <S {...p}><path d='M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z' /></S>,
  compass: p => <S {...p}><circle cx='12' cy='12' r='9' /><path d='M15.5 8.5l-2 5-5 2 2-5z' /></S>,
  book: p => <S {...p}><path d='M4 4a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 1 2-2h12' /></S>,
  bug: p => <S {...p}><rect x='8' y='6' width='8' height='12' rx='4' /><path d='M8 10H4M8 14H4M16 10h4M16 14h4M9 6l-1-2M15 6l1-2M12 18v3' /></S>,
  rocket: p => <S {...p}><path d='M5 15c-1 1-2 5-2 5s4-1 5-2M9 12a10 10 0 0 1 8-8c1 4-1 7-4 9l-1 3-4-1zM15 9a1 1 0 1 0 .01 0z' /></S>,
  star: p => <S {...p}><path d='M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8L3.5 9.2l5.9-.9z' /></S>,
  shield: p => <S {...p}><path d='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' /></S>,
  eye: p => <S {...p}><path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' /><circle cx='12' cy='12' r='3' /></S>,
  cpu: p => <S {...p}><rect x='6' y='6' width='12' height='12' rx='2' /><path d='M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3' /></S>,
  flask: p => <S {...p}><path d='M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10' /></S>,
  pen: p => <S {...p}><path d='M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' /></S>,
  search: p => <S {...p}><circle cx='11' cy='11' r='7' /><path d='M21 21l-4.3-4.3' /></S>,
  bulb: p => <S {...p}><path d='M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z' /></S>,
  palette: p => <S {...p}><path d='M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H16a6 6 0 0 0 6-6c0-5-4.5-8.7-10-8.7zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM12 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM16.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z' /></S>,
  message: p => <S {...p}><path d='M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' /></S>,
  bolt: p => <S {...p}><path d='M13 2L4 14h7l-2 8 9-12h-7z' /></S>,
  ghost: p => <S {...p}><path d='M5 21v-9a7 7 0 0 1 14 0v9l-2.5-2-2.5 2-2-2-2 2-2.5-2zM9 10h.01M15 10h.01' /></S>,
  cap: p => <S {...p}><path d='M12 4L2 9l10 5 10-5zM6 11v5a6 3 0 0 0 12 0v-5' /></S>
}

export const AGENT_ICON_IDS = Object.keys(AGENT_ICONS)

// Render an agent's identity: SVG icon if set, else its emoji, else a bot.
export function AgentGlyph ({ agent, size = 16 }) {
  if (agent?.icon && AGENT_ICONS[agent.icon]) return AGENT_ICONS[agent.icon]({ size })
  if (agent?.emoji) return <span style={{ fontSize: size }}>{agent.emoji}</span>
  return AGENT_ICONS.bot({ size })
}
