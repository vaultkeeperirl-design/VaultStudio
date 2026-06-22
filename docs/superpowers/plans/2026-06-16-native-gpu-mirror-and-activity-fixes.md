# Native GPU mirror + activity feed fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the libobs addon into the Electron main process, remove the snapshot preview fallback, enable the native GPU mirror, and fix activity-feed duplicate/follower-name bugs.

**Architecture:** Load `vaultstudio-obs.node` directly in `electron/services/obs-engine.ts` so the D3D11 preview child HWND shares a process with the Electron UI. Strip the JPEG snapshot path from `PreviewPanel.tsx` and enable the native viewport unconditionally. Add duplicate-ID guards to activity events in both the platform manager and the studio store, and reword polled follower deltas to show counts instead of fake usernames.

**Tech Stack:** Electron, TypeScript, React, styled-components, N-API/libobs, electron-builder.

---

## File map

- `src/stores/studioStore.ts` — renderer state; add activity dedupe.
- `electron/services/platform-manager.ts` — main-process chat/stats; add activity dedupe and reword follower deltas.
- `electron/services/obs-engine.ts` — main-process OBS bridge; replace worker IPC with in-process addon calls.
- `src/components/studio/PreviewPanel.tsx` — renderer preview UI; remove snapshot, enable native viewport.
- `src/__tests__/components/PreviewPanel.test.tsx` — update/remove snapshot tests.
- `src/__tests__/stores/studioStore.test.ts` — add activity dedupe test.
- `electron/services/platform-manager.test.ts` — add activity dedupe test (create if missing).

---

### Task 1: Add activity duplicate guard in the store

**Files:**
- Modify: `src/stores/studioStore.ts:121-126`
- Test: `src/__tests__/stores/studioStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it('does not add duplicate activity events by id', () => {
  const { result } = renderHook(() => useStudioStore());
  const event = {
    id: 'evt-dup',
    platform: 'kick' as const,
    type: 'follow' as const,
    username: 'user1',
    timestamp: Date.now(),
  };
  act(() => result.current.addActivityEvent(event));
  act(() => result.current.addActivityEvent(event));
  expect(result.current.activityEvents).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/stores/studioStore.test.ts`
Expected: FAIL — activityEvents length is 2.

- [ ] **Step 3: Add duplicate guard**

Replace the existing `addActivityEvent` implementation in `src/stores/studioStore.ts` with:

```typescript
  addActivityEvent: (event) =>
    set((state) => {
      if (state.activityEvents.some((e) => e.id === event.id)) return state;
      return { activityEvents: [...state.activityEvents.slice(-99), event] };
    }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/stores/studioStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/studioStore.ts src/__tests__/stores/studioStore.test.ts
git commit -m "fix: dedupe activity events by id in studio store"
```

---

### Task 2: Dedupe activity events in the platform manager

**Files:**
- Modify: `electron/services/platform-manager.ts:149-153` and `338-343`
- Test: `electron/services/platform-manager.test.ts` (create if missing)

- [ ] **Step 1: Add a seen-activity-ids set**

In `electron/services/platform-manager.ts`, add `private seenActivityIds = new Set<string>();` next to `private seenMessageIds = new Set<string>();` around line 151.

- [ ] **Step 2: Add an activity dedupe helper**

Add a private method after `trackId`:

```typescript
  private trackActivityId(id: string) {
    this.seenActivityIds.add(id);
    if (this.seenActivityIds.size > ACTIVITY_BUFFER_MAX * 4) {
      const keep = new Set(this.activityBuffer.map((e) => e.id));
      this.seenActivityIds = keep;
      this.seenActivityIds.add(id);
    }
  }
```

- [ ] **Step 3: Dedupe in wireConnector**

Replace the `connector.on('activity', ...)` block in `wireConnector` (around line 338) with:

```typescript
    connector.on('activity', (evt: BufferedMessage) => {
      if (this.seenActivityIds.has(evt.id)) return;
      this.trackActivityId(evt.id);
      this.activityBuffer.push(evt);
      if (this.activityBuffer.length > ACTIVITY_BUFFER_MAX) this.activityBuffer.shift();
      this.historyDirty = true;
      this.emit('activity:event', evt);
    });
```

- [ ] **Step 4: Write a test for activity dedupe**

