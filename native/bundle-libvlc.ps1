# Assembles a self-contained libVLC into native/obs-runtime/vlc so the
# recompiled vlc-video plugin (Playlist source) works without a system VLC
# install. Source is a local VLC 3.0.x install (libVLC core is LGPL v2.1+).
#
# Size trim: VLC's full plugin set is ~133 MB. We drop categories that a
# decode-to-OBS playlist never uses (GUI, visualisations, streaming output,
# muxers, service discovery, scripting). The decode path (codec/demux/access/
# audio/video/packetizer/misc) is kept intact.
param(
  [string]$VlcDir = 'C:\Program Files\VideoLAN\VLC'
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dest = Join-Path $root 'obs-runtime\vlc'
$sdkTmp = Join-Path $root '.vlc-sdk-tmp\extract\vlc-3.0.21'

if (-not (Test-Path (Join-Path $VlcDir 'libvlc.dll'))) { throw "libVLC not found in $VlcDir" }

# Plugin categories that are NOT needed to decode media to OBS frames.
$dropCategories = @(
  'gui', 'visualization', 'services_discovery', 'control',
  'lua', 'access_output', 'stream_out', 'mux', 'keystore', 'video_splitter'
)

if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force $dest | Out-Null
New-Item -ItemType Directory -Force (Join-Path $dest 'plugins') | Out-Null

# Core libVLC (LGPL).
Copy-Item (Join-Path $VlcDir 'libvlc.dll') $dest -Force
Copy-Item (Join-Path $VlcDir 'libvlccore.dll') $dest -Force

# Plugins, minus the dropped categories.
$srcPlugins = Join-Path $VlcDir 'plugins'
Get-ChildItem $srcPlugins -Directory | ForEach-Object {
  if ($dropCategories -notcontains $_.Name) {
    Copy-Item -Recurse $_.FullName (Join-Path $dest "plugins\$($_.Name)") -Force
  }
}

# License texts (LGPL/GPL) for redistribution. Prefer the SDK extract; fall
# back to a NOTICE pointing at the canonical source.
$copied = $false
foreach ($name in 'COPYING.LIB', 'COPYING') {
  $src = Join-Path $sdkTmp $name
  if (Test-Path $src) { Copy-Item $src (Join-Path $dest $name) -Force; $copied = $true }
}
if (-not $copied) {
  @(
    'libVLC and the VLC media player plugins bundled here are (c) the VideoLAN',
    'project. libVLC core is licensed under the GNU LGPL v2.1 or later; some',
    'plugins are under the GNU GPL v2 or later. Full license texts and the',
    'corresponding source are available at https://www.videolan.org/vlc/ and',
    'https://code.videolan.org/videolan/vlc (tag 3.0.21).'
  ) | Out-File -Encoding utf8 (Join-Path $dest 'VLC-LICENSE.txt')
}

$size = (Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum
$dlls = (Get-ChildItem (Join-Path $dest 'plugins') -Recurse -Filter *.dll).Count
Write-Host ("Bundled libVLC -> {0} ({1:N0} MB, {2} plugin dlls)" -f $dest, ($size / 1MB), $dlls)
(Get-Item (Join-Path $dest 'libvlc.dll')).VersionInfo.ProductVersion | ForEach-Object { Write-Host "libVLC version: $_" }
