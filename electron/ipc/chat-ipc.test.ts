import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../services/platform-manager', () => ({
  platformManager: {
    sendChat: vi.fn(),
    getChatBuffer: vi.fn(() => []),
    getActivityBuffer: vi.fn(() => []),
    applyModeration: vi.fn(),
    clearChatHistory: vi.fn(() => ({ ok: true })),
  },
}));

vi.mock('../services/chat/twitch-mod', () => ({
  twitchModerate: vi.fn().mockResolvedValue({ ok: true }),
}));

import { registerChatIpc } from './chat-ipc';
import { platformManager } from '../services/platform-manager';
import { twitchModerate } from '../services/chat/twitch-mod';

describe('chat IPC moderation', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    registerChatIpc();
  });

  it('removes a deleted message from local chat after Twitch moderation succeeds', async () => {
    await handlers.get('chat:moderate')?.({}, 'delete', { messageId: 'msg-1', username: 'viewer' });

    expect(twitchModerate).toHaveBeenCalledWith('delete', { messageId: 'msg-1', username: 'viewer' });
    expect(platformManager.applyModeration).toHaveBeenCalledWith({
      action: 'delete',
      platform: 'twitch',
      messageId: 'msg-1',
    });
  });

  it('removes prior user messages from local chat after a timeout or ban succeeds', async () => {
    await handlers.get('chat:moderate')?.({}, 'ban', { username: 'BadUser' });

    expect(platformManager.applyModeration).toHaveBeenCalledWith({
      action: 'clear-user',
      platform: 'twitch',
      username: 'BadUser',
    });
  });

  it('does not remove messages after a failed moderation call', async () => {
    vi.mocked(twitchModerate).mockResolvedValueOnce({ ok: false, error: 'no scope' });

    await handlers.get('chat:moderate')?.({}, 'delete', { messageId: 'msg-1', username: 'viewer' });

    expect(platformManager.applyModeration).not.toHaveBeenCalled();
  });

  it('clears local chat history through IPC', async () => {
    const result = await handlers.get('chat:clearHistory')?.({});

    expect(platformManager.clearChatHistory).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
