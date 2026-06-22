# Assembles the bundled OBS runtime for VaultStudio from the official OBS Studio
# portable zip. The result (native/obs-runtime) ships with the app via
# electron-builder extraResources — end users do NOT need OBS Studio installed.
#
# Usage: powershell -ExecutionPolicy Bypass -File native\prepare-obs-runtime.ps1 [-ZipPath <path>]

param(
  [string]$ZipPath = "$PSScriptRoot\obs-runtime-32.1.2.zip",
  [string]$OutDir = "$PSScriptRoot\obs-runtime",
  [string]$Version = "32.1.2"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ZipPath)) {
  $url = "https://github.com/obsproject/obs-studio/releases/download/$Version/OBS-Studio-$Version-Windows-x64.zip"
  Write-Host "Downloading $url ..."
  Invoke-WebRequest -Uri $url -OutFile $ZipPath
}

# Plugins that require the OBS Studio frontend/Qt or external hardware/software.
# Excluding them keeps the runtime lean and avoids load errors in headless libobs.
$ExcludedPlugins = @(
  'frontend-tools',      # Qt frontend only
  'obs-websocket',       # replaced by our native IPC
  'decklink',            # Blackmagic hardware
  'decklink-captions',
  'decklink-ouput-ui',
  'decklink-output-ui',
  'win-decklink',
  'aja',                 # AJA hardware
  'aja-output-ui',
  'obs-vst'              # Qt editor window
)
# vlc-video (VLC Video Source) IS bundled — it powers the Playlist source. The
# plugin loads libVLC from a system VLC install at runtime (same requirement as
# OBS Studio); when VLC isn't installed the module simply fails to load and the
# Playlist source is unavailable, harming nothing else.

# Frontend-only binaries we don't ship (libobs never loads these).
$ExcludedBinPatterns = @(
  'obs64.exe', 'obs64.pdb',
  'Qt6*.dll',
  'obs-scripting.dll', 'lua51.dll', 'lua51.pdb',
  '*.pdb'
)
$ExcludedBinDirs = @('platforms', 'styles', 'iconengines', 'imageformats', 'networkinformation', 'tls', 'generic')

if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
$staging = "$env:TEMP\vaultstudio-obs-staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }

Write-Host "Extracting $ZipPath ..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $staging)

New-Item -ItemType Directory -Force "$OutDir\bin\64bit" | Out-Null
New-Item -ItemType Directory -Force "$OutDir\obs-plugins\64bit" | Out-Null
New-Item -ItemType Directory -Force "$OutDir\data" | Out-Null

# bin/64bit — libobs core + codec DLLs, minus frontend-only files
Get-ChildItem "$staging\bin\64bit" -File | ForEach-Object {
  $f = $_
  $excluded = $false
  foreach ($pat in $ExcludedBinPatterns) { if ($f.Name -like $pat) { $excluded = $true; break } }
  if (-not $excluded) { Copy-Item $f.FullName "$OutDir\bin\64bit\" }
}

# obs-plugins/64bit — all plugin DLLs and support files except excluded plugins
Get-ChildItem "$staging\obs-plugins\64bit" | ForEach-Object {
  $f = $_
  $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  if ($ExcludedPlugins -notcontains $base) {
    Copy-Item -Recurse $f.FullName "$OutDir\obs-plugins\64bit\$($f.Name)"
  }
}

# data — libobs effects + per-plugin data (minus excluded plugins)
Copy-Item -Recurse "$staging\data\libobs" "$OutDir\data\libobs"
New-Item -ItemType Directory -Force "$OutDir\data\obs-plugins" | Out-Null
Get-ChildItem "$staging\data\obs-plugins" -Directory | ForEach-Object {
  if ($ExcludedPlugins -notcontains $_.Name) {
    Copy-Item -Recurse $_.FullName "$OutDir\data\obs-plugins\$($_.Name)"
  }
}

Remove-Item -Recurse -Force $staging

# The engine host runs as a child process loading the addon. It must live in
# bin\64bit so libobs plugins can find their helper executables
# (obs-nvenc-test.exe, etc.) next to the running executable, and so obs.dll
# resolves without PATH games. We ship a copy of Node.js as the host.
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($nodeExe) {
  Copy-Item $nodeExe "$OutDir\bin\64bit\vaultstudio-engine.exe"
  Write-Host "Engine host: $nodeExe -> bin\64bit\vaultstudio-engine.exe"
} else {
  Write-Warning "node.exe not found on PATH — engine host not bundled"
}

# VaultStudio: replace the stock vlc-video plugin with our recompiled build
# (native\build-vlc-plugin.ps1) that loads the bundled libVLC instead of a
# system VLC install + HKLM registry key, then assemble that libVLC bundle
# (native\bundle-libvlc.ps1 -> $OutDir\vlc). Without this, the Playlist source
# only works on machines with VLC installed.
$prebuiltVlc = "$PSScriptRoot\vlc-plugin\prebuilt\vlc-video.dll"
if (Test-Path $prebuiltVlc) {
  Copy-Item $prebuiltVlc "$OutDir\obs-plugins\64bit\vlc-video.dll" -Force
  Write-Host "vlc-video: installed recompiled plugin (bundled-libVLC loader)"
} else {
  Write-Warning "vlc-plugin\prebuilt\vlc-video.dll missing - run native\build-vlc-plugin.ps1; Playlist source will require a system VLC install"
}
$vlcDir = 'C:\Program Files\VideoLAN\VLC'
if (Test-Path (Join-Path $vlcDir 'libvlc.dll')) {
  & "$PSScriptRoot\bundle-libvlc.ps1" -VlcDir $vlcDir
} else {
  Write-Warning "VLC not installed at $vlcDir — skipping libVLC bundling. Playlist source will require a system VLC install."
}

$size = (Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("Runtime ready at {0} ({1:N0} MB)" -f $OutDir, ($size / 1MB))
(Get-Item "$OutDir\bin\64bit\obs.dll").VersionInfo.ProductVersion | ForEach-Object { Write-Host "libobs version: $_" }
