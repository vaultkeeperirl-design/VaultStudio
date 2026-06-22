import { EventEmitter } from 'events';

export class TikTokChat extends EventEmitter {
  private channelId: string;
  private pollTimer: NodeJS.Timeout | null = null;
  private viewerCount = 0;
  isConnected = false;
  canSend = false;

  constructor(channelId: string) {
    super();
    this.channelId = channelId;
  }

  async start() {
    this.isConnected = true;
    this.emit('status');
    this.schedulePoll();
  }

  stop() {
    this.isConnected = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private schedulePoll() {
    this.pollTimer = setTimeout(() => this.pollStats(), 30000);
  }

  private async pollStats() {
    if (!this.isConnected) return;

    try {
      const res = await fetch(`https://www.tiktok.com/@${this.channelId}/live`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) {
        this.emit('status');
        this.schedulePoll();
        return;
      }

      const html = await res.text();

      const viewerMatch = html.match(/"viewerCount":(\d+)/);
      if (viewerMatch) {
        this.viewerCount = parseInt(viewerMatch[1], 10);
      }

      const followerMatch = html.match(/"followerCount":(\d+)/);
      const followers = followerMatch ? parseInt(followerMatch[1], 10) : undefined;

      this.emit('stats', {
        platform: 'tiktok',
        viewers: this.viewerCount,
        followers,
        updatedAt: Date.now(),
      });

      this.emit('status');
    } catch {
      this.emit('status');
    }

    this.schedulePoll();
  }
}
