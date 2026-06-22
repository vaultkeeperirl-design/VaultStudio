import { EventEmitter } from 'events';
import { resolveLiveChatId, youtubePollMessages, type YouTubeChatPage } from './youtube-api';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

type YouTubeMessage = {
  id: string;
  platform: 'youtube';
  channelId: string;
  authorId?: string;
  username: string;
  displayName: string;
  userColor?: string;
  badges: { name: string; url: string }[];
  message: string;
  fragments?: { type: 'text' | 'emote'; text?: string; name?: string; url?: string }[];
  timestamp: number;
  isMod?: boolean;
  isSub?: boolean;
  isVip?: boolean;
};

export type YouTubeChatOptions = {
  apiKey?: string;
  /** When present, chat is read (and sent/moderated) via OAuth — no API key or
   *  channel id needed; the live chat is found from the user's own broadcast. */
  oauthToken?: string;
};

/**
 * YouTube live chat connector. Reads either via an API key (anonymous, needs a
 * channel id) or via an OAuth token (the logged-in user's own live broadcast).
 * The OAuth path also unlocks send + moderation elsewhere in the app.
 */
export class YouTubeChat extends EventEmitter {
  private channelId: string;
  private apiKey?: string;
  private oauthToken?: string;
  private liveChatId: string | null = null;
  private videoId: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private nextPageToken: string | null = null;
  private stopped = false;
  private connected = false;

  constructor(channelId: string, opts: YouTubeChatOptions) {
    super();
    this.channelId = channelId;
    this.apiKey = opts.apiKey;
    this.oauthToken = opts.oauthToken;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get canSend(): boolean {
    return Boolean(this.oauthToken);
  }

  get liveChat(): string | null {
    return this.liveChatId;
  }

  async start() {
    this.stopped = false;
    await this.findLiveChatId();
    if (!this.liveChatId) {
      this.emit('error', new Error('No live stream found for this channel'));
      return;
    }
    this.connected = true;
    this.emit('status');
    this.schedulePoll();
  }

  stop() {
    this.stopped = true;
    this.connected = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async findLiveChatId() {
    try {
      if (this.oauthToken) {
        this.liveChatId = await resolveLiveChatId(this.oauthToken);
        return;
      }
      if (!this.apiKey) return;
      const searchUrl = `${YT_API_BASE}/search?part=snippet&channelId=${this.channelId}&eventType=live&type=video&key=${this.apiKey}`;
      const searchRes = await fetch(searchUrl);
      const searchData = (await searchRes.json()) as { items?: { id: { videoId: string } }[] };
      const vid = searchData.items?.[0]?.id?.videoId;
      if (!vid) return;
      this.videoId = vid;

      const videoUrl = `${YT_API_BASE}/videos?part=liveStreamingDetails&id=${vid}&key=${this.apiKey}`;
      const videoRes = await fetch(videoUrl);
      const videoData = (await videoRes.json()) as {
        items?: { liveStreamingDetails?: { activeLiveChatId?: string } }[];
      };
      this.liveChatId = videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
    } catch (e) {
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
    }
  }

  private schedulePoll() {
    this.pollTimer = setTimeout(() => this.poll(), 5000);
  }

  private mapItem(item: NonNullable<YouTubeChatPage['items']>[number]): YouTubeMessage {
    const author = item.authorDetails;
    const snippet = item.snippet;
    return {
      id: item.id,
      platform: 'youtube',
      channelId: this.channelId,
      authorId: author.channelId,
      username: author.channelId,
      displayName: author.displayName,
      badges: [],
      message: snippet.displayMessage || '',
      timestamp: new Date(snippet.publishedAt).getTime(),
      isMod: author.isChatModerator,
      isSub: author.isChatSponsor,
    };
  }

  private async poll() {
    if (!this.liveChatId || !this.isConnected || this.stopped) return;

    try {
      let data: YouTubeChatPage;
      if (this.oauthToken) {
        data = await youtubePollMessages(this.oauthToken, this.liveChatId, this.nextPageToken || undefined);
      } else {
        let url = `${YT_API_BASE}/liveChat/messages?part=snippet,authorDetails&liveChatId=${this.liveChatId}&key=${this.apiKey}`;
        if (this.nextPageToken) url += `&pageToken=${this.nextPageToken}`;
        const res = await fetch(url);
        data = (await res.json()) as YouTubeChatPage;
      }

      this.nextPageToken = data.nextPageToken || null;

      for (const item of data.items || []) {
        this.emit('message', this.mapItem(item));

        const superChat = item.snippet.superChatDetails;
        if (superChat) {
          this.emit('activity', {
            id: `yt-superchat-${item.id}`,
            platform: 'youtube',
            type: 'cheer',
            username: item.authorDetails.displayName,
            message: superChat.userComment || '',
            amount: parseInt(superChat.amountMicros, 10) / 1_000_000,
            timestamp: Date.now(),
          });
        }
      }

      const interval = data.pollingIntervalMillis || 5000;
      this.pollTimer = setTimeout(() => this.poll(), Math.max(interval, 2000));
    } catch (e) {
      this.emit('error', e instanceof Error ? e : new Error(String(e)));
      if (!this.stopped) this.schedulePoll();
    }
  }

  async fetchViewerCount(): Promise<number | null> {
    if (!this.videoId || !this.apiKey) return null;
    try {
      const url = `${YT_API_BASE}/videos?part=liveStreamingDetails&id=${this.videoId}&key=${this.apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        items?: { liveStreamingDetails?: { concurrentViewers?: string } }[];
      };
      const viewers = data.items?.[0]?.liveStreamingDetails?.concurrentViewers;
      return viewers ? parseInt(viewers, 10) : null;
    } catch {
      return null;
    }
  }
}
