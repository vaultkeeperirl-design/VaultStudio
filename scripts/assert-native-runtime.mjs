#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const platformArg = args.find((arg) => arg.startsWith('--platform='));
const platform = platformArg ? platformArg.split('=')[1] : process.platform;

const supported = new Set(['win32', 'darwin', 'linux']);
if (!supported.has(platform)) {
  console.error(`[native-runtime] Unsupported platform: ${platform}`);
  process.exit(1);
}

const runtimeRel = platform === 'win32' ? 'native/obs-runtime' : `native/vss-runtime/${platform}`;
const engineRel =
  platform === 'win32'
    ? path.join(runtimeRel, 'bin', '64bit', 'vaultstudio-engine.exe')
    : path.join(runtimeRel, 'bin', 'vaultstudio-engine');
const addonRel = path.join('native', 'addon', 'build-v1', 'Release', 'vaultstudio-obs.node');

const required = [
  ['runtime directory', runtimeRel],
  ['engine binary', engineRel],
];

const missing = required
  .map(([label, rel]) => [label, rel, path.join(root, rel)])
  .filter(([, , absolute]) => !fs.existsSync(absolute));

if (!fs.existsSync(path.join(root, addonRel))) {
  missing.push(['native addon', addonRel, path.join(root, addonRel)]);
}

if (missing.length > 0) {
  console.error(`[native-runtime] ${platform} package is not buildable yet. Missing:`);
  for (const [label, rel] of missing) {
    console.error(`  - ${label}: ${rel}`);
  }
  console.error('');
  console.error(
    platform === 'win32'
      ? 'Build the Windows native addon/runtime first, then rerun the installer build.'
      : `Add a ${platform} VSS runtime under ${runtimeRel}, build the ${platform} native addon on ${platform}, then rerun this build on ${platform}.`,
  );
  process.exit(1);
}

console.log(`[native-runtime] ${platform} native runtime OK (${runtimeRel}, ${addonRel}).`);
