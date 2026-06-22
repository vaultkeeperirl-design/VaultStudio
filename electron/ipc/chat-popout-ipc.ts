import { ipcMain } from 'electron';
import { chatPopout } from '../services/chat-popout';

export function registerChatPopoutIpc() {
  ipcMain.handle('chatPopout:get', () => chatPopout.getConfig());
  ipcMain.handle('chatPopout:update', (_e, patch: Record<string, unknown>) =>
    chatPopout.updateConfig(patch)
  );
  ipcMain.handle('chatPopout:show', () => chatPopout.show());
  ipcMain.handle('chatPopout:hide', () => {
    chatPopout.hide();
  });
}
