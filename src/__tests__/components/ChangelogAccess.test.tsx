import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LicenseSection } from '../../pages/settings/sections/LicenseSection';
import type { VaultStudioAPI } from '../../types';

function installSettingsApi() {
  const api = {
    settings: {
      get: vi.fn().mockResolvedValue({
        outputResolution: '1920x1080',
        videoBitrate: 6000,
        audioBitrate: 160,
        fps: 60,
        encoder: 'auto',
        recordingPath: 'D:\\Recordings',
        streamTitle: 'Test stream',
        streamCategory: 'Just Chatting',
        chatPopout: { enabled: true, opacity: 0.88, solidBackground: false },
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    guard: {
      get: vi.fn().mockResolvedValue({ config: { enabled: false, autoReconnect: true, reconnectDelaySec: 5, maxRetries: 20, brbSceneName: '', lowBitrateKbps: 500, autoSwitchBack: true }, status: {} }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    irl: {
      get: vi.fn().mockResolvedValue({ config: { enabled: false, port: 1935, brbSceneName: '', lowBitrateSceneName: '', lowBitrateKbps: 500, autoSwitchBack: true }, status: {} }),
      update: vi.fn().mockResolvedValue({ config: {}, status: {} }),
      setupScenes: vi.fn().mockResolvedValue({ config: {}, status: {}, scenes: [] }),
    },
    obs: {
      getScenes: vi.fn().mockResolvedValue([]),
      getAvailableEncoders: vi.fn().mockResolvedValue([]),
      getActiveEncoder: vi.fn().mockResolvedValue(null),
    },
    chatPopout: {
      update: vi.fn().mockResolvedValue({ enabled: true, opacity: 0.88, solidBackground: false }),
      show: vi.fn().mockResolvedValue(undefined),
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
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as VaultStudioAPI;

  Object.defineProperty(window, 'vaultstudio', { configurable: true, value: api });
  return api;
}

describe('changelog access', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'vaultstudio');
  });

  it('opens the changelog from Settings', async () => {
    installSettingsApi();

    render(
      <MemoryRouter>
        <LicenseSection />
      </MemoryRouter>
    );

    const button = await screen.findByRole('button', { name: /view changelog/i });
    fireEvent.click(button);

    expect(screen.getByRole('dialog', { name: /vaultstudio changelog/i })).toBeInTheDocument();
    expect(screen.getByText(/What changed in/i)).toBeInTheDocument();
    expect(screen.getAllByText(/All Platforms/i).length).toBeGreaterThan(0);
  });
});
