/**
 * Will this model actually run on THIS iPhone?
 *
 * The Mac app has answered this for years, in Settings → Models: every row
 * carries "runs well" / "tight fit" / "too big" measured against the Mac's
 * unified memory, and the Download button is disabled on the ones that cannot
 * work. The phone had nothing — it listed sizes and let you find out the hard
 * way, which on iOS means the app disappearing mid-load.
 *
 * The thresholds here are deliberately the SAME ONES as the Mac's
 * (Settings.jsx `fitClass`), so the two apps never disagree about a model that
 * would run on both. What differs is the budget they are measured against.
 *
 * ⚠️ THE BUDGET IS NOT THE PHONE'S RAM. iOS never gives one app the whole
 * device; it kills a process that crosses a per-app limit well below the spec
 * sheet — on a 12 GB iPhone an app may get roughly half. Planning against
 * `physicalMemory` would promise loads that jetsam ends, and a jetsam kill does
 * not look like a memory limit to the user, it looks like Radiant crashing. The
 * native side reports `os_proc_available_memory()` instead: the bytes this
 * process may still allocate. It is a live number, so fit is computed when the
 * list is drawn rather than baked into the catalogue.
 */

/**
 * Memory a model needs while running, from its download size.
 *
 * Weights dominate and are already quantized, so the download is close to what
 * is resident. On top of that: the KV cache that grows with the conversation,
 * plus MLX's own working set. The Mac uses `size * 1.15 + 1.5`; the constant
 * there covers Ollama's server process, which the phone does not have — but it
 * cannot go to zero, or a 0.2 GB model would look free.
 */
export const ramNeededGB = (downloadGB) => downloadGB * 1.15 + 0.45

export const FITS_WELL = 'well'
export const FITS_TIGHT = 'tight'
export const FITS_NO = 'no'

/**
 * ⚠️ SAME THRESHOLDS AS THE MAC. 75% of the budget runs well, up to 95% is
 * tight, past that it will not load. Do not tune one app's numbers alone.
 */
export function fitOf (downloadGB, budgetBytes) {
  if (!budgetBytes || !downloadGB) return null
  const budget = budgetBytes / 1e9
  const need = ramNeededGB(downloadGB)
  if (need <= budget * 0.75) return FITS_WELL
  if (need <= budget * 0.95) return FITS_TIGHT
  return FITS_NO
}

/** Tony's words, not Apple's: "run well, run tight or not run at all." */
export const FIT_LABEL = {
  [FITS_WELL]: 'Runs well',
  [FITS_TIGHT]: 'Runs tight',
  [FITS_NO]: "Won't run"
}

/** The explanation under a row, when someone wants to know why. */
export const FIT_WHY = {
  [FITS_WELL]: 'Comfortable on this iPhone.',
  [FITS_TIGHT]: 'Fits, but close to the limit — expect it to be slow, and to reload if you switch apps.',
  [FITS_NO]: 'Needs more memory than this iPhone can give one app.'
}
