export type Platform = 'twitch' | 'kick' | 'youtube' | 'tiktok';

export type ObsConnectionState = 'connected' | 'connecting' | 'disconnected' | 'obs-not-running';

export type Scene = {
  id: string;
  name: string;
  sources: Source[];
  isActive: boolean;
};

export type SourceType =
  | 'camera'
  | 'browser'
  | 'image'
  | 'media'
  | 'video'
  | 'audio_track'
  | 'playlist'
  | 'display_capture'
  | 'game_capture'
  | 'window_capture'
  | 'audio_input'
  | 'audio_output'
  | 'text';

export type Source = {
  id: string;
  sceneItemId?: number;
  name: string;
  type: SourceType | 'scene';
  visible: boolean;
  locked?: boolean;
  transform?: SourceTransform;
  settings: Record<string, unknown>;
};

export type SourceTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type DrawingOverlaySnapshot = {
  imageDataUrl: string;
  hasDrawing: boolean;
};

export type SourceDevice = {
  name: string;
  value: string;
  disabled?: boolean;
};

export type AudioSource = {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  meterLevel: number;
  kind?: string;
};

export type StartStreamResult = {
  ok: boolean;
  started: number;
  warning?: string;
  error?: string;
};

export type StartRecordingResult = {
  ok: boolean;
  path?: string;
  error?: string;
};

export type VirtualCamResult = {
  active: boolean;
  error?: string;
};

export type OutputStats = {
  isStreaming: boolean;
  isRecording: boolean;
  virtualCamActive?: boolean;
  replayActive?: boolean;
  bitrateKbps: number;
  droppedFrames: number;
  totalFrames: number;
  cpuUsage: number;
  fps: number;
  streamDuration: number;
  recordDuration?: number;
  targets: {
    platform: string;
    name?: string;
    connected: boolean;
    reconnecting?: boolean;
    bitrateKbps: number;
    droppedFrames: number;
  }[];
};

export type PreviewRequestOptions = {
  width: number;
  height: number;
  fps: number;
};

export type ObsSettings = {
  outputResolution: string;
  fps: number;
  videoBitrate: number;
  encoder: string;
  audioBitrate: number;
};

export type StreamTargetPlatform = 'twitch' | 'kick' | 'youtube' | 'custom';

export type StreamTarget = {
  id: string;
  name: string;
  platform: StreamTargetPlatform;
  server: string;
  streamKey: string;
  enabled: boolean;
};

export type PlatformConnectionInfo = {
  platform: Platform;
  channel: string;
  username?: string;
  hasToken: boolean;
  enabled: boolean;
  dashboardEnabled: boolean;
};

export type PlatformStatus = {
  platform: string;
  channel: string;
  chatConnected: boolean;
  canSend: boolean;
  statsOnly?: boolean;
};

export type GuardConfig = {
  enabled: boolean;
  autoReconnect: boolean;
  reconnectDelaySec: number;
  maxRetries: number;
  brbSceneName: string;
  lowBitrateKbps: number;
  autoSwitchBack: boolean;
};

export type IrlConfig = {
  enabled: boolean;
  port: number;
  streamKey: string;
  brbSceneName: string;
  lowBitrateSceneName: string;
  lowBitrateKbps: number;
  autoSwitchBack: boolean;
};

export type ChatPopoutConfig = {
  enabled: boolean;
  opacity: number;
  solidBackground: boolean;
};

export type IrlStatus = {
  running: boolean;
  publishing: boolean;
  state: 'off' | 'waiting' | 'live' | 'brb';
  bitrateKbps: number;
  ingestUrl: string;
  message: string;
};

export type GuardStatus = {
  active: boolean;
  state: 'idle' | 'monitoring' | 'reconnecting' | 'brb';
  retriesUsed: number;
  message: string;
};

export type ChatBadge = {
  name: string;
  url: string;
};

export type ChatFragment = {
  type: 'text' | 'emote';
  text?: string;
  name?: string;
  url?: string;
};

export type UnifiedChatMessage = {
  id: string;
  platform: Platform;
  channelId: string;
  /** Platform-native id of the author (Kick numeric user id, YouTube channel
   *  id) — used as the target for that platform's moderation. */
  authorId?: string;
  username: string;
  displayName: string;
  userColor?: string;
  badges?: ChatBadge[];
  message: string;
  fragments?: ChatFragment[];
  timestamp: number;
  isMod?: boolean;
  isSub?: boolean;
  isVip?: boolean;
};

