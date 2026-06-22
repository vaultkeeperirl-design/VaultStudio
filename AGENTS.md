# VaultStudio — Agent & Build Guide

This file is for AI agents, CI, and contributors who need to build, test, or
release VaultStudio. End-user documentation is in `README.md`.

## Local Development

```powershell
npm ci
npm run typecheck
npm test
npm run dev
```

The Windows native runtime is assembled with:

```powershell
powershell -ExecutionPolicy Bypass -File native\prepare-obs-runtime.ps1
npm run build:native
```

If `npm run build:native` fails locally because `cmake-js` cannot detect Visual
C++, compile the generated project directly with MSBuild:

```powershell
& 'C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe' native\addon\build-v1\vaultstudio-obs.vcxproj /p:Configuration=Release /p:Platform=x64 /m
```

## Architecture

- **Renderer** (`src/`) — React 19 + Vite + styled-components + zustand.
  Studio panels, unified chat, settings hub, chat popout.
- **Main process** (`electron/`) — Electron 40. IPC handlers route UI calls to
  backend services.
- **Native engine** (`native/addon/`) — C++ N-API addon wrapping libobs.
  Runs in a child process (`vaultstudio-engine`) via `obs-worker-host.js` so
  encoding never blocks the UI thread.
- **Runtime assembly** (`native/prepare-obs-runtime.*`) — Downloads official
  OBS Studio builds and extracts the libobs runtime + plugins + data into
  `native/obs-runtime` (Windows) or `native/vss-runtime/{darwin,linux}`.
- **License system** (`electron/services/license-service.ts` + `keys/`) —
  RSA-2048 signed offline keys. Public key is embedded in source. Private key
  (`keys/private.pem`) is gitignored and never shipped.

## Release Builds

Use host-native builds only — do not cross-compile:

- Windows: `npm run electron:build:win`
- macOS: `npm run electron:build:mac` on macOS
- Linux: `npm run electron:build:linux` on Linux

All build scripts pass `--publish never` to electron-builder. Release
publishing is handled by the GitHub Actions workflow via
`softprops/action-gh-release`.

### GitHub Actions Workflow

`.github/workflows/platform-installers.yml` — triggered by tag pushes (`v*`)
or `workflow_dispatch`. Runs on `windows-latest`, `ubuntu-24.04`, and
`macos-14` in parallel (`fail-fast: false`).

Per-platform steps:
1. Install platform dependencies (VLC on Windows, OBS + libobs-dev on Linux,
   SIMDE on macOS ARM64).
2. `npm ci` + `cd native/addon && npm ci` (node-addon-api headers).
3. Prepare VSS runtime (download + extract official OBS build).
4. Build native addon (`cmake-js`).
5. Typecheck + unit tests.
6. Build installer (`electron-builder`).
7. Smoke test the packaged app (`scripts/smoke-packaged-app.mjs`).
8. Upload artifacts + publish to GitHub Release (tagged builds only).

### Creating a Release

```powershell
git tag v1.5.1
git push origin v1.5.1
```

The workflow builds all three platforms, smoke-tests each, and attaches
installers to the GitHub release tagged `v1.5.1`.

Do not publish website download links for macOS or Linux until the matching
GitHub Actions job passes and its installer has been produced by that job.

## CI Environment Notes

- **Windows** — VLC is installed via `choco install vlc` so the libVLC bundle
  can be assembled. If VLC is missing, bundling is skipped with a warning and
  the Playlist source requires a system VLC install at runtime.
- **macOS** — SIMDE is installed via Homebrew for SSE2 emulation on Apple
  Silicon. The CMakeLists.txt searches `/opt/homebrew/include` and
  `/usr/local/include` for the `simde/` headers. OBS 32+ distributes data
  directly in `Contents/Resources/` instead of `Contents/Resources/data/` —
  the prepare script handles both layouts.
- **Linux** — `obs-studio` and `libobs-dev` are installed via apt. The smoke
  test passes `--no-sandbox` because the GitHub runner does not allow the
  Chrome SUID sandbox.

## Verification (pre-release checklist)

```powershell
npm run typecheck
npm test
node scripts/assert-native-runtime.mjs --platform=win32
npm run electron:build:win
node scripts/smoke-packaged-app.mjs --platform=win32 --timeout-ms=90000
```

macOS and Linux verification must happen on their native GitHub Actions runners
or real machines, not Docker.

## License Keys

- Key format: `VS-PRO-XXXX-XXXX-XXXX-XXXX` (Pro) or `VS-FREE-...` (Free).
- Keys are signed with `keys/private.pem` (RSA-2048, SHA-256) over the bare
  key string. The signature is appended as `key.signature` to form `fullKey`.
- The app verifies keys offline using the embedded public key in
  `electron/services/license-service.ts`.
- Generate a batch: `node scripts/generate-pro-keys.mjs 100 keys/pro-pool.json`
- Never commit `keys/private.pem`, `keys/pro-pool.json`, or
  `keys/giveaway-keys.json` — all are gitignored.
- To rotate the signing key pair: regenerate `private.pem` + `public.pem`,
  update `PUBLIC_KEY_PEM` in `license-service.ts`, and regenerate all keys.

## Security

- Stream keys and OAuth tokens are encrypted at rest using Electron
  `safeStorage` (OS-level DPAPI on Windows, Keychain on macOS, libsecret on
  Linux).
- No secrets, API keys, or private keys are committed to the repo. The
  `.gitignore` excludes `.env`, `.env.local`, `keys/private.pem`,
  `keys/pro-pool.json`, and `keys/giveaway-keys.json`.
- The PayPal client ID in `payments-worker/wrangler.toml` is public by design
  (it is embedded in the website frontend). Actual secrets (PAYPAL_SECRET,
  RESEND_API_KEY, etc.) are set via `wrangler secret put` and never touch the
  repo. Note: `payments-worker/` is excluded from the public repo.

## Excluded From Public Repo

The following directories are gitignored and not in the public repo:
- `payments-worker/` — Cloudflare Worker backend (has personal email + config)
- `Vault Streaming Studio website/` — marketing site
- `docs/superpowers/` — internal planning/spec docs
