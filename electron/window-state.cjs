// Remembering where a window was, so Radiant reopens the size you left it.
//
// Kept in its own file rather than config.json: the server owns that file and
// rewrites it on every settings change, so two writers would race and lose
// each other's edits.
const fs = require('fs')
const path = require('path')
const os = require('os')

const FILE = path.join(os.homedir(), '.radiant', 'window-state.json')

function readAll () {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {} } catch { return {} }
}

function writeAll (all) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(all, null, 2))
  } catch { /* a window position isn't worth crashing the app over */ }
}

// A saved position is only usable if it still lands on a display that exists.
// Unplug the external monitor a window was on and those coordinates put it
// somewhere you can't drag it back from — so fall back to centered instead.
// `displays` is passed in (rather than read from electron here) so this stays
// testable outside an Electron runtime.
function isOnScreen (b, displays) {
  if (!Number.isFinite(b?.x) || !Number.isFinite(b?.y)) return false
  // require a decent chunk of the titlebar to be grabbable, not just 1px
  const GRAB = 120
  return displays.some(d => {
    const a = d.workArea || d.bounds
    return b.x + b.width - GRAB > a.x && b.x + GRAB < a.x + a.width &&
           b.y + 40 > a.y && b.y < a.y + a.height - 20
  })
}

// Returns BrowserWindow options plus how the window was left (maximized /
// full screen), which the caller applies after the window exists.
function restore (key, fallback, displays) {
  const s = readAll()[key]
  const bounds = {
    width: Number.isFinite(s?.width) ? s.width : fallback.width,
    height: Number.isFinite(s?.height) ? s.height : fallback.height
  }
  if (s && isOnScreen({ ...bounds, x: s.x, y: s.y }, displays)) {
    bounds.x = s.x
    bounds.y = s.y
  }
  return { bounds, maximized: Boolean(s?.maximized), fullScreen: Boolean(s?.fullScreen) }
}

// Re-apply the remembered state and keep saving as the window moves around.
function track (win, key, state) {
  if (state?.fullScreen) win.setFullScreen(true)
  else if (state?.maximized) win.maximize()

  let timer = null
  const save = () => {
    if (win.isDestroyed()) return
    // getNormalBounds() is the un-maximized geometry, so un-maximizing later
    // returns to the size you actually chose rather than the screen size.
    const b = win.getNormalBounds()
    const all = readAll()
    all[key] = {
      x: b.x, y: b.y, width: b.width, height: b.height,
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen()
    }
    writeAll(all)
  }
  const queue = () => { clearTimeout(timer); timer = setTimeout(save, 400) }

  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, queue)
  }
  // 'close' runs while the window still exists, so the final size is readable —
  // this is the one that catches a plain ⌘Q.
  win.on('close', () => { clearTimeout(timer); save() })
}

module.exports = { restore, track, isOnScreen, FILE }
