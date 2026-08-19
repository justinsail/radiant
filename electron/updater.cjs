const { app, Menu, dialog, shell } = require('electron')

// Update checking for the packaged app. Uses the in-process server's
// /api/update-check (which queries GitHub Releases). Detects + points at the
// download; a signed build could later swap this for silent apply.

function installUpdater ({ getPort, getWindow }) {
  let lastResult = null

  async function fetchStatus () {
    const port = getPort()
    if (!port) throw new Error('server not ready')
    const res = await fetch(`http://127.0.0.1:${port}/api/update-check`)
    if (!res.ok) throw new Error(`check failed (${res.status})`)
    return res.json()
  }

  async function checkNow (silent) {
    let status
    try {
      status = await fetchStatus()
      lastResult = status
    } catch (e) {
      if (!silent) dialog.showMessageBox({ type: 'warning', message: 'Could not check for updates', detail: e.message, buttons: ['OK'] })
      return
    }
    if (status.hasUpdate) {
      const { response } = await dialog.showMessageBox(getWindow() || undefined, {
        type: 'info',
        message: `Radiant ${status.latest} is available`,
        detail: `You have ${status.current}. Download the new version, then drag it into Applications to replace this one.`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      if (response === 0) shell.openExternal(status.dmgUrl)
    } else if (!silent) {
      dialog.showMessageBox(getWindow() || undefined, {
        type: 'info',
        message: "You're up to date",
        detail: `Radiant ${status.current} is the latest version.`,
        buttons: ['OK']
      })
    }
  }

  function buildMenu () {
    const isMac = process.platform === 'darwin'
    const template = [
      ...(isMac ? [{
        label: 'Radiant',
        submenu: [
          { role: 'about' },
          { label: 'Check for Updates…', click: () => checkNow(false) },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }] : []),
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
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
    // one quiet check shortly after launch, then every 6 hours
    setTimeout(() => checkNow(true), 8000)
    setInterval(() => checkNow(true), 6 * 60 * 60 * 1000)
  }

  buildMenu()
  return { checkNow, startAutoCheck }
}

module.exports = { installUpdater }
