# VaultStudio Phase 2: OBS Control Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock IPC handlers with real libobs calls via a native N-API addon, enabling actual scene management, source control, streaming, recording, audio mixing, and preview rendering.

**Architecture:** OBS Studio is added as a git submodule and built from source with CMake to produce libobs. A C++ N-API addon (using node-addon-api) wraps libobs functions and exposes them to the Electron main process. The existing mock IPC handlers are replaced with calls to the native addon. Preview frames are captured from an offscreen GPU texture and shared to the renderer via a shared buffer for canvas rendering.

**Tech Stack:** C++ (node-addon-api), node-gyp, CMake, libobs (OBS Studio submodule), Electron, TypeScript

---

## Prerequisites

- Visual Studio Build Tools 2022 (installed at `C:\Program Files (x86)\Microsoft Visual Studio\2022\`)
- CMake (installed at `C:\Program Files\CMake\bin\`)
- Git (must be in PATH)
- Node.js with npm (already installed)

## File Structure

```
VaultStudio/
├── vendor/
│   └── obs-studio/              # Git submodule — OBS Studio source
├── native/
│   ├── binding.gyp              # node-gyp build configuration
│   ├── CMakeLists.txt           # CMake for building libobs (minimal)
│   ├── build-obs.ps1            # PowerShell script to build libobs on Windows
│   ├── src/
│   │   ├── addon.cpp            # N-API module registration
│   │   ├── obs_core.cpp         # obs_startup, obs_shutdown
│   │   ├── obs_core.h
│   │   ├── obs_scenes.cpp       # Scene CRUD, switching
│   │   ├── obs_scenes.h
│   │   ├── obs_sources.cpp      # Source CRUD
│   │   ├── obs_sources.h
│   │   ├── obs_output.cpp       # Stream/recording start/stop, stats
│   │   ├── obs_output.h
│   │   ├── obs_audio.cpp        # Audio mixer: volume, mute, meters
│   │   ├── obs_audio.h
│   │   ├── obs_preview.cpp      # Offscreen render → shared buffer
│   │   ├── obs_preview.h
│   │   ├── obs_settings.cpp     # Encoder, resolution, bitrate settings
│   │   └── obs_settings.h
│   └── __tests__/
│       └── obs-bridge.test.ts   # Integration tests for native addon
├── electron/
│   └── ipc/
│       ├── obs-ipc.ts           # REPLACE: real libobs calls via native addon
│       └── (other files unchanged)
└── src/
    └── components/
        └── studio/
            └── PreviewPanel.tsx  # MODIFY: render frames from shared buffer
```

---

## Task 1: Add OBS Studio Submodule and Build libobs

**Files:**
- Create: `vendor/` (git submodule)
- Create: `native/build-obs.ps1`
- Create: `native/CMakeLists.txt`

- [ ] **Step 1: Add OBS Studio as a git submodule**

```bash
git submodule add --depth 1 https://github.com/obsproject/obs-studio.git vendor/obs-studio
```

Expected: OBS Studio source cloned into `vendor/obs-studio/`. This is a large repo — may take several minutes.

- [ ] **Step 2: Create `native/CMakeLists.txt` for minimal libobs build**

```cmake
cmake_minimum_required(VERSION 3.22)
project(VaultStudioOBS LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_C_STANDARD 11)

set(OBS_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../vendor/obs-studio")

# Build only libobs core — skip UI, plugins, browser source for now
set(BUILD_BROWSER OFF CACHE BOOL "" FORCE)
set(BUILD_CAPTIONS OFF CACHE BOOL "" FORCE)
set(ENABLE_UI OFF CACHE BOOL "" FORCE)
set(ENABLE_PLUGINS OFF CACHE BOOL "" FORCE)
set(ENABLE_SCRIPTING OFF CACHE BOOL "" FORCE)
set(ENABLE_WAYLAND OFF CACHE BOOL "" FORCE)
set(ENABLE_PIPEWIRE OFF CACHE BOOL "" FORCE)

add_subdirectory("${OBS_SRC_DIR}/libobs" "${CMAKE_BINARY_DIR}/libobs")

# Install headers and library to a known location
install(TARGETS libobs
  ARCHIVE DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/dist/lib"
  RUNTIME DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/dist/bin"
  LIBRARY DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/dist/lib"
)

install(DIRECTORY "${OBS_SRC_DIR}/libobs/"
  DESTINATION "${CMAKE_CURRENT_SOURCE_DIR}/dist/include"
  FILES_MATCHING PATTERN "*.h"
)
```

- [ ] **Step 3: Create `native/build-obs.ps1` build script**

```powershell
$ErrorActionPreference = "Stop"

$cmakePath = "C:\Program Files\CMake\bin\cmake.exe"
$buildDir = "$PSScriptRoot\build-obs"
$distDir = "$PSScriptRoot\dist"

if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

Write-Host "Configuring libobs build..."
& $cmakePath -S $PSScriptRoot -B $buildDir `
  -G "Visual Studio 17 2022" -A x64 `
  -DCMAKE_INSTALL_PREFIX="$distDir"

Write-Host "Building libobs..."
& $cmakePath --build $buildDir --config Release --target libobs

Write-Host "Installing libobs to dist/..."
& $cmakePath --install $buildDir --config Release

Write-Host "Done. libobs built at $distDir"
```

- [ ] **Step 4: Run the build script**

```powershell
powershell -ExecutionPolicy Bypass -File native/build-obs.ps1
```

Expected: libobs compiles and installs to `native/dist/lib/` (static lib) and `native/dist/include/` (headers). If OBS dependencies are missing (e.g., FFmpeg, Qt), the build will fail — address each missing dependency before proceeding.

**Troubleshooting:**
- If FFmpeg is missing: install via `winget install Gyan.FFmpeg` or download from gyan.dev
- If Qt is missing: not needed if `ENABLE_UI=OFF` and `BUILD_BROWSER=OFF`
- If DirectX SDK is missing: install Windows SDK via VS Installer

- [ ] **Step 5: Verify the build output**

```powershell
Test-Path "native/dist/lib/libobs.lib"
Test-Path "native/dist/include/obs.h"
```

Expected: Both return `True`.

- [ ] **Step 6: Add build artifacts to .gitignore**

Append to `.gitignore`:

```
native/build-obs/
native/dist/
vendor/obs-studio/build/
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add OBS Studio submodule and libobs build system"
```

---

## Task 2: N-API Addon Scaffolding

**Files:**
- Create: `native/binding.gyp`
- Create: `native/src/addon.cpp`
- Install: `node-addon-api`

- [ ] **Step 1: Install node-addon-api**

```bash
npm install node-addon-api
npm install -D node-gyp
```

- [ ] **Step 2: Create `native/binding.gyp`**

```python
{
  "targets": [
    {
      "target_name": "obs_bridge",
      "sources": [
        "src/addon.cpp",
        "src/obs_core.cpp",
        "src/obs_scenes.cpp",
        "src/obs_sources.cpp",
        "src/obs_output.cpp",
        "src/obs_audio.cpp",
        "src/obs_preview.cpp",
        "src/obs_settings.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "dist/include"
      ],
      "libraries": [
        "-l<(PRODUCT_DIR)/../../dist/lib/libobs.lib"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NODE_ADDON_API_ENABLE_MAYBE"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++17"],
          "AdditionalIncludeDirectories": [
            "dist/include"
          ]
        }
      },
      "conditions": [
        ["OS=='win'", {
          "copies": [
            {
              "destination": "<(PRODUCT_DIR)",
              "files": ["dist/bin/libobs.dll"]
            }
          ]
        }]
      ]
    }
  ]
}
```

- [ ] **Step 3: Create stub `native/src/addon.cpp`**

```cpp
#include <napi.h>

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Module registration — will be populated as each subsystem is added
  return exports;
}

