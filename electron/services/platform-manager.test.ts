import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/vaultstudio'),
  },
}));

vi.mock('./store', () => ({
  store: {
    getConnections: vi.fn(() => []),
    saveConnections: vi.fn(),
    getSettings: vi.fn(() => ({})),
  },
}));

import { platformManager } from './platform-manager';

describe('platformManager activity dedupe', () => {
  beforeEach(() => {
    platformManager.removeAllListeners();
    // @ts-expect-error reset private test state on the singleton
    platformManager.chatBuffer = [];
    // @ts-expect-error reset private test state on the singleton
    platformManager.activityBuffer = [];
    // @ts-expect-error reset private test state on the singleton
    platformManager.seenMessageIds = new Set();
    // @ts-expect-error reset private test state on the singleton
    platformManager.seenActivityIds = new Set();
    // @ts-expect-error reset private test state on the singleton
    platformManager.historyDirty = false;
  });

  afterEach(() => {
    platformManager.removeAllListeners();
    platformManager.stop();
  });

  it('does not emit the same activity event id twice', () => {
    const handler = vi.fn();
    platformManager.on('activity:event', handler);
    const fakeConnector = new EventEmitter();
    // @ts-expect-error private method
    platformManager.wireConnector('kick:test', fakeConnector);
    const evt = {
      id: 'act-1',
      platform: 'kick',
      type: 'follow',
      username: 'u',
      timestamp: Date.now(),
    };
    fakeConnector.emit('activity', evt);
    fakeConnector.emit('activity', evt);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('tracks realtime-follow connections so the count-delta fallback is suppressed', () => {
    const fakeConnector = new EventEmitter();
    // @ts-expect-error private method
    platformManager.wireConnector('twitch:test', fakeConnector);
    // @ts-expect-error private field
    const keys: Set<string> = platformManager.realtimeFollowKeys;

    fakeConnector.emit('follows:realtime', true);
    expect(keys.has('twitch:test')).toBe(true);

    fakeConnector.emit('follows:realtime', false);
    expect(keys.has('twitch:test')).toBe(false);
  });

  it('removes a deleted message when a connector reports a moderation delete', () => {
    const refresh = vi.fn();
    platformManager.on('chat:refresh', refresh);
    const fakeConnector = new EventEmitter();
    // @ts-expect-error private method
    platformManager.wireConnector('twitch:test', fakeConnector);

    fakeConnector.emit('message', {
      id: 'msg-1',
      platform: 'twitch',
      channelId: 'test',
      username: 'viewer',
      displayName: 'Viewer',
      message: 'remove me',
      timestamp: Date.now(),
    });
    fakeConnector.emit('message', {
      id: 'msg-2',
      platform: 'twitch',
      channelId: 'test',
      username: 'other',
      displayName: 'Other',
      message: 'keep me',
      timestamp: Date.now(),
    });

    fakeConnector.emit('moderation', { action: 'delete', platform: 'twitch', messageId: 'msg-1' });

    expect(refresh).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'msg-2', message: 'keep me' }),
    ]);
    expect(platformManager.getChatBuffer().map((m) => m.id)).toEqual(['msg-2']);
  });

  it('removes previous messages from a banned or timed-out user', () => {
    const refresh = vi.fn();
    platformManager.on('chat:refresh', refresh);
    const fakeConnector = new EventEmitter();
    // @ts-expect-error private method
    platformManager.wireConnector('twitch:test', fakeConnector);

    fakeConnector.emit('message', {
      id: 'bad-1',
      platform: 'twitch',
      channelId: 'test',
      username: 'BadUser',
      displayName: 'BadUser',
      message: 'first',
      timestamp: Date.now(),
    });
    fakeConnector.emit('message', {
      id: 'good-1',
      platform: 'twitch',
      channelId: 'test',
      username: 'GoodUser',
      displayName: 'GoodUser',
      message: 'still here',
      timestamp: Date.now(),
    });
    fakeConnector.emit('message', {
      id: 'bad-2',
      platform: 'twitch',
      channelId: 'test',
      username: 'baduser',
      displayName: 'BadUser',
      message: 'second',
      timestamp: Date.now(),
    });

    fakeConnector.emit('moderation', { action: 'clear-user', platform: 'twitch', username: 'baduser' });

    expect(refresh).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'good-1', message: 'still here' }),
    ]);
    expect(platformManager.getChatBuffer().map((m) => m.id)).toEqual(['good-1']);
  });

  it('clears local chat history and refreshes listeners', () => {
    const refresh = vi.fn();
    platformManager.on('chat:refresh', refresh);
    const fakeConnector = new EventEmitter();
    // @ts-expect-error private method
    platformManager.wireConnector('twitch:test', fakeConnector);

    fakeConnector.emit('message', {
      id: 'msg-1',
      platform: 'twitch',
      channelId: 'test',
      username: 'viewer',
      displayName: 'Viewer',
      message: 'clear me',
      timestamp: Date.now(),
    });

    const result = platformManager.clearChatHistory();

    expect(result).toEqual({ ok: true });
    expect(platformManager.getChatBuffer()).toEqual([]);
    expect(refresh).toHaveBeenCalledWith([]);
  });
});
