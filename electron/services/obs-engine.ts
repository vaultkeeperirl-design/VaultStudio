/**
 * obs-engine.ts — TypeScript wrapper around the native libobs engine.
 *
 * The native addon runs in a CHILD PROCESS (vaultstudio-engine on Unix,
 * vaultstudio-engine.exe on Windows). This isolates libobs + CEF from
 * Electron's Chromium.
 */
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { app } from 'electron';
import { store } from './store';
import { uniqueSourceNameForType } from './source-utils';

const METER_POLL_MS = 150;
const DEFAULT_PREVIEW_OPTIONS = { width: 640, height: 360, fps: 30 };
const ADDON_FILENAME = 'vaultstudio-obs.node';
const ENGINE_BASENAME = 'vaultstudio-engine';

type SceneItem = {
  id: string;
  sceneItemId?: number;
  name: string;
  type: string;
  visible: boolean;
  locked?: boolean;
  transform?: { x: number; y: number; width: number; height: number; rotation?: number };
  settings: Record<string, unknown>;
};

type Scene = {
  id: string;
  name: string;
  isActive: boolean;
  sources: SceneItem[];
};

export type StreamTargetSpec = { id: string; name: string; server: string; key: string };

export type StreamSettingsSpec = {
  videoBitrateKbps?: number;
  audioBitrateKbps?: number;
  encoder?: 'auto' | 'nvenc' | 'x264';
};

export type SourceDeviceSpec = {
  name: string;
  value: string;
  disabled?: boolean;
};

export type TargetStats = {
  id: string;
  name: string;
  connected: boolean;
  reconnecting: boolean;
  totalBytes: number;
  droppedFrames: number;
  congestion: number;
  bitrateKbps: number;
};

export type OutputStatsRaw = {
  isStreaming: boolean;
  isRecording: boolean;
  virtualCamActive: boolean;
  replayActive: boolean;
  bitrateKbps: number;
  droppedFrames: number;
  totalFrames: number;
  totalBytes: number;
  cpuUsage: number;
  fps: number;
  streamDuration: number;
  recordDuration: number;
  targets: TargetStats[];
};

const SOURCE_KIND_MAP: Record<string, string> = {
  dshow_input: 'camera',
  av_capture_input: 'camera',
  v4l2_input: 'camera',
  'pipewire-camera-source': 'camera',
  browser_source: 'browser',
  image_source: 'image',
  slideshow: 'image',
  color_source: 'image',
  color_source_v3: 'image',
  ffmpeg_source: 'media',
  vlc_source: 'playlist',
  monitor_capture: 'display_capture',
  display_capture: 'display_capture',
  screen_capture: 'display_capture',
  xshm_input: 'display_capture',
  xshm_input_v2: 'display_capture',
  'pipewire-screen-capture-source': 'display_capture',
  'pipewire-desktop-capture-source': 'display_capture',
  game_capture: 'game_capture',
  window_capture: 'window_capture',
  xcomposite_input: 'window_capture',
  'pipewire-window-capture-source': 'window_capture',
  wasapi_input_capture: 'audio_input',
  wasapi_output_capture: 'audio_output',
  coreaudio_input_capture: 'audio_input',
  coreaudio_output_capture: 'audio_output',
  pulse_input_capture: 'audio_input',
  pulse_output_capture: 'audio_output',
  sck_audio_capture: 'audio_output',
  text_gdiplus: 'text',
  text_gdiplus_v2: 'text',
  text_gdiplus_v3: 'text',
  text_ft2_source: 'text',
  text_ft2_source_v2: 'text',
  scene: 'scene',
};

const COMMON_APP_TYPE_TO_KIND: Record<string, string> = {
  browser: 'browser_source',
  image: 'image_source',
  media: 'ffmpeg_source',
  video: 'ffmpeg_source',
  audio_track: 'ffmpeg_source',
  playlist: 'vlc_source',
};