Create or update `electron/services/platform-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { platformManager } from './platform-manager';

describe('platformManager activity dedupe', () => {
  beforeEach(() => {
    platformManager.removeAllListeners();
  });
  afterEach(() => {
    platformManager.removeAllListeners();
    platformManager.stop();
  });

  it('does not emit the same activity event id twice', () => {
    const handler = vi.fn();
    platformManager.on('activity:event', handler);
    const fakeConnector = new (require('events').EventEmitter)();
    // @ts-expect-error private method
    platformManager.wireConnector(fakeConnector);
    const evt = { id: 'act-1', platform: 'kick', type: 'follow', username: 'u', timestamp: Date.now() };
    fakeConnector.emit('activity', evt);
    fakeConnector.emit('activity', evt);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run electron/services/platform-manager.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/platform-manager.ts electron/services/platform-manager.test.ts
git commit -m "fix: dedupe activity events in platform manager"
```

---

### Task 3: Reword polled follower delta events

**Files:**
- Modify: `electron/services/platform-manager.ts:427-444`

- [ ] **Step 1: Update detectNewFollowers**

Replace the event construction with:

```typescript
  private detectNewFollowers(key: string, platform: string, followers?: number) {
    if (typeof followers !== 'number' || !Number.isFinite(followers)) return;
    const prev = this.lastStats.get(key)?.followers;
    if (typeof prev !== 'number' || followers <= prev) return;
    const gained = followers - prev;
    const evt: BufferedMessage = {
      id: `${platform}-followdelta-${Date.now()}`,
      platform,
      type: 'follow',
      username: gained === 1 ? '+1 follower' : `+${gained} followers`,
      message: 'from stats poll',
      timestamp: Date.now(),
    };
    if (this.seenActivityIds.has(evt.id)) return;
    this.trackActivityId(evt.id);
    this.activityBuffer.push(evt);
    if (this.activityBuffer.length > ACTIVITY_BUFFER_MAX) this.activityBuffer.shift();
    this.historyDirty = true;
    this.emit('activity:event', evt);
  }
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run electron/services/platform-manager.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/services/platform-manager.ts
git commit -m "fix: reword polled follower deltas to show counts"
```

---

### Task 4: Load the libobs addon in the Electron main process

**Files:**
- Modify: `electron/services/obs-engine.ts`
- Create: `electron/services/obs-addon-types.ts` (optional, for addon typing)

- [ ] **Step 1: Add the stream-stats decorator to obs-engine.ts**

At the top of `electron/services/obs-engine.ts`, import the decorator:

```typescript
import { createStatsDecorator } from './stream-stats';
```

Then add a decorator instance:

```typescript
const decorateStats = createStatsDecorator();
```

- [ ] **Step 2: Add an addon loader with PATH setup**

After the class declaration begins, add a private addon property and loader. Insert near the other private fields (around line 140):

```typescript
  private addon: any = null;

  private loadAddon() {
    if (this.addon) return this.addon;
    const runtimeBin = path.join(this.getRuntimeDir(), 'bin', '64bit');
    process.env.PATH = runtimeBin + ';' + (process.env.PATH || '');
    const addonPath = this.getAddonPath();
    this.log(`loading addon in-process: ${addonPath}`);
    this.addon = require(addonPath);
    this.addon.registerEventCallback((eventName: string, jsonData: string) => {
      let data = {};
      try {
        data = JSON.parse(jsonData || '{}');
      } catch {
        /* tolerate malformed payloads */
      }
      this.handleEvent(eventName, data);
    });
    return this.addon;
  }
```

- [ ] **Step 3: Replace worker spawn with addon initialization**

Rewrite `startWorker()` to simply load the addon and return its readiness:

```typescript
  startWorker(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const addon = this.loadAddon();
        this.available = true;
        this.workerReady = true;
        resolve(true);
      } catch (e) {
        this.log(`failed to load addon: ${(e as Error).message}`);
        this.available = false;
        this.workerReady = false;
        resolve(false);
      }
    });
  }
```

- [ ] **Step 4: Replace worker-based call with direct addon calls**

Replace `private call<T>` (around line 311) with:

```typescript
  private call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const addon = this.loadAddon();
      if (!addon || !this.workerReady) {
        reject(new Error('OBS engine not running'));
        return;
      }
      try {
        const fn = addon[method];
        if (typeof fn !== 'function') {
          reject(new Error(`Unknown addon method: ${method}`));
          return;
        }
        const result = fn.apply(addon, args);
        resolve(result as T);
      } catch (e) {
        reject(e as Error);
      }
    });
  }
```

Replace `private callWithTimeout<T>` (around line 323) with:

```typescript
  private callWithTimeout<T = unknown>(timeoutMs: number, method: string, ...args: unknown[]): Promise<T> {
    return Promise.race([
      this.call<T>(method, ...args),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${method} timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }
```

- [ ] **Step 5: Update shutdown and stats**

In `shutdown()`, remove references to `this.worker`. The method should remain:

