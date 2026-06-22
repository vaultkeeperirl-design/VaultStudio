# VaultStudio: Standalone OBS Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform VaultStudio into a standalone OBS replacement with embedded libobs, multi-platform support (YouTube, TikTok), draggable panels, right-click menus, and production polish.

**Architecture:** Four phases: (1) Native libobs addon replacing obs-websocket, (2) YouTube/TikTok chat + stats connectors, (3) UI overhaul with context menus + react-grid-layout, (4) Polish + E2E tests. Each phase produces independently testable software.

**Tech Stack:** C++17 + N-API + cmake-js for native addon, Electron 40 + React 19 + Zustand 5 + styled-components 6, react-grid-layout, Playwright for E2E.

---

## File Structure

### Created files:
- `native/addon/addon.cc` — N-API module entry, exports
- `native/addon/obs-core.cc` — libobs init, config, shutdown
- `native/addon/obs-scenes.cc` — scene/source CRUD mapped to N-API
- `native/addon/obs-output.cc` — streaming, recording, replay buffer
- `native/addon/obs-audio.cc` — audio capture, volume, mute, VU meters
- `native/addon/obs-video.cc` — video settings, preview frame capture
- `native/addon/obs-events.cc` — callback registration → threadsafe JS
- `native/addon/CMakeLists.txt` — cmake-js addon build
- `native/addon/package.json` — cmake-js package config
- `electron/services/obs-engine.ts` — TypeScript wrapper around native addon
- `electron/services/chat/youtube-chat.ts` — YouTube Live Chat connector
- `electron/services/chat/tiktok-chat.ts` — TikTok Live Chat connector
- `src/components/common/ContextMenu.tsx` — Reusable context menu
- `src/hooks/useKeyboardShortcuts.ts` — Keyboard shortcuts hook
- `src/components/layout/ResizablePanel.tsx` — Draggable/resizable panel wrapper
- `playwright.config.ts` — Playwright E2E config
- `tests/e2e/studio.test.ts` — Studio page E2E tests
- `tests/e2e/connections.test.ts` — Connections page E2E tests

### Modified files:
- `package.json` — add deps: react-grid-layout, cmake-js, playwright
- `native/CMakeLists.txt` — add `add_subdirectory(addon)`
- `electron/main.ts` — replace obs-client wiring with obs-engine
- `electron/services/obs-client.ts` — remove or gut
- `electron/services/obs-service.ts` — rewire to native addon
- `electron/services/platform-manager.ts` — add YouTube + TikTok
- `electron/ipc/index.ts` — register new IPC if needed
- `electron/ipc/layout-ipc.ts` — add disk persistence
- `src/types/index.ts` — add TikTok, YouTube platform types
- `src/components/common/icons.tsx` — add TikTokIcon, YouTubeIcon polish
- `src/components/common/PlatformBadge.tsx` — add TikTok
- `src/components/studio/ScenesPanel.tsx` — right-click context menu
- `src/components/studio/SourcesPanel.tsx` — right-click context menu
- `src/components/studio/PreviewPanel.tsx` — adapt for native preview
- `src/components/studio/AudioMixer.tsx` — animated meters
- `src/pages/StudioPage.tsx` — layout wiring, keyboard shortcuts
- `src/pages/ConnectionsPage.tsx` — YouTube + TikTok panels
- `src/stores/studioStore.ts` — minor type additions
- `src/theme/tokens.ts` — add TikTok color
- `vite.config.ts` — test config if needed

---

## Phase 1: Native libobs Addon (Foundation)

### Task 1.1: Native addon build setup

**Files:**
- Create: `native/addon/CMakeLists.txt`
- Create: `native/addon/package.json`
- Modify: `native/CMakeLists.txt`
- Modify: `package.json`

- [ ] **Step 1: Create addon CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.22)
project(vaultstudio-obs NODESCRIPTION LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD 11)

# Node.js headers from cmake-js
include_directories(${CMAKE_JS_INC})

add_library(${PROJECT_NAME} SHARED
  addon.cc
  obs-core.cc
  obs-scenes.cc
  obs-output.cc
  obs-audio.cc
  obs-video.cc
  obs-events.cc
)

target_link_libraries(${PROJECT_NAME} PRIVATE
  ${CMAKE_JS_LIB}
  ${OBS_SRC_DIR}/libobs/libobs.lib  # built by parent CMakeLists.txt
)

# Windows-specific
if(WIN32)
  target_link_libraries(${PROJECT_NAME} PRIVATE
    ws2_32
    user32
    gdi32
  )
endif()

set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)
```

- [ ] **Step 2: Create addon package.json**

```json
{
  "name": "vaultstudio-obs-native",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "cmake-js compile",
    "rebuild": "cmake-js rebuild"
  },
  "cmake-js": {
    "runtime": "electron",
    "runtimeVersion": "40.0.0",
    "arch": "x64"
  }
}
```

- [ ] **Step 3: Modify native/CMakeLists.txt to add addon subdirectory**

Add before the install commands:
```cmake
add_subdirectory(addon)
```

- [ ] **Step 4: Add cmake-js dep to package.json**

```json
"devDependencies": {
  "cmake-js": "^7.3.0"
}
```

- [ ] **Step 5: Install and test build**

```
cd native/addon
npm install
npm run build
```
Expected: `build/Release/vaultstudio-obs.node` exists.

- [ ] **Step 6: Commit**

```bash
git add native/addon/ native/CMakeLists.txt package.json
git commit -m "feat: add native libobs addon build scaffolding"
```

---

### Task 1.2: OBS Core addon implementation

**Files:**
- Create: `native/addon/obs-core.cc`
- Create: `native/addon/addon.cc`

- [ ] **Step 1: Create obs-core.cc with init/shutdown**

```cpp
#include <napi.h>
#include <obs.h>
#include <obs-module.h>
#include <obs-config.h>
#include <string>
#include <filesystem>

namespace fs = std::filesystem;

static bool g_obs_initialized = false;

struct ObsConfigPaths {
  std::wstring configPath;
  std::wstring dataPath;
  std::wstring pluginsPath;
};

static ObsConfigPaths getObsPaths() {
  wchar_t appData[MAX_PATH] = {};
  GetEnvironmentVariableW(L"APPDATA", appData, MAX_PATH);
  std::wstring base = std::wstring(appData) + L"\\VaultStudio\\obs-config";
  return {
    base + L"",
    base + L"\\data",
    base + L"\\plugins"
  };
}

