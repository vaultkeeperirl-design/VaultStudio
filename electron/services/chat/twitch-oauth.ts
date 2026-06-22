/**
 * One-click Twitch login via the OAuth implicit grant flow.
 *
 * Opens Twitch's authorize page in a modal child window, intercepts the
 * redirect back to our registered localhost URI, and pulls the access token
 * out of the URL fragment. Implicit grant means no client secret is needed —
 * a public desktop client only carries the (non-secret) Client ID. The token
 * is then validated via the shared twitch-api helper to recover the login name
 * and granted scopes.
 *
 * The Client ID belongs to the "VaultStudio" application registered at
 * dev.twitch.tv/console. The redirect URI below must stay byte-for-byte
 * identical to the one registered there, or Twitch rejects the authorize call.
 */
import { BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import { validateToken } from './twitch-api';

/** Public Client ID of the registered VaultStudio Twitch app. Overridable for
 *  forks/self-hosters via env, but the embedded default is what ships. */
export const TWITCH_CLIENT_ID =
  process.env.VAULTSTUDIO_TWITCH_CLIENT_ID || 'x95ga5j9xrcaprxnv2p6m5a9qeoob4';

/** Must exactly match a redirect URI registered on the Twitch app. */
export const TWITCH_REDIRECT_URI =
  process.env.VAULTSTUDIO_TWITCH_REDIRECT_URI || 'http://localhost:9876/callback';

/**
 * Scopes requested at login:
 *   chat:read / chat:edit                  — read + send chat over IRC
 *   moderator:manage:chat_messages         — delete individual messages
 *   moderator:manage:banned_users          — timeout / ban / unban
 *   moderator:read:followers               — real follower names (EventSub)
 */
export const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'moderator:manage:chat_messages',
  'moderator:manage:banned_users',
  'moderator:read:followers',
];

export type TwitchLoginResult =
  | { ok: true; token: string; login: string; scopes: string[] }
  | { ok: false; error: string };

function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT_URI,
    response_type: 'token',
    scope: TWITCH_SCOPES.join(' '),
    state,
    // Always show the consent screen so switching accounts works and a
    // re-login refreshes an expired token cleanly.
    force_verify: 'true',
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

/**
 * Parse the implicit-grant response. The token rides in the URL fragment
 * (#access_token=...), errors in the query string (?error=access_denied).
 */
function parseRedirect(url: string, expectedState: string): TwitchLoginResult | null {
  if (!url.startsWith(TWITCH_REDIRECT_URI)) return null;
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const frag = new URLSearchParams(hash);
  const search = new URLSearchParams(query);

  const error = frag.get('error') || search.get('error');
  if (error) {
    return { ok: false, error: frag.get('error_description') || search.get('error_description') || error };
  }
  const token = frag.get('access_token');
  if (!token) return null; // not the final redirect yet
  const state = frag.get('state') || search.get('state');
  if (state !== expectedState) {
    return { ok: false, error: 'Login state mismatch — please try again' };
  }
  return { ok: true, token, login: '', scopes: [] };
}

/**
 * Drive the full login. Resolves with the validated token + login, or an
 * error (including 'cancelled' if the user closes the window).
 */
export async function loginWithTwitch(parent?: BrowserWindow): Promise<TwitchLoginResult> {
  if (!TWITCH_CLIENT_ID) {
    return { ok: false, error: 'No Twitch Client ID configured for this build.' };
  }

  const state = crypto.randomBytes(16).toString('hex');
  const raw = await new Promise<TwitchLoginResult>((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent,
      modal: Boolean(parent),
      autoHideMenuBar: true,
      title: 'Log in with Twitch',
      backgroundColor: '#0e0e10',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Persist the Twitch session so a second login doesn't force a full
        // username/password re-entry — only the consent screen shows.
        partition: 'persist:twitch-oauth',
      },
    });

    let settled = false;
    const finish = (result: TwitchLoginResult) => {
      if (settled) return;
      settled = true;
      // Defer close so we don't tear down the webContents mid-event.
      setImmediate(() => {
        if (!win.isDestroyed()) win.close();
      });
      resolve(result);
    };

    const onUrl = (url: string, e?: Electron.Event) => {
      const parsed = parseRedirect(url, state);
      if (parsed) {
        e?.preventDefault();
        finish(parsed);
      }
    };

    win.webContents.on('will-redirect', (e, url) => onUrl(url, e));
    win.webContents.on('will-navigate', (e, url) => onUrl(url, e));
    // The localhost redirect has no server, so the load "fails" — but the
    // validated URL still carries the token fragment we need.
    win.webContents.on('did-fail-load', (_e, _code, _desc, validatedURL) => onUrl(validatedURL));
    win.on('closed', () => finish({ ok: false, error: 'cancelled' }));

    void win.loadURL(buildAuthorizeUrl(state));
  });

  if (!raw.ok) return raw;

  // Confirm the token and recover login + actual granted scopes.
  try {
    const info = await validateToken(raw.token);
    return { ok: true, token: raw.token, login: info.login, scopes: info.scopes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
