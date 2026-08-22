import { contextBridge, ipcRenderer } from 'electron'

function normalizeRestartReadiness(readiness) {
  return Object.freeze({
    safeToRestart: readiness?.safeToRestart === true,
    unsavedWorkCount: Number.isInteger(readiness?.unsavedWorkCount) && readiness.unsavedWorkCount >= 0
      ? readiness.unsavedWorkCount
      : -1,
  })
}

contextBridge.exposeInMainWorld('materialPbxDesktop', Object.freeze({
  window: Object.freeze({
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  }),
  updates: Object.freeze({
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: readiness => ipcRenderer.invoke('update:install', normalizeRestartReadiness(readiness)),
    subscribe: (listener) => {
      const handler = (_event, state) => listener(state)
      ipcRenderer.on('update:state', handler)
      return () => ipcRenderer.removeListener('update:state', handler)
    },
  }),
}))
