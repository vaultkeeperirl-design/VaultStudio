/**
 * Twitch chat connector over IRC WebSocket.
 *
 * Reads chat anonymously (justinfan login) — no OAuth required. If the user
 * provides a username + OAuth token, the connection is authenticated and can
 * also send messages. Emits unified chat messages and activity events
 * (subs, resubs, gift subs, raids) parsed from USERNOTICE tags.
 */
import { EventEmitter } from 'events';
import { httpGet } from './http';
import { TwitchEventSub } from './twitch-eventsub';

export type TwitchChatOptions = {
  channel: string;
  username?: string;
  token?: string; // OAuth token, with or without the "oauth:" prefix
};

type IrcMessage = {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string[];
};

function parseIrcLine(line: string): IrcMessage | null {
  let rest = line;
  const tags: Record<string, string> = {};
  if (rest.startsWith('@')) {
    const space = rest.indexOf(' ');
    const rawTags = rest.slice(1, space);
    rest = rest.slice(space + 1);
    for (const part of rawTags.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      tags[part.slice(0, eq)] = part.slice(eq + 1).replace(/\\s/g, ' ').replace(/\\\\/g, '\\');
    }
  }
  let prefix = '';
  if (rest.startsWith(':')) {
    const space = rest.indexOf(' ');
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1);
  }
  const trailingIdx = rest.indexOf(' :');
  let trailing: string | null = null;
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    rest = rest.slice(0, trailingIdx);
  }
  const params = rest.split(' ').filter(Boolean);
  const command = params.shift() || '';
  if (trailing !== null) params.push(trailing);
  return { tags, prefix, command, params };
}

type ChatFragment = { type: 'text' | 'emote'; text?: string; name?: string; url?: string };

export type ChatModerationEvent =
  | { action: 'delete'; platform: 'twitch'; channelId: string; messageId: string }
  | { action: 'clear-user'; platform: 'twitch'; channelId: string; username: string }
  | { action: 'clear-channel'; platform: 'twitch'; channelId: string };

/**
 * The IRC emotes tag ("25:0-4,12-16/1902:6-10") gives emote ids with
 * code-point ranges into the message. Split the message into text/emote
 * fragments with CDN image URLs.
 */
