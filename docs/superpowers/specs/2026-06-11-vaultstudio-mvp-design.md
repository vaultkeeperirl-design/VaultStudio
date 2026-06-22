# VaultStudio MVP Design Spec

**Date:** 2026-06-11  
**Status:** Draft  
**Author:** VaultStudio Team

---

## 1. Product Goal

VaultStudio is a desktop streaming app that uses OBS as the core engine but presents itself as a complete standalone OBS replacement — not a plugin, not an external helper.

The MVP lets a streamer go live to multiple platforms while managing:

- Twitch chat
- Kick chat
- Combined viewer count
- Follower/subscriber/activity feeds
- OBS scenes, sources, audio, recording, and streaming controls

The app should feel like "OBS rebuilt for multi-platform streamers."

---

## 2. Core Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop shell | Electron + React | Mature ecosystem, web UI flexibility |
| Backend | Node.js in main process | Simpler than Tauri for libobs FFI |
| OBS integration | Embedded libobs via N-API addon | No external OBS dependency |
| Preview rendering | Canvas/texture capture | Flexible layout, React-native |
| Multi-stream | Built-in RTMP relay | No re-encoding, independent targets |
| Kick integration | Public API + reverse-engineered fallback | Best coverage available |
| Architecture | Monolithic main process | Simplest for MVP, refactor later |
| Local storage | SQLite (better-sqlite3) | Fast, embedded, no server needed |

---

## 3. Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Shell                        │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │   Renderer Process    │  │     Main Process        │  │
│  │   (React + TS)        │  │                         │  │
│  │                       │  │  ┌───────────────────┐  │  │
│  │  ┌─────────────────┐  │  │  │  libobs N-API     │  │  │
│  │  │ Studio Dashboard│  │  │  │  (native addon)   │  │  │
│  │  │ - Preview       │◄─┼──┼─►│  - scenes/sources │  │  │
│  │  │ - Unified Chat  │  │  │  │  - encoding       │  │  │
│  │  │ - Activity Feed │  │  │  │  - preview capture│  │  │
│  │  │ - Session Info  │  │  │  └───────────────────┘  │  │
│  │  │ - Scenes/Srcs   │  │  │                         │  │
│  │  │ - Audio Mixer   │  │  │  ┌───────────────────┐  │  │
│  │  │ - Controls      │  │  │  │  RTMP Relay       │  │  │
│  │  └─────────────────┘  │  │  │  (multi-platform) │  │  │
│  │                       │  │  └───────────────────┘  │  │
│  │  ┌─────────────────┐  │  │                         │  │
│  │  │ Connections Page│  │  │  ┌───────────────────┐  │  │
│  │  │ Settings Page   │  │  │  │  Platform Connect.│  │  │
│  │  │ Layout Editor   │  │  │  │  - Twitch (IRC +  │  │  │
│  │  └─────────────────┘  │  │  │    EventSub)      │  │  │
│  │                       │◄─┼──┼─►│  - Kick (API +    │  │  │
│  │                       │  │  │  │    Pusher WS)     │  │  │
│  │                       │  │  │  - Unified Event  │  │  │
│  │                       │  │  │    Bus             │  │  │
│  │                       │  │  └───────────────────┘  │  │
│  │                       │  │                         │  │
│  │                       │  │  ┌───────────────────┐  │  │
│  │                       │  │  │  SQLite (better-  │  │  │
│  │                       │  │  │  sqlite3)         │  │  │
│  │                       │  │  └───────────────────┘  │  │
│  └───────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key principles:**

- **Electron main process** runs all backend logic: libobs, RTMP relay, platform connectors, SQLite
- **Renderer process** is pure React/TypeScript, communicates via Electron IPC (`contextBridge`)
- **libobs** loaded as a native N-API addon (C++ Node addon using node-addon-api)
- **Preview capture**: libobs renders to an offscreen texture, frames are copied to a shared buffer, renderer draws them on a `<canvas>` element via `requestAnimationFrame`
- **RTMP relay**: main process receives one encoded stream from libobs, forks it to each platform's ingest URL
- **Unified Event Bus**: an EventEmitter in main process that normalizes all platform events into a single stream, renderer subscribes via IPC
- **SQLite** via `better-sqlite3` for accounts, tokens, layouts, settings, chat cache

