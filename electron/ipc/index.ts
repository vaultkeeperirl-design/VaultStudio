import { registerObsIpc } from './obs-ipc';
import { registerPlatformIpc } from './platform-ipc';
import { registerChatIpc } from './chat-ipc';
import { registerLayoutIpc } from './layout-ipc';
import { registerSettingsIpc } from './settings-ipc';
import { registerTargetsIpc } from './targets-ipc';
import { registerLicenseIpc } from './license-ipc';
import { registerChatPopoutIpc } from './chat-popout-ipc';
import { registerUpdateIpc } from './update-ipc';
import { registerIrlIpc } from './irl-ipc';
import { registerFileIpc } from './file-ipc';

export function registerIpcHandlers() {
  registerObsIpc();
  registerPlatformIpc();
  registerChatIpc();
  registerLayoutIpc();
  registerSettingsIpc();
  registerTargetsIpc();
  registerLicenseIpc();
  registerChatPopoutIpc();
  registerUpdateIpc();
  registerIrlIpc();
  registerFileIpc();
}
