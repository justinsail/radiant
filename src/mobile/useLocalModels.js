/**
 * useLocalModels — the catalog, the download state and the disk numbers.
 *
 * This is the only place the LocalModels plugin is touched for listing,
 * downloading and removing. (Generation lives in MobileChat, which owns the
 * token stream and its terminal-event race; the split is deliberate and
 * documented there.)
 *
 * What the plugin actually gives us, and what this hook therefore refuses to
 * invent:
 *   list()      → { models: [{ id, name, blurb, sizeGB, downloaded }] }
 *   download()  is INDETERMINATE — downloadStarted / downloadDone /
 *               downloadFailed and nothing in between (TG-221). There is no
 *               percentage here because there is no percentage to have, and a
 *               bar creeping to 90% and hanging is the worst outcome available.
 *   remove()    forgets the weights.
 * Device.getInfo() supplies realDiskTotal / realDiskFree for the storage line.
 * If Device is missing we report null and the storage line hides itself rather
 * than guessing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as haptics from './haptics.js'

const LM = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.LocalModels : null)
const DEVICE = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.Device : null)

// Decimal GB, matching how Apple reports storage in Settings. Using 2^30 would
// make every figure on screen disagree with the number the user can check.
export const GB = 1e9

export function useLocalModels () {
  const [models, setModels] = useState([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [jobs, setJobs] = useState({})        // id -> 'downloading' | 'failed'
  const [failures, setFailures] = useState({}) // id -> message
  const [justDone, setJustDone] = useState(null)
  const [disk, setDisk] = useState(null)      // { total, free } or null

  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const refresh = useCallback(async () => {
    const lm = LM()
    if (!lm?.list) { setReady(true); return }
    try {
      const res = await lm.list()
      if (!alive.current) return
      setModels(Array.isArray(res?.models) ? res.models : [])
      setError(null)
    } catch (e) {
      if (alive.current) setError(e?.message || 'Could not read the model list.')
    } finally {
      if (alive.current) setReady(true)
    }
  }, [])

  const refreshDisk = useCallback(async () => {
    const dev = DEVICE()
    if (!dev?.getInfo) { setDisk(null); return }
    try {
      const info = await dev.getInfo()
      if (!alive.current) return
      const total = typeof info?.realDiskTotal === 'number' ? info.realDiskTotal : null
      const free = typeof info?.realDiskFree === 'number' ? info.realDiskFree : null
      setDisk(total ? { total, free } : null)
    } catch { if (alive.current) setDisk(null) }
  }, [])

  useEffect(() => { refresh(); refreshDisk() }, [refresh, refreshDisk])

  // the disk and the catalog can both change while we were in the background
  useEffect(() => {
    const onVis = () => { if (!document.hidden) { refresh(); refreshDisk() } }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refresh, refreshDisk])

  // ── plugin events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const lm = LM()
    if (!lm?.addListener) return
    let dead = false
    const handles = []

    const on = {
      // idempotent: downloadStarted also arrives for a retry we did not start
      downloadStarted: ({ id }) => {
        setJobs(j => ({ ...j, [id]: 'downloading' }))
        setFailures(f => { if (!(id in f)) return f; const n = { ...f }; delete n[id]; return n })
      },
      downloadDone: ({ id }) => {
        setJobs(j => { const n = { ...j }; delete n[id]; return n })
        setModels(ms => ms.map(m => (m.id === id ? { ...m, downloaded: true } : m)))
        setJustDone(id)
        haptics.notification('SUCCESS')
        refreshDisk()
        setTimeout(() => { if (alive.current) setJustDone(cur => (cur === id ? null : cur)) }, 900)
      },
      downloadFailed: ({ id, message }) => {
        setJobs(j => { const n = { ...j }; delete n[id]; return n })
        setFailures(f => ({ ...f, [id]: message || 'The download did not finish.' }))
        haptics.notification('ERROR')
      }
    }

    for (const [ev, fn] of Object.entries(on)) {
      // addListener resolves to the handle in Capacitor 7; if we unmount before
      // it settles, tear it down on arrival
      Promise.resolve(lm.addListener(ev, fn))
        .then(h => { if (dead) h?.remove?.(); else handles.push(h) })
        .catch(() => {})
    }
    return () => { dead = true; handles.forEach(h => h?.remove?.()) }
  }, [refreshDisk])

  // ── actions ───────────────────────────────────────────────────────────────

  const downloadingId = useMemo(
    () => Object.keys(jobs).find(id => jobs[id] === 'downloading') || null,
    [jobs]
  )

  const download = useCallback(async (id) => {
    const lm = LM()
    if (!lm?.download || !id) return
    // one at a time — which is also what enforces "exactly one gauge animates"
    if (Object.values(jobs).includes('downloading')) return
    setJobs(j => ({ ...j, [id]: 'downloading' }))
    setFailures(f => { if (!(id in f)) return f; const n = { ...f }; delete n[id]; return n })
    haptics.impact('MEDIUM')
    try {
      await lm.download({ id })
    } catch (e) {
      if (!alive.current) return
      setJobs(j => { const n = { ...j }; delete n[id]; return n })
      setFailures(f => ({ ...f, [id]: e?.message || 'The download did not start.' }))
      haptics.notification('ERROR')
    }
  }, [jobs])

  const remove = useCallback(async (id) => {
    const lm = LM()
    if (!lm?.remove || !id) return
    try { await lm.remove({ id }) } catch { /* the row below still reconciles */ }
    if (!alive.current) return
    setModels(ms => ms.map(m => (m.id === id ? { ...m, downloaded: false } : m)))
    refreshDisk()
  }, [refreshDisk])

  const bytesOf = useCallback(
    (m) => Math.round((Number(m?.sizeGB) || 0) * GB),
    []
  )

  const downloaded = useMemo(() => models.filter(m => m?.downloaded), [models])
  const usedBytes = useMemo(
    () => downloaded.reduce((n, m) => n + bytesOf(m), 0),
    [downloaded, bytesOf]
  )

  const fits = useCallback((m) => {
    if (!disk || typeof disk.free !== 'number') return true // no claim without data
    return bytesOf(m) <= disk.free
  }, [disk, bytesOf])

  const shortfall = useCallback((m) => {
    if (!disk || typeof disk.free !== 'number') return 0
    return Math.max(0, bytesOf(m) - disk.free)
  }, [disk, bytesOf])

  return {
    models,
    downloaded,
    ready,
    error,
    jobs,
    failures,
    justDone,
    downloadingId,
    disk,
    usedBytes,
    bytesOf,
    fits,
    shortfall,
    download,
    remove,
    refresh,
    refreshDisk
  }
}

export default useLocalModels
