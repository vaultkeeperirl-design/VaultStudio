import { app, ipcMain } from 'electron';
import { obsEngine } from '../services/obs-engine';
import * as obs from '../services/obs-service';
import { streamGuard } from '../services/stream-guard';
import { syncDrawingOverlay, DRAWING_OVERLAY_SOURCE_NAME } from '../services/drawing-overlay';

type SceneLike = { sources?: { name?: string }[] };

/**
 * The drawing overlay is an internal, app-managed source. Keep it out of every
 * scene/source list the renderer sees so it never shows up in the Sources panel
 * (the drawing-overlay sync still calls obs.getScenes() directly and sees it).
 */
function hideDrawingOverlay<T extends SceneLike>(scenes: T[]): T[] {
  return scenes.map((scene) => ({
    ...scene,
    sources: (scene.sources ?? []).filter((source) => source?.name !== DRAWING_OVERLAY_SOURCE_NAME),
  } as T));
}

export function registerObsIpc() {
  ipcMain.handle('obs:getConnectionState', () => ({
    state: obsEngine.getState(),
    obsInstalled: true, // engine ships with the app — always installed
  }));

  ipcMain.handle('obs:getProfiles', async () => {
    try {
      return await obsEngine.getProfiles();
    } catch {
      return [];
    }
  });

  ipcMain.handle('obs:setProfile', async (_e, name: string) => {
    if (obsEngine.isInitialized()) {
      await obsEngine.setProfile(name);
      return true;
    }
    return false;
  });

  ipcMain.handle('obs:launchObs', () => obsEngine.init());

  ipcMain.handle('obs:stopEngine', () => {
    obsEngine.shutdown();
    return true;
  });

  ipcMain.handle('obs:getScenes', async () => {
    if (!obsEngine.isInitialized()) return [];
    try {
      return hideDrawingOverlay(await obs.getScenes());
    } catch {
      return [];
    }
  });

  ipcMain.handle('obs:createScene', (_e, name: string) => obs.createScene(name));
  ipcMain.handle('obs:deleteScene', (_e, id: string) => obs.deleteScene(id));
  ipcMain.handle('obs:switchScene', (_e, id: string) => obs.switchScene(id));
  ipcMain.handle('obs:renameScene', (_e, id: string, name: string) => obs.renameScene(id, name));
  ipcMain.handle('obs:duplicateScene', (_e, id: string) => obs.duplicateScene(id));
  ipcMain.handle('obs:setSceneIndex', (_e, id: string, index: number) => obs.setSceneIndex(id, index));
  ipcMain.handle('obs:renameSource', (_e, _sceneId: string, sourceName: string, name: string) =>
    obs.renameSource(sourceName, name)
  );
  ipcMain.handle('obs:moveSource', (_e, sceneId: string, sourceId: string, direction: 'up' | 'down') =>
    obs.moveSource(sceneId, Number(sourceId), direction)
  );
  ipcMain.handle('obs:setSourceIndex', (_e, sceneId: string, sourceId: string, index: number) =>
    obs.setSourceIndex(sceneId, Number(sourceId), index)
  );
  ipcMain.handle('obs:setSourceLocked', (_e, sceneId: string, sourceId: string, locked: boolean) =>
    obs.setSourceLocked(sceneId, Number(sourceId), locked)
  );
  ipcMain.handle('obs:setSourceTransform', (_e, sceneId: string, sourceId: string, transform: Record<string, unknown>) =>
    obs.setSourceTransform(sceneId, Number(sourceId), transform)
  );
  ipcMain.handle('obs:toggleVirtualCam', () => obs.toggleVirtualCam());
  ipcMain.handle('obs:clipReplay', () => obs.clipReplay());

  ipcMain.handle('obs:getSources', async (_e, sceneId: string) => {
    if (!obsEngine.isInitialized()) return [];
    try {
      const scenes = hideDrawingOverlay(await obs.getScenes());
      return scenes.find((s) => s?.id === sceneId)?.sources ?? [];
    } catch {
      return [];
    }
  });

  ipcMain.handle('obs:addSource', (_e, sceneId: string, type: string, settings: Record<string, unknown>) =>
    obs.addSource(sceneId, type, settings)
  );
  ipcMain.handle('obs:listSourceDevices', (_e, type: string) => obs.listSourceDevices(type));
  ipcMain.handle('obs:removeSource', (_e, sceneId: string, sourceId: string) =>
    obs.removeSource(sceneId, Number(sourceId))
  );
  ipcMain.handle('obs:setSourceVisible', (_e, sceneId: string, sourceId: string, visible: boolean) =>
    obs.setSourceVisible(sceneId, Number(sourceId), visible)
  );
  ipcMain.handle('obs:updateSourceSettings', (_e, sourceName: string, settings: Record<string, unknown>) =>
    obs.updateSourceSettings(sourceName, settings)
  );

  ipcMain.handle('obs:syncDrawingOverlay', async (_e, imageDataUrl: string, hasDrawing: boolean) => {
    if (!obsEngine.isInitialized()) return { ok: false, error: 'Streaming engine is not running' };
    try {
      const scenes = await obs.getScenes();
      await syncDrawingOverlay({
        imageDataUrl,
        hasDrawing: hasDrawing !== false,
        userDataDir: app.getPath('userData'),
        scenes,
        obsApi: {
          addSource: obs.addSource,
          moveSource: obs.moveSource,
          setSourceLocked: obs.setSourceLocked,
          removeSource: obs.removeSource,
          updateSourceSettings: obs.updateSourceSettings,
        },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle('obs:startStreaming', () => obs.startStreaming());

  ipcMain.handle('obs:stopStreaming', async () => {
    streamGuard.markExpectedStop();
    await obsEngine.stopStream();
  });

  ipcMain.handle('obs:startRecording', () => obs.startRecording());
  ipcMain.handle('obs:stopRecording', () => obsEngine.stopRecording());

  ipcMain.handle('obs:getOutputStats', async () => {
    if (!obsEngine.isInitialized()) {
      return {
        isStreaming: false,
        isRecording: false,
        virtualCamActive: false,
        replayActive: false,
        bitrateKbps: 0,
        droppedFrames: 0,
        totalFrames: 0,
        cpuUsage: 0,
        fps: 0,
        streamDuration: 0,
        recordDuration: 0,
        targets: [],
      };
    }
    return obs.getOutputStats();
  });

  ipcMain.handle('obs:getAvailableEncoders', async () => {
    if (!obsEngine.isInitialized()) return [];
    return obsEngine.getAvailableEncoders().catch(() => []);
  });

  ipcMain.handle('obs:getActiveEncoder', async () => {
    if (!obsEngine.isInitialized()) return null;
    return obsEngine.getActiveEncoder().catch(() => null);
  });

  ipcMain.handle('obs:getAudioSources', async () => {
    if (!obsEngine.isInitialized()) return [];
    try {
      const audioSources = await obs.getAudioSources();
      return audioSources.filter((s) => s?.name !== DRAWING_OVERLAY_SOURCE_NAME);
    } catch {
      return [];
    }
  });

  ipcMain.handle('obs:setVolume', (_e, sourceId: string, volume: number) => obs.setVolume(sourceId, volume));
  ipcMain.handle('obs:setMuted', (_e, sourceId: string, muted: boolean) => obs.setMuted(sourceId, muted));

  ipcMain.handle('obs:getSettings', async () => {
    try {
      return await obs.getObsSettings();
    } catch {
      return null;
    }
  });

  ipcMain.handle('obs:updateSettings', (_e, settings: Record<string, unknown>) => obs.updateObsSettings(settings));

  // Preview frames flow: native -> host -> engine ('previewFrame' event) ->
  // main.ts broadcast. Here we only manage the subscription.
  ipcMain.handle('preview:start', (_e, options?: { width?: number; height?: number; fps?: number }) =>
    obsEngine.startPreview(options)
  );
  ipcMain.handle('preview:stop', () => obsEngine.stopPreview());
}
