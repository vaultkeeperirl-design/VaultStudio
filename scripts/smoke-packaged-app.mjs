#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const platformArg = args.find((arg) => arg.startsWith('--platform='));
const platform = platformArg ? platformArg.split('=')[1] : process.platform;
const timeoutMs = Number(args.find((arg) => arg.startsWith('--timeout-ms='))?.split('=')[1] || 60000);

function candidatesForPlatform() {
  if (platform === 'win32') {
    return [
      path.join(root, 'release', 'win-unpacked', 'VaultStudio.exe'),
      path.join(root, 'release', 'win-unpacked', 'vaultstudio.exe'),
    ];
  }
  if (platform === 'darwin') {
    return [
      path.join(root, 'release', 'mac', 'VaultStudio.app', 'Contents', 'MacOS', 'VaultStudio'),
      path.join(root, 'release', 'mac-arm64', 'VaultStudio.app', 'Contents', 'MacOS', 'VaultStudio'),
    ];
  }
  if (platform === 'linux') {
    return [
      path.join(root, 'release', 'linux-unpacked', 'vaultstudio'),
      path.join(root, 'release', 'linux-unpacked', 'VaultStudio'),
    ];
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

const executable = candidatesForPlatform().find((candidate) => fs.existsSync(candidate));
if (!executable) {
  console.error(`[smoke-runner] Packaged executable not found for ${platform}. Checked:`);
  for (const candidate of candidatesForPlatform()) console.error(`  - ${candidate}`);
  process.exit(1);
}

const userDataDir = path.join(root, '.smoke-user-data', platform);
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });

console.log(`[smoke-runner] Launching ${executable}`);
const child = spawn(executable, ['--smoke-test'], {
  cwd: path.dirname(executable),
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    VAULTSTUDIO_SMOKE_TEST: '1',
    VAULTSTUDIO_USER_DATA_DIR: userDataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let settled = false;
const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  console.error(`[smoke-runner] Timed out after ${timeoutMs}ms`);
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 2000).unref();
  process.exit(1);
}, timeoutMs);

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

child.on('error', (error) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  console.error(`[smoke-runner] Failed to launch packaged app: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (code === 0) {
    console.log('[smoke-runner] Packaged app smoke passed');
    process.exit(0);
  }
  console.error(`[smoke-runner] Packaged app smoke failed: code=${code} signal=${signal || ''}`);
  process.exit(code || 1);
});
