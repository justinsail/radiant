/**
 * A stand-in for the native side, so the phone UI can be RUN, not just read.
 *
 * ⚠️ THIS EXISTS BECAUSE THE GAUNTLET NEVER RAN THE APP. Six passes, 68
 * assertions, and not one of them rendered a screen — every gate read source or
 * exercised a pure function. Every bug Tony found lived in the gap: a hard-coded
 * "On device" under a cloud model, a transcript that would not scroll, a header
 * a hundred pixels narrower than its own rows, screens that led nowhere. Source
 * that reads correctly is not an app that works.
 *
 * The stub answers the way the real plugins answer — including the awkward bits
 * that shape the UI, like generate() having no memory between calls and download
 * progress arriving as events.
 */
const listeners = new Map()
const emit = (ev, data) => (listeners.get(ev) || []).forEach(fn => fn(data))
const addListener = (ev, fn) => {
  if (!listeners.has(ev)) listeners.set(ev, [])
  listeners.get(ev).push(fn)
  return { remove () { listeners.set(ev, (listeners.get(ev) || []).filter(f => f !== fn)) } }
}

// ⚠️ THE REAL CATALOGUE, ALL 44 — NOT A SLICE. This was five rows with
// SHORTENED blurbs ("Meta's." for Llama 3.2 3B), and that is precisely how a
// row layout that fits five short strings shipped while the real strings
// behaved differently. Vite serves this as raw text and it is parsed with the
// same regex test-catalog.mjs uses, so the harness renders what the phone
// renders and geometry measured here is geometry that is true.
import swift from '../apps/ios/ios/App/App/plugins/LocalModels.swift?raw'

const CATALOG = [...swift.matchAll(
  /Entry\(id: "([^"]+)", name: "([^"]+)", maker: "([^"]+)",\s*\n\s*blurb: "([^"]*)",\s*\n\s*gb: ([\d.]+)/g
)].map(m => ({
  id: m[1], name: m[2], maker: m[3], blurb: m[4], sizeGB: parseFloat(m[5]),
  // Two resident models so both the "On this iPhone" group and the catalog
  // below it render; the rest are what you would actually be browsing.
  downloaded: m[1] === 'qwen3-1.7b' || m[1] === 'llama3.2-3b'
}))
if (CATALOG.length < 40) throw new Error(`harness parsed only ${CATALOG.length} models from LocalModels.swift`)

const state = { models: CATALOG.map(m => ({ ...m })), ram: 6.44e9 }
window.__harness = { state, emit }

window.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    LocalModels: {
      addListener: (ev, fn) => Promise.resolve(addListener(ev, fn)),
      list: async () => ({ models: state.models.map(m => ({ ...m })) }),
      downloaded: async () => ({ ids: state.models.filter(m => m.downloaded).map(m => m.id) }),
      diskInfo: async () => ({ total: 511e9, free: 48e9, ramTotal: 12.26e9, ramAvailable: state.ram }),
      deviceInfo: async () => ({ name: 'iPhone 17 Pro Max', identifier: 'iPhone18,2', cores: 6, osVersion: '26.6', ramTotal: 12.26e9, ramAvailable: state.ram }),
      download: async ({ id }) => {
        emit('downloadStarted', { id })
        let p = 0
        const t = setInterval(() => {
          p += 0.25
          if (p >= 1) {
            clearInterval(t)
            const m = state.models.find(x => x.id === id); if (m) m.downloaded = true
            emit('downloadDone', { id })
          } else emit('downloadProgress', { id, progress: p })
        }, 40)
        return {}
      },
      cancelDownload: async ({ id }) => { emit('downloadCancelled', { id }); return {} },
      remove: async ({ id }) => { const m = state.models.find(x => x.id === id); if (m) m.downloaded = false; return {} },
      // ⚠️ Mirrors the real plugin: one shot, no memory of the conversation.
      // It STREAMS, deliberately — the scroll bug Tony hit only exists while
      // tokens are arriving, so a stub that answers instantly cannot catch it.
      generate: async ({ prompt }) => {
        const words = ('Local reply to ' + String(prompt).slice(-16) + ' ' +
          'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod '.repeat(6)).split(' ')
        let i = 0
        const t = setInterval(() => {
          if (i >= words.length) { clearInterval(t); emit('done', {}); return }
          emit('token', { text: words[i++] + ' ' })
        }, 12)
        return {}
      },
      stop: async () => ({})
    },
    SecureStore: {
      set: async () => ({}), get: async () => ({ value: '' }),
      remove: async () => ({}), keys: async () => ({ keys: [] })
    },
    ProviderChat: {
      addListener: (ev, fn) => Promise.resolve(addListener(ev, fn)),
      models: async () => ({ models: ['anthropic/claude-opus-4.5', 'openai/gpt-5', 'deepseek/deepseek-v4'] }),
      send: async () => { emit('cloudToken', { text: 'Cloud reply.' }); emit('cloudDone', {}); return {} },
      stop: async () => ({})
    },
    Haptics: { impact: async () => ({}), notification: async () => ({}), selection: async () => ({}) },
    StatusBar: { setStyle: async () => ({}), setBackgroundColor: async () => ({}) },
    Keyboard: { addListener: (ev, fn) => Promise.resolve(addListener(ev, fn)), setAccessoryBarVisible: async () => ({}) },
    SplashScreen: { hide: async () => ({}) }
  }
}
