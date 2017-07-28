import {
  ipcMain,
  globalShortcut,
  app,
  Tray,
  BrowserWindow,
  dialog,
  shell,
  remote,
  screen
} from 'electron'
import * as fs from 'fs'
import { Ipc, ElmIpc } from './typescript/ipc'

const transparencyDisabled = fs.existsSync(
  `${app.getPath('userData')}/NO_TRANSPARENCY`
)
const autoUpdater = require('electron-updater').autoUpdater
autoUpdater.requestHeaders = { 'Cache-Control': 'no-cache' }
require('electron-debug')({
  enabled: true // enable debug shortcuts in prod build
})

import * as path from 'path'
import * as url from 'url'
const log = require('electron-log')
const assetsDirectory = path.join(__dirname, 'assets')
const { version } = require('./package.json')
const osascript = require('node-osascript')
const appDataPath = app.getPath('userData')
let currentMobstersFilePath: string = path.join(appDataPath, 'active-mobsters')
const bugsnag = require('bugsnag')
const isLocal = require('electron-is-dev')
log.info(`Running version ${version}`)

let checkForUpdates = true

let releaseStage = isLocal ? 'development' : 'production'
bugsnag.register('032040bba551785c7846442332cc067f', {
  autoNotify: true,
  appVersion: version,
  releaseStage: releaseStage
})

const shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    focusMainWindow()
  }
})
if (shouldQuit) {
  app.quit()
}

const returnFocusOsascript = `tell application "System Events"
	set activeApp to name of application processes whose frontmost is true
	if (activeApp = {"Mobster"} or activeApp = {"Electron"}) then
		tell application "System Events"
      delay 0.25 -- prevent issues when user is still holding down Command for a fraction of a second pressing Cmd+Shift+K shortcut
			key code 48 using {command down}
		end tell
	end if
end tell`

function returnFocusMac() {
  osascript.execute(returnFocusOsascript, function(
    err: any,
    result: any,
    raw: any
  ) {
    if (err) {
      return console.error(err)
    }
    console.log(result, raw)
  })
}

function writeToFile(filePath: string, fileContents: string) {
  fs.writeFile(filePath, fileContents, function(err) {
    if (err) {
      console.log(err)
    }
  })
}

function updateMobsterNamesFile(currentMobsterNames: string) {
  writeToFile(currentMobstersFilePath, currentMobsterNames)
}

function showFeedbackForm() {
  new BrowserWindow({ show: true, frame: true, alwaysOnTop: true }).loadURL(
    'https://dillonkearns.typeform.com/to/k9P6iV'
  )
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: Electron.BrowserWindow,
  timerWindow: Electron.BrowserWindow | null,
  tray: Electron.Tray

const timerHeight = 130
const timerWidth = 150

const onMac = /^darwin/.test(process.platform)
const onWindows = /^win/.test(process.platform)

function focusMainWindow() {
  // TODO: workaround - remove once
  // https://github.com/electron/electron/issues/2867#issuecomment-264312493 has been resolved
  if (onWindows) {
    mainWindow.minimize()
  }
  mainWindow.show()
  mainWindow.focus()
}

function hideMainWindow() {
  mainWindow.hide()
  returnFocus()
}

function positionWindowLeft(window: Electron.BrowserWindow) {
  let { width, height } = screen.getPrimaryDisplay().workAreaSize
  window.setPosition(0, height - timerHeight)
}

function positionWindowRight(window: Electron.BrowserWindow) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  window.setPosition(width - timerWidth, height - timerHeight)
}

function returnFocus() {
  if (onMac) {
    returnFocusMac()
  }
}