```typescript
  shutdown(): void {
    if (!this.workerReady) return;
    this.intentionalStop = true;
    this.stopMeterPolling();
    this.call('shutdownObs').catch(() => {});
    this.initialized = false;
    this.emit('status', 'disconnected');
  }
```

In `stopWorker()`, clear addon state:

```typescript
  stopWorker(): void {
    this.intentionalStop = true;
    this.shutdown();
    this.workerReady = false;
    this.available = false;
    this.initialized = false;
    this.addon = null;
    this.stopMeterPolling();
  }
```

In `getOutputStats()` (around line 757), wrap the raw addon result with the decorator:

```typescript
  async getOutputStats(): Promise<OutputStatsRaw> {
    const defaults: OutputStatsRaw = { ... };
    try {
      const raw = await this.call<Partial<OutputStatsRaw>>('getOutputStats');
      return { ...defaults, ...decorateStats(raw), targets: (raw.targets as TargetStats[]) || [] };
    } catch {
      return defaults;
    }
  }
```

- [ ] **Step 6: Update preview methods to use direct addon callback**

The addon's `startPreview` takes a JS callback. Update `startPreview` in `obs-engine.ts`:

```typescript
  async startPreview(options: Partial<typeof DEFAULT_PREVIEW_OPTIONS> = {}): Promise<void> {
    this.previewSubscribers++;
    if (this.previewSubscribers === 1) {
      const previewOptions = {
        width: options.width || DEFAULT_PREVIEW_OPTIONS.width,
        height: options.height || DEFAULT_PREVIEW_OPTIONS.height,
        fps: options.fps || DEFAULT_PREVIEW_OPTIONS.fps,
      };
      const addon = this.loadAddon();
      await new Promise<void>((resolve, reject) => {
        try {
          addon.startPreview((frame: { width: number; height: number; data: Buffer }) => {
            if (frame?.data) {
              this.emit('previewFrame', {
                mime: 'image/jpeg',
                width: frame.width,
                height: frame.height,
                data: Buffer.from(frame.data),
              });
            }
          }, previewOptions);
          resolve();
        } catch (e) {
          this.previewSubscribers = 0;
          reject(e);
        }
      });
    }
  }
```

Note: `stopPreview` remains a direct `this.call('stopPreview')`.

- [ ] **Step 7: Remove worker-specific code**

Delete or comment out the `private worker: ChildProcess | null = null;` field, the worker spawn block in the original `startWorker`, and all `this.worker` references. Keep `workerReady` and `available` semantics so existing consumers are unchanged.

- [ ] **Step 8: Run typecheck and tests**

Run: `npm run typecheck`
Expected: No errors.

Run: `npx vitest run`
Expected: Existing tests pass (or known failures only).

- [ ] **Step 9: Commit**

```bash
git add electron/services/obs-engine.ts
git commit -m "feat: load libobs addon in Electron main process"
```

---

### Task 5: Remove snapshot fallback and enable native viewport

**Files:**
- Modify: `src/components/studio/PreviewPanel.tsx`
- Test: `src/__tests__/components/PreviewPanel.test.tsx`

- [ ] **Step 1: Enable native viewport**

Change `const NATIVE_VIEWPORT_ENABLED = false;` to:

```typescript
// Snapshot preview is intentionally removed. The native GPU viewport requires
// the libobs addon to run in-process with the Electron UI so DWM can composite
// its D3D11 child window. See docs/superpowers/specs/2026-06-16-native-gpu-mirror-and-activity-fixes.md
const NATIVE_VIEWPORT_ENABLED = true;
```

- [ ] **Step 2: Remove snapshot state and helpers**

Delete these state items and their refs from `PreviewPanel`:
- `const [hasFrame, setHasFrame] = useState(false);`
- `const [realtime, setRealtime] = useState(false);`
- `const videoRef = useRef<HTMLVideoElement>(null);`
- `const frameElementRef = useRef<HTMLImageElement | null>(null);`
- `const frameUrlRef = useRef<string | null>(null);`
- `const frameSrcRef = useRef<string | null>(null);`
- `const hasFrameRef = useRef(false);`
- `const pendingFrameRef = useRef<PreviewFramePayload | null>(null);`
- `const scheduledFrameRef = useRef<number | null>(null);`

Also remove the `PreviewFramePayload` type alias if it is no longer used.

- [ ] **Step 3: Delete snapshot helper functions**

Remove:
- `markFrameVisible`
- `clearPreviewFrame`
- `setFrameSrc`
- `setPreviewFrame`
- `attachFrameElement`
- `schedulePreviewFrame`

- [ ] **Step 4: Remove realtime video effect**

