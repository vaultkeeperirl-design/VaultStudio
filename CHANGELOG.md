# Changelog

All notable VaultStudio changes should be recorded here before each installer build.

## [1.5.1] - 2026-06-22

### Added

- Added in-app update checks: VaultStudio now tells you when a newer version is available and links straight to the download.
- Added the VaultStudio logo to the in-app release notes.

### Changed

- Added explicit Windows/macOS/Linux packaging scripts, host-native installer smoke tests, and download slots.
- Added native VSS runtime assembly for GitHub Actions: Windows downloads the official portable OBS runtime, macOS extracts the official OBS DMG, and Linux assembles from host-native OBS/libobs packages before compiling the addon.
- Reworked the VSS engine source mappings so cameras, audio devices, display capture, plugin paths, and preview frames use platform-native OBS/libobs modules instead of Windows-only IDs.

## [1.5.0] - 2026-06-22

### Changed

- Reorganized all settings into a single Settings hub with a category sidebar - Stream, Destinations, Chat & Platforms, Reliability, Overlay, and License - so options are far easier to find.
- Merged the standalone Targets and Connections pages into the Settings hub; the studio top bar now shows a single Settings button (existing `/targets` and `/connections` links redirect to the matching section).

## [1.4.18] - 2026-06-22

### Added

- Added a Cloudflare Worker payments backend for PayPal checkout that issues Lifetime Pro keys through a serialized Durable Object allocator.
- Added tests covering packaged-license behavior, dashboard gating, full-width settings pages, and payments key issuance.

### Fixed

- Fixed persisted Lifetime Pro loading so signed keys survive installed-app restarts without trusting mutable stored payloads.
- Fixed deactivation so the installed app returns to Free cleanly after removing a Lifetime Pro key.
- Enforced the 3-target Free limit for stream targets and dashboard-enabled platforms, including OAuth-created platforms.
- Made Settings, Connections, and Targets pages use the full content width.
- Removed misleading BPAY/PayID-style website copy so checkout messaging only points users to PayPal.

## [1.4.17] - 2026-06-22

### Fixed

- Collapsed all-platform self echoes when a chat source is connected but not currently marked send-capable.
- Made `/clear` clear the local chat feed and saved history instead of sending `/clear` to platforms.
- Added a compact elapsed live-time pill to the top-right chat overlay header.

## [1.4.16] - 2026-06-22

### Fixed

- Collapsed delayed duplicate all-platform sent-message echoes even when live chat arrives between platform responses.
- Changed the rotating chat identity to show only the platform icon and username in the chat line.
- Reserved a fixed identity width so rotating between different username lengths does not shift the message text.

## [1.4.15] - 2026-06-22

### Added

- Added Settings access to the in-app changelog.
- Added a launch changelog popup with a `Don't show again for this version` checkbox.

### Fixed

- Combined duplicate all-platform sent-message echoes into one rotating `Platform - Username` identity row in chat.
- Kept the chat composer target selector as `Send to: All Platforms`, with the per-platform destination list in the tooltip.

## [1.4.14] - 2026-06-22

### Added

- Added this changelog so release notes can be tracked per version going forward.

### Fixed

- Restored the chat composer target selector so `Send to:` shows `All Platforms` when posting to every connected send target.
- Kept the all-platform target tooltip with the per-platform destination list.
- Fixed the chat composer so any send-capable connected platform can enable sending, not only Twitch.
- Removed the broken rotating target overlay that could crash `UnifiedChat` tests because it referenced an unimported animation helper.

## Historical Releases

These entries were reconstructed from installer artifacts, committed plans, and commit messages that existed before this changelog. Versions marked as "notes not recorded" had installers in `release/`, but no detailed release notes were preserved in the repo.

## [1.4.13] - 2026-06-22

- Packaged Windows installer: `release/VaultStudio Setup 1.4.13.exe`.
- Website release copy pointed to the 1.4.13 installer.
- Detailed notes were not recorded before the changelog existed.

## [1.4.12] - 2026-06-22

- Packaged Windows installer: `release/VaultStudio Setup 1.4.12.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.11] - 2026-06-22

- Packaged Windows installer: `release/VaultStudio Setup 1.4.11.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.10] - 2026-06-22

- Packaged Windows installer: `release/VaultStudio Setup 1.4.10.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.9] - 2026-06-22

- Packaged Windows installer: `release/VaultStudio Setup 1.4.9.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.8] - 2026-06-20

- Packaged Windows installer: `release/VaultStudio Setup 1.4.8.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.7] - 2026-06-18

- Packaged Windows installer: `release/VaultStudio Setup 1.4.7.exe`.
- Build logs show the signed bundled OBS runtime and `vaultstudio-engine.exe` were included in the package.
- Detailed notes were not recorded before the changelog existed.

## [1.4.6] - 2026-06-18

- Packaged Windows installer: `release/VaultStudio Setup 1.4.6.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.5] - 2026-06-17

- Packaged Windows installer: `release/VaultStudio Setup 1.4.5.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.4] - 2026-06-17

- Packaged Windows installer: `release/VaultStudio Setup 1.4.4.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.3] - 2026-06-16

- Packaged Windows installer: `release/VaultStudio Setup 1.4.3.exe`.
- Reconstructed from commits around this date: activity event deduping, follower count wording, native libobs loading in the Electron main process, native GPU mirror preview, and Edit Layout background fixes.

## [1.4.2] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.4.2.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.1] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.4.1.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.4.0] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.4.0.exe`.
- Start of the 1.4 installer line.
- Detailed notes were not recorded before the changelog existed.

## [1.3.9] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.3.9.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.8] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.3.8.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.7] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.3.7.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.6] - 2026-06-15

- Packaged Windows installer: `release/VaultStudio Setup 1.3.6.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.5] - 2026-06-14

- Packaged Windows installer: `release/VaultStudio Setup 1.3.5.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.4] - 2026-06-14

- Packaged Windows installer: `release/VaultStudio Setup 1.3.4.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.2] - 2026-06-14

- Packaged Windows installer: `release/VaultStudio Setup 1.3.2.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.1] - 2026-06-14

- Packaged Windows installer: `release/VaultStudio Setup 1.3.1.exe`.
- Detailed notes were not recorded before the changelog existed.

## [1.3.0] - 2026-06-13

- Packaged Windows installer: `release/VaultStudio Setup 1.3.0.exe`.
- Release plan targeted built-in phone RTMP ingest, BRB recovery, Pro licensing UX, free-tier wording, standalone Windows packaging, and website release copy.

## [1.0.0] - 2026-06-12

- First packaged Windows installer: `release/VaultStudio Setup 1.0.0.exe`.
- Reconstructed from commits around this date: Electron + React + Vite app shell, studio panels, unified chat, session stats, scenes/sources/audio UI, platform badges, bundled OBS groundwork, splash startup, and Pro key/free-tier foundations.

## [0.1.0] - 2026-06-11

- Initial development baseline in `package.json`.
- Scaffolded the Electron + React + Vite project and MVP studio UI from the design plan.
