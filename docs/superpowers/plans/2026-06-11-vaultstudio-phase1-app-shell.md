# VaultStudio Phase 1: App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the VaultStudio desktop app shell with all panels laid out using mock data, dark theme, and VaultStudio branding.

**Architecture:** Electron main process with React renderer. Zustand for state management. Vite for bundling the renderer. All panels render mock data to prove the visual layout works before real integrations are added.

**Tech Stack:** Electron, React 18, TypeScript, Vite, Zustand, styled-components, electron-builder

---

## File Structure

```
VaultStudio/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron-builder.yml
├── electron/
│   ├── main.ts                    # Electron main process entry
│   ├── preload.ts                 # contextBridge IPC API
│   └── ipc/
│       ├── index.ts               # Register all IPC handlers
│       ├── obs-ipc.ts             # OBS IPC (mock)
│       ├── platform-ipc.ts        # Platform IPC (mock)
│       ├── chat-ipc.ts            # Chat IPC (mock)
│       ├── layout-ipc.ts          # Layout IPC (in-memory)
│       └── settings-ipc.ts        # Settings IPC (in-memory)
├── src/
│   ├── index.html                 # HTML entry
│   ├── main.tsx                   # React entry
│   ├── App.tsx                    # Router + layout
│   ├── vite-env.d.ts              # Vite type declarations
│   ├── types/
│   │   └── index.ts               # All shared TypeScript types
│   ├── theme/
│   │   ├── tokens.ts              # Design token constants
│   │   └── GlobalStyles.tsx        # Global CSS reset + theme
│   ├── stores/
│   │   └── studioStore.ts         # Zustand store for studio state
│   ├── mocks/
│   │   └── mockData.ts            # Mock scenes, sources, chat, stats
│   ├── pages/
│   │   ├── StudioPage.tsx         # Main dashboard
│   │   ├── ConnectionsPage.tsx    # Account connections
│   │   └── SettingsPage.tsx       # Stream settings
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Panel.tsx          # Reusable panel wrapper
│   │   │   └── PanelGrid.tsx      # CSS Grid layout for panels
│   │   ├── studio/
│   │   │   ├── PreviewPanel.tsx   # Stream preview (mock canvas)
│   │   │   ├── UnifiedChat.tsx    # Unified chat window
│   │   │   ├── ActivityFeed.tsx   # Activity event feed
│   │   │   ├── SessionInfo.tsx    # Viewer/follower/sub stats
│   │   │   ├── ScenesPanel.tsx    # Scene list + controls
│   │   │   ├── SourcesPanel.tsx   # Source list for active scene
│   │   │   ├── AudioMixer.tsx     # Audio source volume/mute
│   │   │   └── ControlBar.tsx     # Go Live / Record / Stop buttons
│   │   └── common/
│   │       ├── PlatformBadge.tsx  # Twitch/Kick badge
│   │       └── Button.tsx         # Styled button
│   └── __tests__/
│       ├── stores/
│       │   └── studioStore.test.ts
│       └── components/
│           ├── UnifiedChat.test.tsx
│           ├── ActivityFeed.test.tsx
│           ├── SessionInfo.test.tsx
│           ├── ScenesPanel.test.tsx
│           ├── SourcesPanel.test.tsx
│           ├── AudioMixer.test.tsx
│           ├── ControlBar.test.tsx
│           └── PlatformBadge.test.tsx
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `electron-builder.yml`
- Create: `src/vite-env.d.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom zustand styled-components react-router-dom
npm install -D electron electron-builder vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/styled-components vitest @testing-library/react @testing-library/jest-dom jsdom @testing-library/user-event
```

- [ ] **Step 3: Create `package.json` scripts and main field**

Replace the generated `package.json` with:

```json
{
  "name": "vaultstudio",
  "version": "0.1.0",
  "description": "OBS-powered streaming app with built-in multi-platform chat and unified stream stats",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && tsc -p tsconfig.node.json",
    "preview": "vite preview",
    "electron:dev": "vite build && electron .",
    "electron:build": "npm run build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [],
  "license": "UNLICENSED",
  "private": true
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist-electron",
    "rootDir": "electron",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["electron"]
}
```

- [ ] **Step 6: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

- [ ] **Step 7: Create `electron-builder.yml`**

```yaml
appId: com.vaultstudio.app
productName: VaultStudio
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - dist-electron/**/*
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
```

- [ ] **Step 8: Create `src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 9: Create `.gitignore`**

```
node_modules/
dist/
dist-electron/
release/
*.log
.env
.env.local
```

- [ ] **Step 10: Create test setup file `src/__tests__/setup.ts`**

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 11: Verify build tooling works**

```bash
npx tsc --noEmit
```

Expected: No errors (no source files yet, so nothing to check — should pass).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Electron + React + Vite project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create `src/types/index.ts` with all shared types**

```typescript
export type Platform = 'twitch' | 'kick';

export type Scene = {
  id: string;
  name: string;
  sources: Source[];
  isActive: boolean;
};

export type SourceType =
  | 'camera'
  | 'browser'
  | 'image'
  | 'media'
  | 'display_capture'
  | 'window_capture'
  | 'audio_input'
  | 'audio_output';

export type Source = {
  id: string;
  name: string;
  type: SourceType;
  visible: boolean;
  settings: Record<string, unknown>;
};

export type AudioSource = {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  meterLevel: number;
};

export type OutputStats = {
  isStreaming: boolean;
  isRecording: boolean;
  bitrateKbps: number;
  droppedFrames: number;
  totalFrames: number;
  cpuUsage: number;
  fps: number;
  streamDuration: number;
  targets: {
    platform: string;
    connected: boolean;
    bitrateKbps: number;
    droppedFrames: number;
  }[];
};

export type ObsSettings = {
  outputResolution: string;
  fps: number;
  videoBitrate: number;
  encoder: string;
  audioBitrate: number;
};

export type Account = {
  id: string;
  platform: Platform;
  username: string;
  displayName: string;
  channelId: string;
  profileImageUrl?: string;
  isConnected: boolean;
  connectedAt: number;
};

export type ChatBadge = {
  name: string;
  url: string;
};

export type UnifiedChatMessage = {
  id: string;
  platform: Platform;
  channelId: string;
  username: string;
  displayName: string;
  userColor?: string;
  badges?: ChatBadge[];
  message: string;
  timestamp: number;
  isMod?: boolean;
  isSub?: boolean;
  isVip?: boolean;
};

export type UnifiedActivityEvent = {
  id: string;
  platform: Platform;
  type:
    | 'follow'
    | 'sub'
    | 'resub'
    | 'gift_sub'
    | 'cheer'
    | 'raid'
    | 'stream_streak'
    | 'donation';
  username: string;
  message?: string;
  amount?: number;
  timestamp: number;
};

export type PlatformStats = {
  platform: Platform;
  viewers: number;
  followers?: number;
  subscribers?: number;
  updatedAt: number;
};

export type CombinedStats = {
  totalViewers: number;
  platforms: PlatformStats[];
};

export type PanelState = {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StudioLayout = {
  panels: {
    chat: PanelState;
    preview: PanelState;
    activity: PanelState;
    sessionInfo: PanelState;
    scenes: PanelState;
    sources: PanelState;
    audio: PanelState;
    controls: PanelState;
  };
};

export type AppSettings = {
  streamTitle: string;
  streamCategory: string;
  streamTags: string[];
  goLiveNotification: boolean;
  outputResolution: string;
  videoBitrate: number;
  fps: number;
  encoder: string;
  audioBitrate: number;
  recordingPath: string;
};

export type ChatTarget = 'all' | 'twitch' | 'kick';

export interface VaultStudioAPI {
  obs: {
    getScenes(): Promise<Scene[]>;
    createScene(name: string): Promise<Scene>;
    deleteScene(id: string): Promise<void>;
    switchScene(id: string): Promise<void>;
    getSources(sceneId: string): Promise<Source[]>;
    addSource(sceneId: string, type: SourceType, settings: Record<string, unknown>): Promise<Source>;
    removeSource(sceneId: string, sourceId: string): Promise<void>;
    updateSourceSettings(sourceId: string, settings: Record<string, unknown>): Promise<void>;
    startStreaming(): Promise<void>;
    stopStreaming(): Promise<void>;
    startRecording(path: string): Promise<void>;
    stopRecording(): Promise<void>;
    getOutputStats(): Promise<OutputStats>;
    getAudioSources(): Promise<AudioSource[]>;
    setVolume(sourceId: string, volume: number): Promise<void>;
    setMuted(sourceId: string, muted: boolean): Promise<void>;
    getSettings(): Promise<ObsSettings>;
    updateSettings(settings: Partial<ObsSettings>): Promise<void>;
  };
  platforms: {
    connectTwitch(): Promise<Account>;
    connectKick(): Promise<Account>;
    disconnect(platform: string): Promise<void>;
    getAccounts(): Promise<Account[]>;
  };
  chat: {
    sendMessage(message: string, target: ChatTarget): Promise<void>;
    clearHistory(): void;
  };
  layout: {
    get(): Promise<StudioLayout>;
    save(layout: StudioLayout): Promise<void>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: Partial<AppSettings>): Promise<void>;
  };
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    vaultstudio: VaultStudioAPI;
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Design Tokens and Theme

**Files:**
- Create: `src/theme/tokens.ts`
- Create: `src/theme/GlobalStyles.tsx`

- [ ] **Step 1: Create `src/theme/tokens.ts`**

```typescript
export const tokens = {
  colors: {
    bg: '#0B0B0D',
    panel: '#15161A',
    panel2: '#1E2026',
    gold: '#D6A23A',
    darkGold: '#8C621D',
    neonBlue: '#27A8FF',
    text: '#F2F2F2',
    muted: '#A6A6A6',
    danger: '#FF3045',
    live: '#FF0033',
    twitch: '#9146FF',
    kick: '#53FC18',
    border: '#2A2C33',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  fontSize: {
    xs: '11px',
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    xxl: '28px',
  },
  borderRadius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    bold: 700,
  },
} as const;
```

- [ ] **Step 2: Create `src/theme/GlobalStyles.tsx`**

```typescript
import { createGlobalStyle } from 'styled-components';
import { tokens } from './tokens';