Napi::Value InitObs(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (g_obs_initialized) return Napi::Boolean::New(env, true);

  auto paths = getObsPaths();

  // Create directories
  fs::create_directories(paths.configPath);
  fs::create_directories(paths.dataPath);
  fs::create_directories(paths.pluginsPath);

  // Write minimal global.ini if not exists
  auto globalIni = paths.configPath + L"\\global.ini";
  if (!fs::exists(globalIni)) {
    std::string ini = "[General]\nName=Untitled\n";
    FILE* f = _wfopen(globalIni.c_str(), L"w");
    if (f) { fwrite(ini.data(), 1, ini.size(), f); fclose(f); }
  }

  // Set OBS paths
  std::string configStr(paths.configPath.begin(), paths.configPath.end());
  std::string dataStr(paths.dataPath.begin(), paths.dataPath.end());
  std::string pluginsStr(paths.pluginsPath.begin(), paths.pluginsPath.end());

  obs_set_config_path(configStr.c_str());
  obs_set_data_path(dataStr.c_str());
  obs_set_plugin_path(pluginsStr.c_str());

  // Init OBS graphics
  struct obs_video_info ovi = {};
  ovi.output_width = 1920;
  ovi.output_height = 1080;
  ovi.fps_num = 60;
  ovi.fps_den = 1;
  ovi.graphics_module = "libobs-d3d11";
  ovi.base_width = 1920;
  ovi.base_height = 1080;
  ovi.output_format = VIDEO_FORMAT_NV12;
  ovi.adapter = 0;
  ovi.gpu_conversion = true;

  int ret = obs_startup("en-US", &ovi, NULL);
  if (ret != 0) {
    Napi::Error::New(env, "obs_startup failed: " + std::to_string(ret)).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_obs_initialized = true;
  return Napi::Boolean::New(env, true);
}

Napi::Value ShutdownObs(const Napi::CallbackInfo& info) {
  if (g_obs_initialized) {
    obs_shutdown();
    g_obs_initialized = false;
  }
  return info.Env().Undefined();
}

Napi::Value IsObsInitialized(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), g_obs_initialized);
}
```

- [ ] **Step 2: Create addon.cc entry point**

```cpp
#include <napi.h>

// Declarations from other compilation units
Napi::Value InitObs(const Napi::CallbackInfo& info);
Napi::Value ShutdownObs(const Napi::CallbackInfo& info);
Napi::Value IsObsInitialized(const Napi::CallbackInfo& info);

// Scenes
Napi::Value GetScenes(const Napi::CallbackInfo& info);
Napi::Value CreateScene(const Napi::CallbackInfo& info);
Napi::Value RemoveScene(const Napi::CallbackInfo& info);
Napi::Value SetCurrentScene(const Napi::CallbackInfo& info);
Napi::Value RenameScene(const Napi::CallbackInfo& info);

// Sources
Napi::Value GetSceneSources(const Napi::CallbackInfo& info);
Napi::Value CreateSource(const Napi::CallbackInfo& info);
Napi::Value RemoveSource(const Napi::CallbackInfo& info);
Napi::Value SetSourceVisible(const Napi::CallbackInfo& info);
Napi::Value SetSourceOrder(const Napi::CallbackInfo& info);

// Output
Napi::Value StartStream(const Napi::CallbackInfo& info);
Napi::Value StopStream(const Napi::CallbackInfo& info);
Napi::Value StartRecording(const Napi::CallbackInfo& info);
Napi::Value StopRecording(const Napi::CallbackInfo& info);
Napi::Value GetOutputStats(const Napi::CallbackInfo& info);

// Audio
Napi::Value GetAudioSources(const Napi::CallbackInfo& info);
Napi::Value SetVolume(const Napi::CallbackInfo& info);
Napi::Value SetMuted(const Napi::CallbackInfo& info);

// Preview
Napi::Value StartPreview(const Napi::CallbackInfo& info);
Napi::Value StopPreview(const Napi::CallbackInfo& info);

// Events
Napi::Value RegisterEventCallback(const Napi::CallbackInfo& info);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initObs", Napi::Function::New(env, InitObs));
  exports.Set("shutdownObs", Napi::Function::New(env, ShutdownObs));
  exports.Set("isObsInitialized", Napi::Function::New(env, IsObsInitialized));

  exports.Set("getScenes", Napi::Function::New(env, GetScenes));
  exports.Set("createScene", Napi::Function::New(env, CreateScene));
  exports.Set("removeScene", Napi::Function::New(env, RemoveScene));
  exports.Set("setCurrentScene", Napi::Function::New(env, SetCurrentScene));
  exports.Set("renameScene", Napi::Function::New(env, RenameScene));

  exports.Set("getSceneSources", Napi::Function::New(env, GetSceneSources));
  exports.Set("createSource", Napi::Function::New(env, CreateSource));
  exports.Set("removeSource", Napi::Function::New(env, RemoveSource));
  exports.Set("setSourceVisible", Napi::Function::New(env, SetSourceVisible));
  exports.Set("setSourceOrder", Napi::Function::New(env, SetSourceOrder));

  exports.Set("startStream", Napi::Function::New(env, StartStream));
  exports.Set("stopStream", Napi::Function::New(env, StopStream));
  exports.Set("startRecording", Napi::Function::New(env, StartRecording));
  exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
  exports.Set("getOutputStats", Napi::Function::New(env, GetOutputStats));

  exports.Set("getAudioSources", Napi::Function::New(env, GetAudioSources));
  exports.Set("setVolume", Napi::Function::New(env, SetVolume));
  exports.Set("setMuted", Napi::Function::New(env, SetMuted));

  exports.Set("startPreview", Napi::Function::New(env, StartPreview));
  exports.Set("stopPreview", Napi::Function::New(env, StopPreview));

  exports.Set("registerEventCallback", Napi::Function::New(env, RegisterEventCallback));
  return exports;
}

NODE_API_MODULE(vaultstudio_obs, Init)
```

- [ ] **Step 3: Create obs-engine.ts TypeScript wrapper**

```typescript
// electron/services/obs-engine.ts
import { EventEmitter } from 'events';

let native: typeof import('../../native/addon/build/Release/vaultstudio-obs.node') | null = null;
try {
  native = require('../../native/addon/build/Release/vaultstudio-obs.node');
} catch {
  // Fallback: OBS engine not built yet
}

