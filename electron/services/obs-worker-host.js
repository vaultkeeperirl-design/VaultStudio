// obs-worker-host.js — runs in a Node.js child process (not Electron)
// Loads the native addon and bridges IPC to the Electron main process.

const { parentPort } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const ADDON_DIR = path.join(__dirname, '..', '..', 'native', 'addon', 'build', 'Release');

let addon = null;

try {
  addon = require(path.join(ADDON_DIR, 'vaultstudio-obs.node'));
  parentPort.postMessage({ type: 'addon:loaded', keys: Object.keys(addon) });
} catch (e) {
  parentPort.postMessage({ type: 'addon:error', error: e.message });
  process.exit(1);
}

parentPort.on('message', (msg) => {
  try {
    switch (msg.method) {
      case 'initObs': {
        const ok = addon.initObs();
        // Register event callback after successful init
        if (ok && typeof addon.registerEventCallback === 'function') {
          addon.registerEventCallback((eventName) => {
            parentPort.postMessage({ type: 'event', eventName });
          });
        }
        parentPort.postMessage({ id: msg.id, result: ok });
        break;
      }
      case 'shutdownObs':
        addon.shutdownObs();
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'getProfiles':
        parentPort.postMessage({ id: msg.id, result: addon.getProfiles() });
        break;
      case 'setProfile':
        addon.setProfile(msg.args[0]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'getScenes':
        parentPort.postMessage({ id: msg.id, result: addon.getScenes() });
        break;
      case 'createScene':
        parentPort.postMessage({ id: msg.id, result: addon.createScene(msg.args[0]) });
        break;
      case 'removeScene':
        addon.removeScene(msg.args[0]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'setCurrentScene':
        addon.setCurrentScene(msg.args[0]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'renameScene':
        addon.renameScene(msg.args[0], msg.args[1]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'getSceneSources':
        parentPort.postMessage({ id: msg.id, result: addon.getSceneSources(msg.args[0]) });
        break;
      case 'createSource':
        parentPort.postMessage({ id: msg.id, result: addon.createSource(msg.args[0], msg.args[1], msg.args[2]) });
        break;
      case 'removeSource':
        addon.removeSource(msg.args[0], msg.args[1]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'setSourceVisible':
        addon.setSourceVisible(msg.args[0], msg.args[1], msg.args[2]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'setSourceOrder':
        addon.setSourceOrder(msg.args[0], msg.args[1], msg.args[2]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'cleanupOutput':
        addon.cleanupOutput();
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'startStream':
        parentPort.postMessage({ id: msg.id, result: addon.startStream(msg.args ? msg.args[0] : undefined) });
        break;
      case 'stopStream':
        addon.stopStream();
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'startRecording':
        parentPort.postMessage({ id: msg.id, result: addon.startRecording(msg.args ? msg.args[0] : undefined) });
        break;
      case 'stopRecording':
        addon.stopRecording();
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'getOutputStats':
        parentPort.postMessage({ id: msg.id, result: addon.getOutputStats() });
        break;
      case 'getAudioSources':
        parentPort.postMessage({ id: msg.id, result: addon.getAudioSources() });
        break;
      case 'setVolume':
        addon.setVolume(msg.args[0], msg.args[1]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      case 'setMuted':
        addon.setMuted(msg.args[0], msg.args[1]);
        parentPort.postMessage({ id: msg.id, result: true });
        break;
      default:
        parentPort.postMessage({ id: msg.id, error: 'Unknown method: ' + msg.method });
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: e.message });
  }
});

parentPort.postMessage({ type: 'addon:ready' });