export const GlobalStyles = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background-color: ${tokens.colors.bg};
    color: ${tokens.colors.text};
    font-size: ${tokens.fontSize.md};
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }

  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-track {
    background: ${tokens.colors.panel};
  }

  ::-webkit-scrollbar-thumb {
    background: ${tokens.colors.border};
    border-radius: 3px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: ${tokens.colors.muted};
  }
`;
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/theme/
git commit -m "feat: add design tokens and global styles"
```

---

## Task 4: Electron Main Process + Preload + IPC Bridge

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/ipc/index.ts`
- Create: `electron/ipc/obs-ipc.ts`
- Create: `electron/ipc/platform-ipc.ts`
- Create: `electron/ipc/chat-ipc.ts`
- Create: `electron/ipc/layout-ipc.ts`
- Create: `electron/ipc/settings-ipc.ts`

- [ ] **Step 1: Create `electron/main.ts`**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'VaultStudio',
    backgroundColor: '#0B0B0D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [ ] **Step 2: Create `electron/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vaultstudio', {
  obs: {
    getScenes: () => ipcRenderer.invoke('obs:getScenes'),
    createScene: (name: string) => ipcRenderer.invoke('obs:createScene', name),
    deleteScene: (id: string) => ipcRenderer.invoke('obs:deleteScene', id),
    switchScene: (id: string) => ipcRenderer.invoke('obs:switchScene', id),
    getSources: (sceneId: string) => ipcRenderer.invoke('obs:getSources', sceneId),
    addSource: (sceneId: string, type: string, settings: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:addSource', sceneId, type, settings),
    removeSource: (sceneId: string, sourceId: string) =>
      ipcRenderer.invoke('obs:removeSource', sceneId, sourceId),
    updateSourceSettings: (sourceId: string, settings: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:updateSourceSettings', sourceId, settings),
    startStreaming: () => ipcRenderer.invoke('obs:startStreaming'),
    stopStreaming: () => ipcRenderer.invoke('obs:stopStreaming'),
    startRecording: (path: string) => ipcRenderer.invoke('obs:startRecording', path),
    stopRecording: () => ipcRenderer.invoke('obs:stopRecording'),
    getOutputStats: () => ipcRenderer.invoke('obs:getOutputStats'),
    getAudioSources: () => ipcRenderer.invoke('obs:getAudioSources'),
    setVolume: (sourceId: string, volume: number) =>
      ipcRenderer.invoke('obs:setVolume', sourceId, volume),
    setMuted: (sourceId: string, muted: boolean) =>
      ipcRenderer.invoke('obs:setMuted', sourceId, muted),
    getSettings: () => ipcRenderer.invoke('obs:getSettings'),
    updateSettings: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('obs:updateSettings', settings),
  },
  platforms: {
    connectTwitch: () => ipcRenderer.invoke('platforms:connectTwitch'),
    connectKick: () => ipcRenderer.invoke('platforms:connectKick'),
    disconnect: (platform: string) => ipcRenderer.invoke('platforms:disconnect', platform),
    getAccounts: () => ipcRenderer.invoke('platforms:getAccounts'),
  },
  chat: {
    sendMessage: (message: string, target: string) =>
      ipcRenderer.invoke('chat:sendMessage', message, target),
    clearHistory: () => ipcRenderer.invoke('chat:clearHistory'),
  },
  layout: {
    get: () => ipcRenderer.invoke('layout:get'),
    save: (layout: unknown) => ipcRenderer.invoke('layout:save', layout),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:update', settings),
  },
  on: (event: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(event, (_e, ...args) => callback(...args));
  },
  off: (event: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(event, callback as (...args: unknown[]) => void);
  },
});
```

- [ ] **Step 3: Create `electron/ipc/index.ts`**

```typescript
import { registerObsIpc } from './obs-ipc';
import { registerPlatformIpc } from './platform-ipc';
import { registerChatIpc } from './chat-ipc';
import { registerLayoutIpc } from './layout-ipc';
import { registerSettingsIpc } from './settings-ipc';

export function registerIpcHandlers() {
  registerObsIpc();
  registerPlatformIpc();
  registerChatIpc();
  registerLayoutIpc();
  registerSettingsIpc();
}
```

- [ ] **Step 4: Create `electron/ipc/obs-ipc.ts`**

```typescript
import { ipcMain } from 'electron';

const mockScenes = [
  {
    id: 'scene-1',
    name: 'Main Scene',
    isActive: true,
    sources: [
      { id: 'src-1', name: 'Webcam', type: 'camera' as const, visible: true, settings: {} },
      { id: 'src-2', name: 'Game Capture', type: 'display_capture' as const, visible: true, settings: {} },
      { id: 'src-3', name: 'Alerts', type: 'browser' as const, visible: true, settings: { url: 'https://example.com' } },
    ],
  },
  {
    id: 'scene-2',
    name: 'BRB Screen',
    isActive: false,
    sources: [
      { id: 'src-4', name: 'BRB Image', type: 'image' as const, visible: true, settings: {} },
    ],
  },
  {
    id: 'scene-3',
    name: 'Starting Soon',
    isActive: false,
    sources: [
      { id: 'src-5', name: 'Starting Image', type: 'image' as const, visible: true, settings: {} },
      { id: 'src-6', name: 'Music', type: 'media' as const, visible: true, settings: {} },
    ],
  },
];

const mockAudioSources = [
  { id: 'audio-1', name: 'Microphone', volume: 0.8, muted: false, meterLevel: 0.45 },
  { id: 'audio-2', name: 'Desktop Audio', volume: 0.6, muted: false, meterLevel: 0.3 },
  { id: 'audio-3', name: 'Music', volume: 0.3, muted: true, meterLevel: 0.0 },
];

let isStreaming = false;
let isRecording = false;

export function registerObsIpc() {
  ipcMain.handle('obs:getScenes', () => mockScenes);

  ipcMain.handle('obs:createScene', (_e, name: string) => ({
    id: `scene-${Date.now()}`,
    name,
    isActive: false,
    sources: [],
  }));

  ipcMain.handle('obs:deleteScene', (_e, _id: string) => {});

  ipcMain.handle('obs:switchScene', (_e, _id: string) => {});

  ipcMain.handle('obs:getSources', (_e, _sceneId: string) => {
    const scene = mockScenes.find((s) => s.id === _sceneId);
    return scene?.sources ?? [];
  });

  ipcMain.handle('obs:addSource', (_e, _sceneId: string, type: string, settings: Record<string, unknown>) => ({
    id: `src-${Date.now()}`,
    name: `New ${type}`,
    type,
    visible: true,
    settings,
  }));

  ipcMain.handle('obs:removeSource', () => {});
  ipcMain.handle('obs:updateSourceSettings', () => {});

  ipcMain.handle('obs:startStreaming', () => { isStreaming = true; });
  ipcMain.handle('obs:stopStreaming', () => { isStreaming = false; });
  ipcMain.handle('obs:startRecording', () => { isRecording = true; });
  ipcMain.handle('obs:stopRecording', () => { isRecording = false; });

  ipcMain.handle('obs:getOutputStats', () => ({
    isStreaming,
    isRecording,
    bitrateKbps: isStreaming ? 6000 : 0,
    droppedFrames: 0,
    totalFrames: isStreaming ? 12480 : 0,
    cpuUsage: 12.4,
    fps: 60,
    streamDuration: isStreaming ? 828 : 0,
    targets: [
      { platform: 'twitch', connected: isStreaming, bitrateKbps: isStreaming ? 6000 : 0, droppedFrames: 0 },
      { platform: 'kick', connected: isStreaming, bitrateKbps: isStreaming ? 6000 : 0, droppedFrames: 0 },
    ],
  }));

  ipcMain.handle('obs:getAudioSources', () => mockAudioSources);
  ipcMain.handle('obs:setVolume', () => {});
  ipcMain.handle('obs:setMuted', () => {});

  ipcMain.handle('obs:getSettings', () => ({
    outputResolution: '1920x1080',
    fps: 60,
    videoBitrate: 6000,
    encoder: 'x264',
    audioBitrate: 160,
  }));

  ipcMain.handle('obs:updateSettings', () => {});
}
```

- [ ] **Step 5: Create `electron/ipc/platform-ipc.ts`**

```typescript
import { ipcMain } from 'electron';