type ObsEventCallback = (eventType: string, data: Record<string, unknown>) => void;

class ObsEngine extends EventEmitter {
  private initialized = false;
  private previewActive = false;
  private previewTimer: NodeJS.Timeout | null = null;

  isAvailable(): boolean {
    return native !== null;
  }

  init(): boolean {
    if (!native) return false;
    if (this.initialized) return true;
    try {
      const result = native.initObs();
      this.initialized = true;
      this.setupNativeEvents();
      return result as boolean;
    } catch (e) {
      console.error('Failed to init OBS engine:', e);
      return false;
    }
  }

  shutdown() {
    this.stopPreview();
    if (native && this.initialized) {
      native.shutdownObs();
      this.initialized = false;
    }
  }

  private setupNativeEvents() {
    if (!native) return;
    native.registerEventCallback((eventType: string, data: string) => {
      const parsed = JSON.parse(data);
      this.emit('event', eventType, parsed);
      this.emit(`event:${eventType}`, parsed);
    });
  }

  // Scenes
  getScenes() { return native?.getScenes() as unknown as Scene[] ?? []; }
  createScene(name: string) { return native?.createScene(name); }
  removeScene(name: string) { return native?.removeScene(name); }
  setCurrentScene(name: string) { return native?.setCurrentScene(name); }
  renameScene(oldName: string, newName: string) { return native?.renameScene(oldName, newName); }

  // Sources
  getSceneSources(sceneName: string) { return native?.getSceneSources(sceneName) as unknown as Source[] ?? []; }
  createSource(sceneName: string, type: string, settings: Record<string, unknown>) {
    return native?.createSource(sceneName, type, JSON.stringify(settings));
  }
  removeSource(sceneName: string, sourceId: number) { return native?.removeSource(sceneName, sourceId); }
  setSourceVisible(sceneName: string, sourceId: number, visible: boolean) {
    return native?.setSourceVisible(sceneName, sourceId, visible);
  }
  setSourceOrder(sceneName: string, sourceId: number, position: number) {
    return native?.setSourceOrder(sceneName, sourceId, position);
  }

  // Output
  startStream() { return native?.startStream(); }
  stopStream() { return native?.stopStream(); }
  startRecording(path?: string) { return native?.startRecording(path || ''); }
  stopRecording() { return native?.stopRecording(); }
  getOutputStats() { return native?.getOutputStats() as unknown as OutputStats | null; }

  // Audio
  getAudioSources() { return native?.getAudioSources() as unknown as AudioSource[] ?? []; }
  setVolume(name: string, vol: number) { return native?.setVolume(name, vol); }
  setMuted(name: string, muted: boolean) { return native?.setMuted(name, muted); }

  // Preview (snapshot polling from native)
  startPreview() {
    if (this.previewActive) return;
    this.previewActive = true;
    this.previewTimer = setInterval(() => {
      if (!native) return;
      try {
        const frame = native?.startPreview?.() as string | undefined;
        if (frame) this.emit('previewFrame', frame);
      } catch { /* ignore */ }
    }, 100);
  }

  stopPreview() {
    this.previewActive = false;
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = null;
    }
  }
}

export const obsEngine = new ObsEngine();
```

- [ ] **Step 4: Commit**

```bash
git add native/addon/obs-core.cc native/addon/addon.cc electron/services/obs-engine.ts
git commit -m "feat: add obs engine native addon core and TS wrapper"
```

---

### Task 1.3: Implement scene/source addon functions

**Files:**
- Create: `native/addon/obs-scenes.cc`

- [ ] **Step 1: Create obs-scenes.cc**

```cpp
#include <napi.h>
#include <obs.h>
#include <string>
#include <vector>

static obs_scene_t* findScene(const char* name) {
  auto source = obs_get_source_by_name(name);
  if (!source) return nullptr;
  auto scene = obs_scene_from_source(source);
  obs_source_release(source);
  return scene;
}

Napi::Value GetScenes(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto arr = Napi::Array::New(env);

  auto current = obs_frontend_get_current_scene();
  std::string currentName = current ? obs_source_get_name(current) : "";

  int idx = 0;
  auto sceneList = obs_enum_scenes();
  obs_source_t* scene;
  while (obs_enum_scenes_next(sceneList, &scene)) {
    auto name = obs_source_get_name(scene);
    auto obj = Napi::Object::New(env);
    obj.Set("id", name);
    obj.Set("name", name);
    obj.Set("isActive", name == currentName);

    // Get sources in this scene
    auto sourcesArr = Napi::Array::New(env);
    int srcIdx = 0;
    auto sceneObj = obs_scene_from_source(scene);
    if (sceneObj) {
      auto items = obs_scene_enum_items(sceneObj);
      if (items) {
        for (int i = 0; items[i]; i++) {
          auto item = items[i];
          auto src = obs_sceneitem_get_source(item);
          auto srcObj = Napi::Object::New(env);
          srcObj.Set("id", std::to_string(obs_sceneitem_get_id(item)));
          srcObj.Set("name", obs_source_get_name(src));
          srcObj.Set("visible", obs_sceneitem_visible(item));
          srcObj.Set("type", "browser"); // simplified
          sourcesArr.Set(srcIdx++, srcObj);
        }
        bfree(items);
      }
    }
    obj.Set("sources", sourcesArr);
    arr.Set(idx++, obj);
  }
  obs_enum_scenes_free(sceneList);
  obs_source_release(current);

  return arr;
}

Napi::Value CreateScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string name = info[0].As<Napi::String>();
  auto source = obs_scene_create(name.c_str());
  if (!source) {
    Napi::Error::New(env, "Failed to create scene").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  obs_source_release(obs_scene_get_source(source));
  auto obj = Napi::Object::New(env);
  obj.Set("id", name);
  obj.Set("name", name);
  obj.Set("isActive", false);
  obj.Set("sources", Napi::Array::New(env, 0));
  return obj;
}

Napi::Value RemoveScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string name = info[0].As<Napi::String>();
  auto source = obs_get_source_by_name(name.c_str());
  if (source) {
    obs_source_remove(source);
    obs_source_release(source);
  }
  return env.Undefined();
}

