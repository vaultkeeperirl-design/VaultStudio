import { act, fireEvent, render, screen } from '@testing-library/react';
import type { VaultStudioAPI } from '../../types';

vi.mock('../../pages/StudioPage', () => ({ StudioPage: () => <div>Studio loaded</div> }));
vi.mock('../../pages/settings/SettingsLayout', () => ({ SettingsLayout: () => <div>Settings</div> }));

function installAppApi() {
  const api = {
    obs: {
      getConnectionState: vi.fn().mockResolvedValue({ state: 'connected', obsInstalled: true }),
    },
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as VaultStudioAPI;

  Object.defineProperty(window, 'vaultstudio', { configurable: true, value: api });
  return api;
}

describe('App changelog prompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.location.hash = '#/';
    installAppApi();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    Reflect.deleteProperty(window, 'vaultstudio');
    window.location.hash = '';
  });

  it('shows the changelog after launch and only stores dismissal when dont show again is checked', async () => {
    const { App } = await import('../../App');
    const dismissalKey = `vaultstudio:changelog-dismissed:${__APP_VERSION__}`;

    const firstRun = render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    expect(screen.getByText('Studio loaded')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /vaultstudio changelog/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close changelog/i }));

    expect(localStorage.getItem(dismissalKey)).toBeNull();
    firstRun.unmount();

    const secondRun = render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    expect(screen.getByText('Studio loaded')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /vaultstudio changelog/i })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/don't show again for this version/i));
    fireEvent.click(screen.getByRole('button', { name: /close changelog/i }));

    expect(localStorage.getItem(dismissalKey)).toBe('true');
    secondRun.unmount();

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    expect(screen.getByText('Studio loaded')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /vaultstudio changelog/i })).not.toBeInTheDocument();
  });
});