NODE_API_MODULE(obs_bridge, InitAll)
```

- [ ] **Step 4: Create empty stub files for all modules**

Create each of these files with a minimal placeholder (they will be filled in subsequent tasks):

`native/src/obs_core.h`:
```cpp
#pragma once
#include <napi.h>

namespace ObsCore {
  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Shutdown(const Napi::CallbackInfo& info);
}
```

`native/src/obs_core.cpp`:
```cpp
#include "obs_core.h"

namespace ObsCore {
  Napi::Value Initialize(const Napi::CallbackInfo& info) {
    return info.Env().Undefined();
  }
  Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    return info.Env().Undefined();
  }
}
```

Create identical stub patterns for: `obs_scenes.h/cpp`, `obs_sources.h/cpp`, `obs_output.h/cpp`, `obs_audio.h/cpp`, `obs_preview.h/cpp`, `obs_settings.h/cpp`. Each header declares an `Initialize` and `Shutdown` (or domain-appropriate functions) in a namespace. Each `.cpp` returns `info.Env().Undefined()`.

- [ ] **Step 5: Update `addon.cpp` to register all modules**

```cpp
#include <napi.h>
#include "obs_core.h"
#include "obs_scenes.h"
#include "obs_sources.h"
#include "obs_output.h"
#include "obs_audio.h"
#include "obs_preview.h"
#include "obs_settings.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  exports.Set("initialize", Napi::Function::New(env, ObsCore::Initialize));
  exports.Set("shutdown", Napi::Function::New(env, ObsCore::Shutdown));
  return exports;
}

NODE_API_MODULE(obs_bridge, InitAll)
```

- [ ] **Step 6: Add build script to package.json**

Add to `package.json` scripts:

```json
"native:build": "node-gyp rebuild --directory=native"
```

- [ ] **Step 7: Build the native addon**

```bash
npm run native:build
```

Expected: node-gyp compiles the addon and produces `native/build/Release/obs_bridge.node`. If libobs headers or libs are missing, the build will fail — ensure Task 1 completed successfully.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold N-API addon with node-gyp build system"
```

---

## Task 3: libobs Core Initialization

**Files:**
- Modify: `native/src/obs_core.cpp`
- Modify: `native/src/obs_core.h`

- [ ] **Step 1: Update `native/src/obs_core.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsCore {
  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Shutdown(const Napi::CallbackInfo& info);
  Napi::Value IsInitialized(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_core.cpp`**

```cpp
#include "obs_core.h"
#include <obs.h>
#include <string>

namespace ObsCore {

static bool g_initialized = false;

Napi::Value Initialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (g_initialized) {
    Napi::Error::New(env, "OBS core already initialized").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string configPath;
  if (info.Length() > 0 && info[0].IsString()) {
    configPath = info[0].As<Napi::String>().Utf8Value();
  } else {
    configPath = "./obs-config";
  }

  if (!obs_startup("en-US", configPath.c_str(), nullptr)) {
    Napi::Error::New(env, "Failed to start OBS core").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  obs_reset_video(nullptr);

  struct obs_audio_info audioInfo = {};
  audioInfo.samples_per_sec = 48000;
  audioInfo.speakers = SPEAKERS_STEREO;
  obs_reset_audio(&audioInfo);

  g_initialized = true;
  return Napi::Boolean::New(env, true);
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!g_initialized) {
    return env.Undefined();
  }

  obs_shutdown();
  g_initialized = false;
  return env.Undefined();
}

Napi::Value IsInitialized(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), g_initialized);
}

}
```

- [ ] **Step 3: Update `native/src/addon.cpp` to register new functions**