const mockAccounts = [
  {
    id: 'acc-1',
    platform: 'twitch' as const,
    username: 'vaultkeeperirl',
    displayName: 'VaultkeeperIRL',
    channelId: '123456',
    profileImageUrl: '',
    isConnected: true,
    connectedAt: Date.now() - 86400000,
  },
  {
    id: 'acc-2',
    platform: 'kick' as const,
    username: 'vaultkeeper',
    displayName: 'Vaultkeeper',
    channelId: '789012',
    profileImageUrl: '',
    isConnected: true,
    connectedAt: Date.now() - 86400000,
  },
];

export function registerPlatformIpc() {
  ipcMain.handle('platforms:getAccounts', () => mockAccounts);
  ipcMain.handle('platforms:connectTwitch', () => mockAccounts[0]);
  ipcMain.handle('platforms:connectKick', () => mockAccounts[1]);
  ipcMain.handle('platforms:disconnect', () => {});
}
```

- [ ] **Step 6: Create `electron/ipc/chat-ipc.ts`**

```typescript
import { ipcMain } from 'electron';

export function registerChatIpc() {
  ipcMain.handle('chat:sendMessage', () => {});
  ipcMain.handle('chat:clearHistory', () => {});
}
```

- [ ] **Step 7: Create `electron/ipc/layout-ipc.ts`**

```typescript
import { ipcMain } from 'electron';

const defaultLayout = {
  panels: {
    chat: { visible: true, x: 0, y: 1, width: 1, height: 1 },
    preview: { visible: true, x: 1, y: 0, width: 1, height: 1 },
    activity: { visible: true, x: 2, y: 0, width: 1, height: 1 },
    sessionInfo: { visible: true, x: 0, y: 0, width: 1, height: 1 },
    scenes: { visible: true, x: 1, y: 1, width: 1, height: 1 },
    sources: { visible: true, x: 1, y: 1, width: 1, height: 1 },
    audio: { visible: true, x: 2, y: 1, width: 1, height: 1 },
    controls: { visible: true, x: 0, y: 0, width: 3, height: 1 },
  },
};

let currentLayout = defaultLayout;

export function registerLayoutIpc() {
  ipcMain.handle('layout:get', () => currentLayout);
  ipcMain.handle('layout:save', (_e, layout: unknown) => {
    currentLayout = layout as typeof defaultLayout;
  });
}
```

- [ ] **Step 8: Create `electron/ipc/settings-ipc.ts`**

```typescript
import { ipcMain } from 'electron';

let currentSettings = {
  streamTitle: 'VaultStudio Stream',
  streamCategory: 'Just Chatting',
  streamTags: ['english', 'multiplatform'],
  goLiveNotification: true,
  outputResolution: '1920x1080',
  videoBitrate: 6000,
  fps: 60,
  encoder: 'x264',
  audioBitrate: 160,
  recordingPath: 'C:/Users/Vaultkeeper/Videos/VaultStudio',
};

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => currentSettings);
  ipcMain.handle('settings:update', (_e, settings: Record<string, unknown>) => {
    currentSettings = { ...currentSettings, ...settings };
  });
}
```

- [ ] **Step 9: Verify Electron files compile**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add electron/
git commit -m "feat: add Electron main process, preload, and mock IPC handlers"
```

---

## Task 5: React Entry + App Shell + Routing

**Files:**
- Create: `src/index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Create `src/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VaultStudio</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/main.tsx`**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { GlobalStyles } from './theme/GlobalStyles';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalStyles />
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Create `src/App.tsx`**

```typescript
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StudioPage } from './pages/StudioPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<StudioPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </HashRouter>
  );
}
```

- [ ] **Step 4: Create placeholder pages so routing works**

Create `src/pages/StudioPage.tsx`:

```typescript
import styled from 'styled-components';
import { tokens } from '../theme/tokens';

const Container = styled.div`
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${tokens.colors.gold};
  font-size: ${tokens.fontSize.xxl};
  font-weight: ${tokens.fontWeight.bold};
`;

export function StudioPage() {
  return <Container>VaultStudio</Container>;
}
```

Create `src/pages/ConnectionsPage.tsx`:

```typescript
import styled from 'styled-components';
import { tokens } from '../theme/tokens';

const Container = styled.div`
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${tokens.colors.text};
`;

export function ConnectionsPage() {
  return <Container>Connections</Container>;
}
```

Create `src/pages/SettingsPage.tsx`:

```typescript
import styled from 'styled-components';
import { tokens } from '../theme/tokens';

const Container = styled.div`
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${tokens.colors.text};
`;

export function SettingsPage() {
  return <Container>Settings</Container>;
}
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Verify dev server starts**

```bash
npx vite --host
```

Expected: Vite dev server starts on `http://localhost:5173`. Open in browser — should see "VaultStudio" in gold text on dark background.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: add React entry, routing, and placeholder pages"
```

---

## Task 6: Mock Data

**Files:**
- Create: `src/mocks/mockData.ts`

- [ ] **Step 1: Create `src/mocks/mockData.ts`**

```typescript
import type {
  Scene,
  AudioSource,
  UnifiedChatMessage,
  UnifiedActivityEvent,
  CombinedStats,
  OutputStats,
} from '../types';

export const mockScenes: Scene[] = [
  {
    id: 'scene-1',
    name: 'Main Scene',
    isActive: true,
    sources: [
      { id: 'src-1', name: 'Webcam', type: 'camera', visible: true, settings: {} },
      { id: 'src-2', name: 'Game Capture', type: 'display_capture', visible: true, settings: {} },
      { id: 'src-3', name: 'Alerts', type: 'browser', visible: true, settings: { url: 'https://example.com' } },
    ],
  },
  {
    id: 'scene-2',
    name: 'BRB Screen',
    isActive: false,
    sources: [
      { id: 'src-4', name: 'BRB Image', type: 'image', visible: true, settings: {} },
    ],
  },
  {
    id: 'scene-3',
    name: 'Starting Soon',
    isActive: false,
    sources: [
      { id: 'src-5', name: 'Starting Image', type: 'image', visible: true, settings: {} },
      { id: 'src-6', name: 'Music', type: 'media', visible: true, settings: {} },
    ],
  },
];

export const mockAudioSources: AudioSource[] = [
  { id: 'audio-1', name: 'Microphone', volume: 0.8, muted: false, meterLevel: 0.45 },
  { id: 'audio-2', name: 'Desktop Audio', volume: 0.6, muted: false, meterLevel: 0.3 },
  { id: 'audio-3', name: 'Music', volume: 0.3, muted: true, meterLevel: 0.0 },
];

export const mockChatMessages: UnifiedChatMessage[] = [
  {
    id: 'msg-1',
    platform: 'twitch',
    channelId: '123456',
    username: 'mysticlloyd',
    displayName: 'Mysticlloyd',
    userColor: '#FF4500',
    message: 'Cheer to take #3!',
    timestamp: Date.now() - 60000,
    isSub: true,
  },
  {
    id: 'msg-2',
    platform: 'kick',
    channelId: '789012',
    username: 'kiwidanja',
    displayName: 'KiwiDanja',
    message: "that's pretty cool",
    timestamp: Date.now() - 45000,
  },
  {
    id: 'msg-3',
    platform: 'kick',
    channelId: '789012',
    username: 'biglogied',
    displayName: 'BigLogieD',
    message: 'up to',
    timestamp: Date.now() - 30000,
  },
  {
    id: 'msg-4',
    platform: 'twitch',
    channelId: '123456',
    username: 'half_asleep',
    displayName: 'Half_Asleep',
    userColor: '#00FF7F',
    message: 'lets gooo',
    timestamp: Date.now() - 20000,
    isMod: true,
  },
  {
    id: 'msg-5',
    platform: 'twitch',
    channelId: '123456',
    username: 'streamfan99',
    displayName: 'StreamFan99',
    userColor: '#1E90FF',
    message: 'great stream today!',
    timestamp: Date.now() - 10000,
    isVip: true,
  },
  {
    id: 'msg-6',
    platform: 'kick',
    channelId: '789012',
    username: 'nightowl',
    displayName: 'NightOwl',
    message: 'just joined, whats the game?',
    timestamp: Date.now() - 5000,
  },
];

