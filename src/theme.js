// The whole palette derives in CSS from an OKLCH accent (--accent-h / --accent-c),
// a surface tint multiplier (--bg-tint), and the mode (light / dark / medium).
// A "theme" is a named preset of those; a custom accent comes from the color
// picker (hex → OKLCH). Everything else is derived, so themes stay tiny.

export const THEMES = [
  { id: 'radiant', name: 'Radiant', hue: 258, chroma: 0.11, tint: 1 },
  { id: 'ember', name: 'Ember', hue: 55, chroma: 0.17, tint: 1.4 },
  { id: 'tokyonight', name: 'Tokyo Night', hue: 265, chroma: 0.14, tint: 2.4 },
  { id: 'catppuccin', name: 'Catppuccin', hue: 310, chroma: 0.11, tint: 2.6 },
  { id: 'everforest', name: 'Everforest', hue: 150, chroma: 0.09, tint: 3.2 },
  { id: 'gruvbox', name: 'Gruvbox', hue: 60, chroma: 0.13, tint: 2.6 },
  { id: 'nord', name: 'Nord', hue: 240, chroma: 0.08, tint: 2.2 },
  { id: 'dracula', name: 'Dracula', hue: 290, chroma: 0.15, tint: 2.2 },
  { id: 'rosepine', name: 'Rosé Pine', hue: 350, chroma: 0.10, tint: 2.6 },
  { id: 'solarized', name: 'Solarized', hue: 195, chroma: 0.10, tint: 2.8 },
  { id: 'moss', name: 'Moss', hue: 150, chroma: 0.12, tint: 1.6 },
  { id: 'graphite', name: 'Graphite', hue: 260, chroma: 0.01, tint: 0.5 }
]

export const MODES = [
  { id: 'light', name: 'Light', icon: '☀' },
  { id: 'medium', name: 'Medium', icon: '◐' },
  { id: 'dark', name: 'Dark', icon: '☾' }
]

export const FONTS = [
  { id: 'inter', name: 'Inter', stack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" },
  { id: 'system', name: 'System', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: 'rounded', name: 'Rounded', stack: "'SF Pro Rounded', 'Avenir Next', 'Segoe UI', sans-serif" },
  { id: 'serif', name: 'Serif', stack: "'Iowan Old Style', Georgia, 'Times New Roman', serif" },
  { id: 'mono', name: 'Mono', stack: "'JetBrains Mono', ui-monospace, monospace" }
]

export const UI_SCALES = [
  { id: 0.9, name: 'Small' },
  { id: 1, name: 'Default' },
  { id: 1.12, name: 'Large' },
  { id: 1.25, name: 'Larger' }
]

// ---------- OKLCH ↔ sRGB hex (Björn Ottosson's oklab) ----------
const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

export function hexToOklch (hex) {
  const m = hex.replace('#', '')
  const r = srgbToLinear(parseInt(m.slice(0, 2), 16) / 255)
  const g = srgbToLinear(parseInt(m.slice(2, 4), 16) / 255)
  const b = srgbToLinear(parseInt(m.slice(4, 6), 16) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936177850 * mm - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.4285922050 * mm + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s
  let H = Math.atan2(B, A) * 180 / Math.PI
  if (H < 0) H += 360
  return { L, C: Math.sqrt(A * A + B * B), H }
}

export function oklchToHex (L, C, H) {
  const h = H * Math.PI / 180
  const A = Math.cos(h) * C
  const B = Math.sin(h) * C
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ].map(x => Math.round(Math.max(0, Math.min(1, linearToSrgb(x))) * 255).toString(16).padStart(2, '0'))
  return '#' + rgb.join('')
}

// a hex swatch representing a theme's accent (mid lightness)
export function accentHex (hue, chroma) {
  return oklchToHex(0.62, chroma, hue)
}

export function applyTheme (settings) {
  const root = document.documentElement
  const preset = THEMES.find(t => t.id === settings.themeId)
  const hue = preset ? preset.hue : (settings.customHue ?? 258)
  const chroma = preset ? preset.chroma : (settings.customChroma ?? 0.11)
  // background tint: an explicit user override wins, else the theme's default
  const tint = settings.bgTint != null ? settings.bgTint : (preset ? preset.tint : 1)
  const mode = ['light', 'medium', 'dark'].includes(settings.mode) ? settings.mode : 'dark'
  root.dataset.mode = mode
  // Remember it for the next cold start: every color lives under
  // :root[data-mode=…], and the mode only arrives with the config. A phone that
  // hasn't signed in yet never gets a config, so without this the connect
  // screen renders with no palette at all — black on white.
  try { localStorage.setItem('radiant.mode', mode) } catch {}
  // window chrome (Electron) only knows light/dark — medium reads as dark
  if (window.radiantNative) window.radiantNative.setMode(mode === 'light' ? 'light' : 'dark')
  root.style.setProperty('--accent-h', String(hue))
  root.style.setProperty('--accent-c', String(chroma))
  root.style.setProperty('--bg-tint', String(tint))
  const font = FONTS.find(f => f.id === settings.fontFamily) || FONTS[0]
  root.style.setProperty('--font-body', font.stack)
  root.style.setProperty('--ui-scale', String(settings.uiScale || 1))
}