export type UnifiedActivityEvent = {
  id: string;
  platform: Platform;
  type:
    | 'follow'
    | 'sub'
    | 'resub'
    | 'gift_sub'
    | 'cheer'
    | 'raid'
    | 'stream_streak'
    | 'donation';
  username: string;
  message?: string;
  amount?: number;
  timestamp: number;
};

export type PlatformStats = {
  platform: Platform;
  channel?: string;
  viewers: number;
  followers?: number;
  subscribers?: number;
  isLive?: boolean;
  updatedAt: number;
};

export type CombinedStats = {
  totalViewers: number;
  platforms: PlatformStats[];
};

export type PanelId = 'session' | 'preview' | 'activity' | 'chat' | 'scenes' | 'sources' | 'audio';

export type LayoutItem = { i: PanelId; x: number; y: number; w: number; h: number };

export type StudioLayout = {
  items: LayoutItem[];
};

/** Default studio arrangement — mirrors the classic VaultStudio layout. */
export const DEFAULT_LAYOUT: StudioLayout = {
  items: [
    { i: 'session', x: 0, y: 0, w: 2, h: 6 },
    { i: 'preview', x: 2, y: 0, w: 7, h: 6 },
    { i: 'activity', x: 9, y: 0, w: 3, h: 6 },
    { i: 'chat', x: 0, y: 6, w: 3, h: 4 },
    { i: 'scenes', x: 3, y: 6, w: 3, h: 4 },
    { i: 'sources', x: 6, y: 6, w: 3, h: 4 },
    { i: 'audio', x: 9, y: 6, w: 3, h: 4 },
  ],
};

export type AppSettings = ObsSettings & {
  streamTitle: string;
  streamCategory: string;
  goLiveNotification: boolean;
  recordingPath: string;
  chatPopout: ChatPopoutConfig;
  obsConnected?: boolean;
};

export type ChatTarget = string; // 'all' or a platform name

export type LicenseTier = 'free' | 'pro';

export type LicenseInfo = {
  activated: boolean;
  valid: boolean;
  tier: LicenseTier;
  key: string;
  maxTargets: number;
  issuedAt: string | null;
  expiresAt: string | null;
};

export type UpdateCheckResult = {
  ok: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  downloadUrl?: string;
  notesUrl?: string;
  error?: string;
};

