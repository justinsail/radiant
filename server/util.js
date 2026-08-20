const sleep = ms => new Promise(r => setTimeout(r, ms))

// fetch that retries transient upstream errors (Cloudflare 502/503/504, network
// blips) with backoff. Safe for streaming calls: it decides on the response
// STATUS before the body is consumed.
export async function fetchRetry (url, opts = {}, { tries = 3, delayMs = 600 } = {}) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts)
      if ([502, 503, 504].includes(res.status) && i < tries - 1) { last = res; await sleep(delayMs * (i + 1)); continue }
      return res
    } catch (e) {
      last = e
      if (opts.signal?.aborted) throw e
      if (i < tries - 1) { await sleep(delayMs * (i + 1)); continue }
      throw e
    }
  }
  return last
}

// friendly one-liner for a transient upstream error
export function isTransient (status) { return status === 502 || status === 503 || status === 504 }

// Heuristic risk grade for a shell command, for the "Auto" approval mode.
// 'high' = destructive, privileged, network-fetching, or history-rewriting → still
// confirm. Everything else is 'low' and can run silently.
const HIGH_RISK = [
  /\brm\b|-rf\b|\brmdir\b/, /\bsudo\b|\bsu\b/, /\bdd\b/, /\bmkfs|\bfdisk|\bformat\b/,
  /\bshutdown\b|\breboot\b|\bhalt\b/, /\bkill(all)?\b|\bpkill\b/, /\bchmod\b|\bchown\b/,
  /\bcurl\b|\bwget\b|\bnc\b|\bncat\b|\bftp\b/, /\|\s*(sudo\s+)?(sh|bash|zsh)\b/, /\bssh\b|\bscp\b|\brsync\b.*::/,
  /\bgit\s+push\b|\bgit\s+reset\s+--hard\b|\bgit\s+clean\b|\bgit\s+checkout\s+--\s/, /\bnpm\s+publish\b|\byarn\s+publish\b/,
  /\beval\b/, /:\(\)\s*\{/, />\s*\/(dev|etc|usr|bin|sys)\b/, /\brm\b.*\*|\bfind\b.*-delete\b/,
  /\bbrew\s+(uninstall|remove)\b|\bapt(-get)?\s+(remove|purge)\b/, /\bdocker\s+(rm|rmi|system\s+prune)\b/,
  /\bdefaults\s+delete\b|\blaunchctl\b/, /\bhistory\s+-c\b/, /\bcrontab\b/
]
export function commandRisk (command) {
  const c = String(command || '')
  if (!c.trim()) return 'low'
  return HIGH_RISK.some(re => re.test(c)) ? 'high' : 'low'
}
