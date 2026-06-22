/**
 * One-click YouTube login via Google OAuth 2.0 (authorization code + PKCE)
 * through the system browser + loopback capture (see oauth-loopback.ts). Google
 * refuses OAuth inside embedded windows, so the system browser is mandatory.
 * Desktop clients need no client secret. access_type=offline + prompt=consent
 * yield a refresh token so the ~1h access token can be renewed silently.
 *
 * The Client ID is a "Desktop app" OAuth client created in Google Cloud Console
 * (with the YouTube Data API v3 enabled and the youtube.force-ssl scope on the
 * consent screen).
 */
import {
  captureAuthCode,
  generatePkce,
  randomState,
  OAUTH_LOOPBACK_PORT,
  OAUTH_LOOPBACK_PATH,
} from './oauth-loopback';
import { getYouTubeSelf } from './youtube-api';

export const GOOGLE_CLIENT_ID = process.env.VAULTSTUDIO_GOOGLE_CLIENT_ID || '';
// Desktop clients are issued a secret, but PKCE makes it non-secret; only sent
// if present (some Google projects still validate it).
export const GOOGLE_CLIENT_SECRET = process.env.VAULTSTUDIO_GOOGLE_CLIENT_SECRET || '';
// Google requires a loopback IP literal for desktop clients.
export const GOOGLE_REDIRECT_URI = `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}${OAUTH_LOOPBACK_PATH}`;

export const YOUTUBE_SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleTokenSet = {
  token: string;
  refreshToken?: string;
  expiry?: number;
  scopes: string[];
};

export type YouTubeLoginResult =
  | (GoogleTokenSet & { ok: true; channelId: string; login: string })
  | { ok: false; error: string };

async function postToken(params: Record<string, string>): Promise<GoogleTokenSet> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    let message = `Google token exchange failed (${res.status})`;
    try {
      const err = (await res.json()) as { error_description?: string; error?: string };
      if (err?.error_description || err?.error) message = `Google: ${err.error_description || err.error}`;
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

export async function loginWithYouTube(): Promise<YouTubeLoginResult> {
  if (!GOOGLE_CLIENT_ID) {
    return { ok: false, error: 'No Google Client ID configured for this build.' };
  }
  const { verifier, challenge } = generatePkce();
  const state = randomState();

  const cap = await captureAuthCode({
    redirectUri: GOOGLE_REDIRECT_URI,
    state,
    buildAuthUrl: (redirect) =>
      `${AUTHORIZE_URL}?` +
      new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirect,
        scope: YOUTUBE_SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      }).toString(),
  });
  if (!cap.ok) return { ok: false, error: cap.error };

  try {
    const tokens = await postToken({
      grant_type: 'authorization_code',
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      code_verifier: verifier,
      code: cap.code,
      ...(GOOGLE_CLIENT_SECRET ? { client_secret: GOOGLE_CLIENT_SECRET } : {}),
    });
    const self = await getYouTubeSelf(tokens.token);
    return { ok: true, ...tokens, channelId: self.channelId, login: self.title };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Refresh an expired Google access token. Returns null if not possible. */
export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenSet | null> {
  if (!GOOGLE_CLIENT_ID || !refreshToken) return null;
  try {
    const tokens = await postToken({
      grant_type: 'refresh_token',
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      ...(GOOGLE_CLIENT_SECRET ? { client_secret: GOOGLE_CLIENT_SECRET } : {}),
    });
    // Google omits the refresh_token on refresh responses — keep the old one.
    if (!tokens.refreshToken) tokens.refreshToken = refreshToken;
    return tokens;
  } catch {
    return null;
  }
}
