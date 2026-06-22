/**
 * obs-output.cc — streaming, recording, replay buffer, and virtual camera.
 *
 * Streaming is natively multi-target: one video/audio encode is fanned out to
 * any number of RTMP(S) outputs (what OBS Studio needs a third-party plugin
 * for). Each target gets its own rtmp_output + rtmp_custom service sharing
 * the same encoders.
 */
#include <napi.h>
#include <string>
#include <vector>
#include <atomic>
#include <mutex>

#ifdef HAVE_LIBOBS
#include <obs.h>
#include <util/platform.h>
#include "vs-common.h"

struct StreamTarget {
  std::string id;
  std::string name;
  obs_output_t* output = nullptr;
  obs_service_t* service = nullptr;
  std::atomic<bool> reconnecting{false};
};

static std::vector<StreamTarget*> g_targets;
static std::mutex g_outputMutex;

static obs_encoder_t* g_videoEncoder = nullptr;
static obs_encoder_t* g_audioEncoder = nullptr;
static std::string g_videoEncoderId;

static obs_output_t* g_recordOutput = nullptr;
static obs_output_t* g_replayOutput = nullptr;
static obs_output_t* g_virtualCamOutput = nullptr;

static std::atomic<int> g_activeStreamOutputs{0};
static std::atomic<uint64_t> g_streamStartMs{0};
static std::atomic<uint64_t> g_recordStartMs{0};

static uint64_t nowMs() {
  return os_gettime_ns() / 1000000ULL;
}

static bool encoderTypeExists(const char* id) {
  const char* existing;
  for (size_t i = 0; obs_enum_encoder_types(i, &existing); i++) {
    if (strcmp(existing, id) == 0) return true;
  }
  return false;
}

/** Pick the best available H.264 encoder: NVENC > QSV > AMF > x264. */
static std::string pickVideoEncoderId(const std::string& preference) {
  if (preference == "x264") return "obs_x264";
  const char* candidates[] = {
    "obs_nvenc_h264_tex", "jim_nvenc", "ffmpeg_nvenc",
    "obs_qsv11_v2", "obs_qsv11",
    "h264_texture_amf",
    "obs_x264",
  };
  if (preference == "nvenc") {
    for (const char* id : {"obs_nvenc_h264_tex", "jim_nvenc", "ffmpeg_nvenc"}) {
      if (encoderTypeExists(id)) return id;
    }
  }
  for (const char* id : candidates) {
    if (encoderTypeExists(id)) return id;
  }
  return "obs_x264";
}

static bool ensureEncoders(int videoBitrateKbps, int audioBitrateKbps, const std::string& encoderPref) {
  std::string desiredId = pickVideoEncoderId(encoderPref);
  // Recreate video encoder if it doesn't exist or the preference changed.
  if (!g_videoEncoder || g_videoEncoderId != desiredId) {
    if (g_videoEncoder) { obs_encoder_release(g_videoEncoder); g_videoEncoder = nullptr; }
    g_videoEncoderId = desiredId;
    obs_data_t* vs = obs_data_create();
    obs_data_set_int(vs, "bitrate", videoBitrateKbps);
    obs_data_set_string(vs, "rate_control", "CBR");
    obs_data_set_int(vs, "keyint_sec", 2);
    if (g_videoEncoderId == "obs_x264") {
      obs_data_set_string(vs, "preset", "veryfast");
      obs_data_set_string(vs, "profile", "main");
    } else {
      // GPU encoders: use lookahead and multipass for better quality.
      obs_data_set_string(vs, "preset", "Quality");
      obs_data_set_string(vs, "multipass", "qres");
      obs_data_set_int(vs, "lookahead", 1);
    }
    g_videoEncoder = obs_video_encoder_create(g_videoEncoderId.c_str(), "vaultstudio_h264", vs, nullptr);
    obs_data_release(vs);
    if (!g_videoEncoder) {
      blog(LOG_ERROR, "Failed to create video encoder %s", g_videoEncoderId.c_str());
      return false;
    }
    obs_encoder_set_video(g_videoEncoder, obs_get_video());
    blog(LOG_INFO, "Video encoder: %s @ %d kbps", g_videoEncoderId.c_str(), videoBitrateKbps);
  }
  // Update bitrate if it changed.
  if (g_videoEncoder) {
    obs_data_t* vs = obs_encoder_get_settings(g_videoEncoder);
    obs_data_set_int(vs, "bitrate", videoBitrateKbps);
    obs_encoder_update(g_videoEncoder, vs);
    obs_data_release(vs);
  }
  if (!g_audioEncoder) {
    const char* aacId = encoderTypeExists("CoreAudio_AAC") ? "CoreAudio_AAC" : "ffmpeg_aac";
    obs_data_t* as = obs_data_create();
    obs_data_set_int(as, "bitrate", audioBitrateKbps);
    g_audioEncoder = obs_audio_encoder_create(aacId, "vaultstudio_aac", as, 0, nullptr);
    obs_data_release(as);
    if (!g_audioEncoder) {
      blog(LOG_ERROR, "Failed to create audio encoder %s", aacId);
      return false;
    }
    obs_encoder_set_audio(g_audioEncoder, obs_get_audio());
  }
  return true;
}

