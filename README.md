# VaultStudio

A standalone desktop streaming studio for Windows, macOS, and Linux.
VaultStudio has its own streaming engine built in — no external software or
plugins required.

## Install

1. Download the installer for your platform from the
   [latest release](https://github.com/vaultkeeperirl-design/VaultStudio/releases/latest):
   - **Windows** — `VaultStudio.Setup.1.5.1.exe`
   - **macOS** (Apple Silicon) — `VaultStudio-1.5.1-arm64.dmg`
   - **Linux** — `VaultStudio-1.5.1.AppImage` or `vaultstudio_1.5.1_amd64.deb`
2. Run the installer and follow the prompts.
3. Launch VaultStudio from your Start Menu / Launchpad / app launcher.

That's it. The installer includes everything VaultStudio needs to capture,
encode, and stream.

> **macOS note:** the current build targets Apple Silicon (M-series). An Intel
> build may be added later. The DMG is unsigned, so macOS Gatekeeper will ask
> you to approve the app on first launch (right-click → Open, or
> System Settings → Privacy & Security → Open Anyway).

> **Linux note:** AppImage users may need to allow execution:
> `chmod +x VaultStudio-1.5.1.AppImage`. The `.deb` installs a desktop entry
> automatically.

## What It Does

- **Scenes & sources** — camera, display/game/window capture, browser sources,
  media files, images, text, audio inputs/outputs, and IRL phone feeds via
  local RTMP ingest.
- **Multi-platform streaming** — send to Twitch, YouTube, Kick, and TikTok
  simultaneously with per-target stream keys and independent reconnect handling.
- **Unified chat** — one chat feed for all connected platforms, with send to
  all or a single platform, platform badges, and chat history.
- **Audio mixer** — per-source volume and mute control.
- **IRL ingest** — accept a phone RTMP feed over your LAN, watch bitrate, and
  auto-switch to a BRB scene when the signal drops, then recover automatically.
- **Stream guard** — monitors stream health and can switch scenes when bitrate
  degrades.
- **Recording & replay buffer** — record locally and save instant replay clips.
- **Virtual camera** — output the preview as a virtual webcam for other apps.
- **Pro licensing** — Free tier supports up to 3 stream targets and 3
  dashboard platforms. Lifetime Pro unlocks unlimited targets and platforms
  with an offline-signed license key — no server connection required after
  activation.
- **In-app updates** — VaultStudio checks for new releases and links straight
  to the download.

## Free vs Pro

| Feature | Free | Lifetime Pro |
| --- | --- | --- |
| Stream targets | 3 | Unlimited |
| Dashboard platforms | 3 | Unlimited |
| Scenes, sources, chat, recording | Included | Included |
| IRL ingest & stream guard | Included | Included |

Pro keys are issued via the VaultStudio website and verified offline using an
embedded RSA-2048 public key. Once activated, the key works without a network
connection.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `F1` | Start / stop streaming |
| `F2` | Start / stop recording |
| `Ctrl+S` | Open settings |
| `Esc` | Close dialogs |

## Releases & Changelog

See the [changelog](CHANGELOG.md) for version history.
Releases are built and smoke-tested on GitHub Actions for all three platforms
before publishing.

## Project Structure (for contributors)

```
electron/          Electron main process, IPC, and backend services
src/               React + Vite renderer (studio UI, chat, settings)
native/            Native streaming engine (C++ addon) + runtime assembly
scripts/           Build helpers, smoke tests, key generation
resources/         Default scene images (BRB, low-bitrate, starting-soon)
keys/              License key tooling (public key is safe to ship)
```

The native streaming engine runs in a child process, keeping the UI
responsive while encoding happens off the main thread.

## License

Proprietary. See `package.json` for details. The bundled streaming runtime
includes third-party components under GPL v2 and LGPL v2.1+. License texts
are included with the runtime in each installer.
