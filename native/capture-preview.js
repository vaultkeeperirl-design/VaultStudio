// Standalone verification: spawn the installed VaultStudio engine host, init
// libobs against the user's scene collection, start the BMP preview, save the
// first frame to disk, exit. Lets us confirm the snapshot preview renders real
// (non-black) video without driving the Electron UI.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const installDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'vaultstudio', 'resources');
const runtimeDir = path.join(installDir, 'obs-runtime');
const addonPath = path.join(installDir, 'obs-addon', 'vaultstudio-obs.node');
const hostScript = path.join(installDir, 'obs-addon', 'obs-addon-host.js');
const engineExe = path.join(runtimeDir, 'bin', '64bit', 'vaultstudio-engine.exe');
const configDir = path.join(process.env.APPDATA, 'vaultstudio', 'obs-config');
const outBmp = path.join(os.tmpdir(), 'vs-preview-capture.bmp');

for (const [n, p] of Object.entries({ engineExe, hostScript, addonPath, runtimeDir, configDir })) {
  if (!fs.existsSync(p)) { console.log('MISSING ' + n + ': ' + p); process.exit(2); }
}

const child = spawn(engineExe, [hostScript], {
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  serialization: 'advanced',
  windowsHide: true,
  env: { ...process.env, VS_ADDON_PATH: addonPath, VS_RUNTIME_DIR: runtimeDir },
});

let inited = false;
let done = false;
const finish = (msg, code) => {
  if (done) return;
  done = true;
  console.log(msg);
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(code), 300);
};

child.stderr.on('data', () => {});
child.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  if ((m.type === 'host:ready' || m.type === 'addon:loaded') && !inited) {
    inited = true;
    child.send({ id: 1, method: 'initObs', args: [{
      runtimeDir, configDir, baseWidth: 1920, baseHeight: 1080,
      outputWidth: 1920, outputHeight: 1080, fps: 30,
    }] });
  } else if (m.id === 1) {
    if (m.error) return finish('initObs FAILED: ' + m.error, 1);
    child.send({ id: 2, method: 'startPreview', args: [{ width: 854, height: 480, fps: 24 }] });
  } else if (m.type === 'previewFrame' && m.data) {
    // Keep the latest frame; sources (dshow camera, display capture) take a few
    // seconds to start delivering, so the first frames are black. Save the
    // frame captured after a warmup window.
    latest = { buf: Buffer.isBuffer(m.data) ? m.data : Buffer.from(m.data), w: m.width, h: m.height };
    frameCount++;
    if (!warmupTimer) {
      warmupTimer = setTimeout(() => {
        if (latest) {
          fs.writeFileSync(outBmp, latest.buf);
          finish('FRAME SAVED ' + outBmp + ' frames=' + frameCount + ' (' + latest.w + 'x' + latest.h + ')', 0);
        } else finish('no frames', 5);
      }, 9000);
    }
  }
});
let latest = null, frameCount = 0, warmupTimer = null;
child.on('exit', (c) => finish('engine exited early code=' + c, 3));
setTimeout(() => finish('TIMEOUT waiting for preview frame', 4), 30000);