Delete the entire `useEffect` that starts around line 581 ("Realtime path: attach to the virtual camera as a live video device").

- [ ] **Step 5: Simplify snapshot subscription effect**

Replace the snapshot fallback `useEffect` (around line 648) with an effect that only manages the native viewport lifecycle. The existing native viewport effect (lines 499-578) should remain and now runs unconditionally when `NATIVE_VIEWPORT_ENABLED` is true. Remove the separate snapshot effect entirely.

- [ ] **Step 6: Simplify render output**

In the JSX (around line 1012), replace the viewport surface content with:

```tsx
      <ViewportSurface ref={containerRef}>
        {!showNativeViewport && obsState === 'connected' && (
          <Placeholder><span>Starting preview…</span></Placeholder>
        )}
        {!showNativeViewport && obsState !== 'connected' && (
          <Placeholder>
            <span>Streaming engine is not running</span>
            {onLaunchObs && <LaunchButton onClick={onLaunchObs}>Start Engine</LaunchButton>}
          </Placeholder>
        )}
        {obsState === 'connected' && editLayout && sources.length > 0 && (
          <EditorLayer ...>...</EditorLayer>
        )}
        <DrawingCanvas ... />
      </ViewportSurface>
```

Delete `VideoFrame` and `Frame` usage, and remove the `showVideo` and `showFrame` derived booleans.

- [ ] **Step 7: Remove unused styled components**

Delete the `Frame` and `VideoFrame` styled components if they are no longer referenced.

- [ ] **Step 8: Update tests**

Open `src/__tests__/components/PreviewPanel.test.tsx`. Remove or rewrite any assertions that check for an `<img>` preview frame. Update to assert the placeholder text appears when disconnected and the edit layer appears when edit layout is active.

- [ ] **Step 9: Run typecheck and tests**

Run: `npm run typecheck`
Expected: No errors.

Run: `npx vitest run src/__tests__/components/PreviewPanel.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/studio/PreviewPanel.tsx src/__tests__/components/PreviewPanel.test.tsx
git commit -m "feat: remove snapshot preview, enable native GPU mirror"
```

---

### Task 6: Update main.ts wiring if needed

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Verify obs-engine start/shutdown calls are intact**

Open `electron/main.ts`. Ensure:

```typescript
obsEngine.startWorker().then((ok) => {
  if (ok) {
    obsEngine.init().then((initialized) => {
      if (initialized) {
        broadcast('obs:status', 'connected');
      }
    });
  } else {
    broadcast('obs:status', 'disconnected');
  }
});
```

and

```typescript
electron_1.app.on('before-quit', () => {
  ...
  obsEngine.shutdown();
});
```

remain. The new in-process addon works with these existing calls.

- [ ] **Step 2: Commit if any changes**

If no changes are needed, skip this commit.

---

### Task 7: Build the installer

**Files:**
- Build output: `dist/`, `dist-electron/`, `release/`

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: TypeScript compilation and Vite build succeed.

- [ ] **Step 2: Build the installer**

Run: `npm run electron:build`
Expected: electron-builder produces an installer `.exe` in `release/`.

- [ ] **Step 3: Locate the installer**

Run: `Get-ChildItem -Path release -Filter *.exe`
Expected: One installer file is listed.

- [ ] **Step 4: Install silently for the current user**

Run the installer with a silent flag, for example:

```powershell
& "release\VaultStudio Setup 1.4.3.exe" /S /D=$env:LOCALAPPDATA\Programs\VaultStudio
```

Adjust the filename to match the actual installer name. If `/S` is unsupported, run the installer normally and proceed through the wizard.

- [ ] **Step 5: Verify desktop shortcut**

After installation, confirm the desktop shortcut exists:

```powershell
Test-Path -Path "$env:USERPROFILE\Desktop\VaultStudio.lnk"
```

Expected: `True`.

- [ ] **Step 6: Launch from desktop shortcut**

Double-click the desktop shortcut or run:

```powershell
& "$env:USERPROFILE\Desktop\VaultStudio.lnk"
```

Verify the app launches and the preview panel shows the native GPU mirror.

---

## Self-review

- **Spec coverage:**
  - Move addon in-process → Task 4.
  - Remove snapshot fallback → Task 5.
  - Enable native viewport → Task 5.
  - Activity dedupe → Tasks 1 and 2.
  - Follower delta rewording → Task 3.
  - Build/installer → Task 7.
- **Placeholder scan:** No TBD/TODO/fill-in details.
- **Type consistency:** `workerReady` and `available` flags remain; `call`/`callWithTimeout` signatures unchanged; addon method names match `addon.cc` exports.
