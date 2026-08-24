/**
 * The phone's themes — the Mac's twelve, as accents.
 *
 * A theme here is a hue and a chroma, nothing else. Lightness is deliberately
 * NOT themeable: it is what keeps text and controls legible on black, and a
 * theme that could darken the tint could make the app unreadable.
 *
 * The phone is always dark (Tony, 2026-08-24), so the Mac's light/medium/dark
 * modes do not come across — only the colour does. Hues and chromas are copied
 * from src/theme.js so the two apps cannot drift.
 */
export const THEMES = [
  { id: 'radiant', name: 'Radiant', hue: 258, chroma: 0.11 },
  { id: 'ember', name: 'Ember', hue: 55, chroma: 0.17 },
  { id: 'tokyonight', name: 'Tokyo Night', hue: 265, chroma: 0.14 },
  { id: 'catppuccin', name: 'Catppuccin', hue: 310, chroma: 0.11 },
  { id: 'everforest', name: 'Everforest', hue: 150, chroma: 0.09 },
  { id: 'gruvbox', name: 'Gruvbox', hue: 60, chroma: 0.13 },
  { id: 'nord', name: 'Nord', hue: 240, chroma: 0.08 },
  { id: 'dracula', name: 'Dracula', hue: 290, chroma: 0.15 },
  { id: 'rosepine', name: 'Rosé Pine', hue: 350, chroma: 0.10 },
  { id: 'solarized', name: 'Solarized', hue: 195, chroma: 0.10 },
  { id: 'moss', name: 'Moss', hue: 150, chroma: 0.12 },
  { id: 'graphite', name: 'Graphite', hue: 260, chroma: 0.01 }
]

// The Mac's UI scale, which on iOS rides on top of Dynamic Type rather than
// replacing it — the system size stays the floor.
export const TEXT_SIZES = [
  { id: 0.92, name: 'Small' },
  { id: 1, name: 'Default' },
  { id: 1.1, name: 'Large' },
  { id: 1.2, name: 'Larger' }
]

const KEY = 'radiant.phone.appearance'

export function loadAppearance () {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      themeId: THEMES.some(t => t.id === raw.themeId) ? raw.themeId : 'radiant',
      textScale: TEXT_SIZES.some(t => t.id === raw.textScale) ? raw.textScale : 1
    }
  } catch { return { themeId: 'radiant', textScale: 1 } }
}

export function applyAppearance (a) {
  const t = THEMES.find(x => x.id === a?.themeId) || THEMES[0]
  const root = document.documentElement
  root.style.setProperty('--rx-accent-h', String(t.hue))
  root.style.setProperty('--rx-accent-c', String(t.chroma))
  root.style.setProperty('--rx-text-scale', String(a?.textScale || 1))
  try { localStorage.setItem(KEY, JSON.stringify({ themeId: t.id, textScale: a?.textScale || 1 })) } catch {}
  return t
}

/** A swatch for the picker, at the same lightness the UI actually uses. */
export const swatch = t => `oklch(0.72 ${t.chroma} ${t.hue})`
