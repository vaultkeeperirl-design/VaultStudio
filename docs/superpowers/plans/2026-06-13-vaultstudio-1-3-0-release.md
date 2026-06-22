# VaultStudio 1.3.0 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish and verify the built-in phone RTMP ingest, Pro licensing UX, free-tier messaging, standalone Windows installer, and website release copy for VaultStudio 1.3.0.

**Architecture:** Keep the existing React/Vite/Electron app and bundled libobs runtime. IRL ingest remains an Electron main-process NodeMediaServer service exposed through preload IPC; the renderer should make the phone-feed source setup a first-class studio action. The website should link only to the actual installer produced by the packaging step.

**Tech Stack:** React 19, Vite 8, Electron 40, Vitest, styled-components, node-media-server, electron-builder NSIS.

---

### Task 1: IRL Source Flow and BRB Recovery

**Files:**
- Modify: `electron/services/irl-ingest.ts`
- Modify: `src/components/studio/SourcesPanel.tsx`
- Modify: `src/pages/StudioPage.tsx`
- Test: `electron/services/irl-ingest.test.ts`
- Test: `src/__tests__/components/SourcesPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Add an IRL service test proving that BRB recovery retries without losing the previous live scene when the first switch-back fails, and that disabling auto-switch-back leaves the scene in BRB. Extend the SourcesPanel test to prove a one-click IRL phone-feed source emits `onAddSource('media', { name: 'IRL Phone Feed', file: ingestUrl })`.

- [ ] **Step 2: Verify red**

Run:

```powershell
npm test -- electron/services/irl-ingest.test.ts src/__tests__/components/SourcesPanel.test.tsx
```

Expected: FAIL because `irl-ingest.test.ts` does not exist yet and SourcesPanel has no IRL quick-add action.

- [ ] **Step 3: Implement minimal passing behavior**

Expose the current IRL ingest URL in `StudioPage`, pass it to `SourcesPanel`, render an `IRL Phone Feed` quick-add action when available, and update `irl-ingest.ts` so failed switch-back attempts keep `previousScene` for the next healthy poll. Avoid requiring a separate OBS app or any manual RTMP relay.

- [ ] **Step 4: Verify green**

Run the same targeted tests and keep them passing before moving on.

### Task 2: Pro Licensing and Free-Tier Limits

**Files:**
- Modify: `electron/ipc/targets-ipc.ts`
- Modify: `electron/ipc/platform-ipc.ts`
- Modify: `src/components/ProKeyPanel.tsx`
- Modify: `src/pages/TargetsPage.tsx`
- Modify: `src/pages/ConnectionsPage.tsx`
- Test: `src/__tests__/components/ProKeyPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Add ProKeyPanel tests covering copy for "3 stream targets" on Free and "Lifetime Pro" for the purchase path.

- [ ] **Step 2: Verify red**

Run:

```powershell
npm test -- src/__tests__/components/ProKeyPanel.test.tsx
```

Expected: FAIL before the UX copy is adjusted and test hooks are present.

- [ ] **Step 3: Implement minimal passing behavior**

Make app copy consistently say Free includes 3 stream targets and 3 dashboard platforms, while Lifetime Pro is a one-time purchase with unlimited stream targets and dashboard platforms. Ensure free-tier target errors count total configured targets, not only enabled targets, and use the same wording across Targets and Connections.

- [ ] **Step 4: Verify green**

Run the ProKeyPanel test and the existing target/connection-adjacent tests that compile with the app.

### Task 3: Version, Installer, Standalone Launch, Website

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `Vault Streaming Studio website/index.html`
- Modify: `Vault Streaming Studio website/README.md`

- [ ] **Step 1: Bump version**

Use npm version metadata only:

```powershell
npm version 1.3.0 --no-git-tag-version
```

- [ ] **Step 2: Full verification before packaging**

Run:

```powershell
npm run typecheck
npm test
npm run build
npm run build:native
```

- [ ] **Step 3: Build the installer**

Run:

```powershell
npm run electron:build
```

Expected artifact: `release/VaultStudio Setup 1.3.0.exe`.

- [ ] **Step 4: Smoke-launch the packaged app**

Launch the unpacked executable from `release/win-unpacked/VaultStudio.exe`, confirm the app reaches the studio with the bundled engine, and confirm no external `obs64.exe` process is required. Verify a local RTMP publish to the IRL ingest server using a phone-compatible RTMP client path such as FFmpeg, then confirm the app status changes to publishing and the media source can be added without OBS Studio.

- [ ] **Step 5: Update website copy to the real artifact**

After the installer exists, update website links and release copy to `../release/VaultStudio%20Setup%201.3.0.exe`, show the filename `VaultStudio Setup 1.3.0.exe`, and describe Free as 3 targets and Lifetime Pro as unlimited targets.

- [ ] **Step 6: Website verification**

Run the website through Vite and verify its build or local preview has no broken local download references.
