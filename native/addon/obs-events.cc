/**
 * obs-events.cc — event bridge to JS.
 *
 * Events are emitted explicitly by the other modules via VsEmitEvent (scene
 * changes, output signals, replay saves). Safe to call from any thread —
 * delivery happens through a thread-safe function.
 */
#include <napi.h>
#include <string>

#ifdef HAVE_LIBOBS
#include "vs-common.h"

static Napi::ThreadSafeFunction g_eventTsfn = nullptr;

struct EventPayload {
  std::string name;
  std::string json;
};

void VsEmitEvent(const std::string& eventName, const std::string& jsonData) {
  if (!g_eventTsfn) return;
  auto* payload = new EventPayload{eventName, jsonData};
  napi_status status = g_eventTsfn.NonBlockingCall(payload,
    [](Napi::Env env, Napi::Function jsCallback, EventPayload* p) {
      jsCallback.Call({Napi::String::New(env, p->name), Napi::String::New(env, p->json)});
      delete p;
    });
  if (status != napi_ok) delete payload;
}

void VsReleaseEventCallback() {
  if (!g_eventTsfn) return;
  g_eventTsfn.Abort();
  g_eventTsfn = nullptr;
}

Napi::Value RegisterEventCallback(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  if (info.Length() > 0 && info[0].IsFunction()) {
    if (g_eventTsfn) {
      VsReleaseEventCallback();
    }
    g_eventTsfn = Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "EventCallback", 0, 1);
    return Napi::Boolean::New(env, true);
  }

  VsReleaseEventCallback();
  return Napi::Boolean::New(env, true);
}

#else

void VsEmitEvent(const std::string&, const std::string&) {}
void VsReleaseEventCallback() {}
Napi::Value RegisterEventCallback(const Napi::CallbackInfo& info) { return info.Env().Undefined(); }

#endif