static void releaseEncoders() {
  if (g_videoEncoder) { obs_encoder_release(g_videoEncoder); g_videoEncoder = nullptr; }
  if (g_audioEncoder) { obs_encoder_release(g_audioEncoder); g_audioEncoder = nullptr; }
}

// --- output signal handlers (fire on OBS threads — only atomics + VsEmitEvent) ---

static void onStreamStart(void* param, calldata_t*) {
  auto* t = static_cast<StreamTarget*>(param);
  t->reconnecting = false;
  int active = ++g_activeStreamOutputs;
  VsEmitEvent("target_connected", "{\"id\":\"" + t->id + "\",\"name\":\"" + t->name + "\"}");
  if (active == 1) {
    g_streamStartMs = nowMs();
    VsEmitEvent("streaming_started");
  }
}

static void onStreamStop(void* param, calldata_t* cd) {
  auto* t = static_cast<StreamTarget*>(param);
  t->reconnecting = false;
  long long code = 0;
  calldata_get_int(cd, "code", &code);
  VsEmitEvent("target_disconnected",
              "{\"id\":\"" + t->id + "\",\"name\":\"" + t->name + "\",\"code\":" + std::to_string(code) + "}");
  int active = --g_activeStreamOutputs;
  if (active <= 0) {
    g_activeStreamOutputs = 0;
    g_streamStartMs = 0;
    VsEmitEvent("streaming_stopped", "{\"code\":" + std::to_string(code) + "}");
  }
}

static void onStreamReconnect(void* param, calldata_t*) {
  auto* t = static_cast<StreamTarget*>(param);
  t->reconnecting = true;
  VsEmitEvent("target_reconnecting", "{\"id\":\"" + t->id + "\",\"name\":\"" + t->name + "\"}");
}

static void onStreamReconnectSuccess(void* param, calldata_t*) {
  auto* t = static_cast<StreamTarget*>(param);
  t->reconnecting = false;
  VsEmitEvent("target_connected", "{\"id\":\"" + t->id + "\",\"name\":\"" + t->name + "\"}");
}

static void onRecordStart(void*, calldata_t*) {
  g_recordStartMs = nowMs();
  VsEmitEvent("recording_started");
}

static void onRecordStop(void*, calldata_t* cd) {
  long long code = 0;
  calldata_get_int(cd, "code", &code);
  g_recordStartMs = 0;
  VsEmitEvent("recording_stopped", "{\"code\":" + std::to_string(code) + "}");
}

static void onReplaySaved(void*, calldata_t*) {
  VsEmitEvent("replay_saved");
}

static void releaseTarget(StreamTarget* t) {
  if (t->output) {
    signal_handler_t* sh = obs_output_get_signal_handler(t->output);
    signal_handler_disconnect(sh, "start", onStreamStart, t);
    signal_handler_disconnect(sh, "stop", onStreamStop, t);
    signal_handler_disconnect(sh, "reconnect", onStreamReconnect, t);
    signal_handler_disconnect(sh, "reconnect_success", onStreamReconnectSuccess, t);
    obs_output_release(t->output);
  }
  if (t->service) obs_service_release(t->service);
  delete t;
}

