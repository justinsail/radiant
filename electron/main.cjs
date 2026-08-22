const { app, BrowserWindow, shell, ipcMain, nativeTheme, dialog, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const { installUpdater } = require('./updater.cjs')
const windowState = require('./window-state.cjs')

// window chrome follows the app's own light/dark setting, not the OS
function savedMode () {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.radiant', 'config.json'), 'utf8'))
    return cfg.settings?.mode === 'light' ? 'light' : 'dark'
  } catch { return 'dark' }
}
nativeTheme.themeSource = savedMode()
ipcMain.on('radiant:set-mode', (e, mode) => {
  nativeTheme.themeSource = mode === 'light' ? 'light' : 'dark'
})

// native folder picker for the workspace chip (window.prompt is a no-op in Electron)
ipcMain.handle('rad:pick-folder', async (e, current) => {
  const res = await dialog.showOpenDialog(win || undefined, {
    title: 'Choose workspace folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: current || undefined
  })
  return res.canceled || !res.filePaths?.length ? null : res.filePaths[0]
})

console.log('[radiant] main.cjs loaded, electron', process.versions.electron)
process.on('uncaughtException', e => console.error('[radiant] uncaught:', e))
process.on('unhandledRejection', e => console.error('[radiant] unhandled rejection:', e))

let win = null
let settingsWin = null
let serverPort = null
let updater = null

ipcMain.on('rad:open-settings', async (e, tab) => {
  const port = await ensureServer()
  const hash = 'settings' + (tab ? '/' + tab : '')
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); if (tab) settingsWin.loadURL(`http://127.0.0.1:${port}/#${hash}`); return }
  const setState = windowState.restore('settings', { width: 940, height: 720 }, screen.getAllDisplays())
  settingsWin = new BrowserWindow({
    ...setState.bounds,
    minWidth: 720,
    minHeight: 520,
    title: 'Radiant Settings',
    backgroundColor: nativeTheme.themeSource === 'light' ? '#f5f5f6' : '#141517',
    parent: win || undefined,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') }
  })
  windowState.track(settingsWin, 'settings', setState)
  settingsWin.on('closed', () => {
    settingsWin = null
    if (win && !win.isDestroyed()) win.webContents.send('rad:settings-closed')
  })
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  settingsWin.loadURL(`http://127.0.0.1:${port}/#${hash}`)
})
ipcMain.on('rad:close-settings', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close() })

async function ensureServer () {
  if (serverPort) return serverPort
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.js')).href)
  serverPort = await mod.ready
  return serverPort
}

async function createWindow () {
  const port = await ensureServer()
  const state = windowState.restore('main', { width: 1360, height: 860 }, screen.getAllDisplays())
  win = new BrowserWindow({
    ...state.bounds,
    minWidth: 900,
    minHeight: 600,
    title: 'Radiant',
    backgroundColor: nativeTheme.themeSource === 'light' ? '#f5f5f6' : '#141517',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  windowState.track(win, 'main', state)
  win.on('closed', () => { win = null })
  // external links go to the real browser, not new Electron windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  await win.loadURL(`http://127.0.0.1:${port}`)

  // menu-bar "Check for Updates…" + a quiet auto-check on launch
  updater = installUpdater({ getWindow: () => win })
  updater.startAutoCheck()
}

app.whenReady().then(createWindow)

app.on('activate', () => {
  if (app.isReady() && !win) createWindow()
})

app.on('window-all-closed', () => {
  app.quit() // the embedded server dies with the process
})
