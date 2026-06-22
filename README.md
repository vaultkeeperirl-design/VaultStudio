# VaultStudio

VaultStudio is a standalone desktop streaming studio for Windows, macOS, and
Linux. It embeds a native VSS runtime built on libobs, so users do not need to
launch OBS Studio beside it.

## What It Includes

- Native scene/source/audio/recording/stream control through a N-API addon.
- Unified chat and activity surfaces for supported streaming platforms.
- Free tier limits with Lifetime Pro license activation.
- In-app release notes and update messaging.
- A sales/download website in `Vault Streaming Studio website/`.
- A Cloudflare Worker payments backend in `payments-worker/`.

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

## Release Builds

Use host-native builds only:

- Windows: `npm run electron:build:win`
- macOS: `npm run electron:build:mac` on macOS
- Linux: `npm run electron:build:linux` on Linux

The GitHub Actions workflow at `.github/workflows/platform-installers.yml`
prepares the native runtime, compiles the addon, builds the installer/package,
launches the packaged app with `--smoke-test`, uploads artifacts, and publishes
tagged release assets.

Create a release by pushing a tag such as:

```powershell
git tag v1.5.1
git push origin v1.5.1
```

Do not publish website download links for macOS or Linux until the matching
GitHub Actions job passes and its installer has been produced by that job.

## Website

The static site lives in `Vault Streaming Studio website/`. Update download
links to point at GitHub Release assets after the workflow passes. Keep unpaid
or unavailable platform buttons marked as coming soon rather than linking to
unverified builds.

## Payments And Licenses

The payment worker lives in `payments-worker/`. Lifetime Pro keys must be
issued by the server-side allocator only. Do not commit private keys, generated
key pools, `.env`, `.env.local`, or live provider secrets.

The app validates signed keys locally and persists only the activated license
state. Server-side issuance must remain serialized so two buyers cannot receive
the same key.

## Verification

Required before a public release:

```powershell
npm run typecheck
npm test
node scripts/assert-native-runtime.mjs --platform=win32
npm run electron:build:win
node scripts/smoke-packaged-app.mjs --platform=win32 --timeout-ms=90000
```

macOS and Linux verification must happen on their native GitHub Actions runners
or real machines, not Docker.
