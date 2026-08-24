/**
 * Connecting to a Mac must fail LOUDLY and QUICKLY.
 *
 * ⚠️ EVERY CASE HERE IS ONE TONY ACTUALLY HIT. Out of the house, he entered his
 * Mac's details, pressed Connect, and "nothing happened" — because testServer
 * had no timeout, so an unreachable Mac left the button on "Connecting…" for
 * the better part of a minute with no error.
 */
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const is = (name, got, want) => {
  if (got === want) { pass++; return }
  fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)
}

// api.js reaches for localStorage at module scope, so give it one.
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
}
globalThis.window = undefined

const { testServer } = await import('../src/api.js')

const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

// ⚠️ A BARE HOSTNAME MUST NOT BECOME A RELATIVE URL. On the phone that resolves
// against the app's own bundled server, which answers 200 with index.html — so
// the old `res.ok` check reported a successful connection to a Mac that had
// never been contacted.
globalThis.fetch = async (url) => {
  if (!/^https:\/\//.test(String(url))) throw new Error(`relative or non-https fetch: ${url}`)
  return { ok: true, status: 200, json: async () => ({ models: [] }) }
}
is('a bare hostname gains https', await testServer('mac.tailnet.ts.net', ''), 'https://mac.tailnet.ts.net')
is('a trailing slash is trimmed', await testServer('https://mac.ts.net/', ''), 'https://mac.ts.net')

// http is refused before it leaves the app — the screen has always PROMISED
// this in its footer text, and it was never implemented.
is('http is refused', (await err(() => testServer('http://mac.ts.net', ''))).includes('https'), true)
is('an empty address is refused', (await err(() => testServer('   ', ''))) !== null, true)

// ⚠️ 200 IS NOT PROOF. The app's own server returns index.html with status 200.
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('not json') } })
is('HTML answering 200 is not a Mac', (await err(() => testServer('https://mac.ts.net', ''))).includes('not Radiant'), true)

// A wrong token is its own message, not a generic failure.
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) })
is('401 names the token', (await err(() => testServer('https://mac.ts.net', 'x'))).includes('token'), true)

// ⚠️ THE ONE THAT CAUSED THE BUG: a Mac that never answers must time out, and
// the message must say why rather than blaming the address.
globalThis.fetch = async (_u, opts) => new Promise((_res, rej) => {
  opts?.signal?.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; rej(e)
  })
})
const started = Date.now()
const msg = await err(() => testServer('https://asleep.ts.net', ''))
const waited = Date.now() - started
is('an unreachable Mac gives up', msg !== null, true)
is('and says it timed out', /seconds|asleep|tailnet/.test(msg || ''), true)
is('within 15s, not iOS\'s default minute', waited < 15000, true)

// The source must keep a deadline at all — deleting the AbortController would
// pass every assertion above except this one.
const src = readFileSync('src/api.js', 'utf8')
is('testServer still has a deadline', /AbortController[\s\S]*TEST_TIMEOUT_MS/.test(src), true)

console.log(`${pass}/${pass + fail} passed  ·  connect-to-a-Mac failure modes`)
process.exit(fail ? 1 : 0)
