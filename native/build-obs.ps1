$ErrorActionPreference = "Stop"

$obsSrcDir = "$PSScriptRoot\..\vendor\obs-studio"
$buildDir = "$PSScriptRoot\build-obs"
$distDir = "$PSScriptRoot\dist"
$vcvarsPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"

if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

Write-Host "Configuring and building OBS Studio..."
cmd /c "`"$vcvarsPath`" x64 && cmake -S `"$obsSrcDir`" -B `"$buildDir`" -G `"Visual Studio 17 2022`" -A x64 -DCMAKE_INSTALL_PREFIX=`"$distDir`" -DOBS_VERSION_OVERRIDE=`"30.0.0`" -DCMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION=`"10.0.22621.0`" -DENABLE_UI=OFF -DENABLE_BROWSER=OFF -DENABLE_SCRIPTING=OFF -DBUILD_BROWSER=OFF -DBUILD_CAPTIONS=OFF -DENABLE_WAYLAND=OFF -DENABLE_PIPEWIRE=OFF && cmake --build `"$buildDir`" --config Release --target libobs && cmake --build `"$buildDir`" --config Release --target obs-frontend-api && cmake --install `"$buildDir`" --config Release"

Write-Host "Done. Libraries built at $distDir"
