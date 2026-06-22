import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const testState = vi.hoisted(() => ({
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => testState.userData),
  },
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    createVerify: vi.fn(() => ({
      update: vi.fn(),
      end: vi.fn(),
      verify: vi.fn((_publicKey: string, signature: string) => signature === 'VALID_SIGNATURE'),
    })),
  };
});

async function loadLicenseService() {
  return import('./license-service');
}

function licensePath() {
  return path.join(testState.userData, 'license.json');
}

describe('licenseService persistence and tier policy', () => {
  beforeEach(() => {
    testState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultstudio-license-'));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(testState.userData, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('loads an activated Lifetime Pro key from persisted userData', async () => {
    let mod = await loadLicenseService();

    expect(
      mod.licenseService.activate('VS-PRO-AAAA-BBBB-CCCC-DDDD', 'VALID_SIGNATURE')
    ).toEqual({ ok: true });

    vi.resetModules();
    mod = await loadLicenseService();

    expect(mod.licenseService.getInfo()).toEqual(
      expect.objectContaining({
        activated: true,
        valid: true,
        tier: 'pro',
        key: 'VS-PRO-AAAA-BBBB-CCCC-DDDD',
        maxTargets: Number.POSITIVE_INFINITY,
      })
    );
  });

  it('deactivates persisted licenses back to the free tier', async () => {
    const { licenseService } = await loadLicenseService();

    licenseService.activate('VS-PRO-AAAA-BBBB-CCCC-DDDD', 'VALID_SIGNATURE');
    licenseService.deactivate();

    expect(fs.existsSync(licensePath())).toBe(false);
    expect(licenseService.getInfo()).toEqual(
      expect.objectContaining({
        activated: false,
        valid: false,
        tier: 'free',
        maxTargets: 3,
      })
    );
  });

  it('keeps signed free keys capped at 3 stream targets and dashboard platforms', async () => {
    const { licenseService } = await loadLicenseService();

    licenseService.activate('VS-FREE-AAAA-BBBB-CCCC-DDDD', 'VALID_SIGNATURE');

    expect(licenseService.getInfo()).toEqual(
      expect.objectContaining({
        activated: true,
        valid: true,
        tier: 'free',
        maxTargets: 3,
      })
    );
    expect(licenseService.canAddTarget(3)).toBe(false);
    expect(licenseService.canEnableDashboard(3)).toBe(false);
    expect(licenseService.getMaxDashboard()).toBe(3);
  });

  it('does not trust a mutable stored payload tier over the signed key prefix', async () => {
    fs.writeFileSync(
      licensePath(),
      JSON.stringify(
        {
          key: 'VS-FREE-AAAA-BBBB-CCCC-DDDD',
          signature: 'VALID_SIGNATURE',
          payload: JSON.stringify({
            tier: 'pro',
            key: 'VS-FREE-AAAA-BBBB-CCCC-DDDD',
            issuedAt: '2026-06-22T00:00:00.000Z',
            expiresAt: null,
          }),
        },
        null,
        2
      ),
      'utf-8'
    );

    const { licenseService } = await loadLicenseService();

    expect(licenseService.getInfo()).toEqual(
      expect.objectContaining({
        activated: true,
        valid: true,
        tier: 'free',
        maxTargets: 3,
      })
    );
    expect(licenseService.canEnableDashboard(3)).toBe(false);
  });
});
