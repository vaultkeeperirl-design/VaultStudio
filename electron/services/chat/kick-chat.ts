/**
 * Kick chat connector.
 *
 * Resolves the channel's chatroom id via Kick's public channel API, then
 * subscribes to the chatroom over Kick's Pusher WebSocket — read access with
 * no credentials. Also exposes channel stats (viewers/followers) for the
 * combined stats service.
 */
import { EventEmitter } from 'events';

const PUSHER_URL =
  'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false';

import { httpGet } from './http';

type ChatFragment = { type: 'text' | 'emote'; text?: string; name?: string; url?: string };

/** Kick embeds emotes inline as [emote:12345:name] — split into fragments. */
export function parseKickFragments(content: string): ChatFragment[] | undefined {
  const regex = /\[emote:(\d+):([^\]]*)\]/g;
  if (!regex.test(content)) return undefined;
  regex.lastIndex = 0;
  const fragments: ChatFragment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content))) {
    if (m.index > last) fragments.push({ type: 'text', text: content.slice(last, m.index) });
    fragments.push({
      type: 'emote',
      name: m[2] || 'emote',
      url: `https://files.kick.com/emotes/${m[1]}/fullsize`,
    });
    last = m.index + m[0].length;
  }
  if (last < content.length) fragments.push({ type: 'text', text: content.slice(last) });
  return fragments;
}

export type KickChannelInfo = {
  chatroomId: number;
  channelId: number;
  isLive: boolean;
  viewers: number;
  followers: number;
};

