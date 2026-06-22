#include <napi.h>

// Core (obs-core.cc)
Napi::Value InitObs(const Napi::CallbackInfo& info);
Napi::Value ShutdownObs(const Napi::CallbackInfo& info);
Napi::Value IsObsInitialized(const Napi::CallbackInfo& info);
Napi::Value GetProfiles(const Napi::CallbackInfo& info);
Napi::Value SetProfile(const Napi::CallbackInfo& info);
Napi::Value SetVideoSettings(const Napi::CallbackInfo& info);
Napi::Value GetVideoSettings(const Napi::CallbackInfo& info);

// Scenes & sources (obs-scenes.cc)
Napi::Value GetScenes(const Napi::CallbackInfo& info);
Napi::Value CreateScene(const Napi::CallbackInfo& info);
Napi::Value RemoveScene(const Napi::CallbackInfo& info);
Napi::Value SetCurrentScene(const Napi::CallbackInfo& info);
Napi::Value RenameScene(const Napi::CallbackInfo& info);
Napi::Value DuplicateScene(const Napi::CallbackInfo& info);
Napi::Value SaveSceneCollection(const Napi::CallbackInfo& info);
Napi::Value GetSceneSources(const Napi::CallbackInfo& info);
Napi::Value CreateSource(const Napi::CallbackInfo& info);
Napi::Value RemoveSource(const Napi::CallbackInfo& info);
Napi::Value SetSourceVisible(const Napi::CallbackInfo& info);
Napi::Value SetSourceOrder(const Napi::CallbackInfo& info);
Napi::Value SetSourceIndex(const Napi::CallbackInfo& info);
Napi::Value SetSceneIndex(const Napi::CallbackInfo& info);
Napi::Value SetSourceLocked(const Napi::CallbackInfo& info);
Napi::Value SetSourceTransform(const Napi::CallbackInfo& info);
Napi::Value RenameSource(const Napi::CallbackInfo& info);
Napi::Value UpdateSourceSettings(const Napi::CallbackInfo& info);
Napi::Value GetSourceSettings(const Napi::CallbackInfo& info);
Napi::Value ListSourceDevices(const Napi::CallbackInfo& info);

// Output (obs-output.cc)
Napi::Value StartStream(const Napi::CallbackInfo& info);
Napi::Value StopStream(const Napi::CallbackInfo& info);
Napi::Value StartRecording(const Napi::CallbackInfo& info);
Napi::Value StopRecording(const Napi::CallbackInfo& info);
Napi::Value StartReplayBuffer(const Napi::CallbackInfo& info);
Napi::Value SaveReplay(const Napi::CallbackInfo& info);
Napi::Value StopReplayBuffer(const Napi::CallbackInfo& info);
Napi::Value StartVirtualCam(const Napi::CallbackInfo& info);
Napi::Value StopVirtualCam(const Napi::CallbackInfo& info);
Napi::Value GetOutputStats(const Napi::CallbackInfo& info);
Napi::Value GetAvailableEncoders(const Napi::CallbackInfo& info);
Napi::Value GetActiveEncoder(const Napi::CallbackInfo& info);
Napi::Value CleanupOutput(const Napi::CallbackInfo& info);

// Audio (obs-audio.cc)
Napi::Value GetAudioSources(const Napi::CallbackInfo& info);
Napi::Value GetAudioLevels(const Napi::CallbackInfo& info);
Napi::Value SetVolume(const Napi::CallbackInfo& info);
Napi::Value SetMuted(const Napi::CallbackInfo& info);

// Preview (obs-video.cc)
Napi::Value StartPreview(const Napi::CallbackInfo& info);
Napi::Value StopPreview(const Napi::CallbackInfo& info);