const PLATFORM_APP_TYPE_TO_KIND: Partial<Record<NodeJS.Platform, Record<string, string>>> = {
  win32: {
    camera: 'dshow_input',
    display_capture: 'monitor_capture',
    game_capture: 'game_capture',
    window_capture: 'window_capture',
    audio_input: 'wasapi_input_capture',
    audio_output: 'wasapi_output_capture',
    text: 'text_gdiplus_v3',
  },
  darwin: {
    camera: 'av_capture_input',
    display_capture: 'display_capture',
    window_capture: 'window_capture',
    audio_input: 'coreaudio_input_capture',
    audio_output: 'coreaudio_output_capture',
    text: 'text_ft2_source',
  },
  linux: {
    camera: 'v4l2_input',
    display_capture: 'pipewire-screen-capture-source',
    window_capture: 'pipewire-window-capture-source',
    audio_input: 'pulse_input_capture',
    audio_output: 'pulse_output_capture',
    text: 'text_ft2_source',
  },
};

export function getAppTypeToKindMapForPlatform(platform: NodeJS.Platform): Record<string, string> {
  return {
    ...COMMON_APP_TYPE_TO_KIND,
    ...(PLATFORM_APP_TYPE_TO_KIND[platform] || PLATFORM_APP_TYPE_TO_KIND.win32),
  };
}

export function getAppTypeToKindForPlatform(platform: NodeJS.Platform, type: string): string {
  return getAppTypeToKindMapForPlatform(platform)[type] || 'browser_source';
}

export function getSourceDevicePropertyForPlatform(platform: NodeJS.Platform, type: string): string {
  if (type === 'camera') {
    if (platform === 'win32') return 'video_device_id';
    if (platform === 'darwin') return 'device';
    return 'device_id';
  }
  if (type === 'display_capture') {
    if (platform === 'win32') return 'monitor_id';
    if (platform === 'darwin') return 'display_uuid';
    return '';
  }
  if (type === 'window_capture') return 'window';
  return 'device_id';
}

export const APP_TYPE_TO_KIND = getAppTypeToKindMapForPlatform(process.platform);

export function mapSourceKind(obsKind: string): string {
  return SOURCE_KIND_MAP[obsKind] || (obsKind === 'scene' ? 'scene' : 'browser');
}

/** libobs uses forward slashes for file paths on every platform. */
function toObsPath(p: string): string {
  return p ? p.replace(/\\/g, '/') : p;
}

export function buildSourceSettingsForPlatform(
  platform: NodeJS.Platform,
  type: string,
  settings: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'browser':
      return {
        url: (settings.url as string) || 'https://obsproject.com/browser-source',
        width: Number(settings.width) || 1920,
        height: Number(settings.height) || 1080,
        fps: 30,
      };
    case 'image':
      return { file: toObsPath((settings.file as string) || (settings.url as string) || ''), unload: false };
    case 'media': {
      const raw = (settings.file as string) || (settings.url as string) || '';
      if (/^(rtmp|rtmps|srt|rist|http|https|udp|tcp):\/\//i.test(raw)) {
        return {
          input: raw,
          is_local_file: false,
          buffering_mb: 1,
          reconnect_delay_sec: 1,
          restart_on_activate: false,
          clear_on_media_end: false,
        };
      }
      return {
        local_file: toObsPath(raw),
        is_local_file: true,
        looping: settings.looping !== false,
      };
    }
    case 'video': {
      const raw = (settings.file as string) || (settings.url as string) || '';
      return {
        local_file: toObsPath(raw),
        is_local_file: true,
        looping: settings.looping === true,
        restart_on_activate: true,
        clear_on_media_end: false,
        hw_decode: true,
      };
    }
    case 'audio_track': {
      const raw = (settings.file as string) || (settings.url as string) || '';
      return {
        local_file: toObsPath(raw),
        is_local_file: true,
        looping: settings.looping !== false,
        restart_on_activate: true,
        clear_on_media_end: false,
      };
    }
    case 'playlist': {
      const files = Array.isArray(settings.files) ? (settings.files as string[]) : [];
      return {
        playlist: files
          .filter((f) => typeof f === 'string' && f.trim())
          .map((f) => ({ value: toObsPath(f), hidden: false, selected: false })),
        loop: settings.looping !== false,
        shuffle: settings.shuffle === true,
        playback_behavior: 'stop_restart',
        network_caching: 400,
        track: 1,
        subtitle_enable: false,
        subtitle: 1,
      };
    }
    case 'camera': {
      const propertyName = getSourceDevicePropertyForPlatform(platform, 'camera');
      return {
        ...(settings.deviceId ? { [propertyName]: settings.deviceId } : {}),
        hw_decode: true,
        buffering: false,
      };
    }
    case 'display_capture':
      if (platform === 'win32') return { monitor_id: (settings.monitorId as string) || '', active: true };
      if (platform === 'darwin') return { display_uuid: (settings.monitorId as string) || '', active: true };
      return { active: true };
    case 'window_capture':
      return { window: (settings.windowId as string) || (settings.window as string) || '' };
    case 'game_capture':
      return { capture_mode: 'any_fullscreen' };
    case 'audio_input':
    case 'audio_output':
      return { device_id: (settings.deviceId as string) || 'default' };
    case 'text':
      return { text: (settings.text as string) || 'Text' };
    default:
      return settings;
  }
}

