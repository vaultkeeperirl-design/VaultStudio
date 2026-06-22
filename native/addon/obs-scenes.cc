/**
 * obs-scenes.cc — scene collection management without the OBS Studio frontend.
 *
 * libobs itself has no concept of "the scene list" or "the current scene";
 * the OBS Studio UI owns that. Here we replicate it:
 *  - the collection JSON (OBS-compatible format) is loaded via obs_load_sources
 *  - we hold a reference to every scene + global audio device so they stay alive
 *  - the current scene is bound to output channel 0
 *  - global audio devices (Desktop Audio / Mic) are bound to channels 1-6
 *  - every mutation persists back to the same JSON file
 */
#include <napi.h>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <mutex>
#include <fstream>
#include <filesystem>

#ifdef HAVE_LIBOBS
#include <obs.h>
#include <obs-properties.h>
#include <util/platform.h>
#include "vs-common.h"
#include "vs-platform.h"

static std::vector<obs_source_t*> g_ownedSources; // scenes + global audio devices (one ref each)
static std::vector<obs_source_t*> g_forcedActiveCaptures; // capture sources we explicitly activated
static std::vector<std::string> g_sceneOrder;
static std::string g_currentScene;
static std::string g_collectionFile; // utf-8 path of the loaded collection JSON
static std::recursive_mutex g_scenesMutex;
static void reconcileCaptureActivation();

static const char* AUDIO_DEVICE_KEYS[] = {
  "DesktopAudioDevice1", "DesktopAudioDevice2",
  "AuxAudioDevice1", "AuxAudioDevice2", "AuxAudioDevice3", "AuxAudioDevice4",
};
static const uint32_t AUDIO_DEVICE_CHANNELS[] = {1, 2, 3, 4, 5, 6};

static bool normalizePrimaryDesktopAudioDevice(obs_data_t* devData, size_t index) {
  if (!devData || index != 0) return false;
  const char* id = obs_data_get_string(devData, "id");
  if (!id || std::string(id) != vs::desktopAudioSourceId()) return false;

  obs_data_t* settings = obs_data_get_obj(devData, "settings");
  if (!settings) settings = obs_data_create();

  const char* deviceId = obs_data_get_string(settings, "device_id");
  if (deviceId && std::string(deviceId) == "default") {
    obs_data_release(settings);
    return false;
  }

  obs_data_set_string(settings, "device_id", "default");
  obs_data_set_obj(devData, "settings", settings);
  obs_data_release(settings);
  return true;
}

static bool isOwned(obs_source_t* src) {
  return std::find(g_ownedSources.begin(), g_ownedSources.end(), src) != g_ownedSources.end();
}

static void ownSource(obs_source_t* src) {
  if (!src || isOwned(src)) return;
  obs_source_t* ref = obs_source_get_ref(src);
  if (ref) g_ownedSources.push_back(ref);
}

static void disownSource(obs_source_t* src) {
  auto it = std::find(g_ownedSources.begin(), g_ownedSources.end(), src);
  if (it != g_ownedSources.end()) {
    obs_source_release(*it);
    g_ownedSources.erase(it);
  }
}

static obs_source_t* findSceneSource(const std::string& name) {
  obs_source_t* src = obs_get_source_by_name(name.c_str()); // +1 ref, caller releases
  if (src && !obs_scene_from_source(src)) {
    obs_source_release(src);
    return nullptr;
  }
  return src;
}

static bool isVideoCaptureSource(obs_source_t* src) {
  const char* id = src ? obs_source_get_id(src) : nullptr;
  if (!id) return false;
  return vs::isVideoCaptureSourceId(id);
}

static auto forcedActiveIt(obs_source_t* src) {
  return std::find(g_forcedActiveCaptures.begin(), g_forcedActiveCaptures.end(), src);
}

static void setForcedActive(obs_source_t* src, bool active) {
  if (!src) return;
  auto it = forcedActiveIt(src);
  if (active) {
    if (it != g_forcedActiveCaptures.end()) return;
    obs_source_t* ref = obs_source_get_ref(src);
    if (!ref) return;
    obs_source_inc_active(ref);
    g_forcedActiveCaptures.push_back(ref);
  } else if (it != g_forcedActiveCaptures.end()) {
    obs_source_dec_active(*it);
    obs_source_release(*it);
    g_forcedActiveCaptures.erase(it);
  }
}

static void clearForcedActiveCaptures() {
  for (obs_source_t* src : g_forcedActiveCaptures) {
    obs_source_dec_active(src);
    obs_source_release(src);
  }
  g_forcedActiveCaptures.clear();
}

// Last activation state applied per capture source. obs_source_update on a
// dshow input tears down and rebuilds the whole capture graph (camera light
// blinks, feed drops for seconds, flaky drivers never stabilize), so state is
// applied once and only re-applied when it actually changes. Active sources
// stay open for the whole session regardless of scene switches — OBS Studio's
// default behavior (deactivate_when_not_showing=false).
static std::map<obs_source_t*, bool> g_appliedCaptureActive;

