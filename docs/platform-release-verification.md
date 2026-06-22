# Platform Release Verification

VaultStudio must not publish a platform installer until that platform has a
passing host-native packaged-app smoke test.

## What Counts As Verified

For each platform:

1. The native VSS runtime for that OS is present in the expected package path.
2. The native addon is compiled on that OS.
3. The installer/package is built on that OS.
4. The packaged executable is launched with `--smoke-test`.
5. The renderer loads.
6. The bundled VSS engine starts and initializes libobs.
7. Release artifacts are uploaded only after the smoke test exits with code 0.

The workflow at `.github/workflows/platform-installers.yml` enforces this.

## Platform Runtime Paths

- Windows: `native/obs-runtime`, engine at `native/obs-runtime/bin/64bit/vaultstudio-engine.exe`.
- Linux: `native/vss-runtime/linux`, engine at `native/vss-runtime/linux/bin/vaultstudio-engine`.
- macOS: `native/vss-runtime/darwin`, engine at `native/vss-runtime/darwin/bin/vaultstudio-engine`.

All platforms copy `native/addon/build-v1/Release/vaultstudio-obs.node` into
`resources/obs-addon/vaultstudio-obs.node`.

## No Docker For Release Validation

Do not use Docker for release validation on this machine. Linux can be verified
on a Linux VM or GitHub Actions Ubuntu runner. macOS must be verified on a Mac
or GitHub Actions macOS runner because Electron mac packaging and signing are
host-native.

## Current Native Port Status

Windows is verified locally through the installed packaged app. macOS and Linux
must be verified by their host-native GitHub Actions jobs because Windows cannot
compile or launch those packaged apps correctly.

The platform workflow now assembles a native runtime before packaging:

- Windows downloads and trims the official portable OBS Studio zip.
- macOS downloads the official OBS Studio DMG and extracts Frameworks, plugin
  bundles, data files, and a Node-based `vaultstudio-engine`.
- Linux installs host-native OBS/libobs packages on Ubuntu and packages the
  libobs runtime, plugins, data files, and a Node-based `vaultstudio-engine`.

Before enabling website download links for macOS or Linux, run the platform
workflow and use only the uploaded artifacts from passing jobs.
