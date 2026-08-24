/**
 * haptics — the only place the Haptics plugin is touched.
 *
 * The plugin is reached off window.Capacitor.Plugins rather than imported, so
 * the JS wrapper never enters the root package.json and the Mac bundle gains
 * nothing. Every call is guarded twice: the plugin may be absent (a browser, or
 * a build without @capacitor/haptics) and a buzz must never be able to throw a
 * tap away.
 *
 * Placement is what makes haptics read as native, so the vocabulary is small
 * and fixed:
 *   selection      picker settles, segmented control, Copy, composer wraps
 *   impact LIGHT   send; committing a row tap (on touch-up, never touch-down)
 *   impact MEDIUM  start a download
 *   impact RIGID   sheet detent snap; Stop generation
 *   notification   SUCCESS on downloadDone, ERROR on a failure, WARNING thermal
 * Nothing on token arrival. Nothing on scroll.
 */

const H = () => (typeof window !== 'undefined' ? window.Capacitor?.Plugins?.Haptics : null)

export function selection () {
  try {
    const h = H()
    if (!h) return
    // selectionStart/-Changed/-End is the full idiom; a single tick is what a
    // settle wants, and calling changed alone is what UIKit's selection
    // feedback generator does.
    if (h.selectionChanged) h.selectionChanged()
    else h.impact?.({ style: 'LIGHT' })
  } catch { /* feedback must never break an interaction */ }
}

export function impact (style = 'LIGHT') {
  try { H()?.impact?.({ style }) } catch { /* ignore */ }
}

export function notification (type = 'SUCCESS') {
  try { H()?.notification?.({ type }) } catch { /* ignore */ }
}

export function vibrate (duration = 30) {
  try { H()?.vibrate?.({ duration }) } catch { /* ignore */ }
}

const haptics = { selection, impact, notification, vibrate }
export default haptics
