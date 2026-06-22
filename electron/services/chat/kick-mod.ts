/**
 * Kick moderation via the public API, using the OAuth token stored on the Kick
 * connection. Mirrors twitch-mod's ModAction surface. The target is identified
 * by the Kick numeric user id carried on the chat message (authorId); Kick's
 * public API has no by-username lookup or single-message delete yet, so delete
 * falls back to the local "Remove from feed".
 */
import { store } from '../store';
import { kickBan, kickUnban } from './kick-api';
import type { ModAction } from './twitch-mod';

export async function kickModerate(
  action: ModAction,
  opts: { authorId?: string; durationSec?: number; reason?: string }
): Promise<{ ok: boolean; error?: string }> {
  const conn = store.getConnections().find((c) => c.platform === 'kick');
  if (!conn?.oauthToken || !conn.userId) {
    return { ok: false, error: 'Log in with Kick on the Connections page to use mod actions' };
  }
  if (action === 'delete') {
    return { ok: false, error: 'Kick has no single-message delete API — use “Remove from feed”' };
  }
  const broadcasterId = Number(conn.userId);
  const targetId = Number(opts.authorId);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return { ok: false, error: 'This Kick message has no user id to act on' };
  }
  try {
    switch (action) {
      case 'timeout':
        await kickBan(conn.oauthToken, broadcasterId, targetId, Math.max(1, Math.ceil((opts.durationSec || 600) / 60)), opts.reason);
        return { ok: true };
      case 'ban':
        await kickBan(conn.oauthToken, broadcasterId, targetId, undefined, opts.reason);
        return { ok: true };
      case 'unban':
        await kickUnban(conn.oauthToken, broadcasterId, targetId);
        return { ok: true };
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