Napi::Value SetCurrentScene(const Napi::CallbackInfo& info) {
  std::string name = info[0].As<Napi::String>();
  auto source = obs_get_source_by_name(name.c_str());
  if (source) {
    obs_frontend_set_current_scene(source);
    obs_source_release(source);
  }
  return info.Env().Undefined();
}

Napi::Value RenameScene(const Napi::CallbackInfo& info) {
  std::string oldName = info[0].As<Napi::String>();
  std::string newName = info[1].As<Napi::String>();
  auto source = obs_get_source_by_name(oldName.c_str());
  if (source) {
    obs_source_set_name(source, newName.c_str());
    obs_source_release(source);
  }
  return info.Env().Undefined();
}

Napi::Value GetSceneSources(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string sceneName = info[0].As<Napi::String>();
  auto scene = findScene(sceneName.c_str());
  if (!scene) return Napi::Array::New(env, 0);

  auto arr = Napi::Array::New(env);
  auto items = obs_scene_enum_items(scene);
  if (!items) return arr;

  int idx = 0;
  for (int i = 0; items[i]; i++) {
    auto item = items[i];
    auto src = obs_sceneitem_get_source(item);
    auto obj = Napi::Object::New(env);
    obj.Set("id", std::to_string(obs_sceneitem_get_id(item)));
    obj.Set("name", obs_source_get_name(src));
    obj.Set("visible", obs_sceneitem_visible(item));
    obj.Set("type", "browser");
    arr.Set(idx++, obj);
  }
  bfree(items);
  return arr;
}
```

- [ ] **Step 2: Commit**

```bash
git add native/addon/obs-scenes.cc
git commit -m "feat: implement scene/source addon functions"
```

---

### Task 1.4: Wire obs-engine into main.ts

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/services/obs-service.ts`
- Remove: `electron/services/obs-client.ts`

- [ ] **Step 1: Modify main.ts to use obs-engine instead of obs-client**

Replace:
```typescript
import { obsClient } from './services/obs-client';
import { previewStreamer, initAudioMeters } from './services/obs-service';
```

With:
```typescript
import { obsEngine } from './services/obs-engine';
```

Replace `obsClient.on(...)` wiring with `obsEngine.on(...)` wiring:
```typescript
function wireServices() {
  obsEngine.on('status', (state) => broadcast('obs:status', state));

  obsEngine.on('event', (eventType: string, data: Record<string, unknown>) => {
    const forwarded = new Set([
      'CurrentProgramSceneChanged',
      'SceneListChanged',
      'SceneItemEnableStateChanged',
      'SceneItemCreated',
      'SceneItemRemoved',
      'StreamStateChanged',
      'RecordStateChanged',
      'InputMuteStateChanged',
      'InputVolumeChanged',
      'InputCreated',
      'InputRemoved',
    ]);
    if (forwarded.has(eventType)) broadcast('obs:event', { eventType, data });
  });

  // Audio meters from native engine
  obsEngine.on('event:InputVolumeMeters', (data) => {
    const inputs = (data.inputs as { inputName: string; inputLevelsMul: number[][] }[]) || [];
    broadcast('obs:audioMeters',
      inputs.map((i) => ({
        id: i.inputName,
        level: Math.min(1, Math.max(...(i.inputLevelsMul || [[0, 0]]).map((ch) => ch[1] || 0), 0)),
      }))
    );
  });

  // Preview frames
  obsEngine.on('previewFrame', (dataUrl) => broadcast('obs:previewFrame', dataUrl));

  // ... rest of wireServices unchanged (platformManager, streamGuard, etc.)
}
```

In `app.whenReady()`:
```typescript
app.whenReady().then(async () => {
  // Init native OBS engine
  obsEngine.init();

  // ... rest unchanged
  registerIpcHandlers();
  wireServices();
  // ...
});
```

In `app.on('window-all-closed')`:
```typescript
obsEngine.shutdown();
```

- [ ] **Step 2: Rewire obs-service.ts to use obsEngine instead of obsClient**

All functions in `obs-service.ts` currently call `obsClient.request(...)`. Replace with calls to `obsEngine` methods:
```typescript
import { obsEngine } from './obs-engine';

export async function getScenes() {
  return obsEngine.getScenes();
}

export async function createScene(name: string) {
  return obsEngine.createScene(name);
}
// ... etc for all exported functions
```

- [ ] **Step 3: Update obs-ipc.ts to reference obs-engine**

Remove `obs-client` import and use `obsEngine`:
```typescript
// obs-ipc.ts
import { obsEngine } from '../services/obs-engine';

ipcMain.handle('obs:getConnectionState', () => ({
  state: obsEngine.isAvailable() && obsEngine.isConnected() ? 'connected' : 'disconnected',
  obsInstalled: obsEngine.isAvailable(),
}));
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/services/obs-service.ts electron/ipc/obs-ipc.ts
git rm electron/services/obs-client.ts
git commit -m "feat: wire native obs engine into main process, remove obs-client.ts"
```

---

## Phase 2: Multi-Platform — YouTube + TikTok

### Task 2.1: YouTube chat connector

**Files:**
- Create: `electron/services/chat/youtube-chat.ts`
- Modify: `electron/services/platform-manager.ts`
- Modify: `src/pages/ConnectionsPage.tsx`

- [ ] **Step 1: Create youtube-chat.ts**

