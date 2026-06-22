import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AppSettings, GuardConfig, IrlConfig, IrlStatus, VaultStudioAPI } from '../../types';

const settings: AppSettings = {
  streamTitle: 'VaultStudio Stream',
  streamCategory: 'Just Chatting',
  goLiveNotification: true,
  recordingPath: '',
  outputResolution: '1920x1080',
  fps: 60,
  videoBitrate: 6000,
  audioBitrate: 160,
  encoder: 'auto',
  chatPopout: { enabled: true, opacity: 0.88, solidBackground: false },
};

const guard: GuardConfig = {
  enabled: true,
  autoReconnect: true,
  reconnectDelaySec: 5,
  maxRetries: 20,
  brbSceneName: '',
  lowBitrateKbps: 500,
  autoSwitchBack: true,
};

const irl: IrlConfig = {
  enabled: false,
  port: 1935,
  streamKey: '',
  brbSceneName: '',
  lowBitrateSceneName: '',
  lowBitrateKbps: 400,
  autoSwitchBack: true,
};

const irlStatus: IrlStatus = {
  running: false,
  publishing: false,
  state: 'off',
  bitrateKbps: 0,
  ingestUrl: '',
  message: '',
};

function installApi() {
  const api = {
    settings: {
      get: vi.fn().mockResolvedValue(settings),
      update: vi.fn(),
    },
    guard: {
      get: vi.fn().mockResolvedValue({ config: guard, status: { active: false, state: 'idle', retriesUsed: 0, message: '' } }),
      update: vi.fn(),
    },
    irl: {
      get: vi.fn().mockResolvedValue({ config: irl, status: irlStatus }),
      update: vi.fn(),
      setupScenes: vi.fn(),
    },
    obs: {
      getScenes: vi.fn().mockResolvedValue([]),
      getAvailableEncoders: vi.fn().mockResolvedValue([]),
      getActiveEncoder: vi.fn().mockResolvedValue(null),
    },
    chatPopout: {
      update: vi.fn(),
      show: vi.fn(),
    },
    license: {
      getInfo: vi.fn().mockResolvedValue({
        activated: false,
        valid: false,
        tier: 'free',
        key: '',
        maxTargets: 3,
        issuedAt: null,
        expiresAt: null,
      }),
      activate: vi.fn(),
      buyPro: vi.fn(),
      deactivate: vi.fn(),
    },
    targets: {
      list: vi.fn().mockResolvedValue([]),
      platformServers: vi.fn().mockResolvedValue({ twitch: '', kick: '', youtube: '', custom: '' }),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      importFromObs: vi.fn(),
      apply: vi.fn().mockResolvedValue({ ok: true }),
    },
    platforms: {
      getConnections: vi.fn().mockResolvedValue({ connections: [], statuses: [] }),
      connect: vi.fn(),
      disconnect: vi.fn(),
      oauthLogin: vi.fn(),
      oauthLogout: vi.fn(),
      getStats: vi.fn(),
      setDashboardEnabled: vi.fn(),
    },
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as VaultStudioAPI;

  Object.defineProperty(window, 'vaultstudio', { configurable: true, value: api });
  return api;
}

async function renderShell(initial = '/settings/stream') {
  const { SettingsLayout } = await import('../../pages/settings/SettingsLayout');
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/settings/:section" element={<SettingsLayout />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Settings hub layout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Reflect.deleteProperty(window, 'vaultstudio');
  });

  it('renders every category in the sidebar', async () => {
    installApi();
    await renderShell();

    const nav = await screen.findByRole('navigation', { name: /settings categories/i });
    for (const label of ['Stream', 'Destinations', 'Chat & Platforms', 'Reliability', 'Overlay', 'License']) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the section that matches the route', async () => {
    installApi();
    await renderShell('/settings/stream');

    // Stream section's Output panel is visible by default.
    expect(await screen.findByText('Output')).toBeInTheDocument();
  });

  it('marks the active category and switches sections on click', async () => {
    installApi();
    await renderShell('/settings/stream');

    await screen.findByText('Output');

    fireEvent.click(screen.getByRole('button', { name: /chat & platforms/i }));

    // Connections section now renders (its intro copy is unique to that section).
    expect(await screen.findByText(/connect your channels to merge every chat/i)).toBeInTheDocument();
    expect(screen.queryByText('Output')).not.toBeInTheDocument();
    const current = screen.getByRole('button', { name: /chat & platforms/i });
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('falls back to the Stream section for an unknown route', async () => {
    installApi();
    await renderShell('/settings/bogus');

    expect(await screen.findByText('Output')).toBeInTheDocument();
  });
});
