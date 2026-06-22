/**
 * vs-common.h — shared declarations between the addon's translation units.
 *
 * VaultStudio runs libobs standalone (no OBS Studio frontend), so anything
 * the frontend normally does — module loading, scene collection load/save,
 * current-scene tracking, output channels — is implemented here.
 */
#pragma once

#include <string>

#ifdef HAVE_LIBOBS
#include <obs.h>

// obs-events.cc — queue an event for the JS callback (safe from any thread).
void VsEmitEvent(const std::string& eventName, const std::string& jsonData = "{}");
void VsReleaseEventCallback();

// obs-scenes.cc — scene collection lifecycle (called from obs-core.cc).
bool VsLoadSceneCollection(const std::string& configDirUtf8);
void VsSaveSceneCollection();
void VsReleaseSceneCollection();
const std::string& VsGetCurrentSceneName();

// obs-audio.cc — release volmeters before obs_shutdown.
void VsReleaseVolmeters();

// obs-output.cc — stop and release all outputs/encoders before obs_shutdown.
void VsCleanupOutputs();

// obs-video.cc — detach the raw video callback before obs_shutdown.
void VsStopPreviewInternal();
#endif