void VsCleanupOutputs() {
  std::lock_guard<std::mutex> lock(g_outputMutex);
  for (auto* t : g_targets) {
    if (t->output && obs_output_active(t->output)) obs_output_force_stop(t->output);
    releaseTarget(t);
  }
  g_targets.clear();
  if (g_recordOutput) {
    if (obs_output_active(g_recordOutput)) obs_output_force_stop(g_recordOutput);
    obs_output_release(g_recordOutput);
    g_recordOutput = nullptr;
  }
  if (g_replayOutput) {
    if (obs_output_active(g_replayOutput)) obs_output_force_stop(g_replayOutput);
    obs_output_release(g_replayOutput);
    g_replayOutput = nullptr;
  }
  if (g_virtualCamOutput) {
    if (obs_output_active(g_virtualCamOutput)) obs_output_force_stop(g_virtualCamOutput);
    obs_output_release(g_virtualCamOutput);
    g_virtualCamOutput = nullptr;
  }
  releaseEncoders();
  g_activeStreamOutputs = 0;
}

Napi::Value CleanupOutput(const Napi::CallbackInfo& info) {
  VsCleanupOutputs();
  return info.Env().Undefined();
}

/**
 * startStream(targets, settings)
 *   targets:  [{ id, name, server, key }]
 *   settings: { videoBitrateKbps?, audioBitrateKbps?, encoder? ("auto"|"nvenc"|"x264") }
 */
