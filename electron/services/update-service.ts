import { app } from 'electron';

/**
 * Lightweight, signing-free in-app update check.
 *
 * VaultStudio bundles a Windows-only native VSS engine and ships large
 * extraResources, so electron-updater's silent auto-download/install path is a
 * poor fit (and macOS auto-install requires code signing we don't have yet).
 * Instead we fetch a small JSON manifest, compare versions, and — when a newer
 * build exists — point the user at the platform-appropriate installer. The
 * manifest URL is overridable with VAULTSTUDIO_UPDATE_URL for staging/self-host.
 */

export type UpdateManifest = {
  version: string;
  releaseDate?: string;
  notesUrl?: string;
  downloads?: Partial<
    Record<'win32' | 'darwin' | 'linux', string | { url?: string | null } | null>
  >;
};

export type UpdateCheckResult = {
  ok: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  downloadUrl?: string;
  notesUrl?: string;
  error?: string;
};

const DEFAULT_MANIFEST_URL =
  'https://vaultstudio-payments.vaultstudio.workers.dev/latest.json';

function manifestUrl(): string {
  return process.env.VAULTSTUDIO_UPDATE_URL || DEFAULT_MANIFEST_URL;
}

function resolveManifestUrl(raw: string | { url?: string | null } | null | undefined, baseUrl: string) {
  const value = typeof raw === 'string' ? raw : raw?.url;
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function currentVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0';
  }
}

/** Numeric dotted-version compare. Returns 1 if a>b, -1 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const current = currentVersion();
  const url = manifestUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) {
      return { ok: false, currentVersion: current, updateAvailable: false, error: `HTTP ${res.status}` };
    }
    const manifest = (await res.json()) as UpdateManifest;
    const latest = String(manifest.version || '').trim();
    if (!latest) {
      return { ok: false, currentVersion: current, updateAvailable: false, error: 'Manifest missing version' };
    }
    const platform = process.platform as 'win32' | 'darwin' | 'linux';
    const notesUrl = resolveManifestUrl(manifest.notesUrl, url);
    const perPlatform = resolveManifestUrl(manifest.downloads?.[platform], url);
    const updateAvailable = compareVersions(latest, current) > 0;
    return {
      ok: true,
      currentVersion: current,
      latestVersion: latest,
      updateAvailable,
      // Prefer the platform installer; fall back to the release-notes page so
      // the "Download" action always lands somewhere useful.
      downloadUrl: perPlatform || notesUrl,
      notesUrl,
    };
  } catch (e) {
    return {
      ok: false,
      currentVersion: current,
      updateAvailable: false,
      error: e instanceof Error ? e.message : 'Update check failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}
