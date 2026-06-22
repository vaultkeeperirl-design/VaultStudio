/**
 * obs-addon-host.js — runs inside the bundled engine host process
 * (vaultstudio-engine on Unix, vaultstudio-engine.exe on Windows).
 *
 * Loads the native libobs addon and bridges calls from the Electron main
 * process over child-process IPC (advanced serialization — Buffers pass as
 * binary, no base64 overhead).
 */
const path = require('path');
const fs = require('fs');
const { createStatsDecorator } = require('./stream-stats');

// The addon path and runtime dir are provided by the parent via env.
const ADDON_PATH = process.env.VS_ADDON_PATH;
const RUNTIME_DIR = process.env.VS_RUNTIME_DIR;
const RUNTIME_BIN = process.env.VS_RUNTIME_BIN;

function prependEnvPath(key, value) {
  if (!value) return;
  process.env[key] = value + path.delimiter + (process.env[key] || '');
}

function existingRuntimeDirs() {
  if (!RUNTIME_DIR) return [];
  const candidates = [
    RUNTIME_BIN,
    process.platform === 'win32' ? path.join(RUNTIME_DIR, 'bin', '64bit') : path.join(RUNTIME_DIR, 'bin'),
    path.join(RUNTIME_DIR, 'lib'),
    path.join(RUNTIME_DIR, 'Frameworks'),
  ];
  return [...new Set(candidates.filter(Boolean))].filter((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  });
}

for (const dir of existingRuntimeDirs()) {
  prependEnvPath('PATH', dir);
  if (process.platform === 'darwin') {
    prependEnvPath('DYLD_LIBRARY_PATH', dir);
  } else if (process.platform !== 'win32') {
    prependEnvPath('LD_LIBRARY_PATH', dir);
  }
}

let addon = null;
try {
  addon = require(ADDON_PATH);
  process.send({ type: 'addon:loaded' });
} catch (e) {
  process.send({ type: 'addon:error', error: e.message });
  process.exit(1);
}

// Forward native events (registered once, survives for process lifetime).
addon.registerEventCallback((eventName, jsonData) => {
  let data = {};
  try {
    data = JSON.parse(jsonData || '{}');
  } catch {
    /* tolerate malformed payloads */
  }
  process.send({ type: 'event', eventName, data });
});

// --- CPU usage of this process (where encoding happens) ---
let lastCpu = process.cpuUsage();
let lastCpuAt = Date.now();
const cpuCount = Math.max(1, require('os').cpus().length);
function cpuPercent() {
  const now = Date.now();
  const usage = process.cpuUsage();
  const elapsedMs = now - lastCpuAt;
  let pct = 0;
  if (elapsedMs > 0) {
    const usedMs = (usage.user - lastCpu.user + usage.system - lastCpu.system) / 1000;
    pct = Math.min(100, (usedMs / elapsedMs / cpuCount) * 100);
  }
  lastCpu = usage;
  lastCpuAt = now;
  return Math.round(pct * 10) / 10;
}

// Bitrate comes from byte deltas between stat polls. The decorator smooths
// bursty TCP writes and holds one false zero-byte sample so the UI does not
// flash 0 kbps unless traffic is actually stalled.
const decorateStats = createStatsDecorator({ cpuPercent });
let previewFrameSendInFlight = false;

function sendPreviewFrame(frame) {
  if (!process.connected || previewFrameSendInFlight) return;
  previewFrameSendInFlight = true;
  try {
    process.send(
      { type: 'previewFrame', mime: frame.mime, width: frame.width, height: frame.height, data: frame.data },
      () => {
        previewFrameSendInFlight = false;
      },
    );
  } catch {
    previewFrameSendInFlight = false;
  }
}

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object' || !msg.method) return;
  try {
    let result;
    switch (msg.method) {
      case 'startPreview':
        addon.startPreview((frame) => {
          // frame.data is a JPEG Buffer. Advanced serialization ships it as
          // binary, and the in-flight gate drops stale frames instead of letting
          // a long session build an IPC backlog.
          sendPreviewFrame(frame);
        }, msg.args && msg.args[0] ? msg.args[0] : {});
        result = true;
        break;
      case 'getOutputStats':
        result = decorateStats(addon.getOutputStats() || {});
        break;
      case 'shutdownObs':
        // Best-effort: saves the collection first; CEF teardown inside
        // obs_shutdown can take the process down, so reply BEFORE shutting down.
        process.send({ id: msg.id, result: true });
        try {
          addon.shutdownObs();
        } finally {
          process.exit(0);
        }
        return;
      default: {
        const fn = addon[msg.method];
        if (typeof fn !== 'function') {
          process.send({ id: msg.id, error: 'Unknown method: ' + msg.method });
          return;
        }
        result = fn.apply(addon, msg.args || []);
      }
    }
    process.send({ id: msg.id, result });
  } catch (e) {
    process.send({ id: msg.id, error: e.message });
  }
});

process.send({ type: 'host:ready' });
