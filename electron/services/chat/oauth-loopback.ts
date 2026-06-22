/**
 * Shared OAuth 2.0 "authorization code + PKCE" flow for desktop apps.
 *
 * Unlike Twitch (implicit grant in a child window), Kick and Google require a
 * real authorization-code exchange, and Google flatly refuses to run its login
 * inside an embedded Electron window ("disallowed_useragent"). So the correct
 * desktop pattern is used here: open the user's actual system browser to the
 * provider's login page, and catch the redirect on a short-lived loopback HTTP
 * server. PKCE (S256) means no client secret is needed — these ship as public
 * clients.
 *
 * This module only handles the generic dance (PKCE + browser + loopback capture
 * of the `code`). Each platform builds its own authorize URL and performs its
 * own token POST, since endpoints and parameters differ.
 */
import { shell } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';

/** Fixed loopback port. Kick must have http://localhost:9876/callback in its
 *  registered redirect URLs; Google Desktop clients allow any loopback URI. */
export const OAUTH_LOOPBACK_PORT = 9876;
export const OAUTH_LOOPBACK_PATH = '/callback';

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomState(): string {
  return crypto.randomBytes(16).toString('hex');
}

const DONE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>VaultStudio</title>
<style>body{background:#0e0e10;color:#e6e6e6;font-family:system-ui,Segoe UI,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center}.card h1{color:#d6a23a;font-size:20px}</style></head>
<body><div class="card"><h1>✓ Connected to VaultStudio</h1>
<p>You can close this tab and return to the app.</p></div>
<script>window.setTimeout(function(){window.close()},800)</script></body></html>`;

export type LoopbackResult = { ok: true; code: string } | { ok: false; error: string };

/**
 * Open `buildAuthUrl(redirectUri)` in the system browser and resolve with the
 * `code` query param sent back to the loopback server (or an error / cancel).
 */
export async function captureAuthCode(opts: {
  redirectUri: string;
  state: string;
  buildAuthUrl: (redirectUri: string) => string;
  timeoutMs?: number;
}): Promise<LoopbackResult> {
  return new Promise<LoopbackResult>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${OAUTH_LOOPBACK_PORT}`);
      if (url.pathname !== OAUTH_LOOPBACK_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DONE_PAGE);

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      if (error) return finish({ ok: false, error });
      if (returnedState !== opts.state) return finish({ ok: false, error: 'Login state mismatch — please try again' });
      if (!code) return finish({ ok: false, error: 'No authorization code returned' });
      finish({ ok: true, code });
    });

    const finish = (result: LoopbackResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* already closing */
      }
      resolve(result);
    };

    server.on('error', (e) =>
      finish({ ok: false, error: `Could not start the local login listener: ${e.message}` })
    );

    // Bind to 127.0.0.1 — the browser reaches it via both localhost and
    // 127.0.0.1 redirect URIs (Kick uses localhost, Google uses 127.0.0.1).
    server.listen(OAUTH_LOOPBACK_PORT, '127.0.0.1', () => {
      void shell.openExternal(opts.buildAuthUrl(opts.redirectUri));
    });

    timer = setTimeout(() => finish({ ok: false, error: 'cancelled' }), opts.timeoutMs ?? 180000);
  });
}