static void applyCaptureActive(obs_source_t* src, bool active) {
  if (!src) return;
  auto it = g_appliedCaptureActive.find(src);
  if (it != g_appliedCaptureActive.end() && it->second == active) {
    setForcedActive(src, active);
    return;
  }

  bool needsUpdate = true;
  if (it == g_appliedCaptureActive.end()) {
    // First touch: trust settings written before load to avoid a restart.
    obs_data_t* cur = obs_source_get_settings(src);
    if (cur) {
      needsUpdate = obs_data_get_bool(cur, "active") != active ||
                    obs_data_get_bool(cur, "deactivate_when_not_showing");
      obs_data_release(cur);
    }
  }
  g_appliedCaptureActive[src] = active;

  if (needsUpdate) {
    obs_data_t* settings = obs_data_create();
    obs_data_set_bool(settings, "active", active);
    obs_data_set_bool(settings, "deactivate_when_not_showing", false);
    obs_source_update(src, settings);
    obs_data_release(settings);
  }
  setForcedActive(src, active);
}

static bool isDeviceCamera(obs_source_t* src) {
  const char* id = src ? obs_source_get_id(src) : nullptr;
  if (!id) return false;
  return vs::isCameraSourceId(id);
}

static std::string cameraDeviceId(obs_source_t* src) {
  std::string device;
  obs_data_t* settings = obs_source_get_settings(src);
  if (settings) {
    const char* d = obs_data_get_string(settings, vs::cameraDeviceProperty());
    if (d) device = d;
    obs_data_release(settings);
  }
  return device;
}

static void reconcileCaptureActivation() {
  // Every capture source referenced by any scene stays active for the whole
  // session (OBS Studio semantics). Scene switches never touch the device.
  // The current scene is collected first so its sources win device conflicts.
  std::vector<obs_source_t*> captures;

  auto collectScene = [&captures](const std::string& sceneName) {
    obs_source_t* sceneSource = findSceneSource(sceneName);
    if (!sceneSource) return;
    obs_scene_t* scene = obs_scene_from_source(sceneSource);
    if (scene) {
      obs_scene_enum_items(scene, [](obs_scene_t*, obs_sceneitem_t* item, void* p) -> bool {
        auto* out = static_cast<std::vector<obs_source_t*>*>(p);
        obs_source_t* src = obs_sceneitem_get_source(item);
        if (!isVideoCaptureSource(src)) return true;
        if (std::find(out->begin(), out->end(), src) == out->end()) {
          obs_source_t* ref = obs_source_get_ref(src);
          if (ref) out->push_back(ref);
        }
        return true;
      }, &captures);
    }
    obs_source_release(sceneSource);
  };

  if (!g_currentScene.empty()) collectScene(g_currentScene);
  for (const auto& sceneName : g_sceneOrder) {
    if (sceneName != g_currentScene) collectScene(sceneName);
  }

  // One DirectShow consumer per physical camera: a second source opening the
  // same device makes BOTH fail ("Run failed 0x800705AA") and the camera
  // never renders. Later duplicates are deactivated automatically.
  std::vector<std::string> claimedDevices;
  for (obs_source_t* src : captures) {
    bool active = true;
    if (isDeviceCamera(src)) {
      std::string device = cameraDeviceId(src);
      if (!device.empty()) {
        if (std::find(claimedDevices.begin(), claimedDevices.end(), device) != claimedDevices.end()) {
          active = false;
          const char* nameRaw = obs_source_get_name(src);
          std::string name = nameRaw ? nameRaw : "?";
          blog(LOG_WARNING,
               "Capture source '%s' uses a camera already claimed by another source - deactivating the duplicate",
               name.c_str());
          // Tell the UI once, when the duplicate is first turned off.
          auto prev = g_appliedCaptureActive.find(src);
          if (prev == g_appliedCaptureActive.end() || prev->second) {
            for (auto& ch : name) {
              if (ch == '"' || ch == '\\') ch = '\'';
            }
            VsEmitEvent("capture_conflict", "{\"sourceName\":\"" + name + "\"}");
          }
        } else {
          claimedDevices.push_back(device);
        }
      }
    }
    applyCaptureActive(src, active);
  }

  // Drop bookkeeping (and the forced-active ref) for sources removed from
  // every scene, so a recycled pointer for a new source isn't mistaken for
  // an old one and removed devices actually turn off.
  for (auto it = g_appliedCaptureActive.begin(); it != g_appliedCaptureActive.end();) {
    bool stillPresent = std::find(captures.begin(), captures.end(), it->first) != captures.end();
    if (stillPresent) {
      ++it;
    } else {
      setForcedActive(it->first, false);
      it = g_appliedCaptureActive.erase(it);
    }
  }

  for (obs_source_t* src : captures) obs_source_release(src);
}

const std::string& VsGetCurrentSceneName() {
  return g_currentScene;
}

/** Bind a scene to the program output (channel 0) and remember it. */
static bool setCurrentSceneInternal(const std::string& name, bool emitEvent) {
  obs_source_t* src = findSceneSource(name);
  if (!src) return false;
  obs_set_output_source(0, src);
  obs_source_release(src);
  g_currentScene = name;
  reconcileCaptureActivation();
  if (emitEvent) VsEmitEvent("scene_changed", "{\"sceneName\":\"" + name + "\"}");
  return true;
}