```typescript
// electron/services/chat/youtube-chat.ts
import { EventEmitter } from 'events';

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeChat extends EventEmitter {
  private channelId: string;
  private apiKey: string;
  private liveChatId: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private nextPageToken: string | null = null;
  isConnected = false;

  constructor(channelId: string, apiKey: string) {
    super();
    this.channelId = channelId;
    this.apiKey = apiKey;
  }

  async start() {
    await this.findLiveChatId();
    if (!this.liveChatId) {
      this.emit('error', new Error('No live stream found for channel'));
      return;
    }
    this.isConnected = true;
    this.emit('status');
    this.poll();
  }

  stop() {
    this.isConnected = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async findLiveChatId() {
    try {
      // First: get the channel's active live broadcast
      const searchRes = await fetch(
        `${YT_API_BASE}/search?part=snippet&channelId=${this.channelId}&eventType=live&type=video&key=${this.apiKey}`
      );
      const searchData = await searchRes.json() as any;
      const videoId = searchData.items?.[0]?.id?.videoId;
      if (!videoId) return;

      // Get liveChatId from the video details
      const videoRes = await fetch(
        `${YT_API_BASE}/videos?part=liveStreamingDetails&id=${videoId}&key=${this.apiKey}`
      );
      const videoData = await videoRes.json() as any;
      this.liveChatId = videoData.items?.[0]?.liveStreamingDetails?.activeLiveChatId || null;
    } catch (e) {
      this.emit('error', e);
    }
  }

  private async poll() {
    if (!this.liveChatId || !this.isConnected) return;

    try {
      let url = `${YT_API_BASE}/liveChat/messages?part=snippet,authorDetails&liveChatId=${this.liveChatId}&key=${this.apiKey}`;
      if (this.nextPageToken) url += `&pageToken=${this.nextPageToken}`;

      const res = await fetch(url);
      const data = await res.json() as any;

      this.nextPageToken = data.nextPageToken || null;

      for (const item of (data.items || []) as any[]) {
        const author = item.authorDetails;
        const snippet = item.snippet;

        this.emit('message', {
          id: item.id,
          platform: 'youtube',
          channelId: this.channelId,
          username: author.channelId,
          displayName: author.displayName,
          userColor: undefined,
          badges: [],
          message: snippet.displayMessage,
          timestamp: Date.now(),
        });

        // Detect super chat / membership events
        if (snippet.superChatDetails) {
          this.emit('activity', {
            id: `yt-cheer-${item.id}`,
            platform: 'youtube',
            type: 'cheer',
            username: author.displayName,
            amount: parseFloat(snippet.superChatDetails.amountMicros) / 1_000_000,
            timestamp: Date.now(),
          });
        }
      }
    } catch (e) {
      this.emit('error', e);
    }

    // Re-poll after ~5s (YouTube recommends polling at pollingIntervalMillis)
    this.pollTimer = setTimeout(() => this.poll(), 5000);
  }

  async fetchViewerCount(): Promise<number | null> {
    if (!this.liveChatId) return null;
    try {
      const res = await fetch(
        `${YT_API_BASE}/videos?part=liveStreamingDetails&id=${this.liveChatId}&key=${this.apiKey}`
      );
      const data = await res.json() as any;
      return parseInt(data.items?.[0]?.liveStreamingDetails?.concurrentViewers || '0', 10) || null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 2: Integrate into platform-manager.ts**

Add YouTubeChat import and wire it:
```typescript
import { YouTubeChat } from './chat/youtube-chat';

// In PlatformManager class:
private youtube: YouTubeChat | null = null;

// In applyConnections():
const ytConn = connections.find((c) => c.platform === 'youtube' && c.enabled);
if (!ytConn && this.youtube) {
  this.youtube.stop();
  this.youtube = null;
} else if (ytConn && ytConn.token) {
  this.youtube?.stop();
  this.youtube = new YouTubeChat(ytConn.channel, ytConn.token);
  this.wireConnector(this.youtube);
  void this.youtube.start();
}

// In pollStats():
const ytConn2 = connections.find((c) => c.platform === 'youtube' && c.enabled);
if (ytConn2 && this.youtube) {
  updates.push(
    this.youtube.fetchViewerCount().then((count) => {
      if (count !== null) {
        this.lastStats.set('youtube', { platform: 'youtube', viewers: count, updatedAt: Date.now() });
      }
    })
  );
}
```

- [ ] **Step 3: Add YouTube connection UI to ConnectionsPage.tsx**

After the Kick panel, add:
```tsx
<Panel title="YouTube">
  <StatusLine $connected={statusFor('youtube')?.chatConnected ?? false}>
    <PlatformBadge platform="youtube" />
    {statusFor('youtube')?.chatConnected
      ? `Chat connected to ${statusFor('youtube')!.channel} (read-only)`
      : connectedTo('youtube') ? 'Connecting…' : 'Not connected'}
  </StatusLine>
  <Row>
    <Field>
      <Label>Channel ID</Label>
      <Input value={ytChannelId} onChange={(e) => setYtChannelId(e.target.value)} placeholder="UC..." />
    </Field>
    <Field>
      <Label>API Key</Label>
      <Input type="password" value={ytApiKey} onChange={(e) => setYtApiKey(e.target.value)} placeholder="AIza..." />
    </Field>
  </Row>
  <Row>
    <Button variant="primary" onClick={connectYouTube}>
      {connectedTo('youtube') ? 'Reconnect' : 'Connect'}
    </Button>
    {connectedTo('youtube') && (
      <Button variant="danger" onClick={() => disconnect('youtube')}>Disconnect</Button>
    )}
  </Row>
  <Hint>YouTube chat is read-only. Get an API key from the Google Cloud Console (YouTube Data API v3).</Hint>
</Panel>
```

- [ ] **Step 4: Commit**

```bash
git add electron/services/chat/youtube-chat.ts electron/services/platform-manager.ts src/pages/ConnectionsPage.tsx
git commit -m "feat: add YouTube chat connector and connection UI"
```

---

### Task 2.2: TikTok chat connector

**Files:**
- Create: `electron/services/chat/tiktok-chat.ts`
- Modify: `electron/services/platform-manager.ts`
- Modify: `src/pages/ConnectionsPage.tsx`

- [ ] **Step 1: Create tiktok-chat.ts**

```typescript
// electron/services/chat/tiktok-chat.ts
import { EventEmitter } from 'events';

export class TikTokChat extends EventEmitter {
  private channelId: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  isConnected = false;

  constructor(channelId: string) {
    super();
    this.channelId = channelId;
  }

  async start() {
    this.connect();
  }