Napi::Value StartStream(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(g_outputMutex);

  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::Error::New(env, "startStream requires an array of targets").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  auto targetsArr = info[0].As<Napi::Array>();
  if (targetsArr.Length() == 0) {
    Napi::Error::New(env, "No stream targets configured").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_activeStreamOutputs > 0) {
    Napi::Error::New(env, "Stream already active").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  int videoBitrate = 6000, audioBitrate = 160;
  std::string encoderPref = "auto";
  if (info.Length() > 1 && info[1].IsObject()) {
    auto s = info[1].As<Napi::Object>();
    if (s.Has("videoBitrateKbps")) videoBitrate = s.Get("videoBitrateKbps").As<Napi::Number>().Int32Value();
    if (s.Has("audioBitrateKbps")) audioBitrate = s.Get("audioBitrateKbps").As<Napi::Number>().Int32Value();
    if (s.Has("encoder")) encoderPref = s.Get("encoder").As<Napi::String>().Utf8Value();
  }

  // Stale targets from a previous session
  for (auto* t : g_targets) releaseTarget(t);
  g_targets.clear();

  if (!ensureEncoders(videoBitrate, audioBitrate, encoderPref)) {
    Napi::Error::New(env, "Failed to create encoders").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t started = 0;
  std::string firstError;
  for (uint32_t i = 0; i < targetsArr.Length(); i++) {
    auto tv = targetsArr.Get(i);
    if (!tv.IsObject()) continue;
    auto to = tv.As<Napi::Object>();

    auto* t = new StreamTarget();
    t->id = to.Has("id") ? to.Get("id").As<Napi::String>().Utf8Value() : std::to_string(i);
    t->name = to.Has("name") ? to.Get("name").As<Napi::String>().Utf8Value() : ("Target " + std::to_string(i + 1));
    std::string server = to.Has("server") ? to.Get("server").As<Napi::String>().Utf8Value() : "";
    std::string key = to.Has("key") ? to.Get("key").As<Napi::String>().Utf8Value() : "";

    obs_data_t* svc = obs_data_create();
    obs_data_set_string(svc, "server", server.c_str());
    obs_data_set_string(svc, "key", key.c_str());
    t->service = obs_service_create("rtmp_custom", ("vs_service_" + t->id).c_str(), svc, nullptr);
    obs_data_release(svc);

    // Dynamic bitrate: under congestion the encoder bitrate is lowered and
    // recovered automatically instead of discarding frames. Combined with
    // generous drop thresholds this keeps every target smooth even when one
    // ingest (or the uplink) chokes — no plugin, no dropped-frame spiral.
    obs_data_t* outSettings = obs_data_create();
    obs_data_set_bool(outSettings, "dyn_bitrate", true);
    obs_data_set_int(outSettings, "drop_threshold_ms", 1400);
    obs_data_set_int(outSettings, "pframe_drop_threshold_ms", 1800);
    obs_data_set_string(outSettings, "bind_ip", "default");
    t->output = obs_output_create("rtmp_output", ("vs_output_" + t->id).c_str(), outSettings, nullptr);
    obs_data_release(outSettings);
    if (!t->output || !t->service) {
      blog(LOG_ERROR, "Failed to create output for target %s", t->name.c_str());
      if (firstError.empty()) firstError = "Failed to create RTMP output for " + t->name;
      releaseTarget(t);
      continue;
    }

    obs_output_set_video_encoder(t->output, g_videoEncoder);
    obs_output_set_audio_encoder(t->output, g_audioEncoder, 0);
    obs_output_set_service(t->output, t->service);
    obs_output_set_reconnect_settings(t->output, 20, 5);

    signal_handler_t* sh = obs_output_get_signal_handler(t->output);
    signal_handler_connect(sh, "start", onStreamStart, t);
    signal_handler_connect(sh, "stop", onStreamStop, t);
    signal_handler_connect(sh, "reconnect", onStreamReconnect, t);
    signal_handler_connect(sh, "reconnect_success", onStreamReconnectSuccess, t);

    g_targets.push_back(t);

    if (obs_output_start(t->output)) {
      started++;
    } else {
      const char* err = obs_output_get_last_error(t->output);
      blog(LOG_ERROR, "obs_output_start failed for %s: %s", t->name.c_str(), err ? err : "unknown");
      if (firstError.empty()) firstError = t->name + ": " + (err ? err : "failed to start");
    }
  }

  if (started == 0) {
    for (auto* t : g_targets) releaseTarget(t);
    g_targets.clear();
    Napi::Error::New(env, firstError.empty() ? "No targets could start" : firstError).ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Number::New(env, started);
}

Napi::Value StopStream(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(g_outputMutex);
  for (auto* t : g_targets) {
    if (t->output && obs_output_active(t->output)) obs_output_stop(t->output);
  }
  return info.Env().Undefined();
}

/** startRecording({ path, formatName? }) — path is the full output file path. */
Napi::Value StartRecording(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(g_outputMutex);

  std::string path, format = "mkv";
  if (info.Length() > 0 && info[0].IsObject()) {
    auto o = info[0].As<Napi::Object>();
    if (o.Has("path")) path = o.Get("path").As<Napi::String>().Utf8Value();
    if (o.Has("formatName")) format = o.Get("formatName").As<Napi::String>().Utf8Value();
  }
  if (path.empty()) {
    Napi::Error::New(env, "startRecording requires a path").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!ensureEncoders(6000, 160, "auto")) {
    Napi::Error::New(env, "Failed to create encoders").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!g_recordOutput) {
    g_recordOutput = obs_output_create("ffmpeg_muxer", "vaultstudio_record", nullptr, nullptr);
    if (!g_recordOutput) {
      Napi::Error::New(env, "Failed to create recording output").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    signal_handler_t* sh = obs_output_get_signal_handler(g_recordOutput);
    signal_handler_connect(sh, "start", onRecordStart, nullptr);
    signal_handler_connect(sh, "stop", onRecordStop, nullptr);
  }
  if (obs_output_active(g_recordOutput)) {
    return Napi::Boolean::New(env, true);
  }

  obs_data_t* settings = obs_data_create();
  obs_data_set_string(settings, "path", path.c_str());
  obs_data_set_string(settings, "muxer_settings", "");
  obs_output_update(g_recordOutput, settings);
  obs_data_release(settings);

  obs_output_set_video_encoder(g_recordOutput, g_videoEncoder);
  obs_output_set_audio_encoder(g_recordOutput, g_audioEncoder, 0);

  bool ok = obs_output_start(g_recordOutput);
  if (!ok) {
    const char* err = obs_output_get_last_error(g_recordOutput);
    Napi::Error::New(env, std::string("Recording failed to start: ") + (err ? err : "unknown")).ThrowAsJavaScriptException();
    return env.Undefined();
  }
  return Napi::Boolean::New(env, ok);
}

Napi::Value StopRecording(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(g_outputMutex);
  if (g_recordOutput && obs_output_active(g_recordOutput)) obs_output_stop(g_recordOutput);
  return info.Env().Undefined();
}

/** startReplayBuffer({ directory, seconds? }) */
Napi::Value StartReplayBuffer(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(g_outputMutex);

  std::string directory;
  int seconds = 30;
  if (info.Length() > 0 && info[0].IsObject()) {
    auto o = info[0].As<Napi::Object>();
    if (o.Has("directory")) directory = o.Get("directory").As<Napi::String>().Utf8Value();
    if (o.Has("seconds")) seconds = o.Get("seconds").As<Napi::Number>().Int32Value();
  }
  if (directory.empty()) {
    Napi::Error::New(env, "startReplayBuffer requires a directory").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!ensureEncoders(6000, 160, "auto")) {
    Napi::Error::New(env, "Failed to create encoders").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!g_replayOutput) {
    g_replayOutput = obs_output_create("replay_buffer", "vaultstudio_replay", nullptr, nullptr);
    if (!g_replayOutput) {
      Napi::Error::New(env, "Failed to create replay buffer").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    signal_handler_t* sh = obs_output_get_signal_handler(g_replayOutput);
    signal_handler_connect(sh, "saved", onReplaySaved, nullptr);
  }
  if (obs_output_active(g_replayOutput)) return Napi::Boolean::New(env, true);

  obs_data_t* settings = obs_data_create();
  obs_data_set_string(settings, "directory", directory.c_str());
  obs_data_set_string(settings, "format", "Replay %CCYY-%MM-%DD %hh-%mm-%ss");
  obs_data_set_string(settings, "extension", "mp4");
  obs_data_set_int(settings, "max_time_sec", seconds);
  obs_data_set_int(settings, "max_size_mb", 512);
  obs_output_update(g_replayOutput, settings);
  obs_data_release(settings);

  obs_output_set_video_encoder(g_replayOutput, g_videoEncoder);
  obs_output_set_audio_encoder(g_replayOutput, g_audioEncoder, 0);

  return Napi::Boolean::New(env, obs_output_start(g_replayOutput));
}

Napi::Value SaveReplay(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(g_outputMutex);
  if (!g_replayOutput || !obs_output_active(g_replayOutput)) {
    return Napi::Boolean::New(env, false);
  }
  proc_handler_t* ph = obs_output_get_proc_handler(g_replayOutput);
  calldata_t cd = {};
  bool ok = proc_handler_call(ph, "save", &cd);
  calldata_free(&cd);
  return Napi::Boolean::New(env, ok);
}

Napi::Value StopReplayBuffer(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(g_outputMutex);
  if (g_replayOutput && obs_output_active(g_replayOutput)) obs_output_stop(g_replayOutput);
  return info.Env().Undefined();
}

Napi::Value StartVirtualCam(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(g_outputMutex);

  if (!g_virtualCamOutput) {
    g_virtualCamOutput = obs_output_create("virtualcam_output", "vaultstudio_vcam", nullptr, nullptr);
    if (!g_virtualCamOutput) {
      auto result = Napi::Object::New(env);
      result.Set("ok", false);
      result.Set("error", "Virtual camera output unavailable (driver not installed)");
      return result;
    }
  }
  if (obs_output_active(g_virtualCamOutput)) {
    auto result = Napi::Object::New(env);
    result.Set("ok", true);
    result.Set("active", true);
    return result;
  }

  bool ok = obs_output_start(g_virtualCamOutput);
  auto result = Napi::Object::New(env);
  result.Set("ok", ok);
  result.Set("active", ok);
  if (!ok) {
    const char* err = obs_output_get_last_error(g_virtualCamOutput);
    result.Set("error", err ? err : "Failed to start virtual camera (is the driver registered?)");
  }
  return result;
}

Napi::Value StopVirtualCam(const Napi::CallbackInfo& info) {
  std::lock_guard<std::mutex> lock(g_outputMutex);
  if (g_virtualCamOutput && obs_output_active(g_virtualCamOutput)) obs_output_stop(g_virtualCamOutput);
  return info.Env().Undefined();
}

Napi::Value GetOutputStats(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  std::lock_guard<std::mutex> lock(g_outputMutex);
  auto obj = Napi::Object::New(env);

  bool streaming = g_activeStreamOutputs > 0;
  bool recording = g_recordOutput && obs_output_active(g_recordOutput);

  uint64_t totalBytes = 0;
  int droppedFrames = 0, totalFrames = 0;
  auto targetsArr = Napi::Array::New(env);
  uint32_t ti = 0;
  for (auto* t : g_targets) {
    if (!t->output) continue;
    bool active = obs_output_active(t->output);
    uint64_t bytes = obs_output_get_total_bytes(t->output);
    int frames = obs_output_get_total_frames(t->output);
    int dropped = obs_output_get_frames_dropped(t->output);
    totalBytes += bytes;
    droppedFrames += dropped;
    totalFrames += frames;

    auto to = Napi::Object::New(env);
    to.Set("id", t->id);
    to.Set("name", t->name);
    to.Set("connected", active && !t->reconnecting.load());
    to.Set("reconnecting", t->reconnecting.load());
    to.Set("totalBytes", (double)bytes);
    to.Set("droppedFrames", dropped);
    to.Set("congestion", active ? obs_output_get_congestion(t->output) : 0.0f);
    targetsArr.Set(ti++, to);
  }

  uint64_t now = nowMs();
  uint64_t streamStart = g_streamStartMs.load();
  uint64_t recordStart = g_recordStartMs.load();

  obj.Set("isStreaming", streaming);
  obj.Set("isRecording", recording);
  obj.Set("virtualCamActive", g_virtualCamOutput && obs_output_active(g_virtualCamOutput));
  obj.Set("replayActive", g_replayOutput && obs_output_active(g_replayOutput));
  obj.Set("totalBytes", (double)totalBytes);
  obj.Set("droppedFrames", droppedFrames);
  obj.Set("totalFrames", totalFrames);
  obj.Set("fps", obs_get_active_fps());
  obj.Set("streamDuration", streaming && streamStart ? (double)((now - streamStart) / 1000) : 0);
  obj.Set("recordDuration", recording && recordStart ? (double)((now - recordStart) / 1000) : 0);
  obj.Set("targets", targetsArr);
  return obj;
}

/** getAvailableEncoders() — returns list of encoder IDs that are loaded. */
Napi::Value GetAvailableEncoders(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  auto arr = Napi::Array::New(env);
  uint32_t idx = 0;
#ifdef HAVE_LIBOBS
  const char* id;
  for (size_t i = 0; obs_enum_encoder_types(i, &id); i++) {
    std::string name(id);
    // Only include H.264 video encoders.
    if (name.find("h264") != std::string::npos || name.find("nvenc") != std::string::npos ||
        name.find("qsv") != std::string::npos || name.find("amf") != std::string::npos ||
        name == "obs_x264") {
      arr.Set(idx++, Napi::String::New(env, id));
    }
  }
#endif
  return arr;
}

/** getActiveEncoder() — returns the currently active video encoder ID. */
Napi::Value GetActiveEncoder(const Napi::CallbackInfo& info) {
  auto env = info.Env();
#ifdef HAVE_LIBOBS
  if (!g_videoEncoderId.empty()) {
    return Napi::String::New(env, g_videoEncoderId);
  }
#endif
  return env.Null();
}

#else

Napi::Value CleanupOutput(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StartStream(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StopStream(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StartRecording(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StopRecording(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StartReplayBuffer(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value SaveReplay(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StopReplayBuffer(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StartVirtualCam(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value StopVirtualCam(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value GetOutputStats(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }
Napi::Value GetAvailableEncoders(const Napi::CallbackInfo& info) { return Napi::Array::New(info.Env()); }
Napi::Value GetActiveEncoder(const Napi::CallbackInfo& info) { return info.Env().Null(); }

#endif
