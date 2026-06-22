import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { store, type StreamTarget } from '../services/store';
import { applyTargets, importTargetsFromObs, PLATFORM_SERVERS } from '../services/multistream';
import { licenseService } from '../services/license-service';

export function registerTargetsIpc() {
  ipcMain.handle('targets:list', () => store.getTargets());

  ipcMain.handle('targets:platformServers', () => PLATFORM_SERVERS);

  ipcMain.handle('targets:add', (_e, target: Omit<StreamTarget, 'id'>) => {
    const targets = store.getTargets();
    if (!licenseService.canAddTarget(targets.length)) {
      const maxTargets = licenseService.getMaxTargets();
      return {
        error: `Free includes ${maxTargets} stream targets. Activate Lifetime Pro for unlimited stream targets.`,
      };
    }
    const newTarget: StreamTarget = { ...target, id: randomUUID() };
    targets.push(newTarget);
    store.saveTargets(targets);
    return newTarget;
  });

  ipcMain.handle('targets:update', (_e, target: StreamTarget) => {
    const targets = store.getTargets().map((t) => (t.id === target.id ? target : t));
    store.saveTargets(targets);
    return target;
  });

  ipcMain.handle('targets:remove', (_e, id: string) => {
    store.saveTargets(store.getTargets().filter((t) => t.id !== id));
  });

  ipcMain.handle('targets:import', () => {
    const imported = importTargetsFromObs();
    if (imported.length === 0) return store.getTargets();
    const existing = store.getTargets();
    const existingKeys = new Set(existing.map((t) => `${t.server}|${t.streamKey}`));
    for (const t of imported) {
      if (!existingKeys.has(`${t.server}|${t.streamKey}`) && licenseService.canAddTarget(existing.length)) {
        existing.push(t);
      }
    }
    store.saveTargets(existing);
    store.markImportedFromObs();
    return existing;
  });

  ipcMain.handle('targets:apply', () => applyTargets());
}
