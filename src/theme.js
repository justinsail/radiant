// Theme presets: each is an OKLCH accent (hue + chroma). Everything else is
// derived in CSS from --accent-h / --accent-c, so a custom theme is just a
// hue/chroma pair the user picks.
export const THEMES = [
  { id: 'ember', name: 'Ember', hue: 55, chroma: 0.17 },
  { id: 'steel', name: 'Steel', hue: 258, chroma: 0.11 },
  { id: 'moss', name: 'Moss', hue: 150, chroma: 0.12 },
  { id: 'iris', name: 'Iris', hue: 300, chroma: 0.15 },
  { id: 'rose', name: 'Rose', hue: 15, chroma: 0.15 },
  { id: 'mono', name: 'Graphite', hue: 260, chroma: 0.01 }
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

export function applyTheme (settings) {
  const root = document.documentElement
  const preset = THEMES.find(t => t.id === settings.themeId)
  const hue = preset ? preset.hue : (settings.customHue ?? 55)
  const chroma = preset ? preset.chroma : (settings.customChroma ?? 0.17)
  const mode = settings.mode === 'light' ? 'light' : 'dark'
  root.dataset.mode = mode
  // in the Mac app, keep the window chrome in step with the app theme
  if (window.radiantNative) window.radiantNative.setMode(mode)
  root.style.setProperty('--accent-h', String(hue))
  root.style.setProperty('--accent-c', String(chroma))
  const font = FONTS.find(f => f.id === settings.fontFamily) || FONTS[0]
  root.style.setProperty('--font-body', font.stack)
  root.style.setProperty('--ui-scale', String(settings.uiScale || 1))
}