class ObsEngine extends EventEmitter {
  private worker: ChildProcess | null = null;
  private callId = 0;
  private pendingCalls = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private initialized = false;
  private available = false;
  private workerReady = false;
  private intentionalStop = false;
  private previewSubscribers = 0;
  private meterTimer: NodeJS.Timeout | null = null;
  private logStream: fs.WriteStream | null = null;

  getRuntimeDir(): string {
    const runtimeResource = process.platform === 'win32' ? 'obs-runtime' : path.join('vss-runtime', process.platform);
    if (app.isPackaged) {
      return path.join(process.resourcesPath, runtimeResource);
    }
    return path.join(__dirname, '..', '..', 'native', runtimeResource);
  }

  getConfigDir(): string {
    return path.join(app.getPath('userData'), 'obs-config');
  }

  private getRuntimeBinDir(): string {
    const runtimeDir = this.getRuntimeDir();
    if (process.platform === 'win32') {
      return path.join(runtimeDir, 'bin', '64bit');
    }
    return path.join(runtimeDir, 'bin');
  }

  private getAddonPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'obs-addon', ADDON_FILENAME);
    }
    const addonRoot = path.join(__dirname, '..', '..', 'native', 'addon');
    const candidates = [
      path.join(addonRoot, 'build-v1', 'Release', ADDON_FILENAME),
      path.join(addonRoot, 'build-v1', ADDON_FILENAME),
      path.join(addonRoot, 'build', 'Release', ADDON_FILENAME),
      path.join(addonRoot, 'build', ADDON_FILENAME),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  }

  private log(line: string) {
    if (!this.logStream) {
      try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        fs.mkdirSync(logDir, { recursive: true });
        this.logStream = fs.createWriteStream(path.join(logDir, 'obs-engine.log'), { flags: 'a' });
      } catch {
        /* log file unavailable — console only */
      }
    }
    const stamped = `[${new Date().toISOString()}] ${line}`;
    this.logStream?.write(stamped + '\n');
    if (process.env.NODE_ENV !== 'production') console.log('[obs-engine]', line);
  }

  private getEnginePath(): string {
    const filename = process.platform === 'win32' ? `${ENGINE_BASENAME}.exe` : ENGINE_BASENAME;
    return path.join(this.getRuntimeBinDir(), filename);
  }

  private getHostScriptPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'obs-addon', 'obs-addon-host.js');
    }
    return path.join(__dirname, 'obs-addon-host.js');
  }

  isAvailable(): boolean {
    return this.available;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getState(): 'connected' | 'connecting' | 'disconnected' | 'obs-not-running' {
    if (this.initialized) return 'connected';
    if (this.workerReady) return 'connecting';
    return 'disconnected';
  }

  /** Spawn the engine child process and wait for it to be ready. */
  startWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.workerReady && this.worker) {
        resolve(true);
        return;
      }
      try {
        const enginePath = this.getEnginePath();
        const addonPath = this.getAddonPath();
        const runtimeDir = this.getRuntimeDir();
        const runtimeBinDir = this.getRuntimeBinDir();
        const hostScript = this.getHostScriptPath();

        const missing = [
          ['VSS runtime directory', runtimeDir],
          ['VSS engine binary', enginePath],
          ['VSS native addon', addonPath],
          ['VSS addon host', hostScript],
        ].filter(([, filePath]) => !fs.existsSync(filePath));
        if (missing.length > 0) {
          for (const [label, filePath] of missing) {
            this.log(`${label} missing for ${process.platform}: ${filePath}`);
          }
          this.available = false;
          this.workerReady = false;
          resolve(false);
          return;
        }

        this.log(`spawning engine: ${enginePath}`);
        // The engine is a console-subsystem Node binary. In the packaged app the
        // Electron process owns no console, so inheriting stdio makes Windows
        // pop a visible "vaultstudio-engine.exe" console window. Hide it: in
        // production discard/forward the child's stdio to the engine log and set
        // windowsHide; in dev keep inherit so logs stay in the terminal.
        this.worker = spawn(enginePath, [hostScript], {
          env: {
            ...process.env,
            VS_ADDON_PATH: addonPath,
            VS_RUNTIME_DIR: runtimeDir,
            VS_RUNTIME_BIN: runtimeBinDir,
          },
          stdio: app.isPackaged
            ? ['ignore', 'pipe', 'pipe', 'ipc']
            : ['inherit', 'inherit', 'inherit', 'ipc'],
          serialization: 'advanced',
          windowsHide: process.platform === 'win32',
        });
        if (app.isPackaged) {
          const toLog = (chunk: Buffer) => {
            try {
              this.logStream?.write(chunk);
            } catch {
              /* log file unavailable */
            }
          };
          this.worker.stdout?.on('data', toLog);
          this.worker.stderr?.on('data', toLog);
        }

        const onMessage = (msg: any) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'host:ready' || msg.type === 'addon:loaded') {
            this.workerReady = true;
            this.available = true;
            this.log('engine ready');
            resolve(true);
          } else if (msg.type === 'addon:error') {
            this.log(`addon error: ${msg.error}`);
            this.available = false;
            this.workerReady = false;
            resolve(false);
          } else if (msg.type === 'event') {
            this.handleEvent(msg.eventName, msg.data);
          } else if (msg.type === 'previewFrame') {
            this.emit('previewFrame', {
              mime: msg.mime || 'image/jpeg',
              width: msg.width,
              height: msg.height,
              data: Buffer.from(msg.data),
            });
          } else if (msg.id !== undefined) {
            const pending = this.pendingCalls.get(msg.id);
            if (pending) {
              this.pendingCalls.delete(msg.id);
              if (msg.error) pending.reject(new Error(msg.error));
              else pending.resolve(msg.result);
            }
          }
        };

        this.worker.on('message', onMessage);

        this.worker.on('exit', (code, signal) => {
          this.log(`engine exited: code=${code} signal=${signal}`);
          this.workerReady = false;
          this.available = false;
          this.initialized = false;
          for (const [, pending] of this.pendingCalls) {
            pending.reject(new Error('Engine process exited'));
          }
          this.pendingCalls.clear();
          if (!this.intentionalStop) {
            this.emit('status', 'disconnected');
          }
        });

        this.worker.on('error', (err) => {
          this.log(`engine spawn error: ${err.message}`);
          this.available = false;
          this.workerReady = false;
          resolve(false);
        });
      } catch (e) {
        this.log(`failed to spawn engine: ${(e as Error).message}`);
        resolve(false);
      }
    });
  }

  private call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this.workerReady) {
        reject(new Error('VSS engine not running'));
        return;
      }
      const id = ++this.callId;
      this.pendingCalls.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.send({ id, method, args }, (err: Error | null) => {
        if (err) {
          this.pendingCalls.delete(id);
          reject(new Error(`IPC send failed: ${err.message}`));
        }
      });
    });
  }

  private handleEvent(eventName: string, data: Record<string, unknown>) {
    this.emit('event', eventName, data);
    this.emit(`event:${eventName}`, data);
  }

  async init(): Promise<boolean> {
    if (this.initialized) return true;
    if (!this.workerReady) {
      const ok = await this.startWorker();
      if (!ok) return false;
    }
    this.emit('status', 'connecting');
    try {
      const settings = store.getSettings();
      const [outW, outH] = (settings.outputResolution || '1920x1080').split('x').map(Number);
      const ok = await this.call<boolean>('initObs', {
        runtimeDir: this.getRuntimeDir(),
        configDir: this.getConfigDir(),
        baseWidth: 1920,
        baseHeight: 1080,
        outputWidth: outW || 1920,
        outputHeight: outH || 1080,
        fps: settings.fps || 60,
      });
      if (ok) {
        this.initialized = true;
        this.startMeterPolling();
        this.emit('status', 'connected');
      }
      return ok;
    } catch (e) {
      this.log(`init failed: ${(e as Error).message}`);
      return false;
    }
  }

  shutdown(): void {
    if (!this.workerReady) return;
    this.intentionalStop = true;
    this.stopMeterPolling();
    this.call('shutdownObs').catch(() => {});
    this.initialized = false;
    this.emit('status', 'disconnected');
  }

  stopWorker(): void {
    this.intentionalStop = true;
    this.shutdown();
    this.workerReady = false;
    this.available = false;
    this.initialized = false;
    this.stopMeterPolling();
    if (this.worker) {
      try { this.worker.kill(); } catch { /* best-effort */ }
      this.worker = null;
    }
  }

  // --- Audio meters ---

  private startMeterPolling() {
    if (this.meterTimer) return;
    this.meterTimer = setInterval(async () => {
      try {
        const levels = await this.call<{ name: string; level: number }[]>('getAudioLevels');
        if (levels && levels.length > 0) {
          this.emit(
            'audioMeters',
            levels.map((l) => ({ id: l.name, level: l.level }))
          );
        }
      } catch {
        /* engine busy or restarting */
      }
    }, METER_POLL_MS);
  }

  private stopMeterPolling() {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  // --- Profiles ---

  async getProfiles(): Promise<{ name: string; path: string }[]> {
    return (await this.call<{ name: string; path: string }[]>('getProfiles')) || [];
  }

  async setProfile(name: string): Promise<void> {
    await this.call('setProfile', name);
  }

  // --- Scenes ---

  async getScenes(): Promise<Scene[]> {
    const raw =
      (await this.call<{ name: string; isActive: boolean; sources: { id: string; name: string; visible: boolean; locked?: boolean; type: string; transform?: { x: number; y: number; width: number; height: number; rotation?: number } }[] }[]>('getScenes')) || [];
    return raw.map((s) => ({
      id: s.name,
      name: s.name,
      isActive: s.isActive,
      // libobs lists items bottom-up; the UI wants top-most first.
      sources: [...s.sources].reverse().map((item) => ({
        id: item.id,
        sceneItemId: parseInt(item.id, 10),
        name: item.name,
        type: mapSourceKind(item.type),
        visible: item.visible,
        locked: !!item.locked,
        transform: item.transform,
        settings: {},
      })),
    }));
  }

  async createScene(name: string): Promise<Scene> {
    const raw = await this.call<{ name: string }>('createScene', name);
    return { id: raw.name, name: raw.name, isActive: false, sources: [] };
  }

  async deleteScene(sceneName: string): Promise<void> {
    await this.call('removeScene', sceneName);
  }

  async switchScene(sceneName: string): Promise<void> {
    await this.call('setCurrentScene', sceneName);
  }

  async renameScene(sceneName: string, newSceneName: string): Promise<void> {
    await this.call('renameScene', sceneName, newSceneName);
  }

  async duplicateScene(sceneName: string): Promise<string> {
    return await this.call<string>('duplicateScene', sceneName);
  }

  async setSceneIndex(sceneName: string, newIndex: number): Promise<void> {
    await this.call('setSceneIndex', sceneName, newIndex);
  }

  async renameSource(inputName: string, newInputName: string): Promise<void> {
    await this.call('renameSource', inputName, newInputName);
  }

  async moveSource(sceneName: string, sceneItemId: number, direction: 'up' | 'down' | 'top' | 'bottom'): Promise<void> {
    // UI "up" = toward the top of the list = front of z-order.
    await this.call('setSourceOrder', sceneName, sceneItemId, direction);
  }

  async setSourceIndex(sceneName: string, sceneItemId: number, uiIndex: number): Promise<void> {
    await this.call('setSourceIndex', sceneName, sceneItemId, uiIndex);
  }

  async setSourceLocked(sceneName: string, sceneItemId: number, locked: boolean): Promise<void> {
    await this.call('setSourceLocked', sceneName, sceneItemId, locked);
  }

  async setSourceTransform(
    sceneName: string,
    sceneItemId: number,
    transform: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>
  ): Promise<void> {
    await this.call('setSourceTransform', sceneName, sceneItemId, transform);
  }

  // --- Sources ---

  async addSource(sceneName: string, type: string, settings: Record<string, unknown>): Promise<SceneItem> {
    const kind = getAppTypeToKindForPlatform(process.platform, type);
    const requestedName = (settings.name as string) || this.defaultSourceName(type);
    const scenes = await this.getScenes().catch(() => []);
    // File-backed sources are distinct per file — never silently reuse an
    // existing same-named source; give each its own (suffixed) name instead.
    const FILE_BACKED = new Set(['image', 'media', 'video', 'audio_track', 'playlist']);
    const name = uniqueSourceNameForType(requestedName, type, scenes, {
      reuseSameType: !FILE_BACKED.has(type),
    });
    const obsSettings = this.buildSourceSettings(type, settings);
    const raw = await this.call<{ id: string; name: string; type: string }>(
      'createSource',
      sceneName,
      name,
      kind,
      JSON.stringify(obsSettings)
    );
    return {
      id: raw.id,
      sceneItemId: parseInt(raw.id, 10),
      name: raw.name,
      type,
      visible: true,
      settings,
    };
  }

  private deviceListCache = new Map<string, { at: number; devices: SourceDeviceSpec[] }>();

  async listSourceDevices(type: string): Promise<SourceDeviceSpec[]> {
    // Enumerating DirectShow devices instantiates every camera driver on the
    // system (NVIDIA Broadcast, virtual cams, ...). The UI refreshes after
    // every scene mutation, so cache briefly to avoid hammering drivers.
    const cached = this.deviceListCache.get(type);
    if (cached && Date.now() - cached.at < 15000) return cached.devices;

    const kind = getAppTypeToKindForPlatform(process.platform, type);
    const propertyName = getSourceDevicePropertyForPlatform(process.platform, type);
    const devices = await this.call<SourceDeviceSpec[]>('listSourceDevices', kind, propertyName);
    this.deviceListCache.set(type, { at: Date.now(), devices });
    return devices;
  }

  private defaultSourceName(type: string): string {
    const labels: Record<string, string> = {
      camera: 'Camera',
      browser: 'Browser',
      image: 'Image',
      media: 'Media',
      video: 'Video',
      audio_track: 'Audio Track',
      playlist: 'Playlist',
      display_capture: 'Display Capture',
      game_capture: 'Game Capture',
      window_capture: 'Window Capture',
      audio_input: 'Mic/Aux',
      audio_output: 'Desktop Audio',
      text: 'Text',
    };
    const base = labels[type] || 'Source';
    return `${base} ${new Date().toLocaleTimeString([], { hour12: false })}`;
  }

  private buildSourceSettings(type: string, settings: Record<string, unknown>): Record<string, unknown> {
    return buildSourceSettingsForPlatform(process.platform, type, settings);
  }

  private buildLegacySourceSettings(type: string, settings: Record<string, unknown>): Record<string, unknown> {
    switch (type) {
      case 'browser':
        return {
          url: (settings.url as string) || 'https://obsproject.com/browser-source',
          width: Number(settings.width) || 1920,
          height: Number(settings.height) || 1080,
          fps: 30,
        };
      case 'image':
        // libobs stores paths with forward slashes (see the bundled scene
        // collections); a backslashed Windows path round-tripped through JSON
        // can fail to load, leaving the image invisible. unload:false keeps the
        // texture resident so it renders immediately.
        return { file: toObsPath((settings.file as string) || (settings.url as string) || ''), unload: false };
      case 'media': {
        const raw = (settings.file as string) || (settings.url as string) || '';
        // Network feeds (the IRL phone ingest, SRT/RTMP pulls, HTTP streams)
        // use the ffmpeg "input" path with low-latency buffering.
        if (/^(rtmp|rtmps|srt|rist|http|https|udp|tcp):\/\//i.test(raw)) {
          return {
            input: raw,
            is_local_file: false,
            buffering_mb: 1,
            reconnect_delay_sec: 1,
            restart_on_activate: false,
            clear_on_media_end: false,
          };
        }
        return {
          local_file: toObsPath(raw),
          is_local_file: true,
          looping: settings.looping !== false,
        };
      }
      case 'video': {
        // A local video clip (ffmpeg_source). It only renders/plays while its
        // scene is active (libobs deactivates non-shown sources), so it is
        // naturally scene-local. restart_on_activate replays from the top each
        // time it is shown. Clips default to play-once (no loop).
        const raw = (settings.file as string) || (settings.url as string) || '';
        return {
          local_file: toObsPath(raw),
          is_local_file: true,
          looping: settings.looping === true,
          restart_on_activate: true,
          clear_on_media_end: false,
          hw_decode: true,
        };
      }
      case 'audio_track': {
        // An audio file (ffmpeg_source). Added as a scene item it only outputs
        // audio while its scene is active — i.e. background music/SFX scoped to
        // the scene it lives on. Loops by default so it fills the scene.
        const raw = (settings.file as string) || (settings.url as string) || '';
        return {
          local_file: toObsPath(raw),
          is_local_file: true,
          looping: settings.looping !== false,
          restart_on_activate: true,
          clear_on_media_end: false,
        };
      }
      case 'playlist': {
        // VLC Video Source — plays a list of media files in order. Like every
        // scene item it is active only while its scene is shown.
        const files = Array.isArray(settings.files) ? (settings.files as string[]) : [];
        return {
          playlist: files
            .filter((f) => typeof f === 'string' && f.trim())
            .map((f) => ({ value: toObsPath(f), hidden: false, selected: false })),
          loop: settings.looping !== false,
          shuffle: settings.shuffle === true,
          playback_behavior: 'stop_restart',
          network_caching: 400,
          track: 1,
          subtitle_enable: false,
          subtitle: 1,
        };
      }
      case 'camera':
        // hw_decode: MJPEG/H264 webcams (1080p60) routinely fail software
        // decode ("Error decoding video"); GPU decode is the OBS-recommended
        // path and falls back to software when unavailable.
        return {
          ...(settings.deviceId ? { video_device_id: settings.deviceId } : {}),
          hw_decode: true,
          buffering: false,
        };
      case 'display_capture':
        return { monitor_id: (settings.monitorId as string) || '', active: true };
      case 'window_capture':
        return { window: (settings.windowId as string) || (settings.window as string) || '' };
      case 'game_capture':
        return { capture_mode: 'any_fullscreen' };
      case 'audio_input':
      case 'audio_output':
        return { device_id: (settings.deviceId as string) || 'default' };
      case 'text':
        return { text: (settings.text as string) || 'Text' };
      default:
        return settings;
    }
  }

  async removeSource(sceneName: string, sceneItemId: number): Promise<void> {
    await this.call('removeSource', sceneName, sceneItemId);
  }

  async setSourceVisible(sceneName: string, sceneItemId: number, visible: boolean): Promise<void> {
    await this.call('setSourceVisible', sceneName, sceneItemId, visible);
  }

  async updateSourceSettings(sourceName: string, settings: Record<string, unknown>): Promise<boolean> {
    return await this.call<boolean>('updateSourceSettings', sourceName, JSON.stringify(settings));
  }

  async getSourceSettings(sourceName: string): Promise<Record<string, unknown> | null> {
    const json = await this.call<string | null>('getSourceSettings', sourceName);
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // --- Output ---

  async startStream(targets: StreamTargetSpec[], settings?: StreamSettingsSpec): Promise<number> {
    return await this.call<number>('startStream', targets, settings || {});
  }

  async stopStream(): Promise<void> {
    await this.call('stopStream');
  }

  async startRecording(filePath: string): Promise<void> {
    await this.call('startRecording', { path: filePath });
  }

  async stopRecording(): Promise<void> {
    await this.call('stopRecording');
  }

  async startReplayBuffer(directory: string, seconds = 30): Promise<boolean> {
    return await this.call<boolean>('startReplayBuffer', { directory, seconds });
  }

  async saveReplay(): Promise<boolean> {
    return await this.call<boolean>('saveReplay');
  }

  async startVirtualCam(): Promise<{ ok: boolean; active?: boolean; error?: string }> {
    return await this.call<{ ok: boolean; active?: boolean; error?: string }>('startVirtualCam');
  }

  async stopVirtualCam(): Promise<void> {
    await this.call('stopVirtualCam');
  }

  async getOutputStats(): Promise<OutputStatsRaw> {
    const defaults: OutputStatsRaw = {
      isStreaming: false,
      isRecording: false,
      virtualCamActive: false,
      replayActive: false,
      bitrateKbps: 0,
      droppedFrames: 0,
      totalFrames: 0,
      totalBytes: 0,
      cpuUsage: 0,
      fps: 0,
      streamDuration: 0,
      recordDuration: 0,
      targets: [],
    };
    try {
      const raw = await this.call<Partial<OutputStatsRaw>>('getOutputStats');
      // The child process host (obs-addon-host.js) already applies the
      // stream-stats decorator (including CPU usage of the engine process).
      return { ...defaults, ...raw, targets: (raw.targets as TargetStats[]) || [] };
    } catch {
      return defaults;
    }
  }

  async getAvailableEncoders(): Promise<string[]> {
    try {
      return (await this.call<string[]>('getAvailableEncoders')) || [];
    } catch {
      return [];
    }
  }

  async getActiveEncoder(): Promise<string | null> {
    try {
      return (await this.call<string | null>('getActiveEncoder')) || null;
    } catch {
      return null;
    }
  }

  // --- Video settings ---

  async getVideoSettings(): Promise<{ baseWidth: number; baseHeight: number; outputWidth: number; outputHeight: number; fps: number } | null> {
    try {
      const v = await this.call<{ baseWidth?: number }>('getVideoSettings');
      return v && v.baseWidth ? (v as { baseWidth: number; baseHeight: number; outputWidth: number; outputHeight: number; fps: number }) : null;
    } catch {
      return null;
    }
  }

  async setVideoSettings(opts: { outputWidth?: number; outputHeight?: number; fps?: number }): Promise<boolean> {
    return await this.call<boolean>('setVideoSettings', opts);
  }

  // --- Audio ---

  async getAudioSources(): Promise<{ id: string; name: string; volume: number; muted: boolean; meterLevel: number; kind: string }[]> {
    const raw =
      (await this.call<{ name: string; kind: string; volume: number; muted: boolean; level: number }[]>('getAudioSources')) || [];
    // The mixer shows capture devices and media-style sources, not every
    // browser overlay (those are listed but collapsed by the UI if needed).
    return raw.map((s) => ({
      id: s.name,
      name: s.name,
      volume: s.volume,
      muted: s.muted,
      meterLevel: s.level,
      kind: s.kind,
    }));
  }

  async setVolume(inputName: string, volumeMul: number): Promise<void> {
    await this.call('setVolume', inputName, Math.max(0, Math.min(1, volumeMul)));
  }

  async setMuted(inputName: string, muted: boolean): Promise<void> {
    await this.call('setMuted', inputName, muted);
  }

  // --- Preview ---

  async startPreview(options: Partial<typeof DEFAULT_PREVIEW_OPTIONS> = {}): Promise<void> {
    this.previewSubscribers++;
    if (this.previewSubscribers === 1) {
      const previewOptions = {
        width: options.width || DEFAULT_PREVIEW_OPTIONS.width,
        height: options.height || DEFAULT_PREVIEW_OPTIONS.height,
        fps: options.fps || DEFAULT_PREVIEW_OPTIONS.fps,
      };
      // The child process host registers the frame callback and sends
      // 'previewFrame' messages, which the engine's message handler emits
      // as 'previewFrame' events. No in-process callback needed.
      await this.call('startPreview', previewOptions);
    }
  }

  async stopPreview(): Promise<void> {
    this.previewSubscribers = Math.max(0, this.previewSubscribers - 1);
    if (this.previewSubscribers === 0) {
      await this.call('stopPreview').catch(() => {});
    }
  }
}

export const obsEngine = new ObsEngine();
