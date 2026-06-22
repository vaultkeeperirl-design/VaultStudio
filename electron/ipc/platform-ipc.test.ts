import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => undefined),
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock('../services/platform-manager', () => ({
  platformManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatuses: vi.fn(() => []),
    getCombinedStats: vi.fn(() => ({ totalViewers: 0, platforms: [] })),
  },
}));

vi.mock('../services/store', () => ({
  store: {
    getConnections: vi.fn(() => []),
    setDashboardEnabled: vi.fn(),
  },
}));

vi.mock('../services/license-service', () => ({
  licenseService: {
    canEnableDashboard: vi.fn(() => true),
    getMaxDashboard: vi.fn(() => 3),
  },
}));

vi.mock('../services/chat/twitch-oauth', () => ({
  loginWithTwitch: vi.fn(),
}));

vi.mock('../services/chat/kick-oauth', () => ({
  loginWithKick: vi.fn(),
}));

vi.mock('../services/chat/youtube-oauth', () => ({
  loginWithYouTube: vi.fn(),
}));

import { registerPlatformIpc } from './platform-ipc';
import { platformManager } from '../services/platform-manager';
import { store } from '../services/store';
import { licenseService } from '../services/license-service';
import { loginWithTwitch } from '../services/chat/twitch-oauth';

const threeVisibleConnections = [
  { platform: 'twitch', channel: 'a', enabled: true, dashboardEnabled: true },
  { platform: 'kick', channel: 'b', enabled: true, dashboardEnabled: true },
  { platform: 'youtube', channel: 'c', enabled: true, dashboardEnabled: true },
];

describe('platform IPC dashboard gating', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerPlatformIpc();
  });

  it('connects a new fourth platform with dashboard disabled when the free dashboard limit is reached', async () => {
    vi.mocked(store.getConnections).mockReturnValue(threeVisibleConnections as any);
    vi.mocked(licenseService.canEnableDashboard).mockReturnValue(false);

    await handlers.get('platforms:connect')?.({}, {
      platform: 'tiktok',
      channel: 'streamer',
      enabled: true,
      dashboardEnabled: true,
    });

    expect(platformManager.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'tiktok',
        dashboardEnabled: false,
      })
    );
  });

  it('keeps OAuth login usable but dashboard-hidden when the free dashboard limit is reached', async () => {
    vi.mocked(store.getConnections).mockReturnValue(threeVisibleConnections as any);
    vi.mocked(licenseService.canEnableDashboard).mockReturnValue(false);
    vi.mocked(loginWithTwitch).mockResolvedValue({
      ok: true,
      login: 'newstreamer',
      token: 'oauth-token',
      scopes: ['chat:read'],
    });

    const result = await handlers.get('platforms:oauthLogin')?.({ sender: {} }, 'twitch');

    expect(result).toEqual(expect.objectContaining({ ok: true, login: 'newstreamer' }));
    expect(platformManager.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'twitch',
        dashboardEnabled: false,
      })
    );
  });

  it('rejects dashboard re-enable attempts once three free dashboard platforms are already visible', async () => {
    vi.mocked(store.getConnections).mockReturnValue([
      ...threeVisibleConnections,
      { platform: 'tiktok', channel: 'd', enabled: true, dashboardEnabled: false },
    ] as any);
    vi.mocked(licenseService.canEnableDashboard).mockReturnValue(false);

    const result = await handlers.get('platforms:setDashboardEnabled')?.({}, 'tiktok', true);

    expect(result).toEqual({
      ok: false,
      error: 'Free includes 3 dashboard platforms. Activate Lifetime Pro for unlimited dashboard platforms.',
    });
    expect(store.setDashboardEnabled).not.toHaveBeenCalled();
  });
});
