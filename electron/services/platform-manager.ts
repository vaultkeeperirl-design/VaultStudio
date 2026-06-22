/**
 * Platform manager — owns chat connectors and the combined stats poller for
 * any number of platform connections (Twitch, Kick, YouTube, TikTok, …).
 *
 * Capabilities per platform:
 *   twitch  — chat read (no login), chat send (token), viewers/followers/live
 *   kick    — chat read, viewers/followers/live, Kicks gifts
 *   youtube — viewers/live via YouTube Data API (user-supplied API key)
 *   tiktok  — best-effort viewers/live via public live page
 *
 * Event surface:
 *   'chat:message' | 'chat:refresh' | 'activity:event' | 'stats:update'
 *   'platforms:status' | 'platform:error'
 */
import { EventEmitter } from 'events';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { TwitchChat } from './chat/twitch-chat';
import { KickChat, fetchKickChannel } from './chat/kick-chat';
import { YouTubeChat } from './chat/youtube-chat';
import { kickSendMessage } from './chat/kick-api';
import { youtubeSendMessage } from './chat/youtube-api';
import { refreshKickToken } from './chat/kick-oauth';
import { refreshGoogleToken } from './chat/youtube-oauth';
import { httpGet } from './chat/http';
import { store, type PlatformConnection } from './store';

export type PlatformStatus = {
  platform: string;
  channel: string;
  chatConnected: boolean;
  canSend: boolean;
  statsOnly: boolean;
};

type PlatformStats = {
  platform: string;
  channel: string;
  viewers: number;
  followers?: number;
  isLive?: boolean;
  updatedAt: number;
};

const STATS_INTERVAL_MS = 20000;
const CHAT_BUFFER_MAX = 500;
const ACTIVITY_BUFFER_MAX = 500;
const HISTORY_SAVE_INTERVAL_MS = 10000;

type BufferedMessage = { id: string; timestamp: number; [key: string]: unknown };
type Connector = TwitchChat | KickChat | YouTubeChat;
export type ChatModerationEvent =
  | { action: 'delete'; platform?: string; channelId?: string; messageId: string }
  | { action: 'clear-user'; platform?: string; channelId?: string; username: string }
  | { action: 'clear-channel'; platform?: string; channelId?: string };

const CHAT_PLATFORMS = new Set(['twitch', 'kick', 'youtube']);

const connKey = (c: { platform: string; channel: string }) =>
  `${c.platform}:${c.channel.toLowerCase()}`;

// Only the fields a given connector actually consumes — so e.g. a Kick OAuth
// token refresh (which the read-only Pusher connector ignores) doesn't trigger
// a pointless reconnect.
const connectorConfigKey = (c: PlatformConnection): string => {
  if (c.platform === 'twitch') return JSON.stringify({ ch: c.channel, u: c.username, t: c.token });
  if (c.platform === 'youtube') return JSON.stringify({ ch: c.channel, k: c.token, o: c.oauthToken });
  return JSON.stringify({ ch: c.channel });
};

// --- Per-platform stats fetchers ---------------------------------------------

async function fetchTwitchStats(channel: string): Promise<Partial<PlatformStats> | null> {
  // decapi.me is a long-standing public stats proxy for Twitch.
  try {
    const [viewersRes, followersRes] = await Promise.all([
      fetch(`https://decapi.me/twitch/viewercount/${encodeURIComponent(channel)}`),
      fetch(`https://decapi.me/twitch/followcount/${encodeURIComponent(channel)}`),
    ]);
    const viewersText = (await viewersRes.text()).trim();
    const followers = parseInt((await followersRes.text()).trim(), 10);
    const viewers = parseInt(viewersText, 10);
    return {
      viewers: Number.isFinite(viewers) ? viewers : 0,
      isLive: Number.isFinite(viewers),
      followers: Number.isFinite(followers) ? followers : undefined,
    };
  } catch {
    return null;
  }
}

type YouTubeCache = { videoId: string | null; lastSearch: number };

/**
 * YouTube Data API v3. search.list is quota-expensive (100 units), so the
 * live video id is cached and only re-searched every 2 minutes while offline;
 * the per-poll call is the cheap videos.list (1 unit).
 */