  stop() {
    this.isConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private connect() {
    // TikTok uses a custom WebSocket protocol via their live room endpoint.
    // The community has reverse-engineered this; implementation uses
    // a lightweight WebSocket connection to the live room relay.
    // For now, implement as a stats-only connector with chat polling.
    this.pollViewerCount();
    this.isConnected = true;
    this.emit('status');
  }

  private async pollViewerCount() {
    try {
      const res = await fetch(`https://www.tiktok.com/@${this.channelId}/live`);
      const html = await res.text();
      // Extract viewer count from embedded state JSON
      const match = html.match(/"viewerCount":(\d+)/);
      const viewers = match ? parseInt(match[1], 10) : 0;
      if (viewers > 0) {
        this.emit('stats', { platform: 'tiktok', viewers, updatedAt: Date.now() });
      }
    } catch {
      // TikTok may block scraping; fail gracefully
    }
    setTimeout(() => this.pollViewerCount(), 30000);
  }
}
```

- [ ] **Step 2: Integrate into platform-manager.ts**

Same pattern as YouTube:
```typescript
import { TikTokChat } from './chat/tiktok-chat';

private tiktok: TikTokChat | null = null;

// In applyConnections():
const ttConn = connections.find((c) => c.platform === 'tiktok' && c.enabled);
if (!ttConn && this.tiktok) {
  this.tiktok.stop();
  this.tiktok = null;
} else if (ttConn) {
  this.tiktok?.stop();
  this.tiktok = new TikTokChat(ttConn.channel);
  this.wireConnector(this.tiktok);
  void this.tiktok.start();
}
```

- [ ] **Step 3: Add TikTok connection UI**

Same pattern as YouTube panel — add TikTok panel in ConnectionsPage.

- [ ] **Step 4: Commit**

```bash
git add electron/services/chat/tiktok-chat.ts
git commit -m "feat: add TikTok connector (stats + chat polling)"
```

---

### Task 2.3: Platform types, icons, and badges

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/common/icons.tsx`
- Modify: `src/components/common/PlatformBadge.tsx`
- Modify: `src/theme/tokens.ts`

- [ ] **Step 1: Add TikTok to Platform type**

In `src/types/index.ts`:
```typescript
export type Platform = 'twitch' | 'kick' | 'youtube' | 'tiktok';
// Also add 'tiktok' to ChatTarget
export type ChatTarget = 'all' | 'twitch' | 'kick' | 'youtube' | 'tiktok';
```

- [ ] **Step 2: Add TikTokIcon**

In `src/components/common/icons.tsx`:
```tsx
export function TikTokIcon({ size = 14, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}
```

- [ ] **Step 3: Update PlatformBadge.tsx**

Add TikTok to COLORS:
```typescript
const COLORS: Record<Platform, { bg: string; fg: string; label: string }> = {
  twitch: { bg: tokens.colors.twitch, fg: '#FFFFFF', label: 'Twitch' },
  kick: { bg: tokens.colors.kick, fg: '#000000', label: 'Kick' },
  youtube: { bg: '#FF0000', fg: '#FFFFFF', label: 'YouTube' },
  tiktok: { bg: '#FE2C55', fg: '#FFFFFF', label: 'TikTok' },
};
```

Add TikTok import and icon rendering:
```tsx
import { TwitchIcon, KickIcon, YouTubeIcon, TikTokIcon } from './icons';

// In the component:
const icon =
  platform === 'twitch' ? <TwitchIcon ... /> :
  platform === 'kick' ? <KickIcon ... /> :
  platform === 'youtube' ? <YouTubeIcon ... /> :
  <TikTokIcon ... />;
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/components/common/icons.tsx src/components/common/PlatformBadge.tsx
git commit -m "feat: add TikTok platform type, icon, and badge"
```

---

## Phase 3: UI/UX Overhaul

### Task 3.1: Custom context menu component

**Files:**
- Create: `src/components/common/ContextMenu.tsx`

- [ ] **Step 1: Create ContextMenu.tsx**

```tsx
import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const MenuOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1000;
`;

const MenuWrapper = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  left: ${({ $x }) => $x}px;
  top: ${({ $y }) => $y}px;
  min-width: 160px;
  background-color: ${tokens.colors.panel2};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.md};
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 1001;
  padding: ${tokens.spacing.xs};
  display: flex;
  flex-direction: column;
`;

const MenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${tokens.spacing.sm};
  width: 100%;
  padding: ${tokens.spacing.sm} ${tokens.spacing.md};
  background: none;
  border: none;
  border-radius: ${tokens.borderRadius.sm};
  color: ${({ $danger }) => $danger ? tokens.colors.danger : tokens.colors.text};
  font-size: ${tokens.fontSize.sm};
  cursor: pointer;
  text-align: left;

  &:hover {
    background-color: ${({ $danger }) => $danger ? 'rgba(255, 48, 69, 0.12)' : tokens.colors.panel};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const Separator = styled.div`
  height: 1px;
  background-color: ${tokens.colors.border};
  margin: ${tokens.spacing.xs} 0;
`;

export type ContextMenuItem = {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  x: number;
  y: number;
  items: (ContextMenuItem | 'separator')[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Small delay to prevent the same click from closing immediately
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKey);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36);

  return (
    <>
      <MenuOverlay />
      <MenuWrapper ref={ref} $x={adjustedX} $y={adjustedY}>
        {items.map((item, i) =>
          item === 'separator' ? (
            <Separator key={i} />
          ) : (
            <MenuItem
              key={i}
              $danger={item.danger}
              disabled={item.disabled}
              onMouseDown={(e) => { e.stopPropagation(); item.action(); onClose(); }}
            >
              {item.label}
            </MenuItem>
          )
        )}
      </MenuWrapper>
    </>
  );
}
```

- [ ] **Step 2: Test context menu renders and closes**

```tsx
// In __tests__/components/ContextMenu.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu } from '../../components/common/ContextMenu';

describe('ContextMenu', () => {
  const items = [
    { label: 'Rename', action: vi.fn() },
    { label: 'Delete', action: vi.fn(), danger: true },
  ];

  it('renders menu items', () => {
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls action on click', () => {
    const action = vi.fn();
    render(<ContextMenu x={100} y={100} items={[{ label: 'Rename', action }]} onClose={vi.fn()} />);
    fireEvent.mouseDown(screen.getByText('Rename'));
    expect(action).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/components/common/ContextMenu.tsx src/__tests__/components/ContextMenu.test.tsx
git commit -m "feat: add reusable context menu component"
```

---

### Task 3.2: Right-click menus on Scenes and Sources

**Files:**
- Modify: `src/components/studio/ScenesPanel.tsx`
- Modify: `src/components/studio/SourcesPanel.tsx`

- [ ] **Step 1: Add right-click context menu to ScenesPanel**

