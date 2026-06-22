#pragma once

#include <cstdlib>
#include <filesystem>
#include <string>

#ifdef _WIN32
#include <windows.h>
#endif

namespace vs {

inline std::wstring widen(const std::string& s) {
#ifdef _WIN32
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
  std::wstring w(n > 0 ? n - 1 : 0, 0);
  if (n > 0) MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &w[0], n);
  return w;
#else
  return std::wstring(s.begin(), s.end());
#endif
}

inline std::string narrow(const std::wstring& w) {
#ifdef _WIN32
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
  std::string s(n > 0 ? n - 1 : 0, 0);
  if (n > 0) WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, &s[0], n, nullptr, nullptr);
  return s;
#else
  return std::string(w.begin(), w.end());
#endif
}

inline std::filesystem::path pathFromUtf8(const std::string& s) {
#ifdef _WIN32
  return std::filesystem::path(widen(s));
#else
  return std::filesystem::path(s);
#endif
}

inline std::string pathToUtf8(const std::filesystem::path& p) {
#ifdef _WIN32
  return narrow(p.wstring());
#else
  return p.string();
#endif
}

inline std::string getenvString(const char* key) {
  const char* value = std::getenv(key);
  return value ? value : "";
}

inline std::string fallbackConfigDir() {
#ifdef _WIN32
  std::string base = getenvString("APPDATA");
  return base.empty() ? "VaultStudio/obs-config" : base + "\\VaultStudio\\obs-config";
#elif defined(__APPLE__)
  std::string home = getenvString("HOME");
  return home.empty() ? "VaultStudio/obs-config" : home + "/Library/Application Support/vaultstudio/obs-config";
#else
  std::string xdg = getenvString("XDG_CONFIG_HOME");
  if (!xdg.empty()) return xdg + "/vaultstudio/obs-config";
  std::string home = getenvString("HOME");
  return home.empty() ? "VaultStudio/obs-config" : home + "/.config/vaultstudio/obs-config";
#endif
}

inline std::filesystem::path obsStudioBasicDir() {
#ifdef _WIN32
  std::string base = getenvString("APPDATA");
  return pathFromUtf8(base).append("obs-studio").append("basic");
#elif defined(__APPLE__)
  std::string home = getenvString("HOME");
  return pathFromUtf8(home).append("Library").append("Application Support").append("obs-studio").append("basic");
#else
  std::string xdg = getenvString("XDG_CONFIG_HOME");
  std::filesystem::path base = xdg.empty()
    ? pathFromUtf8(getenvString("HOME")).append(".config")
    : pathFromUtf8(xdg);
  return base.append("obs-studio").append("basic");
#endif
}

inline const char* graphicsModule() {
#ifdef _WIN32
  return "libobs-d3d11";
#else
  return "libobs-opengl";
#endif
}

inline std::filesystem::path pluginBinaryDir(const std::string& runtimeDir) {
  auto runtime = pathFromUtf8(runtimeDir);
#ifdef _WIN32
  return runtime / "obs-plugins" / "64bit";
#elif defined(__APPLE__)
  return runtime / "plugins" / "%module%.plugin" / "Contents" / "MacOS";
#else
  return runtime / "lib" / "obs-plugins";
#endif
}

inline std::filesystem::path pluginDataPattern(const std::string& runtimeDir) {
  auto runtime = pathFromUtf8(runtimeDir);
#ifdef _WIN32
  return runtime / "data" / "obs-plugins" / "%module%";
#elif defined(__APPLE__)
  return runtime / "plugins" / "%module%.plugin" / "Contents" / "Resources";
#else
  return runtime / "share" / "obs" / "obs-plugins" / "%module%";
#endif
}

inline std::filesystem::path libobsDataDir(const std::string& runtimeDir) {
  auto runtime = pathFromUtf8(runtimeDir);
#ifdef _WIN32
  return runtime / "data" / "libobs";
#else
  return runtime / "share" / "obs" / "libobs";
#endif
}

inline const char* desktopAudioSourceId() {
#ifdef _WIN32
  return "wasapi_output_capture";
#elif defined(__APPLE__)
  return "coreaudio_output_capture";
#else
  return "pulse_output_capture";
#endif
}

inline const char* micAudioSourceId() {
#ifdef _WIN32
  return "wasapi_input_capture";
#elif defined(__APPLE__)
  return "coreaudio_input_capture";
#else
  return "pulse_input_capture";
#endif
}

inline const char* cameraSourceId() {
#ifdef _WIN32
  return "dshow_input";
#elif defined(__APPLE__)
  return "av_capture_input";
#else
  return "v4l2_input";
#endif
}

inline bool isCameraSourceId(const std::string& kind) {
  return kind == "dshow_input" || kind == "av_capture_input" || kind == "v4l2_input" ||
         kind == "pipewire-camera-source";
}

inline bool isVideoCaptureSourceId(const std::string& kind) {
  return isCameraSourceId(kind) || kind == "monitor_capture" || kind == "display_capture" ||
         kind == "screen_capture" || kind == "xshm_input" || kind == "xshm_input_v2" ||
         kind == "pipewire-screen-capture-source";
}

inline const char* cameraDeviceProperty() {
#ifdef _WIN32
  return "video_device_id";
#elif defined(__APPLE__)
  return "device";
#else
  return "device_id";
#endif
}

} // namespace vs