async function fetchYouTubeStats(
  channelId: string,
  apiKey: string,
  cache: YouTubeCache
): Promise<Partial<PlatformStats> | null> {
  try {
    if (cache.videoId) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${cache.videoId}&key=${apiKey}`
      );
      if (res.ok) {
        const data = await res.json();
        const viewers = Number(data?.items?.[0]?.liveStreamingDetails?.concurrentViewers);
        const ended = Boolean(data?.items?.[0]?.liveStreamingDetails?.actualEndTime);
        if (Number.isFinite(viewers) && !ended) {
          return { viewers, isLive: true };
        }
      }
      cache.videoId = null; // stream ended or video gone
    }
    if (Date.now() - cache.lastSearch < 120000) {
      return { viewers: 0, isLive: false };
    }
    cache.lastSearch = Date.now();
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${encodeURIComponent(channelId)}&eventType=live&type=video&maxResults=1&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const videoId = data?.items?.[0]?.id?.videoId;
    if (videoId) {
      cache.videoId = videoId;
      return fetchYouTubeStats(channelId, apiKey, cache);
    }
    return { viewers: 0, isLive: false };
  } catch {
    return null;
  }
}

/** Best-effort TikTok live viewers from the public live page. */
async function fetchTikTokStats(username: string): Promise<Partial<PlatformStats> | null> {
  try {
    const res = await httpGet(`https://www.tiktok.com/@${encodeURIComponent(username.replace(/^@/, ''))}/live`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"user_count"\s*:\s*(\d+)/);
    if (match) {
      const viewers = parseInt(match[1], 10);
      return { viewers, isLive: viewers > 0 };
    }
    return { viewers: 0, isLive: false };
  } catch {
    return null;
  }
}

// --- Manager ------------------------------------------------------------------

class PlatformManager extends EventEmitter {
  private connectors = new Map<string, Connector>();
  private connectorConfig = new Map<string, string>();
  private statsTimer: NodeJS.Timeout | null = null;
  private lastStats = new Map<string, PlatformStats>();
  private youtubeCaches = new Map<string, YouTubeCache>();
  private chatBuffer: BufferedMessage[] = [];
  private activityBuffer: BufferedMessage[] = [];
  private seenMessageIds = new Set<string>();
  private seenActivityIds = new Set<string>();
  // Connection keys whose follows arrive via a realtime named feed (Twitch
  // EventSub). For these we skip the polled "+N followers" count delta so a
  // single follow isn't reported twice (once named, once as a count).
  private realtimeFollowKeys = new Set<string>();
  private historyDirty = false;
  private historyTimer: NodeJS.Timeout | null = null;

  private historyPath(): string {
    return path.join(app.getPath('userData'), 'chat-history.json');
  }

