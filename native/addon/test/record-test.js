/* Records ~6s to a temp file to validate the full encode pipeline. */
const path = require('path');
const fs = require('fs');
const os = require('os');
const ADDON_DIR = path.join(__dirname, '..', 'build', 'Release');
const RUNTIME_DIR = path.join(__dirname, '..', '..', 'obs-runtime');
const CONFIG_DIR = path.join(process.env.APPDATA, 'VaultStudio', 'obs-config');
process.env.PATH = path.join(RUNTIME_DIR, 'bin', '64bit') + ';' + (process.env.PATH || '');

const log = (...a) => fs.writeSync(1, a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');

const addon = require(path.join(ADDON_DIR, 'vaultstudio-obs.node'));
addon.registerEventCallback((name, json) => log(`EVENT ${name} ${json}`));
addon.initObs({ runtimeDir: RUNTIME_DIR, configDir: CONFIG_DIR, fps: 60 });
log('init ok');

const outFile = path.join(os.tmpdir(), `vaultstudio-record-test-${Date.now()}.mkv`);
log('recording to', outFile);
try {
  const ok = addon.startRecording({ path: outFile });
  log('startRecording:', ok);
} catch (e) {
  log('startRecording FAILED:', e.message);
  process.exit(1);
}

setTimeout(() => {
  log('stats during record:', JSON.stringify(addon.getOutputStats()));
  addon.stopRecording();
  setTimeout(() => {
    const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : -1;
    log(`RESULT file size: ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`);
    log('stats after stop:', JSON.stringify(addon.getOutputStats()));
    // Also validate stream failure path with an unreachable local RTMP target.
    try {
      const started = addon.startStream(
        [{ id: 't1', name: 'LocalTest', server: 'rtmp://127.0.0.1:59999/live', key: 'x' }],
        { videoBitrateKbps: 2500, encoder: 'auto' }
      );
      log('startStream (unreachable):', started);
    } catch (e) {
      log('startStream threw (acceptable):', e.message);
    }
    setTimeout(() => {
      log('stream stats:', JSON.stringify(addon.getOutputStats()));
      addon.stopStream();
      setTimeout(() => {
        fs.unlinkSync(outFile);
        log('DONE');
        process.exit(0);
      }, 1500);
    }, 5000);
  }, 1500);
}, 6000);