---

## 4. libobs Integration Layer

The native addon wraps libobs's C API through N-API, exposing a JavaScript interface to the main process.

### 4.1 Module Structure

```
native/
├── binding.gyp
├── src/
│   ├── addon.cpp            # N-API module registration
│   ├── obs_core.cpp         # obs_startup, obs_shutdown, obs_reset
│   ├── obs_scenes.cpp       # scene CRUD, scene switching
│   ├── obs_sources.cpp      # source CRUD (camera, browser, image, media, display/window capture, audio in/out)
│   ├── obs_output.cpp       # stream/recording start/stop, output stats
│   ├── obs_audio.cpp        # mixer: volume, mute, meter levels
│   ├── obs_preview.cpp      # offscreen render → shared buffer for canvas
│   └── obs_settings.cpp     # encoder, resolution, bitrate, fps, audio bitrate
```

### 4.2 JavaScript API

```typescript
interface ObsBridge {
  // Lifecycle
  initialize(configPath: string): void;
  shutdown(): void;

  // Scenes
  getScenes(): Scene[];
  createScene(name: string): Scene;
  deleteScene(id: string): void;
  switchScene(id: string): void;

  // Sources
  getSources(sceneId: string): Source[];
  addSource(sceneId: string, type: SourceType, settings: object): Source;
  removeSource(sceneId: string, sourceId: string): void;
  updateSourceSettings(sourceId: string, settings: object): void;

  // Output
  startStreaming(rtmpUrls: string[]): void;  // relay URLs
  stopStreaming(): void;
  startRecording(path: string): void;
  stopRecording(): void;
  getOutputStats(): OutputStats;

  // Audio
  getAudioSources(): AudioSource[];
  setVolume(sourceId: string, volume: number): void;
  setMuted(sourceId: string, muted: boolean): void;

  // Preview
  getPreviewFrame(): ArrayBuffer;  // RGBA pixel data
  setPreviewSize(width: number, height: number): void;

  // Settings
  getSettings(): ObsSettings;
  updateSettings(settings: Partial<ObsSettings>): void;
}
```

### 4.3 Preview Capture Flow

1. libobs renders the current scene to an offscreen GPU texture each frame
2. The addon reads the texture back to a CPU-side RGBA buffer (throttled to ~30fps for preview)
3. The buffer is shared with the renderer via a `SharedArrayBuffer` or copied via IPC
4. React component draws the buffer onto a `<canvas>` using `ImageData` + `putImageData`

### 4.4 Source Types Supported in MVP

- `camera` — video capture device (webcam)
- `browser` — browser source (URL)
- `image` — static image file
- `media` — video/audio file playback
- `display_capture` — screen capture
- `window_capture` — specific window capture
- `audio_input` — microphone / audio input device
- `audio_output` — desktop / system audio capture

---

## 5. RTMP Relay & Multi-Platform Streaming

The built-in relay receives one encoded stream from libobs and forks it to each connected platform's ingest server.

### 5.1 Flow

```
libobs encoder
    │
    ▼
┌─────────────────┐
│  RTMP Relay     │  (main process, runs a local RTMP server)
│  :1935/live     │
└────┬────────┬───┘
     │        │
     ▼        ▼
  Twitch    Kick
  ingest    ingest
```

### 5.2 How It Works

1. libobs encodes the stream once (H.264 + AAC)
2. libobs outputs to `rtmp://127.0.0.1:1935/live/vaultstudio` (local relay)
3. The relay (Node-based RTMP server in main process) receives the stream
4. For each connected platform, the relay opens an outbound RTMP connection to that platform's ingest URL with the user's stream key
5. The relay forwards the encoded packets — no re-encoding, just repackaging

### 5.3 Relay Module

```typescript
interface RtmpRelay {
  start(): void;                              // start local RTMP server
  stop(): void;
  addTarget(platform: string, ingestUrl: string, streamKey: string): void;
  removeTarget(platform: string): void;
  getTargetStats(): Record<string, RelayTargetStats>;
}

interface RelayTargetStats {
  platform: string;
  connected: boolean;
  bytesSent: number;
  droppedFrames: number;
  bitrateKbps: number;
}
```

