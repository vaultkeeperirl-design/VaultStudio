import { ipcMain, app, shell } from 'electron';
import { licenseService } from '../services/license-service';
import * as fs from 'fs';
import * as path from 'path';

type GiveawayKey = { key: string; signature: string; fullKey: string };

function loadGiveawayKeys(): GiveawayKey[] {
  const overridePath = process.env.VAULTSTUDIO_GIVEAWAY_KEYS_PATH;
  const candidates = [
    overridePath,
    !app.isPackaged ? path.join(app.getAppPath(), 'keys', 'giveaway-keys.json') : null,
    !app.isPackaged ? path.join(__dirname, '..', '..', 'keys', 'giveaway-keys.json') : null,
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      return JSON.parse(raw) as GiveawayKey[];
    } catch {
      /* try next */
    }
  }
  return [];
}

function findSignature(key: string): string | null {
  const normalized = key.trim().toUpperCase();
  const keys = loadGiveawayKeys();
  const entry = keys.find((k) => k.key.toUpperCase() === normalized);
  return entry?.signature ?? null;
}

export function registerLicenseIpc() {
  ipcMain.handle('license:getInfo', () => {
    return licenseService.getInfo();
  });

  ipcMain.handle('license:activate', (_e, key: string) => {
    const trimmed = key.trim();
    // Full key format "VS-PRO-....<dot>signature" carries its own signature —
    // works for purchased keys without any local database.
    const dotIndex = trimmed.indexOf('.');
    if (dotIndex > 0) {
      const bareKey = trimmed.slice(0, dotIndex);
      const signature = trimmed.slice(dotIndex + 1).trim();
      return licenseService.activate(bareKey, signature);
    }
    const signature = findSignature(trimmed);
    if (!signature) {
      return { ok: false, error: 'Key not found. Paste the full key (including the part after the dot) from your purchase email.' };
    }
    return licenseService.activate(trimmed, signature);
  });

  // Lifetime Pro checkout — opens the website's PayPal-backed buy page, which
  // verifies payment server-side and delivers a signed key instantly (emailed +
  // shown on the success page). Override the URL with VAULTSTUDIO_BUY_URL.
  ipcMain.handle('license:buyPro', () => {
    const url = process.env.VAULTSTUDIO_BUY_URL || 'https://vaultstudio-payments.vaultstudio.workers.dev/buy.html';
    void shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('license:deactivate', () => {
    licenseService.deactivate();
    return licenseService.getInfo();
  });
}
