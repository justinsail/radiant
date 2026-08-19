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

export function applyTheme (settings) {
  const root = document.documentElement
  const preset = THEMES.find(t => t.id === settings.themeId)
  const hue = preset ? preset.hue : (settings.customHue ?? 55)
  const chroma = preset ? preset.chroma : (settings.customChroma ?? 0.17)
  root.dataset.mode = settings.mode === 'light' ? 'light' : 'dark'
  root.style.setProperty('--accent-h', String(hue))
  root.style.setProperty('--accent-c', String(chroma))
}
