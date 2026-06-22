/**
 * Twitch EventSub (WebSocket transport) — real-time follower alerts.
 *
 * Twitch's IRC chat feed carries no follow events, so without this follows can
 * only be surfaced as polled count deltas ("+N followers") with no username.
 * EventSub's `channel.follow` (v2) delivers the actual follower's name in real
 * time. It requires the user's OAuth token to carry the
 * `moderator:read:followers` scope; the broadcaster is a moderator of their own
 * channel, so broadcaster_user_id == moderator_user_id == the token's user.
 *
 * Protocol (https://dev.twitch.tv/docs/eventsub/handling-websocket-events):
 *   1. Connect ws; receive `session_welcome` with a session id.
 *   2. POST a `channel.follow` subscription with transport websocket+session_id.
 *   3. Receive `notification` frames carrying event.user_name.
 *   4. `session_keepalive` resets the idle timer; `session_reconnect` and idle
 *      timeouts trigger a fresh connect + re-subscribe.
 *
 * Emits: 'activity' (unified follow event), 'error' (Error), and
 * 'follows:realtime' (boolean — true once subscribed, false if it gives up) so
 * the poll-based follower-delta fallback can be suppressed while this is live.
 */
import { EventEmitter } from 'events';
import { validateToken, helix, resolveUserId, normalizeToken, TwitchApiError, type TwitchTokenInfo } from './twitch-api';

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const REQUIRED_SCOPE = 'moderator:read:followers';

type EventSubFrame = {
  metadata?: { message_id?: string; message_type?: string; subscription_type?: string };
  payload?: {
    session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    subscription?: { type?: string };
    event?: { user_id?: string; user_login?: string; user_name?: string; followed_at?: string };
  };
};

export class TwitchEventSub extends EventEmitter {
  private channel: string;
  private token: string;
  private ws: WebSocket | null = null;
  private stopped = false;
  private info: TwitchTokenInfo | null = null;
  private broadcasterId: string | null = null;
  private sessionId: string | null = null;
  private keepaliveSec = 30;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 2000;
  private recentIds = new Set<string>();

  constructor(opts: { channel: string; token: string }) {
    super();
    this.channel = opts.channel;
    this.token = normalizeToken(opts.token);
  }

  async start() {
    this.stopped = false;
    const ready = await this.prepare();
    if (ready) this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearKeepalive();
    this.closeSocket();
  }

  /**
   * Validate the token, confirm the follower scope, and resolve the broadcaster
   * id. Returns false (without scheduling a retry) when the scope is missing —
   * retrying can't fix that, only a re-auth can — and emits a clear error so the
   * UI can tell the user. Transient failures schedule a backed-off retry.
   */
  private async prepare(): Promise<boolean> {
    try {
      this.info = await validateToken(this.token);
    } catch (e) {
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
      this.scheduleReconnect();
      return false;
    }
    if (!this.info.scopes.includes(REQUIRED_SCOPE)) {
      this.emit('follows:realtime', false);
      this.emit(
        'error',
        new Error(
          `Twitch follower alerts need the "${REQUIRED_SCOPE}" permission — reconnect Twitch on the Connections page to see real follower names.`
        )
      );
      return false;
    }
    try {
      this.broadcasterId = await resolveUserId(this.token, this.info.clientId, this.channel);
    } catch (e) {
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
      this.scheduleReconnect();
      return false;
    }
    return true;
  }

  private connect(url: string = EVENTSUB_WS_URL) {
    if (this.stopped) return;
    this.closeSocket();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.handleFrame(String(ev.data));
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.clearKeepalive();
      if (!this.stopped) this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onopen = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  }

  private handleFrame(raw: string) {
    let frame: EventSubFrame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    const id = frame.metadata?.message_id;
    if (id) {
      if (this.recentIds.has(id)) return; // Twitch may re-deliver
      this.recentIds.add(id);
      if (this.recentIds.size > 200) this.recentIds = new Set([...this.recentIds].slice(-100));
    }
    // Any frame counts as liveness for the keepalive watchdog.
    this.resetKeepalive();

    switch (frame.metadata?.message_type) {
      case 'session_welcome': {
        this.sessionId = frame.payload?.session?.id || null;
        const ka = Number(frame.payload?.session?.keepalive_timeout_seconds);
        if (Number.isFinite(ka) && ka > 0) {
          this.keepaliveSec = ka;
          this.resetKeepalive();
        }
        this.reconnectDelay = 2000;
        void this.subscribe();
        break;
      }
      case 'session_keepalive':
        break;
      case 'session_reconnect':
        // Re-establish a fresh session and re-subscribe — simpler and more
        // robust than carrying the session across reconnect_url, and any brief
        // duplicate is absorbed by message-id + activity-id dedup.
        this.connect();
        break;
      case 'notification': {
        if (frame.payload?.subscription?.type === 'channel.follow') {
          const e = frame.payload.event || {};
          this.emit('activity', {
            id: `twfollow-${e.user_id || 'x'}-${id || Date.now()}`,
            platform: 'twitch',
            type: 'follow',
            username: e.user_name || e.user_login || 'someone',
            timestamp: e.followed_at ? Date.parse(e.followed_at) : Date.now(),
          });
        }
        break;
      }
      case 'revocation':
        this.emit('follows:realtime', false);
        this.emit(
          'error',
          new Error('Twitch revoked the follower subscription — reconnect Twitch on the Connections page.')
        );
        break;
    }
  }

  private async subscribe() {
    if (!this.sessionId || !this.info || !this.broadcasterId) return;
    try {
      await helix(this.token, this.info.clientId, 'POST', 'eventsub/subscriptions', {
        type: 'channel.follow',
        version: '2',
        condition: {
          broadcaster_user_id: this.broadcasterId,
          moderator_user_id: this.info.userId,
        },
        transport: { method: 'websocket', session_id: this.sessionId },
      });
      this.emit('follows:realtime', true);
    } catch (e) {
      // 409 = subscription already exists for this session (race / re-deliver).
      if (e instanceof TwitchApiError && e.status === 409) {
        this.emit('follows:realtime', true);
        return;
      }
      this.emit('follows:realtime', false);
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
    }
  }

  private resetKeepalive() {
    this.clearKeepalive();
    // Reconnect if no frame (notification or keepalive) arrives within the
    // negotiated keepalive window plus grace.
    this.keepaliveTimer = setTimeout(
      () => {
        if (!this.stopped) this.connect();
      },
      (this.keepaliveSec + 10) * 1000
    );
  }

  private clearKeepalive() {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const jittered = Math.round(this.reconnectDelay * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, jittered);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }
}
