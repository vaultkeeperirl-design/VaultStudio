/**
 * Shared Twitch Helix helpers.
 *
 * Validates the user-supplied OAuth token against id.twitch.tv (which yields
 * the client-id, the token's user id/login and its granted scopes — no separate
 * app registration needed) and makes authenticated Helix calls. Used by both
 * chat moderation (twitch-mod.ts) and EventSub follower alerts
 * (twitch-eventsub.ts) so they share one token-validation + client-id path.
 */

export type TwitchTokenInfo = {
  clientId: string;
  userId: string;
  login: string;
  scopes: string[];
  at: number;
};

/** Error thrown by helix() — carries the HTTP status so callers can branch. */
export class TwitchApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TwitchApiError';
    this.status = status;
  }
}

let tokenInfoCache: { token: string; info: TwitchTokenInfo } | null = null;
const userIdCache = new Map<string, string>();

export function normalizeToken(token: string): string {
  return token.replace(/^oauth:/i, '');
}

export async function validateToken(token: string): Promise<TwitchTokenInfo> {
  const t = normalizeToken(token);
  if (tokenInfoCache && tokenInfoCache.token === t && Date.now() - tokenInfoCache.info.at < 600000) {
    return tokenInfoCache.info;
  }
  const res = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${t}` },
  });
  if (!res.ok) throw new Error('Twitch token is invalid or expired — reconnect on the Connections page');
  const d = await res.json();
  const info: TwitchTokenInfo = {
    clientId: d.client_id,
    userId: d.user_id,
    login: d.login,
    scopes: d.scopes || [],
    at: Date.now(),
  };
  tokenInfoCache = { token: t, info };
  return info;
}

export async function helix(
  token: string,
  clientId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${normalizeToken(token)}`,
      'Client-Id': clientId,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Twitch API error ${res.status}`;
    try {
      const err = await res.json();
      if (err?.message) message = `Twitch: ${err.message}`;
    } catch {
      /* keep the status message */
    }
    if (res.status === 401 || res.status === 403) {
      message += ' — your token may be missing the required scopes (reconnect on the Connections page)';
    }
    throw new TwitchApiError(message, res.status);
  }
  return res.status === 204 ? null : res.json();
}

export async function resolveUserId(token: string, clientId: string, login: string): Promise<string> {
  const key = login.toLowerCase();
  const cached = userIdCache.get(key);
  if (cached) return cached;
  const data = (await helix(token, clientId, 'GET', `users?login=${encodeURIComponent(key)}`)) as {
    data?: { id: string }[];
  };
  const id = data?.data?.[0]?.id;
  if (!id) throw new Error(`Twitch user not found: ${login}`);
  userIdCache.set(key, id);
  return id;
}
