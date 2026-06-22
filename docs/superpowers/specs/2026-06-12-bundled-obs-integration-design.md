# Bundled OBS Integration Design

**Date:** 2026-06-12
**Status:** Draft
**Author:** VaultStudio

## Overview

Replace the current "user must install OBS Studio separately" model with a fully bundled, managed OBS integration. VaultStudio ships OBS binaries, launches OBS as a hidden child process, and communicates via obs-websocket — all transparent to the user.

## Goals

- **No OBS download required** — OBS binaries ship inside VaultStudio (~250MB)
- **Eliminate OBS dependency** — users don't need to know OBS exists
- **Better UX** — splash screen covers boot time, no separate OBS window
- **Performance** — managed process lifecycle, crash recovery, clean shutdown
- **Custom features** — portable config, auto-generated credentials, isolated from system OBS

## Architecture

```
VaultStudio (Electron)
├── Splash Screen (logo + animated LEDs + version)
│   └── Fades when OBS connects
│
├── OBS Process Manager (obs-bundler.ts)
│   ├── Copies vendor/obs-studio → %APPDATA%/VaultStudio/obs-portable/
│   ├── Generates password → writes config.json
│   ├── Launches obs64.exe --portable --disable-shutdown-check
│   ├── Hides OBS window via ShowWindow(SW_HIDE)
│   ├── Monitors process — auto-restart on crash
│   └── Kills OBS on VaultStudio exit (if we launched it)
│
├── obs-websocket Client (unchanged)
│   ├── Connects to localhost:4455 with generated password
│   ├── All existing commands work as-is
│   └── Connection state → obs:status → renderer
│
└── Renderer
    ├── SplashScreen (while obsState !== 'connected')
    └── StudioPage (after connection)
```

## Section 1: Binary Bundling

Ship OBS Studio binaries in `vendor/obs-studio/` (~250MB). Folder structure mirrors a portable OBS install:

```
vendor/obs-studio/
  bin/64bit/obs64.exe
  obs-plugins/64bit/
  data/
```

On first launch, VaultStudio copies this to `%APPDATA%/VaultStudio/obs-portable/` with a `--portable` config. This keeps OBS isolated from any user-installed OBS. The obs-websocket plugin is pre-configured with an auto-generated password stored in VaultStudio's settings.

**Trade-off:** Adds ~250MB to install size. Users with existing OBS won't conflict since we use a separate portable profile.

## Section 2: Process Management

VaultStudio launches OBS as a child process with these flags:

```
obs64.exe --portable --disable-shutdown-check --startstreaming=false
```

Key changes from current behavior:

- **No registry/PATH lookup** — we always use our bundled binary
- **`--portable`** — OBS reads/writes config from its own folder, not `%APPDATA%/obs-studio`
- **`--disable-shutdown-check`** — suppresses the "are you streaming?" dialog on exit
- **Window hidden** — same PowerShell `ShowWindow(SW_HIDE)` technique, but we control the exact exe path
- **Lifecycle** — OBS starts when VaultStudio starts, shuts down when VaultStudio closes
- **Crash recovery** — if OBS crashes, auto-restart with the same portable config

**Trade-off:** OBS startup adds ~3-5 seconds to app launch. Splash screen covers this.

## Section 3: Splash Screen

A full-screen splash shows on app launch while OBS boots.

### Visual Design

- VaultStudio logo centered at ~200px
- 5 blue LED lights on the right arc of the logo circle animate sequentially
- Each light illuminates in order, creating a circular progress effect
- Below the logo: version info (e.g., `VaultStudio v0.1.0 — Starting engine…`)
- Animation cycles through the 5 lights repeatedly until OBS connects
- Splash fades out over 300ms when OBS reaches `connected` state

### Implementation

- `SplashScreen` component in `src/components/SplashScreen.tsx`
- CSS `@keyframes` with staggered delays for each LED
- Version read from `package.json` via Vite's `import.meta.env`
- Fades out when `obsState === 'connected'`

## Section 4: IPC Communication

Keep obs-websocket but configure it automatically:

- On first launch, generate a random 16-char password and write it to the portable OBS `config.json`
- VaultStudio reads this password and connects to `ws://127.0.0.1:4455`
- All existing obs-websocket commands work unchanged — no code rewrite needed
- Connection state broadcasts to renderer via existing `obs:status` channel

**Trade-off:** We still have WebSocket latency (~1-5ms), but this is acceptable for scene switching, source management, and streaming control. If needed later, we can add named pipes for high-frequency data (audio meters, preview frames).

## Files to Change/Add

| File | Action | Purpose |
|------|--------|---------|
| `electron/services/obs-bundler.ts` | NEW | Copies vendor OBS, generates config, manages process |
| `electron/main.ts` | MODIFY | Use bundler instead of `findObsExe()` |
| `src/components/SplashScreen.tsx` | NEW | Logo + LED animation + version |
| `src/App.tsx` | MODIFY | Show splash while OBS connects |
| `vendor/obs-studio/` | NEW | Bundled OBS binaries (gitignored, added to installer) |
| `.gitignore` | MODIFY | Add `vendor/obs-studio/` |
| `electron-builder.yml` | MODIFY | Include vendor folder in installer |

## Success Criteria

1. User installs VaultStudio — no OBS download step
2. App launches, shows splash with animated logo
3. OBS boots in background (~3-5s), splash fades
4. Studio UI appears fully functional
5. Closing VaultStudio cleanly shuts down OBS
6. If OBS crashes, it auto-restarts without user intervention

## Future Considerations

- **Named pipe IPC** — replace WebSocket for lower latency if needed
- **Shared memory preview** — zero-copy frame pipeline for realtime preview
- **OBS updates** — mechanism to update bundled OBS without full app reinstall
- **Linux/Mac support** — portable flag works cross-platform, but binary paths differ
