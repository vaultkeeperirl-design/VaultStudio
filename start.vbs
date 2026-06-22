Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "D:\VaultStudio"
WshShell.Run "D:\VaultStudio\node_modules\electron\dist\electron.exe D:\VaultStudio\dist-electron\main.js", 1, False