export const mockActivityEvents: UnifiedActivityEvent[] = [
  {
    id: 'evt-1',
    platform: 'kick',
    type: 'stream_streak',
    username: 'mysticlloyd',
    message: 'reached 3-stream streak',
    timestamp: Date.now() - 120000,
  },
  {
    id: 'evt-2',
    platform: 'twitch',
    type: 'cheer',
    username: 'half_asleep',
    message: 'cheered 80 bits',
    amount: 80,
    timestamp: Date.now() - 90000,
  },
  {
    id: 'evt-3',
    platform: 'kick',
    type: 'resub',
    username: 'mysticlloyd',
    message: 'resubscribed for 1 month',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'evt-4',
    platform: 'twitch',
    type: 'follow',
    username: 'newviewer42',
    timestamp: Date.now() - 45000,
  },
  {
    id: 'evt-5',
    platform: 'twitch',
    type: 'gift_sub',
    username: 'generous_guy',
    message: 'gifted 5 subs',
    amount: 5,
    timestamp: Date.now() - 30000,
  },
  {
    id: 'evt-6',
    platform: 'kick',
    type: 'follow',
    username: 'kickfan123',
    timestamp: Date.now() - 15000,
  },
];

export const mockStats: CombinedStats = {
  totalViewers: 37,
  platforms: [
    { platform: 'twitch', viewers: 12, followers: 2070, subscribers: 7, updatedAt: Date.now() },
    { platform: 'kick', viewers: 25, followers: 890, subscribers: 3, updatedAt: Date.now() },
  ],
};

export const mockOutputStats: OutputStats = {
  isStreaming: true,
  isRecording: false,
  bitrateKbps: 6000,
  droppedFrames: 2,
  totalFrames: 12480,
  cpuUsage: 12.4,
  fps: 60,
  streamDuration: 828,
  targets: [
    { platform: 'twitch', connected: true, bitrateKbps: 6000, droppedFrames: 1 },
    { platform: 'kick', connected: true, bitrateKbps: 6000, droppedFrames: 1 },
  ],
};
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/mocks/
git commit -m "feat: add mock data for all studio panels"
```

---

## Task 7: Common Components (PlatformBadge + Button)

**Files:**
- Create: `src/components/common/PlatformBadge.tsx`
- Create: `src/components/common/Button.tsx`
- Create: `src/__tests__/components/PlatformBadge.test.tsx`

- [ ] **Step 1: Write the failing test for PlatformBadge**

Create `src/__tests__/components/PlatformBadge.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { PlatformBadge } from '../../components/common/PlatformBadge';

