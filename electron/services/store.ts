/**
 * Persistent app store (JSON in userData) with encrypted stream keys.
 *
 * Stream keys and chat tokens are encrypted at rest with Electron safeStorage
 * (DPAPI on Windows) when available.
 */
import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export type StreamTargetPlatform = 'twitch' | 'kick' | 'youtube' | 'custom';

export type StreamTarget = {
  id: string;
  name: string;
  platform: StreamTargetPlatform;
  server: string;
  streamKey: string;
  enabled: boolean;
};

export type PlatformConnection = {
  platform: 'twitch' | 'kick' | 'youtube' | 'tiktok';
  channel: string; // channel name / slug / channel id
  username?: string; // for sending chat (twitch)
  token?: string; // oauth token (twitch send) or API key (youtube stats)
  // One-click OAuth credentials for send + moderation (Kick / YouTube). Twitch
  // keeps using `token`. oauthToken/refreshToken are encrypted at rest.
  oauthToken?: string;
  refreshToken?: string;
  tokenExpiry?: number; // epoch ms
  userId?: string; // platform-native id of the logged-in user (Kick broadcaster id, YouTube channel id)
  enabled: boolean;
  dashboardEnabled: boolean; // show this platform on the dashboard (chat + stats)
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
  /** Auto-switch to this scene when the phone feed fully drops/disconnects. */
  brbSceneName: string;
  /** Auto-switch to this scene when the feed is still up but bitrate collapses.
   *  Falls back to brbSceneName when empty. */
  lowBitrateSceneName: string;
  lowBitrateKbps: number;
  autoSwitchBack: boolean;
};

export type ChatPopoutConfig = {
  enabled: boolean;
  opacity: number;
  solidBackground: boolean;
};

export type AppSettingsStored = {
  streamTitle: string;
  streamCategory: string;
  goLiveNotification: boolean;
  recordingPath: string;
  outputResolution: string;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  encoder: 'auto' | 'nvenc' | 'x264';
  chatPopout: ChatPopoutConfig;
};

type StoreShape = {
  settings: AppSettingsStored;
  targets: StreamTarget[];
  connections: PlatformConnection[];
  guard: GuardConfig;
  irl: IrlConfig;
  importedFromObs: boolean;
  seededConnections: boolean;
  layout: unknown;
};

const DEFAULTS: StoreShape = {
  settings: {
    streamTitle: 'VaultStudio Stream',
    streamCategory: 'Just Chatting',
    goLiveNotification: true,
    recordingPath: '',
    outputResolution: '1920x1080',
    fps: 60,
    videoBitrate: 6000,
    audioBitrate: 160,
    encoder: 'auto',
    chatPopout: {
      enabled: true,
      opacity: 0.88,
      solidBackground: false,
    },
  },
  targets: [],
  connections: [],
  guard: {
    enabled: true,
    autoReconnect: true,
    reconnectDelaySec: 5,
    maxRetries: 20,
    brbSceneName: '',
    lowBitrateKbps: 500,
    autoSwitchBack: true,
  },
  irl: {
    enabled: false,
    port: 1935,
    streamKey: '',
    brbSceneName: '',
    lowBitrateSceneName: '',
    lowBitrateKbps: 400,
    autoSwitchBack: true,
  },
  importedFromObs: false,
  seededConnections: false,
  layout: null,
};

const SECRET_PREFIX = 'enc:';

function encrypt(value: string): string {
  if (!value) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return SECRET_PREFIX + safeStorage.encryptString(value).toString('base64');
    }
  } catch {
    /* fall through to plaintext */
  }
  return value;
}

