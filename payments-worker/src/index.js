import { DurableObject } from 'cloudflare:workers';

/**
 * VaultStudio payments Worker.
 *
 * Verifies PayPal payments server-side and dispenses a signed Lifetime Pro key.
 * Key issuance is serialized by a Durable Object (binding `KEY_ALLOCATOR`) so
 * retries, webhook replays, app/site overlap, and concurrent buyers cannot burn
 * duplicate keys. The allocator can issue from an uploaded pre-signed pool and,
 * when LICENSE_PRIVATE_KEY_PEM is configured, generate a fresh unique key when
 * the pool is empty.
 *
 * Routes:
 *   POST /create-order    -> creates a $PRICE_USD PayPal order, returns { id }
 *   POST /capture-order   -> captures + verifies an order, dispenses+emails a key
 *   POST /paypal/webhook  -> PAYMENT.CAPTURE.COMPLETED backstop (re-delivers)
 *   GET  /health          -> inventory + status
 *   POST /admin/upload-pool -> authenticated pre-signed key pool upload
 *
 * Durable Object tables:
 *   pool     — unused fullKeys (`KEY.signature`)
 *   issued   — idempotent per PayPal order id, full_key unique
 *   pending  — paid orders waiting for manual fulfillment if auto-signing is off
 */

const PAYPAL_BASE = {
  live: 'https://api-m.paypal.com',
  sandbox: 'https://api-m.sandbox.paypal.com',
};

const ALLOCATOR_NAME = 'vaultstudio-license-issuer';
const PRO_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function paypalBase(env) {
  return PAYPAL_BASE[env.PAYPAL_ENV === 'sandbox' ? 'sandbox' : 'live'];
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

function html(env, body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders(env) },
  });
}

// In-app update manifest. VaultStudio's updater (electron/services/update-service.ts)
// fetches this, compares versions, and links the platform installer. Override any
// field with Wrangler vars/secrets so a release only needs a config change here.
function latestManifest(env, requestUrl) {
  const origin = new URL(requestUrl).origin;
  const version = String(env.LATEST_VERSION || '1.5.1');
  const configuredSiteUrl = env.SITE_URL ? String(env.SITE_URL).replace(/\/+$/, '') : '';
  const siteUrl = configuredSiteUrl || origin;
  const downloadBase = env.DOWNLOAD_BASE_URL
    ? String(env.DOWNLOAD_BASE_URL).replace(/\/+$/, '')
    : configuredSiteUrl
      ? `${configuredSiteUrl}/downloads`
      : '';
  return {
    version,
    releaseDate: String(env.LATEST_RELEASE_DATE || '2026-06-22'),
    notesUrl: `${siteUrl}/#download`,
    downloads: {
      win32: env.DOWNLOAD_WIN || (downloadBase ? `${downloadBase}/VaultStudio%20Setup%20${version}.exe` : null),
      // macOS and Linux installers ship once the native engine is ported to
      // those platforms; null keeps the updater pointing at the notes page.
      darwin: env.DOWNLOAD_MAC || null,
      linux: env.DOWNLOAD_LINUX || null,
    },
  };
}

