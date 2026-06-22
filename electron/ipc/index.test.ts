import { describe, expect, it, vi } from 'vitest';

vi.mock('./obs-ipc', () => ({ registerObsIpc: vi.fn() }));
vi.mock('./platform-ipc', () => ({ registerPlatformIpc: vi.fn() }));
vi.mock('./chat-ipc', () => ({ registerChatIpc: vi.fn() }));
vi.mock('./layout-ipc', () => ({ registerLayoutIpc: vi.fn() }));
vi.mock('./settings-ipc', () => ({ registerSettingsIpc: vi.fn() }));
vi.mock('./targets-ipc', () => ({ registerTargetsIpc: vi.fn() }));
vi.mock('./license-ipc', () => ({ registerLicenseIpc: vi.fn() }));
vi.mock('./chat-popout-ipc', () => ({ registerChatPopoutIpc: vi.fn() }));
vi.mock('./update-ipc', () => ({ registerUpdateIpc: vi.fn() }));
vi.mock('./irl-ipc', () => ({ registerIrlIpc: vi.fn() }));
vi.mock('./file-ipc', () => ({ registerFileIpc: vi.fn() }));

import { registerIpcHandlers } from './index';
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

describe('registerIpcHandlers', () => {
  it('registers every renderer API exposed by preload', () => {
    registerIpcHandlers();

    for (const register of [
      registerObsIpc,
      registerPlatformIpc,
      registerChatIpc,
      registerLayoutIpc,
      registerSettingsIpc,
      registerTargetsIpc,
      registerLicenseIpc,
      registerChatPopoutIpc,
      registerUpdateIpc,
      registerIrlIpc,
      registerFileIpc,
    ]) {
      expect(register).toHaveBeenCalledTimes(1);
    }
  });
});
