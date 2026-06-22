@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1

echo === Generating obs.lib ===
dumpbin /exports "D:\VaultStudio\native\obs-deps\obs.dll" > "D:\VaultStudio\native\obs-deps\obs-exports.txt"
echo LIBRARY obs > "D:\VaultStudio\native\obs-deps\obs.def"
echo EXPORTS >> "D:\VaultStudio\native\obs-deps\obs.def"
for /f "skip=19 tokens=4" %a in (D:\VaultStudio\native\obs-deps\obs-exports.txt) do echo    %a >> "D:\VaultStudio\native\obs-deps\obs.def"
lib /def:"D:\VaultStudio\native\obs-deps\obs.def" /out:"D:\VaultStudio\native\obs-deps\obs.lib" /machine:x64

echo === Generating obs-frontend-api.lib ===
dumpbin /exports "D:\VaultStudio\native\obs-deps\obs-frontend-api.dll" > "D:\VaultStudio\native\obs-deps\obs-fe-exports.txt"
echo LIBRARY obs-frontend-api > "D:\VaultStudio\native\obs-deps\obs-fe.def"
echo EXPORTS >> "D:\VaultStudio\native\obs-deps\obs-fe.def"
for /f "skip=19 tokens=4" %a in (D:\VaultStudio\native\obs-deps\obs-fe-exports.txt) do echo    %a >> "D:\VaultStudio\native\obs-deps\obs-fe.def"
lib /def:"D:\VaultStudio\native\obs-deps\obs-fe.def" /out:"D:\VaultStudio\native\obs-deps\obs-frontend-api.lib" /machine:x64

echo === Done ===
dir "D:\VaultStudio\native\obs-deps\*.lib"
