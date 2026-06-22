/**
 * One-click Kick login via OAuth 2.1 (authorization code + PKCE) through the
 * system browser + loopback capture (see oauth-loopback.ts). Public client —
 * PKCE replaces the client secret. The resulting token carries chat:write +
 * moderation scopes so send + ban/timeout light up after login.
 *
 * The Client ID belongs to the VaultStudio app registered at the Kick developer
 * dashboard; the redirect URI below must be listed there exactly.
 */
import {
  captureAuthCode,
  generatePkce,
  randomState,
  OAUTH_LOOPBACK_PORT,
  OAUTH_LOOPBACK_PATH,
} from './oauth-loopback';
import { getKickSelf } from './kick-api';

export const KICK_CLIENT_ID =
  process.env.VAULTSTUDIO_KICK_CLIENT_ID || '01KVNJNM4W62TYTKZ3F4XFHT9N';
// Kick issues a client secret to every app and its token endpoint requires it
// (PKCE is still used in addition). Embedded for this build; override via env.
export const KICK_CLIENT_SECRET =
  process.env.VAULTSTUDIO_KICK_CLIENT_SECRET ||
  'b6d973c1d81b9f672d4ae0d0ff7429c75372c89dd6b35d3f2a62e56be6b430fd';
export const KICK_REDIRECT_URI =
  process.env.VAULTSTUDIO_KICK_REDIRECT_URI ||
  `http://localhost:${OAUTH_LOOPBACK_PORT}${OAUTH_LOOPBACK_PATH}`;

export const KICK_SCOPES = [
  'user:read',
  'chat:write',
  'moderation:ban',
  'moderation:chat_message:manage',
];

const AUTHORIZE_URL = 'https://id.kick.com/oauth/authorize';
const TOKEN_URL = 'https://id.kick.com/oauth/token';

export type KickTokenSet = {
  token: string;
  refreshToken?: string;
  expiry?: number; // epoch ms
  scopes: string[];
};

export type KickLoginResult =
  | (KickTokenSet & { ok: true; userId: number; login: string })
  | { ok: false; error: string };

async function postToken(params: Record<string, string>): Promise<KickTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    let message = `Kick token exchange failed (${res.status})`;
    try {
      const err = (await res.json()) as { error_description?: string; error?: string };
      if (err?.error_description || err?.error) message = `Kick: ${err.error_description || err.error}`;
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }
  const d = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    token: d.access_token,
    refreshToken: d.refresh_token,
    expiry: d.expires_in ? Date.now() + d.expires_in * 1000 : undefined,
    scopes: (d.scope || '').split(' ').filter(Boolean),
  };
}

export async function loginWithKick(): Promise<KickLoginResult> {
  if (!KICK_CLIENT_ID) {
    return { ok: false, error: 'No Kick Client ID configured for this build.' };
  }
  const { verifier, challenge } = generatePkce();
  const state = randomState();

  const cap = await captureAuthCode({
    redirectUri: KICK_REDIRECT_URI,
    state,
    buildAuthUrl: (redirect) =>
      `${AUTHORIZE_URL}?` +
      new URLSearchParams({
        client_id: KICK_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirect,
        scope: KICK_SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      }).toString(),
  });
  if (!cap.ok) return { ok: false, error: cap.error };

  try {
    const tokens = await postToken({
      grant_type: 'authorization_code',
      client_id: KICK_CLIENT_ID,
      redirect_uri: KICK_REDIRECT_URI,
      code_verifier: verifier,
      code: cap.code,
      ...(KICK_CLIENT_SECRET ? { client_secret: KICK_CLIENT_SECRET } : {}),
    });
    const self = await getKickSelf(tokens.token);
    return { ok: true, ...tokens, userId: self.userId, login: self.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Refresh an expired Kick token. Returns null if refresh isn't possible. */
export async function refreshKickToken(refreshToken: string): Promise<KickTokenSet | null> {
  if (!KICK_CLIENT_ID || !refreshToken) return null;
  try {
    return await postToken({
      grant_type: 'refresh_token',
      client_id: KICK_CLIENT_ID,
      refresh_token: refreshToken,
      ...(KICK_CLIENT_SECRET ? { client_secret: KICK_CLIENT_SECRET } : {}),
    });
  } catch {
    return null;
  }
}
