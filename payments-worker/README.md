# VaultStudio Payments Worker

Cloudflare Worker that verifies PayPal payments and delivers a VaultStudio
Lifetime Pro key end-to-end: **pay -> key emailed + shown on the success page**.

## Architecture

```
website buy.html
  -> PayPal Smart Buttons
  -> POST /create-order
  -> PayPal Orders API ($19.99 USD)
  -> POST /capture-order
  -> Durable Object KeyAllocator
       - idempotent per PayPal order id
       - full license key is globally unique
       - uses uploaded pre-signed pool first
       - auto-generates a signed key when LICENSE_PRIVATE_KEY_PEM is set
  -> email key with Resend
```

The key allocator is a SQLite-backed Durable Object, not KV. KV pop operations
are not transactional enough for license inventory.

## One-Time Setup

### 1. Install and authenticate

```bash
cd payments-worker
npm install
npx wrangler login
```

### 2. PayPal REST app

In the PayPal Developer dashboard, create a REST API app for VaultStudio.

Use sandbox credentials first. Copy:

- Client ID
- Secret
- Webhook ID for `PAYMENT.CAPTURE.COMPLETED`

Set the public client ID in `wrangler.toml` and in
`Vault Streaming Studio website/payments-config.js`.

Set secrets:

```bash
npx wrangler secret put PAYPAL_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
```

### 3. Email delivery

Create a Resend API key and verify the sender domain. Set:

```bash
npx wrangler secret put RESEND_API_KEY
```

Set `EMAIL_FROM` in `wrangler.toml` to a verified sender.

### 4. Never-empty key issuance

For production, configure on-demand signing so the system cannot run out of keys.
Store the RSA private key as a Cloudflare secret in PKCS#8 PEM format:

```bash
openssl pkcs8 -topk8 -nocrypt -in ../keys/private.pem -out ../keys/private.pkcs8.pem
npx wrangler secret put LICENSE_PRIVATE_KEY_PEM
```

Paste the full `BEGIN PRIVATE KEY` PEM when prompted. This lets the Durable
Object generate a fresh unique `VS-PRO-...` key whenever the uploaded pool is
empty. If you do not set this secret, paid orders are recorded as pending when
the pool runs dry.

### 5. Admin upload token

The `/admin/upload-pool` endpoint is only for topping up pre-signed keys.

```bash
npx wrangler secret put ADMIN_UPLOAD_TOKEN
```

Generate and upload a starter pool:

```bash
node ../scripts/generate-pro-keys.mjs 200 ../keys/pro-pool.json
node scripts/upload-pool.mjs ../keys/pro-pool.json --worker-url https://<worker-url> --token <ADMIN_UPLOAD_TOKEN>
```

### 6. Deploy

```bash
npx wrangler deploy
```

Put the deployed Worker URL into:

- `Vault Streaming Studio website/payments-config.js`
- `VAULTSTUDIO_BUY_URL` for packaged-app testing, or the fallback URL in
  `electron/ipc/license-ipc.ts` before release.

## Endpoints

| Route | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Inventory status: pool remaining, issued count, pending count, auto-signing |
| `/create-order` | POST | Create a PayPal order |
| `/capture-order` | POST | Capture payment, verify amount, issue key |
| `/paypal/webhook` | POST | Signed PayPal capture backstop |
| `/admin/upload-pool` | POST | Bearer-token protected key-pool upload |

## Payment Methods

The site uses PayPal Smart Buttons only. It does not expose BPAY or PayID.

## Guarantees

- One PayPal order id gets one key, even if the success page is refreshed or the
  webhook arrives later.
- `full_key` is unique in allocator storage, so two buyers cannot receive the
  same key.
- With `LICENSE_PRIVATE_KEY_PEM` configured, the allocator creates fresh signed
  keys on demand when the pool is empty.
- The packaged app does not ship a key database. Purchased keys are full
  `KEY.signature` strings and validate offline in the app.
