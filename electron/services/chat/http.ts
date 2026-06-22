/**
 * HTTP helper for platform APIs. Prefers Electron's Chromium network stack
 * (net.fetch) — it presents a genuine Chrome TLS fingerprint, which services
 * behind Cloudflare (Kick) require — and falls back to Node's fetch outside
 * Electron (tests, smoke scripts).
 */
// Match the UA to the bundled Chromium version so it lines up with the genuine
// Chrome TLS fingerprint net.fetch presents. A UA/fingerprint mismatch — or a
// hardcoded UA that ages out — is exactly the kind of signal Cloudflare (Kick)
// uses to start returning 403s. Falls back to a recent stable outside Electron.
function browserUserAgent(): string {
  const chrome =
    (typeof process !== 'undefined' && process.versions && process.versions.chrome) || '132.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

const BROWSER_HEADERS = {
  'User-Agent': browserUserAgent(),
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export function httpGet(url: string): Promise<Response> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { net } = require('electron');
    if (net?.fetch) {
      return net.fetch(url, { headers: BROWSER_HEADERS });
    }
  } catch {
    /* not running inside Electron */
  }
  return fetch(url, { headers: BROWSER_HEADERS });
}
