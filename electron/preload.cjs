const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('radiantNative', {
  setMode: mode => ipcRenderer.send('radiant:set-mode', mode)
})
