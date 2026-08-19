const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

console.log('[radiant] main.cjs loaded, electron', process.versions.electron)
process.on('uncaughtException', e => console.error('[radiant] uncaught:', e))
process.on('unhandledRejection', e => console.error('[radiant] unhandled rejection:', e))

let win = null
let serverPort = null

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
    backgroundColor: '#161311',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.on('closed', () => { win = null })
  // external links go to the real browser, not new Electron windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  await win.loadURL(`http://127.0.0.1:${port}`)
}

app.whenReady().then(createWindow)

app.on('activate', () => {
  if (app.isReady() && !win) createWindow()
})

app.on('window-all-closed', () => {
  app.quit() // the embedded server dies with the process
})