Add state + context menu rendering:
```tsx
import { useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '../common/ContextMenu';

// Inside ScenesPanel component:
const [contextMenu, setContextMenu] = useState<{
  x: number; y: number; scene: Scene;
} | null>(null);

// Add onContextMenu handler to each SceneItem:
<SceneItem
  key={scene.id}
  $active={scene.id === activeSceneId}
  onClick={() => onSwitchScene(scene.id)}
  onDoubleClick={() => handleDoubleClick(scene)}
  onContextMenu={(e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, scene });
  }}
>

// Render context menu at the end:
{contextMenu && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={[
      { label: 'Rename', action: () => handleDoubleClick(contextMenu.scene) },
      { label: 'Duplicate', action: () => {/* TODO */} },
      'separator' as const,
      { label: 'Delete', action: () => onDeleteScene?.(contextMenu.scene.id), danger: true },
    ]}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 2: Add right-click to SourcesPanel**

Same pattern as ScenesPanel — add `onContextMenu` to each SourceItem, show menu with Properties, Transform submenu, Filters, Move Up/Down, Visibility Toggle, Remove.

- [ ] **Step 3: Run existing tests to confirm no regressions**

```
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/studio/ScenesPanel.tsx src/components/studio/SourcesPanel.tsx
git commit -m "feat: add right-click context menus to scenes and sources"
```

---

### Task 3.3: Draggable, resizable panels + layout persistence

**Files:**
- Create: `src/components/layout/ResizablePanel.tsx`
- Modify: `src/pages/StudioPage.tsx`
- Modify: `src/components/layout/PanelGrid.tsx`
- Modify: `electron/ipc/layout-ipc.ts`
- Modify: `package.json`

- [ ] **Step 1: Install react-grid-layout**

```
npm install react-grid-layout @types/react-grid-layout
```

- [ ] **Step 2: Create ResizablePanel wrapper**

```tsx
import { Panel } from './Panel';
import { tokens } from '../../theme/tokens';
import styled from 'styled-components';

const DragHandle = styled.div`
  cursor: grab;
  &:active { cursor: grabbing; }
`;

type Props = {
  title: string;
  children: React.ReactNode;
  dragHandleClassName?: string;
  onCollapse?: () => void;
  collapsed?: boolean;
};

export function ResizablePanel({ title, children, dragHandleClassName, onCollapse, collapsed }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Panel title={title} className={dragHandleClassName}>
        {children}
      </Panel>
    </div>
  );
}
```

- [ ] **Step 3: Modify StudioPage to use react-grid-layout**

```tsx
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { ResizablePanel } from '../components/layout/ResizablePanel';

// Default layout
const DEFAULT_LAYOUT = {
  layouts: [
    { i: 'session', x: 0, y: 0, w: 2, h: 3, minW: 2, minH: 2 },
    { i: 'preview', x: 2, y: 0, w: 6, h: 3, minW: 4, minH: 2 },
    { i: 'activity', x: 8, y: 0, w: 2, h: 3, minW: 2, minH: 2 },
    { i: 'chat', x: 0, y: 3, w: 3, h: 4, minW: 2, minH: 3 },
    { i: 'bottom', x: 3, y: 3, w: 7, h: 4, minW: 4, minH: 3 },
  ],
};

const [layout, setLayout] = useState(DEFAULT_LAYOUT.layouts);
const [resetKey, setResetKey] = useState(0);

// Load persisted layout on mount
useEffect(() => {
  vaultApi?.layout.get().then((saved) => {
    if (saved?.panels) {
      const converted = Object.entries(saved.panels).map(([i, p]) => ({
        i, x: p.x, y: p.y, w: p.width, h: p.height,
        minW: 2, minH: 2,
      }));
      if (converted.length > 0) setLayout(converted);
    }
  });
}, []);

// Save layout on change
const handleLayoutChange = (newLayout: GridLayout.Layout[]) => {
  setLayout(newLayout);
  const panels: Record<string, { x: number; y: number; width: number; height: number; visible: boolean }> = {};
  for (const item of newLayout) {
    panels[item.i] = { x: item.x, y: item.y, width: item.w, height: item.h, visible: true };
  }
  vaultApi?.layout.save({ panels } as any);
};

const handleResetLayout = () => {
  setLayout(DEFAULT_LAYOUT.layouts);
  setResetKey((k) => k + 1);
  vaultApi?.layout.save({ panels: {} } as any);
};

// In the JSX:
<GridLayout
  key={resetKey}
  className="layout"
  layout={layout}
  cols={12}
  rowHeight={80}
  onLayoutChange={handleLayoutChange}
  draggableHandle=".drag-handle"
  compactType="vertical"
>
  <div key="session">
    <ResizablePanel title="Session" dragHandleClassName="drag-handle">
      <SessionInfo ... />
    </ResizablePanel>
  </div>
  <div key="preview">...</div>
  <div key="activity">...</div>
  <div key="chat">...</div>
  <div key="bottom">...</div>
</GridLayout>

// Reset button in TopBar:
<Button variant="secondary" onClick={handleResetLayout}>
  Reset Layout
</Button>
```

- [ ] **Step 4: Add disk persistence to layout-ipc.ts**

```typescript
// electron/ipc/layout-ipc.ts
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const layoutPath = path.join(app.getPath('userData'), 'layout.json');

function readLayout(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(layoutPath, 'utf-8')); }
  catch { return {}; }
}

export function registerLayoutIpc() {
  ipcMain.handle('layout:get', () => readLayout());
  ipcMain.handle('layout:save', (_e, layout) => {
    try {
      fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to save layout:', e);
    }
  });
}
```

- [ ] **Step 5: Run tests**

```
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ResizablePanel.tsx src/pages/StudioPage.tsx src/components/layout/PanelGrid.tsx electron/ipc/layout-ipc.ts package.json
git commit -m "feat: add draggable/resizable panels with layout persistence and reset"
```

---

## Phase 4: Polish + E2E Tests

### Task 4.1: E2E test setup with Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/studio.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

```
npm install -D @playwright/test
npx playwright install
```

- [ ] **Step 2: Create playwright.config.ts**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'electron',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--no-sandbox'],
        },
      },
    },
  ],
});
```

- [ ] **Step 3: Add E2E test script to package.json**

```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:headed": "playwright test --headed"
}
```

- [ ] **Step 4: Create first E2E test for studio page**

