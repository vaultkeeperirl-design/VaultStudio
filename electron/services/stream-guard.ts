/**
 * Stream Guard — NOALBS-style disconnection protection.
 *
 * While streaming it watches stream health via the native obs-engine:
 *  - If the stream output stops unexpectedly (ingest drop, network blip),
 *    it automatically restarts the stream with retries and backoff.
 *  - If output bitrate collapses below the configured threshold (dying
 *    uplink), it switches to the designated BRB scene so viewers see a
 *    branded "be right back" instead of a frozen frame, then switches back
 *    automatically once the connection recovers.
 */
import { EventEmitter } from 'events';
import { obsEngine } from './obs-engine';
import { startStreaming } from './obs-service';
import { store } from './store';

export type GuardStatus = {
  active: boolean;
  state: 'idle' | 'monitoring' | 'reconnecting' | 'brb';
  retriesUsed: number;
  message: string;
};

const POLL_MS = 2000;
const LOW_BITRATE_POLLS = 3; // consecutive low polls before BRB
const HEALTHY_POLLS = 3; // consecutive healthy polls before switching back

class StreamGuard extends EventEmitter {
  private status: GuardStatus = { active: false, state: 'idle', retriesUsed: 0, message: '' };
  private pollTimer: NodeJS.Timeout | null = null;
  private lowCount = 0;
  private healthyCount = 0;
  private previousScene: string | null = null;
  private expectedStop = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private sawReconnecting = false;
  private streaming = false;

  init() {
    obsEngine.on('event:streaming_started', () => {
      this.onStreamStarted();
    });
    obsEngine.on('event:streaming_stopped', (data: Record<string, unknown>) => {
      // The engine retries transient drops itself (libobs reconnect). A stop
      // with a non-zero code means the output gave up — that's our cue.
      this.onStreamStopped(typeof data?.code === 'number' ? data.code : 0);
    });
    obsEngine.on('event:target_reconnecting', () => {
      this.sawReconnecting = true;
      if (this.status.active) {
        this.setStatus({ state: 'reconnecting', message: 'Connection unstable — engine reconnecting' });
      }
    });
    obsEngine.on('event:target_connected', () => {
      if (this.status.active && this.status.state === 'reconnecting' && this.streaming) {
        this.sawReconnecting = false;
        this.setStatus({ state: 'monitoring', message: 'Stream protected' });
      }
    });
    obsEngine.on('status', (state: string) => {
      if (state !== 'connected' && this.status.active) {
        this.stopMonitoring('Engine disconnected');
      }
    });
  }

  /** The app is intentionally stopping the stream — don't fight it. */
  markExpectedStop() {
    this.expectedStop = true;
  }

  getStatus(): GuardStatus {
    return { ...this.status };
  }

  private setStatus(patch: Partial<GuardStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit('guard:status', this.getStatus());
  }

  private onStreamStarted() {
    this.expectedStop = false;
    this.sawReconnecting = false;
    this.streaming = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const cfg = store.getGuard();
    if (!cfg.enabled) return;
    this.lowCount = 0;
    this.healthyCount = 0;
    this.setStatus({
      active: true,
      state: this.previousScene ? 'brb' : 'monitoring',
      retriesUsed: 0,
      message: 'Stream protected',
    });
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
  }

  private onStreamStopped(code = 0) {
    this.streaming = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    const cfg = store.getGuard();
    const genuineDrop = (this.sawReconnecting || code !== 0) && !this.expectedStop;
    if (!genuineDrop || !cfg.enabled || !cfg.autoReconnect) {
      this.stopMonitoring(this.expectedStop ? 'Stream ended' : '');
      this.expectedStop = false;
      this.sawReconnecting = false;
      return;
    }
    if (this.status.retriesUsed >= cfg.maxRetries) {
      this.stopMonitoring(`Gave up after ${cfg.maxRetries} reconnect attempts`);
      this.sawReconnecting = false;
      return;
    }
    const attempt = this.status.retriesUsed + 1;
    this.setStatus({
      active: true,
      state: 'reconnecting',
      retriesUsed: attempt,
      message: `Stream dropped — restarting (attempt ${attempt}/${cfg.maxRetries})`,
    });
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const result = await startStreaming();
      if (!result.ok) this.onStreamStopped(1);
    }, Math.max(1, cfg.reconnectDelaySec) * 1000);
  }

  private stopMonitoring(message: string) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.previousScene = null;
    this.setStatus({ active: false, state: 'idle', retriesUsed: 0, message });
  }

  private async poll() {
    const cfg = store.getGuard();
    if (!cfg.enabled || !obsEngine.isInitialized()) return;
    try {
      const stats = await obsEngine.getOutputStats();
      if (!stats.isStreaming) return;

      const kbps = stats.bitrateKbps;
      const isLow = kbps > 0 && kbps < cfg.lowBitrateKbps;
      if (isLow) {
        this.lowCount++;
        this.healthyCount = 0;
      } else {
        this.healthyCount++;
        this.lowCount = 0;
      }

      if (this.status.state === 'monitoring' && this.lowCount >= LOW_BITRATE_POLLS && cfg.brbSceneName) {
        await this.enterBrb(cfg.brbSceneName, Math.round(kbps));
      } else if (this.status.state === 'brb' && this.healthyCount >= HEALTHY_POLLS && cfg.autoSwitchBack) {
        await this.exitBrb();
      }
    } catch {
      /* transient request failure — next poll will retry */
    }
  }

  private async enterBrb(brbScene: string, kbps: number) {
    try {
      const scenes = await obsEngine.getScenes();
      const current = scenes.find((s) => s.isActive);
      if (current && current.name === brbScene) return;
      this.previousScene = current?.name || null;
      await obsEngine.switchScene(brbScene);
      this.setStatus({ state: 'brb', message: `Low bitrate (${kbps} kbps) — switched to BRB scene` });
    } catch {
      /* scene may not exist; stay in monitoring */
    }
  }

  private async exitBrb() {
    try {
      if (this.previousScene) {
        await obsEngine.switchScene(this.previousScene);
      }
      this.previousScene = null;
      this.setStatus({ state: 'monitoring', message: 'Connection recovered — back to live scene' });
    } catch {
      /* retry on next healthy poll */
    }
  }
}

export const streamGuard = new StreamGuard();
