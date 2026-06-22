# Native GPU mirror + activity feed fixes

## Background

VaultStudio currently previews the stream by receiving JPEG snapshot frames from a child process (`vaultstudio-engine.exe`) that hosts the libobs addon. That child process also owns a native GPU preview viewport, but the viewport stays black because a flip-model D3D11 swapchain in a separate process is not composited by DWM over the Electron window.

The result is a laggy, low-FPS snapshot preview that is reported as "a minute behind and 12 FPS." The activity feed also shows duplicates and synthetic "New follower" entries without actual usernames.

## Goals

1. Replace the snapshot preview with a true native GPU mirror.
2. Eliminate duplicate activity events.
3. Make follower activity display accurate usernames when available, or a clear count delta when not.
4. Build and install a desktop installer for manual validation.

## Non-goals

- Keep a snapshot fallback. Per product direction, if the native viewport cannot paint we show a placeholder, not a low-FPS snapshot.
- Add real-time follow events for platforms that do not expose them (Twitch without EventSub). Those will continue to be reported as count deltas.

## Architecture

### Before

```
Electron renderer  <--IPC-->  Electron main  <--child_process IPC-->  vaultstudio-engine.exe  <--require-->  vaultstudio-obs.node
```

The preview frame flows as a JPEG Buffer through two IPC hops. The native viewport is disabled (`NATIVE_VIEWPORT_ENABLED = false`) because the D3D11 child HWND lives in the engine process.

### After

```
Electron renderer  <--IPC-->  Electron main  <--require-->  vaultstudio-obs.node
```

The addon is loaded directly in the Electron main process. The preview viewport's `WS_CHILD` window is parented to the Electron BrowserWindow HWND in the same process, so DWM presents the flip-model swapchain correctly. The snapshot code path is removed.

## Component changes

### `electron/services/obs-engine.ts`

- Remove worker-process spawn/IPC (`startWorker`, `stopWorker`, `call` over `worker.send`, crash restart logic).
- Load the addon once with `require(addonPath)` after prepending `runtimeDir/bin/64bit` to `process.env.PATH`.
- Register the addon event callback once with `addon.registerEventCallback(...)`; emit `event` and `previewFrame` events as today.
- Reimplement `call()` and `callWithTimeout()` as direct addon method invocations.
- Apply the bitrate-smoothing decorator from `stream-stats.js` inside `getOutputStats()` so output stats behavior is unchanged.

### `src/components/studio/PreviewPanel.tsx`

- Remove the snapshot fallback entirely: `Frame`, `VideoFrame`, `setPreviewFrame`, `schedulePreviewFrame`, JPEG/BMP URL handling, `STREAMING_PREVIEW_OPTIONS`, `IDLE_PREVIEW_OPTIONS`.
- Enable the native viewport unconditionally (`NATIVE_VIEWPORT_ENABLED = true`).
- Keep suspend/resume behavior for edit-layout, drawing canvas, overlays, and window transitions.
- Replace the blank preview placeholder with simple text states: "Starting preview…" / "Engine not running".

### `electron/services/platform-manager.ts`

- Add `seenActivityIds` set alongside `seenMessageIds`.
- In `wireConnector`, dedupe incoming activity events by `id` before emitting or persisting.
- In `detectNewFollowers`, change the synthetic event text to clearly indicate a follower-count delta (`+N followers`) rather than a named user.

### `src/stores/studioStore.ts`

- Add duplicate-ID guard to `addActivityEvent`, matching `addChatMessage`.

### `electron/services/stream-stats.js`

- Move decoration into `obs-engine.ts` so the addon-host no longer needs to apply it.

## Data flow

1. Main process boots; `obs-engine.ts` loads the addon and calls `initObs()`.
2. `PreviewPanel` mounts and calls `preview.startViewport(rect)` via preload.
3. `obs-ipc.ts` passes the Electron window HWND and client rect to `obsEngine.startPreviewViewport()`.
4. Addon C++ creates a `VaultStudioObsPreviewWindow` `WS_CHILD` HWND and an `obs_display` bound to it.
5. libobs render thread draws the main texture into the child window at the output frame rate.
6. When overlays need to sit on top (edit layout, drawing), `PreviewPanel` sets `suspendNativeViewport`, the viewport is destroyed, and recreated when the overlay closes.

## Error handling

- **Crash isolation loss:** libobs now runs in the main process. A native crash will exit the app. Calls to the addon are wrapped in `try/catch` where possible, and `shutdownObs()` is called during `before-quit`.
- **Shutdown ordering:** `app.on('before-quit')` invokes `obsEngine.shutdown()`, which calls `addon.shutdownObs()`. The existing 5-second force-kill safety net is kept.
- **PATH setup:** `process.env.PATH` is mutated once, before addon load, scoped to the main process.
- **No fallback:** If `startPreviewViewport` fails, the UI shows a placeholder explaining that the engine is not running or the viewport could not be created.

## Testing plan

1. `npm run typecheck`
2. `npm test`
3. Build installer with `npm run electron:build`
4. Install from the produced `.exe` and launch from the desktop shortcut.
5. Verify:
   - Preview shows a live, low-latency mirror.
   - Edit-layout/drawing toggles suspend and resume the viewport.
   - Activity feed does not duplicate events.
   - Follower events show real usernames from real-time events or a count delta from polling.

## Documentation

Add a comment in `PreviewPanel.tsx` and `obs-engine.ts` noting that the snapshot path was intentionally removed in favor of the native GPU viewport, and that the addon must remain in-process for DWM composition to work.