export function parseTwitchFragments(message: string, emotesTag?: string): ChatFragment[] | undefined {
  if (!emotesTag) return undefined;
  const chars = Array.from(message); // ranges are in unicode code points
  const ranges: { start: number; end: number; id: string }[] = [];
  for (const part of emotesTag.split('/')) {
    const sep = part.indexOf(':');
    if (sep === -1) continue;
    const id = part.slice(0, sep);
    for (const pos of part.slice(sep + 1).split(',')) {
      const [s, e] = pos.split('-').map(Number);
      if (Number.isFinite(s) && Number.isFinite(e) && e >= s) ranges.push({ start: s, end: e, id });
    }
  }
  if (ranges.length === 0) return undefined;
  ranges.sort((a, b) => a.start - b.start);
  const fragments: ChatFragment[] = [];
  let last = 0;
  for (const r of ranges) {
    if (r.start < last || r.end >= chars.length) continue; // malformed range
    if (r.start > last) fragments.push({ type: 'text', text: chars.slice(last, r.start).join('') });
    fragments.push({
      type: 'emote',
      name: chars.slice(r.start, r.end + 1).join(''),
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/1.0`,
    });
    last = r.end + 1;
  }
  if (last < chars.length) fragments.push({ type: 'text', text: chars.slice(last).join('') });
  return fragments;
}

export class TwitchChat extends EventEmitter {
  private ws: WebSocket | null = null;
  private opts: TwitchChatOptions;
  private stopped = false;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private eventsub: TwitchEventSub | null = null;

  constructor(opts: TwitchChatOptions) {
    super();
    this.opts = opts;
  }

  get canSend(): boolean {
    return Boolean(this.opts.username && this.opts.token);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  start() {
    this.stopped = false;
    void this.backfillHistory();
    this.connect();
    this.startEventSub();
  }

  /**
   * With an authenticated token we can subscribe to EventSub for real-time
   * follower alerts (with usernames). Its events are re-emitted as this
   * connector's 'activity'/'error', and 'follows:realtime' lets the manager
   * suppress the polled count-delta fallback while real follows are flowing.
   * Without a token Twitch exposes no follow event, so the fallback stands.
   */
  private startEventSub() {
    if (!this.opts.token || this.eventsub) return;
    const es = new TwitchEventSub({ channel: this.opts.channel, token: this.opts.token });
    es.on('activity', (evt) => this.emit('activity', evt));
    es.on('error', (err: Error) => this.emit('error', err));
    es.on('follows:realtime', (active: boolean) => this.emit('follows:realtime', active));
    this.eventsub = es;
    void es.start();
  }

  /**
   * Pull messages sent before we connected from the public recent-messages
   * service (the same one chat clients like Chatterino use). Best-effort.
   */
  private async backfillHistory() {
    try {
      const res = await httpGet(
        `https://recent-messages.robotty.de/api/v2/recent-messages/${this.opts.channel.toLowerCase()}?limit=150`
      );
      if (!res.ok) return;
      const data = await res.json();
      const lines: string[] = data?.messages || [];
      const history = [];
      for (const line of lines) {
        const msg = parseIrcLine(line);
        if (!msg || msg.command !== 'PRIVMSG') continue;
        history.push(this.mapPrivmsg(msg));
      }
      if (history.length > 0) this.emit('history', history);
    } catch {
      /* history is a bonus, never an error */
    }
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.closeSocket();
    if (this.eventsub) {
      this.eventsub.stop();
      this.eventsub = null;
    }
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

  send(message: string): boolean {
    if (!this.connected || !this.canSend || !this.ws) return false;
    this.ws.send(`PRIVMSG #${this.opts.channel.toLowerCase()} :${message}`);
    // Twitch does not echo own messages back on IRC; synthesize one locally.
    this.emit('message', {
      id: `self-${Date.now()}`,
      platform: 'twitch',
      channelId: this.opts.channel,
      username: this.opts.username || 'you',
      displayName: this.opts.username || 'You',
      userColor: '#D6A23A',
      message,
      timestamp: Date.now(),
    });
    return true;
  }

  private connect() {
    if (this.stopped) return;
    // Never let two sockets run in parallel — that duplicates every message.
    this.closeSocket();
    let ws: WebSocket;
    try {
      ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      const token = this.opts.token?.replace(/^oauth:/, '');
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      if (this.canSend && token) {
        ws.send(`PASS oauth:${token}`);
        ws.send(`NICK ${this.opts.username!.toLowerCase()}`);
      } else {
        ws.send(`PASS SCHMOOPIIE`);
        ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      }
      ws.send(`JOIN #${this.opts.channel.toLowerCase()}`);
    };

    ws.onmessage = (ev) => {
      for (const line of String(ev.data).split('\r\n')) {
        if (line) this.handleLine(line);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
  }

  private mapPrivmsg(msg: IrcMessage) {
    const username = msg.prefix.split('!')[0];
    const badges = msg.tags['badges'] || '';
    const text = msg.params[msg.params.length - 1] || '';
    return {
      id: msg.tags['id'] || `tw-${Date.now()}-${Math.random()}`,
      platform: 'twitch',
      channelId: this.opts.channel,
      username,
      displayName: msg.tags['display-name'] || username,
      userColor: msg.tags['color'] || undefined,
      message: text,
      fragments: parseTwitchFragments(text, msg.tags['emotes']),
      timestamp: Number(msg.tags['tmi-sent-ts']) || Date.now(),
      isMod: msg.tags['mod'] === '1' || badges.includes('broadcaster'),
      isSub: msg.tags['subscriber'] === '1',
      isVip: badges.includes('vip'),
    };
  }

  private handleLine(line: string) {
    if (line.startsWith('PING')) {
      this.ws?.send('PONG :tmi.twitch.tv');
      return;
    }
    const msg = parseIrcLine(line);
    if (!msg) return;

    switch (msg.command) {
      case '001':
        this.connected = true;
        this.reconnectDelay = 1000;
        this.emit('status', true);
        break;
      case 'PRIVMSG':
        this.emit('message', this.mapPrivmsg(msg));
        break;
      case 'CLEARMSG': {
        const messageId = msg.tags['target-msg-id'];
        if (messageId) {
          this.emit('moderation', {
            action: 'delete',
            platform: 'twitch',
            channelId: this.opts.channel,
            messageId,
          } satisfies ChatModerationEvent);
        }
        break;
      }
      case 'CLEARCHAT': {
        const channelId = (msg.params[0] || this.opts.channel).replace(/^#/, '') || this.opts.channel;
        const username = msg.params.length > 1 ? msg.params[msg.params.length - 1] : '';
        if (username) {
          this.emit('moderation', {
            action: 'clear-user',
            platform: 'twitch',
            channelId,
            username,
          } satisfies ChatModerationEvent);
        } else {
          this.emit('moderation', {
            action: 'clear-channel',
            platform: 'twitch',
            channelId,
          } satisfies ChatModerationEvent);
        }
        break;
      }
      case 'USERNOTICE': {
        const msgId = msg.tags['msg-id'];
        const username = msg.tags['display-name'] || msg.tags['login'] || 'someone';
        const typeMap: Record<string, string> = {
          sub: 'sub',
          resub: 'resub',
          subgift: 'gift_sub',
          submysterygift: 'gift_sub',
          raid: 'raid',
        };
        const type = typeMap[msgId];
        if (!type) break;
        this.emit('activity', {
          id: msg.tags['id'] || `twa-${Date.now()}`,
          platform: 'twitch',
          type,
          username,
          message: msg.params[msg.params.length - 1],
          amount:
            type === 'raid'
              ? Number(msg.tags['msg-param-viewerCount']) || undefined
              : Number(msg.tags['msg-param-mass-gift-count']) || undefined,
          timestamp: Date.now(),
        });
        break;
      }
      case 'NOTICE': {
        const text = msg.params[msg.params.length - 1] || '';
        if (/login|authentication/i.test(text)) {
          this.emit('error', new Error(`Twitch: ${text}`));
        }
        break;
      }
    }
  }
}
