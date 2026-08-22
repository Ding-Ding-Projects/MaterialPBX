import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('materialPbxDesktop', Object.freeze({
  window: Object.freeze({
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  }),
  updates: Object.freeze({
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
  }),
}))

