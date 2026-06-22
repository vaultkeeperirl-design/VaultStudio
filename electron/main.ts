import { app, BrowserWindow, Menu, session } from 'electron';
import path from 'path';
import fs from 'fs';

// Prevent Chromium from pausing the renderer when the window is occluded by
// another app. This is the primary cause of the "freeze on alt-tab" — Chromium
// stops compositing and the main thread stalls when resuming.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,WinDCV1SwapChainForOverlays');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

import { registerIpcHandlers } from './ipc';
import { obsEngine } from './services/obs-engine';
import { platformManager } from './services/platform-manager';
import { streamGuard } from './services/stream-guard';
import { irlIngest } from './services/irl-ingest';
import { store } from './services/store';
import { importTargetsFromObs } from './services/multistream';
import { chatPopout } from './services/chat-popout';

// Pin the app identity. If Electron can't resolve the package name (e.g. the
// app is launched as `electron dist-electron/main.js`), userData silently
// falls back to %APPDATA%\Electron and the app "loses" every setting, scene
// and license. Force the canonical directory and pull back anything a
// fallback session wrote.
app.setName('vaultstudio');
const userDataOverride = process.env.VAULTSTUDIO_USER_DATA_DIR;
app.setPath('userData', userDataOverride ? path.resolve(userDataOverride) : path.join(app.getPath('appData'), 'vaultstudio'));
migrateLegacyUserData(Boolean(userDataOverride));

function copyNewerRecursive(from: string, to: string) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyNewerRecursive(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  let existingMtime = 0;
  try {
    existingMtime = fs.statSync(to).mtimeMs;
  } catch {
    /* destination missing — copy */
  }
  if (stat.mtimeMs > existingMtime) fs.copyFileSync(from, to);
}

function migrateLegacyUserData(skip: boolean) {
  if (skip) return;
  try {
    const canonical = app.getPath('userData');
    const legacy = path.join(app.getPath('appData'), 'Electron');
    if (path.resolve(canonical).toLowerCase() === path.resolve(legacy).toLowerCase()) return;
    // Only migrate if a fallback session actually ran VaultStudio there.
    if (!fs.existsSync(path.join(legacy, 'vaultstudio.json'))) return;
    fs.mkdirSync(canonical, { recursive: true });
    for (const item of ['vaultstudio.json', 'license.json', 'chat-history.json', 'obs-config']) {
      const from = path.join(legacy, item);
      if (fs.existsSync(from)) copyNewerRecursive(from, path.join(canonical, item));
    }
  } catch (e) {
    console.error('Legacy userData migration failed:', e);
  }
}

let mainWindow: BrowserWindow | null = null;
let viteServer: { listen: () => Promise<unknown>; close: () => void; httpServer?: { address(): unknown } } | null =
  null;
const smokeTestMode = process.argv.includes('--smoke-test') || process.env.VAULTSTUDIO_SMOKE_TEST === '1';
const smokeState = {
  windowLoaded: false,
  engineReady: false,
  failed: false,
  finished: false,
};

function finishSmokeTest(success: boolean, reason: string) {
  if (!smokeTestMode || smokeState.finished) return;
  smokeState.finished = true;
  process.exitCode = success ? 0 : 1;
  const line = `[smoke] ${success ? 'PASS' : 'FAIL'}: ${reason}`;
  if (success) console.log(line);
  else console.error(line);
  setTimeout(() => app.quit(), 250);
}

function markSmokeWindowLoaded() {
  if (!smokeTestMode) return;
  smokeState.windowLoaded = true;
  console.log('[smoke] window loaded');
  if (smokeState.engineReady) finishSmokeTest(true, 'packaged app loaded and VSS engine initialized');
}

function markSmokeEngineReady(ok: boolean, reason: string) {
  if (!smokeTestMode) return;
  if (!ok) {
    smokeState.failed = true;
    finishSmokeTest(false, reason);
    return;
  }
  smokeState.engineReady = true;
  console.log('[smoke] VSS engine initialized');
  if (smokeState.windowLoaded) finishSmokeTest(true, 'packaged app loaded and VSS engine initialized');
}

function broadcast(channel: string, ...args: unknown[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    } catch {
      /* window tearing down mid-send */
    }
  }
}