function startTimer(flags: any) {
  timerWindow = newTransparentOnTopWindow({
    width: timerWidth,
    height: timerHeight,
    focusable: false,
    show: false
  })
  timerWindow.once('ready-to-show', () => {
    timerWindow && timerWindow.show()
  })

  timerWindow.webContents.on('crashed', function() {
    bugsnag.notify('crashed', 'timerWindow crashed')
  })
  timerWindow.on('unresponsive', function() {
    bugsnag.notify('unresponsive', 'timerWindow unresponsive')
  })

  positionWindowRight(timerWindow)

  ipcMain.once('timer-flags', (event: any) => {
    event.returnValue = flags
  })

  let timerFile = transparencyDisabled ? 'opaque-timer' : 'transparent-timer'

  let timerPathName = path.join('pages', timerFile)

  let nodeDevEnv = process.env.NODE_ENV === 'dev'
  let timerProdUrl = url.format({
    pathname: path.join(__dirname, 'pages', `${timerFile}.prod.html`),
    protocol: 'file:'
  })
  let timerDevUrl = url.format({
    hostname: 'localhost',
    pathname: path.join('pages', `${timerFile}.dev.html`),
    port: '8080',
    protocol: 'http',
    slashes: true
  })
  console.log('timer file name:', nodeDevEnv ? timerDevUrl : timerProdUrl)
  timerWindow.loadURL(nodeDevEnv ? timerDevUrl : timerProdUrl)
}

ipcMain.on('timer-mouse-hover', (event: any) => {
  if (timerWindow) {
    let [x, y] = timerWindow.getPosition()
    if (x === 0) {
      positionWindowRight(timerWindow)
    } else {
      positionWindowLeft(timerWindow)
    }
  }
})

ipcMain.on('get-active-mobsters-path', (event: any) => {
  event.returnValue = currentMobstersFilePath
})

function closeTimer() {
  if (timerWindow) {
    timerWindow.close()
    timerWindow = null
  }
}

function createMainWindow() {
  mainWindow = newTransparentOnTopWindow({
    icon: `${assetsDirectory}/icon.ico`,
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow && mainWindow.show()
  })

  mainWindow.webContents.on('crashed', function() {
    bugsnag.notify('crashed', 'mainWindow crashed')
  })
  mainWindow.on('unresponsive', function() {
    bugsnag.notify('unresponsive', 'mainWindow unresponsive')
  })
  setTimeout(() => {
    mainWindow.setAlwaysOnTop(true) // delay to workaround https://github.com/electron/electron/issues/8287
  }, 1000)
  mainWindow.maximize()

  screen.on('display-metrics-changed', function() {
    mainWindow.maximize()
  })

  let prodUrl = url.format({
    pathname: path.join(__dirname, 'setup.prod.html'),
    protocol: 'file:'
  })
  let devUrl = url.format({
    hostname: 'localhost',
    pathname: 'setup.dev.html',
    port: '8080',
    protocol: 'http',
    slashes: true
  })
  let nodeDevEnv = process.env.NODE_ENV === 'dev'

  mainWindow.loadURL(nodeDevEnv ? devUrl : prodUrl)

  function onIpcMessage(ipc: ElmIpc): void {
    if (ipc.message === 'ShowFeedbackForm') {
      showFeedbackForm()
    } else if (ipc.message === 'ShowScriptInstallInstructions') {
      showScripts()
    } else if (ipc.message === 'Hide') {
      toggleMainWindow()
    } else if (ipc.message === 'Quit') {
      app.quit()
    } else if (ipc.message === 'QuitAndInstall') {
      autoUpdater.quitAndInstall()
    } else if (ipc.message === 'ChangeShortcut') {
      globalShortcut.unregisterAll()
      if (ipc.data !== '') {
        setShowHideShortcut(ipc.data)
      }
    } else if (ipc.message === 'OpenExternalUrl') {
      hideMainWindow()
      shell.openExternal(ipc.data)
    } else if (ipc.message === 'StartTimer') {
      startTimer(ipc.data)
      hideMainWindow()
    } else if (ipc.message === 'SaveActiveMobstersFile') {
      updateMobsterNamesFile(ipc.data)
    } else if (ipc.message === 'NotifySettingsDecodeFailed') {
      bugsnag.notify('settings-decode-failure', ipc.data)
    } else {
      const exhaustiveCheck: never = ipc
    }
  }

  Ipc.setupIpcMessageHandler(onIpcMessage)

  ipcMain.on('timer-done', (event: any, timeElapsed: any) => {
    closeTimer()
    mainWindow.webContents.send('timer-done', timeElapsed)
    focusMainWindow()
  })

  ipcMain.on('break-done', (event: any, timeElapsed: any) => {
    closeTimer()
    mainWindow.webContents.send('break-done', timeElapsed)
    focusMainWindow()
  })

  mainWindow.on('closed', function() {
    app.quit()
  })
}

