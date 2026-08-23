const { app, Menu, dialog, shell, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('fs')
const path = require('path')

// ⚠️ A STAGED PACKAGE IS NOT NECESSARILY THE LATEST ONE.
//
// electron-updater downloads into a `pending` folder and, with
// autoInstallOnAppQuit, installs whatever is sitting there when the app quits.
// Nothing expires it. So if you download an update and don't restart, then a
// few more releases ship, quitting installs the OLD staged build — and the next
// launch finds a newer one and asks again. Being several versions behind meant
// clicking through an update prompt per version to crawl forward one at a time.
//
// The fix is to treat `pending` as a cache that must match the newest release:
// drop it whenever it holds something already installed or something older than
// what the feed offers, so a quit-install can only ever apply the latest.
function pendingDir () {
  return path.join(app.getPath('cache'), `${app.getName().toLowerCase()}-updater`, 'pending')
}

function stagedVersion () {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(pendingDir(), 'update-info.json'), 'utf8'))
    const m = /-(\d+\.\d+\.\d+)-/.exec(info.fileName || '')
    return info.version || (m ? m[1] : null)
  } catch { return null }
}

function clearStaged (why) {
  const dir = pendingDir()
  if (!fs.existsSync(dir)) return false
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`[radiant] discarded staged update (${why})`)
    return true
  } catch (e) {
    console.warn('[radiant] could not discard staged update:', e.message)
    return false
  }
}

// -1 / 0 / 1, on plain x.y.z. Enough for our own version numbers.
function cmpVersion (a, b) {
  const pa = String(a || '0').split('.').map(Number)
  const pb = String(b || '0').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1
  }
  return 0
}

// Real auto-update via electron-updater against GitHub Releases. Works because
// the app is signed + notarized. Flow: check → (ask) download w/ progress →
// quit & relaunch into the new version. Renderer drives it over IPC; the menu
// bar has a "Check for Updates…" item too.

// The user's "Automatically check for updates on launch" toggle lives in the
// config the server owns. Read it fresh each check so turning it off takes
// effect without a relaunch.
function autoUpdatesEnabled () {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(require('os').homedir(), '.radiant', 'config.json'), 'utf8'))
    return cfg.settings?.autoUpdateCheck !== false
  } catch { return true }
}

