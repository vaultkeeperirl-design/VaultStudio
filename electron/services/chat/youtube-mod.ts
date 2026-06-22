/**
 * YouTube live-chat moderation via the Data API, using the OAuth token stored on
 * the YouTube connection. Mirrors twitch-mod's ModAction surface. Delete works
 * by message id; ban/timeout act on the author's channel id (carried as the
 * message authorId) and need the active live-chat id, which is resolved + cached.
 * Unban isn't supported (the API needs the ban resource id we don't retain).
 */
import { store } from '../store';
import { youtubeDeleteMessage, youtubeBan, resolveLiveChatId } from './youtube-api';
import type { ModAction } from './twitch-mod';

let liveChatCache: { token: string; liveChatId: string; at: number } | null = null;

async function getLiveChatId(token: string): Promise<string | null> {
  if (liveChatCache && liveChatCache.token === token && Date.now() - liveChatCache.at < 60000) {
    return liveChatCache.liveChatId;
  }
  const id = await resolveLiveChatId(token);
  if (id) liveChatCache = { token, liveChatId: id, at: Date.now() };
  return id;
}

export async function youtubeModerate(
  action: ModAction,
  opts: { messageId?: string; authorId?: string; durationSec?: number }
): Promise<{ ok: boolean; error?: string }> {
  const conn = store.getConnections().find((c) => c.platform === 'youtube');
  if (!conn?.oauthToken) {
    return { ok: false, error: 'Log in with YouTube on the Connections page to use mod actions' };
  }
  const token = conn.oauthToken;
  try {
    if (action === 'delete') {
      if (!opts.messageId) return { ok: false, error: 'Message id missing' };
      await youtubeDeleteMessage(token, opts.messageId);
      return { ok: true };
    }
    if (action === 'unban') {
      return { ok: false, error: 'YouTube unban must be done from YouTube Studio' };
    }
    const channelId = opts.authorId;
    if (!channelId) return { ok: false, error: 'This message has no channel id to act on' };
    const liveChatId = await getLiveChatId(token);
    if (!liveChatId) return { ok: false, error: 'No active YouTube live chat found' };
    if (action === 'timeout') {
      await youtubeBan(token, liveChatId, channelId, Math.max(1, opts.durationSec || 600));
      return { ok: true };
    }
    if (action === 'ban') {
      await youtubeBan(token, liveChatId, channelId);
      return { ok: true };
    }
    return { ok: false, error: `Unknown action: ${action}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