export interface VaultStudioAPI {
  obs: {
    getConnectionState(): Promise<{ state: ObsConnectionState; obsInstalled: boolean }>;
    getProfiles(): Promise<{ name: string; path: string }[]>;
    setProfile(name: string): Promise<boolean>;
    launchObs(): Promise<boolean>;
    stopEngine(): Promise<boolean>;
    getScenes(): Promise<Scene[]>;
    createScene(name: string): Promise<Scene>;
    deleteScene(id: string): Promise<void>;
    switchScene(id: string): Promise<void>;
    renameScene(id: string, name: string): Promise<void>;
    duplicateScene(id: string): Promise<string>;
    setSceneIndex(id: string, index: number): Promise<void>;
    renameSource(sceneId: string, sourceName: string, name: string): Promise<void>;
    moveSource(sceneId: string, sourceId: string, direction: 'up' | 'down' | 'top' | 'bottom'): Promise<void>;
    setSourceIndex(sceneId: string, sourceId: string, index: number): Promise<void>;
    setSourceLocked(sceneId: string, sourceId: string, locked: boolean): Promise<void>;
    setSourceTransform(sceneId: string, sourceId: string, transform: Partial<SourceTransform>): Promise<void>;
    toggleVirtualCam(): Promise<VirtualCamResult>;
    clipReplay(): Promise<'started' | 'saved' | 'error'>;
    getSources(sceneId: string): Promise<Source[]>;
    addSource(sceneId: string, type: SourceType, settings: Record<string, unknown>): Promise<Source>;
    listSourceDevices(type: SourceType): Promise<SourceDevice[]>;
    removeSource(sceneId: string, sourceId: string): Promise<void>;
    setSourceVisible(sceneId: string, sourceId: string, visible: boolean): Promise<void>;
    updateSourceSettings(sourceId: string, settings: Record<string, unknown>): Promise<void>;
    syncDrawingOverlay(imageDataUrl: string, hasDrawing: boolean): Promise<{ ok: boolean; error?: string }>;
    startStreaming(): Promise<StartStreamResult>;
    stopStreaming(): Promise<void>;
    startRecording(path?: string): Promise<StartRecordingResult>;
    stopRecording(): Promise<void>;
    getOutputStats(): Promise<OutputStats>;
    getAvailableEncoders(): Promise<string[]>;
    getActiveEncoder(): Promise<string | null>;
    getAudioSources(): Promise<AudioSource[]>;
    setVolume(sourceId: string, volume: number): Promise<void>;
    setMuted(sourceId: string, muted: boolean): Promise<void>;
    getSettings(): Promise<ObsSettings>;
    updateSettings(settings: Partial<AppSettings>): Promise<void>;
  };
  preview: {
    start(options?: PreviewRequestOptions): Promise<void>;
    stop(): Promise<void>;
  };
  targets: {
    list(): Promise<StreamTarget[]>;
    platformServers(): Promise<Record<StreamTargetPlatform, string>>;
    add(target: Omit<StreamTarget, 'id'>): Promise<StreamTarget | { error: string }>;
    update(target: StreamTarget): Promise<StreamTarget>;
    remove(id: string): Promise<void>;
    importFromObs(): Promise<StreamTarget[]>;
    apply(): Promise<{ ok: boolean; error?: string }>;
  };
  platforms: {
    getConnections(): Promise<{ connections: PlatformConnectionInfo[]; statuses: PlatformStatus[] }>;
    connect(connection: {
      platform: Platform;
      channel: string;
      username?: string;
      token?: string;
      enabled: boolean;
    }): Promise<PlatformStatus[]>;
    disconnect(platform: string): Promise<PlatformStatus[]>;
    oauthLogin(platform: string): Promise<{
      ok: boolean;
      error?: string;
      login?: string;
      channel?: string;
      scopes?: string[];
      statuses?: PlatformStatus[];
    }>;
    oauthLogout(platform: string): Promise<{ ok: boolean; statuses?: PlatformStatus[] }>;
    getStats(): Promise<CombinedStats>;
    setDashboardEnabled(platform: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>;
  };
  chat: {
    sendMessage(message: string, target: ChatTarget): Promise<{ sent: string[]; failed: string[] }>;
    hideLocal(messageId: string): Promise<{ ok: boolean }>;
    getHistory(): Promise<{ messages: UnifiedChatMessage[]; activity: UnifiedActivityEvent[] }>;
    moderate(
      action: 'delete' | 'timeout' | 'ban' | 'unban',
      opts: { platform?: string; username?: string; messageId?: string; authorId?: string; durationSec?: number }
    ): Promise<{ ok: boolean; error?: string }>;
    clearHistory(): Promise<{ ok: boolean }>;
  };
  guard: {
    get(): Promise<{ config: GuardConfig; status: GuardStatus }>;
    update(patch: Partial<GuardConfig>): Promise<GuardConfig>;
  };
  irl: {
    get(): Promise<{ config: IrlConfig; status: IrlStatus }>;
    update(patch: Partial<IrlConfig>): Promise<{ config: IrlConfig; status: IrlStatus }>;
    setupScenes(): Promise<{ config: IrlConfig; status: IrlStatus; scenes: Scene[]; startingSoonSceneName: string }>;
  };
  layout: {
    get(): Promise<StudioLayout | null>;
    save(layout: StudioLayout): Promise<void>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: Partial<AppSettings>): Promise<void>;
  };
  chatPopout: {
    get(): Promise<ChatPopoutConfig>;
    update(patch: Partial<ChatPopoutConfig>): Promise<ChatPopoutConfig>;
    show(): Promise<ChatPopoutConfig>;
    hide(): Promise<void>;
  };
  license: {
    getInfo(): Promise<LicenseInfo>;
    activate(key: string): Promise<{ ok: boolean; error?: string }>;
    buyPro(): Promise<{ ok: boolean }>;
    deactivate(): Promise<LicenseInfo>;
  };
  updates: {
    check(): Promise<UpdateCheckResult>;
    openDownload(url: string): Promise<{ ok: boolean }>;
  };
  files: {
    selectImage(): Promise<string | null>;
    selectMedia(): Promise<string | null>;
    selectVideo(): Promise<string | null>;
    selectAudio(): Promise<string | null>;
    selectPlaylist(): Promise<string[]>;
  };
  openExternal(url: string): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    vaultstudio: VaultStudioAPI;
  }
}
