import { ipcMain, shell } from 'electron';
import { checkForUpdates } from '../services/update-service';

export function registerUpdateIpc() {
  ipcMain.handle('updates:check', async () => checkForUpdates());

  ipcMain.handle('updates:openDownload', async (_e, url: string) => {
    if (typeof url !== 'string') return { ok: false };
    // Only allow http(s); never let a crafted manifest open file:/javascript: URLs.
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false };
    } catch {
      return { ok: false };
    }
    await shell.openExternal(url);
    return { ok: true };
  });
}
