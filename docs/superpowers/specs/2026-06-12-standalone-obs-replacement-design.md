# VaultStudio: Standalone OBS Replacement Design

## Overview

Transform VaultStudio from an app that requires external OBS Studio to a fully
standalone streaming application built on embedded libobs. Users should not
need OBS installed or running separately.

---

## 1. Embedded libobs Engine

### Architecture

```
Electron Main Process
├── native/vaultstudio-obs.node   (C++ N-API addon)
│   ├── obs-core.cc               libobs init, module loading, shutdown
│   ├── obs-scenes.cc             Scene/source CRUD
│   ├── obs-output.cc             RTMP streaming, recording, replay buffer
│   ├── obs-audio.cc              Audio capture, volume, mute, VU meters
│   ├── obs-video.cc              Video settings, preview frame streaming
│   └── obs-events.cc             Callbacks → threadsafe → Electron IPC
├── services/
│   ├── obs-engine.ts             Thin TS wrapper around native addon
│   ├── obs-client.ts             REPLACED — removed entirely
│   └── obs-service.ts            REWIRED — calls native addon directly
└── ipc/obs-ipc.ts                UNCHANGED — surface identical to renderer
```

### Native Addon Design

- Build using `cmake-js` (npm package) which uses node's native headers
- CMake builds libobs from `vendor/obs-studio` + a new `addon/` target
- libobs plugins loaded: rtmp-output, ffmpeg-encoder, wasapi, dshow, win-capture
- Plugins skipped: browser-source, scripts, UI, captions, decklink
- OBS config directory: `userData/obs-config/` (app-scoped, not system-wide)
- On first launch: generate minimal `global.ini`, `basic.ini`, `service.json`

### Callback Flow

1. libobs fires callback (e.g., scene change, audio meter)
2. C++ addon receives callback, packages data as JSON
3. `napi_call_threadsafe_function` marshals to JS thread
4. `obs-engine.ts` receives and emits as `EventEmitter` events
5. `main.ts` broadcasts to renderer via `webContents.send`
6. Renderer's Zustand store processes the event

### Preview Frames

- `obs_source_get_frame()` on the program output → raw BGRA
- Convert to JPEG in addon (using stb_image_write or libjpeg)
- Send as base64 data URI (same contract as current preview system)
- Target: 30fps monitoring preview (vs current 10fps snapshot)

### Build Process

- `native/CMakeLists.txt` extended with `addon/` subdirectory
- `package.json` scripts: `"build:native": "cmake-js build"`
- Pre-built binaries committed for dev, built during `electron-builder` for release
- CI: GitHub Actions + `windows-2022` image, Visual Studio 2022, CMake 3.22+

---

## 2. Multi-Platform Support

### Platform Support Matrix

| Platform | Chat | Send | Viewers | Followers | Activity Events |
|----------|------|------|---------|-----------|----------------|
| Twitch   | IRC WS | OAuth | decapi.me | decapi.me | Follow, Sub, Gift, Raid, Cheer |
| Kick     | Pusher WS | No | kick.com API | kick.com API | Follow, Sub, Gift |
| YouTube  | Polling API | No (Phase 2) | YouTube Data API | YouTube Data API | Sub, SuperChat, Membership |
| TikTok   | WS scrape | No | Unofficial API | Unofficial API | Follow, Gift, Sub |

### New Chat Connectors

**youtube-chat.ts:**
- Polls `https://www.googleapis.com/youtube/v3/liveChat/messages` every 5s
- Needs API key + OAuth for user's channel
- Polls `liveStreams.list` for concurrent viewer count
- Maps: superChat → `cheer`, memberMilestone → `sub`, newSponsor → `sub`

**tiktok-chat.ts:**
- WebSocket connection to TikTok's live WebSocket endpoint
- Community reverse-engineered protocol (stable, widely used)
- Maps: gift → `gift`, subscribe → `sub`, share → `follow`
- Stats via TikTok's live room WebSocket payload

### Platform Manager Updates

- `platform-manager.ts`: Add `YouTubeChat` and `TikTokChat` instances
- Stats poller runs for all enabled platforms every 20s
- `CombinedStats` auto-sums viewer counts from all platforms
- `PlatformStatus` reflects connection state for each

### Type Changes

- `types/index.ts`: Add `'tiktok'` to `Platform` and `ChatTarget`
- Add `'youtube'` to `StreamTargetPlatform` (already exists)
- `PlatformConnection` extended for YouTube API key, TikTok session ID

---

## 3. UI/UX Improvements

### Right-Click Context Menus

Custom React context menu component (not Electron native — consistent look):

**Scenes context menu:**
- Rename
- Duplicate Scene
- Delete
- Set as BRB Scene (saves to Guard config)

**Sources context menu:**
- Properties (opens settings editor)
- Transform submenu: Fit to Screen, Stretch to Screen, Center, Reset Transform
- Filters
- Move Up / Move Down
- Visibility toggle
- Remove

Implementation: Own `ContextMenu.tsx` component, portal-rendered, positioned at
cursor. Single active menu at a time. Close on click outside / Escape.

### Draggable, Resizable Panels

