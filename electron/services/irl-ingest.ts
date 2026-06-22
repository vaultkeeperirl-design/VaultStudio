/**
 * IRL Ingest — VaultStudio as a NOALBS-style relay server for phone streaming.
 *
 * The streamer points any mobile RTMP app (Moblin, IRL Pro, Larix, …) at
 * rtmp://<pc-ip>:<port>/live/<key>. VaultStudio runs a local RTMP server,
 * exposes the feed as a media source the streamer adds to a scene, and
 * watches the incoming bitrate:
 *   - feed drops or bitrate collapses  -> switch to the BRB scene
 *   - feed recovers                    -> switch back automatically
 *
 * This is fully independent of Stream Guard's outgoing-stream protection and
 * is off by default so PC-only streamers are never affected.
 */
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as os from 'os';
import { obsEngine } from './obs-engine';
import { store, type IrlConfig } from './store';

export type IrlStatus = {
  running: boolean;
  publishing: boolean;
  state: 'off' | 'waiting' | 'live' | 'brb';
  bitrateKbps: number;
  ingestUrl: string;
  message: string;
};

export type IrlObsEngine = {
  isInitialized(): boolean;
  getScenes(): Promise<{ id: string; name: string; isActive: boolean; sources: unknown[] }[]>;
  switchScene(sceneName: string): Promise<void>;
};

export type IrlConfigStore = {
  getIrl(): IrlConfig;
  updateIrl(patch: Partial<IrlConfig>): void;
};

type MediaServer = EventEmitter & {
  run: () => void;
  stop: () => void;
  getSession?: (id: string) => unknown;
};

type IrlIngestDeps = {
  obsEngine: IrlObsEngine;
  store: IrlConfigStore;
  createMediaServer: (options: unknown) => MediaServer;
  getLocalIp?: () => string;
  randomBytes?: (size: number) => Buffer;
};

const POLL_MS = 2000;
const LOW_POLLS = 3; // consecutive low/stalled polls before BRB
const HEALTHY_POLLS = 3; // consecutive healthy polls before switching back

// node-media-server has no bundled types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
type NmsSession = {
  id: string;
  socket?: { bytesRead?: number };
  reject: () => void;
};

function createDefaultMediaServer(options: unknown): MediaServer {
  // Lazy require keeps startup fast and avoids loading the server when disabled.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NodeMediaServer = require('node-media-server');
  return new NodeMediaServer(options) as MediaServer;
}

const defaultDeps: IrlIngestDeps = {
  obsEngine,
  store,
  createMediaServer: createDefaultMediaServer,
};

export class IrlIngest extends EventEmitter {
  private nms: MediaServer | null = null;
  private publishingSessionId: string | null = null;
  private publishingSession: NmsSession | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastBytes = 0;
  private lowCount = 0;
  private healthyCount = 0;
  private previousScene: string | null = null;
  private status: IrlStatus = {
    running: false,
    publishing: false,
    state: 'off',
    bitrateKbps: 0,
    ingestUrl: '',
    message: '',
  };

  constructor(private deps: IrlIngestDeps = defaultDeps) {
    super();
  }

  getConfig(): IrlConfig {
    const cfg = this.deps.store.getIrl();
    if (!cfg.streamKey) {
      cfg.streamKey = (this.deps.randomBytes || crypto.randomBytes)(8).toString('hex');
      this.deps.store.updateIrl({ streamKey: cfg.streamKey });
    }
    return cfg;
  }

  updateConfig(patch: Partial<IrlConfig>): IrlConfig {
    this.deps.store.updateIrl(patch);
    const cfg = this.getConfig();
    if ('enabled' in patch || 'port' in patch) {
      this.stop();
      if (cfg.enabled) this.start();
    }
    return cfg;
  }

  getStatus(): IrlStatus {
    return { ...this.status, ingestUrl: this.ingestUrl() };
  }

  /** First non-internal IPv4 — what the phone should connect to on the LAN. */
  private localIp(): string {
    if (this.deps.getLocalIp) return this.deps.getLocalIp();
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
    return '127.0.0.1';
  }

  private ingestUrl(): string {
    const cfg = this.deps.store.getIrl();
    return `rtmp://${this.localIp()}:${cfg.port || 1935}/live/${cfg.streamKey || ''}`;
  }

  private setStatus(patch: Partial<IrlStatus>) {
    this.status = { ...this.status, ...patch, ingestUrl: this.ingestUrl() };
    this.emit('irl:status', this.getStatus());
  }

  init() {
    const cfg = this.getConfig();
    if (cfg.enabled) this.start();
  }