### 5.4 Key Details

- Uses `node-media-server` or a custom minimal RTMP implementation (lightweight, no re-encoding)
- Each target connection is independent — if Twitch ingest drops, Kick continues
- Relay stats (bitrate, dropped frames per target) are exposed to the UI
- If only one platform is connected, the relay is a simple passthrough (minimal overhead)
- Recording goes directly from libobs to a local file, bypassing the relay

### 5.5 Go-Live Flow

When the user clicks "Go Live":

1. Main process starts the RTMP relay server on `127.0.0.1:1935`
2. For each connected platform, add a relay target with that platform's ingest URL + stream key
3. Tell libobs to start streaming to `rtmp://127.0.0.1:1935/live/vaultstudio`
4. libobs encodes once, relay forks to all targets
5. UI updates to show "LIVE" status and per-target stats

When the user clicks "Stop":

1. Tell libobs to stop streaming
2. Relay closes all outbound connections
3. Relay server stops

### 5.6 Stream Key Management

- Twitch stream key: fetched via Twitch API (`Get Stream Key` endpoint) or user-entered fallback
- Kick stream key: fetched via Kick API or user-entered fallback
- Keys stored encrypted in SQLite

---

## 6. Platform Connectors

Each platform connector handles authentication, chat, and data fetching. All connectors feed into the Unified Event Bus.

### 6.1 Twitch Connector

```typescript
interface TwitchConnector {
  // Auth
  connectOAuth(): Promise<TwitchAccount>;
  disconnect(): void;
  refreshTokens(): Promise<void>;

  // Chat
  connectChat(channelId: string): void;
  disconnectChat(): void;
  sendMessage(channelId: string, message: string): Promise<void>;

  // Data
  getViewerCount(channelId: string): Promise<number>;
  getFollowers(channelId: string): Promise<number>;
  getSubscribers(channelId: string): Promise<number>;
  getStreamInfo(channelId: string): Promise<StreamInfo>;
}
```

**Implementation details:**

- **Auth**: OAuth 2.0 Authorization Code Flow with PKCE via Electron's `BrowserWindow` for login
- **Chat**: `tmi.js` or raw IRC over TLS (`irc.twitch.tv:6697`) for reading/sending messages
- **Events**: Twitch EventSub (WebSocket transport) for follows, subs, cheers, raids, gifts
- **Data**: Twitch Helix API (`api.twitch.tv/helix`) for viewer count, followers, stream info
- **Scopes**: `chat:read`, `chat:edit`, `channel:read:subscriptions`, `channel:read:redemptions`, `moderator:read:followers`, `channel:manage:broadcast`

### 6.2 Kick Connector

```typescript
interface KickConnector {
  // Auth
  connect(): Promise<KickAccount>;
  disconnect(): void;

  // Chat
  connectChat(channelId: string): void;
  disconnectChat(): void;
  sendMessage(channelId: string, message: string): Promise<void>;

  // Data
  getViewerCount(channelId: string): Promise<number>;
  getStreamInfo(channelId: string): Promise<StreamInfo>;
}
```

**Implementation details:**

- **Auth**: Kick public API OAuth if available, otherwise browser-based login scraping session tokens
- **Chat**: Pusher WebSocket (Kick uses Pusher for real-time chat events) — subscribe to `chatrooms.{id}.v2` channel
- **Events**: Pusher channels for sub events, gift subs, stream streaks where available
- **Data**: Kick public API (`kick.com/api/v2/`) for viewer count, stream info, channel info
- **Fallback**: Community libraries (`kick-chat`, `kick-js`) wrapping Pusher + API

### 6.3 Unified Event Bus

```typescript
interface UnifiedEventBus extends EventEmitter {
  // Chat
  on('chat:message', (msg: UnifiedChatMessage) => void): this;
  emit('chat:message', msg: UnifiedChatMessage): boolean;

  // Activity
  on('activity:event', (evt: UnifiedActivityEvent) => void): this;
  emit('activity:event', evt: UnifiedActivityEvent): boolean;

  // Stats
  on('stats:update', (stats: CombinedStats) => void): this;
  emit('stats:update', stats: CombinedStats): boolean;

  // Stream status
  on('stream:status', (status: StreamStatus) => void): this;
}
```

