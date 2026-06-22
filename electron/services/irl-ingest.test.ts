import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { IrlIngest, type IrlConfigStore, type IrlObsEngine } from './irl-ingest';

class FakeSession {
  socket = { bytesRead: 0 };
  reject = vi.fn();
}

class FakeMediaServer extends EventEmitter {
  session = new FakeSession();
  run = vi.fn();
  stop = vi.fn();
  getSession = vi.fn(() => this.session);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createSubject(configPatch: Partial<ReturnType<IrlConfigStore['getIrl']>> = {}) {
  let cfg: ReturnType<IrlConfigStore['getIrl']> = {
    enabled: true,
    port: 1935,
    streamKey: 'phone-key',
    brbSceneName: 'BRB',
    lowBitrateSceneName: '',
    lowBitrateKbps: 400,
    autoSwitchBack: true,
    ...configPatch,
  };
  let server: FakeMediaServer | null = null;
  const store: IrlConfigStore = {
    getIrl: vi.fn(() => ({ ...cfg })),
    updateIrl: vi.fn((patch) => {
      cfg = { ...cfg, ...patch };
    }),
  };
  const obsEngine: IrlObsEngine = {
    isInitialized: vi.fn(() => true),
    getScenes: vi.fn(async () => [
      { id: 'Live', name: 'Live', isActive: true, sources: [] },
      { id: 'BRB', name: 'BRB', isActive: false, sources: [] },
    ]),
    switchScene: vi.fn(async () => undefined),
  };
  const ingest = new IrlIngest({
    store,
    obsEngine,
    createMediaServer: () => {
      server = new FakeMediaServer();
      return server;
    },
    getLocalIp: () => '192.168.1.23',
  });

  return { ingest, obsEngine, server: () => server };
}

describe('IrlIngest', () => {
  it('switches back from BRB when a phone feed reconnects', async () => {
    const { ingest, obsEngine, server } = createSubject();

    ingest.start();
    server()!.emit('prePublish', 'session-1', '/live/phone-key');
    server()!.emit('postPublish', 'session-1');
    await flush();
    server()!.emit('donePublish', 'session-1');
    await flush();

    expect(obsEngine.switchScene).toHaveBeenCalledWith('BRB');
    expect(ingest.getStatus().state).toBe('brb');

    server()!.emit('prePublish', 'session-2', '/live/phone-key');
    server()!.emit('postPublish', 'session-2');
    await flush();

    expect(obsEngine.switchScene).toHaveBeenLastCalledWith('Live');
    expect(ingest.getStatus().state).toBe('live');
  });

  it('switches to the dedicated Low Bitrate scene when incoming bitrate collapses', async () => {
    vi.useFakeTimers();
    try {
      const { ingest, obsEngine, server } = createSubject({ lowBitrateSceneName: 'Low Bitrate' });

      ingest.start();
      server()!.emit('prePublish', 'session-1', '/live/phone-key');
      server()!.emit('postPublish', 'session-1');
      await vi.advanceTimersByTimeAsync(0);

      // Bytes are non-zero (so the first sample establishes a baseline) but never
      // advance — every later sample is 0 kbps, i.e. starved. After the baseline
      // plus LOW_POLLS low samples the feed is declared low-bitrate.
      server()!.session.socket.bytesRead = 5000;
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(2000);

      expect(obsEngine.switchScene).toHaveBeenCalledWith('Low Bitrate');
      expect(obsEngine.switchScene).not.toHaveBeenCalledWith('BRB');
      expect(ingest.getStatus().state).toBe('brb');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the BRB scene for low bitrate when no Low Bitrate scene is set', async () => {
    vi.useFakeTimers();
    try {
      const { ingest, obsEngine, server } = createSubject();

      ingest.start();
      server()!.emit('prePublish', 'session-1', '/live/phone-key');
      server()!.emit('postPublish', 'session-1');
      await vi.advanceTimersByTimeAsync(0);

      server()!.session.socket.bytesRead = 5000;
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(2000);

      expect(obsEngine.switchScene).toHaveBeenCalledWith('BRB');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays on BRB after reconnect when auto switch back is disabled', async () => {
    const { ingest, obsEngine, server } = createSubject({ autoSwitchBack: false });

    ingest.start();
    server()!.emit('prePublish', 'session-1', '/live/phone-key');
    server()!.emit('postPublish', 'session-1');
    await flush();
    server()!.emit('donePublish', 'session-1');
    await flush();

    server()!.emit('prePublish', 'session-2', '/live/phone-key');
    server()!.emit('postPublish', 'session-2');
    await flush();

    expect(obsEngine.switchScene).toHaveBeenCalledTimes(1);
    expect(obsEngine.switchScene).toHaveBeenCalledWith('BRB');
    expect(ingest.getStatus().state).toBe('brb');
  });
});