  start() {
    if (this.nms) return;
    const cfg = this.getConfig();
    try {
      this.nms = this.deps.createMediaServer({
        rtmp: {
          port: cfg.port || 1935,
          chunk_size: 60000,
          gop_cache: true,
          ping: 30,
          ping_timeout: 60,
        },
        logType: 0,
      });

      const nmsAny = this.nms as EventEmitter & { run: () => void; getSession: (id: string) => NmsSession };

      nmsAny.on('prePublish', (id: string, streamPath: string) => {
        const expected = `/live/${this.getConfig().streamKey}`;
        const session = nmsAny.getSession(id);
        if (streamPath !== expected) {
          session?.reject();
          return;
        }
        // Single publisher: a reconnecting phone replaces the stale session.
        this.publishingSessionId = id;
        this.publishingSession = session;
      });

      nmsAny.on('postPublish', (id: string) => {
        if (id !== this.publishingSessionId) return;
        void this.handlePublishStarted();
      });

      nmsAny.on('donePublish', (id: string) => {
        if (id !== this.publishingSessionId) return;
        this.publishingSessionId = null;
        this.publishingSession = null;
        this.stopPolling();
        this.setStatus({ publishing: false, bitrateKbps: 0, message: 'Phone feed disconnected' });
        void this.enterBrb('Feed disconnected');
      });

      nmsAny.run();
      this.setStatus({ running: true, state: 'waiting', message: `IRL server listening on port ${cfg.port}` });
    } catch (e) {
      this.nms = null;
      this.setStatus({
        running: false,
        state: 'off',
        message: `IRL server failed to start: ${e instanceof Error ? e.message : e}`,
      });
    }
  }

  stop() {
    this.stopPolling();
    if (this.nms) {
      try {
        this.nms.stop();
      } catch {
        /* already down */
      }
      this.nms = null;
    }
    this.publishingSessionId = null;
    this.publishingSession = null;
    this.previousScene = null;
    this.setStatus({ running: false, publishing: false, state: 'off', bitrateKbps: 0, message: '' });
  }

  private async handlePublishStarted() {
    const wasBrb = this.status.state === 'brb';
    const cfg = this.getConfig();
    this.lastBytes = 0;
    this.lowCount = 0;
    this.healthyCount = 0;
    this.setStatus({
      publishing: true,
      state: wasBrb ? 'brb' : 'live',
      message: wasBrb ? 'Phone feed connected - checking BRB recovery' : 'Phone feed connected',
    });
    this.startPolling();

    if (!wasBrb) return;
    if (!cfg.autoSwitchBack) {
      this.setStatus({ state: 'brb', message: 'Phone feed connected - staying on BRB scene' });
      return;
    }

    const restored = await this.exitBrb('Feed recovered - back to live scene');
    if (!restored) {
      this.setStatus({ state: 'brb', message: 'Feed recovered - retrying live scene switch' });
    }
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll() {
    const cfg = this.deps.store.getIrl();
    const bytes = this.publishingSession?.socket?.bytesRead ?? 0;
    const deltaBytes = this.lastBytes > 0 ? Math.max(0, bytes - this.lastBytes) : 0;
    const kbps = Math.round((deltaBytes * 8) / 1000 / (POLL_MS / 1000));
    const first = this.lastBytes === 0;
    this.lastBytes = bytes;
    this.setStatus({ bitrateKbps: kbps });
    if (first) return; // need two samples for a rate

    const low = kbps < (cfg.lowBitrateKbps || 400);
    if (low) {
      this.lowCount++;
      this.healthyCount = 0;
    } else {
      this.healthyCount++;
      this.lowCount = 0;
    }

    if (this.status.state === 'live' && this.lowCount >= LOW_POLLS) {
      // Feed is still connected but starving — show the dedicated Low Bitrate
      // scene if one is configured, otherwise fall back to the BRB scene.
      await this.enterBrb(`Low bitrate (${kbps} kbps)`, cfg.lowBitrateSceneName || cfg.brbSceneName);
    } else if (this.status.state === 'brb' && this.healthyCount >= HEALTHY_POLLS && cfg.autoSwitchBack) {
      await this.exitBrb();
    }
  }

  private async enterBrb(reason: string, targetScene?: string) {
    const cfg = this.deps.store.getIrl();
    const sceneName = targetScene || cfg.brbSceneName;
    if (!sceneName || !this.deps.obsEngine.isInitialized()) {
      this.setStatus({ state: this.status.publishing ? 'live' : 'waiting' });
      return;
    }
    try {
      const scenes = await this.deps.obsEngine.getScenes();
      const current = scenes.find((s) => s.isActive);
      // Remember the live scene only the first time we leave it. A later
      // fallback-to-fallback switch (Low Bitrate -> Be Right Back on full
      // disconnect) must not overwrite it, or recovery would return to a
      // fallback scene instead of the real one.
      if (this.status.state !== 'brb' && current && current.name !== sceneName) {
        this.previousScene = current.name;
      }
      if (current && current.name !== sceneName) {
        await this.deps.obsEngine.switchScene(sceneName);
      }
      this.setStatus({ state: 'brb', message: `${reason} — switched to ${sceneName}` });
    } catch {
      /* fallback scene missing — stay put */
    }
  }

  private async exitBrb(message = 'Feed recovered - back to live scene'): Promise<boolean> {
    if (this.status.state !== 'brb') return false;
    try {
      if (this.previousScene && this.deps.obsEngine.isInitialized()) {
        await this.deps.obsEngine.switchScene(this.previousScene);
      }
      this.previousScene = null;
      this.setStatus({ state: 'live', message });
      return true;
    } catch {
      /* retry on next healthy poll */
      return false;
    }
  }
}

export const irlIngest = new IrlIngest();