Each connector normalizes its platform-specific events into `UnifiedChatMessage` and `UnifiedActivityEvent` before emitting on the bus. The renderer subscribes to the bus via IPC and renders everything in unified views.

### 6.4 Connection State (SQLite)

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,        -- 'twitch' | 'kick'
  username TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  display_name TEXT,
  profile_image_url TEXT,
  access_token TEXT NOT NULL,    -- encrypted
  refresh_token TEXT,            -- encrypted
  token_expires_at INTEGER,
  stream_key TEXT,               -- encrypted
  connected_at INTEGER NOT NULL,
  is_connected INTEGER NOT NULL DEFAULT 1
);
```

---

## 7. Studio UI (React Renderer)

### 7.1 Page Structure

```
App
├── StudioPage          (main dashboard — default view)
├── ConnectionsPage     (connect/disconnect Twitch, Kick)
├── SettingsPage        (stream title, category, encoder, bitrate, etc.)
└── LayoutEditorPage    (resize/move/hide panels, save layout)
```

### 7.2 StudioPage Panel Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [VaultStudio logo]    [Go Live] [Record] [Settings] [Conn]  │
├───────────────┬───────────────────────────────┬──────────────┤
│ SessionInfo   │                               │ ActivityFeed │
│               │       PreviewPanel            │              │
│ Viewers: 37   │       (canvas element)        │ [Kick] sub   │
│ Twitch: 12    │                               │ [Twitch] cheer│
│ Kick: 25      │                               │ [Twitch] follow│
│ Followers     │                               │              │
│ Subs          │                               │              │
│ Time Live     │                               │              │
├───────────────┼───────────────────────────────┼──────────────┤
│ UnifiedChat   │ ScenesPanel │ SourcesPanel    │ AudioMixer   │
│               │             │                 │              │
│ [Twitch] user │ Scene 1 ●   │ Camera          │ Mic ████░░   │
│ [Kick] user   │ Scene 2     │ Browser         │ Desktop ████ │
│               │ Scene 3     │ Image           │              │
│ [input box]   │             │ Media           │              │
│ [Send: All ▼] │             │                 │              │
└───────────────┴─────────────┴─────────────────┴──────────────┘
```

### 7.3 Panel Components

| Component | Description |
|---|---|
| `PreviewPanel` | `<canvas>` drawing libobs frames from shared buffer |
| `UnifiedChat` | Scrollable message list + input box + platform target selector |
| `ActivityFeed` | Scrollable event list with platform badges, auto-scroll |
| `SessionInfo` | Total viewers, per-platform breakdown, followers, subs, time live, stream status |
| `ScenesPanel` | List of scenes, click to switch, add/delete buttons |
| `SourcesPanel` | List of sources in selected scene, add/remove/reorder |
| `AudioMixer` | Volume sliders + mute toggles per audio source, meter levels |
| `ControlBar` | Go Live, Stop, Record, Stop Record buttons + stream status indicator |

### 7.4 State Management

- Zustand store in renderer for UI state
- IPC bridge (`contextBridge`) exposes typed API to renderer
- Main process is the single source of truth — renderer subscribes to updates via IPC events
- Chat messages buffered in main process, batched to renderer (max ~100 messages in memory, older ones evicted)

### 7.5 Layout Persistence

- Each panel has `visible`, `position`, `size` stored in `StudioLayout`
- Layout saved to SQLite on change
- Loaded on app start

### 7.6 Design Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0B0B0D` | App background |
| `--panel` | `#15161A` | Panel background |
| `--panel-2` | `#1E2026` | Nested panel / elevated |
| `--gold` | `#D6A23A` | Primary accent, buttons, highlights |
| `--dark-gold` | `#8C621D` | Hover states, borders |
| `--neon-blue` | `#27A8FF` | Links, active states, badges |
| `--text` | `#F2F2F2` | Primary text |
| `--muted` | `#A6A6A6` | Secondary text |
| `--danger` | `#FF3045` | Errors, stop button |
| `--live` | `#FF0033` | Live indicator |

Platform badge colors: Twitch `#9146FF`, Kick `#53FC18`

---

## 8. IPC Bridge & Data Models