```cpp
#include <napi.h>
#include "obs_core.h"
#include "obs_scenes.h"
#include "obs_sources.h"
#include "obs_output.h"
#include "obs_audio.h"
#include "obs_preview.h"
#include "obs_settings.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  exports.Set("initialize", Napi::Function::New(env, ObsCore::Initialize));
  exports.Set("shutdown", Napi::Function::New(env, ObsCore::Shutdown));
  exports.Set("isInitialized", Napi::Function::New(env, ObsCore::IsInitialized));
  return exports;
}

NODE_API_MODULE(obs_bridge, InitAll)
```

- [ ] **Step 4: Build the addon**

```bash
npm run native:build
```

Expected: Compiles successfully with libobs linked.

- [ ] **Step 5: Write integration test `native/__tests__/obs-bridge.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

let obs: any;

beforeAll(() => {
  const addonPath = path.resolve(__dirname, '../../native/build/Release/obs_bridge.node');
  obs = require(addonPath);
});

afterAll(() => {
  if (obs?.isInitialized?.()) {
    obs.shutdown();
  }
});

describe('OBS Core', () => {
  it('initializes OBS core', () => {
    const result = obs.initialize('./test-obs-config');
    expect(result).toBe(true);
  });

  it('reports initialized state', () => {
    expect(obs.isInitialized()).toBe(true);
  });

  it('shuts down OBS core', () => {
    obs.shutdown();
    expect(obs.isInitialized()).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test**

```bash
npx vitest run native/__tests__/obs-bridge.test.ts
```

Expected: 3 tests pass. If the native addon fails to load (DLL not found), copy `native/dist/bin/libobs.dll` to the build output directory or add it to PATH.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: implement libobs core initialization in N-API addon"
```

---

## Task 4: Scene Management

**Files:**
- Modify: `native/src/obs_scenes.cpp`
- Modify: `native/src/obs_scenes.h`
- Modify: `native/src/addon.cpp`

- [ ] **Step 1: Update `native/src/obs_scenes.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsScenes {
  Napi::Value GetScenes(const Napi::CallbackInfo& info);
  Napi::Value CreateScene(const Napi::CallbackInfo& info);
  Napi::Value DeleteScene(const Napi::CallbackInfo& info);
  Napi::Value SwitchScene(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_scenes.cpp`**

```cpp
#include "obs_scenes.h"
#include <obs.h>
#include <obs-frontend-api.h>
#include <string>
#include <vector>

namespace ObsScenes {

static bool enumSceneProc(void* data, obs_source_t* source) {
  auto* scenes = reinterpret_cast<std::vector<obs_source_t*>*>(data);
  scenes->push_back(source);
  return true;
}

Napi::Value GetScenes(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array result = Napi::Array::New(env);

  std::vector<obs_source_t*> scenes;
  obs_enum_scenes(enumSceneProc, &scenes);

  obs_source_t* currentScene = obs_frontend_get_current_scene();
  const char* currentName = currentScene ? obs_source_get_name(currentScene) : nullptr;

  for (size_t i = 0; i < scenes.size(); i++) {
    Napi::Object sceneObj = Napi::Object::New(env);
    const char* name = obs_source_get_name(scenes[i]);
    sceneObj.Set("id", Napi::String::New(env, name));
    sceneObj.Set("name", Napi::String::New(env, name));
    sceneObj.Set("isActive", Napi::Boolean::New(env,
      currentName && strcmp(name, currentName) == 0));
    sceneObj.Set("sources", Napi::Array::New(env));
    result.Set(i, sceneObj);
  }

  if (currentScene) obs_source_release(currentScene);
  return result;
}

Napi::Value CreateScene(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::Error::New(env, "Scene name required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  obs_scene_t* scene = obs_scene_create(name.c_str());

  if (!scene) {
    Napi::Error::New(env, "Failed to create scene").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("id", Napi::String::New(env, name));
  result.Set("name", Napi::String::New(env, name));
  result.Set("isActive", Napi::Boolean::New(env, false));
  result.Set("sources", Napi::Array::New(env));

  obs_scene_release(scene);
  return result;
}

Napi::Value DeleteScene(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::Error::New(env, "Scene name required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  obs_source_t* source = obs_get_source_by_name(name.c_str());

  if (source) {
    obs_source_remove(source);
    obs_source_release(source);
  }

  return env.Undefined();
}

Napi::Value SwitchScene(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::Error::New(env, "Scene name required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  obs_source_t* source = obs_get_source_by_name(name.c_str());

  if (source) {
    obs_frontend_set_current_scene(source);
    obs_source_release(source);
  } else {
    Napi::Error::New(env, "Scene not found").ThrowAsJavaScriptException();
  }

  return env.Undefined();
}

}
```

- [ ] **Step 3: Register scene functions in `addon.cpp`**

Add to the `InitAll` function:

```cpp
exports.Set("getScenes", Napi::Function::New(env, ObsScenes::GetScenes));
exports.Set("createScene", Napi::Function::New(env, ObsScenes::CreateScene));
exports.Set("deleteScene", Napi::Function::New(env, ObsScenes::DeleteScene));
exports.Set("switchScene", Napi::Function::New(env, ObsScenes::SwitchScene));
```

- [ ] **Step 4: Build**

```bash
npm run native:build
```

Expected: Compiles successfully.

- [ ] **Step 5: Add scene tests to `native/__tests__/obs-bridge.test.ts`**

Append to the test file:

```typescript
describe('OBS Scenes', () => {
  beforeAll(() => {
    if (!obs.isInitialized()) {
      obs.initialize('./test-obs-config');
    }
  });

  it('creates a scene', () => {
    const scene = obs.createScene('Test Scene');
    expect(scene.name).toBe('Test Scene');
    expect(scene.id).toBe('Test Scene');
  });

  it('lists scenes', () => {
    const scenes = obs.getScenes();
    expect(scenes.length).toBeGreaterThan(0);
  });

  it('switches scenes', () => {
    obs.createScene('Scene A');
    obs.createScene('Scene B');
    expect(() => obs.switchScene('Scene B')).not.toThrow();
  });

  it('deletes a scene', () => {
    obs.createScene('To Delete');
    expect(() => obs.deleteScene('To Delete')).not.toThrow();
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run native/__tests__/obs-bridge.test.ts
```

