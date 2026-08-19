const { app, Menu, dialog, shell, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

// Real auto-update via electron-updater against GitHub Releases. Works because
// the app is signed + notarized. Flow: check → (ask) download w/ progress →
// quit & relaunch into the new version. Renderer drives it over IPC; the menu
// bar has a "Check for Updates…" item too.

function installUpdater ({ getWindow }) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  let latest = null

  const send = (type, data) => {
    const w = getWindow()
    if (w && !w.isDestroyed()) w.webContents.send('rad:update-event', { type, data })
  }

  autoUpdater.on('update-available', info => { latest = info; send('available', { version: info.version, notes: info.releaseNotes }) })
  autoUpdater.on('update-not-available', () => send('none', {}))
  autoUpdater.on('download-progress', p => send('progress', { percent: Math.round(p.percent), transferred: p.transferred, total: p.total }))
  autoUpdater.on('update-downloaded', info => send('downloaded', { version: info.version }))
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
  ipcMain.on('rad:install-update', () => { setImmediate(() => autoUpdater.quitAndInstall(false, true)) })

  async function checkNow (silent) {
    let r
    try { r = await autoUpdater.checkForUpdates() } catch (e) {
      if (!silent) dialog.showMessageBox({ type: 'warning', message: 'Could not check for updates', detail: String(e.message || e), buttons: ['OK'] })
      return
    }
    const v = r && r.updateInfo && r.updateInfo.version
    if (v && v !== app.getVersion()) {
      const { response } = await dialog.showMessageBox(getWindow() || undefined, {
        type: 'info',
        message: `Radiant ${v} is available`,
        detail: `You have ${app.getVersion()}. Download it now? Radiant will install it and relaunch when it's ready.`,
        buttons: ['Download', 'Later'], defaultId: 0, cancelId: 1
      })
      if (response === 0) autoUpdater.downloadUpdate()
    } else if (!silent) {
      dialog.showMessageBox(getWindow() || undefined, { type: 'info', message: "You're up to date", detail: `Radiant ${app.getVersion()} is the latest version.`, buttons: ['OK'] })
    }
  }

  // when a download finishes from the menu path, offer to restart
  autoUpdater.on('update-downloaded', async info => {
    const { response } = await dialog.showMessageBox(getWindow() || undefined, {
      type: 'info',
      message: `Radiant ${info.version} is ready`,
      detail: 'Restart now to finish updating?',
      buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1
    })
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
    setTimeout(() => checkNow(true), 8000)
    setInterval(() => checkNow(true), 6 * 60 * 60 * 1000)
  }

  buildMenu()
  return { checkNow, startAutoCheck }
}

module.exports = { installUpdater }
