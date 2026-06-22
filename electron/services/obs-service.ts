/**
 * obs-service.ts - app-level policy on top of the native engine: which
 * targets go live, where recordings land, replay buffer flow, settings.
 */
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { obsEngine, type StreamTargetSpec } from './obs-engine';
import { store } from './store';
import { licenseService } from './license-service';
import { formatStreamBitrateWarning, planStreamBitrates } from './stream-budget';

export async function getScenes() {
  return obsEngine.getScenes();
}

export async function createScene(name: string) {
  return obsEngine.createScene(name);
}

export async function deleteScene(sceneName: string) {
  return obsEngine.deleteScene(sceneName);
}

export async function switchScene(sceneName: string) {
  return obsEngine.switchScene(sceneName);
}

export async function renameScene(sceneName: string, newSceneName: string) {
  return obsEngine.renameScene(sceneName, newSceneName);
}

export async function renameSource(inputName: string, newInputName: string) {
  return obsEngine.renameSource(inputName, newInputName);
}

export async function duplicateScene(sceneName: string) {
  return obsEngine.duplicateScene(sceneName);
}

export async function setSceneIndex(sceneName: string, newIndex: number) {
  return obsEngine.setSceneIndex(sceneName, newIndex);
}

export async function moveSource(sceneName: string, sceneItemId: number, direction: 'up' | 'down' | 'top' | 'bottom') {
  return obsEngine.moveSource(sceneName, sceneItemId, direction);
}

export async function setSourceIndex(sceneName: string, sceneItemId: number, uiIndex: number) {
  return obsEngine.setSourceIndex(sceneName, sceneItemId, uiIndex);
}

export async function setSourceLocked(sceneName: string, sceneItemId: number, locked: boolean) {
  return obsEngine.setSourceLocked(sceneName, sceneItemId, locked);
}

export async function setSourceTransform(sceneName: string, sceneItemId: number, transform: Record<string, unknown>) {
  return obsEngine.setSourceTransform(sceneName, sceneItemId, transform);
}

export async function addSource(sceneName: string, type: string, settings: Record<string, unknown>) {
  return obsEngine.addSource(sceneName, type, settings);
}

export async function listSourceDevices(type: string) {
  return obsEngine.listSourceDevices(type);
}

export async function removeSource(sceneName: string, sceneItemId: number) {
  return obsEngine.removeSource(sceneName, sceneItemId);
}

export async function setSourceVisible(sceneName: string, sceneItemId: number, visible: boolean) {
  return obsEngine.setSourceVisible(sceneName, sceneItemId, visible);
}

export async function updateSourceSettings(sourceName: string, settings: Record<string, unknown>) {
  return obsEngine.updateSourceSettings(sourceName, settings);
}

// --- IRL default scenes ---

const IRL_SCENE_DEFS = [
  { scene: 'Starting Soon', source: 'Starting Soon Screen', file: 'starting-soon.png' },
  { scene: 'Be Right Back', source: 'Be Right Back Screen', file: 'be-right-back.png' },
  { scene: 'Low Bitrate', source: 'Low Bitrate Screen', file: 'low-bitrate.png' },
] as const;

function sceneDefaultsSourceDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'scene-defaults');
  return path.join(__dirname, '..', '..', 'resources', 'scene-defaults');
}

/** Copy the bundled default screens into userData so the scene collection
 *  references a stable path that survives app updates. Returns dest paths. */
function ensureSceneDefaultImages(): Record<string, string> {
  const srcDir = sceneDefaultsSourceDir();
  const destDir = path.join(app.getPath('userData'), 'scene-defaults');
  try {
    fs.mkdirSync(destDir, { recursive: true });
  } catch {
    /* surfaced when the copy below fails */
  }
  const out: Record<string, string> = {};
  for (const def of IRL_SCENE_DEFS) {
    const src = path.join(srcDir, def.file);
    const dest = path.join(destDir, def.file);
    try {
      if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
    } catch {
      /* missing image — the scene is still created, just without the screen */
    }
    out[def.file] = dest;
  }
  return out;
}

/**
 * Create the default IRL fallback scenes — Starting Soon, Be Right Back, Low
 * Bitrate — each holding the matching bundled full-screen image. Scenes that
 * already exist are left untouched (idempotent / safe to re-run). Returns the
 * scene names so the caller can wire them into the IRL config.
 */
export async function setupIrlScenes(): Promise<{
  brbSceneName: string;
  lowBitrateSceneName: string;
  startingSoonSceneName: string;
}> {
  const images = ensureSceneDefaultImages();
  const existing = new Set((await obsEngine.getScenes()).map((s) => s.name));
  for (const def of IRL_SCENE_DEFS) {
    if (existing.has(def.scene)) continue;
    await obsEngine.createScene(def.scene);
    const imagePath = images[def.file];
    if (imagePath && fs.existsSync(imagePath)) {
      await obsEngine.addSource(def.scene, 'image', { name: def.source, file: imagePath }).catch(() => {});
    }
  }
  return {
    startingSoonSceneName: 'Starting Soon',
    brbSceneName: 'Be Right Back',
    lowBitrateSceneName: 'Low Bitrate',
  };
}

// --- Streaming ---

/** Enabled, fully-configured targets, capped by the license tier. */
export function getLiveTargets(): { targets: StreamTargetSpec[]; error?: string } {
  const all = store.getTargets().filter((t) => t.enabled && t.server && t.streamKey);
  if (all.length === 0) {
    return { targets: [], error: 'No stream targets configured. Add one under Targets.' };
  }
  const max = licenseService.getMaxTargets();
  const capped = all.slice(0, max);
  return {
    targets: capped.map((t) => ({ id: t.id, name: t.name, server: t.server, key: t.streamKey })),
    error:
      all.length > capped.length
        ? `Free includes ${max} stream targets - ${all.length - capped.length} skipped. Activate Lifetime Pro for unlimited stream targets.`
        : undefined,
  };
}

