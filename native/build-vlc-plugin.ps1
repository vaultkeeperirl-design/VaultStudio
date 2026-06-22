# Recompiles the OBS "vlc-video" plugin so it loads libVLC from the bundled
# runtime (<VS_RUNTIME_DIR>\vlc) instead of requiring a system VLC install +
# HKLM registry key. Output replaces obs-runtime\obs-plugins\64bit\vlc-video.dll.
#
# Prereqers: VS 2022 (cl/lib/dumpbin), cmake, native/obs-deps (obs.lib + headers),
# native/vlc-deps/include (libVLC SDK headers), runtime bin\64bit\w32-pthreads.dll.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$plugin = Join-Path $root 'vlc-plugin'
$runtimeBin = Join-Path $root 'obs-runtime\bin\64bit'

$vsInstall = & 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe' -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = Join-Path $vsInstall 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw "vcvars64.bat not found at $vcvars" }

function Invoke-VsCmd([string]$cmd) {
  $full = '"' + $vcvars + '" >nul 2>&1 && ' + $cmd
  & cmd /c $full
  if ($LASTEXITCODE -ne 0) { throw "command failed ($LASTEXITCODE): $cmd" }
}

# --- 1. w32-pthreads import lib from the bundled DLL ---
$libOut = Join-Path $plugin 'w32-pthreads.lib'
if (-not (Test-Path $libOut)) {
  Write-Host 'Generating w32-pthreads import lib...'
  $dll = Join-Path $runtimeBin 'w32-pthreads.dll'
  if (-not (Test-Path $dll)) { throw "w32-pthreads.dll not found at $dll" }
  $exports = Join-Path $plugin 'pthreads-exports.txt'
  Invoke-VsCmd ('dumpbin /exports "' + $dll + '" > "' + $exports + '"')
  $names = @()
  $inTable = $false
  foreach ($l in Get-Content $exports) {
    if ($l -match '^\s+ordinal\s+hint\s+RVA\s+name') { $inTable = $true; continue }
    if ($inTable) {
      if ($l -match '^\s+\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+(\S+)') { $names += $Matches[1] }
      elseif ($l.Trim() -eq '' -and $names.Count -gt 0) { break }
    }
  }
  if ($names.Count -lt 10) { throw "parsed too few pthread exports ($($names.Count))" }
  $def = Join-Path $plugin 'w32-pthreads.def'
  ('EXPORTS' + "`n" + ($names -join "`n")) | Out-File -Encoding ascii $def
  Invoke-VsCmd ('lib /nologo /def:"' + $def + '" /machine:x64 /out:"' + $libOut + '"')
  Write-Host ("  exported {0} symbols" -f $names.Count)
}

# --- 2. configure + build the plugin ---
$build = Join-Path $plugin 'build'
Invoke-VsCmd ('cmake -S "' + $plugin + '" -B "' + $build + '" -G Ninja -DCMAKE_BUILD_TYPE=Release')
Invoke-VsCmd ('cmake --build "' + $build + '" --config Release')

$dllOut = Join-Path $build 'vlc-video.dll'
if (-not (Test-Path $dllOut)) { throw "build produced no vlc-video.dll" }

# --- 3. install into the runtime ---
$dest = Join-Path $root 'obs-runtime\obs-plugins\64bit\vlc-video.dll'
Copy-Item $dllOut $dest -Force
Write-Host ("Installed recompiled vlc-video.dll -> {0} ({1:N0} KB)" -f $dest, ((Get-Item $dest).Length / 1KB))
