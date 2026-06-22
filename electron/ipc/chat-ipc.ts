import { ipcMain } from 'electron';
import { platformManager } from '../services/platform-manager';
import { twitchModerate, type ModAction } from '../services/chat/twitch-mod';
import { kickModerate } from '../services/chat/kick-mod';
import { youtubeModerate } from '../services/chat/youtube-mod';

export function registerChatIpc() {
  ipcMain.handle(
    'chat:moderate',
    async (
      _e,
      action: ModAction,
      opts: { platform?: string; username?: string; messageId?: string; authorId?: string; durationSec?: number }
    ) => {
      const platform = opts.platform || 'twitch';
      const result =
        platform === 'kick'
          ? await kickModerate(action, opts)
          : platform === 'youtube'
            ? await youtubeModerate(action, opts)
            : await twitchModerate(action, opts);
      if (result.ok) {
        // Mirror the action in the local feed so the message/user disappears
        // immediately (Twitch also pushes CLEARMSG/CLEARCHAT; this covers all).
        if (action === 'delete' && opts.messageId) {
          platformManager.applyModeration({ action: 'delete', platform, messageId: opts.messageId });
        }
        if ((action === 'timeout' || action === 'ban') && opts.username) {
          platformManager.applyModeration({ action: 'clear-user', platform, username: opts.username });
        }
      }
      return result;
    }
  );
  // Hide a message from VaultStudio's own feed/overlay only — no platform call,
  // works with no login and on any platform (e.g. Kick). Does not delete it on
  // the source platform.
  ipcMain.handle('chat:hideLocal', (_e, messageId: string) => {
    const removed = platformManager.applyModeration({ action: 'delete', messageId });
    return { ok: removed };
  });
  ipcMain.handle('chat:sendMessage', (_e, message: string, target: string) =>
    platformManager.sendChat(message, target)
  );
  ipcMain.handle('chat:getHistory', () => ({
    messages: platformManager.getChatBuffer(),
    activity: platformManager.getActivityBuffer(),
  }));
  ipcMain.handle('chat:clearHistory', () => platformManager.clearChatHistory());
}