export async function startStreaming(): Promise<{ ok: boolean; started: number; warning?: string; error?: string }> {
  const { targets, error } = getLiveTargets();
  if (targets.length === 0) {
    return { ok: false, started: 0, error };
  }
  const settings = store.getSettings();
  const bitratePlan = planStreamBitrates({
    targetCount: targets.length,
    videoBitrateKbps: settings.videoBitrate || 6000,
    audioBitrateKbps: settings.audioBitrate || 160,
  });
  const warning = [error, formatStreamBitrateWarning(bitratePlan)].filter(Boolean).join(' ');
  try {
    const started = await obsEngine.startStream(targets, {
      videoBitrateKbps: bitratePlan.videoBitrateKbps,
      audioBitrateKbps: bitratePlan.audioBitrateKbps,
      encoder: settings.encoder || 'auto',
    });
    return { ok: true, started, warning: warning || undefined };
  } catch (e) {
    return { ok: false, started: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Recording ---

export function getRecordingDir(): string {
  const configured = store.getSettings().recordingPath;
  const dir = configured && configured.trim() ? configured : path.join(app.getPath('videos'), 'VaultStudio');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* fall through - recording start will surface the error */
  }
  return dir;
}

function timestampName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export async function startRecording(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const dir = getRecordingDir();
  const filePath = path.join(dir, `VaultStudio ${timestampName()}.mkv`);
  try {
    await obsEngine.startRecording(filePath);
    return { ok: true, path: filePath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Replay buffer ---

export async function clipReplay(): Promise<'started' | 'saved' | 'error'> {
  try {
    const stats = await obsEngine.getOutputStats();
    if (!stats.replayActive) {
      const ok = await obsEngine.startReplayBuffer(getRecordingDir(), 30);
      return ok ? 'started' : 'error';
    }
    const saved = await obsEngine.saveReplay();
    return saved ? 'saved' : 'error';
  } catch {
    return 'error';
  }
}

// --- Virtual camera ---

export async function toggleVirtualCam(): Promise<{ active: boolean; error?: string }> {
  try {
    const stats = await obsEngine.getOutputStats();
    if (stats.virtualCamActive) {
      await obsEngine.stopVirtualCam();
      return { active: false };
    }
    const result = await obsEngine.startVirtualCam();
    return { active: !!result.active, error: result.ok ? undefined : result.error };
  } catch (e) {
    return { active: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Audio ---

export async function getAudioSources() {
  return obsEngine.getAudioSources();
}

export async function setVolume(inputName: string, volumeMul: number) {
  return obsEngine.setVolume(inputName, volumeMul);
}

export async function setMuted(inputName: string, muted: boolean) {
  return obsEngine.setMuted(inputName, muted);
}

// --- Stats ---

export async function getOutputStats() {
  const stats = await obsEngine.getOutputStats();
  return {
    isStreaming: stats.isStreaming,
    isRecording: stats.isRecording,
    virtualCamActive: stats.virtualCamActive,
    replayActive: stats.replayActive,
    bitrateKbps: stats.bitrateKbps,
    droppedFrames: stats.droppedFrames,
    totalFrames: stats.totalFrames,
    cpuUsage: stats.cpuUsage,
    fps: Math.round(stats.fps * 10) / 10,
    streamDuration: stats.streamDuration,
    recordDuration: stats.recordDuration,
    targets: stats.targets.map((t) => ({
      platform: platformFromTarget(t.name),
      name: t.name,
      connected: t.connected,
      reconnecting: t.reconnecting,
      bitrateKbps: t.bitrateKbps,
      droppedFrames: t.droppedFrames,
    })),
  };
}

function platformFromTarget(name: string): string {
  const stored = store.getTargets().find((t) => t.name === name);
  return stored?.platform || 'custom';
}

// --- Settings ---

export async function getObsSettings() {
  const s = store.getSettings();
  const live = obsEngine.isInitialized() ? await obsEngine.getVideoSettings() : null;
  return {
    outputResolution: live ? `${live.outputWidth}x${live.outputHeight}` : s.outputResolution || '1920x1080',
    fps: live?.fps || s.fps || 60,
    videoBitrate: s.videoBitrate || 6000,
    encoder: s.encoder || 'auto',
    audioBitrate: s.audioBitrate || 160,
    recordingPath: getRecordingDir(),
  };
}

export async function updateObsSettings(patch: Record<string, unknown>) {
  const videoKeys: Record<string, true> = { outputResolution: true, fps: true, videoBitrate: true, encoder: true, audioBitrate: true };
  const settingsPatch: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    if (videoKeys[key] || key === 'recordingPath') settingsPatch[key] = patch[key];
  }
  if (Object.keys(settingsPatch).length > 0) {
    store.updateSettings(settingsPatch);
  }

  // Resolution/FPS apply live when nothing is rendering to outputs.
  if (obsEngine.isInitialized() && (patch.outputResolution || patch.fps)) {
    const stats = await obsEngine.getOutputStats();
    if (!stats.isStreaming && !stats.isRecording) {
      const s = store.getSettings();
      const [w, h] = (s.outputResolution || '1920x1080').split('x').map(Number);
      await obsEngine.setVideoSettings({ outputWidth: w, outputHeight: h, fps: s.fps }).catch(() => {});
    }
  }
}