// Events (obs-events.cc)
Napi::Value RegisterEventCallback(const Napi::CallbackInfo& info);

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initObs", Napi::Function::New(env, InitObs));
  exports.Set("shutdownObs", Napi::Function::New(env, ShutdownObs));
  exports.Set("isObsInitialized", Napi::Function::New(env, IsObsInitialized));
  exports.Set("getProfiles", Napi::Function::New(env, GetProfiles));
  exports.Set("setProfile", Napi::Function::New(env, SetProfile));
  exports.Set("setVideoSettings", Napi::Function::New(env, SetVideoSettings));
  exports.Set("getVideoSettings", Napi::Function::New(env, GetVideoSettings));

  exports.Set("getScenes", Napi::Function::New(env, GetScenes));
  exports.Set("createScene", Napi::Function::New(env, CreateScene));
  exports.Set("removeScene", Napi::Function::New(env, RemoveScene));
  exports.Set("setCurrentScene", Napi::Function::New(env, SetCurrentScene));
  exports.Set("renameScene", Napi::Function::New(env, RenameScene));
  exports.Set("duplicateScene", Napi::Function::New(env, DuplicateScene));
  exports.Set("saveSceneCollection", Napi::Function::New(env, SaveSceneCollection));
  exports.Set("getSceneSources", Napi::Function::New(env, GetSceneSources));
  exports.Set("createSource", Napi::Function::New(env, CreateSource));
  exports.Set("removeSource", Napi::Function::New(env, RemoveSource));
  exports.Set("setSourceVisible", Napi::Function::New(env, SetSourceVisible));
  exports.Set("setSourceOrder", Napi::Function::New(env, SetSourceOrder));
  exports.Set("setSourceIndex", Napi::Function::New(env, SetSourceIndex));
  exports.Set("setSceneIndex", Napi::Function::New(env, SetSceneIndex));
  exports.Set("setSourceLocked", Napi::Function::New(env, SetSourceLocked));
  exports.Set("setSourceTransform", Napi::Function::New(env, SetSourceTransform));
  exports.Set("renameSource", Napi::Function::New(env, RenameSource));
  exports.Set("updateSourceSettings", Napi::Function::New(env, UpdateSourceSettings));
  exports.Set("getSourceSettings", Napi::Function::New(env, GetSourceSettings));
  exports.Set("listSourceDevices", Napi::Function::New(env, ListSourceDevices));

  exports.Set("startStream", Napi::Function::New(env, StartStream));
  exports.Set("stopStream", Napi::Function::New(env, StopStream));
  exports.Set("startRecording", Napi::Function::New(env, StartRecording));
  exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
  exports.Set("startReplayBuffer", Napi::Function::New(env, StartReplayBuffer));
  exports.Set("saveReplay", Napi::Function::New(env, SaveReplay));
  exports.Set("stopReplayBuffer", Napi::Function::New(env, StopReplayBuffer));
  exports.Set("startVirtualCam", Napi::Function::New(env, StartVirtualCam));
  exports.Set("stopVirtualCam", Napi::Function::New(env, StopVirtualCam));
  exports.Set("getOutputStats", Napi::Function::New(env, GetOutputStats));
  exports.Set("getAvailableEncoders", Napi::Function::New(env, GetAvailableEncoders));
  exports.Set("getActiveEncoder", Napi::Function::New(env, GetActiveEncoder));
  exports.Set("cleanupOutput", Napi::Function::New(env, CleanupOutput));

  exports.Set("getAudioSources", Napi::Function::New(env, GetAudioSources));
  exports.Set("getAudioLevels", Napi::Function::New(env, GetAudioLevels));
  exports.Set("setVolume", Napi::Function::New(env, SetVolume));
  exports.Set("setMuted", Napi::Function::New(env, SetMuted));

  exports.Set("startPreview", Napi::Function::New(env, StartPreview));
  exports.Set("stopPreview", Napi::Function::New(env, StopPreview));

  exports.Set("registerEventCallback", Napi::Function::New(env, RegisterEventCallback));

  return exports;
}

NODE_API_MODULE(vaultstudio_obs, Init)