### 8.1 IPC Bridge (contextBridge API exposed to renderer)

```typescript
interface VaultStudioAPI {
  // OBS Control
  obs: {
    getScenes(): Promise<Scene[]>;
    createScene(name: string): Promise<Scene>;
    deleteScene(id: string): Promise<void>;
    switchScene(id: string): Promise<void>;
    getSources(sceneId: string): Promise<Source[]>;
    addSource(sceneId: string, type: SourceType, settings: object): Promise<Source>;
    removeSource(sceneId: string, sourceId: string): Promise<void>;
    updateSourceSettings(sourceId: string, settings: object): Promise<void>;
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

  // Platforms
  platforms: {
    connectTwitch(): Promise<TwitchAccount>;
    connectKick(): Promise<KickAccount>;
    disconnect(platform: string): Promise<void>;
    getAccounts(): Promise<Account[]>;
  };

  // Chat
  chat: {
    sendMessage(message: string, target: 'all' | 'twitch' | 'kick'): Promise<void>;
    clearHistory(): void;
  };

  // Layout
  layout: {
    get(): Promise<StudioLayout>;
    save(layout: StudioLayout): Promise<void>;
  };

  // Settings
  settings: {
    get(): Promise<AppSettings>;
    update(settings: Partial<AppSettings>): Promise<void>;
  };

  // Event subscriptions (renderer subscribes to main process events)
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
}
```

### 8.2 Core Data Models

```typescript
// Scenes & Sources
type Scene = {
  id: string;
  name: string;
  sources: Source[];
  isActive: boolean;
};

type SourceType =
  | 'camera' | 'browser' | 'image' | 'media'
  | 'display_capture' | 'window_capture'
  | 'audio_input' | 'audio_output';

type Source = {
  id: string;
  name: string;
  type: SourceType;
  visible: boolean;
  settings: Record<string, any>;
};

type AudioSource = {
  id: string;
  name: string;
  volume: number;       // 0.0 - 1.0
  muted: boolean;
  meterLevel: number;   // 0.0 - 1.0 for VU meter
};

// Output
type OutputStats = {
  isStreaming: boolean;
  isRecording: boolean;
  bitrateKbps: number;
  droppedFrames: number;
  totalFrames: number;
  cpuUsage: number;
  fps: number;
  streamDuration: number;  // seconds
  targets: {
    platform: string;
    connected: boolean;
    bitrateKbps: number;
    droppedFrames: number;
  }[];
};

type ObsSettings = {
  outputResolution: string;   // "1920x1080"
  fps: number;
  videoBitrate: number;       // kbps
  encoder: string;            // "x264" | "nvenc" | "amf"
  audioBitrate: number;       // kbps
};

// Accounts
type Account = {
  id: string;
  platform: 'twitch' | 'kick';
  username: string;
  displayName: string;
  channelId: string;
  profileImageUrl?: string;
  isConnected: boolean;
  connectedAt: number;
};

// Chat
type ChatBadge = {
  name: string;
  url: string;
};

type UnifiedChatMessage = {
  id: string;
  platform: 'twitch' | 'kick';
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

// Activity
type UnifiedActivityEvent = {
  id: string;
  platform: 'twitch' | 'kick';
  type: 'follow' | 'sub' | 'resub' | 'gift_sub' | 'cheer' | 'raid' | 'stream_streak' | 'donation';
  username: string;
  message?: string;
  amount?: number;
  timestamp: number;
};

// Stats
type PlatformStats = {
  platform: 'twitch' | 'kick';
  viewers: number;
  followers?: number;
  subscribers?: number;
  updatedAt: number;
};

type CombinedStats = {
  totalViewers: number;
  platforms: PlatformStats[];
};

// Layout
type PanelState = {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

type StudioLayout = {
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

// App Settings
type AppSettings = {
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
```

---

## 9. MVP Success Criteria

The MVP is successful when the user can:

1. Open VaultStudio.
2. Connect Twitch and Kick.
3. See both chats in one chat box.
4. Send a message to Twitch, Kick, or both.
5. See combined viewer count.
6. See platform activity in one feed.
7. Switch scenes.
8. Start and stop streaming.
9. Start and stop recording.
10. Use the app without opening normal OBS manually.

---

## 10. Non-Negotiables

