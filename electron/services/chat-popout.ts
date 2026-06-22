import { BrowserWindow } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { store, type ChatPopoutConfig } from './store';

const DEFAULT_OPACITY = 0.88;
const MIN_OPACITY = 0.35;
const MAX_OPACITY = 1;

type RuntimeConfig = {
  devServerUrl?: string;
  indexPath: string;
  preloadPath: string;
};

export function clampChatPopoutOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_OPACITY;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, Math.round(n * 100) / 100));
}

export function normalizeChatPopoutConfig(value: Partial<ChatPopoutConfig> | undefined): ChatPopoutConfig {
  return {
    enabled: value?.enabled !== false,
    opacity: clampChatPopoutOpacity(value?.opacity ?? DEFAULT_OPACITY),
    solidBackground: value?.solidBackground === true,
  };
}

export function getEffectiveChatPopoutWindowOpacity(config: ChatPopoutConfig): number {
  return config.solidBackground ? 1 : config.opacity;
}

class ChatPopoutService {
  private popoutWindow: BrowserWindow | null = null;
  private mainWindow: BrowserWindow | null = null;
  private runtime: RuntimeConfig | null = null;

  configure(runtime: RuntimeConfig) {
    this.runtime = runtime;
  }

  attachMainWindow(window: BrowserWindow) {
    this.mainWindow = window;

    window.on('minimize', () => {
      this.show();
    });

    const hideIfMainVisible = () => {
      if (!window.isDestroyed() && !window.isMinimized()) this.hide();
    };
    window.on('restore', hideIfMainVisible);
    window.on('show', hideIfMainVisible);
    window.on('focus', hideIfMainVisible);
    window.on('closed', () => {
      this.mainWindow = null;
      this.close();
    });
  }

  getConfig(): ChatPopoutConfig {
    return normalizeChatPopoutConfig(store.getSettings().chatPopout);
  }

  updateConfig(patch: Partial<ChatPopoutConfig>): ChatPopoutConfig {
    const next = normalizeChatPopoutConfig({ ...this.getConfig(), ...patch });
    store.updateSettings({ chatPopout: next });
    if (this.popoutWindow && !this.popoutWindow.isDestroyed()) {
      this.popoutWindow.setOpacity(getEffectiveChatPopoutWindowOpacity(next));
      this.popoutWindow.setBackgroundColor(next.solidBackground ? '#0B0B0D' : '#00000000');
      if (!next.enabled) this.popoutWindow.hide();
    }
    return next;
  }

  show(): ChatPopoutConfig {
    const config = this.getConfig();
    if (!config.enabled) {
      this.hide();
      return config;
    }

    const window = this.ensureWindow();
    window.setOpacity(getEffectiveChatPopoutWindowOpacity(config));
    window.setBackgroundColor(config.solidBackground ? '#0B0B0D' : '#00000000');
    window.setAlwaysOnTop(true, 'screen-saver');
    window.showInactive();
    return config;
  }

  hide() {
    if (this.popoutWindow && !this.popoutWindow.isDestroyed()) {
      this.popoutWindow.hide();
    }
  }

  close() {
    if (this.popoutWindow && !this.popoutWindow.isDestroyed()) {
      this.popoutWindow.close();
    }
    this.popoutWindow = null;
  }

  private ensureWindow(): BrowserWindow {
    if (this.popoutWindow && !this.popoutWindow.isDestroyed()) return this.popoutWindow;
    if (!this.runtime) throw new Error('Chat popout runtime is not configured');

    const options: BrowserWindowConstructorOptions = {
      width: 420,
      height: 620,
      minWidth: 320,
      minHeight: 260,
      title: 'VaultStudio Chat Overlay',
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      webPreferences: {
        preload: this.runtime.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    };

    const window = new BrowserWindow(options);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.on('closed', () => {
      if (this.popoutWindow === window) this.popoutWindow = null;
    });

    if (this.runtime.devServerUrl) {
      window.loadURL(`${this.runtime.devServerUrl}/#/chat-popout`);
    } else {
      window.loadFile(this.runtime.indexPath, { hash: '/chat-popout' });
    }

    this.popoutWindow = window;
    return window;
  }
}

export const chatPopout = new ChatPopoutService();