export async function fetchKickChannel(slug: string): Promise<KickChannelInfo | null> {
  try {
    const res = await httpGet(`https://kick.com/api/v2/channels/${encodeURIComponent(slug.toLowerCase())}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      chatroomId: data?.chatroom?.id,
      channelId: data?.id,
      isLive: Boolean(data?.livestream),
      viewers: data?.livestream?.viewer_count ?? 0,
      followers: data?.followers_count ?? data?.followersCount ?? 0,
    };
  } catch {
    return null;
  }
}

type KickMessageData = {
  id?: string;
  content?: string;
  created_at?: string;
  sender?: {
    id?: number;
    username?: string;
    identity?: { color?: string; badges?: { type: string }[] };
  };
};

export class KickChat extends EventEmitter {
  private ws: WebSocket | null = null;
  private slug: string;
  private chatroomId: number | null = null;
  private channelId: number | null = null;
  private stopped = false;
  private reconnectDelay = 1000;
  private resolveRetryDelay = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private recentEventSigs = new Set<string>();

  constructor(slug: string) {
    super();
    this.slug = slug;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async start() {
    this.stopped = false;
    if (!this.chatroomId) {
      const info = await fetchKickChannel(this.slug);
      if (!info?.chatroomId) {
        this.emit('error', new Error(`Kick channel "${this.slug}" not found or unreachable`));
        this.scheduleResolveRetry();
        return;
      }
      this.resolveRetryDelay = 5000;
      this.chatroomId = info.chatroomId;
      this.channelId = info.channelId;
      void this.backfillHistory();
    }
    this.connect();
  }

  /** Pull the channel's recent messages so chat isn't empty on connect. */
  private async backfillHistory() {
    if (!this.channelId) return;
    try {
      const res = await httpGet(`https://kick.com/api/v2/channels/${this.channelId}/messages`);
      if (!res.ok) return;
      const json = await res.json();
      const raw: KickMessageData[] = json?.data?.messages || json?.messages || [];
      if (!Array.isArray(raw) || raw.length === 0) return;
      const history = raw
        .map((m) => this.mapMessage(m))
        .sort((a, b) => a.timestamp - b.timestamp);
      this.emit('history', history);
    } catch {
      /* history is a bonus, never an error */
    }
  }

  private mapMessage(data: KickMessageData) {
    const badges = data?.sender?.identity?.badges || [];
    const badgeTypes = badges.map((b) => b.type);
    const content = data?.content || '';
    return {
      id: data?.id || `kick-${Date.now()}-${Math.random()}`,
      platform: 'kick',
      channelId: this.slug,
      authorId: data?.sender?.id != null ? String(data.sender.id) : undefined,
      username: data?.sender?.username || 'unknown',
      displayName: data?.sender?.username || 'unknown',
      userColor: data?.sender?.identity?.color || undefined,
      message: content.replace(/\[emote:\d+:([^\]]*)\]/g, '$1'),
      fragments: parseKickFragments(content),
      timestamp: data?.created_at ? Date.parse(data.created_at) : Date.now(),
      isMod: badgeTypes.includes('moderator') || badgeTypes.includes('broadcaster'),
      isSub: badgeTypes.includes('subscriber'),
      isVip: badgeTypes.includes('vip') || badgeTypes.includes('og'),
    };
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.closeSocket();
  }

  /** Tear down the current socket without firing reconnect logic. */
  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
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

  private connect() {
    if (this.stopped || !this.chatroomId) return;
    // Never let two sockets run in parallel — that duplicates every message.
    this.closeSocket();
    let ws: WebSocket;
    try {
      ws = new WebSocket(PUSHER_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          event: 'pusher:subscribe',
          data: { auth: '', channel: `chatrooms.${this.chatroomId}.v2` },
        })
      );
      // Channel-level events (Kicks gifts, rewards, stream state) arrive on
      // the channel.{id} feed rather than the chatroom feed.
      if (this.channelId) {
        ws.send(
          JSON.stringify({
            event: 'pusher:subscribe',
            data: { auth: '', channel: `channel.${this.channelId}` },
          })
        );
      }
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        try {
          ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
        } catch {
          /* socket closing */
        }
      }, 60000);
    };

    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(String(ev.data));
        // Some events arrive on both the chatroom and channel feeds; dedupe
        // by event+payload signature so activity isn't double-counted.
        const sig = `${frame.event}|${typeof frame.data === 'string' ? frame.data : JSON.stringify(frame.data)}`;
        if (this.recentEventSigs.has(sig)) return;
        this.recentEventSigs.add(sig);
        if (this.recentEventSigs.size > 100) {
          this.recentEventSigs = new Set([...this.recentEventSigs].slice(-50));
        }
        this.handleEvent(frame);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.emit('status', false);
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    // ±20% jitter so many clients don't reconnect in lockstep after an outage.
    const jittered = Math.round(this.reconnectDelay * (0.8 + Math.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, jittered);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
  }

  /**
   * Retry channel resolution, which hits Kick's Cloudflare-gated HTTP API.
   * When that 403s (rate limit / bot challenge), retrying quickly only keeps the
   * block warm — so back off slowly (5s → 2min, with jitter) instead of the
   * fast websocket-reconnect cadence. Resets to 5s once a resolve succeeds.
   */
  private scheduleResolveRetry() {
    if (this.stopped || this.reconnectTimer) return;
    const jittered = Math.round(this.resolveRetryDelay * (0.7 + Math.random() * 0.6));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, jittered);
    this.resolveRetryDelay = Math.min(this.resolveRetryDelay * 2, 120000);
  }

  private handleEvent(frame: { event: string; data?: unknown }) {
    const dataStr = typeof frame.data === 'string' ? frame.data : JSON.stringify(frame.data ?? {});

    switch (frame.event) {
      case 'pusher_internal:subscription_succeeded':
        this.connected = true;
        this.reconnectDelay = 1000;
        this.emit('status', true);
        break;
      case 'pusher:ping':
        this.ws?.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        break;
      case 'App\\Events\\ChatMessageEvent': {
        const data = JSON.parse(dataStr) as KickMessageData;
        this.emit('message', this.mapMessage(data));
        break;
      }
      case 'App\\Events\\SubscriptionEvent': {
        const data = JSON.parse(dataStr);
        this.emit('activity', {
          id: `kicksub-${Date.now()}`,
          platform: 'kick',
          type: 'sub',
          username: data?.username || 'someone',
          amount: data?.months || undefined,
          timestamp: Date.now(),
        });
        break;
      }
      case 'App\\Events\\GiftedSubscriptionsEvent': {
        const data = JSON.parse(dataStr);
        this.emit('activity', {
          id: `kickgift-${Date.now()}`,
          platform: 'kick',
          type: 'gift_sub',
          username: data?.gifter_username || 'someone',
          amount: Array.isArray(data?.gifted_usernames) ? data.gifted_usernames.length : undefined,
          timestamp: Date.now(),
        });
        break;
      }
      case 'App\\Events\\FollowersUpdated': {
        const data = JSON.parse(dataStr);
        if (data?.followed === true && data?.username) {
          this.emit('activity', {
            id: `kickfollow-${Date.now()}`,
            platform: 'kick',
            type: 'follow',
            username: data.username,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'App\\Events\\StreamHostEvent': {
        const data = JSON.parse(dataStr);
        this.emit('activity', {
          id: `kickhost-${Date.now()}`,
          platform: 'kick',
          type: 'raid',
          username: data?.host_username || 'someone',
          amount: data?.number_viewers || undefined,
          timestamp: Date.now(),
        });
        break;
      }
      default: {
        // Kicks (Kick's gifting currency), rewards, tips — Kick keeps adding
        // event types. Catch anything gift-shaped so it lands in the feed.
        if (/kicks|gift|reward|tip|donat/i.test(frame.event) && !frame.event.startsWith('pusher')) {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(dataStr);
          } catch {
            /* keep empty */
          }
          const d = data as {
            sender?: { username?: string };
            user?: { username?: string };
            username?: string;
            gifter_username?: string;
            gift?: { amount?: number; gift_amount?: number; name?: string };
            kicks?: number;
            amount?: number;
          };
          const username =
            d.sender?.username || d.user?.username || d.gifter_username || d.username || 'someone';
          const amount = d.gift?.amount ?? d.gift?.gift_amount ?? d.kicks ?? d.amount;
          const giftName = d.gift?.name;
          const isKicks = /kicks/i.test(frame.event) || d.kicks !== undefined;
          this.emit('activity', {
            id: `kickgift-${Date.now()}-${Math.random()}`,
            platform: 'kick',
            type: 'donation',
            username,
            message: isKicks
              ? `gifted ${amount ?? 'some'} Kicks${giftName ? ` (${giftName})` : ''}`
              : `sent a gift${giftName ? `: ${giftName}` : ''}${amount ? ` (${amount})` : ''}`,
            amount: typeof amount === 'number' ? amount : undefined,
            timestamp: Date.now(),
          });
        } else if (!frame.event.startsWith('pusher')) {
          this.logUnknownEvent(frame.event, dataStr);
        }
        break;
      }
    }
  }

  /** Unknown Kick events get logged so new event types can be mapped later. */
  private logUnknownEvent(event: string, dataStr: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(app.getPath('userData'), 'kick-events.log');
      try {
        if (fs.existsSync(logPath) && fs.statSync(logPath).size > 512 * 1024) {
          fs.unlinkSync(logPath);
        }
      } catch {
        /* best effort */
      }
      fs.appendFileSync(logPath, `${new Date().toISOString()} ${event} ${dataStr.slice(0, 800)}\n`);
    } catch {
      /* outside Electron or disk error */
    }
  }
}
