/* Regression: global Desktop Audio must follow the Windows default output. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ADDON_DIRS = [
  path.join(__dirname, '..', 'build-v1', 'Release'),
  path.join(__dirname, '..', 'build', 'Release'),
];
const ADDON_DIR = ADDON_DIRS.find((dir) => fs.existsSync(path.join(dir, 'vaultstudio-obs.node')));
if (!ADDON_DIR) {
  throw new Error('vaultstudio-obs.node not built; run npm run build:native first');
}

const RUNTIME_DIR = path.join(__dirname, '..', '..', 'obs-runtime');
process.env.PATH = path.join(RUNTIME_DIR, 'bin', '64bit') + ';' + (process.env.PATH || '');

const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultstudio-default-audio-'));
const scenesDir = path.join(configDir, 'scenes');
const profileDir = path.join(configDir, 'profiles', 'Twitch DBS - Restream');
fs.mkdirSync(scenesDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

const collectionName = 'HeadphoneDefault';
fs.writeFileSync(
  path.join(configDir, 'basic.ini'),
  `[General]\nName=${collectionName}\nSceneCollection=${collectionName}\nProfile=Twitch DBS - Restream\n`
);
fs.writeFileSync(
  path.join(profileDir, 'basic.ini'),
  `[General]\nName=Twitch DBS - Restream\nSceneCollection=${collectionName}\n`
);
fs.writeFileSync(
  path.join(scenesDir, `${collectionName}.json`),
  JSON.stringify({
    DesktopAudioDevice1: {
      name: 'Desktop Audio',
      id: 'wasapi_output_capture',
      versioned_id: 'wasapi_output_capture',
      settings: { device_id: '{0.0.0.00000000}.{stale-realtek-endpoint}' },
      mixers: 255,
      volume: 1.0,
      muted: false,
    },
    current_scene: 'Scene',
    current_program_scene: 'Scene',
    scene_order: [{ name: 'Scene' }],
    sources: [
      {
        name: 'Scene',
        id: 'scene',
        versioned_id: 'scene',
        settings: { id_counter: 0, items: [] },
        mixers: 0,
        volume: 1.0,
        muted: false,
      },
    ],
  })
);

const addon = require(path.join(ADDON_DIR, 'vaultstudio-obs.node'));

try {
  addon.initObs({
    runtimeDir: RUNTIME_DIR,
    configDir,
    baseWidth: 1280,
    baseHeight: 720,
    outputWidth: 1280,
    outputHeight: 720,
    fps: 30,
  });

  const settings = JSON.parse(addon.getSourceSettings('Desktop Audio'));
  if (settings.device_id !== 'default') {
    throw new Error(`Desktop Audio device_id stayed ${settings.device_id}; expected default`);
  }

  addon.saveSceneCollection();
  const saved = JSON.parse(fs.readFileSync(path.join(scenesDir, `${collectionName}.json`), 'utf8'));
  const savedDeviceId = saved?.DesktopAudioDevice1?.settings?.device_id;
  if (savedDeviceId !== 'default') {
    throw new Error(`Saved DesktopAudioDevice1 device_id stayed ${savedDeviceId}; expected default`);
  }
} finally {
  try {
    addon.shutdownObs();
  } catch {
    /* best-effort cleanup */
  }
}

console.log('Desktop Audio follows Windows default output');
