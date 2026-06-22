import { ipcMain } from 'electron';
import { irlIngest } from '../services/irl-ingest';
import { obsEngine } from '../services/obs-engine';
import * as obs from '../services/obs-service';

export function registerIrlIpc() {
  ipcMain.handle('irl:get', () => ({
    config: irlIngest.getConfig(),
    status: irlIngest.getStatus(),
  }));

  ipcMain.handle('irl:update', async (_e, patch: Record<string, unknown>) => {
    const wasEnabled = irlIngest.getConfig().enabled;
    irlIngest.updateConfig(patch);

    // First time IRL ingest is switched on, scaffold the default fallback
    // scenes (if the engine is up) and point any unset scene names at them.
    if (patch.enabled === true && !wasEnabled && obsEngine.isInitialized()) {
      try {
        const result = await obs.setupIrlScenes();
        const current = irlIngest.getConfig();
        const wire: Record<string, unknown> = {};
        if (!current.brbSceneName) wire.brbSceneName = result.brbSceneName;
        if (!current.lowBitrateSceneName) wire.lowBitrateSceneName = result.lowBitrateSceneName;
        if (Object.keys(wire).length) irlIngest.updateConfig(wire);
      } catch {
        /* engine busy — the user can still use the "Set up IRL scenes" button */
      }
    }

    return { config: irlIngest.getConfig(), status: irlIngest.getStatus() };
  });

  // Explicit "Set up IRL scenes" action — creates the default scenes and wires
  // the BRB + Low Bitrate scene names to them.
  ipcMain.handle('irl:setupScenes', async () => {
    const result = await obs.setupIrlScenes();
    const config = irlIngest.updateConfig({
      brbSceneName: result.brbSceneName,
      lowBitrateSceneName: result.lowBitrateSceneName,
    });
    return {
      config,
      status: irlIngest.getStatus(),
      scenes: await obs.getScenes(),
      startingSoonSceneName: result.startingSoonSceneName,
    };
  });
}