Replace `PanelGrid.tsx` static CSS Grid with `react-grid-layout`:

- Each studio panel becomes a grid item with `data-grid={{x, y, w, h}}`
- Header bar is the drag handle
- Panels can be resized via bottom-right corner handle
- Layout persisted via existing `layout.save` IPC (add file persistence)
- **"Reset Layout"** button in top bar restores default arrangement
- Default layout matches current CSS Grid layout closely
- Layout presets (optional): Default, Chat Focused, Production

### Panel Header Enhancements

- Collapse/expand toggle (chevron icon)
- Float/unfloat (pop out to separate floating window)
- Context menu on header (close panel, reset panel, move to)

### Polish

- Loading skeleton components for async data
- Keyboard shortcuts: Ctrl+B (stream), Ctrl+R (record), Ctrl+D (VCam)
- Smooth layout transitions
- Animated audio VU meters (CSS transition on meter fill width)
- Toast notifications with platform-colored icons
- Stream health status bar color: green (good), yellow (warning), red (critical)
- Tooltips on all icon buttons
- Focus trap in modal/context menus

---

## 4. Platform Icons & Badges

### Icons to Add

- **YouTube**: Existing `YouTubeIcon` in `icons.tsx` (keep)
- **TikTok**: New `TikTokIcon` — music note SVG, default color `#000000`
- **Trovo** (future): `TrovoIcon` — "T" shape
- **Custom RTMP**: Generic globe/server icon

### Badge System

- `PlatformBadge.tsx` extended with TikTok color (`#FE2C55` bg, `#FFFFFF` fg)
- Chat role badges (Mod, Sub, VIP) already work generically per message
- YouTube badges: Member level, SuperChat amount rendered as colored text
- TikTok badges: Subscriber (crown icon), Gifter (gem icon)
- All role badges rendered in `UnifiedChat.tsx` via `msg.badges[]` array

---

## 5. Testing Strategy

### Unit Tests (Vitest + jsdom — existing)

- All new components get unit tests
- Store logic tests for platform state management
- Context menu open/close/action tests
- Layout persistence tests

### Integration Tests

- IPC handler-level tests (renderer → main process simulation)
- Chat connector tests with mock WebSocket/HTTP responses

### End-to-End Tests

- Use Playwright for Electron E2E testing
- Install: `@playwright/test` + `playwright` (Chromium for Electron)
- Test scenarios:
  1. App launches and shows studio page
  2. OBS engine initializes without external OBS
  3. Scene list loads, scenes can be switched
  4. Sources can be added/removed/reordered
  5. Chat panel shows connected state
  6. Platform connection page connects/disconnects
  7. Targets page CRUD operations
  8. Settings page read/write
  9. Layout is draggable and persists
  10. Context menus open and trigger actions
  11. Reset Layout restores defaults

### E2E Setup

- `tests/e2e/` directory at repo root
- Config: `playwright.config.ts` targeting Electron
- Test script: `"test:e2e": "playwright test"` in `package.json`

---

## 6. Migration Path

### Phase 1 (Foundation)
1. Build libobs native addon with `cmake-js`
2. Implement `obs-core.cc` — init, shutdown, config
3. Implement `obs-engine.ts` wrapper
4. Wire events from addon → renderer
5. Replace `obs-client.ts` with native engine
6. Preview frames from native output

### Phase 2 (Platforms)
7. `youtube-chat.ts` + `tiktok-chat.ts`
8. Platform manager integration
9. TikTok icon + PlatformBadge
10. ConnectionsPage UI for YouTube/TikTok

### Phase 3 (UI)
11. Custom context menu component
12. Right-click handlers on ScenesPanel, SourcesPanel
13. `react-grid-layout` integration
14. Layout persistence + Reset Layout
15. Panel collapse, keyboard shortcuts

### Phase 4 (Polish & Test)
16. Loading skeletons, toast polish, transitions
17. Animated VU meters, stream health bar
18. E2E test suite with Playwright
19. Build CI pipeline for native addon
20. Production installer testing

---

## 7. Error Handling

- Native addon: all C++ exceptions caught, returned as `napi_throw_error` with descriptive message
- TS wrapper catches native errors, wraps in typed error codes
- OBS init failure: show detailed error (missing GPU, incompatible GPU drivers, DirectX version)
- Plugin load failure: log warning but continue (graceful degradation)
- Stream failure: existing Stream Guard handles reconnection
- Chat disconnection: auto-reconnect with backoff (existing pattern)
- Context menu: safe against unmounted components (useEffect cleanup)
- Layout: validate layout on load, fall back to defaults if corrupted

---

## 8. Performance Considerations

- Preview frame capture at 30fps max (configurable in settings)
- Audio meter polling at 10hz (vs current 100hz — reduces IPC pressure)
- libobs encoding runs in its own threads — won't block Electron event loop
- Large chat buffers capped at 500 messages (existing)
- Context menu: single instance, destroyed on close
- react-grid-layout: use `compactType: 'vertical'` for stable layouts
- Native addon uses `napi_create_threadsafe_function` with FIFO queue to prevent callback overflow