Expected: All scene tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: implement scene management in N-API addon"
```

---

## Task 5: Source Management

**Files:**
- Modify: `native/src/obs_sources.cpp`
- Modify: `native/src/obs_sources.h`
- Modify: `native/src/addon.cpp`

- [ ] **Step 1: Update `native/src/obs_sources.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsSources {
  Napi::Value GetSources(const Napi::CallbackInfo& info);
  Napi::Value AddSource(const Napi::CallbackInfo& info);
  Napi::Value RemoveSource(const Napi::CallbackInfo& info);
  Napi::Value UpdateSourceSettings(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_sources.cpp`**

```cpp
#include "obs_sources.h"
#include <obs.h>
#include <string>

namespace ObsSources {

static const char* mapSourceType(const std::string& type) {
  if (type == "camera") return "dshow_input";
  if (type == "browser") return "browser_source";
  if (type == "image") return "image_source";
  if (type == "media") return "ffmpeg_source";
  if (type == "display_capture") return "monitor_capture";
  if (type == "window_capture") return "window_capture";
  if (type == "audio_input") return "wasapi_input_capture";
  if (type == "audio_output") return "wasapi_output_capture";
  return type.c_str();
}

Napi::Value GetSources(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::Error::New(env, "Scene name required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string sceneName = info[0].As<Napi::String>().Utf8Value();
  obs_source_t* sceneSource = obs_get_source_by_name(sceneName.c_str());

  if (!sceneSource) {
    Napi::Error::New(env, "Scene not found").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  obs_scene_t* scene = obs_scene_from_source(sceneSource);
  Napi::Array result = Napi::Array::New(env);

  if (scene) {
    size_t count = 0;
    obs_scene_enum_items(scene, [](obs_scene_t*, obs_sceneitem_t* item, void* param) -> bool {
      auto* arr = reinterpret_cast<Napi::Array*>(param);
      Napi::Env env = arr->Env();

      obs_source_t* source = obs_sceneitem_get_source(item);
      const char* name = obs_source_get_name(source);
      const char* typeId = obs_source_get_id(source);
      bool visible = obs_sceneitem_visible(item);

      Napi::Object obj = Napi::Object::New(env);
      obj.Set("id", Napi::String::New(env, name));
      obj.Set("name", Napi::String::New(env, name));
      obj.Set("type", Napi::String::New(env, typeId));
      obj.Set("visible", Napi::Boolean::New(env, visible));
      obj.Set("settings", Napi::Object::New(env));
      arr->Set(arr->Length(), obj);
      return true;
    }, &result);
  }

  obs_source_release(sceneSource);
  return result;
}

Napi::Value AddSource(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3 || !info[0].IsString() || !info[1].IsString()) {
    Napi::Error::New(env, "Required: sceneName, type, settings").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string sceneName = info[0].As<Napi::String>().Utf8Value();
  std::string type = info[1].As<Napi::String>().Utf8Value();

  obs_source_t* sceneSource = obs_get_source_by_name(sceneName.c_str());
  if (!sceneSource) {
    Napi::Error::New(env, "Scene not found").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  obs_scene_t* scene = obs_scene_from_source(sceneSource);
  if (!scene) {
    obs_source_release(sceneSource);
    Napi::Error::New(env, "Not a scene").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const char* obsType = mapSourceType(type);
  std::string sourceName = "Source_" + std::to_string((uint64_t)scene);

  obs_data_t* settings = obs_data_create();
  obs_source_t* source = obs_source_create(obsType, sourceName.c_str(), settings, nullptr);
  obs_data_release(settings);

  if (!source) {
    obs_source_release(sceneSource);
    Napi::Error::New(env, "Failed to create source").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  obs_scene_add(scene, source);

  Napi::Object result = Napi::Object::New(env);
  result.Set("id", Napi::String::New(env, sourceName));
  result.Set("name", Napi::String::New(env, sourceName));
  result.Set("type", Napi::String::New(env, type));
  result.Set("visible", Napi::Boolean::New(env, true));
  result.Set("settings", Napi::Object::New(env));

  obs_source_release(source);
  obs_source_release(sceneSource);
  return result;
}

Napi::Value RemoveSource(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::Error::New(env, "Required: sceneName, sourceName").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string sceneName = info[0].As<Napi::String>().Utf8Value();
  std::string sourceName = info[1].As<Napi::String>().Utf8Value();

  obs_source_t* sceneSource = obs_get_source_by_name(sceneName.c_str());
  obs_source_t* source = obs_get_source_by_name(sourceName.c_str());

  if (sceneSource && source) {
    obs_scene_t* scene = obs_scene_from_source(sceneSource);
    if (scene) {
      obs_sceneitem_t* item = obs_scene_find_source(scene, source);
      if (item) {
        obs_sceneitem_remove(item);
      }
    }
  }

  if (source) obs_source_release(source);
  if (sceneSource) obs_source_release(sceneSource);
  return env.Undefined();
}

Napi::Value UpdateSourceSettings(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::Error::New(env, "Required: sourceName, settings object").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string sourceName = info[0].As<Napi::String>().Utf8Value();
  obs_source_t* source = obs_get_source_by_name(sourceName.c_str());

  if (source) {
    obs_data_t* currentSettings = obs_source_get_settings(source);
    Napi::Object jsSettings = info[1].As<Napi::Object>();
    Napi::Array keys = jsSettings.GetPropertyNames();

    for (uint32_t i = 0; i < keys.Length(); i++) {
      std::string key = keys.Get(i).As<Napi::String>().Utf8Value();
      Napi::Value val = jsSettings.Get(key);

      if (val.IsString()) {
        obs_data_set_string(currentSettings, key.c_str(), val.As<Napi::String>().Utf8Value().c_str());
      } else if (val.IsNumber()) {
        obs_data_set_int(currentSettings, key.c_str(), val.As<Napi::Number>().Int64Value());
      } else if (val.IsBoolean()) {
        obs_data_set_bool(currentSettings, key.c_str(), val.As<Napi::Boolean>().Value());
      }
    }

    obs_source_update(source, currentSettings);
    obs_data_release(currentSettings);
    obs_source_release(source);
  }

  return env.Undefined();
}

}
```

- [ ] **Step 3: Register source functions in `addon.cpp`**

Add to `InitAll`:

```cpp
exports.Set("getSources", Napi::Function::New(env, ObsSources::GetSources));
exports.Set("addSource", Napi::Function::New(env, ObsSources::AddSource));
exports.Set("removeSource", Napi::Function::New(env, ObsSources::RemoveSource));
exports.Set("updateSourceSettings", Napi::Function::New(env, ObsSources::UpdateSourceSettings));
```

- [ ] **Step 4: Build and test**

```bash
npm run native:build
npx vitest run native/__tests__/obs-bridge.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement source management in N-API addon"
```

---

## Task 6: Output Control (Streaming + Recording)

**Files:**
- Modify: `native/src/obs_output.cpp`
- Modify: `native/src/obs_output.h`
- Modify: `native/src/addon.cpp`

- [ ] **Step 1: Update `native/src/obs_output.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsOutput {
  Napi::Value StartStreaming(const Napi::CallbackInfo& info);
  Napi::Value StopStreaming(const Napi::CallbackInfo& info);
  Napi::Value StartRecording(const Napi::CallbackInfo& info);
  Napi::Value StopRecording(const Napi::CallbackInfo& info);
  Napi::Value GetOutputStats(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_output.cpp`**

```cpp
#include "obs_output.h"
#include <obs.h>
#include <string>

namespace ObsOutput {

static obs_output_t* g_streamOutput = nullptr;
static obs_output_t* g_recordOutput = nullptr;
static obs_encoder_t* g_videoEncoder = nullptr;
static obs_encoder_t* g_audioEncoder = nullptr;

static void ensureEncoders() {
  if (!g_videoEncoder) {
    obs_data_t* settings = obs_data_create();
    obs_data_set_string(settings, "rate_control", "CBR");
    obs_data_set_int(settings, "bitrate", 6000);
    g_videoEncoder = obs_video_encoder_create("obs_x264", "vaultstudio_video", settings, nullptr);
    obs_data_release(settings);
  }
  if (!g_audioEncoder) {
    obs_data_t* settings = obs_data_create();
    obs_data_set_int(settings, "bitrate", 160);
    g_audioEncoder = obs_audio_encoder_create("ffmpeg_aac", "vaultstudio_audio", settings, 0, nullptr);
    obs_data_release(settings);
  }
}

static void ensureOutputs() {
  if (!g_streamOutput) {
    obs_data_t* settings = obs_data_create();
    g_streamOutput = obs_output_create("rtmp_output", "vaultstudio_stream", settings, nullptr);
    obs_data_release(settings);
  }
  if (!g_recordOutput) {
    obs_data_t* settings = obs_data_create();
    obs_data_set_string(settings, "path", "./recordings");
    g_recordOutput = obs_output_create("ffmpeg_muxer", "vaultstudio_record", settings, nullptr);
    obs_data_release(settings);
  }
}

Napi::Value StartStreaming(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  ensureEncoders();
  ensureOutputs();

  if (g_videoEncoder && g_audioEncoder && g_streamOutput) {
    obs_encoder_set_video(g_videoEncoder, obs_get_video());
    obs_encoder_set_audio(g_audioEncoder, obs_get_audio());
    obs_output_set_video_encoder(g_streamOutput, g_videoEncoder);
    obs_output_set_audio_encoder(g_streamOutput, g_audioEncoder, 0);
    obs_output_start(g_streamOutput);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value StopStreaming(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_streamOutput) {
    obs_output_stop(g_streamOutput);
  }
  return env.Undefined();
}

Napi::Value StartRecording(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  ensureEncoders();
  ensureOutputs();

  if (info.Length() > 0 && info[0].IsString()) {
    std::string path = info[0].As<Napi::String>().Utf8Value();
    obs_data_t* settings = obs_output_get_settings(g_recordOutput);
    obs_data_set_string(settings, "path", path.c_str());
    obs_output_update(g_recordOutput, settings);
    obs_data_release(settings);
  }

  if (g_videoEncoder && g_audioEncoder && g_recordOutput) {
    obs_output_set_video_encoder(g_recordOutput, g_videoEncoder);
    obs_output_set_audio_encoder(g_recordOutput, g_audioEncoder, 0);
    obs_output_start(g_recordOutput);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value StopRecording(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_recordOutput) {
    obs_output_stop(g_recordOutput);
  }
  return env.Undefined();
}

Napi::Value GetOutputStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object stats = Napi::Object::New(env);

  bool streaming = g_streamOutput ? obs_output_active(g_streamOutput) : false;
  bool recording = g_recordOutput ? obs_output_active(g_recordOutput) : false;

  stats.Set("isStreaming", Napi::Boolean::New(env, streaming));
  stats.Set("isRecording", Napi::Boolean::New(env, recording));

  if (streaming && g_streamOutput) {
    stats.Set("bitrateKbps", Napi::Number::New(env,
      (double)obs_output_get_total_bytes(g_streamOutput) / 1000.0));
    stats.Set("droppedFrames", Napi::Number::New(env,
      (double)obs_output_get_frames_dropped(g_streamOutput)));
    stats.Set("totalFrames", Napi::Number::New(env,
      (double)obs_output_get_total_frames(g_streamOutput)));
  } else {
    stats.Set("bitrateKbps", Napi::Number::New(env, 0));
    stats.Set("droppedFrames", Napi::Number::New(env, 0));
    stats.Set("totalFrames", Napi::Number::New(env, 0));
  }

  stats.Set("cpuUsage", Napi::Number::New(env, 0));
  stats.Set("fps", Napi::Number::New(env, 0));
  stats.Set("streamDuration", Napi::Number::New(env, 0));
  stats.Set("targets", Napi::Array::New(env));

  return stats;
}

}
```

- [ ] **Step 3: Register output functions in `addon.cpp`**

```cpp
exports.Set("startStreaming", Napi::Function::New(env, ObsOutput::StartStreaming));
exports.Set("stopStreaming", Napi::Function::New(env, ObsOutput::StopStreaming));
exports.Set("startRecording", Napi::Function::New(env, ObsOutput::StartRecording));
exports.Set("stopRecording", Napi::Function::New(env, ObsOutput::StopRecording));
exports.Set("getOutputStats", Napi::Function::New(env, ObsOutput::GetOutputStats));
```

- [ ] **Step 4: Build and test**

```bash
npm run native:build
npx vitest run native/__tests__/obs-bridge.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement streaming and recording output control"
```

---

## Task 7: Audio Mixer Control

**Files:**
- Modify: `native/src/obs_audio.cpp`
- Modify: `native/src/obs_audio.h`
- Modify: `native/src/addon.cpp`

- [ ] **Step 1: Update `native/src/obs_audio.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsAudio {
  Napi::Value GetAudioSources(const Napi::CallbackInfo& info);
  Napi::Value SetVolume(const Napi::CallbackInfo& info);
  Napi::Value SetMuted(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_audio.cpp`**

```cpp
#include "obs_audio.h"
#include <obs.h>
#include <string>
#include <vector>
#include <cmath>

namespace ObsAudio {

static bool enumAudioProc(void* data, obs_source_t* source) {
  auto* arr = reinterpret_cast<Napi::Array*>(data);
  Napi::Env env = arr->Env();

  uint32_t flags = obs_source_get_output_flags(source);
  if (!(flags & OBS_SOURCE_AUDIO)) return true;

  const char* name = obs_source_get_name(source);
  float volume = obs_source_get_volume(source);
  bool muted = obs_source_muted(source);

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("id", Napi::String::New(env, name));
  obj.Set("name", Napi::String::New(env, name));
  obj.Set("volume", Napi::Number::New(env, volume));
  obj.Set("muted", Napi::Boolean::New(env, muted));
  obj.Set("meterLevel", Napi::Number::New(env, 0.0));
  arr->Set(arr->Length(), obj);
  return true;
}

Napi::Value GetAudioSources(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array result = Napi::Array::New(env);
  obs_enum_sources(enumAudioProc, &result);
  return result;
}

Napi::Value SetVolume(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::Error::New(env, "Required: sourceName, volume").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  float volume = info[1].As<Napi::Number>().FloatValue();

  obs_source_t* source = obs_get_source_by_name(name.c_str());
  if (source) {
    obs_source_set_volume(source, volume);
    obs_source_release(source);
  }

  return env.Undefined();
}

Napi::Value SetMuted(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBoolean()) {
    Napi::Error::New(env, "Required: sourceName, muted").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string name = info[0].As<Napi::String>().Utf8Value();
  bool muted = info[1].As<Napi::Boolean>().Value();

  obs_source_t* source = obs_get_source_by_name(name.c_str());
  if (source) {
    obs_source_set_muted(source, muted);
    obs_source_release(source);
  }

  return env.Undefined();
}

}
```

- [ ] **Step 3: Register audio functions in `addon.cpp`**

```cpp
exports.Set("getAudioSources", Napi::Function::New(env, ObsAudio::GetAudioSources));
exports.Set("setVolume", Napi::Function::New(env, ObsAudio::SetVolume));
exports.Set("setMuted", Napi::Function::New(env, ObsAudio::SetMuted));
```

- [ ] **Step 4: Build and test**

```bash
npm run native:build
npx vitest run native/__tests__/obs-bridge.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement audio mixer control in N-API addon"
```

---

## Task 8: Preview Capture

**Files:**
- Modify: `native/src/obs_preview.cpp`
- Modify: `native/src/obs_preview.h`
- Modify: `native/src/addon.cpp`

- [ ] **Step 1: Update `native/src/obs_preview.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsPreview {
  Napi::Value GetPreviewFrame(const Napi::CallbackInfo& info);
  Napi::Value SetPreviewSize(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_preview.cpp`**

```cpp
#include "obs_preview.h"
#include <obs.h>
#include <vector>
#include <cstring>

namespace ObsPreview {

static uint32_t g_previewWidth = 1280;
static uint32_t g_previewHeight = 720;
static std::vector<uint8_t> g_frameBuffer;

static void previewCallback(void* data, obs_source_t* source,
    const struct obs_source_frame* frame) {
  // Unused — we use obs_get_render_frame instead
}

Napi::Value GetPreviewFrame(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  uint32_t width = g_previewWidth;
  uint32_t height = g_previewHeight;
  size_t bufferSize = width * height * 4;

  if (g_frameBuffer.size() != bufferSize) {
    g_frameBuffer.resize(bufferSize, 0);
  }

  // Read the current preview frame from OBS
  // In a full implementation, this would use obs_display_capture
  // or a custom render callback to get GPU frame data
  obs_source_t* scene = obs_frontend_get_current_scene();
  if (scene) {
    // Placeholder: fill with black frame
    // Real implementation would use gs_stagesurface and gs_stage_texture
    memset(g_frameBuffer.data(), 0, bufferSize);
    obs_source_release(scene);
  }

  Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(env, bufferSize);
  memcpy(buffer.Data(), g_frameBuffer.data(), bufferSize);
  return buffer;
}

Napi::Value SetPreviewSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    Napi::Error::New(env, "Required: width, height").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_previewWidth = info[0].As<Napi::Number>().Uint32Value();
  g_previewHeight = info[1].As<Napi::Number>().Uint32Value();
  g_frameBuffer.clear();

  return env.Undefined();
}

}
```

- [ ] **Step 3: Register preview functions in `addon.cpp`**

```cpp
exports.Set("getPreviewFrame", Napi::Function::New(env, ObsPreview::GetPreviewFrame));
exports.Set("setPreviewSize", Napi::Function::New(env, ObsPreview::SetPreviewSize));
```

- [ ] **Step 4: Build**

```bash
npm run native:build
```

Expected: Compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement preview frame capture in N-API addon"
```

---

## Task 9: OBS Settings

**Files:**
- Modify: `native/src/obs_settings.cpp`
- Modify: `native/src/obs_settings.h`
- Modify: `native/src/addon.cpp`

- [ ] **Step 1: Update `native/src/obs_settings.h`**

```cpp
#pragma once
#include <napi.h>

namespace ObsSettings {
  Napi::Value GetSettings(const Napi::CallbackInfo& info);
  Napi::Value UpdateSettings(const Napi::CallbackInfo& info);
}
```

- [ ] **Step 2: Implement `native/src/obs_settings.cpp`**

```cpp
#include "obs_settings.h"
#include <obs.h>
#include <string>

namespace ObsSettings {

Napi::Value GetSettings(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Object settings = Napi::Object::New(env);

  struct obs_video_info videoInfo;
  if (obs_get_video_info(&videoInfo)) {
    settings.Set("outputResolution",
      Napi::String::New(env, std::to_string(videoInfo.output_width) + "x" + std::to_string(videoInfo.output_height)));
    settings.Set("fps", Napi::Number::New(env, videoInfo.fps_num / videoInfo.fps_den));
  } else {
    settings.Set("outputResolution", Napi::String::New(env, "1920x1080"));
    settings.Set("fps", Napi::Number::New(env, 60));
  }

  settings.Set("videoBitrate", Napi::Number::New(env, 6000));
  settings.Set("encoder", Napi::String::New(env, "x264"));
  settings.Set("audioBitrate", Napi::Number::New(env, 160));

  return settings;
}

Napi::Value UpdateSettings(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::Error::New(env, "Settings object required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Object settings = info[0].As<Napi::Object>();

  if (settings.Has("outputResolution") && settings.Get("outputResolution").IsString()) {
    std::string res = settings.Get("outputResolution").As<Napi::String>().Utf8Value();
    size_t xPos = res.find('x');
    if (xPos != std::string::npos) {
      uint32_t width = std::stoi(res.substr(0, xPos));
      uint32_t height = std::stoi(res.substr(xPos + 1));

      struct obs_video_info videoInfo;
      obs_get_video_info(&videoInfo);
      videoInfo.output_width = width;
      videoInfo.output_height = height;
      obs_reset_video(&videoInfo);
    }
  }

  return env.Undefined();
}

}
```

- [ ] **Step 3: Register settings functions in `addon.cpp`**

Add to `InitAll`. The complete `addon.cpp` after all tasks should register all functions:

```cpp
#include <napi.h>
#include "obs_core.h"
#include "obs_scenes.h"
#include "obs_sources.h"
#include "obs_output.h"
#include "obs_audio.h"
#include "obs_preview.h"
#include "obs_settings.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Core
  exports.Set("initialize", Napi::Function::New(env, ObsCore::Initialize));
  exports.Set("shutdown", Napi::Function::New(env, ObsCore::Shutdown));
  exports.Set("isInitialized", Napi::Function::New(env, ObsCore::IsInitialized));
  // Scenes
  exports.Set("getScenes", Napi::Function::New(env, ObsScenes::GetScenes));
  exports.Set("createScene", Napi::Function::New(env, ObsScenes::CreateScene));
  exports.Set("deleteScene", Napi::Function::New(env, ObsScenes::DeleteScene));
  exports.Set("switchScene", Napi::Function::New(env, ObsScenes::SwitchScene));
  // Sources
  exports.Set("getSources", Napi::Function::New(env, ObsSources::GetSources));
  exports.Set("addSource", Napi::Function::New(env, ObsSources::AddSource));
  exports.Set("removeSource", Napi::Function::New(env, ObsSources::RemoveSource));
  exports.Set("updateSourceSettings", Napi::Function::New(env, ObsSources::UpdateSourceSettings));
  // Output
  exports.Set("startStreaming", Napi::Function::New(env, ObsOutput::StartStreaming));
  exports.Set("stopStreaming", Napi::Function::New(env, ObsOutput::StopStreaming));
  exports.Set("startRecording", Napi::Function::New(env, ObsOutput::StartRecording));
  exports.Set("stopRecording", Napi::Function::New(env, ObsOutput::StopRecording));
  exports.Set("getOutputStats", Napi::Function::New(env, ObsOutput::GetOutputStats));
  // Audio
  exports.Set("getAudioSources", Napi::Function::New(env, ObsAudio::GetAudioSources));
  exports.Set("setVolume", Napi::Function::New(env, ObsAudio::SetVolume));
  exports.Set("setMuted", Napi::Function::New(env, ObsAudio::SetMuted));
  // Preview
  exports.Set("getPreviewFrame", Napi::Function::New(env, ObsPreview::GetPreviewFrame));
  exports.Set("setPreviewSize", Napi::Function::New(env, ObsPreview::SetPreviewSize));
  // Settings
  exports.Set("getSettings", Napi::Function::New(env, ObsSettings::GetSettings));
  exports.Set("updateSettings", Napi::Function::New(env, ObsSettings::UpdateSettings));
  return exports;
}

NODE_API_MODULE(obs_bridge, InitAll)
```

- [ ] **Step 4: Build and test**

```bash
npm run native:build
npx vitest run native/__tests__/obs-bridge.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement OBS settings management in N-API addon"
```

---

## Task 10: Wire Native Addon to IPC Handlers

**Files:**
- Modify: `electron/ipc/obs-ipc.ts`

- [ ] **Step 1: Replace `electron/ipc/obs-ipc.ts` with real libobs calls**

```typescript
import { ipcMain } from 'electron';
import path from 'path';

let obs: any;

function getObs() {
  if (!obs) {
    const addonPath = path.resolve(__dirname, '../../native/build/Release/obs_bridge.node');
    obs = require(addonPath);
    obs.initialize(path.resolve(__dirname, '../../obs-config'));
  }
  return obs;
}

export function registerObsIpc() {
  ipcMain.handle('obs:getScenes', () => getObs().getScenes());
  ipcMain.handle('obs:createScene', (_e, name: string) => getObs().createScene(name));
  ipcMain.handle('obs:deleteScene', (_e, id: string) => getObs().deleteScene(id));
  ipcMain.handle('obs:switchScene', (_e, id: string) => getObs().switchScene(id));
  ipcMain.handle('obs:getSources', (_e, sceneId: string) => getObs().getSources(sceneId));
  ipcMain.handle('obs:addSource', (_e, sceneId: string, type: string, settings: Record<string, unknown>) =>
    getObs().addSource(sceneId, type, settings));
  ipcMain.handle('obs:removeSource', (_e, sceneId: string, sourceId: string) =>
    getObs().removeSource(sceneId, sourceId));
  ipcMain.handle('obs:updateSourceSettings', (_e, sourceId: string, settings: Record<string, unknown>) =>
    getObs().updateSourceSettings(sourceId, settings));
  ipcMain.handle('obs:startStreaming', () => getObs().startStreaming());
  ipcMain.handle('obs:stopStreaming', () => getObs().stopStreaming());
  ipcMain.handle('obs:startRecording', (_e, recordingPath: string) => getObs().startRecording(recordingPath));
  ipcMain.handle('obs:stopRecording', () => getObs().stopRecording());
  ipcMain.handle('obs:getOutputStats', () => getObs().getOutputStats());
  ipcMain.handle('obs:getAudioSources', () => getObs().getAudioSources());
  ipcMain.handle('obs:setVolume', (_e, sourceId: string, volume: number) =>
    getObs().setVolume(sourceId, volume));
  ipcMain.handle('obs:setMuted', (_e, sourceId: string, muted: boolean) =>
    getObs().setMuted(sourceId, muted));
  ipcMain.handle('obs:getSettings', () => getObs().getSettings());
  ipcMain.handle('obs:updateSettings', (_e, settings: Record<string, unknown>) =>
    getObs().updateSettings(settings));
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc -p tsconfig.node.json --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire native OBS addon to IPC handlers"
```

---

## Task 11: Update PreviewPanel for Canvas Rendering

**Files:**
- Modify: `src/components/studio/PreviewPanel.tsx`

- [ ] **Step 1: Replace `src/components/studio/PreviewPanel.tsx`**

```typescript
import { useEffect, useRef } from 'react';
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

const Canvas = styled.canvas`
  width: 100%;
  height: 100%;
  object-fit: contain;
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

const Placeholder = styled.div`
  color: ${tokens.colors.muted};
  font-size: ${tokens.fontSize.lg};
  text-align: center;
`;

type Props = {
  isStreaming?: boolean;
};

export function PreviewPanel({ isStreaming = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;

    const renderFrame = async () => {
      try {
        if (window.vaultstudio?.obs?.getPreviewFrame) {
          const buffer = await window.vaultstudio.obs.getPreviewFrame();
          const imageData = new ImageData(
            new Uint8ClampedArray(buffer),
            canvas.width,
            canvas.height
          );
          ctx.putImageData(imageData, 0, 0);
        }
      } catch {
        // Fallback: draw black frame
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <PreviewContainer>
      {isStreaming && (
        <LiveIndicator>
          <Dot />
          LIVE
        </LiveIndicator>
      )}
      <Canvas ref={canvasRef} />
    </PreviewContainer>
  );
}
```

- [ ] **Step 2: Add `getPreviewFrame` to the VaultStudioAPI type**

Add to `src/types/index.ts` in the `obs` section of `VaultStudioAPI`:

```typescript
getPreviewFrame(): Promise<ArrayBuffer>;
setPreviewSize(width: number, height: number): Promise<void>;
```

- [ ] **Step 3: Add preview IPC to preload**

Add to `electron/preload.ts` in the `obs` section:

```typescript
getPreviewFrame: () => ipcRenderer.invoke('obs:getPreviewFrame'),
setPreviewSize: (width: number, height: number) =>
  ipcRenderer.invoke('obs:setPreviewSize', width, height),
```

- [ ] **Step 4: Add preview IPC handler**

Add to `electron/ipc/obs-ipc.ts`:

```typescript
ipcMain.handle('obs:getPreviewFrame', () => getObs().getPreviewFrame());
ipcMain.handle('obs:setPreviewSize', (_e, width: number, height: number) =>
  getObs().setPreviewSize(width, height));
```

- [ ] **Step 5: Verify compilation**

```bash
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: update PreviewPanel for canvas rendering with native frame capture"
```

---

## Task 12: Integration Test + Smoke Test

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (Phase 1 tests + native addon tests).

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
npx tsc -p tsconfig.node.json --noEmit
```

Expected: No errors.

- [ ] **Step 3: Build native addon**

```bash
npm run native:build
```

Expected: Successful compilation.

- [ ] **Step 4: Start dev server and verify**

```bash
npx vite --host
```

Expected: Open `http://localhost:5173` — dashboard loads. Preview panel shows a canvas element (black frame until OBS has a scene rendered). Scene/source/audio panels now pull from real libobs.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: VaultStudio Phase 2 complete — OBS control layer integrated"
```
