/**
 * The phone's themes — the Mac's twelve, as accents.
 *
 * A theme here is a hue and a chroma, nothing else. Lightness is deliberately
 * NOT themeable: it is what keeps text and controls legible on black, and a
 * theme that could darken the tint could make the app unreadable.
 *
 * The phone is always dark (Tony, 2026-08-24), so the Mac's light/medium/dark
 * modes do not come across — only the color does. Hues and chromas are copied
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

export const MODES = [
  { id: 'dark', name: 'Dark' },
  // The Mac's third mode: dark, but off true black. It reuses every dark token
  // and only lifts the grounds, so it counts as dark everywhere below.
  { id: 'medium', name: 'Medium' },
  { id: 'light', name: 'Light' },
  { id: 'system', name: 'System' }
]

/** Where the app lands when you open it. */
export const OPEN_TO = [
  { id: 'home', name: 'Home' },
  { id: 'chat', name: 'Last chat' }
]

const KEY = 'radiant.phone.appearance'

export function loadAppearance () {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      themeId: THEMES.some(t => t.id === raw.themeId) ? raw.themeId : 'radiant',
      textScale: TEXT_SIZES.some(t => t.id === raw.textScale) ? raw.textScale : 1,
      // dark unless the user has said otherwise — "it should also always start
      // in dark mode", which is a default, not a lock
      mode: MODES.some(m => m.id === raw.mode) ? raw.mode : 'dark',
      openTo: OPEN_TO.some(o => o.id === raw.openTo) ? raw.openTo : 'home'
    }
  } catch { return { themeId: 'radiant', textScale: 1, mode: 'dark', openTo: 'home' } }
}

// The phone's CURRENT appearance, watched live so "System" tracks a change made
// in Control Centre while the app is open rather than only at launch.
let watcher = null
function watchSystem () {
  if (watcher || typeof window === 'undefined' || !window.matchMedia) return
  watcher = window.matchMedia('(prefers-color-scheme: dark)')
  const write = () => {
    document.documentElement.setAttribute('data-rx-system', watcher.matches ? 'dark' : 'light')
    syncNativeChrome()
  }
  write()
  watcher.addEventListener?.('change', write)
}

/**
 * The status bar is drawn by UIKit, not by CSS, so it has to be told separately
 * — otherwise a light app gets white-on-white clock glyphs.
 */
function syncNativeChrome () {
  const root = document.documentElement
  const mode = root.getAttribute('data-rx-mode')
  const dark = mode === 'dark' || mode === 'medium' ||
    (mode === 'system' && root.getAttribute('data-rx-system') === 'dark')
  // ⚠️ THE flag every stylesheet keys off. src/mobile is three stylesheets —
  // mobile.css plus the ones MobileChat and ModelPicker inject — and they used
  // to decide dark independently from `prefers-color-scheme`. The moment mode
  // became a choice rather than the system's, those two stopped agreeing with
  // the rest of the app: on a light phone set to Dark, the chat kept a light
  // nav bar and composer over a black transcript. One flag, written here.
  root.setAttribute('data-rx-dark', dark ? 'true' : 'false')
  const bar = window.Capacitor?.Plugins?.StatusBar
  // Capacitor's Style.Dark means LIGHT text, for a dark background; Style.Light
  // means dark text. So a dark app asks for DARK. (An earlier comment here
  // claimed the reverse — it was wrong, and a second writer elsewhere in the
  // shell had actually implemented the reverse, which is what shipped.)
  bar?.setStyle?.({ style: dark ? 'DARK' : 'LIGHT' })
}

export function applyAppearance (a) {
  const t = THEMES.find(x => x.id === a?.themeId) || THEMES[0]
  const mode = MODES.some(m => m.id === a?.mode) ? a.mode : 'dark'
  const root = document.documentElement
  root.style.setProperty('--rx-accent-h', String(t.hue))
  root.style.setProperty('--rx-accent-c', String(t.chroma))
  // ⚠️ NOT a variable of its own that nothing reads. The type scale is driven
  // by --rx-dt in 21 rules; a second "--rx-text-scale" nobody consumed is
  // exactly why Text size did nothing at all. This publishes the user's
  // multiplier and tells the Dynamic Type writer to fold it in.
  root.style.setProperty('--rx-user-scale', String(a?.textScale || 1))
  try { window.dispatchEvent(new CustomEvent('rx:text-scale')) } catch {}
  root.setAttribute('data-rx-mode', mode)
  watchSystem()
  syncNativeChrome()
  try {
    localStorage.setItem(KEY, JSON.stringify({
      themeId: t.id, textScale: a?.textScale || 1, mode,
      openTo: OPEN_TO.some(o => o.id === a?.openTo) ? a.openTo : 'home'
    }))
  } catch {}
  return t
}

/** A swatch for the picker, at the same lightness the UI actually uses. */
export const swatch = t => `oklch(0.72 ${t.chroma} ${t.hue})`
