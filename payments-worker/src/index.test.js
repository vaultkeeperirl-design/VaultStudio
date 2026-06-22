import { describe, expect, it, vi } from 'vitest';
import worker, { __test } from './index.js';

describe('payments worker fulfillment', () => {
  it('issues Lifetime Pro keys through the Durable Object allocator', async () => {
    const issue = vi.fn().mockResolvedValue({
      ok: true,
      fullKey: 'VS-PRO-AAAA-BBBB-CCCC-DDDD.signature',
      alreadyIssued: false,
      source: 'generated',
    });
    const env = {
      KEY_ALLOCATOR: {
        getByName: vi.fn(() => ({ issue })),
      },
    };

    const result = await __test.fulfill(env, 'ORDER-123', 'buyer@example.com');

    expect(env.KEY_ALLOCATOR.getByName).toHaveBeenCalledWith('vaultstudio-license-issuer');
    expect(issue).toHaveBeenCalledWith('ORDER-123', 'buyer@example.com');
    expect(result).toEqual({
      ok: true,
      fullKey: 'VS-PRO-AAAA-BBBB-CCCC-DDDD.signature',
      alreadyIssued: false,
      source: 'generated',
      emailed: false,
    });
  });

  it('reports allocator health instead of trusting a non-transactional KV pool count', async () => {
    const health = vi.fn().mockResolvedValue({
      ok: true,
      poolRemaining: 0,
      issuedCount: 12,
      pendingCount: 0,
      autoSigning: true,
    });
    const env = {
      PAYPAL_ENV: 'sandbox',
      LICENSE_PRIVATE_KEY_PEM: 'set',
      KEY_ALLOCATOR: {
        getByName: vi.fn(() => ({ health })),
      },
    };

    await expect(__test.inventoryHealth(env)).resolves.toEqual({
      ok: true,
      env: 'sandbox',
      poolRemaining: 0,
      issuedCount: 12,
      pendingCount: 0,
      autoSigning: true,
    });
  });

  it('serves a hosted buy page that points at the configured PayPal client', async () => {
    const res = await worker.fetch(new Request('https://payments.example.com/buy.html'), {
      PAYPAL_CLIENT_ID: 'sandbox-client-id',
      PRICE_USD: '19.99',
    });

    await expect(res.text()).resolves.toContain('sandbox-client-id');
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('serves an update manifest the in-app updater can read', async () => {
    const res = await worker.fetch(new Request('https://payments.example.com/latest.json'), {
      LATEST_VERSION: '1.5.1',
      SITE_URL: 'https://vaultkeeper.live',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.version).toBe('1.5.1');
    expect(body.downloads.win32).toContain('VaultStudio%20Setup%201.5.1.exe');
    // macOS/Linux are not shipping yet — null keeps the updater on the notes page.
    expect(body.downloads.darwin).toBeNull();
    expect(body.downloads.linux).toBeNull();
  });
});