function buyPage(env, requestUrl) {
  const origin = new URL(requestUrl).origin;
  const paypalClientId = String(env.PAYPAL_CLIENT_ID || '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Buy VaultStudio Lifetime Pro</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; background: #0b0b0d; color: #f4f4f5; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top left, rgba(214,162,58,.18), transparent 34%), #0b0b0d; }
    main { width: min(560px, 100%); border: 1px solid rgba(214,162,58,.34); border-radius: 8px; padding: clamp(24px, 5vw, 40px); background: rgba(21,22,26,.94); box-shadow: 0 32px 90px rgba(0,0,0,.45); }
    h1 { margin: 0 0 10px; color: #d6a23a; font-size: 32px; line-height: 1.1; }
    p { color: rgba(244,244,245,.78); line-height: 1.55; }
    .price { display: flex; align-items: baseline; gap: 10px; margin: 16px 0 4px; }
    .price strong { font-size: 42px; }
    .price span { color: rgba(244,244,245,.62); font-weight: 700; }
    ul { padding-left: 20px; line-height: 1.8; }
    #paypal-buttons { min-height: 52px; margin-top: 18px; }
    .status { display: none; margin-top: 14px; border-radius: 8px; padding: 12px 14px; font-size: 14px; }
    .status.info { display: block; border: 1px solid #27a8ff; color: #8ed2ff; background: rgba(39,168,255,.1); }
    .status.error { display: block; border: 1px solid #ff3045; color: #ff8d99; background: rgba(255,48,69,.1); }
    .key { display: none; margin-top: 18px; padding: 14px; border: 1px solid rgba(214,162,58,.4); border-radius: 8px; color: #d6a23a; background: rgba(0,0,0,.24); font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
    button.copy { display: none; margin-top: 10px; min-height: 40px; border: 0; border-radius: 8px; padding: 0 16px; background: #d6a23a; color: #08090b; font-weight: 800; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>Lifetime Pro</h1>
    <div class="price"><strong>$${priceUsd(env)}</strong><span>USD one-time</span></div>
    <p>Unlock unlimited stream targets and dashboard platforms. Your key is shown here after PayPal confirms the sandbox payment.</p>
    <ul>
      <li>Unlimited stream targets</li>
      <li>Unlimited dashboard platforms</li>
      <li>All future VaultStudio updates</li>
    </ul>
    <div id="paypal-buttons"></div>
    <div id="status" class="status"></div>
    <div id="key" class="key"></div>
    <button id="copy" class="copy" type="button">Copy key</button>
  </main>
  <script>
    const workerUrl = ${JSON.stringify(origin)};
    const statusEl = document.getElementById('status');
    const keyEl = document.getElementById('key');
    const copyBtn = document.getElementById('copy');
    function status(text, kind = 'info') {
      statusEl.textContent = text || '';
      statusEl.className = text ? 'status ' + kind : 'status';
    }
    async function createOrder() {
      const res = await fetch(workerUrl + '/create-order', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error('Could not start checkout.');
      return data.id;
    }
    async function captureOrder(data) {
      status('Confirming payment...');
      const res = await fetch(workerUrl + '/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderID: data.orderID })
      });
      const result = await res.json();
      if (!res.ok || !result.key) throw new Error(result.message || 'Payment captured, but no key was returned.');
      keyEl.textContent = result.key;
      keyEl.style.display = 'block';
      copyBtn.style.display = 'inline-block';
      status(result.alreadyIssued ? 'This order was already fulfilled.' : 'Payment complete. Paste this key in VaultStudio Settings.');
    }
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(keyEl.textContent || '');
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy key'; }, 1600);
    });
    const sdk = document.createElement('script');
    sdk.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(${JSON.stringify(paypalClientId)}) + '&currency=USD&intent=capture';
    sdk.onload = () => paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder,
      onApprove: captureOrder,
      onCancel: () => status('Checkout cancelled.'),
      onError: () => status('PayPal checkout failed. Please try again.', 'error')
    }).render('#paypal-buttons');
    sdk.onerror = () => status('PayPal checkout could not load.', 'error');
    document.head.appendChild(sdk);
  </script>
</body>
</html>`;
}

async function paypalAccessToken(env) {
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function priceUsd(env) {
  return (env.PRICE_USD || '19.99').trim();
}

function normalizeFullKeys(keys) {
  if (!Array.isArray(keys)) return [];
  return Array.from(
    new Set(
      keys
        .map((entry) => (typeof entry === 'string' ? entry : entry?.fullKey))
        .map((key) => String(key || '').trim())
        .filter((key) => key.startsWith('VS-PRO-') && key.includes('.'))
    )
  );
}

function allocatorStub(env) {
  if (!env.KEY_ALLOCATOR) {
    throw new Error('KEY_ALLOCATOR Durable Object binding is not configured');
  }
  return env.KEY_ALLOCATOR.getByName(ALLOCATOR_NAME);
}

function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(String(a || ''));
  const right = encoder.encode(String(b || ''));
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

function isAdminRequest(request, env) {
  if (!env.ADMIN_UPLOAD_TOKEN) return false;
  const auth = request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return timingSafeEqual(token, env.ADMIN_UPLOAD_TOKEN);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function pemToPkcs8Bytes(pem) {
  const normalized = String(pem || '').trim();
  if (!normalized.includes('BEGIN PRIVATE KEY')) {
    throw new Error('LICENSE_PRIVATE_KEY_PEM must be PKCS#8 PEM (BEGIN PRIVATE KEY)');
  }
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return base64ToBytes(base64);
}

async function signBareKey(privateKeyPem, bareKey) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(bareKey)
  );
  return bytesToBase64(new Uint8Array(signature));
}

function randomToken() {
  let out = '';
  while (out.length < 16) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= 252) continue;
      out += PRO_KEY_ALPHABET[byte % PRO_KEY_ALPHABET.length];
      if (out.length === 16) break;
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

async function createSignedProKey(privateKeyPem) {
  const bareKey = `VS-PRO-${randomToken()}`;
  const signature = await signBareKey(privateKeyPem, bareKey);
  return `${bareKey}.${signature}`;
}

async function createOrder(env) {
  const token = await paypalAccessToken(env);
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          description: 'VaultStudio Lifetime Pro License',
          custom_id: 'vaultstudio-pro',
          amount: { currency_code: 'USD', value: priceUsd(env) },
        },
      ],
      application_context: {
        brand_name: 'VaultStudio',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, id: data.id };
}

/** Verify a captured order really paid the right amount, return the payer email. */
function readCapture(orderData, env) {
  if (orderData.status !== 'COMPLETED') return { ok: false, reason: 'not_completed' };
  const unit = orderData.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  const amount = capture?.amount;
  if (!amount || amount.currency_code !== 'USD' || amount.value !== priceUsd(env)) {
    return { ok: false, reason: 'amount_mismatch' };
  }
  const email =
    orderData.payer?.email_address || unit?.payee?.email_address || null;
  return { ok: true, email, captureId: capture?.id || null };
}

async function sendKeyEmail(env, toEmail, fullKey) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !toEmail) return false;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1a1a1a">
      <h2 style="color:#b8860b">Your VaultStudio Lifetime Pro key</h2>
      <p>Thanks for your purchase! Paste this key into VaultStudio under
         <strong>Settings &rarr; Pro License</strong> and click <strong>Activate</strong>.</p>
      <p style="font-family:ui-monospace,Consolas,monospace;font-size:15px;
                background:#f4f1e8;border:1px solid #e0d6b8;border-radius:8px;
                padding:14px;word-break:break-all">${fullKey}</p>
      <p style="color:#666;font-size:13px">Copy the entire string including the part after the dot.</p>
      <p style="color:#666;font-size:13px">Lifetime Pro unlocks unlimited stream targets and dashboard platforms.</p>
    </div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [toEmail],
      subject: 'Your VaultStudio Lifetime Pro key',
      html,
    }),
  });
  return res.ok;
}

async function inventoryHealth(env) {
  const health = await allocatorStub(env).health();
  return {
    ok: true,
    env: env.PAYPAL_ENV || 'live',
    ...health,
    autoSigning: Boolean(env.LICENSE_PRIVATE_KEY_PEM) || Boolean(health.autoSigning),
  };
}

/** Fulfill a verified, paid order: dispense a key (idempotent), email it. */
async function fulfill(env, orderId, payerEmail) {
  const result = await allocatorStub(env).issue(orderId, payerEmail);
  if (result.outOfStock) {
    if (env.ADMIN_EMAIL) {
      await sendKeyEmail(env, env.ADMIN_EMAIL, `OUT OF STOCK — order ${orderId}, buyer ${payerEmail}`);
    }
    return { ok: false, outOfStock: true };
  }
  if (!result.ok) return result;
  const emailed = await sendKeyEmail(env, payerEmail, result.fullKey);
  return { ...result, emailed };
}

async function captureOrder(env, orderId) {
  const token = await paypalAccessToken(env);
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  // 422 ORDER_ALREADY_CAPTURED is fine — fall through to re-read + idempotent fulfill.
  if (!res.ok && data?.details?.[0]?.issue !== 'ORDER_ALREADY_CAPTURED') {
    return { ok: false, status: res.status, data };
  }
  let orderData = data;
  if (data?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
    const getRes = await fetch(`${paypalBase(env)}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    orderData = await getRes.json();
  }
  const verified = readCapture(orderData, env);
  if (!verified.ok) return { ok: false, reason: verified.reason };
  const result = await fulfill(env, orderId, verified.email);
  return result;
}

async function verifyWebhook(env, headers, rawBody) {
  if (!env.PAYPAL_WEBHOOK_ID) return false;
  const token = await paypalAccessToken(env);
  const res = await fetch(`${paypalBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody),
    }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

function sqlOne(sql, query, ...params) {
  try {
    const result = sql.exec(query, ...params);
    return typeof result.one === 'function' ? result.one() : null;
  } catch {
    return null;
  }
}

export class KeyAllocator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    const init = () => this.migrate();
    if (typeof ctx.blockConcurrencyWhile === 'function') {
      ctx.blockConcurrencyWhile(init);
    } else {
      init();
    }
  }

  migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_key TEXT NOT NULL UNIQUE,
        uploaded_at INTEGER NOT NULL
      )
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS issued (
        order_id TEXT PRIMARY KEY,
        full_key TEXT NOT NULL UNIQUE,
        email TEXT,
        source TEXT NOT NULL,
        issued_at INTEGER NOT NULL
      )
    `);
    sql.exec(`
      CREATE TABLE IF NOT EXISTS pending (
        order_id TEXT PRIMARY KEY,
        email TEXT,
        created_at INTEGER NOT NULL
      )
    `);
  }

  async health() {
    const sql = this.ctx.storage.sql;
    const pool = sqlOne(sql, 'SELECT COUNT(*) AS count FROM pool');
    const issued = sqlOne(sql, 'SELECT COUNT(*) AS count FROM issued');
    const pending = sqlOne(sql, 'SELECT COUNT(*) AS count FROM pending');
    return {
      poolRemaining: Number(pool?.count || 0),
      issuedCount: Number(issued?.count || 0),
      pendingCount: Number(pending?.count || 0),
      autoSigning: Boolean(this.env.LICENSE_PRIVATE_KEY_PEM),
    };
  }

  async loadPool(fullKeys, replace = false) {
    const keys = normalizeFullKeys(fullKeys);
    const sql = this.ctx.storage.sql;
    if (replace) sql.exec('DELETE FROM pool');
    const now = Date.now();
    for (const fullKey of keys) {
      try {
        sql.exec(
          'INSERT OR IGNORE INTO pool (full_key, uploaded_at) VALUES (?, ?)',
          fullKey,
          now
        );
      } catch {
        /* ignore malformed or duplicate entries */
      }
    }
    return this.health();
  }

  issuedForOrder(orderId) {
    const row = sqlOne(
      this.ctx.storage.sql,
      'SELECT full_key AS fullKey, source FROM issued WHERE order_id = ?',
      orderId
    );
    if (!row?.fullKey) return null;
    return { ok: true, fullKey: row.fullKey, alreadyIssued: true, source: row.source };
  }

  popPoolKey() {
    const row = sqlOne(
      this.ctx.storage.sql,
      `DELETE FROM pool
       WHERE id = (SELECT id FROM pool ORDER BY id LIMIT 1)
       RETURNING full_key AS fullKey`
    );
    return row?.fullKey || null;
  }

  tryRecordIssue(orderId, email, fullKey, source) {
    const existing = this.issuedForOrder(orderId);
    if (existing) return existing;
    try {
      this.ctx.storage.sql.exec(
        'INSERT INTO issued (order_id, full_key, email, source, issued_at) VALUES (?, ?, ?, ?, ?)',
        orderId,
        fullKey,
        email || null,
        source,
        Date.now()
      );
      this.ctx.storage.sql.exec('DELETE FROM pending WHERE order_id = ?', orderId);
      return { ok: true, fullKey, alreadyIssued: false, source };
    } catch {
      return this.issuedForOrder(orderId);
    }
  }

  async issue(orderId, email) {
    if (!orderId) return { ok: false, error: 'missing_order_id' };

    const existing = this.issuedForOrder(orderId);
    if (existing) return existing;

    for (let i = 0; i < 100; i += 1) {
      const fullKey = this.popPoolKey();
      if (!fullKey) break;
      const recorded = this.tryRecordIssue(orderId, email, fullKey, 'pool');
      if (recorded) return recorded;
    }

    if (this.env.LICENSE_PRIVATE_KEY_PEM) {
      for (let i = 0; i < 10; i += 1) {
        const fullKey = await createSignedProKey(this.env.LICENSE_PRIVATE_KEY_PEM);
        const recorded = this.tryRecordIssue(orderId, email, fullKey, 'generated');
        if (recorded) return recorded;
      }
      return { ok: false, error: 'key_generation_collision' };
    }

    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO pending (order_id, email, created_at) VALUES (?, ?, ?)',
      orderId,
      email || null,
      Date.now()
    );
    return { ok: false, outOfStock: true };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json(env, await inventoryHealth(env));
      }

      if ((url.pathname === '/' || url.pathname === '/buy.html') && request.method === 'GET') {
        return html(env, buyPage(env, request.url));
      }

      if (url.pathname === '/latest.json' && request.method === 'GET') {
        return json(env, latestManifest(env, request.url));
      }

      if (url.pathname === '/create-order' && request.method === 'POST') {
        const result = await createOrder(env);
        if (!result.ok) return json(env, { error: 'create_failed', detail: result.data }, 502);
        return json(env, { id: result.id });
      }

      if (url.pathname === '/capture-order' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const orderId = body.orderID || body.orderId;
        if (!orderId) return json(env, { error: 'missing_order_id' }, 400);
        const result = await captureOrder(env, orderId);
        if (result.outOfStock) {
          return json(env, { error: 'out_of_stock', message: 'Payment received — your key will be emailed shortly.' }, 200);
        }
        if (!result.ok) return json(env, { error: 'capture_failed', reason: result.reason, detail: result.data }, 400);
        return json(env, { ok: true, key: result.fullKey, alreadyIssued: result.alreadyIssued });
      }

      if (url.pathname === '/admin/upload-pool' && request.method === 'POST') {
        if (!isAdminRequest(request, env)) return json(env, { error: 'unauthorized' }, 401);
        const body = await request.json().catch(() => ({}));
        const health = await allocatorStub(env).loadPool(body.keys || [], Boolean(body.replace));
        return json(env, { ok: true, ...health });
      }

      if (url.pathname === '/paypal/webhook' && request.method === 'POST') {
        const rawBody = await request.text();
        const valid = await verifyWebhook(env, request.headers, rawBody);
        if (!valid) return json(env, { error: 'invalid_signature' }, 400);
        const event = JSON.parse(rawBody);
        if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
          const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
          const email = event.resource?.payer?.email_address || null;
          if (orderId) await fulfill(env, orderId, email);
        }
        return json(env, { ok: true });
      }

      return json(env, { error: 'not_found' }, 404);
    } catch (err) {
      return json(env, { error: 'server_error', message: String(err) }, 500);
    }
  },
};

export const __test = {
  ALLOCATOR_NAME,
  createSignedProKey,
  fulfill,
  inventoryHealth,
  latestManifest,
  normalizeFullKeys,
  randomToken,
};