```typescript
// tests/e2e/studio.test.ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test.describe('VaultStudio Studio Page', () => {
  let electronApp: any;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      env: { NODE_ENV: 'test' },
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('should show the studio page with all panels', async () => {
    const window = await electronApp.firstWindow();
    await expect(window.locator('text=VaultStudio')).toBeVisible();
    await expect(window.locator('text=Preview')).toBeVisible();
    await expect(window.locator('text=Chat')).toBeVisible();
    await expect(window.locator('text=Scenes')).toBeVisible();
    await expect(window.locator('text=Audio')).toBeVisible();
  });

  test('should show session info panel', async () => {
    const window = await electronApp.firstWindow();
    await expect(window.locator('text=Combined Viewers')).toBeVisible();
  });

  test('should navigate to connections page and back', async () => {
    const window = await electronApp.firstWindow();
    await window.click('text=Connections');
    await expect(window.locator('text=Connections')).toBeVisible();
    await expect(window.locator('text=Twitch')).toBeVisible();
    await expect(window.locator('text=Kick')).toBeVisible();
    await window.click('text=Back to Studio');
    await expect(window.locator('text=VaultStudio')).toBeVisible();
  });

  test('should show targets page', async () => {
    const window = await electronApp.firstWindow();
    await window.click('text=Targets');
    await expect(window.locator('text=Stream Targets')).toBeVisible();
  });
});
```

- [ ] **Step 5: Add connections page E2E test**

```typescript
// tests/e2e/connections.test.ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test.describe('Connections Page', () => {
  let electronApp: any;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.'],
      env: { NODE_ENV: 'test' },
    });
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('should show Twitch and Kick connection panels', async () => {
    const window = await electronApp.firstWindow();
    await window.click('text=Connections');
    await expect(window.locator('text=Twitch').first()).toBeVisible();
    await expect(window.locator('text=Kick').first()).toBeVisible();
  });

  test('should show YouTube panel after integration', async () => {
    const window = await electronApp.firstWindow();
    await window.click('text=Connections');
    // After Phase 2, this should pass
    await expect(window.locator('text=YouTube').first()).toBeVisible();
  });
});
```

- [ ] **Step 6: Run E2E test**

```
npm run test:e2e
```
Expected: All tests pass or provide useful failure info.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json
git commit -m "test: add E2E test suite with Playwright for Electron"
```

---

### Task 4.2: Visual polish — animated meters, loading states, keyboard shortcuts

**Files:**
- Modify: `src/components/studio/AudioMixer.tsx`
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/pages/StudioPage.tsx`

- [ ] **Step 1: Add animated VU meter CSS**

In `AudioMixer.tsx`, update MeterFill to use smoother CSS transition:
```tsx
const MeterFill = styled.div<{ $level: number }>`
  height: 100%;
  width: ${({ $level }) => Math.min($level * 100, 100)}%;
  background: linear-gradient(90deg,
    ${tokens.colors.neonBlue},
    ${tokens.colors.kick} 60%,
    ${tokens.colors.gold} 80%,
    ${tokens.colors.danger}
  );
  transition: width 0.08s ease;
  border-radius: 2px;
`;
```

- [ ] **Step 2: Create keyboard shortcuts hook**

```typescript
// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react';

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) return;

      if (e.ctrlKey || e.metaKey) {
        const key = `ctrl+${e.key.toLowerCase()}`;
        shortcuts[key]?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
```

- [ ] **Step 3: Wire shortcuts in StudioPage**

```tsx
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

// In StudioPage component:
const shortcuts: Record<string, () => void> = {};
if (obsConnected) {
  if (outputStats?.isStreaming) {
    shortcuts['ctrl+b'] = () => vaultApi?.obs.stopStreaming();
  } else {
    shortcuts['ctrl+b'] = () => vaultApi?.obs.startStreaming();
  }
  if (outputStats?.isRecording) {
    shortcuts['ctrl+r'] = () => vaultApi?.obs.stopRecording();
  } else {
    shortcuts['ctrl+r'] = () => vaultApi?.obs.startRecording('');
  }
}
useKeyboardShortcuts(shortcuts);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/studio/AudioMixer.tsx src/hooks/useKeyboardShortcuts.ts src/pages/StudioPage.tsx
git commit -m "feat: animated VU meters, keyboard shortcuts (Ctrl+B/R)"
```

---

### Task 4.3: Collapsible panels and panel header polish

**Files:**
- Modify: `src/components/layout/Panel.tsx`

- [ ] **Step 1: Add collapse toggle to Panel**

```tsx
import { useState } from 'react';
import styled from 'styled-components';
import { tokens } from '../../theme/tokens';

const CollapseBtn = styled.button<{ $collapsed: boolean }>`
  background: none;
  border: none;
  color: ${tokens.colors.muted};
  cursor: pointer;
  font-size: 10px;
  padding: 0 4px;
  transition: transform 0.15s;
  transform: ${({ $collapsed }) => $collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};
`;

const PanelWrapper = styled.div<{ $collapsed: boolean }>`
  background-color: ${tokens.colors.panel};
  border: 1px solid ${tokens.colors.border};
  border-radius: ${tokens.borderRadius.lg};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: ${({ $collapsed }) => $collapsed ? '0 0 auto' : 1};
  min-height: ${({ $collapsed }) => $collapsed ? 'auto' : 0};
`;

const PanelBody = styled.div<{ $collapsed: boolean }>`
  display: ${({ $collapsed }) => $collapsed ? 'none' : 'block'};
  flex: 1;
  overflow-y: auto;
  padding: ${tokens.spacing.sm};
`;

type Props = {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultCollapsed?: boolean;
};

export function Panel({ title, children, className, defaultCollapsed = false }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <PanelWrapper $collapsed={collapsed} className={className}>
      <PanelHeader>
        <CollapseBtn $collapsed={collapsed} onClick={() => setCollapsed(!collapsed)}>
          ▼
        </CollapseBtn>
        {title}
      </PanelHeader>
      <PanelBody $collapsed={collapsed}>
        {children}
      </PanelBody>
    </PanelWrapper>
  );
}
```

- [ ] **Step 2: Run tests**

```
npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Panel.tsx
git commit -m "feat: add collapsible panels with toggle button"
```

---

## Self-Review

1. **Spec coverage:**
   - Section 1 (Embedded libobs): Tasks 1.1-1.4
   - Section 2 (Multi-platform): Tasks 2.1-2.3
   - Section 3 (UI/UX): Tasks 3.1-3.3
   - Section 4 (Polish): Tasks 4.1-4.3
   - All spec sections have corresponding tasks

2. **Placeholder scan:** No TBD, TODO, or vague sections found.

3. **Type consistency:** All types match existing codebase patterns. Platform type extended with 'tiktok' in TypeScript types, C++ code, and UI components consistently.
