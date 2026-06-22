/**
 * Kick public API helpers (https://api.kick.com/public/v1) for the authenticated
 * actions VaultStudio performs on the user's behalf: identify the logged-in
 * user, send chat, and moderate (ban / timeout / unban). All calls use the
 * bearer token obtained via kick-oauth.ts.
 */
const KICK_API = 'https://api.kick.com/public/v1';

async function kickFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`${KICK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Kick API error ${res.status}`;
    try {
      const err = (await res.json()) as { message?: string };
      if (err?.message) message = `Kick: ${err.message}`;
    } catch {
      /* keep status message */
    }
    if (res.status === 401 || res.status === 403) {
      message += ' — reconnect Kick on the Connections page';
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

/** The authenticated user (no ids ⇒ the token owner). */
export async function getKickSelf(token: string): Promise<{ userId: number; name: string }> {
  const data = (await kickFetch(token, 'GET', '/users')) as {
    data?: { user_id: number; name: string }[];
  };
  const self = data?.data?.[0];
  if (!self?.user_id) throw new Error('Could not resolve your Kick account');
  return { userId: self.user_id, name: self.name };
}

export async function kickSendMessage(
  token: string,
  broadcasterUserId: number,
  content: string,
  replyToMessageId?: string
): Promise<void> {
  await kickFetch(token, 'POST', '/chat', {
    content: content.slice(0, 500),
    type: 'user',
    broadcaster_user_id: broadcasterUserId,
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  });
}

/** Ban (omit durationMin) or timeout (durationMin 1–10080) a user. */
export async function kickBan(
  token: string,
  broadcasterUserId: number,
  userId: number,
  durationMin?: number,
  reason?: string
): Promise<void> {
  await kickFetch(token, 'POST', '/moderation/bans', {
    broadcaster_user_id: broadcasterUserId,
    user_id: userId,
    ...(durationMin ? { duration: Math.min(10080, Math.max(1, durationMin)) } : {}),
    ...(reason ? { reason: reason.slice(0, 100) } : {}),
  });
}

export async function kickUnban(
  token: string,
  broadcasterUserId: number,
  userId: number
): Promise<void> {
  await kickFetch(token, 'DELETE', '/moderation/bans', {
    broadcaster_user_id: broadcasterUserId,
    user_id: userId,
  });
}
