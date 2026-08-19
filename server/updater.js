// Update checking against the project's GitHub Releases. Works unsigned:
// this only *detects* a newer release and points at the download. Silent
// apply-and-relaunch would additionally require a signed build.

const REPO = 'templetongroup/radiant'

// compare "1.2.0" style strings; returns true if b is strictly newer than a
export function isNewer (a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number)
  const pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (y > x) return true
    if (y < x) return false
  }
  return false
}

export async function checkForUpdate (currentVersion) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { 'user-agent': 'Radiant-Updater', accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  const r = await res.json()
  const latest = String(r.tag_name || '').replace(/^v/, '')
  const dmg = (r.assets || []).find(a => /\.dmg$/i.test(a.name))
  return {
    current: currentVersion,
    latest,
    hasUpdate: Boolean(latest) && isNewer(currentVersion, latest),
    htmlUrl: r.html_url,
    dmgUrl: dmg?.browser_download_url || r.html_url,
    notes: r.body || '',
    publishedAt: r.published_at
  }
}
