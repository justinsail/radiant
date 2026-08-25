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

// A small slice of the real catalogue, same shape LocalModels.list() returns.
const CATALOG = [
  { id: 'qwen3-0.6b', name: 'Qwen 3 0.6B', maker: 'Alibaba', blurb: 'Tiny and instant.', sizeGB: 0.35, downloaded: false },
  { id: 'qwen3-1.7b', name: 'Qwen 3 1.7B', maker: 'Alibaba', blurb: 'The best all-rounder.', sizeGB: 0.98, downloaded: true },
  { id: 'llama3.2-3b', name: 'Llama 3.2 3B', maker: 'Meta', blurb: "Meta's.", sizeGB: 1.82, downloaded: true },
  { id: 'phi4-mini', name: 'Phi 4 mini', maker: 'Microsoft', blurb: 'Punches above its size.', sizeGB: 2.18, downloaded: false },
  { id: 'gemma4-e4b', name: 'Gemma 4 E4B', maker: 'Google', blurb: "Google's phone flagship.", sizeGB: 3.49, downloaded: false }
]

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
