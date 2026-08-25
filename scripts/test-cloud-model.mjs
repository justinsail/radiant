/**
 * The app must never name one model while another answers.
 *
 * ⚠️ THIS IS THE BUG THIS FILE EXISTS FOR. MobileChat reads loadChosen() and, if
 * a cloud model is set, sends THERE instead of the on-device model — silently.
 * Home and the chat title only knew about downloaded models, so both kept
 * showing a local name. Tony picked an OpenRouter model and asked "now what?"
 * The answer was that every chat was already going to it and nothing said so.
 */
import { readFileSync } from 'node:fs'
let pass = 0, fail = 0
const is = (n, got, want) => { if (got === want) { pass++; return } fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }

const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}
globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} }
globalThis.CustomEvent = class { constructor (t) { this.type = t } }

const { saveChosen, loadChosen, chosenAsModel, shortModelName } = await import('../src/mobile/providers.js')

is('nothing chosen means no cloud model', chosenAsModel(), null)

saveChosen({ providerId: 'openrouter', model: 'anthropic/claude-opus-4.5' })
const m = chosenAsModel()
is('a chosen cloud model is representable', !!m, true)
is('it is shaped like a model the UI can render', typeof m.name === 'string' && !!m.id, true)
// ⚠️ The provider prefix is dropped: it is shown separately, and a phone title
// bar cannot hold "anthropic/claude-opus-4.5".
is('the name is short', m.name, 'claude-opus-4.5')
is('it names the provider', m.maker, 'OpenRouter')
is('it is flagged as cloud', m.cloud, true)
// ⚠️ It must count as usable, or the screens that gate on `downloaded` hide it.
is('it counts as available', m.downloaded, true)

is('shortModelName leaves a bare id alone', shortModelName('gpt-4o'), 'gpt-4o')

// Clearing it must actually clear it, or the chat keeps sending to the cloud
// while the title names a local model — the original lie.
saveChosen(null)
is('clearing removes the cloud model', chosenAsModel(), null)
is('and loadChosen agrees', loadChosen(), null)

// The shell must prefer the cloud model, because the CHAT does.
const shell = readFileSync('src/mobile/MobileShell.jsx', 'utf8')
is('the shell prefers the cloud model', /cloudModel \|\| models\.find/.test(shell), true)
is('switching to a local model clears the cloud choice', shell.includes('saveChosen(null)'), true)
is('the switcher includes the cloud model', shell.includes('switchable'), true)

console.log(`${pass}/${pass + fail} passed  ·  the named model is the answering model`)
process.exit(fail ? 1 : 0)
