/**
 * Twitch moderation via the Helix API.
 *
 * Uses the same OAuth token the user supplied for chat sending, validated via
 * the shared twitch-api helpers (which derive the client-id and the moderator's
 * user id — no separate app registration needed). Actions require the token to
 * carry moderator scopes (moderator:manage:banned_users,
 * moderator:manage:chat_messages); errors from Twitch are surfaced verbatim.
 */
import { store } from '../store';
import { validateToken, helix, resolveUserId } from './twitch-api';

export type ModAction = 'delete' | 'timeout' | 'ban' | 'unban';

function getTwitchToken(): { token: string; channel: string } | null {
  const conn = store.getConnections().find((c) => c.platform === 'twitch');
  if (!conn?.token) return null;
  return { token: conn.token.replace(/^oauth:/i, ''), channel: conn.channel };
}

export async function twitchModerate(
  action: ModAction,
  opts: { username?: string; messageId?: string; durationSec?: number; reason?: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = getTwitchToken();
    if (!auth) {
      return { ok: false, error: 'Add your Twitch OAuth token on the Connections page to use mod actions' };
    }
    const info = await validateToken(auth.token);
    const broadcasterId = await resolveUserId(auth.token, info.clientId, auth.channel);
    const modParams = `broadcaster_id=${broadcasterId}&moderator_id=${info.userId}`;

    switch (action) {
      case 'delete': {
        if (!opts.messageId) return { ok: false, error: 'Message id missing' };
        await helix(auth.token, info.clientId, 'DELETE', `moderation/chat?${modParams}&message_id=${encodeURIComponent(opts.messageId)}`);
        return { ok: true };
      }
      case 'timeout':
      case 'ban': {
        if (!opts.username) return { ok: false, error: 'Username missing' };
        const userId = await resolveUserId(auth.token, info.clientId, opts.username);
        await helix(auth.token, info.clientId, 'POST', `moderation/bans?${modParams}`, {
          data: {
            user_id: userId,
            duration: action === 'timeout' ? Math.max(1, opts.durationSec || 600) : undefined,
            reason: opts.reason || undefined,
          },
        });
        return { ok: true };
      }
      case 'unban': {
        if (!opts.username) return { ok: false, error: 'Username missing' };
        const userId = await resolveUserId(auth.token, info.clientId, opts.username);
        await helix(auth.token, info.clientId, 'DELETE', `moderation/bans?${modParams}&user_id=${userId}`);
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