function toggleMainWindow() {
  if (mainWindow.isVisible()) {
    hideMainWindow()
  } else {
    focusMainWindow()
  }
}

function onClickTrayIcon() {
  showStopTimerDialog()
}

const createTray = () => {
  tray = new Tray(path.join(assetsDirectory, 'tray-icon.png'))
  tray.on('right-click', onClickTrayIcon)
  tray.on('double-click', onClickTrayIcon)
  tray.on('click', onClickTrayIcon)
}

function newTransparentOnTopWindow(
  additionalOptions: Electron.BrowserWindowConstructorOptions
) {
  const transparentWindowDefaultOptions = {
    transparent: !transparencyDisabled,
    frame: false,
    alwaysOnTop: true
  }
  return new BrowserWindow({
    ...transparentWindowDefaultOptions,
    ...additionalOptions
  })
}

function showScripts() {
  mainWindow.hide()
  let scriptsWindow: Electron.BrowserWindow | null = new BrowserWindow({
    width: 1000,
    height: 800,
    frame: true,
    icon: `${assetsDirectory}/icon.ico`
  })
  scriptsWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'script-install-instructions.html'),
      protocol: 'file:',
      slashes: true
    })
  )
  scriptsWindow.on('closed', () => {
    scriptsWindow = null
    toggleMainWindow()
  })
}

function onReady() {
  createMainWindow()
  createTray()
  setupAutoUpdater()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', onReady)

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function() {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow()
  }
})

function setupAutoUpdater() {
  autoUpdater.logger = log
  autoUpdater.on('checking-for-update', () => {
    log.info('checking-for-update')
  })

  autoUpdater.on('error', (ev: any, err: any) => {
    checkForUpdates = true
  })

  autoUpdater.on('update-available', () => {
    log.info('update-available')
    checkForUpdates = false
  })

  autoUpdater.on('update-downloaded', (versionInfo: any) => {
    log.info('update-downloaded: ', versionInfo)
    mainWindow.webContents.send('update-downloaded', versionInfo)
  })

  autoUpdater.on('update-not-available', () => {
    log.info('update-not-available')
  })

  if (!isLocal) {
    autoUpdater.checkForUpdates()
    log.info('About to set up interval')
    let myCheckForUpdates = () => {
      log.info('About to check for updates on interval')

      if (checkForUpdates) {
        autoUpdater.checkForUpdates()
      }
    }
    setInterval(myCheckForUpdates, 120 * 1000)
  }
}

function setShowHideShortcut(shortcutString: Electron.Accelerator) {
  globalShortcut.register(shortcutString, showStopTimerDialog)
}

let dialogDisplayed = false

function showStopTimerDialog() {
  if (dialogDisplayed) {
    return
  }
  dialogDisplayed = true
  if (timerWindow) {
    app.focus() // ensure that app is focused so dialog appears in foreground
    let dialogActionIndex = dialog.showMessageBox({
      type: 'warning',
      buttons: ['Stop timer', 'Keep it running'],
      message: 'Stop the timer?',
      cancelId: 1
    })
    if (dialogActionIndex !== 1) {
      closeTimer()
      mainWindow.show()
      mainWindow.focus()
    }
  } else {
    toggleMainWindow()
  }
  dialogDisplayed = false
}