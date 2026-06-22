import { describe, expect, it, vi } from 'vitest';
import { TwitchChat } from './twitch-chat';

describe('TwitchChat moderation events', () => {
  it('emits a delete moderation event from CLEARMSG', () => {
    const chat = new TwitchChat({ channel: 'vault' });
    const moderation = vi.fn();
    chat.on('moderation', moderation);

    // @ts-expect-error exercise IRC parser boundary
    chat.handleLine('@target-msg-id=msg-1 :tmi.twitch.tv CLEARMSG #vault :deleted text');

    expect(moderation).toHaveBeenCalledWith({
      action: 'delete',
      platform: 'twitch',
      channelId: 'vault',
      messageId: 'msg-1',
    });
  });

  it('emits a clear-user moderation event from CLEARCHAT bans or timeouts', () => {
    const chat = new TwitchChat({ channel: 'vault' });
    const moderation = vi.fn();
    chat.on('moderation', moderation);

    // @ts-expect-error exercise IRC parser boundary
    chat.handleLine('@ban-duration=600 :tmi.twitch.tv CLEARCHAT #vault :BadUser');

    expect(moderation).toHaveBeenCalledWith({
      action: 'clear-user',
      platform: 'twitch',
      channelId: 'vault',
      username: 'BadUser',
    });
  });
});