describe('PlatformBadge', () => {
  it('renders Twitch badge with correct label', () => {
    render(<PlatformBadge platform="twitch" />);
    expect(screen.getByText('Twitch')).toBeInTheDocument();
  });

  it('renders Kick badge with correct label', () => {
    render(<PlatformBadge platform="kick" />);
    expect(screen.getByText('Kick')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/PlatformBadge.test.tsx
```

Expected: FAIL — `PlatformBadge` module not found.

- [ ] **Step 3: Create `src/components/common/PlatformBadge.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { Platform } from '../../types';

const Badge = styled.span<{ $platform: Platform }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background-color: ${({ $platform }) =>
    $platform === 'twitch' ? tokens.colors.twitch : tokens.colors.kick};
  color: ${({ $platform }) =>
    $platform === 'twitch' ? '#FFFFFF' : '#000000'};
`;

type Props = {
  platform: Platform;
};

export function PlatformBadge({ platform }: Props) {
  return <Badge $platform={platform}>{platform === 'twitch' ? 'Twitch' : 'Kick'}</Badge>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/PlatformBadge.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Create `src/components/common/Button.tsx`**

```typescript
import styled, { css } from 'styled-components';
import { tokens } from '../../theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'live';

const variantStyles: Record<Variant, ReturnType<typeof css>> = {
  primary: css`
    background-color: ${tokens.colors.gold};
    color: #000;
    &:hover { background-color: ${tokens.colors.darkGold}; }
  `,
  secondary: css`
    background-color: ${tokens.colors.panel2};
    color: ${tokens.colors.text};
    border: 1px solid ${tokens.colors.border};
    &:hover { background-color: ${tokens.colors.border}; }
  `,
  danger: css`
    background-color: ${tokens.colors.danger};
    color: #fff;
    &:hover { opacity: 0.85; }
  `,
  live: css`
    background-color: ${tokens.colors.live};
    color: #fff;
    &:hover { opacity: 0.85; }
  `,
};

const StyledButton = styled.button<{ $variant: Variant }>`
  padding: ${tokens.spacing.sm} ${tokens.spacing.lg};
  border: none;
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  cursor: pointer;
  transition: all 0.15s ease;
  ${({ $variant }) => variantStyles[$variant]}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

type Props = {
  variant?: Variant;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

export function Button({ variant = 'primary', children, onClick, disabled }: Props) {
  return (
    <StyledButton $variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </StyledButton>
  );
}
```

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/common/ src/__tests__/components/PlatformBadge.test.tsx
git commit -m "feat: add PlatformBadge and Button common components"
```

---

## Task 8: Panel Layout System

**Files:**
- Create: `src/components/layout/Panel.tsx`
- Create: `src/components/layout/PanelGrid.tsx`

- [ ] **Step 1: Create `src/components/layout/Panel.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const PanelWrapper = styled.div`
  background-color: ${tokens.colors.panel};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.lg};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${tokens.colors.panel2};
  border-bottom: 1px solid ${tokens.colors.border};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  color: ${tokens.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-shrink: 0;
`;

const PanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: ${tokens.spacing.sm};
`;

type Props = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function Panel({ title, children, className }: Props) {
  return (
    <PanelWrapper className={className}>
      <PanelHeader>{title}</PanelHeader>
      <PanelBody>{children}</PanelBody>
    </PanelWrapper>
  );
}
```

- [ ] **Step 2: Create `src/components/layout/PanelGrid.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

export const StudioGrid = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  grid-template-rows: 1fr 1fr;
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.sm};
  height: calc(100vh - 48px);
  background-color: ${tokens.colors.bg};
`;

export const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 ${tokens.spacing.lg};
  background-color: ${tokens.colors.panel};
  border-bottom: 1px solid ${tokens.colors.border};
`;

export const Logo = styled.span`
  font-size: ${tokens.fontSize.lg};
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.gold};
`;

export const TopBarActions = styled.div`
  display: flex;
  gap: ${tokens.spacing.sm};
  align-items: center;
`;
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add Panel and PanelGrid layout components"
```

---

## Task 9: Zustand Studio Store

**Files:**
- Create: `src/stores/studioStore.ts`
- Create: `src/__tests__/stores/studioStore.test.ts`

- [ ] **Step 1: Write the failing test for studioStore**

Create `src/__tests__/stores/studioStore.test.ts`:

```typescript
import { useStudioStore } from '../../stores/studioStore';
import { mockScenes, mockAudioSources, mockChatMessages, mockActivityEvents, mockStats, mockOutputStats } from '../../mocks/mockData';

describe('studioStore', () => {
  beforeEach(() => {
    useStudioStore.setState({
      scenes: [],
      audioSources: [],
      chatMessages: [],
      activityEvents: [],
      stats: { totalViewers: 0, platforms: [] },
      outputStats: null,
      activeSceneId: null,
      chatTarget: 'all',
    });
  });

  it('initializes with empty state', () => {
    const state = useStudioStore.getState();
    expect(state.scenes).toEqual([]);
    expect(state.chatMessages).toEqual([]);
    expect(state.activeSceneId).toBeNull();
  });

  it('sets scenes and active scene', () => {
    useStudioStore.getState().setScenes(mockScenes);
    const state = useStudioStore.getState();
    expect(state.scenes).toHaveLength(3);
    expect(state.activeSceneId).toBe('scene-1');
  });

  it('switches active scene', () => {
    useStudioStore.getState().setScenes(mockScenes);
    useStudioStore.getState().switchScene('scene-2');
    expect(useStudioStore.getState().activeSceneId).toBe('scene-2');
  });

  it('adds a chat message', () => {
    useStudioStore.getState().addChatMessage(mockChatMessages[0]);
    expect(useStudioStore.getState().chatMessages).toHaveLength(1);
  });

  it('adds an activity event', () => {
    useStudioStore.getState().addActivityEvent(mockActivityEvents[0]);
    expect(useStudioStore.getState().activityEvents).toHaveLength(1);
  });

  it('sets chat target', () => {
    useStudioStore.getState().setChatTarget('twitch');
    expect(useStudioStore.getState().chatTarget).toBe('twitch');
  });

  it('sets audio sources', () => {
    useStudioStore.getState().setAudioSources(mockAudioSources);
    expect(useStudioStore.getState().audioSources).toHaveLength(3);
  });

  it('sets stats', () => {
    useStudioStore.getState().setStats(mockStats);
    expect(useStudioStore.getState().stats.totalViewers).toBe(37);
  });

  it('sets output stats', () => {
    useStudioStore.getState().setOutputStats(mockOutputStats);
    expect(useStudioStore.getState().outputStats?.isStreaming).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/stores/studioStore.test.ts
```

Expected: FAIL — `studioStore` module not found.

- [ ] **Step 3: Create `src/stores/studioStore.ts`**

```typescript
import { create } from 'zustand';
import type {
  Scene,
  AudioSource,
  UnifiedChatMessage,
  UnifiedActivityEvent,
  CombinedStats,
  OutputStats,
  ChatTarget,
} from '../types';

type StudioState = {
  scenes: Scene[];
  audioSources: AudioSource[];
  chatMessages: UnifiedChatMessage[];
  activityEvents: UnifiedActivityEvent[];
  stats: CombinedStats;
  outputStats: OutputStats | null;
  activeSceneId: string | null;
  chatTarget: ChatTarget;
};

type StudioActions = {
  setScenes: (scenes: Scene[]) => void;
  switchScene: (sceneId: string) => void;
  setAudioSources: (sources: AudioSource[]) => void;
  addChatMessage: (message: UnifiedChatMessage) => void;
  clearChat: () => void;
  addActivityEvent: (event: UnifiedActivityEvent) => void;
  setStats: (stats: CombinedStats) => void;
  setOutputStats: (stats: OutputStats) => void;
  setChatTarget: (target: ChatTarget) => void;
};

export const useStudioStore = create<StudioState & StudioActions>((set) => ({
  scenes: [],
  audioSources: [],
  chatMessages: [],
  activityEvents: [],
  stats: { totalViewers: 0, platforms: [] },
  outputStats: null,
  activeSceneId: null,
  chatTarget: 'all',

  setScenes: (scenes) => {
    const active = scenes.find((s) => s.isActive);
    set({ scenes, activeSceneId: active?.id ?? null });
  },

  switchScene: (sceneId) =>
    set((state) => ({
      activeSceneId: sceneId,
      scenes: state.scenes.map((s) => ({
        ...s,
        isActive: s.id === sceneId,
      })),
    })),

  setAudioSources: (audioSources) => set({ audioSources }),

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-99), message],
    })),

  clearChat: () => set({ chatMessages: [] }),

  addActivityEvent: (event) =>
    set((state) => ({
      activityEvents: [...state.activityEvents.slice(-49), event],
    })),

  setStats: (stats) => set({ stats }),

  setOutputStats: (outputStats) => set({ outputStats }),

  setChatTarget: (chatTarget) => set({ chatTarget }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/stores/studioStore.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/ src/__tests__/stores/
git commit -m "feat: add Zustand studio store with tests"
```

---

## Task 10: PreviewPanel

**Files:**
- Create: `src/components/studio/PreviewPanel.tsx`

- [ ] **Step 1: Create `src/components/studio/PreviewPanel.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const PreviewContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
  border-radius: ${tokens.borderRadius.sm};
  position: relative;
`;

const Placeholder = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.lg};
  text-align: center;
`;

const LiveIndicator = styled.div`
  position: absolute;
  top: ${tokens.spacing.sm};
  left: ${tokens.spacing.sm};
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  background-color: ${tokens.colors.live};
  color: #fff;
  padding: 2px 8px;
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
`;

const Dot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #fff;
`;

type Props = {
  isStreaming?: boolean;
};

export function PreviewPanel({ isStreaming = false }: Props) {
  return (
    <PreviewContainer>
      {isStreaming && (
        <LiveIndicator>
          <Dot />
          LIVE
        </LiveIndicator>
      )}
      <Placeholder>Stream Preview<br />Canvas will render here</Placeholder>
    </PreviewContainer>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/studio/PreviewPanel.tsx
git commit -m "feat: add PreviewPanel component"
```

---

## Task 11: UnifiedChat

**Files:**
- Create: `src/components/studio/UnifiedChat.tsx`
- Create: `src/__tests__/components/UnifiedChat.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/UnifiedChat.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { UnifiedChat } from '../../components/studio/UnifiedChat';
import { mockChatMessages } from '../../mocks/mockData';

describe('UnifiedChat', () => {
  it('renders chat messages with platform badges', () => {
    render(<UnifiedChat messages={mockChatMessages} onSend={() => {}} chatTarget="all" onTargetChange={() => {}} />);
    expect(screen.getByText('Mysticlloyd')).toBeInTheDocument();
    expect(screen.getByText('Cheer to take #3!')).toBeInTheDocument();
    expect(screen.getAllByText('Twitch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kick').length).toBeGreaterThan(0);
  });

  it('renders the send target selector', () => {
    render(<UnifiedChat messages={mockChatMessages} onSend={() => {}} chatTarget="all" onTargetChange={() => {}} />);
    expect(screen.getByText('Send to:')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/UnifiedChat.test.tsx
```

Expected: FAIL — `UnifiedChat` module not found.

- [ ] **Step 3: Create `src/components/studio/UnifiedChat.tsx`**

```typescript
import { useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { PlatformBadge } from '../common/PlatformBadge';
import type { UnifiedChatMessage, ChatTarget } from '../../types';

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MessageRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${tokens.spacing.xs};
  padding: 2px 0;
  font-size: ${tokens.fontSize.sm};
  line-height: 1.4;
`;

const Username = styled.span<{ $color?: string }>`
  font-weight: ${tokens.fontWeight.bold};
  color: ${({ $color }) => $color ?? tokens.colors.text};
  flex-shrink: 0;
`;

const MessageText = styled.span`
  color: ${tokens.colors.text};
  word-break: break-word;
`;

const ChatInputRow = styled.div`
  display: flex;
  gap: ${tokens.spacing.xs};
  padding-top: ${tokens.spacing.sm};
  border-top: 1px solid ${tokens.colors.border};
  align-items: center;
`;

const ChatInput = styled.input`
  flex: 1;
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  outline: none;

  &:focus {
    border-color: ${tokens.colors.gold};
  }
`;

const SendButton = styled.button`
  background-color: ${tokens.colors.gold};
  color: #000;
  border: none;
  border-radius: ${tokens.borderRadius.md};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  font-size: ${tokens.fontSize.sm};
  font-weight: ${tokens.fontWeight.medium};
  cursor: pointer;

  &:hover {
    background-color: ${tokens.colors.darkGold};
  }
`;

const TargetSelector = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.xs};
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
`;

const TargetSelect = styled.select`
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.sm};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.xs};
  padding: 2px 4px;
  outline: none;
`;

type Props = {
  messages: UnifiedChatMessage[];
  onSend: (message: string) => void;
  chatTarget: ChatTarget;
  onTargetChange: (target: ChatTarget) => void;
};

export function UnifiedChat({ messages, onSend, chatTarget, onTargetChange }: Props) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <ChatContainer>
      <MessageList>
        {messages.map((msg) => (
          <MessageRow key={msg.id}>
            <PlatformBadge platform={msg.platform} />
            <Username $color={msg.userColor}>{msg.displayName}</Username>
            <MessageText>{msg.message}</MessageText>
          </MessageRow>
        ))}
      </MessageList>
      <ChatInputRow>
        <TargetSelector>
          <span>Send to:</span>
          <TargetSelect
            value={chatTarget}
            onChange={(e) => onTargetChange(e.target.value as ChatTarget)}
          >
            <option value="all">All Platforms</option>
            <option value="twitch">Twitch only</option>
            <option value="kick">Kick only</option>
          </TargetSelect>
        </TargetSelector>
        <ChatInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <SendButton onClick={handleSend}>Send</SendButton>
      </ChatInputRow>
    </ChatContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/UnifiedChat.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/UnifiedChat.tsx src/__tests__/components/UnifiedChat.test.tsx
git commit -m "feat: add UnifiedChat component with tests"
```

---

## Task 12: ActivityFeed

**Files:**
- Create: `src/components/studio/ActivityFeed.tsx`
- Create: `src/__tests__/components/ActivityFeed.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/ActivityFeed.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { ActivityFeed } from '../../components/studio/ActivityFeed';
import { mockActivityEvents } from '../../mocks/mockData';

describe('ActivityFeed', () => {
  it('renders activity events with platform badges', () => {
    render(<ActivityFeed events={mockActivityEvents} />);
    expect(screen.getByText('mysticlloyd')).toBeInTheDocument();
    expect(screen.getByText('reached 3-stream streak')).toBeInTheDocument();
    expect(screen.getAllByText('Twitch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kick').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/ActivityFeed.test.tsx
```

Expected: FAIL — `ActivityFeed` module not found.

- [ ] **Step 3: Create `src/components/studio/ActivityFeed.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { PlatformBadge } from '../common/PlatformBadge';
import type { UnifiedActivityEvent } from '../../types';

const FeedContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
`;

const EventRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${tokens.spacing.xs};
  padding: ${tokens.spacing.xs} 0;
  font-size: ${tokens.fontSize.sm};
`;

const EventUsername = styled.span`
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.text};
  flex-shrink: 0;
`;

const EventMessage = styled.span`
  color: ${tokens.colors.muted};
`;

const EventTypeIcon = styled.span`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.gold};
  flex-shrink: 0;
  min-width: 16px;
  text-align: center;
`;

const typeIcons: Record<UnifiedActivityEvent['type'], string> = {
  follow: '\u2665',
  sub: '\u2605',
  resub: '\u2605',
  gift_sub: '\u2726',
  cheer: '\u25C6',
  raid: '\u26A1',
  stream_streak: '\u2606',
  donation: '\u2665',
};

type Props = {
  events: UnifiedActivityEvent[];
};

export function ActivityFeed({ events }: Props) {
  return (
    <FeedContainer>
      {events.map((event) => (
        <EventRow key={event.id}>
          <PlatformBadge platform={event.platform} />
          <EventTypeIcon>{typeIcons[event.type]}</EventTypeIcon>
          <EventUsername>{event.username}</EventUsername>
          {event.message && <EventMessage>{event.message}</EventMessage>}
        </EventRow>
      ))}
    </FeedContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/ActivityFeed.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/ActivityFeed.tsx src/__tests__/components/ActivityFeed.test.tsx
git commit -m "feat: add ActivityFeed component with tests"
```

---

## Task 13: SessionInfo

**Files:**
- Create: `src/components/studio/SessionInfo.tsx`
- Create: `src/__tests__/components/SessionInfo.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/SessionInfo.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { SessionInfo } from '../../components/studio/SessionInfo';
import { mockStats, mockOutputStats } from '../../mocks/mockData';

describe('SessionInfo', () => {
  it('renders total viewer count', () => {
    render(<SessionInfo stats={mockStats} outputStats={mockOutputStats} />);
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('renders per-platform breakdown', () => {
    render(<SessionInfo stats={mockStats} outputStats={mockOutputStats} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('renders stream duration', () => {
    render(<SessionInfo stats={mockStats} outputStats={mockOutputStats} />);
    expect(screen.getByText('00:13:48')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/SessionInfo.test.tsx
```

Expected: FAIL — `SessionInfo` module not found.

- [ ] **Step 3: Create `src/components/studio/SessionInfo.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { PlatformBadge } from '../common/PlatformBadge';
import type { CombinedStats, OutputStats } from '../../types';

const InfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.md};
`;

const TotalViewers = styled.div`
  text-align: center;
`;

const ViewerCount = styled.div`
  font-size: ${tokens.fontSize.xxl};
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.gold};
`;

const ViewerLabel = styled.div`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const PlatformRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.xs} 0;
`;

const PlatformViewers = styled.span`
  font-weight: ${tokens.fontWeight.bold};
  color: ${tokens.colors.text};
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${tokens.fontSize.sm};
  padding: ${tokens.spacing.xs} 0;
`;

const StatLabel = styled.span`
  color: ${tokens.colors.muted};
`;

const StatValue = styled.span`
  color: ${tokens.colors.text};
  font-weight: ${tokens.fontWeight.medium};
`;

const StatusBadge = styled.div<{ $streaming: boolean }>`
  text-align: center;
  padding: ${tokens.spacing.xs};
  border-radius: ${tokens.borderRadius.sm};
  font-size: ${tokens.fontSize.xs};
  font-weight: ${tokens.fontWeight.bold};
  text-transform: uppercase;
  background-color: ${({ $streaming }) => ($streaming ? tokens.colors.live : tokens.colors.panel2)};
  color: ${({ $streaming }) => ($streaming ? '#fff' : tokens.colors.muted)};
`;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Props = {
  stats: CombinedStats;
  outputStats: OutputStats | null;
};

export function SessionInfo({ stats, outputStats }: Props) {
  const isStreaming = outputStats?.isStreaming ?? false;
  const duration = outputStats?.streamDuration ?? 0;
  const totalFollowers = stats.platforms.reduce((sum, p) => sum + (p.followers ?? 0), 0);
  const totalSubs = stats.platforms.reduce((sum, p) => sum + (p.subscribers ?? 0), 0);

  return (
    <InfoContainer>
      <StatusBadge $streaming={isStreaming}>
        {isStreaming ? 'Streaming' : 'Offline'}
      </StatusBadge>

      <TotalViewers>
        <ViewerCount>{stats.totalViewers}</ViewerCount>
        <ViewerLabel>Total Viewers</ViewerLabel>
      </TotalViewers>

      {stats.platforms.map((p) => (
        <PlatformRow key={p.platform}>
          <PlatformBadge platform={p.platform} />
          <PlatformViewers>{p.viewers}</PlatformViewers>
        </PlatformRow>
      ))}

      <StatRow>
        <StatLabel>Followers</StatLabel>
        <StatValue>{totalFollowers.toLocaleString()}</StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>Subs</StatLabel>
        <StatValue>{totalSubs}</StatValue>
      </StatRow>
      <StatRow>
        <StatLabel>Time Live</StatLabel>
        <StatValue>{formatDuration(duration)}</StatValue>
      </StatRow>
    </InfoContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/SessionInfo.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/SessionInfo.tsx src/__tests__/components/SessionInfo.test.tsx
git commit -m "feat: add SessionInfo component with tests"
```

---

## Task 14: ScenesPanel + SourcesPanel

**Files:**
- Create: `src/components/studio/ScenesPanel.tsx`
- Create: `src/components/studio/SourcesPanel.tsx`
- Create: `src/__tests__/components/ScenesPanel.test.tsx`
- Create: `src/__tests__/components/SourcesPanel.test.tsx`

- [ ] **Step 1: Write the failing test for ScenesPanel**

Create `src/__tests__/components/ScenesPanel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenesPanel } from '../../components/studio/ScenesPanel';
import { mockScenes } from '../../mocks/mockData';

describe('ScenesPanel', () => {
  it('renders all scenes', () => {
    render(<ScenesPanel scenes={mockScenes} activeSceneId="scene-1" onSwitchScene={() => {}} />);
    expect(screen.getByText('Main Scene')).toBeInTheDocument();
    expect(screen.getByText('BRB Screen')).toBeInTheDocument();
    expect(screen.getByText('Starting Soon')).toBeInTheDocument();
  });

  it('calls onSwitchScene when a scene is clicked', async () => {
    const onSwitch = vi.fn();
    render(<ScenesPanel scenes={mockScenes} activeSceneId="scene-1" onSwitchScene={onSwitch} />);
    await userEvent.click(screen.getByText('BRB Screen'));
    expect(onSwitch).toHaveBeenCalledWith('scene-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/ScenesPanel.test.tsx
```

Expected: FAIL — `ScenesPanel` module not found.

- [ ] **Step 3: Create `src/components/studio/ScenesPanel.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { Scene } from '../../types';

const SceneList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
`;

const SceneItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  width: 100%;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${({ $active }) => ($active ? tokens.colors.panel2 : 'transparent')};
  border: 1px solid ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.md};
  color: ${tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;
  text-align: left;

  &:hover {
    background-color: ${tokens.colors.panel2};
  }
`;

const ActiveDot = styled.div<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $active }) => ($active ? tokens.colors.gold : tokens.colors.border)};
  flex-shrink: 0;
`;

type Props = {
  scenes: Scene[];
  activeSceneId: string | null;
  onSwitchScene: (sceneId: string) => void;
};

export function ScenesPanel({ scenes, activeSceneId, onSwitchScene }: Props) {
  return (
    <SceneList>
      {scenes.map((scene) => (
        <SceneItem
          key={scene.id}
          $active={scene.id === activeSceneId}
          onClick={() => onSwitchScene(scene.id)}
        >
          <ActiveDot $active={scene.id === activeSceneId} />
          {scene.name}
        </SceneItem>
      ))}
    </SceneList>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/ScenesPanel.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for SourcesPanel**

Create `src/__tests__/components/SourcesPanel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { SourcesPanel } from '../../components/studio/SourcesPanel';
import { mockScenes } from '../../mocks/mockData';

describe('SourcesPanel', () => {
  it('renders sources for the active scene', () => {
    render(<SourcesPanel sources={mockScenes[0].sources} />);
    expect(screen.getByText('Webcam')).toBeInTheDocument();
    expect(screen.getByText('Game Capture')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('shows empty state when no sources', () => {
    render(<SourcesPanel sources={[]} />);
    expect(screen.getByText('No sources')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/SourcesPanel.test.tsx
```

Expected: FAIL — `SourcesPanel` module not found.

- [ ] **Step 7: Create `src/components/studio/SourcesPanel.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { Source } from '../../types';

const SourceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
`;

const SourceItem = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  font-size: ${tokens.fontSize.sm};
`;

const SourceType = styled.span`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.xs};
  text-transform: uppercase;
`;

const SourceName = styled.span`
  color: ${tokens.colors.text};
  flex: 1;
`;

const VisibilityDot = styled.div<{ $visible: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $visible }) => ($visible ? tokens.colors.neonBlue : tokens.colors.border)};
  flex-shrink: 0;
`;

const EmptyState = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.sm};
  text-align: center;
  padding: ${tokens.spacing.lg};
`;

type Props = {
  sources: Source[];
};

export function SourcesPanel({ sources }: Props) {
  if (sources.length === 0) {
    return <EmptyState>No sources</EmptyState>;
  }

  return (
    <SourceList>
      {sources.map((source) => (
        <SourceItem key={source.id}>
          <VisibilityDot $visible={source.visible} />
          <SourceName>{source.name}</SourceName>
          <SourceType>{source.type.replace('_', ' ')}</SourceType>
        </SourceItem>
      ))}
    </SourceList>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/SourcesPanel.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/components/studio/ScenesPanel.tsx src/components/studio/SourcesPanel.tsx src/__tests__/components/ScenesPanel.test.tsx src/__tests__/components/SourcesPanel.test.tsx
git commit -m "feat: add ScenesPanel and SourcesPanel components with tests"
```

---

## Task 15: AudioMixer

**Files:**
- Create: `src/components/studio/AudioMixer.tsx`
- Create: `src/__tests__/components/AudioMixer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/AudioMixer.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { AudioMixer } from '../../components/studio/AudioMixer';
import { mockAudioSources } from '../../mocks/mockData';

describe('AudioMixer', () => {
  it('renders all audio sources', () => {
    render(<AudioMixer sources={mockAudioSources} onVolumeChange={() => {}} onMuteToggle={() => {}} />);
    expect(screen.getByText('Microphone')).toBeInTheDocument();
    expect(screen.getByText('Desktop Audio')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
  });

  it('shows muted state for muted sources', () => {
    render(<AudioMixer sources={mockAudioSources} onVolumeChange={() => {}} onMuteToggle={() => {}} />);
    const muteButtons = screen.getAllByRole('button', { name: /mute/i });
    expect(muteButtons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/AudioMixer.test.tsx
```

Expected: FAIL — `AudioMixer` module not found.

- [ ] **Step 3: Create `src/components/studio/AudioMixer.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import type { AudioSource } from '../../types';

const MixerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.md};
`;

const MixerRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.xs};
`;

const MixerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SourceName = styled.span`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.text};
`;

const MuteButton = styled.button<{ $muted: boolean }>`
  background: none;
  border: 1px solid ${({ $muted }) => ($muted ? tokens.colors.danger : tokens.colors.border)};
  border-radius: ${tokens.borderRadius.sm};
  color: ${({ $muted }) => ($muted ? tokens.colors.danger : tokens.colors.muted)};
  font-size: ${tokens.fontSize.xs};
  padding: 2px 6px;
  cursor: pointer;

  &:hover {
    border-color: ${tokens.colors.gold};
  }
`;

const SliderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
`;

const VolumeSlider = styled.input`
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  background: ${tokens.colors.border};
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${tokens.colors.gold};
    cursor: pointer;
  }
`;

const VolumeLabel = styled.span`
  font-size: ${tokens.fontSize.xs};
  color: ${tokens.colors.muted};
  min-width: 32px;
  text-align: right;
`;

const MeterBar = styled.div`
  height: 3px;
  background-color: ${tokens.colors.border};
  border-radius: 2px;
  overflow: hidden;
`;

const MeterFill = styled.div<{ $level: number }>`
  height: 100%;
  width: ${({ $level }) => $level * 100}%;
  background: linear-gradient(90deg, ${tokens.colors.neonBlue}, ${tokens.colors.gold});
  transition: width 0.1s ease;
`;

type Props = {
  sources: AudioSource[];
  onVolumeChange: (sourceId: string, volume: number) => void;
  onMuteToggle: (sourceId: string) => void;
};

export function AudioMixer({ sources, onVolumeChange, onMuteToggle }: Props) {
  return (
    <MixerContainer>
      {sources.map((source) => (
        <MixerRow key={source.id}>
          <MixerHeader>
            <SourceName>{source.name}</SourceName>
            <MuteButton
              $muted={source.muted}
              onClick={() => onMuteToggle(source.id)}
              aria-label={`Mute ${source.name}`}
            >
              {source.muted ? 'MUTED' : 'MUTE'}
            </MuteButton>
          </MixerHeader>
          <SliderRow>
            <VolumeSlider
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={source.muted ? 0 : source.volume}
              onChange={(e) => onVolumeChange(source.id, parseFloat(e.target.value))}
              disabled={source.muted}
            />
            <VolumeLabel>{Math.round((source.muted ? 0 : source.volume) * 100)}%</VolumeLabel>
          </SliderRow>
          <MeterBar>
            <MeterFill $level={source.muted ? 0 : source.meterLevel} />
          </MeterBar>
        </MixerRow>
      ))}
    </MixerContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/AudioMixer.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/AudioMixer.tsx src/__tests__/components/AudioMixer.test.tsx
git commit -m "feat: add AudioMixer component with tests"
```

---

## Task 16: ControlBar

**Files:**
- Create: `src/components/studio/ControlBar.tsx`
- Create: `src/__tests__/components/ControlBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/components/ControlBar.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlBar } from '../../components/studio/ControlBar';

describe('ControlBar', () => {
  it('renders Go Live and Record buttons', () => {
    render(
      <ControlBar
        isStreaming={false}
        isRecording={false}
        onStartStream={() => {}}
        onStopStream={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
      />
    );
    expect(screen.getByText('Go Live')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('shows Stop Stream when streaming', () => {
    render(
      <ControlBar
        isStreaming={true}
        isRecording={false}
        onStartStream={() => {}}
        onStopStream={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
      />
    );
    expect(screen.getByText('Stop Stream')).toBeInTheDocument();
  });

  it('calls onStartStream when Go Live is clicked', async () => {
    const onStart = vi.fn();
    render(
      <ControlBar
        isStreaming={false}
        isRecording={false}
        onStartStream={onStart}
        onStopStream={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
      />
    );
    await userEvent.click(screen.getByText('Go Live'));
    expect(onStart).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/components/ControlBar.test.tsx
```

Expected: FAIL — `ControlBar` module not found.

- [ ] **Step 3: Create `src/components/studio/ControlBar.tsx`**

```typescript
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';
import { Button } from '../common/Button';

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
`;

type Props = {
  isStreaming: boolean;
  isRecording: boolean;
  onStartStream: () => void;
  onStopStream: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
};

export function ControlBar({
  isStreaming,
  isRecording,
  onStartStream,
  onStopStream,
  onStartRecording,
  onStopRecording,
}: Props) {
  return (
    <Bar>
      {isStreaming ? (
        <Button variant="danger" onClick={onStopStream}>
          Stop Stream
        </Button>
      ) : (
        <Button variant="live" onClick={onStartStream}>
          Go Live
        </Button>
      )}
      {isRecording ? (
        <Button variant="danger" onClick={onStopRecording}>
          Stop Record
        </Button>
      ) : (
        <Button variant="secondary" onClick={onStartRecording}>
          Record
        </Button>
      )}
    </Bar>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/components/ControlBar.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/studio/ControlBar.tsx src/__tests__/components/ControlBar.test.tsx
git commit -m "feat: add ControlBar component with tests"
```

---

## Task 17: Assemble StudioPage

**Files:**
- Modify: `src/pages/StudioPage.tsx`

- [ ] **Step 1: Replace `src/pages/StudioPage.tsx` with the full studio layout**

```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { tokens } from '../theme/tokens';
import { Panel } from '../components/layout/Panel';
import { StudioGrid, TopBar, Logo, TopBarActions } from '../components/layout/PanelGrid';
import { PreviewPanel } from '../components/studio/PreviewPanel';
import { UnifiedChat } from '../components/studio/UnifiedChat';
import { ActivityFeed } from '../components/studio/ActivityFeed';
import { SessionInfo } from '../components/studio/SessionInfo';
import { ScenesPanel } from '../components/studio/ScenesPanel';
import { SourcesPanel } from '../components/studio/SourcesPanel';
import { AudioMixer } from '../components/studio/AudioMixer';
import { ControlBar } from '../components/studio/ControlBar';
import { Button } from '../components/common/Button';
import { useStudioStore } from '../stores/studioStore';
import {
  mockScenes,
  mockAudioSources,
  mockChatMessages,
  mockActivityEvents,
  mockStats,
  mockOutputStats,
} from '../mocks/mockData';

const BottomRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: ${tokens.spacing.sm};
  grid-column: 2 / 4;
`;

export function StudioPage() {
  const navigate = useNavigate();
  const {
    scenes,
    audioSources,
    chatMessages,
    activityEvents,
    stats,
    outputStats,
    activeSceneId,
    chatTarget,
    setScenes,
    setAudioSources,
    setStats,
    setOutputStats,
    switchScene,
    addChatMessage,
    setChatTarget,
  } = useStudioStore();

  useEffect(() => {
    setScenes(mockScenes);
    setAudioSources(mockAudioSources);
    setStats(mockStats);
    setOutputStats(mockOutputStats);
    mockChatMessages.forEach(addChatMessage);
    mockActivityEvents.forEach(useStudioStore.getState().addActivityEvent);
  }, []);

  const activeScene = scenes.find((s) => s.id === activeSceneId);

  return (
    <>
      <TopBar>
        <Logo>VaultStudio</Logo>
        <TopBarActions>
          <ControlBar
            isStreaming={outputStats?.isStreaming ?? false}
            isRecording={outputStats?.isRecording ?? false}
            onStartStream={() => {}}
            onStopStream={() => {}}
            onStartRecording={() => {}}
            onStopRecording={() => {}}
          />
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            Settings
          </Button>
          <Button variant="secondary" onClick={() => navigate('/connections')}>
            Connections
          </Button>
        </TopBarActions>
      </TopBar>

      <StudioGrid>
        <Panel title="Session">
          <SessionInfo stats={stats} outputStats={outputStats} />
        </Panel>

        <Panel title="Preview">
          <PreviewPanel isStreaming={outputStats?.isStreaming} />
        </Panel>

        <Panel title="Activity">
          <ActivityFeed events={activityEvents} />
        </Panel>

        <Panel title="Chat">
          <UnifiedChat
            messages={chatMessages}
            onSend={() => {}}
            chatTarget={chatTarget}
            onTargetChange={setChatTarget}
          />
        </Panel>

        <BottomRow>
          <Panel title="Scenes">
            <ScenesPanel
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSwitchScene={switchScene}
            />
          </Panel>
          <Panel title="Sources">
            <SourcesPanel sources={activeScene?.sources ?? []} />
          </Panel>
          <Panel title="Audio">
            <AudioMixer
              sources={audioSources}
              onVolumeChange={() => {}}
              onMuteToggle={() => {}}
            />
          </Panel>
        </BottomRow>
      </StudioGrid>
    </>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify dev server renders the dashboard**

```bash
npx vite --host
```

Expected: Open `http://localhost:5173` — should see the full VaultStudio dashboard with all panels, mock data, dark theme, gold accents.

- [ ] **Step 4: Commit**

```bash
git add src/pages/StudioPage.tsx
git commit -m "feat: assemble StudioPage with all panels and mock data"
```

---

## Task 18: ConnectionsPage

**Files:**
- Modify: `src/pages/ConnectionsPage.tsx`

- [ ] **Step 1: Replace `src/pages/ConnectionsPage.tsx`**

```typescript
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { tokens } from '../theme/tokens';
import { Panel } from '../components/layout/Panel';
import { PlatformBadge } from '../components/common/PlatformBadge';
import { Button } from '../components/common/Button';

const PageContainer = styled.div`
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.lg} ${tokens.spacing.xl};
`;

const Title = styled.h1`
  font-size: ${tokens.fontSize.xl};
  color: ${tokens.colors.gold};
  font-weight: ${tokens.fontWeight.bold};
`;

const Content = styled.div`
  flex: 1;
  padding: 0 ${tokens.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.lg};
  max-width: 600px;
`;

const AccountCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.lg};
`;

const AccountInfo = styled.div`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.md};
`;

const AccountName = styled.div`
  display: flex;
  flex-direction: column;
`;

const DisplayName = styled.span`
  font-size: ${tokens.fontSize.md};
  font-weight: ${tokens.fontWeight.medium};
  color: ${tokens.colors.text};
`;

const Status = styled.span<{ $connected: boolean }>`
  font-size: ${tokens.fontSize.xs};
  color: ${({ $connected }) => ($connected ? tokens.colors.kick : tokens.colors.muted)};
`;

const mockAccounts = [
  {
    platform: 'twitch' as const,
    displayName: 'VaultkeeperIRL',
    isConnected: true,
  },
  {
    platform: 'kick' as const,
    displayName: 'Vaultkeeper',
    isConnected: true,
  },
];

export function ConnectionsPage() {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <Header>
        <Title>Connections</Title>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Studio
        </Button>
      </Header>
      <Content>
        {mockAccounts.map((account) => (
          <Panel key={account.platform} title={account.platform === 'twitch' ? 'Twitch' : 'Kick'}>
            <AccountCard>
              <AccountInfo>
                <PlatformBadge platform={account.platform} />
                <AccountName>
                  <DisplayName>{account.displayName}</DisplayName>
                  <Status $connected={account.isConnected}>
                    {account.isConnected ? 'Connected' : 'Not connected'}
                  </Status>
                </AccountName>
              </AccountInfo>
              {account.isConnected ? (
                <Button variant="danger" onClick={() => {}}>
                  Disconnect
                </Button>
              ) : (
                <Button variant="primary" onClick={() => {}}>
                  Connect
                </Button>
              )}
            </AccountCard>
          </Panel>
        ))}
      </Content>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ConnectionsPage.tsx
git commit -m "feat: add ConnectionsPage with mock accounts"
```

---

## Task 19: SettingsPage

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace `src/pages/SettingsPage.tsx`**

```typescript
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { tokens } from '../theme/tokens';
import { Panel } from '../components/layout/Panel';
import { Button } from '../components/common/Button';

const PageContainer = styled.div`
  height: 100vh;
  background-color: ${tokens.colors.bg};
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.lg} ${tokens.spacing.xl};
`;

const Title = styled.h1`
  font-size: ${tokens.fontSize.xl};
  color: ${tokens.colors.gold};
  font-weight: ${tokens.fontWeight.bold};
`;

const Content = styled.div`
  flex: 1;
  padding: 0 ${tokens.spacing.xl};
  display: flex;
  flex-direction: column;
  gap: ${tokens.spacing.lg};
  max-width: 600px;
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${tokens.spacing.sm} 0;
  border-bottom: 1px solid ${tokens.colors.border};
`;

const SettingLabel = styled.span`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.muted};
`;

const SettingValue = styled.span`
  font-size: ${tokens.fontSize.sm};
  color: ${tokens.colors.text};
  font-weight: ${tokens.fontWeight.medium};
`;

const mockSettings = {
  streamTitle: 'VaultStudio Stream',
  streamCategory: 'Just Chatting',
  outputResolution: '1920x1080',
  videoBitrate: 6000,
  fps: 60,
  encoder: 'x264',
  audioBitrate: 160,
  recordingPath: 'C:/Users/Vaultkeeper/Videos/VaultStudio',
};

export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <Header>
        <Title>Stream Settings</Title>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to Studio
        </Button>
      </Header>
      <Content>
        <Panel title="Stream Info">
          <SettingRow>
            <SettingLabel>Title</SettingLabel>
            <SettingValue>{mockSettings.streamTitle}</SettingValue>
          </SettingRow>
          <SettingRow>
            <SettingLabel>Category</SettingLabel>
            <SettingValue>{mockSettings.streamCategory}</SettingValue>
          </SettingRow>
        </Panel>

        <Panel title="Output">
          <SettingRow>
            <SettingLabel>Resolution</SettingLabel>
            <SettingValue>{mockSettings.outputResolution}</SettingValue>
          </SettingRow>
          <SettingRow>
            <SettingLabel>Video Bitrate</SettingLabel>
            <SettingValue>{mockSettings.videoBitrate} kbps</SettingValue>
          </SettingRow>
          <SettingRow>
            <SettingLabel>FPS</SettingLabel>
            <SettingValue>{mockSettings.fps}</SettingValue>
          </SettingRow>
          <SettingRow>
            <SettingLabel>Encoder</SettingLabel>
            <SettingValue>{mockSettings.encoder}</SettingValue>
          </SettingRow>
          <SettingRow>
            <SettingLabel>Audio Bitrate</SettingLabel>
            <SettingValue>{mockSettings.audioBitrate} kbps</SettingValue>
          </SettingRow>
        </Panel>

        <Panel title="Recording">
          <SettingRow>
            <SettingLabel>Recording Path</SettingLabel>
            <SettingValue>{mockSettings.recordingPath}</SettingValue>
          </SettingRow>
        </Panel>
      </Content>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: add SettingsPage with mock settings"
```

---

## Task 20: Full Test Suite + Smoke Test

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (approximately 18 tests across 8 test files).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Start dev server and verify visually**

```bash
npx vite --host
```

Expected: Open `http://localhost:5173` and verify:
- Dark theme with gold/blue accents
- Top bar with VaultStudio logo, Go Live/Record buttons, Settings/Connections links
- Session panel with viewer count (37), platform breakdown, followers, subs, time live
- Preview panel with "Stream Preview" placeholder
- Activity feed with platform-badged events
- Unified chat with Twitch/Kick messages, platform badges, input box, send target selector
- Scenes panel with 3 scenes, active scene highlighted
- Sources panel showing sources for active scene
- Audio mixer with volume sliders, mute buttons, meter bars
- Click "Connections" — shows Connections page with Twitch/Kick accounts
- Click "Settings" — shows Settings page with stream info and output settings
- Click "Back to Studio" — returns to dashboard

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: VaultStudio Phase 1 complete — app shell with mock data"
```
