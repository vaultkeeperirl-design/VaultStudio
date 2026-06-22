const { spawn } = require('child_process');
const path = require('path');
const { execSync } = require('child_process');

// Kill any existing electron processes
try { execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' }); } catch {}

const electronPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

const child = spawn(electronPath, [__dirname], {
  stdio: 'ignore',
  detached: true,
  windowsHide: true,
});

child.unref();
console.log('VaultStudio started (PID: ' + child.pid + ')');
