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

// ⚠️ YOUR OWN WI-FI IS THE POINT OF THE FEATURE. Tony: "the whole point of this
// is so they can run real model on the desktop app and share them with the
// phone like LM studio does in locally." That is a home-network connection, and
// iOS allows plain http there via NSAllowsLocalNetworking — so the app must too,
// and must ASSUME http for a bare local address rather than https.
globalThis.fetch = async (url) => {
  const u = new URL(String(url))
  if (u.protocol === 'http:' && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(u.hostname) && !u.hostname.endsWith('.local') && u.hostname !== 'localhost') {
    throw new Error(`ATS would refuse plain http to ${u.hostname}`)
  }
  return { ok: true, status: 200, json: async () => ({ models: [] }) }
}
is('a bare Wi-Fi address assumes http', await testServer('192.168.1.50:5834', ''), 'http://192.168.1.50:5834')
is('10.x is local too', await testServer('10.0.0.5:5834', ''), 'http://10.0.0.5:5834')
is('172.16-31 is local', await testServer('172.20.3.4:5834', ''), 'http://172.20.3.4:5834')
is('a .local name assumes http', await testServer('mac.local:5834', ''), 'http://mac.local:5834')
is('explicit local http is accepted', await testServer('http://192.168.1.50:5834', ''), 'http://192.168.1.50:5834')
// ⚠️ 100.64/10 LOOKS PRIVATE AND IS NOT. Tailscale lives there, but it is
// RFC6598 shared space and ATS treats it as public — so it must still get https,
// which is what pushes the user to the Serve address that actually works.
is('a Tailscale IP is NOT treated as local', await testServer('100.64.118.54', ''), 'https://100.64.118.54')
is('172.32 is public, not local', (await err(() => testServer('http://172.32.0.1', ''))) !== null, true)

// http is refused before it leaves the app — the screen has always PROMISED
// this in its footer text, and it was never implemented.
is('http to a public host is refused', (await err(() => testServer('http://mac.ts.net', ''))).includes('Wi-Fi'), true)
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