function installUpdater ({ getWindow }) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  let latest = null
  let downloadedThisRun = false
  // one update conversation at a time — repeated checks used to stack dialogs
  let dialogOpen = false
  let promptedFor = null

  // Before anything can quit-install it: a staged build at or below the running
  // version is spent (it is usually the one we just installed) and would only
  // reinstall what is already here.
  const staleOnDisk = stagedVersion()
  if (staleOnDisk && cmpVersion(staleOnDisk, app.getVersion()) <= 0) {
    clearStaged(`${staleOnDisk} is already installed`)
  }

  const send = (type, data) => {
    const w = getWindow()
    if (w && !w.isDestroyed()) w.webContents.send('rad:update-event', { type, data })
  }

  autoUpdater.on('update-available', info => { latest = info; send('available', { version: info.version, notes: info.releaseNotes }) })
  autoUpdater.on('update-not-available', () => send('none', {}))
  autoUpdater.on('download-progress', p => send('progress', { percent: Math.round(p.percent), transferred: p.transferred, total: p.total }))
  autoUpdater.on('update-downloaded', info => { downloadedThisRun = true; send('downloaded', { version: info.version }) })
  autoUpdater.on('error', err => send('error', { message: String(err && err.message || err) }))

  ipcMain.handle('rad:check-update', async () => {
    try {
      const r = await autoUpdater.checkForUpdates()
      const v = r && r.updateInfo && r.updateInfo.version
      return { version: v, current: app.getVersion(), hasUpdate: Boolean(v) && v !== app.getVersion() }
    } catch (e) {
      return { error: String(e && e.message || e), current: app.getVersion() }
    }
  })
  ipcMain.on('rad:download-update', () => { autoUpdater.downloadUpdate().catch(e => send('error', { message: String(e.message || e) })) })
  // ⚠️ A PACKAGE STAGED IN AN EARLIER SESSION IS NOT KNOWN TO THIS ONE.
  // electron-updater only wires up quitAndInstall for a download it performed
  // in the current run — and autoInstallOnAppQuit only applies such a download
  // too. Relying on that shipped an update that downloaded, sat in the cache,
  // and then did nothing on quit, while a second attempt reported 0% forever
  // because a cached file emits no progress. So re-establish the download in
  // this process first: with the bytes already on disk this returns
  // immediately, and only then is quitAndInstall meaningful.
  ipcMain.on('rad:install-update', async () => {
    try {
      if (!downloadedThisRun) {
        await autoUpdater.checkForUpdates()
        await autoUpdater.downloadUpdate()
      }
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    } catch (e) {
      send('error', { message: `Could not install the update: ${String(e.message || e)}` })
    }
  })

  async function checkNow (silent) {
    let r
    try { r = await autoUpdater.checkForUpdates() } catch (e) {
      if (!silent) dialog.showMessageBox({ type: 'warning', message: 'Could not check for updates', detail: String(e.message || e), buttons: ['OK'] })
      return
    }
    const v = r && r.updateInfo && r.updateInfo.version
    if (v && cmpVersion(v, app.getVersion()) > 0) {
      // Anything staged that isn't this newest release would install the wrong
      // version on quit — and it is what made a multi-version gap take several
      // prompts to cross. Drop it and go straight to the latest.
      const staged = stagedVersion()
      if (staged && staged !== v) clearStaged(`staged ${staged}, but ${v} is current`)

      if (dialogOpen || (silent && promptedFor === v)) return
      dialogOpen = true
      let response
      try {
        ;({ response } = await dialog.showMessageBox(getWindow() || undefined, {
          type: 'info',
          message: `Radiant ${v} is available`,
          detail: `You have ${app.getVersion()}. Download it now? Radiant will install it and relaunch when it's ready.`,
          buttons: ['Download', 'Later'], defaultId: 0, cancelId: 1
        }))
      } finally { dialogOpen = false }
      promptedFor = v
      if (response === 0) autoUpdater.downloadUpdate()
    } else if (!silent) {
      dialog.showMessageBox(getWindow() || undefined, { type: 'info', message: "You're up to date", detail: `Radiant ${app.getVersion()} is the latest version.`, buttons: ['OK'] })
    }
  }

  // when a download finishes from the menu path, offer to restart
  autoUpdater.on('update-downloaded', async info => {
    if (dialogOpen) return
    dialogOpen = true
    let response
    try {
      ;({ response } = await dialog.showMessageBox(getWindow() || undefined, {
        type: 'info',
        message: `Radiant ${info.version} is ready`,
        detail: 'Restart now to finish updating?',
        buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1
      }))
    } finally { dialogOpen = false }
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })

  function buildMenu () {
    const isMac = process.platform === 'darwin'
    const template = [
      ...(isMac ? [{
        label: 'Radiant',
        submenu: [
          { role: 'about' },
          { label: 'Check for Updates…', click: () => checkNow(false) },
          { type: 'separator' },
          { role: 'services' }, { type: 'separator' },
          { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
          { type: 'separator' }, { role: 'quit' }
        ]
      }] : []),
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
      {
        label: 'Help',
        submenu: [
          { label: 'Check for Updates…', click: () => checkNow(false) },
          { label: 'Radiant on GitHub', click: () => shell.openExternal('https://github.com/templetongroup/radiant') }
        ]
      }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  function startAutoCheck () {
    // Already carrying a newer package from a previous run? Say so straight
    // away. Users landed in exactly this state — the bytes were on disk and
    // the app acted as though nothing had happened.
    setTimeout(() => {
      const staged = stagedVersion()
      if (staged && cmpVersion(staged, app.getVersion()) > 0) send('downloaded', { version: staged })
    }, 2500)
    const tick = () => { if (autoUpdatesEnabled()) checkNow(true) }
    setTimeout(tick, 8000)
    setInterval(tick, 6 * 60 * 60 * 1000)
  }

  buildMenu()
  return { checkNow, startAutoCheck }
}

module.exports = { installUpdater }
