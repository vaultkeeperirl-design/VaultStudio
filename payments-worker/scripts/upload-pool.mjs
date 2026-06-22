/**
 * Upload a pre-signed key pool into the payments Worker's Durable Object
 * allocator. This is the only supported production upload path because the
 * allocator serializes issuance and prevents duplicate keys under concurrency.
 *
 * Usage (from payments-worker/):
 *   node scripts/upload-pool.mjs ../keys/pro-pool.json --worker-url https://... --token ...
 *   node scripts/upload-pool.mjs ../keys/pro-pool.json --replace --worker-url http://127.0.0.1:8787 --token ...
 *
 * You can also set:
 *   VAULTSTUDIO_PAYMENTS_WORKER_URL=https://...
 *   VAULTSTUDIO_ADMIN_UPLOAD_TOKEN=...
 */
import * as fs from 'node:fs';

const args = process.argv.slice(2);
const inFile = args.find((arg) => !arg.startsWith('--'));
const replace = process.argv.includes('--replace');
const getArg = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
};
const workerUrl = (getArg('--worker-url') || process.env.VAULTSTUDIO_PAYMENTS_WORKER_URL || '').replace(/\/$/, '');
const token = getArg('--token') || process.env.VAULTSTUDIO_ADMIN_UPLOAD_TOKEN || '';

if (!inFile) {
  console.error('Usage: node scripts/upload-pool.mjs <pool.json> --worker-url <url> --token <admin-token> [--replace]');
  process.exit(1);
}
if (!workerUrl || !token) {
  console.error('Missing Worker URL or admin token.');
  console.error('Set VAULTSTUDIO_PAYMENTS_WORKER_URL and VAULTSTUDIO_ADMIN_UPLOAD_TOKEN, or pass --worker-url and --token.');
  process.exit(1);
}

const entries = JSON.parse(fs.readFileSync(inFile, 'utf-8'));
const incoming = entries
  .map((e) => (typeof e === 'string' ? e : e.fullKey))
  .filter(Boolean);
if (incoming.length === 0) {
  console.error('No keys found in input file.');
  process.exit(1);
}

const res = await fetch(`${workerUrl}/admin/upload-pool`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ keys: Array.from(new Set(incoming)), replace }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Upload failed (${res.status}): ${JSON.stringify(body)}`);
  process.exit(1);
}

console.log(`Uploaded ${incoming.length} unique candidate keys.`);
console.log(`Pool remaining: ${body.poolRemaining}; issued: ${body.issuedCount}; pending: ${body.pendingCount}.`);
