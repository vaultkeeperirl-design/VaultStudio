/**
 * Offline VaultStudio Pro key generator.
 *
 * Mints a batch of RSA-SHA256-signed `VS-PRO-XXXX-XXXX-XXXX-XXXX` keys using the
 * secret private key (keys/private.pem). The signature is computed over the
 * BARE key string (matching electron/services/license-service.ts verification),
 * base64-encoded. Output shape matches keys/giveaway-keys.json:
 *   { key, signature, fullKey }  where fullKey = `${key}.${signature}`.
 *
 * This runs ONLY on your machine. Upload the resulting pool JSON to the payments
 * Worker's Durable Object allocator (see payments-worker/README.md), or set
 * LICENSE_PRIVATE_KEY_PEM so the Worker can auto-sign unique keys when the pool is empty.
 *
 * Usage:
 *   node scripts/generate-pro-keys.mjs [count] [outFile]
 *   node scripts/generate-pro-keys.mjs 200 keys/pro-pool.json
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const count = Math.max(1, parseInt(process.argv[2] ?? '100', 10) || 100);
const outFile = process.argv[3] ?? path.join('keys', 'pro-pool.json');
const privateKeyPath = path.join(repoRoot, 'keys', 'private.pem');

if (!fs.existsSync(privateKeyPath)) {
  console.error(`Private key not found at ${privateKeyPath}.`);
  console.error('Generate it once with:');
  console.error('  openssl genrsa -out keys/private.pem 2048');
  console.error('  openssl rsa -in keys/private.pem -pubout -out keys/public.pem');
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf-8');

// Crockford-ish alphabet: A-Z + 0-9 to match KEY_PATTERN [A-Z0-9]{4}.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomToken() {
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

function signBareKey(bareKey) {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(bareKey, 'utf-8');
  signer.end();
  return signer.sign(privateKey, 'base64');
}

const seen = new Set();
const pool = [];
while (pool.length < count) {
  const key = `VS-PRO-${randomToken()}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const signature = signBareKey(key);
  pool.push({ key, signature, fullKey: `${key}.${signature}` });
}

const outPath = path.isAbsolute(outFile) ? outFile : path.join(repoRoot, outFile);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(pool, null, 2), 'utf-8');

console.log(`Generated ${pool.length} signed Pro keys -> ${outPath}`);
console.log('Next: upload the pool to the Worker Durable Object allocator:');
console.log(`  cd payments-worker && node scripts/upload-pool.mjs "${outPath}"`);
