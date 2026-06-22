import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VaultStudioAPI } from '../../types';

function installPopoutApi() {
  const api = {
    obs: {
      getConnectionState: vi.fn().mockResolvedValue({ state: 'connected', obsInstalled: true }),
      getOutputStats: vi.fn().mockResolvedValue({
        isStreaming: true,
        isRecording: false,
        bitrateKbps: 6000,
        droppedFrames: 0,
        totalFrames: 1200,
        cpuUsage: 12,
        fps: 60,
        streamDuration: 320,
        targets: [],
      }),
      getScenes: vi.fn().mockResolvedValue([
        { id: 's1', name: 'Starting Soon', sources: [], isActive: true },
        { id: 's2', name: 'BRB', sources: [], isActive: false },
      ]),
      switchScene: vi.fn().mockResolvedValue(undefined),
    },
    chat: {
      getHistory: vi.fn().mockResolvedValue({
        messages: [
          {
            id: 'm1',
            platform: 'twitch',
            channelId: 'vault',
            username: 'mysticlloyd',
            displayName: 'Mysticlloyd',
            message: 'overlay check',
            timestamp: Date.now(),
          },
        ],
        activity: [],
      }),
      sendMessage: vi.fn().mockResolvedValue({ sent: ['twitch'], failed: [] }),
      moderate: vi.fn().mockResolvedValue({ ok: true }),
    },
    platforms: {
      getConnections: vi.fn().mockResolvedValue({
        connections: [{ platform: 'twitch', channel: 'vault', hasToken: true, enabled: true, dashboardEnabled: true }],
        statuses: [{ platform: 'twitch', channel: 'vault', chatConnected: true, canSend: true }],
      }),
      getStats: vi.fn().mockResolvedValue({
        totalViewers: 1734,
        platforms: [
          { platform: 'twitch', viewers: 1284, updatedAt: Date.now() },
          { platform: 'kick', viewers: 450, updatedAt: Date.now() },
        ],
      }),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        chatPopout: { enabled: true, opacity: 0.82 },
      }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    chatPopout: {
      get: vi.fn().mockResolvedValue({ enabled: true, opacity: 0.82, solidBackground: true }),
      update: vi.fn().mockResolvedValue({ enabled: true, opacity: 0.82, solidBackground: true }),
      show: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
    },
    preview: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as VaultStudioAPI;

  Object.defineProperty(window, 'vaultstudio', { configurable: true, value: api });
  return api;
}

describe('Chat popout overlay route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    window.location.hash = '';
    Reflect.deleteProperty(window, 'vaultstudio');
    document.body.removeAttribute('data-view');
  });

  it('renders chat immediately on the popout route without the startup splash', async () => {
    installPopoutApi();
    window.location.hash = '#/chat-popout';
    const { App } = await import('../../App');

    render(<App />);

    expect(await screen.findByText('Chat Overlay')).toBeInTheDocument();
    expect(screen.getByText('Mysticlloyd')).toBeInTheDocument();
    expect(screen.getByText('overlay check')).toBeInTheDocument();
    expect(screen.getByText('1,734 viewers')).toBeInTheDocument();
    expect(screen.getByText('1,734 viewers')).toHaveAttribute('title', 'Twitch: 1,284 viewers\nKick: 450 viewers');
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByLabelText('Time live')).toHaveTextContent('05:20');
    expect(screen.queryByText(/Initializing/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/overlay opacity/i)).toHaveValue('0.82');
    expect(screen.getByLabelText(/solid background/i)).toBeChecked();
  });

  it('shows the VaultStudio logo and keeps stream preview collapsed until requested', async () => {
    const api = installPopoutApi();
    window.location.hash = '#/chat-popout';
    const { App } = await import('../../App');

    render(<App />);

    expect(await screen.findByAltText('VaultStudio')).toBeInTheDocument();
    expect(screen.queryByLabelText('Stream preview')).not.toBeInTheDocument();
    expect(api.preview.start).not.toHaveBeenCalled();

    const previewButton = screen.getByRole('button', { name: /show stream preview/i });
    expect(previewButton).toHaveTextContent(/^Preview$/);

    fireEvent.click(previewButton);

    expect(await screen.findByLabelText('Stream preview')).toBeInTheDocument();
    expect(api.preview.start).toHaveBeenCalledWith({ width: 320, height: 180, fps: 12 });
    expect(screen.getByRole('button', { name: /hide stream preview/i })).toHaveTextContent(/^Preview$/);

    fireEvent.click(screen.getByRole('button', { name: /hide stream preview/i }));

    await waitFor(() => expect(api.preview.stop).toHaveBeenCalled());
  });

  it('switches scenes with the up/down arrows', async () => {
    const api = installPopoutApi();
    window.location.hash = '#/chat-popout';
    const { App } = await import('../../App');

    render(<App />);

    // Active scene name is shown between the arrows.
    expect(await screen.findByText('Starting Soon')).toBeInTheDocument();
    // At the top of the list, the up arrow is disabled.
    expect(screen.getByRole('button', { name: /previous scene/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /next scene/i }));

    await waitFor(() => expect(api.obs.switchScene).toHaveBeenCalledWith('s2'));
    // Optimistic update moves to the last scene, disabling the next arrow.
    await waitFor(() => expect(screen.getByRole('button', { name: /next scene/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /previous scene/i })).not.toBeDisabled();
  });

  it('jumps to the configured BRB scene', async () => {
    const api = installPopoutApi();
    api.guard = { get: vi.fn().mockResolvedValue({ config: { brbSceneName: 'BRB' }, status: {} }) } as never;
    window.location.hash = '#/chat-popout';
    const { App } = await import('../../App');

    render(<App />);

    const brb = await screen.findByRole('button', { name: /switch to brb scene/i });
    fireEvent.click(brb);

    await waitFor(() => expect(api.obs.switchScene).toHaveBeenCalledWith('s2'));
  });
});
