import { app, autoUpdater, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const updateFeedUrl = 'https://github.com/Ding-Ding-Projects/MaterialPBX/releases/latest/download'
const squirrelEvent = process.platform === 'win32' ? process.argv[1] : undefined
const squirrelFirstRun = process.argv.includes('--squirrel-firstrun')
const squirrelCommandTimeoutMs = 15_000
let mainWindow
let updateInstallAuthorized = false
let updateState = { state: 'idle', version: app.getVersion(), message: 'No update check has run yet.' }

function runSquirrelCommand(args) {
  return new Promise((resolve, reject) => {
    const appDirectory = path.dirname(process.execPath)
    const installRoot = path.resolve(appDirectory, '..')
    const updateExecutable = path.join(installRoot, 'Update.exe')
    const executableName = path.basename(process.execPath)
    const child = spawn(updateExecutable, [...args, executableName], {
      stdio: 'ignore',
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Squirrel command timed out after ${squirrelCommandTimeoutMs} ms.`))
    }, squirrelCommandTimeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`Squirrel command exited with code ${code ?? 'none'}${signal ? ` and signal ${signal}` : ''}.`))
    })
  })
}

async function handleSquirrelLifecycle() {
  let command
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      command = ['--createShortcut']
      break
    case '--squirrel-uninstall':
      command = ['--removeShortcut']
      break
    case '--squirrel-obsolete':
      app.quit()
      return true
    default:
      return false
  }
  try {
    await runSquirrelCommand(command)
    app.quit()
  } catch (error) {
    console.error(`Squirrel lifecycle operation failed: ${error instanceof Error ? error.message : String(error)}`)
    app.exit(1)
  }
  return true
}

const handlingSquirrelLifecycle = await handleSquirrelLifecycle()

function publishUpdateState(nextState) {
  updateState = { ...updateState, ...nextState, version: app.getVersion() }
  mainWindow?.webContents.send('update:state', updateState)
  return updateState
}

function configureUpdater() {
  autoUpdater.setFeedURL({ url: updateFeedUrl })
  autoUpdater.on('checking-for-update', () => publishUpdateState({ state: 'checking', message: 'Checking the release feed.' }))
  autoUpdater.on('update-available', () => publishUpdateState({ state: 'downloading', message: 'A newer version is downloading in the background.' }))
  autoUpdater.on('update-not-available', () => publishUpdateState({ state: 'current', message: 'This installed version is current.' }))
  autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => publishUpdateState({ state: 'ready', availableVersion: releaseName, message: 'The update is ready. Restart when your work is saved.' }))
  autoUpdater.on('error', error => publishUpdateState({ state: 'failed', message: error instanceof Error ? error.message : 'The update check failed.' }))
  autoUpdater.on('before-quit-for-update', () => {
    if (!updateInstallAuthorized) {
      publishUpdateState({ state: 'ready', message: 'Restart was cancelled because the renderer did not confirm that all work was saved.' })
    }
  })
}

function requestUpdateCheck() {
  try {
    autoUpdater.checkForUpdates()
    return true
  } catch (error) {
    publishUpdateState({ state: 'failed', message: error instanceof Error ? error.message : 'The update check could not start.' })
    return false
  }
}

function createWindow() {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'materialpbx.ico')
    : path.resolve(here, '../../../assets/generated/materialpbx.ico')
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 920,
    minHeight: 640,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1B1B1F' : '#FFFBFE',
    icon: windowIcon,
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

if (!handlingSquirrelLifecycle) {
  app.setAppUserModelId('com.squirrel.materialpbx-desktop.MaterialPBX')
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize())
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('update:status', () => updateState)
  ipcMain.handle('update:check', () => {
    if (!app.isPackaged) return { state: 'development', version: app.getVersion(), message: 'Update checks run only in an installed build.' }
    if (updateState.state === 'checking' || updateState.state === 'downloading') return updateState
    if (!requestUpdateCheck()) return updateState
    return { ...updateState, state: 'checking', message: 'Checking the release feed.' }
  })
  ipcMain.handle('update:install', (event, readiness) => {
    if (event.sender !== mainWindow?.webContents) return { ...updateState, message: 'The update request did not come from the active application window.' }
    if (updateState.state !== 'ready') return { ...updateState, message: 'No downloaded update is ready to install.' }
    const safeToRestart = readiness?.safeToRestart === true
    const unsavedWorkCount = readiness?.unsavedWorkCount
    if (!safeToRestart || !Number.isInteger(unsavedWorkCount) || unsavedWorkCount !== 0) {
      const countMessage = Number.isInteger(unsavedWorkCount) && unsavedWorkCount > 0
        ? ` ${unsavedWorkCount} unsaved item${unsavedWorkCount === 1 ? '' : 's'} remain.`
        : ''
      return publishUpdateState({ state: 'ready', installCancelled: true, message: `Restart was cancelled because the renderer did not confirm that all work was saved.${countMessage}` })
    }
    updateInstallAuthorized = true
    publishUpdateState({ state: 'installing', installCancelled: false, message: 'Closing the application to install the downloaded update.' })
    try {
      autoUpdater.quitAndInstall()
    } catch (error) {
      updateInstallAuthorized = false
      return publishUpdateState({ state: 'failed', message: error instanceof Error ? error.message : 'The downloaded update could not start installation.' })
    }
    return updateState
  })

  app.whenReady().then(() => {
    configureUpdater()
    createWindow()
    const initialDelay = squirrelFirstRun ? 10000 : 3000
    setTimeout(() => { if (app.isPackaged) requestUpdateCheck() }, initialDelay)
    setInterval(() => { if (app.isPackaged && !['checking', 'downloading', 'installing'].includes(updateState.state)) requestUpdateCheck() }, 6 * 60 * 60 * 1000)
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
