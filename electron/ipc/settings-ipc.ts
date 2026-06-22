import { ipcMain, shell } from 'electron';
import { store } from '../services/store';
import { obsEngine } from '../services/obs-engine';
import { getObsSettings, updateObsSettings } from '../services/obs-service';
import { streamGuard } from '../services/stream-guard';
import { getSettingsFromFiles } from './obs-file-fallback';

export function registerSettingsIpc() {
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (typeof url !== 'string') return;
    // Only allow http(s) — defend against javascript: / file: / data: URLs
    // crafted into chat messages.
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    } catch {
      return;
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('settings:get', async () => {
    const app = store.getSettings();
    let output;
    if (obsEngine.isInitialized()) {
      try {
        output = await getObsSettings();
      } catch {
        output = getSettingsFromFiles();
      }
    } else {
      output = getSettingsFromFiles();
    }
    const fileFallback = output as { recordingPath?: string };
    return {
      ...app,
      ...output,
      recordingPath: app.recordingPath || fileFallback.recordingPath || '',
      obsConnected: obsEngine.isInitialized(),
    };
  });

  ipcMain.handle('settings:update', async (_e, patch: Record<string, unknown>) => {
    const appKeys = ['streamTitle', 'streamCategory', 'goLiveNotification', 'recordingPath', 'chatPopout'] as const;
    const appPatch: Record<string, unknown> = {};
    for (const key of appKeys) {
      if (key in patch) appPatch[key] = patch[key];
    }
    if (Object.keys(appPatch).length > 0) {
      store.updateSettings(appPatch);
    }
    // Always persist output settings; live-apply is gated internally on the
    // engine being up, so changes made while it's down aren't lost.
    await updateObsSettings(patch);
  });

  ipcMain.handle('guard:get', () => ({ config: store.getGuard(), status: streamGuard.getStatus() }));
  ipcMain.handle('guard:update', (_e, patch: Record<string, unknown>) => {
    store.updateGuard(patch);
    return store.getGuard();
  });
}
