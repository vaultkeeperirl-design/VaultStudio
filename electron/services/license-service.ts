/**
 * Pro Key System — offline license validation via RSA-2048 signatures.
 *
 * License lifecycle:
 *   1. An external key-generator (holding the RSA private key) creates a
 *      license key + RSA-SHA256 signature.
 *   2. The user enters their key in the format `VS-PRO-XXXX-XXXX-XXXX-XXXX`.
 *   3. The signed key is stored alongside metadata in userData.
 *   4. On every startup (and on demand) the key is verified against the
 *      embedded RSA public key — no server, no network.
 *
 * Tiers:
 *   free — max 3 streaming targets
 *   pro  — unlimited streaming targets
 */
import * as crypto from 'crypto';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const KEY_PATTERN = /^VS-(PRO|FREE)-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/;

const FREE_MAX_TARGETS = 3;
const PRO_MAX_TARGETS = Number.POSITIVE_INFINITY;
const FREE_MAX_DASHBOARD = 3;
const PRO_MAX_DASHBOARD = Number.POSITIVE_INFINITY;

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsqRcJwuiRv6weqRwroHZ
22RU+Wz+fWfQl/JGUOeBurKZXz4QgUDL1y4sY3YJ1ZC1UAm9h9dPOjbXxHhwCABm
Mlt4xlEK+rX3cKIMjx9pyR3YIDlkDCSHjxtV0+Tea7UbBv5KDmfhjLH3/U3IhPo0
Qt42Jo8yxQ+L1BcJwv2fBO3Oqi0OfQLsbkkXbH30HzyyByPINi+IfswX/nHmkex+
48QWYCFtOZzqvHTlFkWC9FxeJK45PftgHLh5kFyOgpcx6XuK1+KdnzwGkwFm56Af
RguUnh8ax4JOGiz1hsUS5077lxAZOs1LRqfLHb3Te6qPUct8apk/3bNylfeTd9xG
VQIDAQAB
-----END PUBLIC KEY-----`;

export type LicenseTier = 'free' | 'pro';

export type LicensePayload = {
  tier: LicenseTier;
  key: string;
  issuedAt: string;
  expiresAt: string | null;
};

export type LicenseInfo = {
  activated: boolean;
  valid: boolean;
  tier: LicenseTier;
  key: string;
  maxTargets: number;
  issuedAt: string | null;
  expiresAt: string | null;
};

type StoredLicense = {
  key: string;
  payload: string;
  signature: string;
};

function licenseFilePath(): string {
  return path.join(app.getPath('userData'), 'license.json');
}

export function parseKey(key: string): { tier: LicenseTier; token: string } | null {
  const m = KEY_PATTERN.exec(key.trim().toUpperCase());
  if (!m) return null;
  const tier: LicenseTier = m[1] === 'PRO' ? 'pro' : 'free';
  const token = `${m[2]}${m[3]}${m[4]}${m[5]}`;
  return { tier, token };
}

export function formatKey(tier: LicenseTier, token: string): string {
  const t = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length !== 16) return '';
  const prefix = tier === 'pro' ? 'VS-PRO' : 'VS-FREE';
  return `${prefix}-${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}`;
}

function verifySignature(payloadJson: string, signatureBase64: string): boolean {
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payloadJson, 'utf-8');
    verifier.end();
    return verifier.verify(PUBLIC_KEY_PEM, signatureBase64, 'base64');
  } catch {
    return false;
  }
}

class LicenseService {
  private cached: LicenseInfo | null = null;

  activate(key: string, signatureBase64: string): { ok: boolean; error?: string } {
    const parsed = parseKey(key);
    if (!parsed) {
      return { ok: false, error: 'Invalid key format. Expected VS-PRO-XXXX-XXXX-XXXX-XXXX' };
    }

    const normalizedKey = key.trim().toUpperCase();

    // The generator signs the bare key string — verify exactly that.
    if (!verifySignature(normalizedKey, signatureBase64)) {
      return { ok: false, error: 'License signature verification failed' };
    }

    const payload: LicensePayload = {
      tier: parsed.tier,
      key: normalizedKey,
      issuedAt: new Date().toISOString(),
      expiresAt: null,
    };

    const stored: StoredLicense = {
      key: payload.key,
      payload: JSON.stringify(payload),
      signature: signatureBase64,
    };

    try {
      const filePath = licenseFilePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(stored, null, 2), 'utf-8');
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    this.cached = null;
    return { ok: true };
  }

  deactivate(): void {
    try {
      fs.unlinkSync(licenseFilePath());
    } catch {
      /* file may not exist */
    }
    this.cached = null;
  }

  getInfo(): LicenseInfo {
    if (this.cached) return { ...this.cached };
    const info = this.loadAndValidate();
    this.cached = info;
    return { ...info };
  }

  canAddTarget(currentCount: number): boolean {
    const info = this.getInfo();
    if (!info.valid) return currentCount < FREE_MAX_TARGETS;
    return currentCount < info.maxTargets;
  }

  getMaxTargets(): number {
    const info = this.getInfo();
    return info.valid ? info.maxTargets : FREE_MAX_TARGETS;
  }

  canEnableDashboard(currentVisible: number): boolean {
    const info = this.getInfo();
    if (!info.valid) return currentVisible < FREE_MAX_DASHBOARD;
    return currentVisible < (info.tier === 'pro' ? PRO_MAX_DASHBOARD : FREE_MAX_DASHBOARD);
  }

  getMaxDashboard(): number {
    const info = this.getInfo();
    return info.valid && info.tier === 'pro' ? PRO_MAX_DASHBOARD : FREE_MAX_DASHBOARD;
  }

  private loadAndValidate(): LicenseInfo {
    const freeInfo: LicenseInfo = {
      activated: false,
      valid: false,
      tier: 'free',
      key: '',
      maxTargets: FREE_MAX_TARGETS,
      issuedAt: null,
      expiresAt: null,
    };

    let stored: StoredLicense;
    try {
      const raw = fs.readFileSync(licenseFilePath(), 'utf-8');
      stored = JSON.parse(raw);
    } catch {
      return freeInfo;
    }

    if (!stored.key || !stored.payload || !stored.signature) {
      return freeInfo;
    }

    const parsedKey = parseKey(stored.key);
    if (!parsedKey) {
      return { ...freeInfo, activated: true, key: stored.key };
    }

    // Signature covers the bare key string (matches the key generator).
    if (!verifySignature(stored.key, stored.signature)) {
      return { ...freeInfo, activated: true, key: stored.key };
    }

    let payload: LicensePayload;
    try {
      payload = JSON.parse(stored.payload);
    } catch {
      return freeInfo;
    }

    if (payload.key !== stored.key) {
      return freeInfo;
    }

    if (payload.expiresAt) {
      const expiry = new Date(payload.expiresAt);
      if (expiry.getTime() < Date.now()) {
        return { ...freeInfo, activated: true, key: stored.key };
      }
    }

    const tier = parsedKey.tier;
    return {
      activated: true,
      valid: true,
      tier,
      key: stored.key,
      maxTargets: tier === 'pro' ? PRO_MAX_TARGETS : FREE_MAX_TARGETS,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
  }
}

export const licenseService = new LicenseService();
