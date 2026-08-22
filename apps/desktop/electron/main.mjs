import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 920,
    minHeight: 640,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1B1B1F' : '#FFFBFE',
    icon: path.join(here, '../../../assets/generated/materialpbx.ico'),
    webPreferences: {
      preload: path.join(here, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow.loadFile(path.join(here, '../dist-renderer/index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { state: 'development', message: 'Update checks run only in an installed build.' }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { state: result?.updateInfo?.version ? 'available' : 'current', version: result?.updateInfo?.version }
  } catch (error) {
    return { state: 'failed', message: error instanceof Error ? error.message : 'Update check failed.' }
  }
})
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(false, true))

app.whenReady().then(() => {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

