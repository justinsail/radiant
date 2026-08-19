import crypto from 'crypto'
import http from 'http'

// Subscription sign-in via each vendor's own OAuth client (the same public
// PKCE clients their official CLIs use). This is UNOFFICIAL: vendors license
// subscriptions for their own apps, so tokens are presented the way the CLI
// presents them. Constants here mirror the official clients and may need
// updating if a vendor changes their flow.

export const OAUTH_PROVIDERS = {
  anthropic: {
    label: 'Claude (Pro / Max)',
    mode: 'paste', // user copies a code from the callback page
    authorizeUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    scope: 'org:create_api_key user:profile user:inference'
  },
  openai: {
    label: 'ChatGPT (Plus / Pro)',
    mode: 'loopback', // vendor redirects to a localhost port we listen on
    authorizeUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectPort: 1455,
    redirectPath: '/auth/callback',
    get redirectUri () { return `http://localhost:${this.redirectPort}${this.redirectPath}` },
    scope: 'openid profile email offline_access'
  }
}

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// decode a JWT payload (no verification — we only read our own token's claims)
function jwtClaims (jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64').toString('utf8')) } catch { return {} }
}
// ChatGPT (Codex) responses backend needs the account id from the id_token
export function chatgptAccountId (idToken) {
  const c = jwtClaims(idToken)
  return c['https://api.openai.com/auth']?.chatgpt_account_id || c.chatgpt_account_id || null
}

export function makePkce () {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

// pending flows keyed by providerId: { verifier, server? }
const pending = new Map()

export function buildAuthUrl (providerId) {
  const p = OAUTH_PROVIDERS[providerId]
  if (!p) throw new Error('unknown oauth provider')
  const { verifier, challenge } = makePkce()
  pending.set(providerId, { verifier })
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: p.scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: verifier
  })
  if (providerId === 'anthropic') params.set('code', 'true')
  return { url: `${p.authorizeUrl}?${params}`, mode: p.mode }
}

async function exchange (providerId, code) {
  const p = OAUTH_PROVIDERS[providerId]
  const flow = pending.get(providerId)
  if (!flow) throw new Error('no sign-in in progress — start again')
  // Anthropic returns "code#state"; keep only the code half.
  const cleanCode = String(code).split('#')[0].split('&')[0].trim()
  const body = {
    grant_type: 'authorization_code',
    code: cleanCode,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: flow.verifier,
    state: flow.verifier
  }
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  pending.delete(providerId)
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    idToken: json.id_token || null,
    accountId: chatgptAccountId(json.id_token),
    expires: Date.now() + (json.expires_in ? json.expires_in * 1000 : 3600_000)
  }
}

// paste-mode: caller hands us the code from the callback page
export function completePaste (providerId, code) {
  return exchange(providerId, code)
}

// loopback-mode: stand up a one-shot listener, resolve when the vendor redirects
export function startLoopback (providerId, onDone) {
  const p = OAUTH_PROVIDERS[providerId]
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${p.redirectPort}`)
    if (!u.pathname.startsWith(p.redirectPath)) { res.writeHead(404); res.end(); return }
    const code = u.searchParams.get('code')
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html><body style="font-family:system-ui;background:#141517;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>Radiant is signed in</h2><p>You can close this tab and return to Radiant.</p></div></body></html>')
    server.close()
    try {
      if (!code) throw new Error('no code in callback')
      onDone(null, await exchange(providerId, code))
    } catch (e) { onDone(e) }
  })
  server.on('error', e => onDone(e))
  server.listen(p.redirectPort, '127.0.0.1')
  pending.set(providerId, { ...(pending.get(providerId) || {}), server })
}

export async function refreshToken (providerId, tok) {
  const p = OAUTH_PROVIDERS[providerId]
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: tok.refresh, client_id: p.clientId })
  })
  if (!res.ok) throw new Error(`refresh failed (${res.status})`)
  const json = await res.json()
  return {
    access: json.access_token,
    refresh: json.refresh_token || tok.refresh,
    idToken: json.id_token || tok.idToken || null,
    accountId: chatgptAccountId(json.id_token) || tok.accountId || null,
    expires: Date.now() + (json.expires_in ? json.expires_in * 1000 : 3600_000)
  }
}

// returns a valid access token, refreshing in-place on config if near expiry
export async function validAccessToken (providerId, config, saveConfig) {
  const tok = config.oauth?.[providerId]
  if (!tok) return null
  if (tok.expires - Date.now() > 60_000) return tok.access
  const fresh = await refreshToken(providerId, tok)
  config.oauth[providerId] = fresh
  saveConfig(config)
  return fresh.access
}