  private loadHistory() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.historyPath(), 'utf-8'));
      this.chatBuffer = (raw.messages || []).slice(-CHAT_BUFFER_MAX);
      // Drop legacy nameless follow placeholders persisted by older builds
      // ("New follower" / "just followed!"). Public follow feeds carry no
      // username, so those rows were just noise; real-name events
      // (subs/gifts/raids) and the current "+N followers" count deltas stay.
      const activity: BufferedMessage[] = (raw.activity || []).filter(
        (e: BufferedMessage) =>
          !(e?.type === 'follow' && (e?.username === 'New follower' || e?.message === 'just followed!'))
      );
      if (activity.length !== (raw.activity || []).length) this.historyDirty = true;
      this.activityBuffer = activity.slice(-ACTIVITY_BUFFER_MAX);
      for (const m of this.chatBuffer) this.seenMessageIds.add(m.id);
      for (const e of this.activityBuffer) this.seenActivityIds.add(e.id);
    } catch {
      /* first run */
    }
  }

  private saveHistory() {
    if (!this.historyDirty) return;
    this.historyDirty = false;
    try {
      fs.mkdirSync(path.dirname(this.historyPath()), { recursive: true });
      fs.writeFileSync(
        this.historyPath(),
        JSON.stringify({ messages: this.chatBuffer, activity: this.activityBuffer }),
        'utf-8'
      );
    } catch (e) {
      console.error('Failed to save chat history:', e);
    }
  }

  start() {
    this.loadHistory();
    this.applyConnections(store.getConnections());
    if (!this.statsTimer) {
      this.statsTimer = setInterval(() => void this.pollStats(), STATS_INTERVAL_MS);
      void this.pollStats();
    }
    if (!this.historyTimer) {
      this.historyTimer = setInterval(() => this.saveHistory(), HISTORY_SAVE_INTERVAL_MS);
    }
  }

  stop() {
    for (const c of this.connectors.values()) c.stop();
    this.connectors.clear();
    this.connectorConfig.clear();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.historyTimer) clearInterval(this.historyTimer);
    this.historyTimer = null;
    this.saveHistory();
  }

  getStatuses(): PlatformStatus[] {
    return store.getConnections().map((conn) => {
      const connector = this.connectors.get(connKey(conn));
      let canSend = false;
      if (connector instanceof TwitchChat) canSend = connector.canSend;
      else if (connector instanceof YouTubeChat) canSend = connector.canSend;
      else if (conn.platform === 'kick') canSend = Boolean(conn.oauthToken && conn.userId);
      return {
        platform: conn.platform,
        channel: conn.channel,
        chatConnected: connector?.isConnected ?? false,
        canSend,
        statsOnly: !connector,
      };
    });
  }

  getChatBuffer(): BufferedMessage[] {
    return [...this.chatBuffer];
  }

  getActivityBuffer(): BufferedMessage[] {
    return [...this.activityBuffer];
  }

  clearChatHistory(): { ok: boolean } {
    this.chatBuffer = [];
    this.seenMessageIds.clear();
    this.historyDirty = true;
    this.saveHistory();
    this.emit('chat:refresh', []);
    return { ok: true };
  }

  getCombinedStats() {
    const platforms = [...this.lastStats.values()];
    return {
      totalViewers: platforms.reduce((sum, p) => sum + p.viewers, 0),
      platforms,
    };
  }

  connect(connection: PlatformConnection) {
    const connections = store
      .getConnections()
      .filter((c) => connKey(c) !== connKey(connection) && c.platform !== connection.platform);
    // One connection per platform for now (replace on reconnect); the
    // connector map itself supports multiple if that changes.
    connections.push({ ...connection, enabled: true, dashboardEnabled: connection.dashboardEnabled !== false });
    store.saveConnections(connections);
    this.applyConnections(connections);
    this.emitStatus();
    void this.pollStats();
  }

  disconnect(platform: string) {
    const connections = store.getConnections().filter((c) => c.platform !== platform);
    store.saveConnections(connections);
    for (const [key] of this.lastStats) {
      if (key.startsWith(`${platform}:`)) this.lastStats.delete(key);
    }
    this.applyConnections(connections);
    this.emitStatus();
    this.emit('stats:update', this.getCombinedStats());
  }

  async sendChat(message: string, target: string): Promise<{ sent: string[]; failed: string[] }> {
    const sent: string[] = [];
    const failed: string[] = [];
    const conns = store.getConnections();
    for (const [key, connector] of this.connectors) {
      const platform = key.split(':')[0];
      if (target !== 'all' && target !== platform) continue;
      const conn = conns.find((c) => connKey(c) === key);
      try {
        if (connector instanceof TwitchChat) {
          if (connector.canSend && connector.send(message)) sent.push(platform);
          else if (target === platform) failed.push(platform);
        } else if (platform === 'kick') {
          if (conn?.oauthToken && conn.userId) {
            await kickSendMessage(conn.oauthToken, Number(conn.userId), message);
            sent.push(platform);
          } else if (target === platform) failed.push(platform);
        } else if (connector instanceof YouTubeChat) {
          if (conn?.oauthToken && connector.liveChat) {
            await youtubeSendMessage(conn.oauthToken, connector.liveChat, message);
            sent.push(platform);
          } else if (target === platform) failed.push(platform);
        } else if (target === platform) {
          failed.push(platform);
        }
      } catch {
        failed.push(platform);
      }
    }
    if (target === 'all' && sent.length === 0 && failed.length === 0) failed.push('all');
    return { sent, failed };
  }

  applyModeration(event: ChatModerationEvent): boolean {
    const platform = event.platform?.toLowerCase();
    const channelId = event.channelId?.toLowerCase();
    const username = event.action === 'clear-user' ? event.username.toLowerCase() : '';
    const before = this.chatBuffer.length;

    this.chatBuffer = this.chatBuffer.filter((msg) => {
      const msgPlatform = typeof msg.platform === 'string' ? msg.platform.toLowerCase() : '';
      const msgChannel = typeof msg.channelId === 'string' ? msg.channelId.toLowerCase() : '';
      if (platform && msgPlatform !== platform) return true;
      if (channelId && msgChannel !== channelId) return true;

      if (event.action === 'delete') {
        return msg.id !== event.messageId;
      }
      if (event.action === 'clear-user') {
        const msgUsername = typeof msg.username === 'string' ? msg.username.toLowerCase() : '';
        return msgUsername !== username;
      }
      return false;
    });

    if (this.chatBuffer.length === before) return false;
    this.historyDirty = true;
    this.emit('chat:refresh', this.getChatBuffer());
    return true;
  }

  private applyConnections(connections: PlatformConnection[]) {
    const wanted = new Map<string, PlatformConnection>();
    for (const conn of connections) {
      if (!conn.enabled || !CHAT_PLATFORMS.has(conn.platform)) continue;
      // YouTube chat needs either an API key (anonymous read) or an OAuth login.
      if (conn.platform === 'youtube' && !conn.token && !conn.oauthToken) continue;
      wanted.set(connKey(conn), conn);
    }

    // Stop removed/changed connectors.
    for (const [key, connector] of this.connectors) {
      const conn = wanted.get(key);
      if (!conn || this.connectorConfig.get(key) !== connectorConfigKey(conn)) {
        connector.stop();
        this.connectors.delete(key);
        this.connectorConfig.delete(key);
        this.realtimeFollowKeys.delete(key);
      }
    }

    // Start new connectors.
    for (const [key, conn] of wanted) {
      if (this.connectors.has(key)) continue;
      let connector: Connector;
      if (conn.platform === 'twitch') {
        connector = new TwitchChat({ channel: conn.channel, username: conn.username, token: conn.token });
      } else if (conn.platform === 'youtube') {
        connector = new YouTubeChat(conn.channel, { apiKey: conn.token, oauthToken: conn.oauthToken });
      } else {
        connector = new KickChat(conn.channel);
      }
      this.wireConnector(key, connector);
      this.connectors.set(key, connector);
      this.connectorConfig.set(key, connectorConfigKey(conn));
      void connector.start();
    }
  }

  private wireConnector(key: string, connector: EventEmitter) {
    connector.on('message', (msg: BufferedMessage) => {
      if (this.seenMessageIds.has(msg.id)) return;
      this.trackId(msg.id);
      this.chatBuffer.push(msg);
      if (this.chatBuffer.length > CHAT_BUFFER_MAX) this.chatBuffer.shift();
      this.historyDirty = true;
      this.emit('chat:message', msg);
    });
    connector.on('history', (msgs: BufferedMessage[]) => {
      let added = 0;
      for (const msg of msgs) {
        if (this.seenMessageIds.has(msg.id)) continue;
        this.trackId(msg.id);
        this.chatBuffer.push(msg);
        added++;
      }
      if (added === 0) return;
      this.chatBuffer.sort((a, b) => a.timestamp - b.timestamp);
      if (this.chatBuffer.length > CHAT_BUFFER_MAX) {
        this.chatBuffer = this.chatBuffer.slice(-CHAT_BUFFER_MAX);
      }
      this.historyDirty = true;
      this.emit('chat:refresh', this.getChatBuffer());
    });
    connector.on('moderation', (event: ChatModerationEvent) => {
      this.applyModeration(event);
    });
    connector.on('activity', (evt: BufferedMessage) => {
      if (this.seenActivityIds.has(evt.id)) return;
      this.trackActivityId(evt.id);
      this.activityBuffer.push(evt);
      if (this.activityBuffer.length > ACTIVITY_BUFFER_MAX) this.activityBuffer.shift();
      this.historyDirty = true;
      this.emit('activity:event', evt);
    });
    connector.on('follows:realtime', (active: boolean) => {
      if (active) this.realtimeFollowKeys.add(key);
      else this.realtimeFollowKeys.delete(key);
    });
    connector.on('status', () => this.emitStatus());
    connector.on('error', (err: Error) => this.emit('platform:error', err.message));
  }

  private trackId(id: string) {
    this.seenMessageIds.add(id);
    if (this.seenMessageIds.size > CHAT_BUFFER_MAX * 4) {
      const keep = new Set(this.chatBuffer.map((m) => m.id));
      this.seenMessageIds = keep;
      this.seenMessageIds.add(id);
    }
  }

  private trackActivityId(id: string) {
    this.seenActivityIds.add(id);
    if (this.seenActivityIds.size > ACTIVITY_BUFFER_MAX * 4) {
      const keep = new Set(this.activityBuffer.map((e) => e.id));
      this.seenActivityIds = keep;
      this.seenActivityIds.add(id);
    }
  }

  private emitStatus() {
    this.emit('platforms:status', this.getStatuses());
  }

  /**
   * Refresh Kick/YouTube OAuth tokens that are near expiry so send + mod (which
   * read the stored token) and OAuth chat reads keep working without re-login.
   */
  private async refreshExpiringTokens() {
    const conns = store.getConnections();
    let changed = false;
    for (const conn of conns) {
      if (!conn.refreshToken || !conn.tokenExpiry) continue;
      if (Date.now() < conn.tokenExpiry - 60000) continue; // still valid
      const next =
        conn.platform === 'kick'
          ? await refreshKickToken(conn.refreshToken)
          : conn.platform === 'youtube'
            ? await refreshGoogleToken(conn.refreshToken)
            : null;
      if (next) {
        conn.oauthToken = next.token;
        conn.refreshToken = next.refreshToken || conn.refreshToken;
        conn.tokenExpiry = next.expiry;
        changed = true;
      }
    }
    if (changed) {
      store.saveConnections(conns);
      this.applyConnections(store.getConnections());
      this.emitStatus();
    }
  }

  private async pollStats() {
    await this.refreshExpiringTokens();
    const connections = store.getConnections().filter((c) => c.enabled);
    if (connections.length === 0) return;

    await Promise.allSettled(
      connections.map(async (conn) => {
        const key = connKey(conn);
        let result: Partial<PlatformStats> | null = null;
        switch (conn.platform) {
          case 'twitch':
            result = await fetchTwitchStats(conn.channel);
            break;
          case 'kick': {
            const info = await fetchKickChannel(conn.channel);
            if (info) {
              result = {
                viewers: info.viewers,
                followers: info.followers || undefined,
                isLive: info.isLive,
              };
            }
            break;
          }
          case 'youtube': {
            if (!conn.token) break;
            // Prefer the chat connector's cached live video — no extra quota.
            const connector = this.connectors.get(key);
            if (connector instanceof YouTubeChat) {
              const viewers = await connector.fetchViewerCount();
              if (viewers !== null) {
                result = { viewers, isLive: true };
                break;
              }
            }
            let cache = this.youtubeCaches.get(key);
            if (!cache) {
              cache = { videoId: null, lastSearch: 0 };
              this.youtubeCaches.set(key, cache);
            }
            result = await fetchYouTubeStats(conn.channel, conn.token, cache);
            break;
          }
          case 'tiktok':
            result = await fetchTikTokStats(conn.channel);
            break;
        }
        if (result) {
          // Skip the count-delta fallback when a realtime named follow feed
          // (Twitch EventSub) is live for this connection — it reports the
          // actual follower instead.
          if (!this.realtimeFollowKeys.has(key)) {
            this.detectNewFollowers(key, conn.platform, result.followers);
          }
          this.lastStats.set(key, {
            platform: conn.platform,
            channel: conn.channel,
            viewers: 0,
            ...result,
            updatedAt: Date.now(),
          });
        }
      })
    );

    this.emit('stats:update', this.getCombinedStats());
  }

  /**
   * Platforms without a realtime follow event (Twitch without OAuth) still
   * get follow activity: when the polled follower count rises, surface it.
   */
  private detectNewFollowers(key: string, platform: string, followers?: number) {
    if (typeof followers !== 'number' || !Number.isFinite(followers)) return;
    const prev = this.lastStats.get(key)?.followers;
    if (typeof prev !== 'number' || followers <= prev) return;
    const gained = followers - prev;
    const evt: BufferedMessage = {
      id: `${platform}-followdelta-${Date.now()}`,
      platform,
      type: 'follow',
      username: gained === 1 ? '+1 follower' : `+${gained} followers`,
      message: 'from stats poll',
      timestamp: Date.now(),
    };
    if (this.seenActivityIds.has(evt.id)) return;
    this.trackActivityId(evt.id);
    this.activityBuffer.push(evt);
    if (this.activityBuffer.length > ACTIVITY_BUFFER_MAX) this.activityBuffer.shift();
    this.historyDirty = true;
    this.emit('activity:event', evt);
  }
}

export const platformManager = new PlatformManager();