The app must not feel like:

- A browser tab
- A random OBS plugin
- A separate chat overlay
- A second app next to OBS

It must feel like:

- A branded OBS replacement built for multi-platform streaming.

The unified chat is the killer feature.

The streamer should never need:

- One Twitch chat window
- One Kick chat window
- One activity feed window
- One stats website
- Normal OBS

VaultStudio should combine all of that into one app.

---

## 11. Design Style

Visual style:

- Dark theme
- Black/charcoal panels
- Gold highlights
- Blue neon accents
- Clean readable text
- Streamer dashboard feel
- OBS familiarity, but more premium
- Compact panels
- Strong platform badges

Suggested colors:

- Background: `#0B0B0D`
- Panel: `#15161A`
- Panel 2: `#1E2026`
- Gold: `#D6A23A`
- Dark Gold: `#8C621D`
- Neon Blue: `#27A8FF`
- Text: `#F2F2F2`
- Muted Text: `#A6A6A6`
- Danger Red: `#FF3045`
- Live Red: `#FF0033`

---

## 12. Build Phases

### Phase 1: App Shell

Build the desktop app shell.

**Requirements:**

- Dark UI
- VaultStudio branding
- Main dashboard layout
- Mock stream preview panel
- Mock unified chat panel
- Mock activity feed
- Mock session info
- Scene/source/audio/control panels

**Goal:**

App opens and visually looks like VaultStudio.

### Phase 2: OBS Control Layer

Add real OBS control.

**Requirements:**

- Embed libobs core
- Start/stop streaming
- Start/stop recording
- Read current scenes
- Switch scenes
- Read sources
- Mute/unmute audio sources
- Display stream status
- Display dropped frames, bitrate, CPU, FPS

### Phase 3: Unified Chat

Add Twitch and Kick chat connectors.

**Requirements:**

- Connect Twitch account
- Connect Kick account
- Receive chat messages from both
- Normalize messages
- Render in one chat list
- Add platform badges
- Send messages to Twitch
- Send messages to Kick
- Send to all connected platforms

This is the core MVP win.

### Phase 4: Combined Stats

Add stream stats.

**Requirements:**

- Twitch viewer count
- Kick viewer count
- Combined viewer count
- Twitch followers
- Kick followers if available
- Subs where available
- Time live
- Stream status

Session panel should show:

```
STREAMING
Viewers: 37
Followers: 2,070
Subs: 7
Time Live: 00:13:48
```

### Phase 5: Activity Feed

Add unified activity feed.

**Requirements:**

- Twitch follows/subs/cheers
- Kick subs/follows/events where available
- Unified activity list
- Platform icons
- Recent events cache
- Click event to inspect details

### Phase 6: Stream Setup

Add basic stream setup.

**Requirements:**

- Select platforms to stream to
- Set title/category
- Start stream
- Stop stream
- Start recording
- Stop recording
- Save stream profile

MVP can use restream/RTMP output first if direct multi-streaming is too complex.

---

## 13. Future Enhancements (Post-MVP)

- YouTube Live integration
- TikTok Live integration
- Facebook Live integration
- Trovo integration
- Advanced scene transitions
- Streamlabs/StreamElements integration
- Donation alerts
- Browser source overlays
- Multi-account support per platform
- Cloud backup of layouts/settings
- Mobile companion app for monitoring

---

## 14. Technical Debt Prevention

- Write tests for platform connectors early
- Document libobs API quirks as discovered
- Keep IPC bridge typed and versioned
- Encrypt all tokens/keys at rest
- Log errors with context for debugging
- Profile preview capture performance regularly

---

## 15. Conclusion

VaultStudio MVP delivers a unified streaming experience for multi-platform streamers. By embedding libobs and building a custom React UI, the app provides OBS power with a modern, branded interface. The killer feature — unified chat — solves a real pain point for streamers managing Twitch and Kick simultaneously.

The monolithic architecture keeps the MVP simple. Process isolation can be added later if needed. The built-in RTMP relay enables multi-platform streaming without external services or re-encoding overhead.

Success means a streamer can open VaultStudio, connect their accounts, and go live to multiple platforms with one combined chat, one activity feed, and one set of controls — all without ever opening OBS.
