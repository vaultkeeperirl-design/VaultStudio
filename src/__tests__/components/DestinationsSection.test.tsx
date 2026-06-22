import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StreamTarget, VaultStudioAPI } from '../../types';

const PLATFORM_SERVERS = {
  twitch: 'rtmp://a.rtmp.youtube.com/live2',
  kick: 'rtmp://fa723fc1b171.global-contribute.live-video.net/app',
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
  custom: '',
};

function makeTarget(overrides: Partial<StreamTarget> = {}): StreamTarget {
  return {
    id: overrides.id ?? 't1',
    name: overrides.name ?? 'Target 1',
    platform: overrides.platform ?? 'twitch',
    server: overrides.server ?? 'rtmp://example/live',
    streamKey: overrides.streamKey ?? 'key-1',
    enabled: overrides.enabled ?? true,
  };
}

function installTargetsApi(targets: StreamTarget[], license: { valid: boolean; tier: 'free' | 'pro'; maxTargets: number }) {
  let current = [...targets];
  const list = vi.fn().mockImplementation(async () => current);
  const add = vi.fn().mockImplementation(async (t: Omit<StreamTarget, 'id'>) => {
    if (license.tier === 'free' && current.length >= license.maxTargets) {
      return { error: `Free includes ${license.maxTargets} stream targets. Activate Lifetime Pro for unlimited stream targets.` };
    }
    const next = { ...t, id: `t${current.length + 1}` };
    current = [...current, next];
    return next;
  });
  const update = vi.fn().mockImplementation(async (t: StreamTarget) => {
    current = current.map((x) => (x.id === t.id ? t : x));
    return t;
  });
  const remove = vi.fn().mockImplementation(async (id: string) => {
    current = current.filter((x) => x.id !== id);
  });
  const platformServers = vi.fn().mockResolvedValue(PLATFORM_SERVERS);
  const importFromObs = vi.fn().mockImplementation(async () => current);
  const apply = vi.fn().mockResolvedValue({ ok: true });

  const api = {
    targets: { list, add, update, remove, platformServers, importFromObs, apply },
    license: { getInfo: vi.fn().mockResolvedValue(license) },
  } as unknown as Pick<VaultStudioAPI, 'targets' | 'license'>;

  Object.defineProperty(window, 'vaultstudio', { configurable: true, value: api });
  return api;
}

describe('Destinations section free-tier limit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    Reflect.deleteProperty(window, 'vaultstudio');
  });

  it('keeps the Add Stream Target button enabled at the 3-target free limit so the user can swap platforms', async () => {
    const targets = [
      makeTarget({ id: 'a', name: 'Twitch Main' }),
      makeTarget({ id: 'b', name: 'Kick' }),
      makeTarget({ id: 'c', name: 'YouTube' }),
    ];
    installTargetsApi(targets, { valid: false, tier: 'free', maxTargets: 3 });
    const { DestinationsSection } = await import('../../pages/settings/sections/DestinationsSection');

    render(
      <MemoryRouter>
        <DestinationsSection />
      </MemoryRouter>
    );

    await screen.findByText('Twitch Main');

    const addButton = screen.getByRole('button', { name: /add stream target/i });
    expect(addButton).toBeEnabled();
  });

  it('shows a clear upgrade message when a free user tries to add a 4th target', async () => {
    const targets = [
      makeTarget({ id: 'a', name: 'Alpha' }),
      makeTarget({ id: 'b', name: 'Bravo' }),
      makeTarget({ id: 'c', name: 'Charlie' }),
    ];
    const api = installTargetsApi(targets, { valid: false, tier: 'free', maxTargets: 3 });
    const { DestinationsSection } = await import('../../pages/settings/sections/DestinationsSection');

    render(
      <MemoryRouter>
        <DestinationsSection />
      </MemoryRouter>
    );

    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /\+ add stream target/i }));

    expect(await screen.findByText(/remove a target to swap it/i)).toBeInTheDocument();
    expect(api.targets.add).not.toHaveBeenCalled();
  });
});