static std::string readProfileName(const std::string& configDir) {
  // Note: never mix os_fopen (obs.dll's CRT) with our fread/fclose — FILE*
  // cannot cross CRT boundaries. Plain ifstream with a wide path instead.
  std::filesystem::path iniPath = vs::pathFromUtf8(configDir) / "basic.ini";
  std::ifstream f(iniPath, std::ios::binary);
  if (!f.is_open()) return "VaultStudio";
  std::string content((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
  f.close();
  size_t pos = content.find("SceneCollection=");
  if (pos != std::string::npos) {
    size_t end = content.find_first_of("\r\n", pos);
    return content.substr(pos + 16, end == std::string::npos ? std::string::npos : end - pos - 16);
  }
  pos = content.find("Name=");
  if (pos == std::string::npos) return "VaultStudio";
  size_t end = content.find_first_of("\r\n", pos);
  return content.substr(pos + 5, end == std::string::npos ? std::string::npos : end - pos - 5);
}

static void setCaptureSourcesActiveBeforeLoad(obs_data_t* /*root*/, obs_data_array_t* sources) {
  if (!sources) return;
  // Every camera comes up once at load and stays open for the session
  // (OBS Studio default). Per-scene deactivation cycles the device and
  // flaky drivers (phone cams, virtual cams) never recover from it.
  // Duplicate sources on the same physical device load deactivated — two
  // DirectShow graphs on one camera make both fail (0x800705AA).
  std::vector<std::string> claimedDevices;
  size_t count = obs_data_array_count(sources);
  for (size_t i = 0; i < count; i++) {
    obs_data_t* sourceData = obs_data_array_item(sources, i);
    const char* id = obs_data_get_string(sourceData, "id");
    bool isCapture = id && vs::isCameraSourceId(id);
    if (isCapture) {
      obs_data_t* settings = obs_data_get_obj(sourceData, "settings");
      if (settings) {
        const char* deviceRaw = obs_data_get_string(settings, vs::cameraDeviceProperty());
        std::string device = deviceRaw ? deviceRaw : "";
        bool duplicate = !device.empty() &&
          std::find(claimedDevices.begin(), claimedDevices.end(), device) != claimedDevices.end();
        if (!duplicate && !device.empty()) claimedDevices.push_back(device);

        obs_data_set_bool(settings, "active", !duplicate);
        obs_data_set_bool(settings, "deactivate_when_not_showing", false);
        // GPU decode for compressed webcam formats (MJPEG 1080p60 fails
        // software decode on some devices); libobs falls back gracefully.
        obs_data_set_bool(settings, "hw_decode", true);
        obs_data_release(settings);
      }
    }
    obs_data_release(sourceData);
  }
}

static void loadSourcesCallback(void*, obs_source_t* source) {
  // Keep scenes alive — without the frontend nobody else holds a reference.
  if (obs_scene_from_source(source)) ownSource(source);
}

bool VsLoadSceneCollection(const std::string& configDir) {
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  blog(LOG_INFO, "VsLoadSceneCollection: begin (%s)", configDir.c_str());

  std::filesystem::path scenesDir = vs::pathFromUtf8(configDir) / "scenes";
  std::string profile = readProfileName(configDir);
  blog(LOG_INFO, "VsLoadSceneCollection: profile '%s'", profile.c_str());
  g_collectionFile = vs::pathToUtf8(scenesDir / (profile + ".json"));

  obs_data_t* data = obs_data_create_from_json_file_safe(g_collectionFile.c_str(), "bak");
  blog(LOG_INFO, "VsLoadSceneCollection: parsed %s -> %p", g_collectionFile.c_str(), (void*)data);
  if (!data) {
    // Named file missing — fall back to the first collection in the directory.
    if (std::filesystem::exists(scenesDir)) {
      for (const auto& ent : std::filesystem::directory_iterator(scenesDir)) {
        if (!ent.is_regular_file() || ent.path().extension() != ".json") continue;
        std::string candidate = vs::pathToUtf8(ent.path());
        data = obs_data_create_from_json_file_safe(candidate.c_str(), "bak");
        if (data) {
          g_collectionFile = candidate;
          break;
        }
      }
    }
  }

  bool normalizedDesktopAudioDevice = false;

  if (data) {
    blog(LOG_INFO, "Loading scene collection: %s", g_collectionFile.c_str());

    // Global audio devices live under dedicated keys, bound to fixed channels.
    for (size_t i = 0; i < 6; i++) {
      obs_data_t* devData = obs_data_get_obj(data, AUDIO_DEVICE_KEYS[i]);
      if (!devData) continue;
      if (normalizePrimaryDesktopAudioDevice(devData, i)) {
        normalizedDesktopAudioDevice = true;
        blog(LOG_INFO, "Desktop Audio device set to Windows default output");
      }
      obs_source_t* dev = obs_load_source(devData);
      obs_data_release(devData);
      if (dev) {
        obs_set_output_source(AUDIO_DEVICE_CHANNELS[i], dev);
        g_ownedSources.push_back(dev); // keep the load reference
      }
    }

    obs_data_array_t* sources = obs_data_get_array(data, "sources");
    if (sources) {
      setCaptureSourcesActiveBeforeLoad(data, sources);
      obs_load_sources(sources, loadSourcesCallback, nullptr);
      obs_data_array_release(sources);
    }

    obs_data_array_t* order = obs_data_get_array(data, "scene_order");
    if (order) {
      size_t count = obs_data_array_count(order);
      for (size_t i = 0; i < count; i++) {
        obs_data_t* item = obs_data_array_item(order, i);
        const char* name = obs_data_get_string(item, "name");
        if (name && *name) {
          obs_source_t* s = findSceneSource(name);
          if (s) {
            g_sceneOrder.push_back(name);
            obs_source_release(s);
          }
        }
        obs_data_release(item);
      }
      obs_data_array_release(order);
    }

    // Scenes that exist but weren't in scene_order.
    for (obs_source_t* src : g_ownedSources) {
      if (!obs_scene_from_source(src)) continue;
      const char* name = obs_source_get_name(src);
      if (name && std::find(g_sceneOrder.begin(), g_sceneOrder.end(), name) == g_sceneOrder.end()) {
        g_sceneOrder.push_back(name);
      }
    }

    const char* current = obs_data_get_string(data, "current_program_scene");
    std::string target = (current && *current) ? current : (g_sceneOrder.empty() ? "" : g_sceneOrder[0]);
    if (!target.empty() && !setCurrentSceneInternal(target, false) && !g_sceneOrder.empty()) {
      setCurrentSceneInternal(g_sceneOrder[0], false);
    }
    obs_data_release(data);
  }

  // Guarantee a usable baseline: at least one scene and default audio devices.
  if (g_sceneOrder.empty()) {
    blog(LOG_INFO, "No scene collection found — creating default scene");
    obs_scene_t* scene = obs_scene_create("Scene");
    if (scene) {
      g_ownedSources.push_back(obs_scene_get_source(scene)); // keep the create reference
      g_sceneOrder.push_back("Scene");
      setCurrentSceneInternal("Scene", false);
    }
  }

  // obs_get_output_source returns a new reference (or null).
  obs_source_t* desktopProbe = obs_get_output_source(1);
  if (desktopProbe) {
    obs_source_release(desktopProbe);
  } else {
    obs_data_t* s = obs_data_create();
    obs_data_set_string(s, "device_id", "default");
    obs_source_t* desktop = obs_source_create(vs::desktopAudioSourceId(), "Desktop Audio", s, nullptr);
    obs_data_release(s);
    if (desktop) {
      obs_set_output_source(1, desktop);
      g_ownedSources.push_back(desktop);
    }
  }
  obs_source_t* micProbe = obs_get_output_source(3);
  if (micProbe) {
    obs_source_release(micProbe);
  } else {
    obs_data_t* s = obs_data_create();
    obs_data_set_string(s, "device_id", "default");
    obs_source_t* mic = obs_source_create(vs::micAudioSourceId(), "Mic/Aux", s, nullptr);
    obs_data_release(s);
    if (mic) {
      obs_set_output_source(3, mic);
      g_ownedSources.push_back(mic);
    }
  }

  if (normalizedDesktopAudioDevice) {
    VsSaveSceneCollection();
  }

  blog(LOG_INFO, "Scene collection ready: %zu scenes, current='%s'", g_sceneOrder.size(), g_currentScene.c_str());
  return true;
}

static bool saveFilterSkipAudioDevices(void*, obs_source_t* source) {
  // Audio devices are saved under their dedicated keys, not in "sources".
  for (uint32_t ch : AUDIO_DEVICE_CHANNELS) {
    obs_source_t* assigned = obs_get_output_source(ch);
    if (assigned) {
      obs_source_release(assigned);
      if (assigned == source) return false;
    }
  }
  return true;
}

void VsSaveSceneCollection() {
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  if (g_collectionFile.empty()) return;

  obs_data_t* root = obs_data_create_from_json_file_safe(g_collectionFile.c_str(), "bak");
  if (!root) root = obs_data_create();

  obs_data_set_string(root, "current_program_scene", g_currentScene.c_str());
  obs_data_set_string(root, "current_scene", g_currentScene.c_str());

  obs_data_array_t* order = obs_data_array_create();
  for (const auto& name : g_sceneOrder) {
    obs_data_t* item = obs_data_create();
    obs_data_set_string(item, "name", name.c_str());
    obs_data_array_push_back(order, item);
    obs_data_release(item);
  }
  obs_data_set_array(root, "scene_order", order);
  obs_data_array_release(order);

  obs_data_array_t* sources = obs_save_sources_filtered(saveFilterSkipAudioDevices, nullptr);
  obs_data_set_array(root, "sources", sources);
  obs_data_array_release(sources);

  for (size_t i = 0; i < 6; i++) {
    obs_source_t* dev = obs_get_output_source(AUDIO_DEVICE_CHANNELS[i]);
    if (dev) {
      obs_data_t* devData = obs_save_source(dev);
      obs_data_set_obj(root, AUDIO_DEVICE_KEYS[i], devData);
      obs_data_release(devData);
      obs_source_release(dev);
    }
  }

  if (!obs_data_save_json_safe(root, g_collectionFile.c_str(), "tmp", "bak")) {
    blog(LOG_WARNING, "Failed to save scene collection to %s", g_collectionFile.c_str());
  }
  obs_data_release(root);
}

void VsReleaseSceneCollection() {
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  clearForcedActiveCaptures();
  g_appliedCaptureActive.clear();
  for (uint32_t ch = 0; ch <= 6; ch++) obs_set_output_source(ch, nullptr);
  for (obs_source_t* src : g_ownedSources) obs_source_release(src);
  g_ownedSources.clear();
  g_sceneOrder.clear();
  g_currentScene.clear();
}

// ---------------------------------------------------------------------------
// N-API entry points
// ---------------------------------------------------------------------------

Napi::Value SaveSceneCollection(const Napi::CallbackInfo& info) {
  VsSaveSceneCollection();
  return Napi::Boolean::New(info.Env(), true);
}

static Napi::Object sceneItemToJs(Napi::Env env, obs_sceneitem_t* item) {
  obs_source_t* src = obs_sceneitem_get_source(item);
  auto obj = Napi::Object::New(env);
  obj.Set("id", std::to_string(obs_sceneitem_get_id(item)));
  obj.Set("name", src ? (obs_source_get_name(src) ? obs_source_get_name(src) : "") : "");
  obj.Set("visible", obs_sceneitem_visible(item));
  obj.Set("locked", obs_sceneitem_locked(item));
  obj.Set("type", src ? (obs_source_get_id(src) ? obs_source_get_id(src) : "") : "");

  struct obs_transform_info info = {};
  obs_sceneitem_get_info2(item, &info);
  uint32_t sourceW = src ? obs_source_get_width(src) : 0;
  uint32_t sourceH = src ? obs_source_get_height(src) : 0;
  auto transform = Napi::Object::New(env);
  transform.Set("x", info.pos.x);
  transform.Set("y", info.pos.y);
  transform.Set("width", sourceW > 0 ? sourceW * info.scale.x : info.bounds.x);
  transform.Set("height", sourceH > 0 ? sourceH * info.scale.y : info.bounds.y);
  transform.Set("rotation", info.rot);
  obj.Set("transform", transform);
  return obj;
}

Napi::Value GetScenes(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  auto arr = Napi::Array::New(env);
  uint32_t idx = 0;

  for (const auto& name : g_sceneOrder) {
    obs_source_t* src = findSceneSource(name);
    if (!src) continue;
    obs_scene_t* scene = obs_scene_from_source(src);

    auto obj = Napi::Object::New(env);
    obj.Set("name", name);
    obj.Set("isActive", name == g_currentScene);

    struct ItemsData {
      Napi::Env env;
      Napi::Array arr;
      uint32_t idx;
    } itemsData{env, Napi::Array::New(env), 0};

    obs_scene_enum_items(scene, [](obs_scene_t*, obs_sceneitem_t* item, void* p) -> bool {
      auto* d = static_cast<ItemsData*>(p);
      d->arr.Set(d->idx++, sceneItemToJs(d->env, item));
      return true;
    }, &itemsData);

    obj.Set("sources", itemsData.arr);
    arr.Set(idx++, obj);
    obs_source_release(src);
  }
  return arr;
}

Napi::Value CreateScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string name = info[0].As<Napi::String>();

  obs_source_t* existing = findSceneSource(name);
  if (existing) {
    obs_source_release(existing);
    Napi::Error::New(env, "A scene with that name already exists").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  obs_scene_t* scene = obs_scene_create(name.c_str());
  if (!scene) {
    Napi::Error::New(env, "Failed to create scene").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  g_ownedSources.push_back(obs_scene_get_source(scene)); // keep the create reference
  g_sceneOrder.push_back(name);
  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();

  auto obj = Napi::Object::New(env);
  obj.Set("name", name);
  obj.Set("isActive", false);
  obj.Set("sources", Napi::Array::New(env, 0));
  return obj;
}

Napi::Value RemoveScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string name = info[0].As<Napi::String>();

  obs_source_t* src = findSceneSource(name);
  if (!src) return env.Undefined();

  g_sceneOrder.erase(std::remove(g_sceneOrder.begin(), g_sceneOrder.end(), name), g_sceneOrder.end());

  obs_source_remove(src);
  disownSource(src);
  obs_source_release(src);

  // Never leave the app with zero scenes.
  if (g_sceneOrder.empty()) {
    obs_scene_t* fallback = obs_scene_create("Scene");
    if (fallback) {
      g_ownedSources.push_back(obs_scene_get_source(fallback));
      g_sceneOrder.push_back("Scene");
    }
  }
  if (g_currentScene == name) {
    setCurrentSceneInternal(g_sceneOrder[0], true);
  }

  VsEmitEvent("scene_list_changed");
  reconcileCaptureActivation();
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value SetCurrentScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string name = info[0].As<Napi::String>();
  if (!setCurrentSceneInternal(name, true)) {
    Napi::Error::New(env, "Scene not found: " + name).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value RenameScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string oldName = info[0].As<Napi::String>();
  std::string newName = info[1].As<Napi::String>();

  obs_source_t* src = findSceneSource(oldName);
  if (!src) return env.Undefined();
  obs_source_set_name(src, newName.c_str());
  obs_source_release(src);

  for (auto& n : g_sceneOrder) {
    if (n == oldName) n = newName;
  }
  if (g_currentScene == oldName) g_currentScene = newName;

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return env.Undefined();
}

/** setSceneIndex(sceneName, newIndex) — reorder the scene list. */
Napi::Value SetSceneIndex(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string name = info[0].As<Napi::String>();
  int32_t newIndex = info[1].As<Napi::Number>().Int32Value();

  auto it = std::find(g_sceneOrder.begin(), g_sceneOrder.end(), name);
  if (it == g_sceneOrder.end()) return env.Undefined();
  g_sceneOrder.erase(it);
  if (newIndex < 0) newIndex = 0;
  if (newIndex > (int32_t)g_sceneOrder.size()) newIndex = (int32_t)g_sceneOrder.size();
  g_sceneOrder.insert(g_sceneOrder.begin() + newIndex, name);

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value DuplicateScene(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string name = info[0].As<Napi::String>();

  obs_source_t* src = findSceneSource(name);
  if (!src) {
    Napi::Error::New(env, "Scene not found: " + name).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  obs_scene_t* scene = obs_scene_from_source(src);

  // Find a free name: "<name> 2", "<name> 3", ...
  std::string newName;
  for (int i = 2; i < 100; i++) {
    newName = name + " " + std::to_string(i);
    obs_source_t* clash = obs_get_source_by_name(newName.c_str());
    if (!clash) break;
    obs_source_release(clash);
  }

  obs_scene_t* dup = obs_scene_duplicate(scene, newName.c_str(), OBS_SCENE_DUP_REFS);
  obs_source_release(src);
  if (!dup) {
    Napi::Error::New(env, "Failed to duplicate scene").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  g_ownedSources.push_back(obs_scene_get_source(dup)); // keep the duplicate reference

  auto it = std::find(g_sceneOrder.begin(), g_sceneOrder.end(), name);
  g_sceneOrder.insert(it == g_sceneOrder.end() ? g_sceneOrder.end() : it + 1, newName);

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return Napi::String::New(env, newName);
}

Napi::Value GetSceneSources(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string sceneName = info[0].As<Napi::String>();
  auto arr = Napi::Array::New(env);

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) return arr;

  struct ItemsData {
    Napi::Env env;
    Napi::Array arr;
    uint32_t idx;
  } data{env, arr, 0};

  obs_scene_enum_items(scene, [](obs_scene_t*, obs_sceneitem_t* item, void* p) -> bool {
    auto* d = static_cast<ItemsData*>(p);
    d->arr.Set(d->idx++, sceneItemToJs(d->env, item));
    return true;
  }, &data);

  obs_scene_release(scene);
  return arr;
}

/** createSource(sceneName, sourceName, kindId, settingsJson) */
Napi::Value CreateSource(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string sceneName = info[0].As<Napi::String>();
  std::string sourceName = info[1].As<Napi::String>();
  std::string kindId = info.Length() > 2 && info[2].IsString() ? info[2].As<Napi::String>().Utf8Value() : "browser_source";
  std::string settingsJson = info.Length() > 3 && info[3].IsString() ? info[3].As<Napi::String>().Utf8Value() : "{}";

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) {
    Napi::Error::New(env, "Scene not found: " + sceneName).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Reuse an existing source of the same name (OBS semantics: sources are
  // global; adding the same source to several scenes shares it).
  obs_source_t* source = obs_get_source_by_name(sourceName.c_str());
  if (source) {
    const char* existingKind = obs_source_get_id(source);
    if (existingKind && kindId != existingKind) {
      obs_source_release(source);
      source = nullptr;

      std::string baseName = sourceName;
      int suffix = 2;
      while (true) {
        std::string candidate = baseName + " " + std::to_string(suffix);
        obs_source_t* existing = obs_get_source_by_name(candidate.c_str());
        if (!existing) {
          sourceName = candidate;
          break;
        }
        obs_source_release(existing);
        suffix++;
      }
    }
  }
  if (!source) {
    obs_data_t* settings = obs_data_create_from_json(settingsJson.c_str());
    if (!settings) settings = obs_data_create();
    source = obs_source_create(kindId.c_str(), sourceName.c_str(), settings, nullptr);
    obs_data_release(settings);
  }

  if (!source) {
    obs_scene_release(scene);
    Napi::Error::New(env, "Failed to create source (is the '" + kindId + "' plugin loaded?)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  obs_sceneitem_t* item = obs_scene_add(scene, source);
  const char* actualKind = obs_source_get_id(source);
  std::string kindOut = actualKind ? actualKind : kindId;
  obs_source_release(source);
  obs_scene_release(scene);

  if (!item) {
    Napi::Error::New(env, "Failed to add source to scene").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  VsEmitEvent("scene_list_changed");
  reconcileCaptureActivation();
  VsSaveSceneCollection();

  auto obj = Napi::Object::New(env);
  obj.Set("id", std::to_string(obs_sceneitem_get_id(item)));
  obj.Set("name", sourceName);
  obj.Set("visible", true);
  obj.Set("type", kindOut);
  return obj;
}

Napi::Value RemoveSource(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string sceneName = info[0].As<Napi::String>();
  int64_t sourceId = info[1].As<Napi::Number>().Int64Value();

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) return env.Undefined();

  obs_sceneitem_t* item = obs_scene_find_sceneitem_by_id(scene, sourceId);
  if (item) obs_sceneitem_remove(item);
  obs_scene_release(scene);

  VsEmitEvent("scene_list_changed");
  reconcileCaptureActivation();
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value SetSourceVisible(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string sceneName = info[0].As<Napi::String>();
  int64_t sourceId = info[1].As<Napi::Number>().Int64Value();
  bool visible = info[2].As<Napi::Boolean>();

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) {
    Napi::Error::New(env, "Scene not found: " + sceneName).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  obs_sceneitem_t* item = obs_scene_find_sceneitem_by_id(scene, sourceId);
  if (!item) {
    obs_scene_release(scene);
    Napi::Error::New(env, "Source item not found: " + std::to_string(sourceId)).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  obs_sceneitem_set_visible(item, visible);
  obs_scene_release(scene);

  VsEmitEvent("scene_list_changed");
  reconcileCaptureActivation();
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value SetSourceOrder(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string sceneName = info[0].As<Napi::String>();
  int64_t sourceId = info[1].As<Napi::Number>().Int64Value();
  std::string direction = info[2].As<Napi::String>();

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) return env.Undefined();

  obs_sceneitem_t* item = obs_scene_find_sceneitem_by_id(scene, sourceId);
  if (item) {
    // The UI lists items top-first; libobs orders bottom-first. "up" in the
    // UI (toward the top / front) is MOVE_UP in libobs z-order terms.
    if (direction == "up") obs_sceneitem_set_order(item, OBS_ORDER_MOVE_UP);
    else if (direction == "down") obs_sceneitem_set_order(item, OBS_ORDER_MOVE_DOWN);
    else if (direction == "top") obs_sceneitem_set_order(item, OBS_ORDER_MOVE_TOP);
    else if (direction == "bottom") obs_sceneitem_set_order(item, OBS_ORDER_MOVE_BOTTOM);
  }
  obs_scene_release(scene);

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return env.Undefined();
}

/** setSourceIndex(sceneName, sceneItemId, uiIndex) — absolute reorder.
 *  uiIndex is top-first (0 = front-most); libobs positions are bottom-first. */
Napi::Value SetSourceIndex(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::recursive_mutex> lock(g_scenesMutex);
  std::string sceneName = info[0].As<Napi::String>();
  int64_t sourceId = info[1].As<Napi::Number>().Int64Value();
  int32_t uiIndex = info[2].As<Napi::Number>().Int32Value();

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) return env.Undefined();

  int itemCount = 0;
  obs_scene_enum_items(scene, [](obs_scene_t*, obs_sceneitem_t*, void* p) -> bool {
    (*static_cast<int*>(p))++;
    return true;
  }, &itemCount);

  obs_sceneitem_t* item = obs_scene_find_sceneitem_by_id(scene, sourceId);
  if (item && !obs_sceneitem_locked(item) && itemCount > 0) {
    int pos = itemCount - 1 - uiIndex;
    if (pos < 0) pos = 0;
    if (pos > itemCount - 1) pos = itemCount - 1;
    obs_sceneitem_set_order_position(item, pos);
  }
  obs_scene_release(scene);

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value SetSourceLocked(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string sceneName = info[0].As<Napi::String>();
  int64_t sourceId = info[1].As<Napi::Number>().Int64Value();
  bool locked = info[2].As<Napi::Boolean>();

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) return env.Undefined();
  obs_sceneitem_t* item = obs_scene_find_sceneitem_by_id(scene, sourceId);
  if (item) obs_sceneitem_set_locked(item, locked);
  obs_scene_release(scene);

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value SetSourceTransform(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string sceneName = info[0].As<Napi::String>();
  int64_t sourceId = info[1].As<Napi::Number>().Int64Value();
  auto patch = info[2].As<Napi::Object>();

  obs_scene_t* scene = obs_get_scene_by_name(sceneName.c_str());
  if (!scene) return env.Undefined();
  obs_sceneitem_t* item = obs_scene_find_sceneitem_by_id(scene, sourceId);
  if (item && !obs_sceneitem_locked(item)) {
    obs_source_t* src = obs_sceneitem_get_source(item);
    struct obs_transform_info transform = {};
    obs_sceneitem_get_info2(item, &transform);

    if (patch.Has("x")) transform.pos.x = patch.Get("x").As<Napi::Number>().FloatValue();
    if (patch.Has("y")) transform.pos.y = patch.Get("y").As<Napi::Number>().FloatValue();
    if (patch.Has("rotation")) transform.rot = patch.Get("rotation").As<Napi::Number>().FloatValue();

    uint32_t sourceW = src ? obs_source_get_width(src) : 0;
    uint32_t sourceH = src ? obs_source_get_height(src) : 0;
    if (patch.Has("width") && sourceW > 0) {
      float width = patch.Get("width").As<Napi::Number>().FloatValue();
      if (width < 1.0f) width = 1.0f;
      transform.scale.x = width / static_cast<float>(sourceW);
    }
    if (patch.Has("height") && sourceH > 0) {
      float height = patch.Get("height").As<Napi::Number>().FloatValue();
      if (height < 1.0f) height = 1.0f;
      transform.scale.y = height / static_cast<float>(sourceH);
    }

    obs_sceneitem_set_info2(item, &transform);
  }
  obs_scene_release(scene);

  VsEmitEvent("scene_list_changed");
  VsSaveSceneCollection();
  return env.Undefined();
}

Napi::Value RenameSource(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string oldName = info[0].As<Napi::String>();
  std::string newName = info[1].As<Napi::String>();

  obs_source_t* src = obs_get_source_by_name(oldName.c_str());
  if (src) {
    obs_source_set_name(src, newName.c_str());
    obs_source_release(src);
    VsEmitEvent("scene_list_changed");
    VsSaveSceneCollection();
  }
  return env.Undefined();
}

Napi::Value UpdateSourceSettings(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string name = info[0].As<Napi::String>();
  std::string settingsJson = info[1].As<Napi::String>();

  obs_source_t* src = obs_get_source_by_name(name.c_str());
  if (!src) return Napi::Boolean::New(env, false);

  obs_data_t* settings = obs_data_create_from_json(settingsJson.c_str());
  if (settings) {
    obs_source_update(src, settings);
    obs_data_release(settings);
  }
  obs_source_release(src);
  VsSaveSceneCollection();
  return Napi::Boolean::New(env, true);
}

Napi::Value GetSourceSettings(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string name = info[0].As<Napi::String>();

  obs_source_t* src = obs_get_source_by_name(name.c_str());
  if (!src) return env.Null();

  obs_data_t* settings = obs_source_get_settings(src);
  const char* json = obs_data_get_json(settings);
  auto result = Napi::String::New(env, json ? json : "{}");
  obs_data_release(settings);
  obs_source_release(src);
  return result;
}

Napi::Value ListSourceDevices(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string kindId = info.Length() > 0 && info[0].IsString() ? info[0].As<Napi::String>().Utf8Value() : vs::cameraSourceId();
  std::string preferredProperty = info.Length() > 1 && info[1].IsString() ? info[1].As<Napi::String>().Utf8Value() : "";
  auto arr = Napi::Array::New(env);
  uint32_t outIndex = 0;

  obs_properties_t* props = obs_get_source_properties(kindId.c_str());
  if (!props) return arr;

  obs_property_t* prop = nullptr;
  if (!preferredProperty.empty()) {
    prop = obs_properties_get(props, preferredProperty.c_str());
  }

  if (!prop || obs_property_get_type(prop) != OBS_PROPERTY_LIST) {
    for (obs_property_t* p = obs_properties_first(props); p; obs_property_next(&p)) {
      if (obs_property_get_type(p) != OBS_PROPERTY_LIST) continue;
      const char* name = obs_property_name(p);
      if (name) {
        std::string propName(name);
        if (propName.find("device") != std::string::npos || propName.find("monitor") != std::string::npos || propName.find("window") != std::string::npos) {
          prop = p;
          break;
        }
      }
    }
  }

  if (prop && obs_property_get_type(prop) == OBS_PROPERTY_LIST) {
    size_t count = obs_property_list_item_count(prop);
    for (size_t i = 0; i < count; i++) {
      const char* name = obs_property_list_item_name(prop, i);
      const char* value = obs_property_list_item_string(prop, i);
      if (!value || !*value) continue;
      auto item = Napi::Object::New(env);
      item.Set("name", (name && *name) ? name : value);
      item.Set("value", value);
      item.Set("disabled", obs_property_list_item_disabled(prop, i));
      arr.Set(outIndex++, item);
    }
  }

  obs_properties_destroy(props);
  return arr;
}

#else

Napi::Value SaveSceneCollection(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value GetScenes(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value CreateScene(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value RemoveScene(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetCurrentScene(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value RenameScene(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value DuplicateScene(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value GetSceneSources(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value CreateSource(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value RemoveSource(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetSourceVisible(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetSourceOrder(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetSourceIndex(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetSceneIndex(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetSourceLocked(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetSourceTransform(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value RenameSource(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value UpdateSourceSettings(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value GetSourceSettings(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value ListSourceDevices(const Napi::CallbackInfo& info) { return Napi::Array::New(info.Env()); }

#endif
