/**
 * obs-core.cc — libobs lifecycle for VaultStudio's standalone engine.
 *
 * initObs(options) does everything the OBS Studio frontend normally does at
 * boot: starts libobs, resets video/audio, loads every bundled plugin module
 * (sources, encoders, outputs, services), then loads the user's scene
 * collection and wires output channels. No OBS Studio install is required —
 * the runtime ships with the app.
 */
#ifdef HAVE_LIBOBS
#include <obs.h>
#include <obs-module.h>
#endif

#include <napi.h>
#include <string>
#include <algorithm>
#include <filesystem>
#include <fstream>

#include "vs-common.h"
#include "vs-platform.h"

namespace fs = std::filesystem;

static bool g_obs_initialized = false;
static std::string g_configDir;   // utf-8, e.g. %APPDATA%/VaultStudio/obs-config
static std::string g_runtimeDir;  // utf-8, bundled OBS runtime root
static const char* PREFERRED_OBS_PROFILE = "Twitch DBS - Restream";

static std::string readTextFile(const fs::path& file) {
  std::ifstream f(file.c_str(), std::ios::binary);
  if (!f.is_open()) return "";
  return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

static void writeTextFile(const fs::path& file, const std::string& content) {
  std::ofstream f(file.c_str(), std::ios::binary | std::ios::trunc);
  if (f.is_open()) f.write(content.data(), static_cast<std::streamsize>(content.size()));
}

static std::string iniValue(const std::string& content, const std::string& key) {
  size_t pos = content.find(key + "=");
  if (pos == std::string::npos) return "";
  size_t start = pos + key.size() + 1;
  size_t end = content.find_first_of("\r\n", start);
  std::string value = content.substr(start, end == std::string::npos ? std::string::npos : end - start);
  while (!value.empty() && (value.back() == '\r' || value.back() == '\n' || value.back() == ' ')) value.pop_back();
  return value;
}

static bool sceneCollectionExists(const fs::path& destBase, const std::string& name) {
  if (name.empty()) return false;
  return fs::exists(destBase / "scenes" / (name + ".json"));
}

static std::string profileSceneCollection(const fs::path& destBase, const std::string& profileName) {
  fs::path profileIni = destBase / "profiles" / profileName / "basic.ini";
  std::string profileContent = readTextFile(profileIni);
  std::string collection = iniValue(profileContent, "SceneCollection");
  if (sceneCollectionExists(destBase, collection)) return collection;
  collection = iniValue(profileContent, "Name");
  if (sceneCollectionExists(destBase, collection)) return collection;
  return sceneCollectionExists(destBase, profileName) ? profileName : "";
}

static std::string firstSceneCollection(const fs::path& destBase) {
  fs::path scenesDir = destBase / "scenes";
  if (!fs::exists(scenesDir)) return "";
  for (auto& entry : fs::directory_iterator(scenesDir)) {
    if (!entry.is_regular_file() || entry.path().extension() != ".json") continue;
    return vs::pathToUtf8(entry.path().stem());
  }
  return "";
}

static std::string chooseSceneCollection(const fs::path& destBase) {
  const std::string preferred(PREFERRED_OBS_PROFILE);
  std::string collection = profileSceneCollection(destBase, preferred);
  if (!collection.empty()) return collection;
  if (sceneCollectionExists(destBase, preferred)) return preferred;

  std::string appBasic = readTextFile(destBase / "basic.ini");
  collection = iniValue(appBasic, "SceneCollection");
  if (sceneCollectionExists(destBase, collection)) return collection;
  collection = iniValue(appBasic, "Name");
  if (sceneCollectionExists(destBase, collection)) return collection;

  std::string global = readTextFile(vs::obsStudioBasicDir().parent_path() / "global.ini");
  collection = iniValue(global, "SceneCollection");
  if (sceneCollectionExists(destBase, collection)) return collection;

  std::string globalProfile = iniValue(global, "Profile");
  collection = profileSceneCollection(destBase, globalProfile);
  if (!collection.empty()) return collection;

  collection = firstSceneCollection(destBase);
  return collection.empty() ? "VaultStudio" : collection;
}

static void writeVaultBasicIni(const fs::path& destBase, const std::string& collectionName) {
  std::string profile = fs::exists(destBase / "profiles" / PREFERRED_OBS_PROFILE)
    ? PREFERRED_OBS_PROFILE
    : collectionName;
  writeTextFile(
    destBase / "basic.ini",
    "[General]\nName=" + collectionName + "\nSceneCollection=" + collectionName + "\nProfile=" + profile + "\n"
  );
}

/** One-time migration: copy scenes/profiles from an OBS Studio install so
 *  existing streamers keep their setup. Harmless no-op when OBS was never
 *  installed. */
static void copyObsConfigIfNeeded(const fs::path& destBase) {
#ifdef HAVE_LIBOBS
  fs::path srcBasic = vs::obsStudioBasicDir();

  fs::path destScenes = destBase / "scenes";
  if (fs::exists(srcBasic)) {
    blog(LOG_INFO, "Importing OBS Studio scenes/profiles when available");
    std::error_code ec;
    fs::copy(srcBasic / "profiles", destBase / "profiles",
             fs::copy_options::recursive | fs::copy_options::skip_existing, ec);
    fs::copy(srcBasic / "scenes", destScenes,
             fs::copy_options::recursive | fs::copy_options::skip_existing, ec);
  }

  writeVaultBasicIni(destBase, chooseSceneCollection(destBase));
#endif
}

#ifdef HAVE_LIBOBS
/** Unbuffered stderr logging — the Electron main process captures this
 *  stream; without the flush, lines are lost when the worker dies. */
static void vsLogHandler(int lvl, const char* msg, va_list args, void*) {
  const char* level = lvl == LOG_ERROR ? "error" : lvl == LOG_WARNING ? "warning" : lvl == LOG_INFO ? "info" : "debug";
  fprintf(stderr, "%s: ", level);
  vfprintf(stderr, msg, args);
  fputc('\n', stderr);
  fflush(stderr);
}

static int resetVideoWithFallbacks(uint32_t baseW, uint32_t baseH, uint32_t outW, uint32_t outH, uint32_t fps) {
  struct Attempt {
    enum video_format format;
    bool gpuConversion;
    const char* label;
  };
  const Attempt attempts[] = {
    {VIDEO_FORMAT_NV12, true, "NV12/gpu"},
    {VIDEO_FORMAT_I420, false, "I420/cpu"},
    {VIDEO_FORMAT_BGRA, false, "BGRA/cpu"},
  };

  int lastErr = OBS_VIDEO_FAIL;
  for (const auto& a : attempts) {
    struct obs_video_info ovi = {};
    ovi.graphics_module = vs::graphicsModule();
    ovi.fps_num = fps;
    ovi.fps_den = 1;
    ovi.base_width = baseW;
    ovi.base_height = baseH;
    ovi.output_width = outW;
    ovi.output_height = outH;
    ovi.output_format = a.format;
    ovi.adapter = 0;
    ovi.gpu_conversion = a.gpuConversion;
    ovi.colorspace = VIDEO_CS_709;
    ovi.range = VIDEO_RANGE_DEFAULT;
    ovi.scale_type = OBS_SCALE_LANCZOS;

    lastErr = obs_reset_video(&ovi);
    if (lastErr == VIDEO_OUTPUT_SUCCESS) {
      blog(LOG_INFO, "Video initialized (%s) %ux%u -> %ux%u @ %ufps", a.label, baseW, baseH, outW, outH, fps);
      return lastErr;
    }
    blog(LOG_WARNING, "obs_reset_video (%s) failed: %d", a.label, lastErr);
  }
  return lastErr;
}
#endif

Napi::Value InitObs(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (g_obs_initialized) return Napi::Boolean::New(env, true);

  // Options from JS
  uint32_t baseW = 1920, baseH = 1080, outW = 1920, outH = 1080, fps = 60;
  if (info.Length() > 0 && info[0].IsObject()) {
    auto opts = info[0].As<Napi::Object>();
    if (opts.Has("runtimeDir")) g_runtimeDir = opts.Get("runtimeDir").As<Napi::String>().Utf8Value();
    if (opts.Has("configDir")) g_configDir = opts.Get("configDir").As<Napi::String>().Utf8Value();
    if (opts.Has("baseWidth")) baseW = opts.Get("baseWidth").As<Napi::Number>().Uint32Value();
    if (opts.Has("baseHeight")) baseH = opts.Get("baseHeight").As<Napi::Number>().Uint32Value();
    if (opts.Has("outputWidth")) outW = opts.Get("outputWidth").As<Napi::Number>().Uint32Value();
    if (opts.Has("outputHeight")) outH = opts.Get("outputHeight").As<Napi::Number>().Uint32Value();
    if (opts.Has("fps")) fps = opts.Get("fps").As<Napi::Number>().Uint32Value();
  }
  if (g_configDir.empty()) {
    g_configDir = vs::fallbackConfigDir();
  }

  fs::path configPath = vs::pathFromUtf8(g_configDir);
  std::error_code ec;
  fs::create_directories(configPath, ec);
  fs::create_directories(configPath / "scenes", ec);
  fs::create_directories(configPath / "plugin_config", ec);

  copyObsConfigIfNeeded(configPath);

#ifdef HAVE_LIBOBS
  if (g_runtimeDir.empty()) {
    Napi::Error::New(env, "initObs requires options.runtimeDir (bundled OBS runtime)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  base_set_log_handler(vsLogHandler, nullptr);

  std::string moduleConfig = vs::pathToUtf8(configPath / "plugin_config");
  if (!obs_startup("en-US", moduleConfig.c_str(), nullptr)) {
    Napi::Error::New(env, "obs_startup failed").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Effect shaders and other core assets from the bundled runtime.
  // obs_add_data_path concatenates filenames directly — trailing slash required.
  std::string libobsData = vs::pathToUtf8(vs::libobsDataDir(g_runtimeDir)) + "/";
  obs_add_data_path(libobsData.c_str());

  int vret = resetVideoWithFallbacks(baseW, baseH, outW, outH, fps);
  if (vret != VIDEO_OUTPUT_SUCCESS) {
    blog(LOG_ERROR, "All video init attempts failed (last error %d)", vret);
    obs_shutdown();
    Napi::Error::New(env, "obs_reset_video failed: " + std::to_string(vret)).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  struct obs_audio_info oai = {};
  oai.samples_per_sec = 48000;
  oai.speakers = SPEAKERS_STEREO;
  if (!obs_reset_audio(&oai)) {
    obs_shutdown();
    Napi::Error::New(env, "obs_reset_audio failed").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  // Load every bundled plugin: sources, encoders, outputs, services.
  std::string pluginBin = vs::pathToUtf8(vs::pluginBinaryDir(g_runtimeDir));
  std::string pluginData = vs::pathToUtf8(vs::pluginDataPattern(g_runtimeDir));
  obs_add_module_path(pluginBin.c_str(), pluginData.c_str());
  obs_load_all_modules();
  obs_post_load_modules();
  obs_log_loaded_modules();

  VsLoadSceneCollection(g_configDir);
#endif

  g_obs_initialized = true;
  return Napi::Boolean::New(env, true);
}

Napi::Value ShutdownObs(const Napi::CallbackInfo& info) {
  if (g_obs_initialized) {
#ifdef HAVE_LIBOBS
    VsSaveSceneCollection();
    VsReleaseEventCallback();
    VsStopPreviewInternal();
    VsCleanupOutputs();
    VsReleaseVolmeters();
    VsReleaseSceneCollection();
    obs_shutdown();
#endif
    g_obs_initialized = false;
  }
  return info.Env().Undefined();
}

Napi::Value IsObsInitialized(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), g_obs_initialized);
}

/** Change canvas/output resolution and FPS. Fails while outputs are active. */
Napi::Value SetVideoSettings(const Napi::CallbackInfo& info) {
  auto env = info.Env();
#ifdef HAVE_LIBOBS
  if (!g_obs_initialized || info.Length() < 1 || !info[0].IsObject()) {
    return Napi::Boolean::New(env, false);
  }
  auto opts = info[0].As<Napi::Object>();
  struct obs_video_info cur = {};
  obs_get_video_info(&cur);
  uint32_t baseW = opts.Has("baseWidth") ? opts.Get("baseWidth").As<Napi::Number>().Uint32Value() : cur.base_width;
  uint32_t baseH = opts.Has("baseHeight") ? opts.Get("baseHeight").As<Napi::Number>().Uint32Value() : cur.base_height;
  uint32_t outW = opts.Has("outputWidth") ? opts.Get("outputWidth").As<Napi::Number>().Uint32Value() : cur.output_width;
  uint32_t outH = opts.Has("outputHeight") ? opts.Get("outputHeight").As<Napi::Number>().Uint32Value() : cur.output_height;
  uint32_t fps = opts.Has("fps") ? opts.Get("fps").As<Napi::Number>().Uint32Value() : cur.fps_num;
  int ret = resetVideoWithFallbacks(baseW, baseH, outW, outH, fps);
  return Napi::Boolean::New(env, ret == VIDEO_OUTPUT_SUCCESS);
#else
  return Napi::Boolean::New(env, false);
#endif
}

Napi::Value GetVideoSettings(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto obj = Napi::Object::New(env);
#ifdef HAVE_LIBOBS
  struct obs_video_info ovi = {};
  if (g_obs_initialized && obs_get_video_info(&ovi)) {
    obj.Set("baseWidth", ovi.base_width);
    obj.Set("baseHeight", ovi.base_height);
    obj.Set("outputWidth", ovi.output_width);
    obj.Set("outputHeight", ovi.output_height);
    obj.Set("fps", ovi.fps_num);
  }
#endif
  return obj;
}

Napi::Value GetProfiles(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto arr = Napi::Array::New(env);
  fs::path profilesDir = vs::pathFromUtf8(g_configDir.empty() ? vs::fallbackConfigDir() : g_configDir) / "profiles";
  if (!fs::exists(profilesDir)) return arr;

  uint32_t idx = 0;
  for (auto& entry : fs::directory_iterator(profilesDir)) {
    if (!entry.is_directory()) continue;
    std::string name = vs::pathToUtf8(entry.path().filename());
    auto obj = Napi::Object::New(env);
    obj.Set("name", Napi::String::New(env, name));
    obj.Set("path", Napi::String::New(env, name));
    arr.Set(idx++, obj);
  }
  return arr;
}

Napi::Value SetProfile(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string profileName = info[0].As<Napi::String>().Utf8Value();
  fs::path configBase = vs::pathFromUtf8(g_configDir.empty() ? vs::fallbackConfigDir() : g_configDir);
  fs::path basicIniPath = configBase / "basic.ini";
  std::string collectionName = profileSceneCollection(configBase, profileName);
  if (collectionName.empty() && sceneCollectionExists(configBase, profileName)) collectionName = profileName;
  if (collectionName.empty()) collectionName = chooseSceneCollection(configBase);

  std::string iniContent = readTextFile(basicIniPath);

  size_t genPos = iniContent.find("[General]");
  if (genPos != std::string::npos) {
    size_t nameStart = iniContent.find("Name=", genPos);
    if (nameStart != std::string::npos) {
      size_t nameEnd = iniContent.find('\n', nameStart);
      if (nameEnd == std::string::npos) nameEnd = iniContent.size();
      iniContent.replace(nameStart, nameEnd - nameStart, "Name=" + collectionName);
    } else {
      iniContent.insert(genPos + 9, "\nName=" + collectionName);
    }

    size_t collectionStart = iniContent.find("SceneCollection=", genPos);
    if (collectionStart != std::string::npos) {
      size_t collectionEnd = iniContent.find('\n', collectionStart);
      if (collectionEnd == std::string::npos) collectionEnd = iniContent.size();
      iniContent.replace(collectionStart, collectionEnd - collectionStart, "SceneCollection=" + collectionName);
    } else {
      iniContent.insert(genPos + 9, "\nSceneCollection=" + collectionName);
    }

    size_t profileStart = iniContent.find("Profile=", genPos);
    if (profileStart != std::string::npos) {
      size_t profileEnd = iniContent.find('\n', profileStart);
      if (profileEnd == std::string::npos) profileEnd = iniContent.size();
      iniContent.replace(profileStart, profileEnd - profileStart, "Profile=" + profileName);
    } else {
      iniContent.insert(genPos + 9, "\nProfile=" + profileName);
    }
  } else {
    iniContent = "[General]\nName=" + collectionName + "\nSceneCollection=" + collectionName + "\nProfile=" + profileName + "\n" + iniContent;
  }

  writeTextFile(basicIniPath, iniContent);
  return Napi::Boolean::New(env, true);
}
