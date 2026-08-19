const { app, BrowserWindow, shell, ipcMain, nativeTheme } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const { installUpdater } = require('./updater.cjs')

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

console.log('[radiant] main.cjs loaded, electron', process.versions.electron)
process.on('uncaughtException', e => console.error('[radiant] uncaught:', e))
process.on('unhandledRejection', e => console.error('[radiant] unhandled rejection:', e))

let win = null
let serverPort = null
let updater = null

async function ensureServer () {
  if (serverPort) return serverPort
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.js')).href)
  serverPort = await mod.ready
  return serverPort
}

async function createWindow () {
  const port = await ensureServer()
  win = new BrowserWindow({
    width: 1360,
    height: 860,
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