function wireServices() {
  obsEngine.on('status', (state) => broadcast('obs:status', state));

  obsEngine.on('event', (eventType: string, data: Record<string, unknown>) => {
    const eventMap: Record<string, string> = {
      scene_changed: 'CurrentProgramSceneChanged',
      scene_list_changed: 'SceneListChanged',
      streaming_started: 'StreamStateChanged',
      streaming_stopped: 'StreamStateChanged',
      recording_started: 'RecordStateChanged',
      recording_stopped: 'RecordStateChanged',
      replay_saved: 'ReplaySaved',
      target_connected: 'TargetStateChanged',
      target_disconnected: 'TargetStateChanged',
      target_reconnecting: 'TargetStateChanged',
    };
    const mapped = eventMap[eventType] || eventType;
    broadcast('obs:event', { eventType: mapped, data });
  });

  obsEngine.on('audioMeters', (meters: { id: string; level: number }[]) => {
    broadcast('obs:audioMeters', meters);
  });

  platformManager.on('chat:message', (msg) => broadcast('chat:message', msg));
  platformManager.on('chat:refresh', (messages) => broadcast('chat:history', messages));
  platformManager.on('activity:event', (evt) => broadcast('activity:event', evt));
  platformManager.on('stats:update', (stats) => broadcast('stats:update', stats));
  platformManager.on('platforms:status', (statuses) => broadcast('platforms:status', statuses));
  platformManager.on('platform:error', (message) => broadcast('platform:error', message));

  streamGuard.on('guard:status', (status) => broadcast('guard:status', status));
  irlIngest.on('irl:status', (status) => broadcast('irl:status', status));

  // The preview frame stream is now the primary live preview (no native window).
  // The engine already caps delivery to the requested fps and keeps a single
  // frame in flight, so forward every frame straight through — an extra
  // main-process throttle here only adds latency and choppiness.
  obsEngine.on('previewFrame', (frame) => {
    broadcast('obs:previewFrame', frame);
  });

  if (!store.hasImportedFromObs() && store.getTargets().length === 0) {
    const imported = importTargetsFromObs();
    if (imported.length > 0) store.saveTargets(imported);
    store.markImportedFromObs();
  }

  if (!store.hasSeededConnections() && store.getConnections().length === 0) {
    store.saveConnections([
      { platform: 'twitch', channel: 'your-twitch', enabled: true, dashboardEnabled: true },
      { platform: 'kick', channel: 'your-kick', enabled: true, dashboardEnabled: true },
    ]);
    store.markSeededConnections();
  }

  {
    const conns = store.getConnections();
    const tw = conns.find((c) => c.platform === 'twitch');
    if (tw && tw.channel === 'your-old-twitch' && !tw.token) {
      tw.channel = 'your-twitch';
      store.saveConnections(conns);
    }
  }

  streamGuard.init();
  platformManager.start();
  irlIngest.init();
}

async function startVite() {
  const { createServer } = await import('vite');
  viteServer = (await createServer({
    server: { port: 5173, strictPort: true },
    configFile: path.join(__dirname, '..', 'vite.config.ts'),
  })) as unknown as typeof viteServer;
  await viteServer!.listen();
  console.log('Vite dev server running on http://localhost:5173');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'VaultStudio',
    backgroundColor: '#0B0B0D',
    icon: path.join(__dirname, '..', 'Vault_Studio.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Broadcast tool: the operator streams with VaultStudio in the background
      // (game/content app focused). Electron's default backgroundThrottling
      // clamps renderer work when the window is occluded/unfocused. The live
      // preview now decodes and paints an in-DOM frame stream, so keep renderer
      // timers/compositing active while the app is visible behind other windows.
      backgroundThrottling: false,
    },
  });

  // Show and explicitly focus the window once content is ready. Starting
  // hidden and then focusing avoids the Windows "activation click" bug where
  // the first mouse interaction is consumed by focusing the window and can
  // leave drag libraries (react-grid-layout) stuck in drag mode, making the
  // UI unresponsive until the user tabs away and back.
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  if (viteServer) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  if (smokeTestMode) {
    mainWindow.webContents.once('did-finish-load', markSmokeWindowLoaded);
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      finishSmokeTest(false, `window failed to load: ${errorCode} ${errorDescription}`);
    });
  }

  chatPopout.configure({
    devServerUrl: viteServer ? 'http://localhost:5173' : undefined,
    indexPath: path.join(__dirname, '..', 'dist', 'index.html'),
    preloadPath: path.join(__dirname, 'preload.js'),
  });
  chatPopout.attachMainWindow(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media');
    });
    registerIpcHandlers();
    wireServices();

    obsEngine.startWorker().then((ok) => {
      if (ok) {
        obsEngine.init().then((initialized) => {
          if (initialized) {
            broadcast('obs:status', 'connected');
            markSmokeEngineReady(true, 'VSS engine initialized');
          } else {
            markSmokeEngineReady(false, 'VSS engine failed to initialize');
          }
        }).catch((error) => {
          markSmokeEngineReady(false, `VSS engine failed to initialize: ${error instanceof Error ? error.message : String(error)}`);
        });
      } else {
        broadcast('obs:status', 'disconnected');
        markSmokeEngineReady(false, 'VSS engine failed to start');
      }
    }).catch((error) => {
      markSmokeEngineReady(false, `VSS engine failed to start: ${error instanceof Error ? error.message : String(error)}`);
    });

    const isDev = !fs.existsSync(path.join(__dirname, '../dist/index.html'));
    if (isDev) {
      await startVite();
    }

    createWindow();
    if (smokeTestMode) {
      setTimeout(() => {
        finishSmokeTest(false, 'timed out waiting for packaged app startup');
      }, 45000);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('app:quitting');
      }
    } catch {
      /* window tearing down */
    }
  }
  obsEngine.stopVirtualCam().catch(() => {});
});

app.on('window-all-closed', async () => {
  if (viteServer) {
    viteServer.close();
  }
  obsEngine.shutdown();
  platformManager.stop();
  irlIngest.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
