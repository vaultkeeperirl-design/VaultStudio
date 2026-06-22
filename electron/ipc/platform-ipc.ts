import { ipcMain, BrowserWindow } from 'electron';
import { platformManager } from '../services/platform-manager';
import { store, type PlatformConnection } from '../services/store';
import { licenseService } from '../services/license-service';
import { loginWithTwitch } from '../services/chat/twitch-oauth';
import { loginWithKick } from '../services/chat/kick-oauth';
import { loginWithYouTube } from '../services/chat/youtube-oauth';

function visibleDashboardCount(excludePlatform?: string): number {
  return store
    .getConnections()
    .filter((c) => c.platform !== excludePlatform && c.dashboardEnabled !== false).length;
}

function applyDashboardGate(connection: PlatformConnection): PlatformConnection {
  const wantsDashboard = connection.dashboardEnabled !== false;
  if (!wantsDashboard) return { ...connection, dashboardEnabled: false };
  return {
    ...connection,
    dashboardEnabled: licenseService.canEnableDashboard(visibleDashboardCount(connection.platform)),
  };
}

export function registerPlatformIpc() {
  ipcMain.handle('platforms:getConnections', () => ({
    connections: store.getConnections().map((c) => ({
      platform: c.platform,
      channel: c.channel,
      username: c.username,
      hasToken: Boolean(c.token),
      enabled: c.enabled,
      dashboardEnabled: c.dashboardEnabled !== false,
    })),
    statuses: platformManager.getStatuses(),
  }));

  ipcMain.handle('platforms:connect', (_e, connection: PlatformConnection) => {
    platformManager.connect(applyDashboardGate(connection));
    return platformManager.getStatuses();
  });

  ipcMain.handle('platforms:disconnect', (_e, platform: string) => {
    platformManager.disconnect(platform);
    return platformManager.getStatuses();
  });

  // One-click OAuth login. Opens the platform's hosted login + consent screen
  // in a child window and, on success, stores the resulting token against the
  // platform connection so chat send + moderation light up automatically.
  ipcMain.handle('platforms:oauthLogin', async (e, platform: string) => {
    const cancelled = (error: string) => ({ ok: false as const, error: error === 'cancelled' ? undefined : error });
    const existing = store.getConnections().find((c) => c.platform === platform);
    const dashboardEnabled = existing?.dashboardEnabled !== false;
    const done = (connection: PlatformConnection, login: string, scopes: string[]) => {
      platformManager.connect(applyDashboardGate(connection));
      return { ok: true, login, channel: connection.channel, scopes, statuses: platformManager.getStatuses() };
    };

    if (platform === 'twitch') {
      const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const result = await loginWithTwitch(parent);
      if (!result.ok) return cancelled(result.error);
      return done(
        {
          platform: 'twitch',
          // Keep moderating whatever channel was set; default to the
          // logged-in user's own channel on first login.
          channel: existing?.channel || result.login,
          username: result.login,
          token: result.token,
          enabled: true,
          dashboardEnabled,
        },
        result.login,
        result.scopes
      );
    }

    if (platform === 'kick') {
      const result = await loginWithKick();
      if (!result.ok) return cancelled(result.error);
      return done(
        {
          platform: 'kick',
          channel: existing?.channel || result.login.toLowerCase(),
          username: result.login,
          oauthToken: result.token,
          refreshToken: result.refreshToken,
          tokenExpiry: result.expiry,
          userId: String(result.userId),
          enabled: true,
          dashboardEnabled,
        },
        result.login,
        result.scopes
      );
    }

    if (platform === 'youtube') {
      const result = await loginWithYouTube();
      if (!result.ok) return cancelled(result.error);
      return done(
        {
          platform: 'youtube',
          channel: existing?.channel || result.channelId,
          username: result.login,
          token: existing?.token, // preserve any API key for stats fallback
          oauthToken: result.token,
          refreshToken: result.refreshToken,
          tokenExpiry: result.expiry,
          userId: result.channelId,
          enabled: true,
          dashboardEnabled,
        },
        result.login,
        result.scopes
      );
    }

    return { ok: false, error: `One-click login isn't available for ${platform} yet.` };
  });

  // Log out: drop the send/mod credentials so chat reverts to read-only, but
  // keep reading the same channel's chat and its dashboard placement.
  ipcMain.handle('platforms:oauthLogout', (_e, platform: string) => {
    const conn = store.getConnections().find((c) => c.platform === platform);
    if (!conn) return { ok: true, statuses: platformManager.getStatuses() };
    const base = {
      platform: conn.platform,
      channel: conn.channel,
      enabled: true,
      dashboardEnabled: conn.dashboardEnabled !== false,
    };
    if (platform === 'twitch') {
      platformManager.connect({ ...base, username: undefined, token: undefined });
    } else {
      // Kick/YouTube: clear OAuth creds, keep read config (e.g. YouTube API key).
      platformManager.connect({
        ...base,
        token: conn.token,
        oauthToken: undefined,
        refreshToken: undefined,
        tokenExpiry: undefined,
        userId: undefined,
      });
    }
    return { ok: true, statuses: platformManager.getStatuses() };
  });

  ipcMain.handle('platforms:getStats', () => platformManager.getCombinedStats());

  ipcMain.handle('platforms:setDashboardEnabled', (_e, platform: string, enabled: boolean) => {
    if (enabled) {
      if (!licenseService.canEnableDashboard(visibleDashboardCount(platform))) {
        return { ok: false, error: `Free includes ${licenseService.getMaxDashboard()} dashboard platforms. Activate Lifetime Pro for unlimited dashboard platforms.` };
      }
    }
    store.setDashboardEnabled(platform, enabled);
    const connections = store.getConnections();
    const visibility = connections.reduce<Record<string, boolean>>((acc, c) => {
      acc[c.platform] = c.dashboardEnabled !== false;
      return acc;
    }, {});
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('platforms:visibilityChanged', visibility);
    }
    return { ok: true };
  });
}