function decrypt(value: string): string {
  if (!value || !value.startsWith(SECRET_PREFIX)) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(SECRET_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

class Store {
  private data: StoreShape = structuredClone(DEFAULTS);
  private filePath = '';
  private loaded = false;

  private ensureLoaded() {
    if (this.loaded) return;
    this.filePath = path.join(app.getPath('userData'), 'vaultstudio.json');
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      this.data = {
        ...structuredClone(DEFAULTS),
        ...raw,
        settings: { ...DEFAULTS.settings, ...(raw.settings || {}) },
        guard: { ...DEFAULTS.guard, ...(raw.guard || {}) },
        irl: { ...DEFAULTS.irl, ...(raw.irl || {}) },
      };
      this.data.settings.chatPopout = {
        ...DEFAULTS.settings.chatPopout,
        ...((raw.settings || {}).chatPopout || {}),
      };
    } catch {
      this.data = structuredClone(DEFAULTS);
    }
    this.loaded = true;
  }

  private persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to persist store:', e);
    }
  }

  // --- Settings ---
  getSettings(): AppSettingsStored {
    this.ensureLoaded();
    return { ...this.data.settings };
  }

  updateSettings(patch: Partial<AppSettingsStored>) {
    this.ensureLoaded();
    this.data.settings = {
      ...this.data.settings,
      ...patch,
      chatPopout: {
        ...this.data.settings.chatPopout,
        ...(patch.chatPopout || {}),
      },
    };
    this.persist();
  }

  // --- Guard ---
  getGuard(): GuardConfig {
    this.ensureLoaded();
    return { ...this.data.guard };
  }

  updateGuard(patch: Partial<GuardConfig>) {
    this.ensureLoaded();
    this.data.guard = { ...this.data.guard, ...patch };
    this.persist();
  }

  // --- IRL ingest ---
  getIrl(): IrlConfig {
    this.ensureLoaded();
    return { ...this.data.irl };
  }

  updateIrl(patch: Partial<IrlConfig>) {
    this.ensureLoaded();
    this.data.irl = { ...this.data.irl, ...patch };
    this.persist();
  }

  // --- Stream targets (unlimited) ---
  getTargets(): StreamTarget[] {
    this.ensureLoaded();
    return this.data.targets.map((t) => ({ ...t, streamKey: decrypt(t.streamKey) }));
  }

  saveTargets(targets: StreamTarget[]) {
    this.ensureLoaded();
    this.data.targets = targets.map((t) => ({ ...t, streamKey: encrypt(t.streamKey) }));
    this.persist();
  }

  hasImportedFromObs(): boolean {
    this.ensureLoaded();
    return this.data.importedFromObs;
  }

  markImportedFromObs() {
    this.ensureLoaded();
    this.data.importedFromObs = true;
    this.persist();
  }

  getLayout(): unknown {
    this.ensureLoaded();
    return this.data.layout;
  }

  saveLayout(layout: unknown) {
    this.ensureLoaded();
    this.data.layout = layout;
    this.persist();
  }

  hasSeededConnections(): boolean {
    this.ensureLoaded();
    return this.data.seededConnections;
  }

  markSeededConnections() {
    this.ensureLoaded();
    this.data.seededConnections = true;
    this.persist();
  }

  // --- Platform connections (chat/stats) ---
  getConnections(): PlatformConnection[] {
    this.ensureLoaded();
    return this.data.connections.map((c) => ({
      ...c,
      token: c.token ? decrypt(c.token) : undefined,
      oauthToken: c.oauthToken ? decrypt(c.oauthToken) : undefined,
      refreshToken: c.refreshToken ? decrypt(c.refreshToken) : undefined,
      dashboardEnabled: c.dashboardEnabled !== false, // default true for old entries
    }));
  }

  saveConnections(connections: PlatformConnection[]) {
    this.ensureLoaded();
    this.data.connections = connections.map((c) => ({
      ...c,
      token: c.token ? encrypt(c.token) : undefined,
      oauthToken: c.oauthToken ? encrypt(c.oauthToken) : undefined,
      refreshToken: c.refreshToken ? encrypt(c.refreshToken) : undefined,
    }));
    this.persist();
  }

  setDashboardEnabled(platform: string, enabled: boolean) {
    this.ensureLoaded();
    const conn = this.data.connections.find((c) => c.platform === platform);
    if (conn) {
      conn.dashboardEnabled = enabled;
      this.persist();
    }
  }
}

export const store = new Store();
