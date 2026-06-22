"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ipc_1 = require("./ipc");
const obs_engine_1 = require("./services/obs-engine");
const platform_manager_1 = require("./services/platform-manager");
const stream_guard_1 = require("./services/stream-guard");
const irl_ingest_1 = require("./services/irl-ingest");
const store_1 = require("./services/store");
const multistream_1 = require("./services/multistream");
// Pin the app identity. If Electron can't resolve the package name (e.g. the
// app is launched as `electron dist-electron/main.js`), userData silently
// falls back to %APPDATA%\Electron and the app "loses" every setting, scene
// and license. Force the canonical directory and pull back anything a
// fallback session wrote.
electron_1.app.setName('vaultstudio');
electron_1.app.setPath('userData', path_1.default.join(electron_1.app.getPath('appData'), 'vaultstudio'));
migrateLegacyUserData();
function copyNewerRecursive(from, to) {
    const stat = fs_1.default.statSync(from);
    if (stat.isDirectory()) {
        fs_1.default.mkdirSync(to, { recursive: true });
        for (const entry of fs_1.default.readdirSync(from)) {
            copyNewerRecursive(path_1.default.join(from, entry), path_1.default.join(to, entry));
        }
        return;
    }
    let existingMtime = 0;
    try {
        existingMtime = fs_1.default.statSync(to).mtimeMs;
    }
    catch {
        /* destination missing — copy */
    }
    if (stat.mtimeMs > existingMtime)
        fs_1.default.copyFileSync(from, to);
}
function migrateLegacyUserData() {
    try {
        const canonical = electron_1.app.getPath('userData');
        const legacy = path_1.default.join(electron_1.app.getPath('appData'), 'Electron');
        if (path_1.default.resolve(canonical).toLowerCase() === path_1.default.resolve(legacy).toLowerCase())
            return;
        // Only migrate if a fallback session actually ran VaultStudio there.
        if (!fs_1.default.existsSync(path_1.default.join(legacy, 'vaultstudio.json')))
            return;
        fs_1.default.mkdirSync(canonical, { recursive: true });
        for (const item of ['vaultstudio.json', 'license.json', 'chat-history.json', 'obs-config']) {
            const from = path_1.default.join(legacy, item);
            if (fs_1.default.existsSync(from))
                copyNewerRecursive(from, path_1.default.join(canonical, item));
        }
    }
    catch (e) {
        console.error('Legacy userData migration failed:', e);
    }
}
let mainWindow = null;
let viteServer = null;
function broadcast(channel, ...args) {
    for (const win of electron_1.BrowserWindow.getAllWindows()) {
        try {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send(channel, ...args);
            }
        }
        catch {
            /* window tearing down mid-send */
        }
    }
}
function wireServices() {
    obs_engine_1.obsEngine.on('status', (state) => broadcast('obs:status', state));
    obs_engine_1.obsEngine.on('event', (eventType, data) => {
        const eventMap = {
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
    obs_engine_1.obsEngine.on('audioMeters', (meters) => {
        broadcast('obs:audioMeters', meters);
    });
    platform_manager_1.platformManager.on('chat:message', (msg) => broadcast('chat:message', msg));
    platform_manager_1.platformManager.on('chat:refresh', (messages) => broadcast('chat:history', messages));
    platform_manager_1.platformManager.on('activity:event', (evt) => broadcast('activity:event', evt));
    platform_manager_1.platformManager.on('stats:update', (stats) => broadcast('stats:update', stats));
    platform_manager_1.platformManager.on('platforms:status', (statuses) => broadcast('platforms:status', statuses));
    platform_manager_1.platformManager.on('platform:error', (message) => broadcast('platform:error', message));
    stream_guard_1.streamGuard.on('guard:status', (status) => broadcast('guard:status', status));
    irl_ingest_1.irlIngest.on('irl:status', (status) => broadcast('irl:status', status));
    obs_engine_1.obsEngine.on('previewFrame', (frame) => broadcast('obs:previewFrame', frame));
    if (!store_1.store.hasImportedFromObs() && store_1.store.getTargets().length === 0) {
        const imported = (0, multistream_1.importTargetsFromObs)();
        if (imported.length > 0)
            store_1.store.saveTargets(imported);
        store_1.store.markImportedFromObs();
    }
    if (!store_1.store.hasSeededConnections() && store_1.store.getConnections().length === 0) {
        store_1.store.saveConnections([
            { platform: 'twitch', channel: 'vaultkeeperirl', enabled: true, dashboardEnabled: true },
            { platform: 'kick', channel: 'vaultkeeper', enabled: true, dashboardEnabled: true },
        ]);
        store_1.store.markSeededConnections();
    }
    {
        const conns = store_1.store.getConnections();
        const tw = conns.find((c) => c.platform === 'twitch');
        if (tw && tw.channel === 'vaultkeeperirl' && !tw.token) {
            tw.channel = 'deadbeatst';
            store_1.store.saveConnections(conns);
        }
    }
    stream_guard_1.streamGuard.init();
    platform_manager_1.platformManager.start();
    irl_ingest_1.irlIngest.init();
}
async function startVite() {
    const { createServer } = await import('vite');
    viteServer = (await createServer({
        server: { port: 5173, strictPort: true },
        configFile: path_1.default.join(__dirname, '..', 'vite.config.ts'),
    }));
    await viteServer.listen();
    console.log('Vite dev server running on http://localhost:5173');
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1600,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        title: 'VaultStudio',
        backgroundColor: '#0B0B0D',
        icon: path_1.default.join(__dirname, '..', 'Vault_Studio.png'),
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (viteServer) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '..', 'dist', 'index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
const gotLock = electron_1.app.requestSingleInstanceLock();
if (!gotLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    electron_1.app.whenReady().then(async () => {
        electron_1.Menu.setApplicationMenu(null);
        electron_1.session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
            callback(permission === 'media');
        });
        (0, ipc_1.registerIpcHandlers)();
        wireServices();
        obs_engine_1.obsEngine.startWorker().then((ok) => {
            if (ok) {
                obs_engine_1.obsEngine.init().then((initialized) => {
                    if (initialized) {
                        broadcast('obs:status', 'connected');
                    }
                });
            }
            else {
                broadcast('obs:status', 'disconnected');
            }
        });
        const isDev = !fs_1.default.existsSync(path_1.default.join(__dirname, '../dist/index.html'));
        if (isDev) {
            await startVite();
        }
        createWindow();
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}
electron_1.app.on('before-quit', () => {
    for (const win of electron_1.BrowserWindow.getAllWindows()) {
        try {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send('app:quitting');
            }
        }
        catch {
            /* window tearing down */
        }
    }
    obs_engine_1.obsEngine.stopVirtualCam().catch(() => { });
});
electron_1.app.on('window-all-closed', async () => {
    if (viteServer) {
        viteServer.close();
    }
    obs_engine_1.obsEngine.shutdown();
    platform_manager_1.platformManager.stop();
    irl_ingest_1.irlIngest.stop();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
