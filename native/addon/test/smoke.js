/* Standalone smoke test for the native addon — run with plain node. */
const path = require('path');
const ADDON_DIR = path.join(__dirname, '..', 'build', 'Release');
const RUNTIME_DIR = path.join(__dirname, '..', '..', 'obs-runtime');
const CONFIG_DIR = path.join(process.env.APPDATA, 'VaultStudio', 'obs-config');
process.env.PATH = path.join(RUNTIME_DIR, 'bin', '64bit') + ';' + (process.env.PATH || '');

// fs.writeSync so output survives a hard native crash (stdout pipes are async-buffered)
const fsync = require('fs');
const log = (...a) => fsync.writeSync(1, a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
console.log = log;

function step(name, fn) {
  try {
    log(`[STEP] ${name}`);
    const r = fn();
    log(`[OK] ${name}:`, JSON.stringify(r)?.slice(0, 500) ?? 'undefined');
    return r;
  } catch (e) {
    log(`[FAIL] ${name}: ${e.message}`);
    return undefined;
  }
}

const addon = require(path.join(ADDON_DIR, 'vaultstudio-obs.node'));
console.log('[OK] addon loaded');

const events = [];
step('registerEventCallback', () => addon.registerEventCallback((name, json) => events.push(`${name} ${json}`)));
step('initObs', () => addon.initObs({ runtimeDir: RUNTIME_DIR, configDir: CONFIG_DIR, fps: 60 }));
step('getVideoSettings', () => addon.getVideoSettings());
step('getProfiles', () => addon.getProfiles());
const scenes = step('getScenes', () => addon.getScenes());
if (scenes) console.log(`  -> ${scenes.length} scenes: ${scenes.map((s) => s.name + (s.isActive ? '*' : '')).join(', ')}`);
step('createScene smoke-test', () => addon.createScene('smoke-test'));
step('setCurrentScene smoke-test', () => addon.setCurrentScene('smoke-test'));
step('createSource browser', () =>
  addon.createSource('smoke-test', 'smoke-browser', 'browser_source', JSON.stringify({ url: 'https://example.com', width: 1280, height: 720 })));
step('getSceneSources', () => addon.getSceneSources('smoke-test'));
const audio = step('getAudioSources', () => addon.getAudioSources());
if (audio) console.log(`  -> ${audio.length} audio sources: ${audio.map((a) => `${a.name}(${a.kind})`).join(', ')}`);
step('getOutputStats', () => addon.getOutputStats());

let frames = 0;
let firstFrame = null;
step('startPreview', () => addon.startPreview((f) => {
  frames++;
  if (!firstFrame) firstFrame = f;
}, { width: 640, height: 360, fps: 10 }));

setTimeout(() => {
  console.log(`preview frames in 4s: ${frames}`);
  if (firstFrame) {
    console.log(`first frame: ${firstFrame.width}x${firstFrame.height}, ${firstFrame.data.length} bytes, magic=${firstFrame.data.slice(0, 2).toString('ascii')}`);
    require('fs').writeFileSync(path.join(__dirname, 'preview-frame.bmp'), firstFrame.data);
  }
  step('getAudioLevels', () => addon.getAudioLevels());
  step('stopPreview', () => addon.stopPreview());
  step('removeScene smoke-test', () => addon.removeScene('smoke-test'));
  console.log('events seen:', JSON.stringify(events));
  step('shutdownObs', () => addon.shutdownObs());
  console.log('DONE');
  process.exit(0);
}, 4000);
