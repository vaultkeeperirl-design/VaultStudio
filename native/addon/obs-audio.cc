/**
 * obs-audio.cc — audio sources, volume/mute, and live meter levels.
 *
 * A volmeter is attached to every audio-capable source the first time it is
 * enumerated. Meter callbacks fire on the audio thread and only write an
 * atomic, so reads from JS are lock-free and cheap.
 */
#include <napi.h>
#include <string>
#include <map>
#include <memory>
#include <atomic>
#include <cmath>
#include <mutex>

#ifdef HAVE_LIBOBS
#include <obs.h>
#include "vs-common.h"

struct MeterEntry {
  obs_volmeter_t* volmeter = nullptr;
  std::atomic<float> level{0.0f}; // 0..1 linear peak
};

static std::map<std::string, std::unique_ptr<MeterEntry>> g_meters;
static std::mutex g_metersMutex;

static void volmeterCallback(void* param, const float[MAX_AUDIO_CHANNELS],
                             const float peak[MAX_AUDIO_CHANNELS], const float[MAX_AUDIO_CHANNELS]) {
  auto* entry = static_cast<MeterEntry*>(param);
  float maxPeakDb = -96.0f;
  for (int ch = 0; ch < MAX_AUDIO_CHANNELS; ch++) {
    if (std::isfinite(peak[ch]) && peak[ch] > maxPeakDb) maxPeakDb = peak[ch];
  }
  float mul = maxPeakDb <= -96.0f ? 0.0f : powf(10.0f, maxPeakDb / 20.0f);
  if (mul > 1.0f) mul = 1.0f;
  entry->level.store(mul, std::memory_order_relaxed);
}

static void ensureMeter(obs_source_t* source) {
  const char* name = obs_source_get_name(source);
  if (!name) return;
  std::lock_guard<std::mutex> lock(g_metersMutex);
  if (g_meters.count(name)) return;

  auto entry = std::make_unique<MeterEntry>();
  entry->volmeter = obs_volmeter_create(OBS_FADER_LOG);
  if (!entry->volmeter) return;
  obs_volmeter_add_callback(entry->volmeter, volmeterCallback, entry.get());
  if (!obs_volmeter_attach_source(entry->volmeter, source)) {
    obs_volmeter_remove_callback(entry->volmeter, volmeterCallback, entry.get());
    obs_volmeter_destroy(entry->volmeter);
    return;
  }
  g_meters[name] = std::move(entry);
}

void VsReleaseVolmeters() {
  std::lock_guard<std::mutex> lock(g_metersMutex);
  for (auto& [name, entry] : g_meters) {
    if (entry->volmeter) {
      obs_volmeter_remove_callback(entry->volmeter, volmeterCallback, entry.get());
      obs_volmeter_detach_source(entry->volmeter);
      obs_volmeter_destroy(entry->volmeter);
    }
  }
  g_meters.clear();
}

Napi::Value GetAudioSources(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto arr = Napi::Array::New(env);

  struct EnumAudioData {
    Napi::Env env;
    Napi::Array arr;
    uint32_t idx;
  } data{env, arr, 0};

  obs_enum_sources([](void* param, obs_source_t* source) -> bool {
    auto* d = static_cast<EnumAudioData*>(param);
    uint32_t flags = obs_source_get_output_flags(source);
    if (!(flags & OBS_SOURCE_AUDIO)) return true;

    const char* name = obs_source_get_name(source);
    if (!name || !*name) return true;

    ensureMeter(source);

    float level = 0.0f;
    {
      std::lock_guard<std::mutex> lock(g_metersMutex);
      auto it = g_meters.find(name);
      if (it != g_meters.end()) level = it->second->level.load(std::memory_order_relaxed);
    }

    auto obj = Napi::Object::New(d->env);
    obj.Set("name", name);
    obj.Set("kind", obs_source_get_id(source));
    obj.Set("volume", obs_source_get_volume(source));
    obj.Set("muted", obs_source_muted(source));
    obj.Set("level", level);
    d->arr.Set(d->idx++, obj);
    return true;
  }, &data);

  return arr;
}

/** Lightweight meter poll — names + levels only, no source enumeration churn. */
Napi::Value GetAudioLevels(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto arr = Napi::Array::New(env);
  std::lock_guard<std::mutex> lock(g_metersMutex);
  uint32_t idx = 0;
  for (auto& [name, entry] : g_meters) {
    auto obj = Napi::Object::New(env);
    obj.Set("name", name);
    obj.Set("level", entry->level.load(std::memory_order_relaxed));
    arr.Set(idx++, obj);
  }
  return arr;
}

Napi::Value SetVolume(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string name = info[0].As<Napi::String>();
  float volume = info[1].As<Napi::Number>().FloatValue();
  if (volume < 0.0f) volume = 0.0f;
  if (volume > 1.0f) volume = 1.0f;

  obs_source_t* source = obs_get_source_by_name(name.c_str());
  if (source) {
    obs_source_set_volume(source, volume);
    obs_source_release(source);
    VsSaveSceneCollection();
  }
  return env.Undefined();
}

Napi::Value SetMuted(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::string name = info[0].As<Napi::String>();
  bool muted = info[1].As<Napi::Boolean>();

  obs_source_t* source = obs_get_source_by_name(name.c_str());
  if (source) {
    obs_source_set_muted(source, muted);
    obs_source_release(source);
    VsSaveSceneCollection();
  }
  return env.Undefined();
}

#else

void VsReleaseVolmeters() {}
Napi::Value GetAudioSources(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value GetAudioLevels(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetVolume(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SetMuted(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }

#endif
